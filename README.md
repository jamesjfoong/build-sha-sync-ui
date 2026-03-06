# BUILD_SHA Sync UI (BYO Token)

Static web app for laptop/mobile that updates `BUILD_SHA` across `.env` files in `CATAPA-APPS-STATE` using the latest 6-digit commit SHA from `CATAPA-EXTENSION` or `CATAPA-WEB`.

## Why this setup

- No backend required (GitHub Pages works)
- BYO token means each user uses their own access
- Works on phone and desktop browsers

## Run locally

Open `index.html` in a browser, or serve the folder with any static server.

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

If your organization uses SSO enforcement, authorize the token for the org.

## App flow

1. Set source repo + branch.
2. Set target group + env scope.
3. Click **Preview changes**.
4. Click **Apply**.

Modes:

- **Create PR (recommended)**: creates `sync/build-sha-<sha>-<timestamp>` branch and opens a PR.
- **Direct commit**: one atomic commit to target branch (with extra confirmation on `main`/`master`).

## Matching rules

- Targets files named `.env`, `*.env`, `*.env.*`
- Scope filtering checks path segment: `/dev/`, `/demo/`, `/prod/`
- Updates first matching line:
  - `export BUILD_SHA=...`
  - or `BUILD_SHA=...`
- Appends `export BUILD_SHA=<sha>` if missing

## Security notes

- Token is never sent anywhere except `api.github.com`.
- Token is in-memory only; this app does not persist it.
- Page includes a strict CSP and no third-party scripts.
- Apply uses an atomic Git Data API commit to avoid partial multi-file updates.
