/**
 * Plugin settings + the Instinct AI settings tab.
 *
 * The tab is hand-rolled DOM (see ui.ts) styled by styles.css, so it looks
 * identical inside Obsidian and in rendered documentation screenshots.
 */

import { App, PluginSettingTab } from "obsidian";
import {
	PLANS,
	quotaSummary,
	upgradeUrl,
	type PlanId,
	type QuotaState,
} from "./licensing";
import { emptyIndex, type IndexData } from "./indexer";
import { actionButton, settingRow, textControl } from "./ui";

export interface InstinctAISettings {
	backendUrl: string;
	productKey: string;
	licenseKey: string;
	plan: PlanId;
	/** Last license verification message, e.g. "Pro — verified 2026-10-05". */
	licenseStatus: string;
	/** Top-k retrieved chunks used to answer a vault question. */
	topK: number;
	autoReindexOnStart: boolean;
	quota: QuotaState;
	indexData: IndexData;
}

/** The surface of the plugin that the settings tab drives. */
export interface PluginHooks {
	settings: InstinctAISettings;
	saveSettings(): Promise<void>;
	onSettingsChanged(): void;
	activateLicense(key: string): Promise<{ ok: boolean; message: string }>;
	rebuildIndex(force: boolean): Promise<{ notes: number; chunks: number }>;
	quotaLine(): string;
	indexStats(): string;
}

export const DEFAULT_BACKEND_URL = "https://instinct-api.patricialgilbertmark.workers.dev";

/**
 * Default product API key for the shared instinct-api backend, baked in at
 * build time. It only identifies the product (Authorization: Bearer);
 * quotas and features are enforced per end-user Freemius license key, so it
 * grants nothing beyond the free tier. The settings field overrides it.
 */
export const DEFAULT_PRODUCT_KEY = "inak_7240d5093ecaa486f42eb3d5c9c68c523c5d0227c82df7f9";

export const DEFAULT_SETTINGS: InstinctAISettings = {
	backendUrl: DEFAULT_BACKEND_URL,
	productKey: DEFAULT_PRODUCT_KEY,
	licenseKey: "",
	plan: "free",
	licenseStatus: "No license key — Free plan.",
	topK: 5,
	autoReindexOnStart: true,
	quota: { month: "", used: 0 },
	indexData: emptyIndex(),
};

export class InstinctAISettingTab extends PluginSettingTab {
	plugin: PluginHooks;

