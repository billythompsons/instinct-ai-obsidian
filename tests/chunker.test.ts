import { describe, expect, it } from "vitest";
import {
	chunkMarkdown,
	noteNameFromPath,
	stripFrontmatter,
} from "../src/chunker";
import { hashContent } from "../src/indexer";

describe("noteNameFromPath", () => {
	it("strips directories and the .md extension", () => {
		expect(noteNameFromPath("folder/sub/My Note.md")).toBe("My Note");
		expect(noteNameFromPath("plain.md")).toBe("plain");
	});

	it("leaves non-.md names alone", () => {
		expect(noteNameFromPath("folder/noext")).toBe("noext");
	});
});

describe("stripFrontmatter", () => {
	it("removes YAML frontmatter", () => {
		const md = "---\ntags: [a]\n---\n# Hello\n";
		expect(stripFrontmatter(md)).toBe("# Hello\n");
	});

	it("leaves documents without frontmatter untouched", () => {
		expect(stripFrontmatter("# Hello\nbody")).toBe("# Hello\nbody");
	});

	it("leaves unterminated frontmatter untouched", () => {
		const md = "---\nnever closed\n# Hello";
		expect(stripFrontmatter(md)).toBe(md);
	});
});

describe("chunkMarkdown", () => {
	it("returns [] for empty notes", () => {
		expect(chunkMarkdown("a.md", "")).toEqual([]);
		expect(chunkMarkdown("a.md", "---\nx: 1\n---\n   \n")).toEqual([]);
	});

	it("returns a single chunk for a short note", () => {
		const chunks = chunkMarkdown("notes/Hello.md", "# Hello\n\nShort body.");
		expect(chunks).toHaveLength(1);
		expect(chunks[0].noteName).toBe("Hello");
		expect(chunks[0].notePath).toBe("notes/Hello.md");
		expect(chunks[0].heading).toBe("Hello");
		expect(chunks[0].index).toBe(0);
		expect(chunks[0].text).toContain("Short body.");
	});

	it("splits on headings and tracks breadcrumbs", () => {
		const md = "# A\n\ntext a\n\n## B\n\ntext b\n\n### C\n\ntext c\n\n## D\n\ntext d";
		const chunks = chunkMarkdown("n.md", md, { maxChars: 10_000 });
		const headings = chunks.map((c) => c.heading);
		expect(headings).toEqual(["A", "A > B", "A > B > C", "A > D"]);
	});

	it("keeps every chunk within maxChars", () => {
		const para = "word ".repeat(400); // 2000 chars
		const md = `# Title\n\n${para}\n\n${para}\n\n${para}`;
		const chunks = chunkMarkdown("n.md", md, { maxChars: 500, overlapChars: 50 });
		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) {
			expect(c.text.length).toBeLessThanOrEqual(500);
		}
		// No content silently dropped: every word of every paragraph appears.
		const joined = chunks.map((c) => c.text).join(" ");
		expect(joined.match(/word/g)?.length).toBeGreaterThanOrEqual(1200);
	});

	it("hard-splits a single over-long paragraph with overlap", () => {
		const para = "x".repeat(3000);
		const chunks = chunkMarkdown("n.md", para, { maxChars: 1000, overlapChars: 100 });
		expect(chunks.length).toBeGreaterThanOrEqual(3);
		// Overlap: the tail of chunk N reappears at the head of chunk N+1.
		expect(chunks[1].text.startsWith(chunks[0].text.slice(-100))).toBe(true);
	});

	it("carries the tail paragraph into the next chunk as overlap", () => {
		const p1 = "alpha ".repeat(50); // ~300 chars
		const p2 = "beta ".repeat(50);
		const p3 = "gamma ".repeat(50);
		const chunks = chunkMarkdown("n.md", `${p1}\n\n${p2}\n\n${p3}`, { maxChars: 800 });
		expect(chunks.length).toBe(2);
		// Chunk 1 = alpha+beta, chunk 2 starts with beta (overlap) then gamma.
		expect(chunks[1].text).toContain("beta");
		expect(chunks[1].text).toContain("gamma");
		expect(chunks[1].text.length).toBeLessThanOrEqual(800);
	});

	it("assigns sequential indexes across sections", () => {
		const md = "# A\n\none\n\n# B\n\ntwo";
		const chunks = chunkMarkdown("n.md", md, { maxChars: 10_000 });
		expect(chunks.map((c) => c.index)).toEqual([0, 1]);
	});
});

describe("hashContent (indexer)", () => {
	it("is stable and sensitive to changes", () => {
		expect(hashContent("hello")).toBe(hashContent("hello"));
		expect(hashContent("hello")).not.toBe(hashContent("hello!"));
		expect(hashContent("")).not.toBe(hashContent("x"));
	});
});
