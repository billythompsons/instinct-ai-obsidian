/**
 * Screenshot entry: drives the REAL plugin UI classes (settings tab +
 * modals) against the obsidian shim, inside jsdom. Bundled by esbuild with
 * `obsidian` aliased to the shim; executed by scripts/shots/render.mjs.
 */
import { AskModal } from "../../src/askModal";
import { SummarizeModal } from "../../src/summarizeModal";
import { VoiceModal } from "../../src/voiceModal";
import { DEFAULT_SETTINGS, InstinctAISettingTab } from "../../src/settings";
import { currentMonthKey } from "../../src/licensing";
import type { PluginHooks } from "../../src/settings";

const fakeApp = {} as never;

function fakePlugin(): PluginHooks {
	const settings = JSON.parse(
		JSON.stringify({
			...DEFAULT_SETTINGS,
			plan: "pro",
			licenseKey: "LIC-••••-••••",
			licenseStatus: "Pro — verified 2026-10-05.",
			quota: { month: currentMonthKey(), used: 120 },
		})
	);
	return {
		settings,
		saveSettings: () => Promise.resolve(),
		onSettingsChanged: () => {},
		activateLicense: (_key: string) =>
			Promise.resolve({ ok: true, message: "Activated: Pro plan." }),
		rebuildIndex: (_force: boolean) => Promise.resolve({ notes: 128, chunks: 342 }),
		quotaLine: () => "Pro plan — 120 / 5,000 calls used",
		indexStats: () => "128 notes · 342 chunks indexed",
	};
}

const SAMPLE_ANSWER = [
	"Based on your vault, the team locked the Freemius pricing ladder at the 2026-09-30 launch meeting.",
	"",
	"## Pricing tiers",
	"",
	"- **Free ($0)** — summarization only, 50 calls/month",
	"- **Starter ($5/mo)** — adds vault Q&A, 500 calls/month",
	"- **Pro ($19/mo)** — adds voice notes, 5,000 calls/month",
	"- **Team ($134/mo)** — 50,000 calls/month",
	"- **Enterprise ($200/mo)** — unlimited fair use",
	"",
	"William still needs to create the Freemius product and share the product ID before paid activations work. All AI runs through the shared backend — Qwen3 for chat and Whisper for transcription.",
	"",
	"---",
	"",
	"**Sources:** [[Meeting notes 2026-09-30]]",
].join("\n");

const SAMPLE_SUMMARY = [
	"## Overview",
	"",
	"This note documents a daily-notes workflow built around a single capture habit: everything lands in today's note first, then gets distilled weekly.",
	"",
	"## Key points",
	"",
	"- **Capture:** one line per thought, link liberally, checkbox tasks with a 48-hour rule",
	"- **Review:** Sunday distillation into a weekly note; two-time survivors get archived",
	"- **Stack:** Daily Notes + Templates + Dataview only — boring setups outlive fancy ones",
	"",
	"## Takeaway",
	"",
	"The ritual matters more than the tooling: open the app and type.",
].join("\n");

export function renderSettings(): void {
	document.body.innerHTML = "";
	const tab = new InstinctAISettingTab(fakeApp, fakePlugin());
	tab.display();
	tab.containerEl.addClass("theme-dark");
	document.body.appendChild(tab.containerEl);
}

export function renderAsk(): void {
	document.body.innerHTML = "";
	const modal = new AskModal(fakeApp, () => Promise.resolve(""));
	modal.open();
	const input = (modal as unknown as { input: HTMLTextAreaElement }).input;
	const question = "What did we decide about Freemius pricing?";
	input.value = question;
	input.textContent = question; // mirror for HTML serialization
	modal.showResult(SAMPLE_ANSWER);
}

export function renderSummarize(): void {
	document.body.innerHTML = "";
	const modal = new SummarizeModal(
		fakeApp,
		"Obsidian daily notes workflow",
		() => Promise.resolve(""),
		() => {}
	);
	modal.open();
	modal.showResult(SAMPLE_SUMMARY);
}

export function renderVoice(): void {
	document.body.innerHTML = "";
	const modal = new VoiceModal(
		fakeApp,
		() => Promise.resolve({ text: "", language: null }),
		() => {}
	);
	modal.open();
}
