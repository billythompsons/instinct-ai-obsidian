/**
 * "Ask Instinct AI about your vault" modal: question box + rendered answer
 * with source citations.
 */

import { App, Modal } from "obsidian";
import { escapeHtml, renderAnswerMarkdown } from "./ui";

export class AskModal extends Modal {
	private onAsk: (question: string) => Promise<string>;
	private input!: HTMLTextAreaElement;
	private askBtn!: HTMLButtonElement;
	private resultEl!: HTMLElement;

	constructor(app: App, onAsk: (question: string) => Promise<string>) {
		super(app);
		this.onAsk = onAsk;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("instinct-modal");

		contentEl.createEl("h2", { text: "Ask Instinct AI about your vault" });
		contentEl.createDiv({
			cls: "instinct-modal-sub",
			text: "Searches your indexed notes and answers with citations.",
		});

		this.input = contentEl.createEl("textarea", {
			cls: "instinct-ask-input",
			attr: { placeholder: "Ask anything about your notes…", rows: "3" },
		}) as HTMLTextAreaElement;
		this.input.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				void this.submit();
			}
		});

		const btnRow = contentEl.createDiv({ cls: "instinct-btn-row" });
		btnRow.createDiv({ cls: "instinct-hint", text: "Ctrl/Cmd + Enter to ask" });
		this.askBtn = btnRow.createEl("button", {
			text: "Ask",
			cls: "instinct-btn instinct-btn-cta",
		}) as HTMLButtonElement;
		this.askBtn.addEventListener("click", () => void this.submit());

		this.resultEl = contentEl.createDiv({
			cls: "instinct-result instinct-empty",
			text: "Answers appear here, with citations to the notes they came from.",
		});

		this.input.focus();
	}

	private async submit(): Promise<void> {
		const question = this.input.value.trim();
		if (!question || this.askBtn.disabled) return;
		this.askBtn.disabled = true;
		this.askBtn.setText("Thinking…");
		this.resultEl.removeClass("instinct-empty");
		this.resultEl.innerHTML = '<div class="instinct-loading">Searching your vault…</div>';
		try {
			const markdown = await this.onAsk(question);
			this.showResult(markdown);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.resultEl.innerHTML = `<div class="instinct-error">${escapeHtml(message)}</div>`;
		} finally {
			this.askBtn.disabled = false;
			this.askBtn.setText("Ask");
		}
	}

	/** Render a markdown answer. Public so it can be driven directly. */
	showResult(markdown: string): void {
		this.resultEl.removeClass("instinct-empty");
		this.resultEl.innerHTML = renderAnswerMarkdown(markdown);
		this.resultEl.scrollTop = 0;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
