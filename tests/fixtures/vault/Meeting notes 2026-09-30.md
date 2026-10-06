# Meeting notes 2026-09-30

Attendees: William, Priya, Sam. Topic: Instinct AI Obsidian plugin launch.

## Decisions

- Ship the Obsidian community plugin first; VS Code and the rest follow.
- Pricing ladder locked: Free $0 / Starter $5 / Pro $19 / Team $134 / Enterprise $200 monthly via Freemius.
- Free tier covers summarization only (50 calls/month). Vault Q&A needs Starter; voice notes need Pro.
- All AI through the shared backend — Qwen3 for chat/summarize/embed, whisper-large-v3-turbo for transcription. No Groq anywhere.

## Action items

- [ ] William: create the Freemius product and share the product ID.
- [ ] Priya: draft the community-plugin release notes.
- [ ] Sam: verify the /v1/license/verify endpoint returns plan + features.

## Open questions

Do we need an offline fallback when the backend is unreachable? Tentative
answer: no — surface a clear error with the support address
(instinctapp@outlook.com) instead of a degraded mode.
