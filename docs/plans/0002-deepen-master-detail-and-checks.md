# 0002 — Deepen MasterDetail and Checks

| | |
|---|---|
| Status | Draft 2026-11-20 — not started |
| Date | 2026-11-20 |
| Baseline | frontend `fd6da26` (`main`, after plan 0001) |
| Source | Architecture review 2026-11-20, the three «Strong» candidates: (1) Draft creation inside MasterDetail, (2) detail-scoped async on `ctx`, (3) Readiness and stages beside Checks |
| Scope | `assets/js/master-detail.js`, `assets/js/checks.js`, the 7 pages built on MasterDetail, `admin/home.js`, `admin/tasks/tasks.js`, `admin/semesters/semester.js`, a new browser test page |
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
| Stale secondary loads / semester switched mid-flight — 28d779a, cd669e9, 3da9b66, 89ed683 | `ctx.load` + `md.setScope` |
| Writes racing each other — b3cf82b, 1e87f1d, a16da94 (DELETE ordering) | `ctx.queue` (MasterDetail's single write chain) |
| Readiness cap only in Tasks — 64ad175 | `Checks.readiness` |

## 2. Decisions already fixed (do not reopen)

1. Plan 0001 §2 still holds: static HTML + classic scripts, no build step, no `import`, globals on `window`, `?v=` hashes via `scripts/version-assets.py`.
2. No visible behaviour change, except the two listed in §6 (Rooms create button removed — approved 2026-11-20; re-render after Promotion).
3. MasterDetail stays one module with one external seam (`MasterDetail.create(opts)` → `md`, and `ctx` passed to the page). No new public modules.

## 3. Test harness (phase 0)

There is no test suite and Node is not installed on this machine. Default: **a browser test page**, no dependencies.

- `tests/index.html` loads the real classic scripts in the same order as the pages (`api.js` → `ui.js` → `icons.js` → module under test) and then `tests/*.test.js`.
- `tests/runner.js` (~60 lines): `test(name, fn)` (sync or Promise), `assert`, `assertEqual` (deep, via JSON), a result list on the page, a red/green title, and `window.__testResult` for a future headless run.
- `apiRequest` is replaced per test by a fake (`tests/fake-api.js`): a route table `{ 'GET /subjects/': [...], 'POST /subjects/': fn }` that records calls and lets a test hold a response (deferred promise) to create races on purpose. This is the second **adapter** at the `apiRequest` seam, so the seam is real.
- MasterDetail tests mount into a `<div>` fixture, drive it with real DOM events (`input`, `change`, `focusout`, `click`), and assert on the DOM and on recorded calls.
- Run: `py scripts/dev-server.py`, open `http://localhost:5500/tests/`.
- The deploy serves the whole repo, so `/tests/` will be public. It contains no secrets and talks to no backend (fake api only); acceptable, same as `design/` and `docs/`.

Alternative if you prefer the terminal: install Node and use `node --test` + jsdom. More setup, adds `package.json`; not needed for this plan.

## 4. Target interfaces

### 4.1 MasterDetail options (changes only)

| Before | After | Note |
|---|---|---|
| `onCreate()` → draft defaults | `newItem()` → draft defaults | rename: `onCreate` read like «after create» |
| `save(item, changes)` (both POST and PUT, page decides by `item.id == null`) | `create(values, item)` → saved record; `update(item, changes)` → saved record | MasterDetail calls `create` once, with all values; never with partial values |
| — | `canCreate(values, item)` → `true` or a short text of what is missing (optional) | default: every `[data-md-field][required]` is non-empty. Constraint uses it for category/type/entity, which are not fields |
| `onCreated(item, ctx)` | **removed** | Promotion re-renders the detail (§4.3) |
| `draftLabel`, `addLabel`, `remove`, `removeQuestion`, `removedText` … | unchanged | |

### 4.2 `ctx` (changes only)

| Member | Meaning |
|---|---|
| `ctx.load(promise)` | Returns a promise that settles with the result only if the detail is still the same render **and** the same scope; otherwise it never settles (the result is dropped, errors too). Replaces every `if (!ctx.alive() \|\| semId !== sid) return;`. |
| `ctx.queue(op, { errorText })` | Runs `op()` on MasterDetail's single write chain (the same chain as field autosave and DELETE). Drives the status chip (`Зберігаю…` → `Збережено` / error), shows the error toast, returns `op`'s promise. While the record is still a Draft whose create is in flight, a queued op runs after the create and sees `item.id`. |
| `ctx.save(changes)` | unchanged meaning (field-style update through `update`), now built on `ctx.queue` |
| `ctx.alive()` | kept, now also false after a scope change |
| `ctx.sent`, `ctx.pending`, `ctx.danger`, `ctx.rerender`, `ctx.refresh`, `ctx.status`, `ctx.el`, `ctx.item`, `ctx.isDraft` | unchanged; `ctx.status` stays for pages that show a status without a write |

### 4.3 `md` (changes only)

- `md.setScope(key)` — the page's current scope (today always the selected Semester id). Changing it invalidates every pending `ctx.load` and re-renders the detail. Pages call it from their semester switch instead of comparing `semId !== sid` themselves.

### 4.4 Draft lifecycle inside MasterDetail

1. `startDraft` → `newItem()`; detail rendered with `ctx.isDraft = true`.
2. On every `input`/`change` in the detail MasterDetail snapshots all `[data-md-field]` values into its own Draft values (no `item._form`, no DOM reads at POST time).
3. On `change` / `focusout` / Enter: if `canCreate` passes and no create is in flight → `create(values, item)` on the write chain. Otherwise nothing is sent; the Draft block shows what is missing (text from `canCreate`, or the default).
4. On success — **Promotion**: merge the response into the item, add to the list, set `?id=`, then **re-render the detail** with `ctx.isDraft = false`. Before re-render MasterDetail records the focused field id and caret; after re-render it restores focus/caret, and for every field whose value changed while the POST was in flight it puts the typed value back and commits it as an `update` (what `rooms.onCreated` does by hand today).
5. On failure: the Draft stays, the error toast shows, the next change retries.

### 4.5 Checks

```
Checks.evaluate(semesterId, data) → checks[]          // today's private evaluate, exported, pure
Checks.readiness(checks) → { pct, passed, total, blocks, capped }   // 50% cap while blockers exist
Checks.stages(data, checks, { constraints, lessons }) → [{ id, name, done, req, meta }]
                                                       // ids: calendar, resources, plans, constraints, generation
```

`stages` returns no links: Home maps ids to `href`, Semester maps ids to its in-page views. `run`, `data`, `invalidate`, `summary`, `isBlocked`, `plansPerGroup` stay.

## 5. Phases

Each phase is one or more commits, ends with `py scripts/version-assets.py`, the tests page green, and the matching part of `docs/regression-checklist.md` clicked through against the local backend.

### Phase 0 — Test harness (½ day)
- `tests/index.html`, `tests/runner.js`, `tests/fake-api.js`; one smoke test that loads `ui.js` and asserts `UI.pluralForm`.
- `README.md`: one line on how to open the tests.

### Phase 1 — Readiness and Stages in Checks (½–1 day)
- Export `evaluate`; add `readiness`, `stages`.
- Before moving: diff `home.js` `stages()` (≈116–140) against `semester.js` `renderSteps()` (≈236–250) and settle one rule set. Known differences to resolve: «Генерація» done uses `stats.classes_scheduled` on Home and `st.lessons.total` on Semester (pass the count in), meta strings built with different `plural` helpers.
- `tasks.js renderTop` uses `Checks.readiness` (drops its local cap).
- `home.js` and `semester.js` render from `Checks.stages`; Semester's Generate button uses `Checks.isBlocked`.
- `group.js`: count plans per group with `Checks.plansPerGroup` over its loaded data instead of its own `directCount`/`streamCount` loop (keep the «direct vs via streams» split only if the detail still needs it; otherwise drop it).
- Tests (`tests/checks.test.js`, fixture data, no DOM): each check's severity flips at its threshold; `readiness` caps at 50 with a blocker and not without; `stages` done/required for an empty semester, a ready semester, a semester with plans for only some groups (direct and via a stream).

### Phase 2 — `ctx.load`, `ctx.queue`, `md.setScope` in MasterDetail (1 day)
- Implement §4.2–4.3. `doSave` and `doRemove` are rewritten on top of the one chain + `ctx.queue`; behaviour of field autosave unchanged.
- Tests (`tests/master-detail.test.js`): a held `ctx.load` resolved after selecting another record does not call back; resolved after `setScope` does not call back; resolved in time does. Two `ctx.queue` ops and a field autosave run in order; a failing op shows error and the next one still runs; the chip ends «Збережено» only when the batch had no failure; DELETE waits for a pending queued op.

### Phase 3 — Pages onto `ctx.load` / `ctx.queue` / `setScope` (1½ days)
One commit per page; each removes its private guard or queue:
- **teacher.js**: `loadAvailability`, `loadGroups`, subject chips → `ctx.load`/`ctx.queue`; `AvailGrid.chain`/`pending`/`alive` removed (grid keeps its own rollback on error: reload availability in the `catch`); semester switch → `md.setScope`.
- **stream.js**: `enqueue`, `_posting`, `_name` removed; membership changes → `ctx.queue`, PUT built when the op runs.
- **study-plan.js**: `tr._chain` and `runCopy` chain → `ctx.queue` (rows now serialise globally — acceptable, they were already queued behind field saves); `sem !== semId` checks → `setScope`; keep `lc.isCurrent()` for the list load.
- **constraint.js**: the 4 guards → `ctx.load`; semester switch → `setScope`. Keep its popstate handler but drop the «must register after MasterDetail» dependency if `setScope` makes it unnecessary.
- **subject.js**, **rooms.js**: their one guard each.
- **group.js**: move the `#g-sub`/`#g-course` update out of `save()` (it reads the DOM through `document.getElementById` + `md.current()`, past the guard) into the re-render.
- **rooms.js**: `afterTypesChange` stops querying `#rooms .md-detail`; uses `md.rerender()` (a Draft is kept by MasterDetail).
- Done when: `grep -n "semId !== sid\|_chain\|enqueue(" admin` is empty.

### Phase 4 — Draft lifecycle in MasterDetail (1 day)
- Implement §4.1 and §4.4; remove `onCreated`, `[data-md-draft]` patching and the `save` option (no compatibility shim: the 6 pages with Drafts — subject, group, teacher, stream, rooms, constraint — migrate in phase 5, same branch).
- Tests: typing in a Draft with a required field empty sends nothing; filling the last required field and blurring sends exactly one `create` with all values; typing during a held POST then resolving → one `update` with the typed value; a `ctx.queue` op started during the held POST runs after it with the new id; focus stays in the same field after Promotion; failed create keeps the Draft and a later change retries; discarding a Draft while its POST is held does not add it to the list.

### Phase 5 — Pages onto the Draft lifecycle (1½ days)
One commit per page; each deletes its workaround:
- **subject.js**, **group.js**: capture-phase `hold`, `_form`, `onCreated`, the `savedHtml` injection path → `create`/`update`; `renderDetail` renders saved sections when `!ctx.isDraft`, nothing else.
- **teacher.js**: `onCreated` + `posted` WeakMap diff → gone: subject chips added on a Draft go into `create` values (or are queued behind the create with `ctx.queue`).
- **stream.js**: Draft POST through `create(values, item)` with `groups: item.groups_details`.
- **rooms.js**: explicit «Створити аудиторію» button removed; required = name, building, type, capacity via `required` attributes; `onCreated` field re-wiring gone (see §6).
- **constraint.js**: `canCreate` returns its existing `missing(w)` text; `onCreated` (unhiding `[data-cn-saved]`) gone.
- **study-plan.js**: no change — it configures no `onCreate`/`save` (its list items are groups/streams; its per-row drafts inside the detail are not MasterDetail Drafts).
- Done when: `grep -n "onCreated\|_form\|stopPropagation\|data-md-draft" admin` is empty (except unrelated `stopPropagation` in comboboxes).

### Phase 6 — Clean-up (½ day)
- Delete `MasterDetail.errorText` (pass-through to `UI.errorText`); pages use `UI.errorText`.
- Update the header comment of `master-detail.js` with the interface in §4 (it is the only documentation callers read).
- `docs/regression-checklist.md`: add «create each directory record by tabbing through fields; type during save» checks for all 7 pages.
- Mark this plan done; record progress below.

## 6. Visible changes

1. **Rooms** (approved 2026-11-20): the explicit «Створити аудиторію» button goes; a Room is created on blur once name, building, type and capacity are filled, like Groups. No `createButton` option is added to MasterDetail.
2. **After Promotion the detail re-renders** instead of being patched. Focus and caret are kept (phase 4 tests); a screen reader may re-announce the heading once.

## 7. Risks

- **Re-render after Promotion loses state** the page kept only in the DOM (an open combobox, a scroll position). Mitigation: phase 4 tests for focus; check each page's mount for DOM-only state during phase 5.
- **Global write serialisation** (study-plan rows, availability grid) makes bursts slower. Today's private chains already serialise per row/grid; global order adds latency only when two areas are edited at once. Accept.
- **Never-settling `ctx.load` promises** hold closures until the page unloads. Volume is small (one per detail render). Accept.
- **Big-bang option change** (`save` → `create`/`update`) breaks a page not yet migrated. Phases 4 and 5 land together on one branch; the branch is not merged between them.

## 8. Estimate

≈ 6–7 days. Phase 1 is independent of 2–5 and can go first or in parallel.

## 9. Progress

_Not started._

## Revision log

- 2026-11-20 — created from the architecture review.
- 2026-11-20 — Rooms create button removal approved; §6 settled.
