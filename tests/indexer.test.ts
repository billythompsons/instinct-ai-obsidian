import { describe, expect, it } from "vitest";
import { VaultIndex, emptyIndex } from "../src/indexer";
import { chunkMarkdown } from "../src/chunker";

function fakeEmbeddings(n: number, dim = 4): number[][] {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: dim }, (_, j) => (i + 1) * (j + 1))
	);
}

describe("VaultIndex", () => {
	it("starts empty", () => {
		const idx = new VaultIndex(emptyIndex());
		expect(idx.noteCount()).toBe(0);
		expect(idx.chunkCount()).toBe(0);
		expect(idx.allChunks()).toEqual([]);
	});

	it("detects new, changed, and unchanged notes", () => {
		const idx = new VaultIndex();
		expect(idx.needsIndex("a.md", "hello")).toBe(true);
		const chunks = chunkMarkdown("a.md", "hello");
		idx.setFile("a.md", "hello", chunks, fakeEmbeddings(chunks.length));
		expect(idx.needsIndex("a.md", "hello")).toBe(false);
		expect(idx.needsIndex("a.md", "hello!")).toBe(true);
	});

	it("throws when chunks and embeddings are misaligned", () => {
		const idx = new VaultIndex();
		const chunks = chunkMarkdown("a.md", "hello world");
		expect(() => idx.setFile("a.md", "hello world", chunks, [])).toThrow(/misaligned|chunks but/);
	});

	it("prunes deleted files and counts chunks", () => {
		const idx = new VaultIndex();
		for (const [path, body] of [["a.md", "alpha beta"], ["b.md", "gamma delta"]]) {
			const chunks = chunkMarkdown(path, body);
			idx.setFile(path, body, chunks, fakeEmbeddings(chunks.length));
		}
		expect(idx.noteCount()).toBe(2);
		const removed = idx.prune(new Set(["a.md"]));
		expect(removed).toBe(1);
		expect(idx.noteCount()).toBe(1);
		expect(idx.allChunks().every((c) => c.notePath === "a.md")).toBe(true);
	});

	it("removeFile drops a single note", () => {
		const idx = new VaultIndex();
		const chunks = chunkMarkdown("a.md", "some content here");
		idx.setFile("a.md", "some content here", chunks, fakeEmbeddings(chunks.length));
		idx.removeFile("a.md");
		expect(idx.noteCount()).toBe(0);
	});

	it("rejects foreign index versions", () => {
		const idx = new VaultIndex({ version: 999, files: { "x.md": { hash: "h", chunks: [] } } });
		expect(idx.noteCount()).toBe(0);
	});
});
