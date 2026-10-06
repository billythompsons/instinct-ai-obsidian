/**
 * Shared UI helpers: a small safe markdown renderer for AI answers and a
 * hand-rolled settings-row builder (so the settings tab is fully styled by
 * our own styles.css, no dependency on Obsidian's Setting CSS).
 */

export function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** Inline formatting: `code`, **bold**, *italic*, [text](url), [[Wiki link]]. */
function renderInline(s: string): string {
	let out = escapeHtml(s);
	// Inline code first so its contents are not re-processed.
	out = out.replace(/`([^`]+?)`/g, (_m, code) => `<code>${code}</code>`);
	out = out.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
	out = out.replace(/(^|[^*\w])\*([^*\n]+?)\*/g, "$1<em>$2</em>");
	out = out.replace(
		/\[([^\]]+?)\]\((https?:[^)\s]+)\)/g,
		'<a href="$2" target="_blank" rel="noopener">$1</a>'
	);
	// Obsidian wiki-links become styled spans (no navigation target in a modal).
	out = out.replace(/\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]/g, '<span class="instinct-wikilink">$1</span>');
	return out;
}

interface Block {
	html: string;
}

/**
 * Render a safe subset of Markdown to HTML for displaying AI answers:
 * fenced code blocks, ATX headings, bullet/numbered lists, paragraphs,
 * and inline formatting. All other HTML is escaped.
 */
export function renderAnswerMarkdown(md: string): string {
	const lines = md.replace(/\r\n/g, "\n").split("\n");
	const blocks: Block[] = [];
	let inFence = false;
	let fenceBuf: string[] = [];
	let listBuf: { ordered: boolean; items: string[] } | null = null;
	let paraBuf: string[] = [];

	const flushPara = () => {
		if (paraBuf.length > 0) {
			blocks.push({ html: `<p>${renderInline(paraBuf.join(" "))}</p>` });
			paraBuf = [];
		}
	};
	const flushList = () => {
		if (listBuf) {
			const tag = listBuf.ordered ? "ol" : "ul";
			const items = listBuf.items.map((i) => `<li>${renderInline(i)}</li>`).join("");
			blocks.push({ html: `<${tag}>${items}</${tag}>` });
			listBuf = null;
		}
	};

	for (const rawLine of lines) {
		const line = rawLine;
		if (/^```/.test(line.trim())) {
			if (inFence) {
				blocks.push({ html: `<pre><code>${escapeHtml(fenceBuf.join("\n"))}</code></pre>` });
				fenceBuf = [];
				inFence = false;
			} else {
				flushPara();
				flushList();
				inFence = true;
			}
			continue;
		}
		if (inFence) {
			fenceBuf.push(line);
			continue;
		}
		const heading = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
		if (heading) {
			flushPara();
			flushList();
			const level = Math.min(heading[1].length + 2, 6); // answers render as h3..h6
			blocks.push({ html: `<h${level}>${renderInline(heading[2])}</h${level}>` });
			continue;
		}
		const bullet = /^\s*[-*+]\s+(.*\S)\s*$/.exec(line);
		const ordered = /^\s*\d+[.)]\s+(.*\S)\s*$/.exec(line);
		if (bullet || ordered) {
			flushPara();
			const isOrdered = !!ordered;
			const text = (bullet?.[1] ?? ordered?.[1] ?? "").trim();
			if (!listBuf || listBuf.ordered !== isOrdered) {
				flushList();
				listBuf = { ordered: isOrdered, items: [] };
			}
			listBuf.items.push(text);
			continue;
		}
		if (/^\s*$/.test(line)) {
			flushPara();
			flushList();
			continue;
		}
		paraBuf.push(line.trim());
	}
	flushPara();
	flushList();
	if (inFence && fenceBuf.length > 0) {
		blocks.push({ html: `<pre><code>${escapeHtml(fenceBuf.join("\n"))}</code></pre>` });
	}
	return blocks.map((b) => b.html).join("\n");
}

export interface SettingRowOptions {
	name: string;
	desc?: string;
}

/**
 * Build one settings row: label column + control column. Returns the
 * control column element for the caller to fill.
 */
export function settingRow(container: HTMLElement, opts: SettingRowOptions): HTMLElement {
	const row = container.createDiv({ cls: "instinct-setting-row" });
	const info = row.createDiv({ cls: "instinct-setting-info" });
	info.createDiv({ cls: "instinct-setting-name", text: opts.name });
	if (opts.desc) {
		info.createDiv({ cls: "instinct-setting-desc", text: opts.desc });
	}
	return row.createDiv({ cls: "instinct-setting-control" });
}

/** Convenience: text input wired to a getter/setter pair. */
export function textControl(
	controlEl: HTMLElement,
	opts: {
		value: string;
		placeholder?: string;
		password?: boolean;
		onChange: (value: string) => void | Promise<void>;
	}
): HTMLInputElement {
	const input = controlEl.createEl("input", {
		cls: "instinct-input",
		attr: {
			type: opts.password ? "password" : "text",
			placeholder: opts.placeholder ?? "",
		},
	}) as HTMLInputElement;
	input.value = opts.value;
	input.addEventListener("change", () => {
		void opts.onChange(input.value);
	});
	return input;
}

/** Convenience: button that runs an async action with a busy label. */
export function actionButton(
	controlEl: HTMLElement,
	opts: { label: string; cta?: boolean; busyLabel?: string; onClick: () => void | Promise<void> }
): HTMLButtonElement {
	const btn = controlEl.createEl("button", {
		cls: "instinct-btn" + (opts.cta ? " instinct-btn-cta" : ""),
		text: opts.label,
	}) as HTMLButtonElement;
	btn.addEventListener("click", async () => {
		btn.disabled = true;
		const original = btn.textContent;
		if (opts.busyLabel) btn.textContent = opts.busyLabel;
		try {
			await opts.onClick();
		} finally {
			btn.disabled = false;
			btn.textContent = original;
		}
	});
	return btn;
}
