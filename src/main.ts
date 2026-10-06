/**
 * Instinct AI for Obsidian — plugin entry point.
 *
 * Commands:
 *   - "Ask Instinct AI about your vault"  (Starter plan and up)
 *   - "Summarize active note"              (all plans, incl. Free)
 *   - "Transcribe voice note"              (Pro plan and up)
 *   - "Rebuild vault index"                (Starter plan and up)
 *
 * All AI work goes to the shared Instinct AI backend (instinct-api);
 * the vault index (chunks + embeddings) is cached in data.json.
 */

import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { InstinctAIClient } from "./api";
import { chunkMarkdown } from "./chunker";
import { INDEX_VERSION, VaultIndex, emptyIndex } from "./indexer";
import {
	PLANS,
	gateFeature,
	planIdFromString,
	quotaSummary,
	recordUse,
	type FeatureId,
} from "./licensing";
import { buildAskContext, buildAskMessages, buildSourcesFooter, validateSummarizeInput, type SummaryStyle } from "./prompts";
import { retrieveTopK } from "./search";
import {
	DEFAULT_SETTINGS,
	InstinctAISettingTab,
	type InstinctAISettings,
	type PluginHooks,
} from "./settings";
import { AskModal } from "./askModal";
import { SummarizeModal } from "./summarizeModal";
import { VoiceModal, type TranscriptionResult } from "./voiceModal";

/** Backend embed texts per request when (re)building the index. */
const EMBED_BATCH_SIZE = 24;

interface ActiveNote {
	name: string;
	content: string;
	editor: Editor;
}

export default class InstinctAIPlugin extends Plugin implements PluginHooks {
	settings!: InstinctAISettings;
	client!: InstinctAIClient;
	vaultIndex!: VaultIndex;
	private indexing = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.client = new InstinctAIClient({
			baseUrl: this.settings.backendUrl,
			productKey: this.settings.productKey,
			licenseKey: this.settings.licenseKey,
		});
		this.vaultIndex = new VaultIndex(this.settings.indexData);

		this.addCommand({
			id: "ask-vault",
			name: "Ask Instinct AI about your vault",
			callback: () => void this.openAsk(),
		});
		this.addCommand({
			id: "summarize-note",
			name: "Summarize active note",
			callback: () => void this.openSummarize(),
		});
		this.addCommand({
			id: "transcribe-voice-note",
			name: "Transcribe voice note",
			callback: () => void this.openVoice(),
		});
		this.addCommand({
			id: "rebuild-index",
			name: "Rebuild vault index",
			callback: () => void this.rebuildIndex(true),
		});

		this.addSettingTab(new InstinctAISettingTab(this.app, this));

