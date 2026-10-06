/**
 * "Transcribe voice note" modal: records from the microphone with the
 * browser MediaRecorder API, sends the audio to the Instinct AI backend
 * (/v1/transcribe, whisper-large-v3-turbo), and inserts the transcript at
 * the cursor.
 */

import { App, Modal } from "obsidian";
import { escapeHtml } from "./ui";

export interface TranscriptionResult {
	text: string;
	language: string | null;
}

export class VoiceModal extends Modal {
	private onTranscribe: (audio: Blob) => Promise<TranscriptionResult>;
	private onInsert: (text: string) => void;

	private recorder: MediaRecorder | null = null;
	private stream: MediaStream | null = null;
	private chunks: Blob[] = [];
	private recording = false;
	private timerId: number | null = null;
	private startedAt = 0;

	private statusEl!: HTMLElement;
	private timerEl!: HTMLElement;
	private recordBtn!: HTMLButtonElement;
	private transcriptEl!: HTMLElement;
	private insertBtn!: HTMLButtonElement;
	private lastTranscript = "";

	constructor(
		app: App,
		onTranscribe: (audio: Blob) => Promise<TranscriptionResult>,
		onInsert: (text: string) => void
	) {
		super(app);
		this.onTranscribe = onTranscribe;
		this.onInsert = onInsert;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("instinct-modal");

		contentEl.createEl("h2", { text: "Transcribe voice note" });
		contentEl.createDiv({
			cls: "instinct-modal-sub",
			text: "Record from your microphone. The transcript is inserted at your cursor.",
		});

		const recRow = contentEl.createDiv({ cls: "instinct-voice-row" });
		this.recordBtn = recRow.createEl("button", {
			text: "● Start recording",
			cls: "instinct-btn instinct-btn-record",
		}) as HTMLButtonElement;
		this.recordBtn.addEventListener("click", () => void this.toggleRecording());
		this.timerEl = recRow.createDiv({ cls: "instinct-voice-timer", text: "00:00" });

		this.statusEl = contentEl.createDiv({
			cls: "instinct-voice-status",
			text: "Press Start and speak. Your audio is sent to the Instinct AI backend for transcription only.",
		});

		this.transcriptEl = contentEl.createDiv({
			cls: "instinct-result instinct-empty",
			text: "Your transcript will appear here.",
		});

		const btnRow = contentEl.createDiv({ cls: "instinct-btn-row" });
		this.insertBtn = btnRow.createEl("button", {
			text: "Insert at cursor",
			cls: "instinct-btn instinct-btn-cta",
		}) as HTMLButtonElement;
		this.insertBtn.disabled = true;
		this.insertBtn.addEventListener("click", () => {
			if (!this.lastTranscript) return;
			this.onInsert(this.lastTranscript);
			this.close();
		});
	}

	private setStatus(text: string, kind: "info" | "error" = "info"): void {
		this.statusEl.setText(text);
		this.statusEl.toggleClass("instinct-voice-status-error", kind === "error");
	}

	private async toggleRecording(): Promise<void> {
		if (this.recording) {
			this.stopRecording();
			return;
		}
		if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
			this.setStatus("Microphone capture isn't available in this environment.", "error");
			return;
		}
		if (typeof MediaRecorder === "undefined") {
			this.setStatus("MediaRecorder isn't available in this environment.", "error");
			return;
		}
		try {
			this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch {
			this.setStatus("Microphone access was denied. Allow microphone access and try again.", "error");
			return;
		}
		this.chunks = [];
		try {
			this.recorder = new MediaRecorder(this.stream);
		} catch {
			this.setStatus("Could not start the recorder on this device.", "error");
			this.stopStream();
			return;
		}
		this.recorder.ondataavailable = (e: BlobEvent) => {
			if (e.data && e.data.size > 0) this.chunks.push(e.data);
		};
		this.recorder.onstop = () => void this.finishRecording();
		this.recorder.start();
		this.recording = true;
		this.startedAt = Date.now();
		this.recordBtn.setText("■ Stop recording");
		this.recordBtn.addClass("instinct-recording");
		this.setStatus("Recording… press Stop when you're done.");
		this.timerId = window.setInterval(() => this.tickTimer(), 500);
	}

	private tickTimer(): void {
		const secs = Math.floor((Date.now() - this.startedAt) / 1000);
		const mm = String(Math.floor(secs / 60)).padStart(2, "0");
		const ss = String(secs % 60).padStart(2, "0");
		this.timerEl.setText(`${mm}:${ss}`);
	}

	private stopRecording(): void {
		if (this.timerId !== null) {
			window.clearInterval(this.timerId);
			this.timerId = null;
		}
		this.recording = false;
		this.recordBtn.setText("● Start recording");
		this.recordBtn.removeClass("instinct-recording");
		try {
			this.recorder?.stop();
		} catch {
			this.finishRecording();
		}
	}

	private async finishRecording(): Promise<void> {
		this.stopStream();
		const type = this.recorder?.mimeType || "audio/webm";
		const audio = new Blob(this.chunks, { type });
		this.recorder = null;
		if (audio.size === 0) {
			this.setStatus("No audio was captured. Try recording again.", "error");
			return;
		}
		this.setStatus("Transcribing…");
		this.recordBtn.disabled = true;
		try {
			const result = await this.onTranscribe(audio);
			this.lastTranscript = result.text;
			this.transcriptEl.removeClass("instinct-empty");
			this.transcriptEl.innerHTML =
				(result.language ? `<div class="instinct-lang">Detected language: ${escapeHtml(result.language)}</div>` : "") +
				`<p>${escapeHtml(result.text)}</p>`;
			this.insertBtn.disabled = false;
			this.setStatus("Transcript ready. Insert it at your cursor, or record again.");
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.setStatus(`Transcription failed: ${message}`, "error");
		} finally {
			this.recordBtn.disabled = false;
		}
	}

	private stopStream(): void {
		if (this.stream) {
			for (const track of this.stream.getTracks()) {
				try {
					track.stop();
				} catch {
					// ignore
				}
			}
			this.stream = null;
		}
	}

	onClose(): void {
		if (this.timerId !== null) window.clearInterval(this.timerId);
		if (this.recording && this.recorder) {
			try {
				this.recorder.stop();
			} catch {
				// ignore
			}
		}
		this.stopStream();
		this.contentEl.empty();
	}
}
