/* Generic list + detail controller for directories. Classic script: window.MasterDetail.
   Needs ui.js (UI.*), icons.js; markup classes from components.css («master–detail»). */
(function () {
  'use strict';

  var DRAFT = '__draft';

  function esc(s) { return window.UI ? UI.escapeHtml(s) : String(s == null ? '' : s); }
  function icon(name, size) { return window.Icons ? Icons.svg(name, { size: size || 16 }) : ''; }
  function same(a, b) { return (a == null ? '' : String(a)) === (b == null ? '' : String(b)); }

  // Readable message from an apiRequest error (DRF field errors, detail, error).
  function errorText(err, fallback) {
    var d = err && err.data;
    if (d && typeof d === 'object') {
      if (d.detail) return String(d.detail);
      if (d.error) return String(d.error);
      var keys = Object.keys(d);
      for (var i = 0; i < keys.length; i++) {
        var v = d[keys[i]];
        if (Array.isArray(v) && v.length) return String(v[0]);
        if (typeof v === 'string') return v;
      }
    }
    return (err && err.message) || fallback || 'Сталася помилка';
  }

  function create(opts) {
    opts = opts || {};
    var root = typeof opts.root === 'string' ? document.querySelector(opts.root) : opts.root;
    if (!root) throw new Error('MasterDetail: root not found');
    var idParam = opts.idParam || 'id';
    var getId = opts.getId || function (it) { return it.id; };
    var debounceMs = opts.debounce != null ? opts.debounce : 700;
    var filters = (opts.filters || []).slice();
    if (!filters.length || filters[0].id !== 'all') filters.unshift({ id: 'all', label: 'Усі', test: function () { return true; } });

    var items = [], loaded = false, query = '', filterId = 'all';
    var selectedId = null, draft = null, ctx = null, renderToken = 0;
    var saveChain = Promise.resolve();
    var timers = {};

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
      if (!opts.onCreate || addBtn) return;
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
    window.addEventListener('popstate', function () {
      if (!loaded) return;
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
      for (var i = 0; i < filters.length; i++) if (filters[i].id === filterId) return filters[i];
      return filters[0];
    }
    function visibleItems() {
      var f = currentFilter();
      return items.filter(function (it) { return matchesSearch(it) && f.test(it); });
    }

    function renderFilters() {
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
        UI.state(rowsEl, 'empty', { text: opts.emptyText || 'Записів поки немає', actionLabel: opts.onCreate ? (opts.addLabel || 'Додати') : null, onAction: startDraft });
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
        el: detailEl,
        sent: {},
        alive: function () { return token === renderToken; },
        save: function (changes) { return doSave(c, changes); },
        status: function (kind) { setStatus(c, kind); },
        refresh: function (it) { return refresh(it || c.item); },
        rerender: function () { if (c.alive()) renderDetail(); },
        danger: function (o) { return dangerHtml(c, o || {}); }
      };
      return c;
    }

    function renderDetail() {
      var token = ++renderToken;
      clearTimers();
      var item = current();
      if (!item) {
        ctx = null;
        UI.state(detailEl, 'empty', { text: selectedId != null && loaded ? 'Запис не знайдено' : (opts.selectText || 'Оберіть запис зі списку') });
        return;
      }
      var keep = document.activeElement && detailEl.contains(document.activeElement) ? document.activeElement.id : null;
      var c = ctx = makeCtx(item, token);
      var out = opts.renderDetail(item, c);
      detailEl.innerHTML = '';
      if (typeof out === 'string') detailEl.innerHTML = out; else if (out) detailEl.appendChild(out);
      if (opts.mount) opts.mount(detailEl, item, c);
      if (keep) { var k = document.getElementById(keep); if (k && detailEl.contains(k)) k.focus(); }
    }

    function dangerHtml(c, o) {
      if (c.isDraft) {
        return '<div class="danger" data-md-draft><div><b>Новий запис</b><div class="muted sm">' +
          esc(o.draftText || 'З’явиться у списку, щойно ви заповните обов’язкові поля.') + '</div></div><span class="sp"></span>' +
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
      if (!c || !el.isConnected || !detailEl.contains(el)) return;
      var key = el.getAttribute('data-md-field');
      clearTimeout(timers[key]); delete timers[key];
      var v = fieldValue(el);
      if (el.required && (v === '' || v == null)) {
        if (!c.isDraft) { el.classList.add('is-err'); el.setAttribute('aria-invalid', 'true'); }
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
      if (ctx.isDraft || el.tagName === 'SELECT' || el.type === 'checkbox') return; // commit on change/blur
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
      if (e.target.closest('[data-md-discard]')) { discardDraft(); select(null, { replace: true }); return; }
      var trig = e.target.closest('[data-md-danger] [data-confirm]');
      if (trig && ctx) {
        var c = ctx;
        UI.confirmInline(trig.closest('[data-md-danger]'), {
          question: opts.removeQuestion || 'Точно видалити?',
          yes: 'Так, видалити',
          onYes: function () { return doRemove(c); }
        });
      }
    });

    function doSave(c, changes) {
      if (!opts.save) return Promise.reject(new Error('MasterDetail: save is not configured'));
      setStatus(c, 'saving');
      var p = saveChain.then(function () { return opts.save(c.item, changes); });
      saveChain = p.then(null, function () {});
      return p.then(function (saved) {
        var next = saved || changes;
        Object.assign(c.item, next);
        if (c.isDraft) {
          c.isDraft = false;
          items.push(c.item);
          if (opts.sort) items.sort(opts.sort);
          if (draft === c.item) {
            draft = null;
            selectedId = String(getId(c.item));
            setUrl(selectedId, true);
            renderRows();
            if (c.alive()) { renderDetail(); setStatus(ctx, 'saved'); }
          } else {
            renderRows();
          }
        } else {
          if (opts.sort) items.sort(opts.sort);
          renderRows();
          setStatus(c, 'saved');
        }
        return c.item;
      }, function (err) {
        setStatus(c, 'error');
        UI.toast(errorText(err, 'Не вдалося зберегти'), { type: 'err' });
        throw err;
      });
    }

    function doRemove(c) {
      var item = c.item;
      return Promise.resolve().then(function () { return opts.remove(item); }).then(function () {
        var vis = visibleItems();
        var idx = vis.indexOf(item);
        items = items.filter(function (x) { return x !== item; });
        var rest = vis.filter(function (x) { return x !== item; });
        var nxt = rest[Math.min(idx, rest.length - 1)] || null;
        UI.toast(opts.removedText || 'Видалено', { type: 'ok' });
        select(nxt ? String(getId(nxt)) : null, { replace: true });
      }, function (err) {
        UI.toast(errorText(err, 'Не вдалося видалити'), { type: 'err' });
      });
    }

    /* ---------- selection ---------- */
    function discardDraft() {
      if (!draft) return;
      draft = null;
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
      if (!opts.onCreate || !loaded) return;
      if (!draft) {
        flushPending();
        draft = opts.onCreate() || {};
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

    function reload() {
      loaded = false;
      UI.state(rowsEl, 'loading');
      UI.state(detailEl, 'loading');
      footEl.classList.add('hide');
      return Promise.resolve().then(opts.load).then(function (list) {
        items = (list && list.results) || list || [];
        if (opts.sort) items.sort(opts.sort);
        loaded = true;
        var want = selectedId && selectedId !== DRAFT ? selectedId : urlId();
        if (want == null) {
          var first = visibleItems()[0];
          select(first ? String(getId(first)) : null, { replace: true });
        } else {
          select(want, { push: false });
        }
      }, function (err) {
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
      items: function () { return items.slice(); },
      create: startDraft
    };
  }

  window.MasterDetail = { create: create, errorText: errorText };
})();