		if (this.settings.autoReindexOnStart) {
			const gate = gateFeature(PLANS[this.settings.plan], "askVault", this.settings.quota);
			if (gate.allowed && this.settings.backendUrl.trim() && this.settings.productKey.trim()) {
				void this.rebuildIndex(false);
			}
		}
	}

	// ---------- settings ----------

	async loadSettings(): Promise<void> {
		const raw = ((await this.loadData()) ?? {}) as Partial<InstinctAISettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
		if (!this.settings.indexData || this.settings.indexData.version !== INDEX_VERSION) {
			this.settings.indexData = emptyIndex();
		}
		if (!this.settings.quota || typeof this.settings.quota.used !== "number") {
			this.settings.quota = { month: "", used: 0 };
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	onSettingsChanged(): void {
		this.client.configure({
			baseUrl: this.settings.backendUrl,
			productKey: this.settings.productKey,
			licenseKey: this.settings.licenseKey,
		});
	}

	quotaLine(): string {
		return quotaSummary(PLANS[this.settings.plan], this.settings.quota);
	}

	indexStats(): string {
		return `${this.vaultIndex.noteCount()} notes · ${this.vaultIndex.chunkCount()} chunks indexed`;
	}

	// ---------- licensing ----------

	/** Verify a license key against the backend and apply the plan. */
	async activateLicense(key: string): Promise<{ ok: boolean; message: string }> {
		const trimmed = key.trim();
		if (!trimmed) {
			return { ok: false, message: "Paste a license key first." };
		}
		try {
			const verified = await this.client.verifyLicense(trimmed);
			if (!verified.valid) {
				this.settings.plan = "free";
				this.settings.licenseStatus = "That key didn't verify — still on the Free plan.";
				await this.saveSettings();
				return { ok: false, message: "License key not valid. You're on the Free plan." };
			}
			const plan = planIdFromString(verified.plan);
			this.settings.licenseKey = trimmed;
			this.settings.plan = plan;
			const expiry = verified.expires ? ` (expires ${verified.expires})` : "";
			const today = new Date().toISOString().slice(0, 10);
			this.settings.licenseStatus = `${PLANS[plan].name} — verified ${today}${expiry}.`;
			this.onSettingsChanged();
			await this.saveSettings();
			return { ok: true, message: `Activated: ${PLANS[plan].name} plan.` };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return { ok: false, message };
		}
	}

	/** Feature gate with a user-facing Notice on denial. */
	private gate(feature: FeatureId): boolean {
		const result = gateFeature(PLANS[this.settings.plan], feature, this.settings.quota);
		if (!result.allowed) {
			new Notice(result.reason ?? "Not available on your plan.");
		}
		return result.allowed;
	}

	/** Backend must be configured before any AI call. */
	private readyForAI(): boolean {
		if (!this.settings.backendUrl.trim()) {
			new Notice("Set the backend API URL in Settings → Instinct AI.");
			return false;
		}
		if (!this.settings.productKey.trim()) {
			new Notice("Add your product API key in Settings → Instinct AI.");
			return false;
		}
		return true;
	}

	/** Count AI calls against the monthly quota and report usage to the backend. */
	private async useQuota(feature: string, units: number): Promise<void> {
		recordUse(this.settings.quota, units);
		await this.saveSettings();
		void this.client.reportUsage(feature, units);
	}

	// ---------- vault Q&A ----------

	private async openAsk(): Promise<void> {
		if (!this.gate("askVault") || !this.readyForAI()) return;
		if (this.vaultIndex.noteCount() === 0) {
			new Notice("Building your vault index first — this can take a minute on large vaults.");
			await this.rebuildIndex(false);
			if (this.vaultIndex.noteCount() === 0) {
				new Notice("No markdown notes found to index.");
				return;
			}
		}
		new AskModal(this.app, (question) => this.answerQuestion(question)).open();
	}

	private async answerQuestion(question: string): Promise<string> {
		const q = question.trim();
		if (!q) throw new Error("Type a question first.");
		const [queryEmbedding] = await this.client.embed([q]);
		const top = retrieveTopK(queryEmbedding, this.vaultIndex.allChunks(), this.settings.topK);
		if (top.length === 0) {
			throw new Error("Your vault index is empty — rebuild it from Settings → Instinct AI.");
		}
		const messages = buildAskMessages(q, buildAskContext(top));
		const reply = await this.client.chat(messages);
		await this.useQuota("ask", 2); // 1 embed + 1 chat
		return reply + buildSourcesFooter(top);
	}

	// ---------- summarization ----------

	private getActiveNote(): ActiveNote | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view?.editor || !view.file) return null;
		return { name: view.file.basename, content: view.editor.getValue(), editor: view.editor };
	}

	private async openSummarize(): Promise<void> {
		const active = this.getActiveNote();
		if (!active) {
			new Notice("Open a markdown note first.");
			return;
		}
		const validation = validateSummarizeInput(active.content);
		if (!validation.ok) {
			new Notice(validation.reason);
			return;
		}
		if (!this.gate("summarize") || !this.readyForAI()) return;
		new SummarizeModal(
			this.app,
			active.name,
			(style) => this.summarizeNote(active.content, style),
			(text) => active.editor.replaceSelection(text)
		).open();
	}

	private async summarizeNote(content: string, style: SummaryStyle): Promise<string> {
		const summary = await this.client.summarize(content, style);
		await this.useQuota("summarize", 1);
		return summary;
	}

	// ---------- voice notes ----------

	private async openVoice(): Promise<void> {
		if (!this.gate("voiceNotes") || !this.readyForAI()) return;
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view?.editor) {
			new Notice("Open a markdown note first — the transcript is inserted at your cursor.");
			return;
		}
		const editor = view.editor;
		new VoiceModal(
			this.app,
			(audio) => this.transcribeAudio(audio),
			(text) => editor.replaceSelection(text)
		).open();
	}

	private async transcribeAudio(audio: Blob): Promise<TranscriptionResult> {
		const result = await this.client.transcribe(audio);
		await this.useQuota("transcribe", 1);
		return result;
	}

	// ---------- indexing ----------

	/**
	 * (Re)build the local vault index. Incremental: only new/changed notes
	 * are re-embedded. Honors the plan's maxIndexedNotes cap.
	 */
	async rebuildIndex(force: boolean): Promise<{ notes: number; chunks: number }> {
		const done = () => ({ notes: this.vaultIndex.noteCount(), chunks: this.vaultIndex.chunkCount() });
		if (this.indexing) return done();
		if (!this.gate("askVault") || !this.readyForAI()) return done();
		this.indexing = true;
		try {
			const plan = PLANS[this.settings.plan];
			const files = this.app.vault.getMarkdownFiles();
			const selected = Number.isFinite(plan.maxIndexedNotes)
				? files.slice(0, plan.maxIndexedNotes)
				: files;
			if (selected.length < files.length) {
				new Notice(
					`Indexing the first ${selected.length} of ${files.length} notes (your plan's index cap).`
				);
			}
			this.vaultIndex.prune(new Set(selected.map((f) => f.path)));

			let processed = 0;
			for (const file of selected) {
				let content: string;
				try {
					content = await this.app.vault.cachedRead(file);
				} catch {
					continue; // unreadable file: skip, keep any old index entry
				}
				if (!force && !this.vaultIndex.needsIndex(file.path, content)) continue;
				const chunks = chunkMarkdown(file.path, content);
				if (chunks.length === 0) {
					this.vaultIndex.setFile(file.path, content, [], []);
					continue;
				}
				const texts = chunks.map((c) => (c.heading ? `${c.heading}\n${c.text}` : c.text));
				const embeddings: number[][] = [];
				let batches = 0;
				for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
					const batch = await this.client.embed(texts.slice(i, i + EMBED_BATCH_SIZE));
					embeddings.push(...batch);
					batches++;
				}
				this.vaultIndex.setFile(file.path, content, chunks, embeddings);
				await this.useQuota("embed", batches);
				processed++;
				if (processed % 25 === 0) {
					new Notice(`Indexing… ${processed} notes embedded so far.`);
				}
			}
			await this.saveSettings();
			new Notice(
				`Vault index ready: ${this.vaultIndex.noteCount()} notes, ${this.vaultIndex.chunkCount()} chunks.`
			);
			return done();
		} finally {
			this.indexing = false;
		}
	}
}
