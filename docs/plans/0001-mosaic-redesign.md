# 0001 — Full redesign to «Мозаїка» (Mosaic)

| | |
|---|---|
| Status | Done 2026-11-19 — phases 0–9 implemented on `main` (not pushed, not deployed); desktop only by user decision |
| Date | 2026-11-19 |
| Baseline | frontend `b5b7c2c` + uncommitted `admin/semesters/*` (branch `fix-change-semestr`); backend `2b6cd1a` + untracked data migration `0020_add_class_types.py` |
| Design source | [design/final/mosaic.html](../../design/final/mosaic.html) (the approved screens), [design/final/pages/mosaic.css](../../design/final/pages/mosaic.css) (extracted styles, **not yet verified against the mockup**, see phase 1), [design/final/tokens.css](../../design/final/tokens.css) |
| Scope | Every page in `admin/` plus the public page `index.html` |
| Out of scope | Backend changes (listed separately as dependencies), the schedule workspace v3, the lab assistant view, Ctrl+K |

---

## 1. Goal

Rebuild the whole frontend in the chosen **Mosaic** visual language and in the approved UX structure, without breaking any existing feature or URL.

Mosaic in one paragraph: «Чорнило» forms (Commissioner font, 12px radius, thin borders, dark menu column + light work area), a neutral near-black accent for buttons, and **6 colours** (`--c1…--c6`: coral, butter, mint, lilac, pink, lime) used only as identity: one per menu section (assigned explicitly, see §4), pastel tints for blocks, a butter hero. Light and dark themes, toggled in the top bar and remembered. No emoji, no gradients, no pill badges, no uppercase micro-labels.

## 2. Decisions that are already fixed (do not reopen)

1. **UX structure** (approved 2026-11-19):
   - «Головна» is an entry point, not an error list: how the system works (dismissible), semester stage progress with one «Наступний крок», blockers line + nearest dates, «Ресурси семестру» (4 tiles), «Останні зміни». No quick-action tiles (they duplicate the menu), no «Тиждень» chart, no «Сьогодні» block.
   - «Задачі» is its own screen; home shows one compact line linking to it.
   - Directories use **list + detail** (master–detail), **no modals** for create/edit.
   - Semester page: step checklist + «Передперевірка» (preflight).
   - Public page: one search, `/g/<group>`-style links (implemented as `?g=` query links, since static hosting has no URL rewrites), remembered «мій розклад», «зараз / далі» card.
2. **Visual**: Mosaic palette, both themes, contrast already verified (body text ≥ 8.7:1, secondary ≥ 4.5:1). Any new colour pair must be checked to the same bar.
3. **Tech stays the same**: static HTML + vanilla JS + CSS, no build step, served as-is by the SSH deploy in `.github/workflows/deploy.yml` (on push to `main`, the server resets to `origin/main`, so the **whole repo** is served, including `design/` and `docs/`). Existing URLs (`/admin/teachers/` etc.) keep working.
4. **Hosting**: the site is served only from the server root. The GitHub Pages address in `README.md` (`hellookittyyy.github.io/schedule_frontend/`) is **not used** and is removed from the README (phase 9). Absolute paths (`/admin/...`, `/assets/...`) are therefore allowed.
5. **External dependency**: Commissioner is loaded from Google Fonts (`fonts.googleapis.com`), with `system-ui` as fallback.

## 3. Current state (what we are replacing)

At baseline `b5b7c2c` plus the uncommitted semester work.

| Page | Files | Today | API |
|---|---|---|---|
| Dashboard | `admin/index.html`, `script.js`, `dashboard.css` | 6 counters + current semester + calendar | `/stats/`, `/semesters/` |
| Семестри | `admin/semesters/index.html`, `semester.js`, `semester.css` | Table + 2 modals (edit, delete) + a 3rd «⚠️ Увага!» modal in the uncommitted work; native `confirm()` for «set current» and «generate» | `/semesters/`, `set_current`, `/generate-schedule/` |
| Семестр (деталі) | `admin/semesters/detail.html`, `semester-detail.*` | Info, stats, generation settings, timeslot calendar + side panel; opened as `detail.html?id=N` | `/semesters/{id}/`, `/slots/`, `/timeslots/` |
| Предмети | `admin/subjects/*` (`subjects.css` is empty) | Table + 2 modals | `/subjects/` |
| Викладачі | `admin/teachers/*` | Table + 2 modals, subject assignment | `/teachers/`, `manage_subjects` |
| Групи | `admin/groups/*` (no CSS file) | Table + 2 modals | `/groups/` |
| Потоки | `admin/streams/*` | Table + modals | `/streams/` |
| Аудиторії | `admin/rooms/*` | Table + 3 modals (room, delete, room types) | `/rooms/`, `/room_types/` |
| Навчальні плани | `admin/study-plans/*` | Table + semester filter + modals | `/study_plans/`, `/class_types/` |
| Обмеження | `admin/constraints/*` | Table + modal with category → type cascade | `/semester_constraints/` |
| Розклад | `admin/schedule/*` | Interactive week grid, drag & drop | `/lessons/`, `/timeslots/` |
| Публічна | `index.html`, `js/main.js`, `css/main.css` | Form (teacher/group/course/dates) → results | `/groups/`, `/teachers/`, `/semesters/`, `/lessons/` |

