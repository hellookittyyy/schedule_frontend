# 0002 — Deepen MasterDetail and Checks

| | |
|---|---|
| Status | Done — phases 0-6 (branch `deepen-master-detail`, not merged) |
| Date | 2026-11-20 |
| Baseline | frontend `290756b` (branch `deepen-master-detail`; app code identical to `fd6da26`, `main` after plan 0001) |
| Source | Architecture review 2026-11-20, the three «Strong» candidates: (1) Draft creation inside MasterDetail, (2) detail-scoped async on `ctx`, (3) Readiness and stages beside Checks |
| Scope | `assets/js/master-detail.js`, `assets/js/checks.js`, the 7 pages built on MasterDetail, `admin/home.js`, `admin/tasks/tasks.js`, `admin/semesters/semester.js`, `docs/regression-checklist.md`, a new browser test page |
| Out of scope | Semester context module, public Lessons/Dates module, shared combobox (the «Worth exploring» / «Speculative» candidates), any visual change, any backend change |

Vocabulary: **module**, **interface**, **seam**, **depth**, **locality**, **leverage** as in the codebase-design skill; domain terms as in [`GLOSSARY.md`](../../GLOSSARY.md).

---

## 1. Goal

Move the behaviour that plan 0001 fixed page by page into the two modules that should own it, so the next bug of the same kind is fixed once:

- **MasterDetail** owns the whole Draft lifecycle (hold until creatable → create → Promotion → full re-render), every write made from a detail (one queue, one status chip), and staleness of every async result shown in a detail.
- **Checks** owns Readiness and the semester Stages, as pure functions over a data snapshot, so Home, Tasks and Semester cannot disagree.

Success = the bug classes below have one home, the pages lose their workarounds, and the moved logic has tests.

