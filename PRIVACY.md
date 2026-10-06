# Privacy Policy — Instinct AI for Obsidian

**Last updated:** 2026-10-05
**Contact:** instinctapp@outlook.com

## Summary

Instinct AI is an AI assistant for your Obsidian vault. All AI processing
happens on the Instinct AI backend (`instinct-api`); the plugin sends note
content to that backend only when you explicitly invoke a feature.

## What is collected and why

| Data | When | Why |
|---|---|---|
| Note text you summarize | You run **Summarize active note** | Sent to `/v1/summarize` to produce the summary |
| Your question + retrieved note chunks | You run **Ask Instinct AI about your vault** | Sent to `/v1/embed` (question) and `/v1/chat` (question + chunks) to generate a cited answer |
| Voice recording | You run **Transcribe voice note** and press record | Sent to `/v1/transcribe` for Whisper transcription |
| Product API key, license key | You save settings / activate | Authenticated requests (`Authorization: Bearer`, `X-License-Key`) |
| Feature usage counts | After each AI call | Sent to `/v1/usage` for quota accounting |

## What stays on your device

- The **vault index** (note chunks + embeddings) is cached in the plugin's
  local `data.json` inside your Obsidian configuration folder. It never
  leaves your device except as described above.
- Settings (backend URL, keys, plan, quota counters) are stored locally in
  the same `data.json`.

## What is NOT collected

- No analytics, telemetry, or tracking SDKs.
- No account creation inside the plugin.
- Your vault is never uploaded wholesale — only the chunks retrieved for a
  specific question, or the note you chose to summarize, are transmitted.

## Third parties

Requests go only to the configured Instinct AI backend URL. The backend
runs Qwen3 (chat/summarize/embed) and whisper-large-v3-turbo (transcribe).
License keys are validated via Freemius-linked verification on the backend.

## Your control

- Don't want a feature to send data? Don't invoke it — nothing is sent
  in the background.
- Delete the plugin folder (`<vault>/.obsidian/plugins/instinct-ai/`) to
  remove all local data, including the cached index and keys.
- Questions: instinctapp@outlook.com.