Shared today: `admin/common.js` (API base, `apiRequest`, modal/toast/loading helpers), `admin/sidebar.js` (emoji menu), `admin/shared.css`. `js/main.js` duplicates the API base logic under another name (`API_BASE` vs `API_BASE_URL`). All CSS together is about 2,400 lines (`shared.css`, `dashboard.css`, `css/main.css` and 9 per-page files).

All scripts are **classic scripts** (plain `<script src>`, sharing global names, no `import`). Pages call functions through 66 inline `onclick=` attributes in HTML and 24 more in JS-generated markup, so these functions must stay global.

## 4. Target architecture

```
assets/
  css/
    tokens.css        ← Mosaic tokens only (light + dark), from the token block of mosaic.css
    base.css          ← reset, typography, utilities  (mosaic.css: base)
    components.css    ← buttons, fields, chips, badges, cards, tables, progress,
                        hint, toast, empty/loading, master–detail, avail grid
                        (mosaic.css sections + design/ui-kit, re-tokenised)
    shell.css         ← app grid, nav, topbar, responsive rules; every class prefixed `sh-`
    pages/            ← only what is truly page-specific (home, semester, schedule, public)
  js/
    api.js            ← single API base + apiRequest (replaces the copies in common.js + main.js)
    ui.js             ← toast (with undo), inline confirm, loading/empty/error states,
                        drawer, escapeHtml; keeps showToast/showModal aliases during migration
    icons.js          ← one inline SVG sprite (replaces emoji)
    shell.js          ← renders nav + topbar, theme toggle (localStorage), active item
    master-detail.js  ← generic list + detail controller used by all directories
    checks.js         ← preflight checks shared by semester, home and tasks (phase 4)
    theme-boot.js     ← tiny inline-able script that sets data-theme before paint
```

Rules:
- **Classic scripts only, no `import`/`type="module"`.** Each file attaches what it exposes to `window` (or declares globals), and pages load them in order: `api.js` → `ui.js` → `icons.js` → `shell.js` → page script. A global name is declared in exactly one file: when `api.js` lands, the `API_BASE_URL` / `API_BASE` declarations are deleted from `admin/common.js` and `js/main.js` in the same commit (a second top-level `const` with the same name stops the whole later script from running).
- Pages contain markup + one page script; **no per-page colour values**, only tokens.
- `tokens.css` uses the selector form of `mosaic.css` (`:root` / `html[data-theme="light"], html:not([data-theme])` / `html[data-theme="dark"]`), with no `data-palette` attribute, so colours apply even before `theme-boot.js` runs.
- `admin/common.js`, `admin/sidebar.js`, `admin/shared.css` and per-page CSS are deleted at the end of migration (phase 9), not before.
- `design/` stays as the reference; production code never imports from `design/`. Note that `design/` is publicly served once committed (see §2.3).

### Navigation (Mosaic, explicit colour per item)

Each nav item sets its colour with an inline `--c` (the hook `.nav-item .icon{color:var(--c)}` already exists in `mosaic.css:68`). The mockup's `nth-child(6n+k)` rule is **not** used: it counts per group, and the group label counts too, so colours repeat unpredictably (in the mockup Задачі, Викладачі and Навчальні плани all come out butter).

