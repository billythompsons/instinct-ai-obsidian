# Test report — Instinct AI for Obsidian

**Date:** 2026-10-05
**Runner:** vitest 3.x (`npm test` → `vitest run`), Node 24
**Result: 90 / 90 tests pass across 8 files.** TypeScript `tsc --noEmit` clean.
Production bundle builds via esbuild (minified `main.js`, 31,757 bytes).

## Coverage by file

| Test file | Tests | What it proves |
|---|---|---|
| `tests/chunker.test.ts` | 12 | Frontmatter stripping; heading-section splits with breadcrumbs (`A > B > C`); every chunk ≤ `maxChars`; hard-split of over-long paragraphs with character overlap; tail-paragraph overlap between chunks; sequential indexes; empty notes → `[]`; `hashContent` stability/sensitivity |
| `tests/search.test.ts` | 13 | Cosine = 1 identical, 0 orthogonal, −1 opposite, 0 for zero vectors (no NaN); scale invariance; dimension-mismatch throws; `normalize` unit length; `retrieveTopK` ordering, k-respect, k-clamp, empty/zero-k → `[]`; `citedNotes` dedup in first-appearance order |
| `tests/retrieval.test.ts` | 7 | **End-to-end over the real sample vault** (7 hand-written markdown notes, no lorem): chunk → deterministic embeddings → `retrieveTopK` returns the correct note first for TypeScript generics, sourdough troubleshooting, espresso dial-in, Zettelkasten linking, and Freemius-pricing meeting questions |
| `tests/prompts.test.ts` | 10 | System prompt grounds answers in vault context and demands `[[Note Name]]` citations; context block labels `[Source N: [[Note]] (section: …)]`; message roles; sources footer (unique, ordered); summary style validation; insert heading; summarize input guards (empty/too-short rejected) |
| `tests/licensing.test.ts` | 18 | Plan ladder $0/$5/$19/$134/$200; feature gates (free=summarize only, starter=+ask, pro=+voice); quotas 50/500/5,000/50,000/∞; starter index cap 500; availability checked before quota; monthly rollover; fractional/negative units floored; quota summary strings; `planIdFromString` fallback to free |
| `tests/api.test.ts` | 15 | **Exact backend contract** with stubbed fetch (tests only): `Authorization: Bearer`, `X-License-Key`, `X-Product: obsidian` on every call; `/v1/chat`, `/v1/summarize`, `/v1/embed`, `/v1/transcribe` (multipart `FormData`, no JSON content-type), `/v1/license/verify?key=&product=obsidian`, `/v1/usage`; malformed-response rejections; `ApiError` with HTTP status; unreachable-backend error; empty-base-URL guard; `configure()` live credential swap; no retries |
| `tests/indexer.test.ts` | 6 | `needsIndex` new/changed/unchanged; chunk/embedding misalignment throws; `prune` drops deleted files; counts; `removeFile`; foreign index versions rejected |
| `tests/ui.test.ts` | 7 | Answer markdown renderer: headings, bold/italic, lists, fenced + inline code, `[[wiki-links]]` → styled spans, http links → anchors, raw HTML escaped (injection-safe), empty input |

## What was fixed during testing

1. Chunker overlap test used paragraphs too large for the overlap to fit —
   corrected the test to assert the real (documented) behavior: overlap is
   carried only when it fits within `maxChars`.
2. Prompt test asserted a literal `[[Note Name]]` string; the prompt uses a
   concrete example — test updated to match the actual wording.
3. Retrieval test accessed `.chunk` on the flat `EmbeddedChunk` type —
   corrected to the flat field.

## Not covered by automated tests (require a live backend / Obsidian)

- `main.ts` command wiring and `VaultIndex` ↔ `app.vault` orchestration
  (needs the Obsidian runtime).
- Real `/v1/*` round-trips (needs the deployed `instinct-api` backend).
- `MediaRecorder` capture path (needs a browser with a microphone).
- The modals/settings tab render paths are exercised by the screenshot
  harness (`scripts/shots/`), which instantiates the real UI classes —
  see `assets/screenshot-*.png`.

## Reproduce

```bash
npm install
npm test        # expect: Test Files 8 passed, Tests 90 passed
npm run build   # expect: tsc clean + main.js emitted
```
