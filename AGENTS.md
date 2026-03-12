# AGENTS.md

## Project

- Name: `build-sha-sync-ui`
- Type: static frontend app (no backend)
- Purpose: update `BUILD_SHA` across `.env` files in `CATAPA-APPS-STATE` using selected source commit from `CATAPA-EXTENSION` or `CATAPA-WEB`

## Stack

- HTML: `index.html`
- CSS: `styles.css`
- JavaScript: `app.js`
- Local dev: `live-server` via `npm run dev`

## Local Commands

- Install dependencies: `npm install`
- Hot reload dev server: `npm run dev`
- Static server without reload: `npm run serve`
- Syntax check: `node --check app.js`

## App Behavior

- Access gate is enforced at app bootstrap in `app.js`.
- Source commit selection loads commits from source repo/branch.
- Preview and Apply flows compute/update `BUILD_SHA` for matching env files.
- Apply writes one atomic commit via GitHub Git Data API.
- Modes:
  - `pr`: create branch + PR
  - `commit`: direct branch update (extra confirmation on protected branches)

## Editing Rules

- Keep app frontend-only.
- Keep token handling client-side and memory-only.
- Preserve atomic commit update logic (do not revert to multi-commit per-file writes).
- Keep existing file matching behavior:
  - `.env`, `*.env`, `*.env.*`
  - scope filtering by `/dev/`, `/demo/`, `/prod/`, or all

## Verification Checklist

- Run `node --check app.js`.
- Ensure local server responds at `http://127.0.0.1:4173`.
- Verify:
  - commit list loads from chosen source branch
  - theme toggle works and persists
  - preview/apply still work for both PR and direct commit modes