| # | Item | URL | Colour | Notes |
|---|---|---|---|---|
| 1 | Головна | `/admin/` | `--c2` butter (matches the butter hero) | new start screen |
| 2 | Задачі | `/admin/tasks/` | `--c1` coral | **new page** |
| 3 | Семестр | `/admin/semesters/` → current semester | `--c3` mint | list of semesters reachable from here |
| — | *Довідники* (group label) | | | |
| 4 | Викладачі | `/admin/teachers/` | `--c4` lilac | |
| 5 | Групи | `/admin/groups/` | `--c5` pink | |
| 6 | Потоки | `/admin/streams/` | `--c6` lime | |
| 7 | Аудиторії | `/admin/rooms/` | `--c1` coral | room types live inside, no modal |
| 8 | Предмети | `/admin/subjects/` | `--c3` mint | |
| — | *Планування* (group label) | | | |
| 9 | Навчальні плани | `/admin/study-plans/` | `--c4` lilac | |
| 10 | Обмеження | `/admin/constraints/` | `--c5` pink | |
| 11 | Розклад | `/admin/schedule/` | `--c2` butter | |

11 items and 6 colours means 5 colours are used twice; the table keeps each repeated pair in different groups and never adjacent. The same colour is reused as the page's identity (active nav mark, page hero/tint) so a section always «feels» the same. The active mark in the mockup is always `--c2`; using the section colour instead is a new pair (each `--c1…--c6` as a 2px mark on `--nav-bg`), so its contrast is checked in phase 1 (≥ 3:1 for non-text marks).

## 5. Phases

Each phase ends in a working app on `redesign/mosaic` (deploy happens only from `main`). Old and new pages can coexist because the new shell is loaded per page.

### Phase 0 — Prep (½ day)
- Merge or park the open work on `fix-change-semestr` (uncommitted changes in `admin/semesters/*`, which add the «⚠️ Увага!» edit-confirm modal) so the redesign starts from a clean `main`. Phase 4 depends on this being merged.
- Create branch `redesign/mosaic`.
- Commit `design/` **and** `docs/` (both untracked today) on that branch; phase 1 ports from `design/`, so it must be in git before anything else.
- Add a short `docs/design-system.md` pointing to tokens and components.
- Smoke-test checklist of every current feature (CRUD per entity, set current semester, edit semester with existing schedule, generate, drag & drop in schedule, public search). This is the regression list for all later phases.

**Done when:** clean branch with `design/` and `docs/` committed, regression checklist written.

### Phase 1 — Design system in code (1–2 days)
- **First, verify the source.** `mosaic.css` is not linked from any page; the approved screens are `mosaic.html` with its own embedded styles, and the two already differ (e.g. `.btn` layout, `mosaic.css:106` vs `mosaic.html:67`; «Як працює система» number markers, `mosaic.css:267` vs `mosaic.html:206`). Render the `mosaic.html` screens with `mosaic.css` only, compare side by side with the mockup in both themes, and fix `mosaic.css` until they match.
- Port the token block of `mosaic.css` (light + dark, no `data-palette`) to `assets/css/tokens.css`.
- Split `mosaic.css` into `base.css`, `components.css`, `shell.css` (shell classes prefixed `sh-`); pull missing components from `design/ui-kit` (combobox, drawer, toast with undo, week grid, `UI.dnd`) and rename their `--ui-*` variables to Mosaic tokens.
- Remove the uppercase small labels from `mosaic.css` (`.now-label` at `:448`, `.dw` at `:459`) to follow §1.
- Add a lesson colour for exams (`--exam` / `--exam-soft`): the backend now has a 4th class type «Екзамен» (`0020_add_class_types.py`), and today's schedule only colours lecture/practical/lab (`admin/schedule/schedule.js:226-228`). Contrast-check it like the others.
- Contrast-check the section colours as active nav marks on `--nav-bg` (§4).
- Build `icons.js` sprite from the icons used in `mosaic.html` (`ic()` helper, `mosaic.html:867`) + any needed for old features (import, export, copy, drag).
- `theme-boot.js` sets `data-theme` from localStorage / `prefers-color-scheme` before first paint (no flash).
- A living page `design/system.html` that renders every component from the production CSS in both themes (replaces ui-kit showcase as source of truth).
- Update `design/final/README.md`: its «Наступний крок» step 2 says to move tokens *into* ui-kit `--ui-*` variables, the opposite of this plan; replace it with a pointer to this plan.

**Done when:** `mosaic.css` matches `mosaic.html` screen by screen; `design/system.html` shows all components with the production files, both themes; contrast re-checked for every new pair (exam colour, nav marks).

