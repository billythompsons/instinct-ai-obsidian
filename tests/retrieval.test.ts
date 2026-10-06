/**
 * End-to-end retrieval test over the real sample-vault fixture:
 * chunkMarkdown -> deterministic bag-of-words embeddings -> retrieveTopK.
 *
 * The embedding function here is a test double for the backend's /v1/embed
 * (Qwen3 embeddings in production); what is genuinely under test is that
 * chunking + cosine retrieval surfaces the right notes for real questions.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chunkMarkdown, noteNameFromPath } from "../src/chunker";
import { normalize, retrieveTopK, type EmbeddedChunk } from "../src/search";

const VAULT_DIR = join(__dirname, "fixtures", "vault");

// Vocabulary drawn from the fixture corpus; counts per term, L2-normalized.
const VOCAB = [
	"typescript", "generics", "constraint", "utility",
	"obsidian", "daily", "template", "dataview",
	"sourdough", "starter", "flour", "ferment",
	"qwen", "model", "embedding", "inference",
	"meeting", "freemius", "license", "pricing",
	"zettelkasten", "linking", "permanent",
	"espresso", "grind", "extraction", "microfoam",
];

function bowEmbed(text: string): number[] {
	const lower = text.toLowerCase();
	return normalize(VOCAB.map((term) => lower.split(term).length - 1));
}

function indexVault(): EmbeddedChunk[] {
	const chunks: EmbeddedChunk[] = [];
	for (const file of readdirSync(VAULT_DIR).sort()) {
		if (!file.endsWith(".md")) continue;
		const md = readFileSync(join(VAULT_DIR, file), "utf8");
		for (const c of chunkMarkdown(file, md)) {
			chunks.push({ ...c, embedding: bowEmbed(`${c.heading}\n${c.text}`) });
		}
	}
	return chunks;
}

const INDEX = indexVault();

function ask(question: string, k = 3): string[] {
	const top = retrieveTopK(bowEmbed(question), INDEX, k);
	return top.map((s) => s.chunk.noteName);
}

describe("sample vault fixture", () => {
	it("contains real markdown notes", () => {
		const files = readdirSync(VAULT_DIR).filter((f) => f.endsWith(".md"));
		expect(files.length).toBeGreaterThanOrEqual(5);
		for (const f of files) {
			const md = readFileSync(join(VAULT_DIR, f), "utf8");
			expect(md.trim().length).toBeGreaterThan(200);
			expect(md).not.toMatch(/lorem ipsum/i);
		}
	});

	it("indexes every fixture note into chunks", () => {
		const names = new Set(INDEX.map((c) => c.noteName));
		expect(names.has("TypeScript generics")).toBe(true);
		expect(names.has("Sourdough starter")).toBe(true);
		expect(INDEX.length).toBeGreaterThan(7);
	});
});

describe("vault retrieval", () => {
	it("answers a TypeScript generics question from the right note", () => {
		expect(ask("How do TypeScript generics and constraints work?")[0]).toBe("TypeScript generics");
	});

	it("answers a sourdough question from the right note", () => {
		expect(ask("My sourdough starter has dark liquid on top, what do I do?")[0]).toBe(
			"Sourdough starter"
		);
	});

	it("answers an espresso question from the right note", () => {
		expect(ask("My espresso shot runs too fast and tastes sour, how do I fix the grind?")[0]).toBe(
			"Espresso extraction"
		);
	});

	it("answers a note-taking-method question from the right note", () => {
		expect(ask("What is the Zettelkasten method for linking permanent notes?")[0]).toBe(
			"Zettelkasten method"
		);
	});

	it("answers a plugin-pricing question from the meeting notes", () => {
		const top = ask("What Freemius pricing did we decide for the Obsidian plugin launch?", 3);
		expect(top[0]).toBe("Meeting notes 2026-09-30");
	});

	it("keeps chunk note names and paths consistent", () => {
		for (const c of INDEX) {
			expect(c.noteName).toBe(noteNameFromPath(c.notePath));
		}
	});
});
