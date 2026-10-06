/**
 * Minimal Obsidian API shim for rendering real plugin UI in screenshots.
 * Used ONLY by scripts/shots (never shipped, never bundled into main.js).
 */

export class Modal {
	constructor(app) {
		this.app = app;
		this.containerEl = document.createElement("div");
		this.containerEl.className = "modal-container";
		this.modalEl = document.createElement("div");
		this.modalEl.className = "modal";
		this.contentEl = document.createElement("div");
		this.contentEl.className = "modal-content";
		this.modalEl.appendChild(this.contentEl);
		this.containerEl.appendChild(this.modalEl);
	}
	open() {
		this.onOpen();
		document.body.appendChild(this.containerEl);
		return this;
	}
	close() {
		try {
			this.onClose();
		} finally {
			this.containerEl.remove();
		}
	}
	onOpen() {}
	onClose() {}
	setTitle(title) {
		let el = this.modalEl.querySelector(".modal-title");
		if (!el) {
			el = document.createElement("div");
			el.className = "modal-title";
			this.modalEl.prepend(el);
		}
		el.textContent = title;
		return this;
	}
}

export class PluginSettingTab {
	constructor(app, plugin) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = document.createElement("div");
		this.containerEl.className = "instinct-settings-page";
	}
	display() {}
}

export class Notice {
	constructor(message) {
		this.message = message;
		Notice.shown.push(String(message));
	}
	hide() {}
}
Notice.shown = [];

export class Plugin {}
export class Component {}
