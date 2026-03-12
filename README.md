# BUILD_SHA Sync UI (BYO Token)

Static web app for laptop/mobile that updates `BUILD_SHA` across `.env` files in `CATAPA-APPS-STATE` using a selected 7-digit commit SHA from `CATAPA-EXTENSION` or `CATAPA-WEB`.

## Why this setup

- No backend required (GitHub Pages works)
- BYO token means each user uses their own access
- Works on phone and desktop browsers

## Run locally

Use an HTTP server (not `file://`) to avoid browser CORS/module restrictions.

```bash
cd /home/james/Documents/github/build-sha-sync-ui
npm install
npm run dev
```

Then open `http://127.0.0.1:4173`.

`npm run dev` enables hot reload for `index.html`, `styles.css`, and `app.js`.
If you only want a simple static server without reload, use `npm run serve`.

## Deploy (GitHub Pages)

1. Push this folder to a repository.
2. Enable GitHub Pages for that repository.
3. Open the Pages URL on laptop/mobile.

## Required token permissions

Use a Fine-grained Personal Access Token with repository access:

- `GDP-ADMIN/CATAPA-EXTENSION` (read)
- `GDP-ADMIN/CATAPA-WEB` (read)
- `GDP-ADMIN/CATAPA-APPS-STATE` (write)

Repository permissions:

- Contents: Read and write
- Pull requests: Read and write (only needed for PR mode)

Prefilled token link (fine-grained PAT):

- `https://github.com/settings/personal-access-tokens/new?name=CATAPA+BUILD_SHA+Sync&description=Sync+BUILD_SHA+and+optionally+create+PRs&target_name=GDP-ADMIN&expires_in=30&contents=write&pull_requests=write`
- This pre-fills name, description, owner, expiration, and permissions.
- You still need to choose repository access manually (for example: `CATAPA-EXTENSION`, `CATAPA-WEB`, `CATAPA-APPS-STATE`).

If your organization uses SSO enforcement, authorize the token for the org.

## App flow

1. Set source repo + branch.
2. Source commits auto-refresh when source branch changes.
3. Click **Reload branch commits** manually if you want to force refresh.
4. Select a specific source commit (optional).
5. Set target group + env scope.
6. Click **Preview changes**.
7. Click **Apply**.

Repo/group options:

- Click **Refresh repo/group from API** to load source repo list and target groups dynamically from GitHub.

DX shortcuts:

- `Ctrl+Enter` (or `Cmd+Enter`) submits **Apply**
- Dark mode is always on
- After **Preview**, choose exact target files in **Files to update**
- Use file filter + select all/none to manage long env file lists quickly

Modes:

- **Create PR (recommended)**: creates `sync/build-sha-<sha>-<timestamp>` branch and opens a PR.
- **Direct commit**: one atomic commit to target branch (with extra confirmation on `main`/`master`).
- **Cherry-pick commit**: replays one selected commit from source branch onto target branch (source and target must be the same repo).
- **YOLO mode**: skips mixed-scope and protected-branch confirmation prompts for direct commit and cherry-pick (high risk).

Commit message template:

- Customize in **Advanced repo owner settings -> Commit message format**
- Default template: `ci(scope): {commit_sha_7_digit} to dev`
- Supported placeholders:
  - `{commit_sha_7_digit}`
  - `{shortSha}`
  - `{sourceRef}`
  - `{scope}` (auto-detected from selected files: `dev`, `demo`, `prod`, `mixed`, or `all`)
  - `{sourceOwner}` `{sourceRepo}` `{sourceBranch}`
  - `{targetGroup}` `{envScope}` `{targetRepo}` `{targetBranch}`

## Matching rules

- Targets files named `.env`, `*.env`, `*.env.*`
- Scope filtering checks path segment: `/dev/`, `/demo/`, `/prod/`
- Scope `auto` lets the tool infer scope from selected files for commit messaging
- Updates first matching line:
  - `export BUILD_SHA=...`
  - or `BUILD_SHA=...`
- Appends `export BUILD_SHA=<sha>` if missing

## Security notes

- Token is never sent anywhere except `api.github.com`.
- Token is stored in `sessionStorage` for active-tab convenience.
- Optional checkbox allows device persistence in `localStorage` (less secure) with 14-day expiry.
- Use **Clear token** anytime to remove saved token state.
- Keep **YOLO mode** off for production unless you fully trust your branch/repo inputs.
- Page includes a strict CSP and no third-party scripts.
- Apply uses an atomic Git Data API commit to avoid partial multi-file updates.
