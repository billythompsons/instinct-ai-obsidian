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

> **2026-10-07 CORRECTION — the PR route is DEAD.** `obsidianmd/obsidian-releases`
> has pull requests disabled (verified live: compare page shows "An owner of this
> repository has disabled the ability to open pull requests"). Do NOT fork, do NOT
> hand-edit `community-plugins.json`, do NOT open a PR — the directory writes that
> file itself now. The stale fork branch `billythompsons/obsidian-releases@add-instinct-ai-plugin`
> is obsolete (leave the fork alone; deleting is optional cleanup).
>
> Submission is via the developer dashboard at **https://community.obsidian.md**
> (ref: https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin):
>
> 1. Sign in with an Obsidian account (create one if needed).
> 2. Link the GitHub account that owns the repo (`billythompsons`) — this is how
>    the directory verifies repo ownership.
> 3. **Plugins → New plugin** → enter the repository URL
>    `https://github.com/billythompsons/instinct-ai-obsidian`.
> 4. Review and agree to the developer policies, confirm ongoing support → **Submit**.
>
> What the portal reads: `manifest.json` at the **HEAD of the default branch**
> (must be correct and pushed), then `main.js` / `manifest.json` / `styles.css`
> from the GitHub release whose **tag exactly matches the manifest version —
> NO `v` prefix** (e.g. tag `1.0.0` for version `1.0.0`).
>
> Automated review runs in minutes (Manifest / Releases / Source code / Build
> verification → Error, Warning, Recommendation, Pass). Errors block listing;
> warnings don't. Feedback is addressed by pushing a NEW release (bumped
> version), not by editing anything in the directory.

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

- ~~PR creation BLOCKED 2026-10-07 ~13:45 HST~~ — SUPERSEDED 2026-10-07 ~14:00 HST:
  the PR route itself is dead (repo disabled PRs); submission is via
  https://community.obsidian.md per §2 above. The fork branch
  `billythompsons/obsidian-releases@add-instinct-ai-plugin` is obsolete.
- Release tag rule: tag must EXACTLY match `manifest.json` version — NO `v`
  prefix. 2026-10-07: duplicate `v1.0.0` release deleted; canonical release is
  tag `1.0.0` (marked Latest, 3 assets attached).
- ~~Freemius product ID placeholder~~ — RESOLVED 2026-10-07: `FREEMIUS_PRODUCT_ID`
  = `40900` (verified live in D1); checkout URL wired in settings.
- ~~Backend base URL default~~ — RESOLVED 2026-10-07: `DEFAULT_BACKEND_URL` is
  `https://instinct-api.patricialgilbertmark.workers.dev`, and the live
  backend was smoke-tested (POST /v1/summarize returned a real summary;
  GET /v1/license/verify returns the expected shape).
- No secrets anywhere in the repo (verified: keys live only in the user's
  local `data.json`, never in source).