	constructor(app: App, plugin: PluginHooks) {
		super(app, plugin as unknown as import("obsidian").Plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const plugin = this.plugin;
		const s = plugin.settings;
		containerEl.empty();
		containerEl.addClass("instinct-settings");

		containerEl.createEl("h2", { text: "Instinct AI" });
		containerEl.createDiv({
			cls: "instinct-settings-sub",
			text: "Ask questions about your vault, summarize notes, and transcribe voice notes — powered by Qwen3 and Whisper.",
		});

		// ---- Connection ----
		containerEl.createEl("h3", { text: "Connection" });
		const urlCtl = settingRow(containerEl, {
			name: "Backend API URL",
			desc: "Base URL of the Instinct AI backend (instinct-api). All AI calls go here — nothing else.",
		});
		textControl(urlCtl, {
			value: s.backendUrl,
			placeholder: "https://instinct-api.patricialgilbertmark.workers.dev",
			onChange: async (v) => {
				s.backendUrl = v.trim();
				await plugin.saveSettings();
				plugin.onSettingsChanged();
			},
		});

		const keyCtl = settingRow(containerEl, {
			name: "Product API key",
			desc: "Issued with your Instinct AI product. Sent as the Bearer token on every request.",
		});
		textControl(keyCtl, {
			value: s.productKey,
			password: true,
			placeholder: "sk-…",
			onChange: async (v) => {
				s.productKey = v.trim();
				await plugin.saveSettings();
				plugin.onSettingsChanged();
			},
		});

		// ---- License ----
		containerEl.createEl("h3", { text: "License" });
		const licCtl = settingRow(containerEl, {
			name: "License key",
			desc: "Your Freemius license key. Free plan: 50 summaries/month. Paid plans unlock vault Q&A, voice notes and higher limits.",
		});
		const licInput = textControl(licCtl, {
			value: s.licenseKey,
			placeholder: "Paste license key",
			onChange: async (v) => {
				s.licenseKey = v.trim();
				await plugin.saveSettings();
				plugin.onSettingsChanged();
			},
		});
		const licRow = licCtl.createDiv({ cls: "instinct-license-actions" });
		const statusEl = licRow.createDiv({ cls: "instinct-license-status", text: s.licenseStatus });
		actionButton(licRow, {
			label: "Activate",
			cta: true,
			busyLabel: "Verifying…",
			onClick: async () => {
				const result = await plugin.activateLicense(licInput.value.trim());
				statusEl.setText(result.message);
				this.display();
			},
		});

		const planCtl = settingRow(containerEl, {
			name: "Plan & usage",
			desc: quotaSummary(PLANS[s.plan], s.quota),
		});
		const upgrade = planCtl.createEl("a", {
			cls: "instinct-upgrade-link",
			text: "Upgrade plan →",
			href: upgradeUrl(),
		});
		upgrade.setAttr("target", "_blank");
		upgrade.setAttr("rel", "noopener");

		// ---- Vault Q&A ----
		containerEl.createEl("h3", { text: "Vault Q&A" });
		const topkCtl = settingRow(containerEl, {
			name: "Sources per answer",
			desc: "How many of the most relevant note chunks are sent to the AI with each question (1–10).",
		});
		const sliderWrap = topkCtl.createDiv({ cls: "instinct-slider-wrap" });
		const slider = sliderWrap.createEl("input", {
			cls: "instinct-slider",
			attr: { type: "range", min: "1", max: "10", step: "1" },
		}) as HTMLInputElement;
		slider.value = String(s.topK);
		const sliderVal = sliderWrap.createSpan({ cls: "instinct-slider-val", text: String(s.topK) });
		slider.addEventListener("input", () => {
			sliderVal.setText(slider.value);
		});
		slider.addEventListener("change", async () => {
			s.topK = Math.max(1, Math.min(10, parseInt(slider.value, 10) || 5));
			await plugin.saveSettings();
		});

		const autoCtl = settingRow(containerEl, {
			name: "Update index on startup",
			desc: "Re-embed new and changed notes automatically when Obsidian starts (Starter plan and up).",
		});
		const toggle = autoCtl.createEl("input", {
			cls: "instinct-toggle",
			attr: { type: "checkbox" },
		}) as HTMLInputElement;
		toggle.checked = s.autoReindexOnStart;
		toggle.addEventListener("change", async () => {
			s.autoReindexOnStart = toggle.checked;
			await plugin.saveSettings();
		});

		const idxCtl = settingRow(containerEl, {
			name: "Local vault index",
			desc: "Notes are chunked and embedded locally-cached on this device; embeddings are computed by the Instinct AI backend.",
		});
		const statsEl = idxCtl.createDiv({ cls: "instinct-index-stats", text: plugin.indexStats() });
		actionButton(idxCtl, {
			label: "Rebuild index",
			busyLabel: "Indexing…",
			onClick: async () => {
				const r = await plugin.rebuildIndex(true);
				statsEl.setText(`${r.notes} notes · ${r.chunks} chunks indexed`);
				this.display();
			},
		});

		// ---- About ----
		containerEl.createEl("h3", { text: "About" });
		containerEl.createDiv({
			cls: "instinct-settings-sub",
			text: "Instinct AI 1.0.0 by Instinct · Support: instinctapp@outlook.com · AI: Qwen3 + whisper-large-v3-turbo.",
		});
	}
}
