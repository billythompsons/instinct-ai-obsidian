/**
 * Local vault index: content hashing, incremental updates, and the
 * serializable index payload persisted in the plugin's data.json.
 *
 * Embeddings come from the Instinct AI backend (/v1/embed); the plugin
 * driver (main.ts) orchestrates chunk -> embed -> store. This module only
 * manages index state, so it stays Obsidian-independent and unit tested.
 */

import { chunkMarkdown, type NoteChunk } from "./chunker";

export const INDEX_VERSION = 1;

export interface StoredChunk extends NoteChunk {
	embedding: number[];
}

export interface IndexedFile {
	/** Content hash at index time; re-index when it changes. */
	hash: string;
	chunks: StoredChunk[];
}

export interface IndexData {
	version: number;
	files: Record<string, IndexedFile>;
}

/** FNV-1a 32-bit hash, hex-encoded. Fast change detection for note text. */
export function hashContent(s: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(16).padStart(8, "0");
}

export function emptyIndex(): IndexData {
	return { version: INDEX_VERSION, files: {} };
}

export class VaultIndex {
	readonly data: IndexData;

	constructor(data?: IndexData) {
		if (data && data.version === INDEX_VERSION && data.files) {
			this.data = data;
		} else {
			this.data = emptyIndex();
		}
	}

	/** True when the file is new, changed, or was never indexed. */
	needsIndex(notePath: string, content: string): boolean {
		const entry = this.data.files[notePath];
		if (!entry) return true;
		return entry.hash !== hashContent(content);
	}

	/**
	 * Chunk + attach embeddings for one note. Callers embed the chunk texts
	 * via the backend first, then store the result here.
	 */
	setFile(notePath: string, content: string, chunks: NoteChunk[], embeddings: number[][]): void {
		if (chunks.length !== embeddings.length) {
			throw new Error(
				`setFile: ${chunks.length} chunks but ${embeddings.length} embeddings for ${notePath}`
			);
		}
		const stored: StoredChunk[] = chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));
		this.data.files[notePath] = { hash: hashContent(content), chunks: stored };
	}

	removeFile(notePath: string): void {
		delete this.data.files[notePath];
	}

	/** Drop entries for files that no longer exist in the vault. */
	prune(existingPaths: Set<string>): number {
		let removed = 0;
		for (const path of Object.keys(this.data.files)) {
			if (!existingPaths.has(path)) {
				delete this.data.files[path];
				removed++;
			}
		}
		return removed;
	}

	allChunks(): StoredChunk[] {
		const out: StoredChunk[] = [];
		for (const entry of Object.values(this.data.files)) {
			out.push(...entry.chunks);
		}
		return out;
	}

	noteCount(): number {
		return Object.keys(this.data.files).length;
	}

	chunkCount(): number {
		let n = 0;
		for (const entry of Object.values(this.data.files)) n += entry.chunks.length;
		return n;
	}

	/** Re-chunk one note's text without embeddings (used to size batches). */
	static chunkNote(notePath: string, content: string): NoteChunk[] {
		return chunkMarkdown(notePath, content);
	}
}
