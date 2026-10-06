/**
 * Instinct AI shared-backend client ("instinct-api").
 *
 * Contract:
 *   Headers: Authorization: Bearer <product API key>; X-License-Key; X-Product: obsidian
 *   POST {BASE}/v1/chat       {messages:[{role,content}], max_tokens?} -> {reply}
 *   POST {BASE}/v1/summarize   {text, style?}                          -> {summary}
 *   POST {BASE}/v1/embed       {texts:[]}                              -> {embeddings: [[...]]}
 *   POST {BASE}/v1/transcribe multipart {audio}                       -> {text, language}
 *   GET  {BASE}/v1/license/verify?key=<LICENSE>&product=obsidian       -> {valid, plan, features[], expires}
 *   POST {BASE}/v1/usage       {product:"obsidian", feature, units}     -> {ok, allowed, remaining}
 *
 * AI: Qwen3 (chat/summarize/embed), whisper-large-v3-turbo (transcribe). Never Groq.
 */

import type { ChatMessage, SummaryStyle } from "./prompts";

export class ApiError extends Error {
	status?: number;
	constructor(message: string, status?: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

export interface LicenseVerification {
	valid: boolean;
	plan: string;
	features: string[];
	expires: string | null;
	raw: unknown;
}

export interface UsageReport {
	ok: boolean;
	allowed: boolean;
	remaining: number | null;
}

export interface Transcription {
	text: string;
	language: string | null;
}

export interface ClientOptions {
	baseUrl: string;
	productKey: string;
	licenseKey: string;
	fetchFn?: typeof fetch;
	timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 60_000;
export const PRODUCT_HEADER = "obsidian";

function normalizeBase(baseUrl: string): string {
	const b = baseUrl.trim().replace(/\/+$/, "");
	if (!b) throw new ApiError("Backend URL is not configured. Open Settings → Instinct AI and set the API URL.");
	return b;
}

export class InstinctAIClient {
	private baseUrl: string;
	private productKey: string;
	private licenseKey: string;
	private fetchFn: typeof fetch;
	private timeoutMs: number;

	constructor(opts: ClientOptions) {
		this.baseUrl = opts.baseUrl;
		this.productKey = opts.productKey;
		this.licenseKey = opts.licenseKey;
		this.fetchFn = opts.fetchFn ?? fetch;
		this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	/** Update credentials live when settings change. */
	configure(opts: Pick<ClientOptions, "baseUrl" | "productKey" | "licenseKey">): void {
		this.baseUrl = opts.baseUrl;
		this.productKey = opts.productKey;
		this.licenseKey = opts.licenseKey;
	}

	private headers(extra: Record<string, string> = {}): Record<string, string> {
		return {
			"Content-Type": "application/json",
			Authorization: `Bearer ${this.productKey}`,
			"X-License-Key": this.licenseKey,
			"X-Product": PRODUCT_HEADER,
			...extra,
		};
	}

	private async request<T>(path: string, init: RequestInit, parse: (body: unknown) => T): Promise<T> {
		const base = normalizeBase(this.baseUrl);
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		let res: Response;
		try {
			res = await this.fetchFn(base + path, { ...init, signal: controller.signal });
		} catch (err) {
			throw new ApiError(
				`Could not reach the Instinct AI backend at ${base}: ${err instanceof Error ? err.message : String(err)}`
			);
		} finally {
			clearTimeout(timer);
		}
		if (!res.ok) {
			const detail = await safeErrorDetail(res);
			throw new ApiError(
				`Backend error ${res.status} on ${path}${detail ? `: ${detail}` : ""}`,
				res.status
			);
		}
		let body: unknown;
		try {
			body = await res.json();
		} catch {
			throw new ApiError(`Backend returned an unreadable response on ${path}.`, res.status);
		}
		return parse(body);
	}

	private postJson<T>(path: string, payload: unknown, parse: (body: unknown) => T): Promise<T> {
		return this.request<T>(
			path,
			{ method: "POST", headers: this.headers(), body: JSON.stringify(payload) },
			parse
		);
	}

	/** POST /v1/chat -> {reply} */
	async chat(messages: ChatMessage[], maxTokens?: number): Promise<string> {
		const payload: Record<string, unknown> = { messages };
		if (maxTokens !== undefined) payload.max_tokens = maxTokens;
		return this.postJson("/v1/chat", payload, (body) => {
			const reply = (body as Record<string, unknown>)?.reply;
			if (typeof reply !== "string" || !reply) {
				throw new ApiError("Backend /v1/chat returned no reply text.");
			}
			return reply;
		});
	}

	/** POST /v1/summarize -> {summary} */
	async summarize(text: string, style?: SummaryStyle): Promise<string> {
		return this.postJson("/v1/summarize", { text, style }, (body) => {
			const summary = (body as Record<string, unknown>)?.summary;
			if (typeof summary !== "string" || !summary) {
				throw new ApiError("Backend /v1/summarize returned no summary text.");
			}
			return summary;
		});
	}

	/** POST /v1/embed -> {embeddings: number[][]}. Texts may be sent in batches. */
	async embed(texts: string[]): Promise<number[][]> {
		if (texts.length === 0) return [];
		return this.postJson("/v1/embed", { texts }, (body) => {
			const embeddings = (body as Record<string, unknown>)?.embeddings;
			if (
				!Array.isArray(embeddings) ||
				embeddings.length !== texts.length ||
				!embeddings.every((e) => Array.isArray(e) && e.every((n) => typeof n === "number"))
			) {
				throw new ApiError("Backend /v1/embed returned malformed embeddings.");
			}
			return embeddings as number[][];
		});
	}

	/** POST /v1/transcribe (multipart {audio}) -> {text, language} */
	async transcribe(audio: Blob, filename = "voice-note.webm"): Promise<Transcription> {
		const base = normalizeBase(this.baseUrl);
		const form = new FormData();
		form.append("audio", audio, filename);
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		let res: Response;
		try {
			res = await this.fetchFn(base + "/v1/transcribe", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.productKey}`,
					"X-License-Key": this.licenseKey,
					"X-Product": PRODUCT_HEADER,
				},
				body: form,
				signal: controller.signal,
			});
		} catch (err) {
			throw new ApiError(
				`Could not reach the Instinct AI backend at ${base}: ${err instanceof Error ? err.message : String(err)}`
			);
		} finally {
			clearTimeout(timer);
		}
		if (!res.ok) {
			const detail = await safeErrorDetail(res);
			throw new ApiError(
				`Backend error ${res.status} on /v1/transcribe${detail ? `: ${detail}` : ""}`,
				res.status
			);
		}
		let body: unknown;
		try {
			body = await res.json();
		} catch {
			throw new ApiError("Backend /v1/transcribe returned an unreadable response.", res.status);
		}
		const b = body as Record<string, unknown>;
		if (typeof b.text !== "string" || !b.text.trim()) {
			throw new ApiError("Backend /v1/transcribe returned no transcript text.");
		}
		return { text: b.text, language: typeof b.language === "string" ? b.language : null };
	}

	/** GET /v1/license/verify?key=<LICENSE>&product=obsidian -> {valid, plan, features[], expires} */
	async verifyLicense(key?: string): Promise<LicenseVerification> {
		const licenseKey = (key ?? this.licenseKey).trim();
		if (!licenseKey) {
			return { valid: false, plan: "free", features: [], expires: null, raw: null };
		}
		const base = normalizeBase(this.baseUrl);
		const url =
			`${base}/v1/license/verify?key=${encodeURIComponent(licenseKey)}` +
			`&product=${encodeURIComponent(PRODUCT_HEADER)}`;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		let res: Response;
		try {
			res = await this.fetchFn(url, {
				method: "GET",
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${this.productKey}`,
					"X-Product": PRODUCT_HEADER,
				},
				signal: controller.signal,
			});
		} catch (err) {
			throw new ApiError(
				`Could not reach the Instinct AI backend at ${base}: ${err instanceof Error ? err.message : String(err)}`
			);
		} finally {
			clearTimeout(timer);
		}
		if (!res.ok) {
			throw new ApiError(`License verification failed with HTTP ${res.status}.`, res.status);
		}
		let body: unknown;
		try {
			body = await res.json();
		} catch {
			throw new ApiError("License server returned an unreadable response.");
		}
		return parseLicenseBody(body);
	}

	/** POST /v1/usage {product:"obsidian", feature, units} -> {ok, allowed, remaining} */
	async reportUsage(feature: string, units: number): Promise<UsageReport> {
		try {
			return await this.postJson("/v1/usage", { product: PRODUCT_HEADER, feature, units }, (body) => {
				const b = (body as Record<string, unknown>) ?? {};
				return {
					ok: b.ok === true,
					allowed: b.allowed !== false,
					remaining: typeof b.remaining === "number" ? b.remaining : null,
				};
			});
		} catch {
			// Usage reporting is telemetry: it must never break the feature.
			return { ok: false, allowed: true, remaining: null };
		}
	}
}

async function safeErrorDetail(res: Response): Promise<string> {
	try {
		const text = await res.text();
		return text.slice(0, 300);
	} catch {
		return "";
	}
}

function parseLicenseBody(body: unknown): LicenseVerification {
	const b = (body ?? {}) as Record<string, unknown>;
	const features = Array.isArray(b.features)
		? b.features.filter((f): f is string => typeof f === "string")
		: [];
	return {
		valid: b.valid === true,
		plan: typeof b.plan === "string" ? b.plan : "free",
		features,
		expires: typeof b.expires === "string" ? b.expires : null,
		raw: body,
	};
}
