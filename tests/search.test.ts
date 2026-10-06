import { describe, expect, it } from "vitest";
import {
	citedNotes,
	cosineSimilarity,
	normalize,
	retrieveTopK,
	type EmbeddedChunk,
} from "../src/search";

function chunk(noteName: string, text: string, embedding: number[]): EmbeddedChunk {
	return { noteName, notePath: `${noteName}.md`, heading: "", index: 0, text, embedding };
}

describe("cosineSimilarity", () => {
	it("scores identical vectors as 1", () => {
		expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
	});

	it("is scale invariant", () => {
		expect(cosineSimilarity([1, 0], [5, 0])).toBeCloseTo(1, 10);
	});

	it("scores orthogonal vectors as 0", () => {
		expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
	});

	it("scores opposite vectors as -1", () => {
		expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 10);
	});

	it("scores zero vectors as 0 instead of NaN", () => {
		expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
		expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
	});

	it("throws on dimension mismatch", () => {
		expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/dimension mismatch/);
	});
});

describe("normalize", () => {
	it("produces unit vectors", () => {
		const n = normalize([3, 4]);
		expect(Math.hypot(n[0], n[1])).toBeCloseTo(1, 10);
	});

	it("leaves zero vectors unchanged", () => {
		expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
	});
});

describe("retrieveTopK", () => {
	const chunks = [
		chunk("cats", "about cats", [1, 0, 0]),
		chunk("dogs", "about dogs", [0, 1, 0]),
		chunk("birds", "about birds", [0, 0, 1]),
	];

	it("ranks by similarity, best first", () => {
		const top = retrieveTopK([0.9, 0.1, 0], chunks, 3);
		expect(top.map((s) => s.chunk.noteName)).toEqual(["cats", "dogs", "birds"]);
		expect(top[0].score).toBeGreaterThan(top[1].score);
	});

	it("respects k", () => {
		expect(retrieveTopK([1, 0, 0], chunks, 2)).toHaveLength(2);
	});

	it("clamps k above the collection size", () => {
		expect(retrieveTopK([1, 0, 0], chunks, 99)).toHaveLength(3);
	});

	it("returns [] for k <= 0 or empty input", () => {
		expect(retrieveTopK([1, 0, 0], chunks, 0)).toEqual([]);
		expect(retrieveTopK([1, 0, 0], [], 5)).toEqual([]);
	});
});

describe("citedNotes", () => {
	it("dedupes note names in first-appearance order", () => {
		const scored = [
			{ chunk: chunk("b", "x", [1]), score: 0.9 },
			{ chunk: chunk("a", "x", [1]), score: 0.8 },
			{ chunk: chunk("b", "y", [1]), score: 0.7 },
		];
		expect(citedNotes(scored)).toEqual(["b", "a"]);
	});
});
