import { describe, expect, it } from "vitest";
import {
	ASK_SYSTEM_PROMPT,
	buildAskContext,
	buildAskMessages,
	buildSourcesFooter,
	buildSummaryHeading,
	isSummaryStyle,
	validateSummarizeInput,
	type SummaryStyle,
} from "../src/prompts";
import type { ScoredChunk } from "../src/search";

function scored(noteName: string, heading: string, text: string, score: number): ScoredChunk {
	return {
		chunk: { noteName, notePath: `${noteName}.md`, heading, index: 0, text, embedding: [1] },
		score,
	};
}

describe("ASK_SYSTEM_PROMPT", () => {
	it("grounds answers in context and demands citations", () => {
		expect(ASK_SYSTEM_PROMPT).toMatch(/ONLY the provided vault context/);
		expect(ASK_SYSTEM_PROMPT).toMatch(/Cite sources inline as Obsidian wiki-links/);
		expect(ASK_SYSTEM_PROMPT).toMatch(/\[\[Meeting notes 2026-09-30\]\]/);
	});
});

describe("buildAskContext", () => {
	it("labels each source with its wiki-link and section", () => {
		const ctx = buildAskContext([
			scored("My Note", "A > B", "body text", 0.9),
			scored("Other", "", "other body", 0.5),
		]);
		expect(ctx).toContain("[Source 1: [[My Note]] (section: A > B)]");
		expect(ctx).toContain("body text");
		expect(ctx).toContain("[Source 2: [[Other]]]");
	});
});

describe("buildAskMessages", () => {
	it("returns a system + user message pair", () => {
		const msgs = buildAskMessages("What is X?", "context here");
		expect(msgs).toHaveLength(2);
		expect(msgs[0].role).toBe("system");
		expect(msgs[1].role).toBe("user");
		expect(msgs[1].content).toContain("What is X?");
		expect(msgs[1].content).toContain("context here");
	});
});

describe("buildSourcesFooter", () => {
	it("lists unique cited notes as wiki-links", () => {
		const footer = buildSourcesFooter([
			scored("B", "", "x", 0.9),
			scored("A", "", "x", 0.8),
			scored("B", "", "y", 0.7),
		]);
		expect(footer).toContain("[[B]]");
		expect(footer).toContain("[[A]]");
		expect(footer.indexOf("[[B]]")).toBeLessThan(footer.indexOf("[[A]]"));
	});

	it("returns empty string when nothing was retrieved", () => {
		expect(buildSourcesFooter([])).toBe("");
	});
});

describe("summary styles", () => {
	it("validates style ids", () => {
		expect(isSummaryStyle("brief")).toBe(true);
		expect(isSummaryStyle("detailed")).toBe(true);
		expect(isSummaryStyle("bullets")).toBe(true);
		expect(isSummaryStyle("poem")).toBe(false);
	});

	it("builds an insert heading with the style label", () => {
		const h = buildSummaryHeading("bullets" as SummaryStyle, "My Note");
		expect(h).toContain("Bullets");
		expect(h).toContain("[[My Note]]");
	});
});

describe("validateSummarizeInput", () => {
	it("rejects empty input", () => {
		expect(validateSummarizeInput("").ok).toBe(false);
		expect(validateSummarizeInput("   \n  ").ok).toBe(false);
	});

	it("rejects tiny input", () => {
		const r = validateSummarizeInput("too short");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toMatch(/too short/i);
	});

	it("accepts real note content", () => {
		expect(validateSummarizeInput("This is a reasonably long note body with real content in it.").ok).toBe(true);
	});
});
