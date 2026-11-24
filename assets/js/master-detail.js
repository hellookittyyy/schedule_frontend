/* Generic list + detail controller for directories. Classic script: window.MasterDetail.
   Needs ui.js (UI.*), icons.js; markup classes from components.css («master–detail»).

   MasterDetail.create(opts) -> md
     opts.root, load(lc) -> list (lc.isCurrent() is false once a newer reload started),
     renderRow(item), renderDetail(item, ctx) -> html, mount(el, item, ctx), remove(item),
     removeWarning(item) -> text | promise of text (optional; shown in the delete confirm,
       which opens once it settles; '' or null shows none),
     update(item, changes, ctx) -> saved record (PUT/PATCH of a saved record),
     newItem() -> Draft defaults (enables the add button), create(values, item) -> saved record,
     canCreate(values, item, ctx) -> true | text of what is missing
       (default: every [data-md-field][required] is non-empty),
     sort, groupBy, search(item, q), filters, getId, idParam, debounce, color, title, labels
       (addLabel, draftLabel, emptyText, selectText, removedText, removeQuestion, countLabel, …).
   md: reload(), select(id), current(), refresh(item), rerender(), setScope(key), setFilters(f),
       items(), startDraft().

   ctx (one per detail render): item, isDraft, el, alive(), pending, status(kind), refresh(item),
     rerender(), danger(o),
     load(promise): settles only while the same render and scope are on screen; otherwise never.
     queue(op, {errorText}): runs op() on the single write chain (field saves, page ops, DELETE),
       drives the status chip and the error toast; op must reject on failure. On a Draft the op
       runs after an in-flight create, or is held until the Draft is created (dropped on discard).
     save(changes): an update through update(); on a Draft the changes join the Draft values
       and ask to create.

   Draft lifecycle: [data-md-field] values are snapshotted on every input; change, blur or Enter
   (or ctx.save) asks to create; create(values) runs once when canCreate passes. Promotion adds
   the record to the list and the URL, waits for the write chain to be idle, then re-renders the
   detail, keeping focus, caret and values typed while the create was in flight (sent as updates).
   A Draft discarded during its create still joins the list once the create succeeds. */
