/**
 * "Summarize active note" modal: style picker (brief / detailed / bullets),
 * rendered summary, insert-at-cursor.
 */

import { App, Modal } from "obsidian";
import { SUMMARY_STYLES, type SummaryStyle } from "./prompts";
import { buildSummaryHeading } from "./prompts";
import { escapeHtml, renderAnswerMarkdown } from "./ui";

export class SummarizeModal extends Modal {
	private noteName: string;
	private onSummarize: (style: SummaryStyle) => Promise<string>;
	private onInsert: (text: string) => void;
	private style: SummaryStyle = "brief";
	private resultEl!: HTMLElement;
	private summarizeBtn!: HTMLButtonElement;
	private insertBtn!: HTMLButtonElement;
	private lastSummary = "";

	constructor(
		app: App,
		noteName: string,
		onSummarize: (style: SummaryStyle) => Promise<string>,
		onInsert: (text: string) => void
	) {
		super(app);
		this.noteName = noteName;
		this.onSummarize = onSummarize;
		this.onInsert = onInsert;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("instinct-modal");

		contentEl.createEl("h2", { text: "Summarize note" });
		contentEl.createDiv({
			cls: "instinct-modal-sub",
			text: `Summarizing “${this.noteName}”.`,
		});

		const styleRow = contentEl.createDiv({ cls: "instinct-style-row" });
		styleRow.createSpan({ text: "Style:", cls: "instinct-style-label" });
		const select = styleRow.createEl("select", { cls: "instinct-select" }) as HTMLSelectElement;
		for (const s of SUMMARY_STYLES) {
			const opt = select.createEl("option", { text: `${s.label} — ${s.hint}` }) as HTMLOptionElement;
			opt.value = s.value;
		}
		select.value = this.style;
		select.addEventListener("change", () => {
			this.style = (select.value as SummaryStyle) ?? "brief";
		});

		const btnRow = contentEl.createDiv({ cls: "instinct-btn-row" });
		this.summarizeBtn = btnRow.createEl("button", {
			text: "Summarize",
			cls: "instinct-btn instinct-btn-cta",
		}) as HTMLButtonElement;
		this.summarizeBtn.addEventListener("click", () => void this.submit());
		this.insertBtn = btnRow.createEl("button", {
			text: "Insert at cursor",
			cls: "instinct-btn",
		}) as HTMLButtonElement;
		this.insertBtn.disabled = true;
		this.insertBtn.addEventListener("click", () => {
			if (!this.lastSummary) return;
			const heading = buildSummaryHeading(this.style, this.noteName);
			this.onInsert(`\n\n${heading}\n\n${this.lastSummary}\n`);
			this.close();
		});

		this.resultEl = contentEl.createDiv({
			cls: "instinct-result instinct-empty",
			text: "Choose a style and press Summarize.",
		});
	}

	private async submit(): Promise<void> {
		if (this.summarizeBtn.disabled) return;
		this.summarizeBtn.disabled = true;
		this.summarizeBtn.setText("Summarizing…");
		this.insertBtn.disabled = true;
		this.resultEl.removeClass("instinct-empty");
		this.resultEl.innerHTML = '<div class="instinct-loading">Reading your note…</div>';
		try {
			const summary = await this.onSummarize(this.style);
			this.lastSummary = summary;
			this.showResult(summary);
			this.insertBtn.disabled = false;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.resultEl.innerHTML = `<div class="instinct-error">${escapeHtml(message)}</div>`;
		} finally {
			this.summarizeBtn.disabled = false;
			this.summarizeBtn.setText("Summarize");
		}
	}

	/** Render a markdown summary. Public so it can be driven directly. */
	showResult(markdown: string): void {
		this.lastSummary = markdown;
		this.resultEl.removeClass("instinct-empty");
		this.resultEl.innerHTML = renderAnswerMarkdown(markdown);
		this.resultEl.scrollTop = 0;
		if (this.insertBtn) this.insertBtn.disabled = false;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