### Phase 2 — Shell + shared JS (1 day)
- `api.js`: one `API_BASE_URL` (local vs `api.velab.space`), `apiRequest` with consistent error object. Loaded as a classic script before `common.js` / `main.js`; the duplicate declarations are removed from `admin/common.js:1-5` and `js/main.js:11-15` (both also declare `isLocal`) in the same commit.
- `ui.js`: toast, inline confirm (replaces delete modals: «Видалити? Так / Ні» in place, as in the mockup `.danger.is-confirm`), loading / empty / error states.
- `shell.js`: nav (§4), topbar (crumbs, title, page actions slot, theme toggle), mobile behaviour below 980px (nav collapses to a top menu button — the mockup only hides it, we need a real drawer).
- Switch **all** admin pages to the new shell at once (layout + nav only; page bodies still old). This removes the emoji sidebar everywhere in one step. To keep old bodies unchanged:
  - pages load only `tokens.css` + `shell.css` in this phase, **not** `base.css` / `components.css` (those define `.btn`, `.btn-primary`, `.card`, `.badge`, `.form-grid`, `.toast`, which the old CSS also defines in `shared.css` and `rooms.css`); each page gets `components.css` only when its body is rebuilt;
  - rename the old `--accent` in `admin/shared.css` and the per-page CSS to `--old-accent` (old `.btn-edit` etc. use it, `shared.css:119`; the new tokens would otherwise turn it near-black);
  - the shell renders into the existing `#sidebar-container` and sets `--sidebar-width: var(--nav-w)` so the old `.main-content{margin-left:var(--sidebar-width)}` (`shared.css:42-43`) still lines up; the old `.sidebar` rules stop matching because the shell uses `sh-` classes.

**Done when:** every admin page opens in the new shell, nav highlights correctly, theme toggles and persists, no console errors, and **old page bodies look and work as before** (regression checklist + side-by-side screenshot of each page against baseline).

### Phase 3 — Directories, master–detail (3–4 days)
Build `master-detail.js` once, then apply per entity. Pattern from the mockup «Викладачі» screen:
- Left: search, filter chips with counts, grouped rows, «Додати» creates a draft row and opens an empty detail.
- Right: detail with sections, inline-editable fields, autosave + «Збережено» mark, inline danger zone for delete.
- URL keeps the selection (`?id=12`) so a link opens the same record; browser back works.

| Entity | Detail sections | Filter chips | Special |
|---|---|---|---|
| Викладачі | Основне, Предмети (chips + add), Доступність (avail grid), Веде в групах; *Навантаження (progress) — hidden until backend has `max_hours`* | Усі · Без предметів; *Перевантажені — hidden until `max_hours`* | `manage_subjects`; availability grid reads/writes `time_block` constraints (see §6) for the semester shown in the grid header |
| Групи | Основне, Потоки (chips — a group can be in several streams), Навчальний план (link + %), Розклад (link) | Усі · Без плану · за курсом (from `start_year`) | |
| Потоки | Основне, Групи у потоці (chips) | | |
| Аудиторії | Основне, Тип, Місткість, Примітка | by type | «Типи аудиторій» becomes a section/inline list, not a modal; type is required by the backend, so there is no «без типу» state |
| Предмети | Основне, Викладачі, Плани, де використовується | Усі · Без викладача | |

Order: Викладачі (richest, proves the component) → Предмети → Групи → Потоки → Аудиторії.

**Done when:** no modal remains in these 5 pages, all regression CRUD items pass, works at 640px.

### Phase 4 — Семестр (2–3 days)
Depends on phase 0 having merged the `fix-change-semestr` work.
- URLs: `/admin/semesters/?id=N` opens semester N; `/admin/semesters/` without `id` opens the **current** semester, or the semester list if none is current. A compact semester list (`.sem-list`) with «Зробити поточним», create and archive.
- Semester page per mockup: step bar (Календар · Ресурси · Плани · Обмеження · Генерація · Публікація) with status per step, «Передперевірка» card (checks with an action button each), «Навчальні плани по групах» progress, «Історія генерацій» (empty state until first run).
- «Згенерувати» is disabled while blockers exist. Three existing confirmations become inline confirms, each keeping its warning:
  - **edit semester with an existing schedule** (the «⚠️ Увага!» modal, `semester.js:230` in the uncommitted work): says the current schedule will be fully deleted;
  - **generate** (native `confirm()`, `semester.js:259` at HEAD): says what will be overwritten;
  - **set current** (native `confirm()`, `semester.js:77`): says it changes the active schedule for all users.
