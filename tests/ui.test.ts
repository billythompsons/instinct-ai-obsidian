import { describe, expect, it } from "vitest";
import { renderAnswerMarkdown } from "../src/ui";

describe("renderAnswerMarkdown", () => {
	it("renders headings, paragraphs, bold and italic", () => {
		const html = renderAnswerMarkdown("# Title\n\nHello **bold** and *italic* text.");
		expect(html).toContain("<h3>Title</h3>");
		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain("<em>italic</em>");
	});

	it("renders bullet and numbered lists", () => {
		const html = renderAnswerMarkdown("- one\n- two\n\n1. first\n2. second");
		expect(html).toContain("<ul>");
		expect(html).toContain("<li>one</li>");
		expect(html).toContain("<ol>");
		expect(html).toContain("<li>first</li>");
	});

	it("renders fenced code blocks and inline code", () => {
		const html = renderAnswerMarkdown("```ts\nconst x = 1;\n```\n\nUse `x` now.");
		expect(html).toContain("<pre><code>const x = 1;</code></pre>");
		expect(html).toContain("<code>x</code>");
	});

	it("converts wiki-links to styled spans", () => {
		const html = renderAnswerMarkdown("See [[My Note]] for details.");
		expect(html).toContain('<span class="instinct-wikilink">My Note</span>');
	});

	it("renders http links as anchors", () => {
		const html = renderAnswerMarkdown("Read [the docs](https://example.com/a).");
		expect(html).toContain('<a href="https://example.com/a"');
	});

	it("escapes raw HTML to prevent injection", () => {
		const html = renderAnswerMarkdown('<script>alert("x")</script>');
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
	});

	it("handles empty input", () => {
		expect(renderAnswerMarkdown("")).toBe("");
		expect(renderAnswerMarkdown("   \n  ")).toBe("");
	});
});
