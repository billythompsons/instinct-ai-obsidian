/**
 * Local vector search: cosine similarity + top-k retrieval over embedded
 * note chunks. The embeddings themselves come from the Instinct AI backend
 * ({BASE}/v1/embed); this module only ranks them.
 *
 * Obsidian-independent and fully unit tested.
 */

import type { NoteChunk } from "./chunker";

export interface EmbeddedChunk extends NoteChunk {
	embedding: number[];
}

export interface ScoredChunk {
	chunk: EmbeddedChunk;
	score: number;
}

/** L2-normalize a vector. Zero vectors are returned unchanged. */
export function normalize(vec: number[]): number[] {
	let sum = 0;
	for (const v of vec) sum += v * v;
	if (sum === 0) return vec.slice();
	const inv = 1 / Math.sqrt(sum);
	return vec.map((v) => v * inv);
}

/**
 * Cosine similarity in [-1, 1]. Throws on dimension mismatch.
 * Zero vectors score 0 against anything.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) {
		throw new Error(
			`cosineSimilarity: dimension mismatch (${a.length} vs ${b.length})`
		);
	}
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	if (na === 0 || nb === 0) return 0;
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Rank chunks by cosine similarity to the query embedding and return the
 * top `k`, highest score first. Chunks with a score of exactly 0 are kept
 * (they simply rank last); an empty chunk list returns [].
 */
export function retrieveTopK(
	queryEmbedding: number[],
	chunks: EmbeddedChunk[],
	k: number
): ScoredChunk[] {
	if (k <= 0 || chunks.length === 0) return [];
	const scored: ScoredChunk[] = chunks.map((chunk) => ({
		chunk,
		score: cosineSimilarity(queryEmbedding, chunk.embedding),
	}));
	scored.sort((x, y) => y.score - x.score);
	return scored.slice(0, k);
}

/** Unique note names from scored chunks, in first-appearance order. */
export function citedNotes(scored: ScoredChunk[]): string[] {
	const seen = new Set<string>();
	const names: string[] = [];
	for (const s of scored) {
		const n = s.chunk.noteName;
		if (!seen.has(n)) {
			seen.add(n);
			names.push(n);
		}
	}
	return names;
}