- `detail.html` content (info, generation settings, timeslot calendar + side panel) moves into the «Календар» step; the side panel becomes a drawer; the slot delete `confirm()` (`semester-detail.js:283`) becomes inline.
- `detail.html?id=N` redirects to `/admin/semesters/?id=N`, keeping the id (old links from `semester.js:62` and bookmarks).
- Preflight checks are computed client-side first from existing endpoints (groups without plan, subjects without teacher, teacher hours vs availability once `max_hours` exists), in `assets/js/checks.js`. See §6.

**Done when:** the full flow «create semester → fill → generate» is possible from this page; old `detail.html?id=N` lands on the same semester.

### Phase 5 — Навчальні плани + Обмеження (2 days)
Uses `master-detail.js` from phase 3, so it starts after phase 3.
- Study plans: grouped by group, list + detail, semester taken from the current semester (switchable in the topbar crumb), «Скопіювати план з іншої групи» action (used by the task «6 груп без плану»).
- Constraints: list grouped by category (Викладач, Група, Аудиторія, Потік, Глобальне) as chips instead of emoji options; detail shows a human sentence + the parameters. The category → type cascade stays, rendered as radio cards (`.rcards`).

**Done when:** no modals, both pages pass regression.

### Phase 6 — Головна + Задачі (2 days)
- Головна exactly as in the mockup: greeting + date/week, «Як працює система» (dismiss remembered), semester stages + «Наступний крок» CTA, blockers line → Задачі, «Найближчі дати», «Ресурси семестру» 4 tiles (count, metric bar, what is missing, link to directory with the right filter chip pre-selected), «Останні зміни».
- New `/admin/tasks/`: hero «Готовність до генерації», 3 KPIs, task list grouped by severity (Блокує / Погіршує / Поради) with inline fix panels (e.g. assign teacher), «Зараз у корпусі», room heatmap.
- Both pages reuse the preflight logic from phase 4 (`assets/js/checks.js`).
- `admin/script.js` (old dashboard) is replaced by the new home page script.

**Done when:** every number on both pages comes from real data or is hidden; no placeholder text ships.

### Phase 7 — Розклад restyle (2 days)
- Keep current behaviour (week grid, drag & drop, lesson editing); move to Mosaic components: week grid `.wk`, lesson cards with type colour (`--lec` / `--pr` / `--lab` / `--exam` + soft backgrounds), filters as chips/seg, editing in a drawer instead of a modal.
- Saturday and Sunday columns (recent commit `0014659`) must stay supported.
- The full «workspace» (v3: unplaced queue, conflict panel) is **plan 0002**, not this one.

**Done when:** schedule regression items pass in both themes; exam lessons are coloured; horizontal scroll only inside the grid on mobile.

### Phase 8 — Public page (2 days)
- One search field (groups and teachers together, typed suggestions), result page `?g=<group>` / `?t=<teacher>` shareable, «мій розклад» remembered in localStorage and opened by default next time.
- «Зараз» card with progress and time left, «Далі» card, day strip (Mon–Sun), lesson list with past/now/gap states, week list view, «Поділитися», «Додати в календар» (ICS export, can be a later step if no endpoint).
- Mobile-first: this page is mostly used on phones; check at 375px.

**Done when:** a student can open the link, see now/next, switch days, and come back next day straight to their group.

### Phase 9 — Clean-up & hand-off (1 day)
- Delete `admin/common.js`, `admin/sidebar.js`, `admin/shared.css`, `admin/dashboard.css`, `admin/script.js`, `admin/semesters/semester-detail.js` and `semester-detail.css` (keep `detail.html` only as the redirect), all per-page CSS, `css/main.css`.
- Remove the `showModal` / `hideModal` compatibility aliases.
- Update `README.md`: new page list, design system link, and remove the unused GitHub Pages links (§2.4). Update `design/final/README.md` → «implemented».
- Final pass: regression checklist, both themes, widths 1440 / 980 / 640 / 375, keyboard focus visible, no console errors, Lighthouse accessibility ≥ 95.

## 6. Data the new UI needs (backend dependencies)

The mockups show data that current endpoints do not return directly. Plan: compute on the client first, ask backend for endpoints only where client-side is too slow or impossible. Checked against backend `2b6cd1a`.

