/**
 * Markdown-aware chunking for the local vault index.
 *
 * Notes are split on headings first (keeping a heading breadcrumb per
 * section), then paragraphs are greedily packed into chunks of at most
 * `maxChars` characters. Over-long paragraphs are hard-split with a
 * character overlap so no content is silently dropped.
 *
 * This module is Obsidian-independent and fully unit tested.
 */

export interface NoteChunk {
	/** Note title without the .md extension, e.g. "My Note". */
	noteName: string;
	/** Vault-relative path, e.g. "folder/My Note.md". */
	notePath: string;
	/** Heading breadcrumb, e.g. "Getting started > Install". Empty when the note has no headings. */
	heading: string;
	/** Zero-based chunk index within the note. */
	index: number;
	/** Chunk text, including its heading line for context. */
	text: string;
}

export interface ChunkerOptions {
	/** Maximum characters per chunk. Default 1500 (~375 tokens). */
	maxChars?: number;
	/** Overlap characters when a single paragraph must be hard-split. Default 150. */
	overlapChars?: number;
}

const DEFAULT_MAX_CHARS = 1500;
const DEFAULT_OVERLAP_CHARS = 150;

/** File name without directories and without the .md extension. */
export function noteNameFromPath(notePath: string): string {
	const base = notePath.split("/").pop() ?? notePath;
	return base.endsWith(".md") ? base.slice(0, -3) : base;
}

/** Remove YAML frontmatter; keep everything else verbatim. */
export function stripFrontmatter(markdown: string): string {
	if (!markdown.startsWith("---")) return markdown;
	const end = markdown.indexOf("\n---", 3);
	if (end === -1) return markdown;
	return markdown.slice(end + 4).replace(/^\n/, "");
}

interface Section {
	heading: string;
	body: string;
}

/** Split markdown into sections on ATX headings, tracking a breadcrumb. */
function splitSections(markdown: string): Section[] {
	const lines = markdown.split("\n");
	const sections: Section[] = [];
	// Stack of {level, title} for the current breadcrumb.
	const stack: { level: number; title: string }[] = [];
	let current: string[] = [];

	const flush = () => {
		const body = current.join("\n").trim();
		if (body.length > 0 || sections.length === 0) {
			sections.push({
				heading: stack.map((s) => s.title).join(" > "),
				body,
			});
		}
		current = [];
	};

	for (const line of lines) {
		const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
		if (m) {
			flush();
			const level = m[1].length;
			const title = m[2].trim();
			while (stack.length > 0 && stack[stack.length - 1].level >= level) {
				stack.pop();
			}
			stack.push({ level, title });
			current.push(line); // keep the heading line in the chunk text
		} else {
			current.push(line);
		}
	}
	flush();
	return sections.filter((s) => s.body.length > 0);
}

/** Hard-split one over-long paragraph with character overlap. */
function hardSplit(text: string, maxChars: number, overlapChars: number): string[] {
	const parts: string[] = [];
	let start = 0;
	while (start < text.length) {
		let end = Math.min(start + maxChars, text.length);
		if (end < text.length) {
			// Prefer a whitespace boundary near the cut.
			const cut = text.lastIndexOf(" ", end);
			if (cut > start + maxChars * 0.5) end = cut;
		}
		parts.push(text.slice(start, end).trim());
		if (end >= text.length) break;
		start = Math.max(end - overlapChars, start + 1);
	}
	return parts.filter((p) => p.length > 0);
}

/**
 * Chunk a markdown note. Returns at least one chunk for non-empty input
 * (after frontmatter stripping); empty notes return [].
 */
export function chunkMarkdown(
	notePath: string,
	markdown: string,
	opts: ChunkerOptions = {}
): NoteChunk[] {
	const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
	const overlapChars = opts.overlapChars ?? DEFAULT_OVERLAP_CHARS;
	const noteName = noteNameFromPath(notePath);
	const body = stripFrontmatter(markdown).trim();
	if (!body) return [];

	const sections = splitSections(body);
	const chunks: NoteChunk[] = [];
	let index = 0;

	for (const section of sections) {
		const paragraphs = section.body
			.split(/\n{2,}/)
			.map((p) => p.trim())
			.filter((p) => p.length > 0);

		let current: string[] = [];
		let currentLen = 0;
		// Last paragraph added to a chunk; carried into the next chunk as overlap.
		let carry: string | null = null;

		const pushChunk = (paras: string[]) => {
			const text = paras.join("\n\n").trim();
			if (text) {
				chunks.push({ noteName, notePath, heading: section.heading, index: index++, text });
			}
		};

		for (const para of paragraphs) {
			if (para.length > maxChars) {
				pushChunk(current);
				current = [];
				currentLen = 0;
				for (const part of hardSplit(para, maxChars, overlapChars)) {
					chunks.push({ noteName, notePath, heading: section.heading, index: index++, text: part });
				}
				carry = null;
				continue;
			}
			const extra = current.length > 0 ? 2 : 0;
			if (currentLen + extra + para.length > maxChars && current.length > 0) {
				pushChunk(current);
				const overlap: string | null = carry;
				current = [];
				currentLen = 0;
				// Start the new chunk with the previous chunk's tail paragraph as overlap.
				if (overlap !== null && overlap.length + 2 + para.length <= maxChars) {
					current = [overlap];
					currentLen = overlap.length;
				}
			}
			current.push(para);
			currentLen += extra + para.length;
			carry = para;
		}
		pushChunk(current);
	}

	return chunks;
}
