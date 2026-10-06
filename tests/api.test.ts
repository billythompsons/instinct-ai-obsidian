/**
 * API contract tests with a stubbed fetch (tests only — never shipped).
 * Verifies exact paths, headers, request shapes and response parsing
 * against the instinct-api contract.
 */
import { describe, expect, it, vi } from "vitest";
import { ApiError, InstinctAIClient } from "../src/api";

interface Captured {
	url: string;
	init: RequestInit;
}

function stubFetch(handler: (c: Captured) => Response): typeof fetch {
	const calls: Captured[] = [];
	const fn = (async (url: string, init?: RequestInit) => {
		const captured = { url, init: init ?? {} };
		calls.push(captured);
		return handler(captured);
	}) as unknown as typeof fetch;
	(fn as unknown as { calls: Captured[] }).calls = calls;
	return fn;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function clientWith(fetchFn: typeof fetch): InstinctAIClient {
	return new InstinctAIClient({
		baseUrl: "https://api.test/",
		productKey: "pk-test",
		licenseKey: "lic-test",
		fetchFn,
		timeoutMs: 1000,
	});
}

function callsOf(fetchFn: typeof fetch): Captured[] {
	return (fetchFn as unknown as { calls: Captured[] }).calls;
}

function authHeaders(init: RequestInit): Record<string, string> {
	return init.headers as Record<string, string>;
}

describe("InstinctAIClient contract", () => {
	it("chat posts to /v1/chat with the right headers and body", async () => {
		const fetchFn = stubFetch(() => jsonResponse({ reply: "hello" }));
		const client = clientWith(fetchFn);
		const reply = await client.chat([{ role: "user", content: "hi" }], 500);
		expect(reply).toBe("hello");
		const [call] = callsOf(fetchFn);
		expect(call.url).toBe("https://api.test/v1/chat");
		expect(call.init.method).toBe("POST");
		const h = authHeaders(call.init);
		expect(h["Authorization"]).toBe("Bearer pk-test");
		expect(h["X-License-Key"]).toBe("lic-test");
		expect(h["X-Product"]).toBe("obsidian");
		expect(JSON.parse(call.init.body as string)).toEqual({
			messages: [{ role: "user", content: "hi" }],
			max_tokens: 500,
		});
	});

	it("summarize posts to /v1/summarize with text and style", async () => {
		const fetchFn = stubFetch(() => jsonResponse({ summary: "short version" }));
		const client = clientWith(fetchFn);
		expect(await client.summarize("long text", "bullets")).toBe("short version");
		const [call] = callsOf(fetchFn);
		expect(call.url).toBe("https://api.test/v1/summarize");
		expect(JSON.parse(call.init.body as string)).toEqual({ text: "long text", style: "bullets" });
	});

	it("embed posts texts[] and returns aligned embeddings", async () => {
		const fetchFn = stubFetch(() => jsonResponse({ embeddings: [[0.1, 0.2], [0.3, 0.4]] }));
		const client = clientWith(fetchFn);
		const out = await client.embed(["a", "b"]);
		expect(out).toEqual([[0.1, 0.2], [0.3, 0.4]]);
		const [call] = callsOf(fetchFn);
		expect(call.url).toBe("https://api.test/v1/embed");
		expect(JSON.parse(call.init.body as string)).toEqual({ texts: ["a", "b"] });
	});

	it("embed rejects misaligned embedding counts", async () => {
		const fetchFn = stubFetch(() => jsonResponse({ embeddings: [[0.1]] }));
		const client = clientWith(fetchFn);
		await expect(client.embed(["a", "b"])).rejects.toThrow(/malformed/);
	});

	it("transcribe sends multipart audio without a JSON content-type", async () => {
		const fetchFn = stubFetch(() => jsonResponse({ text: "hello world", language: "en" }));
		const client = clientWith(fetchFn);
		const audio = new Blob(["fake-audio"], { type: "audio/webm" });
		const result = await client.transcribe(audio, "note.webm");
		expect(result).toEqual({ text: "hello world", language: "en" });
		const [call] = callsOf(fetchFn);
		expect(call.url).toBe("https://api.test/v1/transcribe");
		expect(call.init.body).toBeInstanceOf(FormData);
		const form = call.init.body as FormData;
		expect((form.get("audio") as Blob).size).toBe(audio.size);
		const h = authHeaders(call.init);
		expect(h["Authorization"]).toBe("Bearer pk-test");
		expect(h["X-License-Key"]).toBe("lic-test");
		expect(h["X-Product"]).toBe("obsidian");
		expect("Content-Type" in h).toBe(false); // browser sets multipart boundary
	});

	it("verifyLicense GETs /v1/license/verify with key and product", async () => {
		const fetchFn = stubFetch(() =>
			jsonResponse({ valid: true, plan: "Pro", features: ["ask", "voice"], expires: "2027-01-01" })
		);
		const client = clientWith(fetchFn);
		const v = await client.verifyLicense("LIC-123");
		expect(v.valid).toBe(true);
		expect(v.plan).toBe("Pro");
		expect(v.features).toEqual(["ask", "voice"]);
		expect(v.expires).toBe("2027-01-01");
		const [call] = callsOf(fetchFn);
		expect(call.init.method).toBe("GET");
		expect(call.url).toBe("https://api.test/v1/license/verify?key=LIC-123&product=obsidian");
	});

	it("verifyLicense short-circuits on an empty key", async () => {
		const fetchFn = stubFetch(() => {
			throw new Error("should not be called");
		});
		const client = clientWith(fetchFn);
		const v = await client.verifyLicense("  ");
		expect(v.valid).toBe(false);
		expect(callsOf(fetchFn)).toHaveLength(0);
	});

	it("reportUsage posts product/feature/units and parses the reply", async () => {
		const fetchFn = stubFetch(() => jsonResponse({ ok: true, allowed: true, remaining: 499 }));
		const client = clientWith(fetchFn);
		const r = await client.reportUsage("summarize", 1);
		expect(r).toEqual({ ok: true, allowed: true, remaining: 499 });
		const [call] = callsOf(fetchFn);
		expect(call.url).toBe("https://api.test/v1/usage");
		expect(JSON.parse(call.init.body as string)).toEqual({
			product: "obsidian",
			feature: "summarize",
			units: 1,
		});
	});

	it("reportUsage never throws — telemetry must not break features", async () => {
		const fetchFn = stubFetch(() => jsonResponse({ error: "x" }, 500));
		const client = clientWith(fetchFn);
		const r = await client.reportUsage("summarize", 1);
		expect(r.allowed).toBe(true);
		expect(r.ok).toBe(false);
	});

	it("raises ApiError with status on backend errors", async () => {
		const fetchFn = stubFetch(() => jsonResponse({ error: "quota exceeded" }, 429));
		const client = clientWith(fetchFn);
		const err = await client.chat([{ role: "user", content: "hi" }]).catch((e) => e);
		expect(err).toBeInstanceOf(ApiError);
		expect((err as ApiError).status).toBe(429);
		expect((err as ApiError).message).toMatch(/429/);
	});

	it("raises ApiError when the backend is unreachable", async () => {
		const fetchFn = stubFetch(() => {
			throw new Error("connection refused");
		});
		const client = clientWith(fetchFn);
		await expect(client.embed(["a"])).rejects.toThrow(/Could not reach/);
	});

	it("raises ApiError when the backend URL is not configured", async () => {
		const fetchFn = stubFetch(() => jsonResponse({ reply: "x" }));
		const client = new InstinctAIClient({ baseUrl: "   ", productKey: "k", licenseKey: "l", fetchFn });
		await expect(client.chat([{ role: "user", content: "hi" }])).rejects.toThrow(/not configured/);
	});

	it("chat rejects a missing reply field", async () => {
		const fetchFn = stubFetch(() => jsonResponse({ nope: 1 }));
		const client = clientWith(fetchFn);
		await expect(client.chat([{ role: "user", content: "hi" }])).rejects.toThrow(/no reply/);
	});

	it("configure() swaps credentials live", async () => {
		const fetchFn = stubFetch(() => jsonResponse({ reply: "ok" }));
		const client = clientWith(fetchFn);
		client.configure({ baseUrl: "https://other.test", productKey: "new-key", licenseKey: "new-lic" });
		await client.chat([{ role: "user", content: "hi" }]);
		const [call] = callsOf(fetchFn);
		expect(call.url).toBe("https://other.test/v1/chat");
		expect(authHeaders(call.init)["Authorization"]).toBe("Bearer new-key");
	});

	it("does not retry — one request per call", async () => {
		const spy = vi.fn(() => jsonResponse({ reply: "x" }));
		const fetchFn = stubFetch(spy);
		const client = clientWith(fetchFn);
		await client.chat([{ role: "user", content: "hi" }]);
		expect(spy).toHaveBeenCalledTimes(1);
	});
});
