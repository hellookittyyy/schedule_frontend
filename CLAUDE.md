# schedule_frontend

Static frontend for the schedule system: plain HTML + vanilla JS + CSS, **no build step, no npm**. The backend lives in the sibling repo `../schedule_backend` (see `../CLAUDE.md` for how the two fit together).

## Run locally

```powershell
py scripts/dev-server.py
```

- Serves the repo root at `http://localhost:5500/` with `Cache-Control: no-store`. Use this one rather than `py -m http.server`, which lets the browser cache old files.
- `.claude/launch.json` has two configs: `static` (this server) and `backend` (the Django server from `../schedule_backend`, port 8000).
- Most pages need the backend running: on `localhost`, `assets/js/api.js` calls `http://127.0.0.1:8000/api`.

## Required after every CSS/JS change

Every local CSS/JS URL in the pages carries a content hash (`?v=xxxxxxxx`). After changing any `.css`/`.js`, before committing:

```powershell
py scripts/version-assets.py
```

`py scripts/version-assets.py --check` only checks. The pre-commit hook in `.githooks/` runs the check and blocks the commit if hashes are stale (enabled in this clone; a fresh clone needs `git config core.hooksPath .githooks`).

## Layout

- `index.html`: public schedule page (`?g=<group>`, `?t=<teacher>`).
- `admin/<section>/`: admin pages, one folder per section (`index.html` + `<section>.js`).
- `assets/css/`: `tokens.css` (colours, spacing, themes), `base.css`, `components.css`, `shell.css` (`sh-` prefix), `pages/*.css`.
- `assets/js/`: shared modules `api.js`, `ui.js`, `shell.js`, `icons.js`, `master-detail.js`, `checks.js`, `theme-boot.js`.
- `design/`: mockups and design explorations (reference only, not app code). The approved design is `design/final/mosaic.html`.
- `docs/design-system.md`: the source of truth for the UI (Mosaic). Read it before UI work.

## UI rules (Mosaic, short version)

Details are in `docs/design-system.md` and `docs/plans/0001-mosaic-redesign.md` §2.
- Directories use list + detail (master–detail). No modals for create/edit; use inline confirm (`UI.confirmInline`) for deletes.
- Colours only from `tokens.css`. Both light and dark themes must work. No emoji, gradients, pill badges or uppercase micro-labels.
- Absolute paths (`/admin/...`, `/assets/...`) are fine: the site is served from the server root.
- Desktop only for now.
- UI text is Ukrainian.

## Checking changes

There are no automated tests. After changing a page, go through the relevant part of `docs/regression-checklist.md` in the browser against the local backend, and check the console for errors.

Manual test cases for the user, in plain Ukrainian: `docs/test-cases.md` (source) → `docs/test-checklist.html` (interactive checklist + bug log, state in localStorage). After editing the cases, run `py scripts/build-test-checklist.py` to refresh the HTML; keep case IDs unique, since saved marks are keyed by them.

## Git and deploy

- **A push to `main` deploys to production** (`.github/workflows/deploy.yml`: SSH, `git reset --hard`). The whole repo is served, including `design/` and `docs/`. Never push to `main` without the user's explicit go-ahead.
- Commit style: conventional commits (`feat: ...`, `fix(scope): ...`, `docs(plan): ...`).

## Plans

Plans live in `docs/plans/NNNN-short-name.md` (numbered per repo). Each one has a header table (Status, Baseline, Scope). Keep the Status line current. Backend work that a frontend plan needs goes in a backend plan (`../schedule_backend/docs/plans/`) that links back here.