| UI element | Can do now (client-side) | Needs backend |
|---|---|---|
| Resource tiles (counts) | `/stats/` | — |
| Groups without study plan, subjects without teacher | from list endpoints | optional `/semesters/{id}/preflight/` later |
| Rooms without type | — (not a state: `Room.room_type` is required, `api/models/rooms.py:20-25`) | — |
| Teacher load vs max hours | sum study plans per teacher | `max_hours` on Teacher (does not exist, `api/models/teachers.py:4-6`) |
| Teacher availability grid | `time_block` constraints (`{"type":"time_block","value":{"<day>":[periods]}}`) and `day_off` (`{"days":[...]}`), per semester (`api/services/generator.py:366-371`; already in `admin/constraints/constraint.js:26,28`) | — |
| Room equipment | — | no field; the detail shows `Room.note` as «Примітка» |
| «Останні зміни» | — | change log / `updated_at` on lessons |
| «Найближчі дати» | semester start/end | deadlines (publication, session) on semester |
| Generation history | — | `/generate-schedule/` run log |
| Readiness %, conflicts, student gaps | partly from `/lessons/` | conflicts endpoint preferred |
| Публікація step | — | `is_published` flag on semester |

Anything without data in a phase is **hidden**, not faked.

## 7. Risks

- **Scope creep from mockup data** — mitigated by §6 «hide, don't fake».
- **Old and new CSS on one page (phase 2)** — mitigated by loading only tokens + prefixed shell CSS until a page is rebuilt, and renaming the old `--accent` (phase 2).
- **Unverified extracted CSS** — `mosaic.css` was never rendered by any page; phase 1 compares it with `mosaic.html` before splitting.
- **Master–detail on small screens** — list and detail stack below 980px; verify the selected item scrolls into view.
- **Mosaic colours as text** — `--c1…--c6` are fills only; text on them uses `--on-c` (dark). Never use them for text on the light background.
- **Regressions in old JS** — each page rewrite keeps the old API calls; refactor logic only where the UX changes (modal → inline). Inline `onclick` handlers need global functions, hence classic scripts only.
- **Absolute paths** — nav uses `/admin/...`; correct for the server-root deploy, which is the only hosting (§2.4).

## 8. Estimate

About 18–22 working days in total, sequential. With more than one person: after phase 2, phase 8 can run alongside phase 3; phase 5 starts after phase 3 (it needs `master-detail.js`).

## 9. Follow-ups (separate plans)

- **0002** — Schedule workspace (v3): unplaced lessons queue, conflicts panel, side-by-side group/teacher/room views.
- **0003** — Lab assistant view with «Сьогодні / Зараз іде» (see `design/final/backlog.md`).
- Ctrl+K command palette.

## 10. Progress

### Phases 0–2

- Done 2026-11-19. Work was done directly on `main` instead of branch `redesign/mosaic` (orchestrator decision). Nothing is pushed or deployed (deploy happens on push to `main`).
- Commits, implementation: `4bcc238`, `29a071f`, `84dc6b3`, `56f8dd7`, `dde8bb3`, `3f50779`, `d6cc6ce`, `97938e8`, `3d2596b`, `ff3856f`, `0cabb86`.
- Commits, review round 1 fixes: `bfc380f`, `1f08505`, `b64fa0d`, `99ab03a`, `5236051`, `5bbff89`.
- Commits, review round 2 fixes: `c8416eb`, `ca4a6bb`, `fb87fa3`.

Deviations (phases 0–2):

- `UI.dnd` was ported in the phase 2 review fixes.
- Old bodies are forced to `color-scheme: light` and `.header-fixed` is made sticky under the shell top bar (`admin/shared.css`).
- Old in-body `<h1>` headings remained under the shell title until each body was rebuilt (all pages are rebuilt now).
- `--faint` is never used for text (fails 4.5:1).
- The per-page side-by-side baseline screenshots from the phase 2 «Done when» were done for teachers, semesters and schedule only.

### Phases 3–9

