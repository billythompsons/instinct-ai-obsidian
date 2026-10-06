# Submission runbook — Instinct AI → Obsidian community plugins

Target: listing at https://obsidian.md/plugins?id=instinct-ai
Repo (public, MIT — community plugins MUST be open-source): `billythompsons/instinct-ai-obsidian`

> This runbook is written for a human or a browser-capable parent agent.
> The subagent that prepared the repo cannot sign in or submit anything.

## 0. Preconditions

- [ ] Repo pushed to GitHub as **public** `billythompsons/instinct-ai-obsidian`
      (private repos are rejected by the review).
- [ ] `FREEMIUS_PRODUCT_ID` in `src/licensing.ts` is set to the real product
      ID (currently `0` = placeholder → upgrade link falls back to GitHub).
      Rebuild + re-release after changing it.
- [ ] The shared backend (`instinct-api`) is live at the default URL shipped
      in `src/settings.ts` (`DEFAULT_BACKEND_URL`), or the URL is updated
      before release.
- [ ] `manifest.json` version matches the release tag (currently `1.0.0`).

## 1. Cut the GitHub release

1. `npm run build` — produces the production `main.js` (already committed;
   rebuild to be sure it's current).
2. Commit anything pending; tag: `git tag 1.0.0 && git push origin 1.0.0`
   (push commands below — needs credentials the subagent doesn't have).
3. GitHub → **Releases → Draft a new release** → tag `1.0.0`, title `1.0.0`.
4. Attach **exactly** these three files (the review bot checks for them):
   - `main.js`
   - `manifest.json`
   - `styles.css`
5. Release notes: copy the "Features" + "Pricing" sections from README.md.
6. Publish the release.

## 2. Submit to the community plugin directory

1. Fork https://github.com/obsidianmd/obsidian-releases.
2. Edit `community-plugins.json`: append, keeping alphabetical order by `name`:
   ```json
   {
     "id": "instinct-ai",
     "name": "Instinct AI",
     "author": "Instinct",
     "description": "Ask questions about your vault, summarize notes, and transcribe voice notes with Instinct AI (Qwen3 + Whisper).",
     "repo": "billythompsons/instinct-ai-obsidian"
   }
   ```
   (`description` must match `manifest.json` verbatim.)
3. Open a PR against `obsidianmd/obsidian-releases:main` titled
   `Add plugin: Instinct AI`. The repo's PR template asks for the plugin ID
   and a confirmation that the release assets exist — fill both in.
4. Wait for the automated checks (release assets present, manifest valid),
   then human review. Typical turnaround: a few days to two weeks.
   Review feedback arrives as PR comments — address, re-release if needed.

## 3. After acceptance

- The plugin appears in-app under **Settings → Community plugins → Browse**
  within ~1 hour of merge.
- Subsequent versions: bump `manifest.json` version + `package.json`,
  create a new GitHub release with the same three assets; the directory
  picks it up automatically (no new PR needed).

## Push commands (for the parent agent — subagent has no credentials)

```bash
cd ~/workspace/goals/instinct-ai-suite-publish-on-10-marketplaces/repos/instinct-ai-obsidian
git remote add origin git@github.com:billythompsons/instinct-ai-obsidian.git
git push -u origin main
git push origin 1.0.0
```

## Open blockers / notes

- Freemius product ID placeholder (`0`) — parent creates the product in the
  Freemius dashboard, then set `FREEMIUS_PRODUCT_ID` and cut release `1.0.1`.
- Backend base URL default (`https://api.instinct-ai.example.com`) must be
  replaced with the production `instinct-api` URL before the 1.0.0 release
  if it isn't live yet.
- No secrets anywhere in the repo (verified: keys live only in the user's
  local `data.json`, never in source).