(function () {
  'use strict';

  var DRAFT = '__draft';
  var DRAFT_TEXT = 'З’явиться у списку, щойно ви заповните обов’язкові поля.';
  // Returned by ctx.load when its result is stale: the promise never settles, so no page callback runs.
  var NEVER = new Promise(function () {});

  function esc(s) { return window.UI ? UI.escapeHtml(s) : String(s == null ? '' : s); }
  function icon(name, size) { return window.Icons ? Icons.svg(name, { size: size || 16 }) : ''; }
  function same(a, b) { return (a == null ? '' : String(a)) === (b == null ? '' : String(b)); }

  function noop() {}

  function create(opts) {
    opts = opts || {};
    var root = typeof opts.root === 'string' ? document.querySelector(opts.root) : opts.root;
    if (!root) throw new Error('MasterDetail: root not found');
    var idParam = opts.idParam || 'id';
    var getId = opts.getId || function (it) { return it.id; };
    var debounceMs = opts.debounce != null ? opts.debounce : 700;
    var filtersSrc = opts.filters || [];
    function getFilters() {
      var arr = (typeof filtersSrc === 'function' ? filtersSrc() : filtersSrc) || [];
      arr = arr.slice();
      if (!arr.length || arr[0].id !== 'all') arr.unshift({ id: 'all', label: 'Усі', test: function () { return true; } });
      return arr;
    }

    var items = [], loaded = false, query = '', filterId = urlFilter() || 'all';
    function urlFilter() { return new URLSearchParams(window.location.search).get('filter'); }
    var selectedId = null, beforeDraft = null, draft = null, dstate = null, ctx = null, renderToken = 0, loadToken = 0;
    var saveChain = Promise.resolve();
    var timers = {};
    var replacing = false;
    var scope = null;

    // One write chain for everything this master–detail sends: field saves, page ops and DELETE.
    function chain(fn) {
      var p = saveChain.then(fn);
      saveChain = p.then(null, noop);
      return p;
    }
    // Resolves once nothing is left on the write chain, including ops queued while waiting.
    function chainIdle() {
      var tail = saveChain;
      return tail.then(function () { return tail === saveChain ? null : chainIdle(); });
    }

    root.classList.add('card', 'md');
    if (opts.color) root.style.setProperty('--sec', 'var(' + opts.color + ')');
    root.innerHTML =
      '<div class="md-list">' +
        '<label class="search md-search">' + icon('search', 16) +
          '<input type="search" placeholder="' + esc(opts.searchPlaceholder || 'Пошук') + '" aria-label="' + esc(opts.searchPlaceholder || 'Пошук') + '"></label>' +
        '<div class="chips md-filters" role="group" aria-label="Фільтр"></div>' +
        '<div class="md-rows" role="listbox" aria-label="' + esc(opts.title || 'Список') + '"></div>' +
        '<div class="md-foot"></div>' +
      '</div>' +
      '<div class="md-detail"></div>';
    var listEl = root.querySelector('.md-list');
    var searchEl = root.querySelector('.md-search input');
    var filtersEl = root.querySelector('.md-filters');
    var rowsEl = root.querySelector('.md-rows');
    var footEl = root.querySelector('.md-foot');
    var detailEl = root.querySelector('.md-detail');
    if (!opts.search) root.querySelector('.md-search').classList.add('hide');

    /* ---------- add button ---------- */
    var addBtn = null;
    function placeAdd() {
      if (!opts.newItem || addBtn) return;
      var host = opts.addTarget || (window.Shell && Shell.actionsEl && Shell.actionsEl());
      addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn btn-primary';
      addBtn.innerHTML = icon('plus', 16) + esc(opts.addLabel || 'Додати');
      addBtn.addEventListener('click', startDraft);
      if (host) host.appendChild(addBtn);
      else { addBtn.classList.add('md-add'); listEl.insertBefore(addBtn, listEl.firstChild); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', placeAdd);
    else placeAdd();

    /* ---------- URL ---------- */
    function urlId() { return new URLSearchParams(window.location.search).get(idParam); }
    function setUrl(id, replace) {
      var u = new URL(window.location.href);
      if (id != null && id !== DRAFT) u.searchParams.set(idParam, id); else u.searchParams.delete(idParam);
      if (u.href === window.location.href) return;
      history[replace ? 'replaceState' : 'pushState']({ md: id }, '', u.href);
    }
    function setUrlFilter() {
      var u = new URL(window.location.href);
      if (filterId && filterId !== 'all') u.searchParams.set('filter', filterId); else u.searchParams.delete('filter');
      if (u.href !== window.location.href) history.replaceState(history.state, '', u.href);
    }
    window.addEventListener('popstate', function () {
      if (!loaded) return;
      filterId = urlFilter() || 'all';
      select(urlId(), { push: false });
    });

    /* ---------- list ---------- */
    function byId(id) {
      if (id == null) return null;
      for (var i = 0; i < items.length; i++) if (same(getId(items[i]), id)) return items[i];
      return null;
    }
    function matchesSearch(it) {
      return !query || !opts.search || opts.search(it, query.toLowerCase());
    }
    function currentFilter() {
      var filters = getFilters();
      for (var i = 0; i < filters.length; i++) if (filters[i].id === filterId) return filters[i];
      return filters[0];
    }
    function visibleItems() {
      var f = currentFilter();
      return items.filter(function (it) { return matchesSearch(it) && f.test(it); });
    }

    function renderFilters() {
      var filters = getFilters();
      if (!filters.some(function (f) { return f.id === filterId; })) filterId = 'all';
      if (filters.length < 2) { filtersEl.classList.add('hide'); return; }
      var base = items.filter(matchesSearch);
      filtersEl.innerHTML = filters.map(function (f) {
        var n = base.filter(f.test).length;
        var on = f.id === filterId;
        return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-md-filter="' + esc(f.id) + '">' +
          esc(f.label) + '<span class="n">' + n + '</span></button>';
      }).join('');
    }

    function rowHtml(it, id, active) {
      return '<div class="md-row' + (active ? ' is-active' : '') + '" role="option" aria-selected="' + active + '" tabindex="-1" data-md-id="' + esc(id) + '">' +
        opts.renderRow(it) + '</div>';
    }
    function draftRowHtml() {
      var inner = opts.renderDraftRow ? opts.renderDraftRow(draft) :
        '<span class="avatar sm sec">' + icon('plus', 14) + '</span><div class="grow"><div class="name">' + esc(opts.draftLabel || 'Новий запис') +
        '</div><div class="meta">Ще не збережено</div></div>';
      var active = selectedId === DRAFT;
      return '<div class="md-row is-draft' + (active ? ' is-active' : '') + '" role="option" aria-selected="' + active + '" tabindex="-1" data-md-id="' + DRAFT + '">' + inner + '</div>';
    }

    function renderRows() {
      if (!loaded) return;
      renderFilters();
      var vis = visibleItems();
      var focusedId = document.activeElement && rowsEl.contains(document.activeElement) ? document.activeElement.getAttribute('data-md-id') : null;
      if (!items.length && !draft) {
        UI.state(rowsEl, 'empty', { text: opts.emptyText || 'Записів поки немає', actionLabel: opts.newItem ? (opts.addLabel || 'Додати') : null, onAction: startDraft });
        footEl.classList.add('hide');
        return;
      }
      var html = draft ? draftRowHtml() : '';
      if (!vis.length) {
        rowsEl.innerHTML = html + '<div class="md-none"></div>';
        UI.state(rowsEl.querySelector('.md-none'), 'empty', { text: 'Нічого не знайдено', actionLabel: 'Скинути фільтри', onAction: resetFilters });
      } else if (opts.groupBy) {
        var order = [], groups = {};
        vis.forEach(function (it) {
          var g = opts.groupBy(it); g = g == null ? '' : String(g);
          if (!groups[g]) { groups[g] = []; order.push(g); }
          groups[g].push(it);
        });
        order.forEach(function (g) {
          html += '<div class="md-group" role="presentation">' + esc(g) + ' <span>' + groups[g].length + '</span></div>';
          groups[g].forEach(function (it) { var id = String(getId(it)); html += rowHtml(it, id, id === selectedId); });
        });
        rowsEl.innerHTML = html;
      } else {
        vis.forEach(function (it) { var id = String(getId(it)); html += rowHtml(it, id, id === selectedId); });
        rowsEl.innerHTML = html;
      }
      // Roving tabindex: the active row (or the first) is the list's tab stop.
      var stop = rowsEl.querySelector('.md-row.is-active') || rowsEl.querySelector('.md-row');
      if (stop) stop.tabIndex = 0;
      if (focusedId) {
        var f = rowsEl.querySelector('.md-row[data-md-id="' + cssEsc(focusedId) + '"]');
        if (f) { rowsEl.querySelectorAll('.md-row').forEach(function (r) { r.tabIndex = -1; }); f.tabIndex = 0; f.focus(); }
      }
      footEl.classList.remove('hide');
      var label = opts.countLabel || function (n) { return 'Усього: ' + n; };
      footEl.textContent = vis.length === items.length ? label(items.length) : 'Показано ' + vis.length + ' з ' + items.length;
    }
    function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'); }

    function resetFilters() {
      query = ''; searchEl.value = ''; filterId = 'all';
      setUrlFilter();
      renderRows();
    }

    searchEl.addEventListener('input', function () { query = searchEl.value.trim(); renderRows(); });
    searchEl.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && searchEl.value) { e.stopPropagation(); searchEl.value = ''; query = ''; renderRows(); }
      else if (e.key === 'ArrowDown') {
        var r = rowsEl.querySelector('.md-row');
        if (r) { e.preventDefault(); focusRow(r); }
      }
    });
    filtersEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-md-filter]');
      if (!b) return;
      filterId = b.getAttribute('data-md-filter');
      setUrlFilter();
      renderRows();
    });
    rowsEl.addEventListener('click', function (e) {
      var r = e.target.closest('.md-row');
      if (r) select(r.getAttribute('data-md-id'));
    });
    function focusRow(r) {
      rowsEl.querySelectorAll('.md-row').forEach(function (x) { x.tabIndex = -1; });
      r.tabIndex = 0; r.focus(); r.scrollIntoView({ block: 'nearest' });
    }
    rowsEl.addEventListener('keydown', function (e) {
      var row = e.target.closest && e.target.closest('.md-row');
      if (!row) return;
      var rows = Array.prototype.slice.call(rowsEl.querySelectorAll('.md-row'));
      var i = rows.indexOf(row);
      var next = null;
      if (e.key === 'ArrowDown') next = rows[i + 1];
      else if (e.key === 'ArrowUp') next = rows[i - 1];
      else if (e.key === 'Home') next = rows[0];
      else if (e.key === 'End') next = rows[rows.length - 1];
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(row.getAttribute('data-md-id')); return; }
      else return;
      e.preventDefault();
      if (next) focusRow(next);
    });

    /* ---------- detail ---------- */
    function current() {
      if (selectedId === DRAFT) return draft;
      return byId(selectedId);
    }

    function setStatus(c, kind) {
      if (!c || !c.alive()) return;
      var el = detailEl.querySelector('[data-md-saved]');
      if (!el) return;
      clearTimeout(el._mdT);
      if (kind === 'saving') { el.hidden = false; el.className = 'saved is-busy'; el.textContent = 'Зберігаю…'; }
      else if (kind === 'saved') { el.hidden = false; el.className = 'saved'; el.innerHTML = icon('check', 14) + 'Збережено'; }
      else { el.hidden = true; el.textContent = ''; }
    }

    function makeCtx(item, token) {
      var c = {
        item: item,
        isDraft: item === draft,
        ds: item === draft ? dstate : null,
        el: detailEl,
        sent: {},
        pending: 0,
        alive: function () { return token === renderToken; },
        load: function (p) {
          // The result only reaches the page while this render is still on screen.
          return Promise.resolve(p).then(function (v) {
            return c.alive() ? v : NEVER;
          }, function (err) {
            if (c.alive()) throw err;
            return NEVER;
          });
        },
        save: function (changes) { return c.isDraft ? draftSave(c, changes) : doSave(c, changes); },
        queue: function (op, o) { return c.isDraft ? draftQueue(c, op, o) : queue(c, op, o); },
        status: function (kind) { setStatus(c, kind); },
        refresh: function (it) { return refresh(it || c.item); },
        rerender: function () { if (c.alive()) renderDetail(); },
        danger: function (o) { c.dangerOpts = o || {}; return dangerHtml(c, c.dangerOpts); }
      };
      return c;
    }

    function renderDetail() {
      var prev = ctx;
      if (ctx) flushPending();
      var token = ++renderToken;
      clearTimers();
      var item = current();
      if (!item) {
        ctx = null;
        UI.state(detailEl, 'empty', { text: selectedId != null && loaded ? 'Запис не знайдено' : (opts.selectText || 'Оберіть запис зі списку') });
        return;
      }
      var keep = focusState();
      var c = ctx = makeCtx(item, token);
      var out = opts.renderDetail(item, c);
      // Removing a focused field fires focusout: that is not a user commit (a Draft must not create).
      replacing = true;
      try {
        detailEl.innerHTML = '';
        if (typeof out === 'string') detailEl.innerHTML = out; else if (out) detailEl.appendChild(out);
      } finally { replacing = false; }
      if (opts.mount) opts.mount(detailEl, item, c);
      if (c.isDraft) restoreDraft(c);
      // First render after Promotion: what was typed while the create was in flight goes out as updates.
      if (!c.isDraft && prev && prev.isDraft && prev.ds && prev.ds.created && prev.item === item) {
        setStatus(c, 'saved');
        applyTyped(c, prev.ds);
      }
      restoreFocus(keep);
    }

    function focusState() {
      var a = document.activeElement;
      if (!a || !a.id || !detailEl.contains(a)) return null;
      var st = { id: a.id };
      try { if (typeof a.selectionStart === 'number') { st.start = a.selectionStart; st.end = a.selectionEnd; } } catch (e) { /* no caret */ }
      return st;
    }
    function restoreFocus(st) {
      if (!st) return;
      var k = document.getElementById(st.id);
      if (!k || !detailEl.contains(k)) return;
      if (document.activeElement !== k) k.focus();
      if (st.start != null) {
        try { var n = String(k.value || '').length; k.setSelectionRange(Math.min(st.start, n), Math.min(st.end, n)); } catch (e) { /* no caret */ }
      }
    }

    function dangerHtml(c, o) {
      if (c.isDraft) {
        return '<div class="danger" data-md-draft><div><b>Новий запис</b><div class="muted sm">' +
          esc(o.draftText || DRAFT_TEXT) + '</div></div><span class="sp"></span>' +
          '<button type="button" class="btn btn-sm btn-ghost" data-md-discard>Скасувати</button></div>';
      }
      if (!opts.remove) return '';
      return '<div class="danger" data-md-danger><div><b>' + esc(o.title || 'Видалити запис') + '</b>' +
        (o.text ? '<div class="muted sm">' + esc(o.text) + '</div>' : '') + '</div><span class="sp"></span>' +
        '<button type="button" class="btn btn-sm btn-danger-ghost" data-confirm>' + icon('trash', 14) + 'Видалити</button></div>';
    }

    /* ---------- autosave fields: [data-md-field="key"] ---------- */
    function fieldValue(el) {
      if (el.type === 'checkbox') return el.checked;
      if (el.getAttribute('data-md-type') === 'number') return el.value === '' ? null : Number(el.value);
      return el.value.trim();
    }
    function clearTimers() { Object.keys(timers).forEach(function (k) { clearTimeout(timers[k]); }); timers = {}; }
    function commitField(el) {
      var c = ctx;
      if (replacing || !c || !el.isConnected || !detailEl.contains(el)) return;
      if (c.isDraft) { snapshotFields(c); requestCreate(c).catch(noop); return; }
      var key = el.getAttribute('data-md-field');
      clearTimeout(timers[key]); delete timers[key];
      var v = fieldValue(el);
      if (el.required && (v === '' || v == null)) {
        el.classList.add('is-err'); el.setAttribute('aria-invalid', 'true');
        return;
      }
      var ref = Object.prototype.hasOwnProperty.call(c.sent, key) ? c.sent[key] : c.item[key];
      if (same(ref, v)) { el.classList.remove('is-err'); el.removeAttribute('aria-invalid'); return; }
      c.sent[key] = v;
      var ch = {}; ch[key] = v;
      doSave(c, ch).then(function () {
        el.classList.remove('is-err'); el.removeAttribute('aria-invalid');
      }, function () {
        delete c.sent[key];
        el.classList.add('is-err'); el.setAttribute('aria-invalid', 'true');
      });
    }
    function flushPending() {
      Object.keys(timers).forEach(function (k) {
        var el = detailEl.querySelector('[data-md-field="' + cssEsc(k) + '"]');
        if (el) commitField(el);
      });
    }
    detailEl.addEventListener('input', function (e) {
      var el = e.target.closest && e.target.closest('[data-md-field]');
      if (!el || !ctx) return;
      el.classList.remove('is-err');
      if (ctx.isDraft) { snapshotFields(ctx); return; } // a Draft asks to create on change/blur/Enter
      if (el.tagName === 'SELECT' || el.type === 'checkbox') return; // commit on change/blur
      var key = el.getAttribute('data-md-field');
      clearTimeout(timers[key]);
      timers[key] = setTimeout(function () { commitField(el); }, debounceMs);
    });
    detailEl.addEventListener('change', function (e) {
      var el = e.target.closest && e.target.closest('[data-md-field]');
      if (el) commitField(el);
    });
    detailEl.addEventListener('focusout', function (e) {
      var el = e.target.closest && e.target.closest('[data-md-field]');
      if (el) commitField(el);
    });
    detailEl.addEventListener('keydown', function (e) {
      var el = e.target.closest && e.target.closest('input[data-md-field]');
      if (el && e.key === 'Enter') { e.preventDefault(); commitField(el); }
    });
    // Keep focus in the field so «Скасувати» does not blur-save the draft first.
    detailEl.addEventListener('mousedown', function (e) { if (e.target.closest('[data-md-discard]')) e.preventDefault(); });
    detailEl.addEventListener('click', function (e) {
      if (e.target.closest('[data-md-discard]')) {
        discardDraft();
        var back = byId(beforeDraft) || visibleItems()[0];
        select(back ? String(getId(back)) : null, { replace: true });
        return;
      }
      var trig = e.target.closest('[data-md-danger] [data-confirm]');
      if (trig && ctx) {
        var c = ctx;
        var dangerEl = trig.closest('[data-md-danger]');
        var ask = function (warning) {
          UI.confirmInline(dangerEl, {
            question: opts.removeQuestion || 'Точно видалити?',
            warning: warning || '',
            yes: 'Так, видалити',
            onYes: function () { return doRemove(c); }
          });
        };
        if (!opts.removeWarning || c.isDraft) { ask(''); return; }
        // Ask only once the warning is known, so «Так» is never clicked without it.
        if (trig.disabled) return;
        trig.disabled = true;
        c.load(Promise.resolve().then(function () { return opts.removeWarning(c.item); })
          .catch(function () { return 'Не вдалося перевірити, що ще буде видалено разом із записом.'; }))
          .then(function (warning) {
            trig.disabled = false;
            if (document.contains(dangerEl)) ask(warning);
          });
      }
    });

    // Copy server fields, except keys the page changed locally while the request was in flight.
    function merge(item, next, snap) {
      Object.keys(next || {}).forEach(function (k) {
        if (snap && Object.prototype.hasOwnProperty.call(snap, k) && json(item[k]) !== snap[k]) return;
        item[k] = next[k];
      });
    }
    function json(v) { try { return JSON.stringify(v); } catch (e) { return String(v); } }
    function snapshot(item) {
      var o = {};
      Object.keys(item).forEach(function (k) { o[k] = json(item[k]); });
      return o;
    }

    // Every page write goes through this: status chip, error toast, and «batch had a failure».
    function queue(c, op, o) {
      o = o || {};
      c.pending++;
      setStatus(c, 'saving');
      return chain(function () { return op(); }).then(function (v) {
        if (--c.pending === 0) { setStatus(c, c.batchFailed ? 'error' : 'saved'); c.batchFailed = false; }
        return v;
      }, function (err) {
        c.batchFailed = --c.pending > 0;
        setStatus(c, 'error');
        UI.toast(UI.errorText(err, o.errorText || 'Не вдалося зберегти'), { type: 'err' });
        throw err;
      });
    }

    // Field-style update of a saved record (also a Draft's update queued behind its create).
    function doSave(c, changes) {
      return queue(c, function () {
        if (getId(c.item) == null) return Promise.reject(new Error('Запис ще не створено'));
        var snap = snapshot(c.item);
        return Promise.resolve(opts.update(c.item, changes, c)).then(function (saved) {
          merge(c.item, saved || changes, saved ? snap : null);
          if (opts.sort) items.sort(opts.sort);
          renderRows();
          return c.item;
        });
      });
    }

    /* ---------- Draft lifecycle: hold until creatable -> create -> Promotion -> re-render ---------- */
    function newDraftState() {
      return { values: {}, raw: {}, required: [], held: [], sent: null, creating: null, created: false };
    }
    // The detail's [data-md-field] values become the Draft values (create never reads the DOM).
    function snapshotFields(c) {
      var ds = c.ds;
      if (!ds || !c.alive()) return;
      ds.required = [];
      detailEl.querySelectorAll('[data-md-field]').forEach(function (el) {
        var key = el.getAttribute('data-md-field');
        ds.values[key] = fieldValue(el);
        ds.raw[key] = el.type === 'checkbox' ? el.checked : el.value;
        if (el.required) ds.required.push(key);
      });
    }
    // A re-render of a Draft puts the typed values back and lets the page's own listeners see them.
    function restoreDraft(c) {
      var ds = c.ds;
      if (!ds) return;
      var restored = [];
      detailEl.querySelectorAll('[data-md-field]').forEach(function (el) {
        var key = el.getAttribute('data-md-field');
        if (!Object.prototype.hasOwnProperty.call(ds.raw, key)) return;
        if (el.type === 'checkbox') el.checked = !!ds.raw[key]; else el.value = ds.raw[key];
        restored.push(el);
      });
      restored.forEach(function (el) { el.dispatchEvent(new Event('input', { bubbles: true })); });
      snapshotFields(c);
    }
    function applyTyped(c, ds) {
      detailEl.querySelectorAll('[data-md-field]').forEach(function (el) {
        var key = el.getAttribute('data-md-field');
        if (!Object.prototype.hasOwnProperty.call(ds.raw, key)) return;
        if (same(ds.values[key], ds.sent && ds.sent[key])) return;
        if (el.type === 'checkbox') el.checked = !!ds.raw[key]; else el.value = ds.raw[key];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        commitField(el);
      });
    }
    function canCreate(c) {
      var ds = c.ds;
      if (opts.canCreate) return opts.canCreate(ds.values, c.item, c);
      return ds.required.every(function (k) { var v = ds.values[k]; return !(v === '' || v == null); });
    }
    function showMissing(c, why) {
      if (!c.alive()) return;
      var t = detailEl.querySelector('[data-md-draft] .muted');
      if (!t) return;
      t.textContent = typeof why === 'string' && why ? why : ((c.dangerOpts && c.dangerOpts.draftText) || DRAFT_TEXT);
    }
    // The ctx that currently shows this Draft (a re-render made a newer one), else the given one.
    function live(c) { return ctx && ctx.ds && ctx.ds === c.ds ? ctx : c; }

    // Asks to create the Draft: once, with all values, when canCreate passes. Resolves null when not creatable.
    function requestCreate(c) {
      var ds = c.ds, item = c.item;
      if (ds.created) return Promise.resolve(item);
      if (ds.creating) return ds.creating;
      var ok = canCreate(c);
      showMissing(c, ok);
      if (ok !== true) return Promise.resolve(null);
      var sent = ds.sent = Object.assign({}, ds.values);
      var snap = snapshot(item);
      ds.creating = queue(live(c), function () { return opts.create(Object.assign({}, sent), item); }).then(function (saved) {
        merge(item, saved || sent, saved ? snap : null);
        ds.created = true;
        promote(c);
        return item;
      }, function (err) {
        ds.creating = null;
        throw err;
      });
      return ds.creating;
    }

    // Promotion: the record joins the list and the URL; once the write chain is idle the detail re-renders.
    function promote(c) {
      var ds = c.ds, item = c.item;
      items.push(item);
      if (opts.sort) items.sort(opts.sort);
      if (draft !== item) { ds.held = []; renderRows(); return; } // discarded while the create was in flight
      draft = null; dstate = null;
      if (selectedId === DRAFT) { selectedId = String(getId(item)); setUrl(selectedId, true); }
      renderRows();
      ds.held.splice(0).forEach(function (h) { queue(live(c), h.op, h.o).then(h.res, h.rej); });
      // A macrotask later, so ops queued in reaction to this create are on the chain before we wait for it.
      setTimeout(function () {
        chainIdle().then(function () {
          var cur = live(c);
          if (cur === ctx && cur.alive() && cur.isDraft && current() === item) renderDetail();
        });
      }, 0);
    }

    // ctx.queue on a Draft: runs after an in-flight create, or is held until Promotion (dropped on discard).
    function draftQueue(c, op, o) {
      var ds = c.ds;
      if (ds.created) return queue(live(c), op, o);
      return new Promise(function (res, rej) {
        function hold() { ds.held.push({ op: op, o: o, res: res, rej: rej }); }
        if (ds.creating) ds.creating.then(function () { queue(live(c), op, o).then(res, rej); }, hold);
        else hold();
      });
    }
    // ctx.save on a Draft: the changes join the Draft values and ask to create (an update once created).
    function draftSave(c, changes) {
      var ds = c.ds;
      if (ds.created) return doSave(live(c), changes);
      Object.assign(ds.values, changes);
      if (ds.creating) return ds.creating.then(function () { return doSave(live(c), changes); });
      return requestCreate(c);
    }

    function doRemove(c) {
      var item = c.item;
      // Queue behind pending saves (e.g. the blur-save from clicking «Видалити»), so DELETE goes last.
      flushPending();
      var p = chain(function () { return opts.remove(item); });
      return p.then(function () {
        var vis = visibleItems();
        var idx = vis.indexOf(item);
        items = items.filter(function (x) { return x !== item; });
        var rest = vis.filter(function (x) { return x !== item; });
        var nxt = (idx < 0 ? rest[0] : rest[Math.min(idx, rest.length - 1)]) || null;
        UI.toast(opts.removedText || 'Видалено', { type: 'ok' });
        select(nxt ? String(getId(nxt)) : null, { replace: true });
      }, function (err) {
        UI.toast(UI.errorText(err, 'Не вдалося видалити'), { type: 'err' });
      });
    }

    /* ---------- selection ---------- */
    function discardDraft() {
      if (!draft) return;
      if (dstate) dstate.held = [];
      draft = null; dstate = null;
      if (selectedId === DRAFT) selectedId = null;
    }

    function select(id, o) {
      o = o || {};
      id = id == null || id === '' ? null : String(id);
      if (id !== DRAFT) { flushPending(); discardDraft(); }
      selectedId = id;
      if (o.push !== false) setUrl(id, !!o.replace);
      renderRows();
      renderDetail();
      var row = rowsEl.querySelector('.md-row.is-active');
      if (row) row.scrollIntoView({ block: 'nearest' });
    }

    function startDraft() {
      if (!opts.newItem || !loaded) return;
      if (!draft) {
        flushPending();
        beforeDraft = selectedId;
        draft = opts.newItem() || {};
        dstate = newDraftState();
        selectedId = DRAFT;
        setUrl(null, false);
        renderRows();
        renderDetail();
      }
      var f = detailEl.querySelector('[data-md-field]');
      if (f) f.focus();
    }

    function refresh(item) {
      if (!item) return null;
      var ex = byId(getId(item));
      if (ex && ex !== item) Object.assign(ex, item);
      if (opts.sort) items.sort(opts.sort);
      renderRows();
      return ex || item;
    }

    // The page's current scope (a semester id): a change invalidates every pending ctx.load.
    function setScope(key) {
      if (same(scope, key)) return;
      scope = key;
      renderDetail();
    }

    function reload() {
      var token = ++loadToken;
      loaded = false;
      UI.state(rowsEl, 'loading');
      UI.state(detailEl, 'loading');
      footEl.classList.add('hide');
      // Pages get isCurrent() so a stale response does not overwrite their own globals.
      var lc = { isCurrent: function () { return token === loadToken; } };
      return Promise.resolve().then(function () { return opts.load(lc); }).then(function (list) {
        if (token !== loadToken) return; // a newer reload owns the list
        items = (list && list.results) || list || [];
        if (opts.sort) items.sort(opts.sort);
        loaded = true;
        var want = urlId() || (selectedId && selectedId !== DRAFT ? selectedId : null);
        if (want == null) {
          var first = visibleItems()[0];
          select(first ? String(getId(first)) : null, { replace: true });
        } else {
          select(want, { push: false });
        }
      }, function (err) {
        if (token !== loadToken) return;
        console.warn('MasterDetail load failed', err);
        UI.state(rowsEl, 'error', { text: 'Не вдалося завантажити', actionLabel: 'Спробувати ще', onAction: reload });
        detailEl.innerHTML = '';
      });
    }

    reload();

    return {
      reload: reload,
      select: function (id) { select(id); },
      current: current,
      refresh: refresh,
      rerender: function () { renderDetail(); },
      setScope: function (key) { setScope(key); },
      setFilters: function (f) { filtersSrc = f; renderRows(); },
      items: function () { return items.slice(); },
      startDraft: startDraft
    };
  }

  window.MasterDetail = { create: create };
})();