- Done 2026-11-19. User decision during the run: **desktop only**. No adaptive/responsive work; all mobile/640/375px items in phases 3–9 were dropped (the phase 2 mobile nav drawer was left in place as is).
- Tested against a local backend running on a backed-up copy of the local SQLite DB (restored afterwards).
- Commits, implementation: `50222aa`, `678222e` (master-detail + teachers), `0d7eb6a` (subjects), `4cb0c6f` (groups), `2807048` (streams), `a43a863` (rooms), `1ee35f9`, `7332ca3`, `8a50de6` (checks + semester), `e4b9a55` (study plans), `dbdd251` (constraints), `42df434` (home), `cd8543b`, `b34a6aa` (tasks + nav), `f748a5c` (schedule), `ba7f65d` (public), `8cc59c8`, `41b0fd0`, `46be802`, `fe92da5` (cross-page: `?filter=`, dynamic filters, `[hidden]`, checks), `7bfbc6e`, `42ee955`, `0b9439e` (phase 9 clean-up).
- Commits, review round 1 fixes: `77a0c70`, `98bf16a`, `64ad175`, `5236cc5`, `d71a549`, `39fc54e`, `a358044`, `b9825f5`, `1e87f1d`, `b3cf82b`, `14b7ea6`, `06f9e13`, `745d73a`, `a3cc80a`, `037ebd2`, `a68740e`, `5343ca0`.
- Commits, review round 2 fixes: `6da3b9c`, `3da9b66`, `97e01e8`, `89ed683`, `28d779a`, `cd669e9`.

Deviations (phases 3–9):

- Hidden per §6 (backend data missing): «Навантаження» / «Перевантажені» (no `max_hours`), «Останні зміни», «Історія генерацій», the «Публікація» step, semester archive.
- The semester step bar has 5 steps.
- The teacher list is not grouped (no department).
- Room types are an inline panel.
- The study plans list is groups/streams with URL `?item=g<N>|s<N>` (accepts `?group=N`); copy-plan key is subject + class_type + teacher.
- Constraints «Опис» is dropped (no backend field).
- Public page: the course filter only narrows group suggestions, the week is not in the shared link, 7-day strip, ICS is built client-side.
- MasterDetail no longer re-renders after a draft's first save (pages use `onCreated`).

### Not done / open

- (a) Backend: semester edit with lessons returns 500. `update()` calls `synchronize_slots()` without `force_delete` and `confirm_schedule_deletion` is ignored; it needs a 409 plus the flag. The UI already handles 409 and shows a toast on 500.
- (b) Backend: `/class_types/` returns 404 locally because migration `0020_add_class_types.py` is unapplied/untracked; study plans fall back to 5 built-in types.
- (c) Backend: no stream filter on `/lessons/` and `study_plan_details.stream` is a name only, so the public page matches stream lessons by name (wrong if two streams share a name). Add a `study_plan__stream__groups` filter or a stream id.
- (d) Backend: deleting a room type that is in use returns an HTML 500 (ProtectedError); it should be 409/400 with a detail message.
- (e) Backend: `/lessons/` has no teacher-id filter; public `?t=` uses `teacher_name` with an exact client-side match.
- (f) No cache-busting on script/style URLs: after deploy, users with cached old JS get errors until a hard reload; consider `?v=` query strings.
- (g) Lighthouse accessibility audit not run (tool unavailable); keyboard focus ring checked on nav/buttons only.
- (h) Nothing pushed; deploy happens on push to `main`. Run `docs/regression-checklist.md` against the real backend before pushing.
- (i) The old in-body duplicate `<h1>` issue is gone (all pages rebuilt).

## Revision log

| Date | Baseline | Change |
|---|---|---|
| 2026-11-19 | — | First draft. |
| 2026-11-19 | `b5b7c2c` (+ uncommitted `admin/semesters/*`), backend `2b6cd1a` | After review: classic scripts only and single declaration of the API base; phase 2 loads only tokens + `sh-` prefixed shell CSS and renames old `--accent`; explicit nav colour per item, group label «Планування»; three semester confirms listed separately, phase 4 depends on phase 0; backend gaps (`max_hours`, equipment, required room type, group↔stream many-to-many) marked; availability = `time_block`/`day_off`; phase 5 after phase 3; semester URLs `?id=N` with fallback and id-keeping redirect; tokens without `data-palette`, uppercase labels removed; §3 facts corrected; GitHub Pages ruled unused; phase 1 verifies `mosaic.css` against the mockup; phase 0 commits `design/`; exam lesson colour added. |
| 2026-11-19 | `fb87fa3` | Phases 0–2 implemented and reviewed; status and progress recorded. |
| 2026-11-19 | `cd669e9` | Phases 3–9 implemented (desktop only), reviewed twice, plan closed. |
