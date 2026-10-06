/**
 * Screenshot renderer: jsdom + Obsidian API polyfills + the real plugin UI.
 *
 * 1. Installs Obsidian's HTMLElement extensions (createEl/createDiv/...)
 *    onto jsdom's HTMLElement.
 * 2. Bundles scripts/shots/entry.ts with `obsidian` aliased to the shim.
 * 3. Calls each render function and writes a standalone HTML doc per shot
 *    (styles.css inlined) for headless-Chromium capture.
 *
 * Run: node scripts/shots/render.mjs   (from the repo root)
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

const OUT_DIR = "/tmp/instinct-shots";
mkdirSync(OUT_DIR, { recursive: true });

// ---------- jsdom globals ----------
const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", {
	pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.HTMLInputElement = window.HTMLInputElement;
globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement;
globalThis.Node = window.Node;

// ---------- Obsidian HTMLElement extensions ----------
function applyOpts(el, o) {
	if (o == null) return;
	if (typeof o === "string") {
		el.className = o;
		return;
	}
	if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls;
	if (o.text != null) el.textContent = String(o.text);
	if (o.title != null) el.title = o.title;
	if (o.attr) {
		for (const [k, v] of Object.entries(o.attr)) {
			if (v != null) el.setAttribute(k, String(v));
		}
	}
	if (o.href != null) el.setAttribute("href", o.href);
	if (o.placeholder != null) el.setAttribute("placeholder", o.placeholder);
	if (o.type != null) el.setAttribute("type", o.type);
	if ("value" in o && o.value != null) el.value = o.value;
}

function createEl(tag, o, callback) {
	const el = document.createElement(tag);
	applyOpts(el, o);
	if (o && typeof o === "object" && o.prepend) this.prepend(el);
	else this.appendChild(el);
	if (callback) callback(el);
	return el;
}

const proto = window.HTMLElement.prototype;
proto.createEl = function (tag, o, cb) {
	return createEl.call(this, tag, o, cb);
};
proto.createDiv = function (o, cb) {
	return createEl.call(this, "div", o, cb);
};
proto.createSpan = function (o, cb) {
	return createEl.call(this, "span", o, cb);
};
proto.setText = function (val) {
	this.textContent = String(val);
};
proto.empty = function () {
	this.innerHTML = "";
};
proto.setAttr = function (k, v) {
	this.setAttribute(k, String(v));
};
proto.addClass = function (...classes) {
	this.classList.add(...classes.flatMap((c) => String(c).split(" ")).filter(Boolean));
};
proto.removeClass = function (...classes) {
	this.classList.remove(...classes.flatMap((c) => String(c).split(" ")).filter(Boolean));
};
proto.toggleClass = function (cls, force) {
	for (const c of String(cls).split(" ").filter(Boolean)) this.classList.toggle(c, force);
};

// ---------- bundle the entry with the obsidian shim ----------
await esbuild.build({
	entryPoints: ["scripts/shots/entry.ts"],
	bundle: true,
	format: "cjs",
	platform: "node",
	alias: { obsidian: "./scripts/shots/obsidian-shim.mjs" },
	outfile: `${OUT_DIR}/bundle.cjs`,
	logLevel: "silent",
});

const shots = require(`${OUT_DIR}/bundle.cjs`);

// ---------- page chrome (harness-only; mimics Obsidian's dark shell) ----------
const OVERLAY_CSS = `
html, body { margin: 0; padding: 0; background: #1e1e1e; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 28px; color: #e8eef7; box-sizing: border-box; }
.modal-container { position: fixed; inset: 0; display: flex; align-items: flex-start; justify-content: center; background: rgba(0,0,0,.55); padding: 7vh 16px; box-sizing: border-box; }
.modal { background: #262626; border: 1px solid #3d3d3d; border-radius: 12px; padding: 20px 24px; width: 640px; max-width: 94vw; max-height: 86vh; overflow: auto; box-shadow: 0 24px 64px rgba(0,0,0,.5); }
.instinct-settings-page { max-width: 840px; margin: 0 auto; background: #262626; border: 1px solid #3d3d3d; border-radius: 12px; padding: 6px 26px 26px; }
`;

const pluginCss = readFileSync("styles.css", "utf8");

const SHOTS = [
	["settings", shots.renderSettings, "settings"],
	["ask", shots.renderAsk, "ask-vault"],
	["summarize", shots.renderSummarize, "summarize-note"],
	["voice", shots.renderVoice, "voice-note"],
];

for (const [name, fn] of SHOTS) {
	fn();
	const html = `<!DOCTYPE html>
<html class="theme-dark"><head><meta charset="utf-8"><title>Instinct AI — ${name}</title><style>${OVERLAY_CSS}
${pluginCss}</style></head><body>${document.body.innerHTML}</body></html>`;
	writeFileSync(`${OUT_DIR}/${name}.html`, html);
	console.log("wrote", `${OUT_DIR}/${name}.html`);
}