| Bug class (plan 0001 fixes) | Home after this plan |
|---|---|
| Draft POST / «section missing after create» — 14b7ea6, 6da3b9c, a358044, 5343ca0, a68740e, 037ebd2, b9825f5 | MasterDetail Draft lifecycle |
| Stale secondary loads / semester switched mid-flight — 28d779a, cd669e9, 89ed683 | `ctx.load` (+ `md.setScope` on Teachers) |
| Writes racing each other — b3cf82b, 1e87f1d, a16da94 (DELETE ordering) | `ctx.queue` (MasterDetail's single write chain) |
| Readiness cap only in Tasks — 64ad175 | `Checks.readiness` |

`3da9b66` (Semester page, post-generate paint) is not a MasterDetail page; its guard stays in `semester.js`.

## 2. Decisions already fixed (do not reopen)

1. Plan 0001 §2 still holds: static HTML + classic scripts, no build step, no `import`, globals on `window`, `?v=` hashes via `scripts/version-assets.py`.
2. No visible behaviour change, except the two listed in §6 (Rooms create button removed — approved 2026-11-20; re-render after Promotion).
3. MasterDetail stays one module with one external seam (`MasterDetail.create(opts)` → `md`, and `ctx` passed to the page). No new public modules.
4. A Draft discarded while its create is in flight still appears in the list once the create succeeds (today's behaviour, `master-detail.js:376-378`): the record exists on the server, so hiding it would only surprise the user on reload. Ruled 2026-11-20.

## 3. Test harness (phase 0)

There is no test suite and Node is not installed on this machine. Default: **a browser test page**, no dependencies.

- `tests/index.html` loads the real classic scripts in the same order as the pages (`api.js` → `ui.js` → `icons.js` → module under test) and then `tests/*.test.js`.
- `tests/runner.js` (~60 lines): `test(name, fn)` (sync or Promise), `assert`, `assertEqual` (deep, via JSON), a result list on the page, a red/green title, and `window.__testResult` for a future headless run.
- `apiRequest` is replaced per test by a fake (`tests/fake-api.js`): a route table `{ 'GET /subjects/': [...], 'POST /subjects/': fn }` that records calls and lets a test hold a response (deferred promise) to create races on purpose. `apiRequest` is a top-level function in a classic script (`api.js:8`), so assigning `window.apiRequest` replaces it for every caller. This is the second **adapter** at the `apiRequest` seam, so the seam is real.
- MasterDetail tests mount into a `<div>` fixture, drive it with real DOM events (`input`, `change`, `focusout`, `click`), and assert on the DOM and on recorded calls.
- Run: `py scripts/dev-server.py`, open `http://localhost:5500/tests/`.
- `scripts/version-assets.py` scans every page outside `design/`, `docs/`, `scripts/` (`SKIP_DIRS`), so `tests/index.html` gets `?v=` hashes too and the pre-commit check covers it.
- The deploy serves the whole repo, so `/tests/` will be public. It contains no secrets and talks to no backend (fake api only); acceptable, same as `design/` and `docs/`.

Alternative if you prefer the terminal: install Node and use `node --test` + jsdom. More setup, adds `package.json`; not needed for this plan.

## 4. Target interfaces

### 4.1 MasterDetail options (changes only)

| Before | After | Note |
|---|---|---|
| `onCreate()` → draft defaults | `newItem()` → draft defaults | rename: `onCreate` read like «after create». Also rekey the add button (`master-detail.js:57`) and the empty-state action (`master-detail.js:139`) |
| `save(item, changes)` (both POST and PUT, page decides by `item.id == null`) | `create(values, item)` → saved record; `update(item, changes, ctx)` → saved record | MasterDetail calls `create` once, with all values; never with partial values. `update` gets `ctx` so the page can repaint parts of the detail that depend on the saved record (only when `ctx.alive()`); from phase 2 `save` already receives `ctx` as third argument |
| — | `canCreate(values, item, ctx)` → `true` or a short text of what is missing (optional) | default: every `[data-md-field][required]` is non-empty. Constraint uses it with `ctx.w` (category/type/entity are not fields) |
| `onCreated(item, ctx)` | **removed** | Promotion re-renders the detail (§4.4) |
| `draftLabel`, `addLabel`, `remove`, `removeQuestion`, `removedText` … | unchanged | |

### 4.2 `ctx` (changes only)

| Member | Meaning |
|---|---|
| `ctx.load(promise)` | Returns a promise that settles with the result only if the detail is still the same render **and** the same scope; otherwise it never settles (the result is dropped, errors too). Replaces `if (!ctx.alive()) return;` and `semId !== sid` guards on detail loads. It does **not** see changes inside one render (e.g. the constraint editor repainted for another type); such checks stay in the page. |
| `ctx.queue(op, { errorText })` | Runs `op()` on MasterDetail's single write chain (the same chain as field autosave and DELETE). Drives the status chip (`Зберігаю…` → `Збережено` / error), shows the error toast, returns `op`'s promise. **`op` must reject on failure**; an op that catches its own error and resolves counts as success. On a Draft: if a create is in flight, the op runs after it and sees `item.id`; if no create has started yet, the op is held until Promotion and dropped if the Draft is discarded or never created. |
| `ctx.save(changes)` | On a saved record: field-style update through `update`, built on `ctx.queue` (unchanged meaning). On a Draft: merges `changes` into the Draft values and asks to create (§4.4 step 3). |
| `ctx.alive()` | kept, now also false after a scope change |
| `ctx.sent`, `ctx.pending`, `ctx.danger`, `ctx.rerender`, `ctx.refresh`, `ctx.status`, `ctx.el`, `ctx.item`, `ctx.isDraft` | unchanged; `ctx.status` stays for pages that show a status without a write |

### 4.3 `md` (changes only)

- `md.setScope(key)` — the page's current scope (a Semester id). Changing it invalidates every pending `ctx.load` and re-renders the detail. Used where the semester switch does **not** reload the list: Teachers (`#t-sem` inside the detail, `teacher.js:94-97`). Study plans and Constraints switch semester with `md.reload()` (`study-plan.js:53`, `constraint.js:605, 717`), which already re-renders the detail once the new list arrives; they do not call `setScope`.
- `md.create` (starts a Draft, `master-detail.js:521`; no callers) is renamed `md.startDraft`, so it does not read like the new `create` option.

### 4.4 Draft lifecycle inside MasterDetail

1. `startDraft` → `newItem()`; detail rendered with `ctx.isDraft = true`.
2. On every `input`/`change` in the detail MasterDetail snapshots all `[data-md-field]` values into its own Draft values (no `item._form`, no DOM reads at POST time).
3. A create is asked for on `change` / `focusout` / Enter in a `[data-md-field]`, or by `ctx.save(changes)` (pages whose state is not in fields, e.g. Constraint). If `canCreate(values, item, ctx)` passes and no create is in flight → `create(values, item)` on the write chain. Otherwise nothing is sent; the Draft block shows what is missing (text from `canCreate`, or the default).
4. On success — **Promotion**: merge the response into the item, add to the list, set `?id=`. Then **wait until the write chain is idle** (every op queued during the create — `ctx.queue` ops, `ctx.save` updates — has run and merged), and **re-render the detail** with `ctx.isDraft = false`. Before re-render MasterDetail records the focused field id and caret; after re-render it restores focus/caret, and for every field whose value changed while the POST was in flight it puts the typed value back and commits it as an `update` (what `rooms.onCreated` does by hand today).
5. On failure: the Draft stays, the error toast shows, the next change retries. Held `ctx.queue` ops stay held.
6. Any re-render of a Draft (`md.rerender()`, `ctx.rerender()`) puts the snapshotted field values back. Every re-render first commits pending debounced fields (today `renderDetail` clears timers without saving, `master-detail.js:256, 290`).
7. Discarded Draft whose create is in flight: when the create succeeds the record is added to the list (§2.4) but not selected; held ops for it are dropped.

### 4.5 Checks

```
Checks.evaluate(semesterId, data) → checks[]          // today's private evaluate, exported, pure
Checks.readiness(checks) → { pct, passed, total, blocks, capped }   // 50% cap while blockers exist
Checks.stages(data, checks, { constraints, lessons }) → [{ id, name, done, req, meta }]
                                                       // ids: calendar, resources, plans, constraints, generation
```

`stages` returns no links: Home maps ids to `href`, Semester maps ids to its in-page views. `run`, `data`, `invalidate`, `summary`, `isBlocked`, `plansPerGroup`, `subjectIds`, `roomTypeId` stay (`checks.js:164-166`; `home.js:234, 236` use `subjectIds`).

## 5. Phases

Each phase is one or more commits, ends with `py scripts/version-assets.py`, the tests page green, and the matching part of `docs/regression-checklist.md` clicked through against the local backend.

### Phase 0 — Test harness and checklist (1 day)
- `tests/index.html`, `tests/runner.js`, `tests/fake-api.js`; one smoke test that loads `ui.js` and asserts `UI.pluralForm`.
- `README.md`: one line on how to open the tests.
- `docs/regression-checklist.md`: rewrite the sections for the 7 directories, Home, Tasks and Semester to describe the Mosaic UI as it is at the baseline (master–detail, inline confirm, autosave, Draft creation, combobox chips, availability grid). Today's file was written at the start of plan 0001 as a list of the old features (`84dc6b3`; e.g. lines 8, 55, 61 still describe modals and checkboxes). Change the intro line from «після кожної фази плану 0001» to any plan.

### Phase 1 — Readiness and Stages in Checks (½–1 day)
- Export `evaluate`; add `readiness`, `stages`.
- `home.js` `stages()` (116–139) and `semester.js` `renderSteps()` (235–250) already use the same five rules and the same `UI.plural` (`home.js:12`, `semester.js:62`). The only input that differs is the lesson count: Home uses `stats.classes_scheduled`; Semester uses `st.lessons.total`, which is the same number for the current semester and a lesson-list count for others (`semester.js:187-198`). `stages` takes the count as `lessons`.
- `tasks.js renderTop` uses `Checks.readiness` (drops its local cap, `tasks.js:107-109`).
- `home.js` and `semester.js` render from `Checks.stages`; Semester's Generate button uses `Checks.isBlocked` (today counts blockers by hand, `semester.js:259`).
- Tests (`tests/checks.test.js`, fixture data, no DOM): each check's severity flips at its threshold; `readiness` caps at 50 with a blocker and not without; `stages` done/required for an empty semester, a ready semester, a semester with plans for only some groups (direct and via a stream).

### Phase 2 — `ctx.load`, `ctx.queue`, `md.setScope` in MasterDetail (1 day)
- Implement §4.2–4.3 (except the Draft parts of `ctx.queue`/`ctx.save`, which come in phase 4). `doSave` and `doRemove` are rewritten on top of the one chain + `ctx.queue`; behaviour of field autosave unchanged. `save` receives `ctx` as third argument. Re-render commits pending debounced fields first (§4.4 step 6, second sentence).
- Tests (`tests/master-detail.test.js`): a held `ctx.load` resolved after selecting another record does not call back; resolved after `setScope` does not call back; resolved in time does. Two `ctx.queue` ops and a field autosave run in order; a failing op shows error and the next one still runs; an op that resolves after catching its error ends the chip «Збережено» (documents the rule in §4.2); the chip ends «Збережено» only when the batch had no failure; DELETE waits for a pending queued op; `md.rerender()` with a field mid-debounce saves it.

### Phase 3 — Pages onto `ctx.load` / `ctx.queue` / `setScope` (1½ days)
One commit per page; each removes its private guard or queue:
- **teacher.js**: `loadAvailability`, `loadGroups` → `ctx.load`; `AvailGrid.chain`/`pending`/`alive` removed (`teacher.js:265, 325-339`), grid writes → `ctx.queue` (grid keeps its own rollback on error: reload availability in the `catch`, guarded by `ctx.alive()`; re-render the grid when `ctx.pending` reaches 0). Subject chips on a saved teacher → `ctx.queue` op that PUTs `/teachers/<id>/` with `{ name, subjects: [ids] }` built when the op runs (the API sets the list, `schedule_backend/api/serializers/teachers.py:23-30`); the «Повернути» undo toast stays. `#t-sem` switch → `md.setScope(semId)`.
- **stream.js**: `enqueue`, `_posting`, `_name` removed; membership changes → `ctx.queue`, PUT built when the op runs.
- **study-plan.js**: `tr._chain` (`study-plan.js:338`) and `runCopy` (one `ctx.queue` op per copy, not per row) → `ctx.queue` (rows now serialise globally — acceptable, they were already queued behind field saves). `saveRow` and `saveForCourse` reject on failure and drop their own `ctx.status('error')` + toast (keep `markErr`); `runCopy` rejects only when nothing was copied, and keeps its partial-failure toast. **Keep** the semester checks on write completions (`sem !== semId` at 363, 401, 403, 548; `sem === semId` at 553, 558) and `lc.isCurrent()` in the list load (98): a write that finishes after a semester switch must not touch the new semester's `plans`. No `setScope` (the switch reloads the list).
- **constraint.js**: the 4 guards (455, 516, 526, 573) → `ctx.load` for render staleness, **keeping** the in-render checks `w.type !== …` and `w.semester !== sid` (455, 526): the editor repaints for another type or semester without a re-render. Keep `sid !== semId` in the list load (674). No `setScope`; the popstate handler and its «register after MasterDetail» ordering (709-718) stay.
- **subject.js**, **rooms.js**: their one guard each.
- **group.js**: move the `#g-sub`/`#g-course` update out of `save()` (`group.js:220-227`; it reads the DOM through `document.getElementById` + `md.current()`) into a repaint through the `ctx` passed to `save`, only when `ctx.alive()`.
- Done when: `grep -nE "semId !== sid|_chain|enqueue\(|_posting|_name\b|AvailGrid\.prototype\.alive|getElementById\('g-" admin` is empty, and the checks listed as kept above are still there.

### Phase 4 — Draft lifecycle in MasterDetail (1 day)
- Implement §4.1 and §4.4, and the Draft parts of `ctx.queue`/`ctx.save` (§4.2); remove `onCreated`, `[data-md-draft]` patching and the `save` option (no compatibility shim: the 6 pages with Drafts — subject, group, teacher, stream, rooms, constraint — migrate in phase 5, same branch).
- Tests: typing in a Draft with a required field empty sends nothing; filling the last required field and blurring sends exactly one `create` with all values; `ctx.save(changes)` on a Draft with `canCreate` passing sends one `create`, failing sends nothing; typing during a held POST then resolving → one `update` with the typed value; a `ctx.queue` op started during the held POST runs after it with the new id **and before the re-render**; a `ctx.queue` op on a Draft with no create started is held until Promotion and dropped on discard; focus stays in the same field after Promotion; failed create keeps the Draft and a later change retries; `md.rerender()` on a Draft keeps typed values; discarding a Draft while its POST is held → after the POST resolves the record is in the list and is not selected.

### Phase 5 — Pages onto the Draft lifecycle (1½ days)
One commit per page; each deletes its workaround:
- **subject.js**, **group.js**: capture-phase `hold`, `_form`, `onCreated`, the `savedHtml` injection path → `create`/`update`; `renderDetail` renders saved sections when `!ctx.isDraft`, nothing else. Update the comments «also inserted in place after a draft's first save» (`subject.js:33`, `group.js:96`).
- **teacher.js**: `onCreated` + `posted` WeakMap diff → gone. `create` values include `subjects` from `item.subjects_details`; chip changes on a Draft update the item and also go through the phase 3 `ctx.queue` PUT, which is held until Promotion (§4.2) — the PUT sends the full list, so a chip already in the create is harmless. Update the comment at `teacher.js:41`.
- **stream.js**: Draft POST through `create(values, item)` with `groups: item.groups_details`.
- **rooms.js**: explicit «Створити аудиторію» button removed; Draft inputs get `data-md-field` too (today `fld()` omits it on a Draft, `rooms.js:59`); required = name, building, type, capacity via the existing `required` attributes; `onCreated` field re-wiring gone (see §6); `draftText` (`rooms.js:83`) back to the default. `afterTypesChange` stops querying `#rooms .md-detail` and uses `md.rerender()` (moved here from phase 3: it needs §4.4 step 6 to keep a Draft's typed values).
- **constraint.js**: `canCreate(values, item, ctx)` returns `missing(ctx.w)`; `commit` keeps calling `ctx.save(payloadOf(w))`, which on a Draft asks to create; `onCreated` (unhiding `[data-cn-saved]`) gone — render those nodes only when `!ctx.isDraft`, and drop the comment at `constraint.js:227`.
- **study-plan.js**: no change — it configures no `onCreate`/`save` (its list items are groups/streams; its per-row drafts inside the detail are not MasterDetail Drafts).
- Done when: `grep -nE "onCreated|_form|data-md-draft|posted\.|r-create" admin` is empty and the only `stopPropagation` left in `admin` is in combobox Escape handlers.

### Phase 6 — Clean-up (½ day)
- Delete `MasterDetail.errorText` (pass-through to `UI.errorText`); pages use `UI.errorText`.
- Update the header comment of `master-detail.js` with the interface in §4 (it is the only documentation callers read).
- `docs/regression-checklist.md`: add «create each directory record by tabbing through fields; type during save; add a chip or click a grid cell during save» checks for the 6 pages with Drafts.
- Mark this plan done; record progress below.

## 6. Visible changes

1. **Rooms** (approved 2026-11-20): the explicit «Створити аудиторію» button goes; a Room is created on blur once name, building, type and capacity are filled, like Groups. No `createButton` option is added to MasterDetail.
2. **After Promotion the detail re-renders** instead of being patched, once the writes queued during the create have finished. Focus and caret are kept (phase 4 tests); a screen reader may re-announce the heading once.

## 7. Risks

- **Re-render after Promotion loses state** the page kept only in the DOM (an open combobox, a scroll position). Mitigation: phase 4 tests for focus; check each page's mount for DOM-only state during phase 5. State on `ctx` (Constraint's `ctx.w`) is rebuilt from the item, which is why Promotion waits for an idle chain (§4.4 step 4).
- **Promotion waits for the chain**: a burst of edits during the create delays the full re-render by those writes. Accept; the Draft block stays until then.
- **Global write serialisation** (study-plan rows, availability grid) makes bursts slower. Today's private chains already serialise per row/grid; global order adds latency only when two areas are edited at once. Accept.
- **Never-settling `ctx.load` promises** hold closures until the page unloads. Volume is small (one per detail render). Accept.
- **Big-bang option change** (`save` → `create`/`update`) breaks a page not yet migrated. Phases 4 and 5 land together on one branch; the branch is not merged between them.

## 8. Estimate

≈ 7 days. Phase 1 is independent of 2–5 and can go first or in parallel.

## 9. Progress

- Phase 0 — `af90e6d` test harness (`tests/runner.js`, `tests/fake-api.js`, `tests/index.html`, two smoke tests) and `scripts/run-tests.py` (dev-server on a free port, headless Chrome/Edge, `PASS n/m` marker, exit 0 only on PASS); `c7a16dc` rewrote `docs/regression-checklist.md` for the Mosaic UI. Verify: `PASS 2/2`.
- Phase 1 — `3f6372b` `Checks.evaluate`/`readiness`/`stages` exported; `admin/home.js`, `admin/tasks/tasks.js` and `admin/semesters/semester.js` render from them (Tasks readiness via `Checks.readiness`, Semester's Generate button via `Checks.isBlocked`); `tests/checks.test.js` (7 tests). Verify: `PASS 9/9`.
- Phase 2 — `f2050a0` one write chain (`chain`), `ctx.queue(op, {errorText})`, `ctx.load(promise)` (never settles when stale), `md.setScope(key)`; `renderDetail()` flushes pending debounced fields; `save` receives `ctx` as third argument. `tests/master-detail.test.js` (9 tests). Verify: `PASS 18/18`.
- Phase 3 — one commit per page: `9345a0a` subjects, `d0d80fa` rooms, `9921e8d` constraints, `2970a30` groups, `fde7e31` study plans, `3d40abc` streams, `01a2c60` teachers; fixes `e16d066` (teacher chips keep the list built while a PUT was in flight), `83ed58a` (a failed chip write no longer ends «Збережено»), `743a0dc` (study-plan copy freezes source, list and semester at click time). Detail loads go through `ctx.load`, writes through `ctx.queue`, Teachers switches semester with `md.setScope`; `AvailGrid.chain/pending/alive`, stream `enqueue/_posting/_name`, study-plan `tr._chain` and the private copy chain are gone. Kept: study-plan's `sem !== semId` / `sem === semId` on write completions and `lc.isCurrent()` on the list load, Constraint's in-render type/semester checks and `sid !== semId`, no `setScope` on study plans or constraints. Verify: `PASS 18/18`. Note: the done-grep's `_name\b` also matches legitimate API fields (`subject_name`, `teacher_name`); the intent check `grep -rnE "\._name\b|\b_name\b" admin` is empty.

- Phase 4 — `3759717` `newItem`/`create`/`update`/`canCreate` replace `onCreate`/`save`/`onCreated`; Draft values snapshotted from `[data-md-field]`; create asked on change/blur/Enter or `ctx.save`; `ctx.queue` on a Draft runs after an in-flight create or is held until Promotion (dropped on discard); Promotion waits for an idle chain (started a macrotask later, so ops queued in reaction to the create are counted) and re-renders keeping focus, caret and typed values (sent as updates); `md.create` → `md.startDraft`; a re-render never asks to create (focusout from the removed field is ignored). 11 new tests. Verify: `PASS 29/29`.
- Phase 5 — one commit per page: `ae78423` subjects, `4e4f0f1` groups, `b941f35` teachers, `f7dbce4` streams, `9794069` rooms (create button gone, `afterTypesChange` → `md.rerender()`, a deleted type shows the placeholder), `d5890c3` constraints. Study plans unchanged except `errText`. Done-grep `grep -nE "onCreated|_form|data-md-draft|posted\.|r-create" admin` is empty; `stopPropagation` in `admin` only in combobox Escape handlers. Checked against the local backend with a throwaway headless scenario (create by blur on all six pages, chips added on a Draft saved after create, Rooms Draft surviving a type rename, Constraint created via `ctx.save`; no console errors; records removed afterwards).
- Phase 6 — `MasterDetail.errorText` removed (pages use `UI.errorText`); `master-detail.js` header documents the interface; regression checklist has the «type / add a chip / click a grid cell during create» checks for the six pages with Drafts.

## Revision log

- 2026-11-20 — created from the architecture review.
- 2026-11-20 — Rooms create button removal approved; §6 settled.
- 2026-11-20 — review applied (baseline → `290756b`): Draft create via `ctx.save` and `canCreate(…, ctx)` for Constraint; Promotion waits for an idle write chain; `ctx.queue` on an unsaved Draft is held until Promotion and ops must reject on failure; `setScope` only on Teachers, semester checks on Study plans/Constraint writes and in-render editor checks kept; teacher chips as a full-list PUT; Rooms `md.rerender` moved to phase 5 with Draft values kept on re-render; `update` gets `ctx` (Groups header); phase 1 facts corrected and the `group.js` bullet dropped; regression checklist rewritten in phase 0; discarded-in-flight Draft stays in the list (§2.4); `md.create` → `md.startDraft`; done-greps rewritten; `subjectIds`/`roomTypeId` kept; `3da9b66` moved out of the `ctx.load` row.
