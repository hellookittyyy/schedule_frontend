/* =====================================================================
   Schedule UI Kit — behaviours for the components in ui-kit.css
   No dependencies. Exposes a single global: window.UI
   Backwards-compatible aliases for admin/common.js:
     showToast(msg, type), showModal(id), hideModal(id)
   ===================================================================== */
(function () {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------- Toast ----------
     UI.toast('Збережено', 'success')
     UI.toast('Видалено', 'info', { action: 'Скасувати', onAction: () => restore() }) */
  function toast(message, type = 'info', opts = {}) {
    let box = document.querySelector('.ui-toasts');
    if (!box) { box = document.createElement('div'); box.className = 'ui-toasts'; document.body.appendChild(box); }
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const el = document.createElement('div');
    el.className = `ui-toast ui-toast--${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<span>${icons[type] || ''}</span><span>${esc(message)}</span>` +
      (opts.action ? `<button class="ui-toast__action">${esc(opts.action)}</button>` : '');
    box.appendChild(el);
    const remove = () => { el.classList.add('is-leaving'); el.addEventListener('animationend', () => el.remove(), { once: true }); };
    const timer = setTimeout(remove, opts.duration || 3000);
    el.addEventListener('click', (e) => {
      clearTimeout(timer);
      if (e.target.classList.contains('ui-toast__action') && opts.onAction) opts.onAction();
      remove();
    });
    return el;
  }

  /* ---------- Modal ----------
     <div class="ui-modal" id="x"><div class="ui-modal__dialog">…</div></div>
     UI.modal.open('x'); UI.modal.close('x'); closes on backdrop click + Esc */
  let lastFocus = null;
  const modal = {
    open(id) {
      const m = document.getElementById(id); if (!m) return;
      lastFocus = document.activeElement;
      m.classList.add('is-open');
      m.querySelector('input, select, textarea, button:not(.ui-modal__close)')?.focus();
    },
    close(id) {
      const m = id ? document.getElementById(id) : document.querySelector('.ui-modal.is-open');
      m?.classList.remove('is-open');
      lastFocus?.focus?.();
    },
    /* Promise-based confirm dialog: if (await UI.confirm({title, message})) … */
    confirm({ title = 'Підтвердження', message = '', confirmText = 'Видалити', cancelText = 'Скасувати', danger = true } = {}) {
      return new Promise((resolve) => {
        const wrap = document.createElement('div');
        wrap.className = 'ui-modal is-open';
        wrap.innerHTML = `<div class="ui-modal__dialog ui-modal__dialog--sm" role="alertdialog" aria-modal="true">
          <div class="ui-modal__header"><h2>${esc(title)}</h2><button class="ui-modal__close" data-r="0" aria-label="Закрити">&times;</button></div>
          <p style="margin:0;color:var(--ui-text-muted)">${message}</p>
          <div class="ui-modal__footer"><button class="ui-btn ui-btn--secondary" data-r="0">${esc(cancelText)}</button>
          <button class="ui-btn ${danger ? 'ui-btn--danger' : 'ui-btn--primary'}" data-r="1">${esc(confirmText)}</button></div></div>`;
        document.body.appendChild(wrap);
        wrap.querySelector('[data-r="1"]').focus();
        const done = (v) => { wrap.remove(); resolve(v); };
        wrap.addEventListener('click', (e) => { if (e.target === wrap) done(false); const r = e.target.dataset.r; if (r) done(r === '1'); });
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(false); });
      });
    },
  };

  /* ---------- Drawer (side panel) ----------
     <div class="ui-drawer-backdrop"></div><aside class="ui-drawer" id="d">…</aside>
     UI.drawer.open('d') */
  const drawer = {
    open(id) {
      const d = document.getElementById(id); if (!d) return;
      let bd = d.previousElementSibling;
      if (!bd || !bd.classList.contains('ui-drawer-backdrop')) {
        bd = document.createElement('div'); bd.className = 'ui-drawer-backdrop'; d.before(bd);
      }
      bd.onclick = () => drawer.close(id);
      requestAnimationFrame(() => { bd.classList.add('is-open'); d.classList.add('is-open'); });
    },
    close(id) {
      const d = id ? document.getElementById(id) : document.querySelector('.ui-drawer.is-open');
      d?.classList.remove('is-open'); d?.previousElementSibling?.classList.remove('is-open');
    },
  };

  document.addEventListener('click', (e) => {
    if (e.target.classList?.contains('ui-modal') && !e.target.querySelector('[role="alertdialog"]')) e.target.classList.remove('is-open');
    const closer = e.target.closest?.('[data-ui-close]');
    if (closer) { modal.close(closer.dataset.uiClose || undefined); drawer.close(); }
    const opener = e.target.closest?.('[data-ui-open]');
    if (opener) { const id = opener.dataset.uiOpen; document.getElementById(id)?.classList.contains('ui-drawer') ? drawer.open(id) : modal.open(id); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { modal.close(); drawer.close(); } });

  /* ---------- Combobox / autocomplete ----------
     UI.combobox(inputEl, {
       source: async (query) => [{ value: 'КН-31', label: 'КН-31', meta: '3 курс', id: 7 }],
       onSelect: (item) => hiddenInput.value = item.id,
       minChars: 0, debounce: 250 }) */
  function combobox(input, { source, onSelect, minChars = 0, debounce: wait = 250, emptyText = 'Нічого не знайдено' } = {}) {
    const wrap = input.closest('.ui-combo') || (() => { const w = document.createElement('div'); w.className = 'ui-combo'; input.before(w); w.appendChild(input); return w; })();
    const list = document.createElement('div');
    list.className = 'ui-combo__list'; list.setAttribute('role', 'listbox');
    wrap.appendChild(list);
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.autocomplete = 'off';
    let items = [], active = -1;

    const render = () => {
      list.innerHTML = items.length
        ? items.map((it, i) => `<div class="ui-combo__item ${i === active ? 'is-active' : ''}" role="option" data-i="${i}">${esc(it.label ?? it.value)}${it.meta ? `<small>${esc(it.meta)}</small>` : ''}</div>`).join('')
        : `<div class="ui-combo__empty">${esc(emptyText)}</div>`;
      list.classList.add('is-open');
    };
    const load = debounce(async () => {
      if (input.value.length < minChars) { list.classList.remove('is-open'); return; }
      items = await source(input.value.trim()); active = -1; render();
    }, wait);
    const pick = (i) => { const it = items[i]; if (!it) return; input.value = it.value; list.classList.remove('is-open'); onSelect?.(it); };

    input.addEventListener('input', load);
    input.addEventListener('focus', load);
    input.addEventListener('blur', () => setTimeout(() => list.classList.remove('is-open'), 120));
    input.addEventListener('keydown', (e) => {
      if (!list.classList.contains('is-open')) return;
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && active >= 0) { pick(active); e.preventDefault(); }
      else if (e.key === 'Escape') list.classList.remove('is-open');
    });
    list.addEventListener('mousedown', (e) => { const el = e.target.closest('[data-i]'); if (el) pick(+el.dataset.i); });
    return { refresh: load };
  }

  /* ---------- Segmented control ----------
     UI.segmented(el, (value) => …)   buttons need data-value */
  function segmented(el, onChange) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      el.querySelectorAll('button').forEach((x) => x.classList.toggle('is-active', x === b));
      onChange?.(b.dataset.value);
    });
  }

  /* ---------- Month calendar ----------
     UI.calendar(el, { year, month (0-11), today: Date, dayClass: (date) => 'is-workday',
                       dayLabel: (date) => '2 пари', onSelect: (date) => … })
     Returns { next(), prev(), set(year, month) } */
  const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  function calendar(el, opts = {}) {
    const today = opts.today || new Date();
    let y = opts.year ?? today.getFullYear(), m = opts.month ?? today.getMonth(), selected = null;
    const same = (a, b) => a && b && a.toDateString() === b.toDateString();
    function draw() {
      const first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
      let html = `<div class="ui-calendar__nav"><button class="ui-btn ui-btn--secondary ui-btn--icon ui-btn--sm" data-nav="-1" aria-label="Попередній місяць">‹</button>
        <h3>${MONTHS[m]} ${y}</h3><button class="ui-btn ui-btn--secondary ui-btn--icon ui-btn--sm" data-nav="1" aria-label="Наступний місяць">›</button></div><div class="ui-calendar">`;
      html += WD.map((d) => `<div class="ui-calendar__wd">${d}</div>`).join('');
      html += '<span class="ui-calendar__day is-empty"></span>'.repeat(lead);
      for (let d = 1; d <= days; d++) {
        const date = new Date(y, m, d);
        const wk = date.getDay() === 0 || date.getDay() === 6;
        const cls = [opts.dayClass ? opts.dayClass(date) : (wk ? 'is-weekend' : 'is-workday')];
        if (same(date, today)) cls.push('is-today');
        if (same(date, selected)) cls.push('is-selected');
        const lbl = opts.dayLabel?.(date);
        html += `<button class="ui-calendar__day ${cls.join(' ')}" data-d="${d}">${d}${lbl ? `<span class="ui-calendar__dot">${esc(lbl)}</span>` : ''}</button>`;
      }
      el.innerHTML = html + '</div>';
    }
    el.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) { m += +nav.dataset.nav; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } draw(); return; }
      const day = e.target.closest('[data-d]');
      if (day) { selected = new Date(y, m, +day.dataset.d); draw(); opts.onSelect?.(selected); }
    });
    draw();
    return { next: () => el.querySelector('[data-nav="1"]').click(), prev: () => el.querySelector('[data-nav="-1"]').click(), set: (yy, mm) => { y = yy; m = mm; draw(); } };
  }

  /* ---------- Drag & drop for lesson cards ----------
     UI.dnd(rootEl, {
       draggable: '.ui-lesson',           // what can be dragged
       dropzone: '.ui-dropzone',          // where it can be dropped
       canDrop: (card, zone) => true,     // return false to block (e.g. teacher unavailable)
       onDrop: async (card, zone) => {}   // throw to revert the move
     }) */
  function dnd(root, { draggable = '.ui-lesson', dropzone = '.ui-dropzone', canDrop, onDrop } = {}) {
    let dragged = null, origin = null;
    root.addEventListener('dragstart', (e) => {
      const c = e.target.closest?.(draggable); if (!c || c.classList.contains('is-locked')) { e.preventDefault(); return; }
      dragged = c; origin = c.parentElement; c.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.dataset.id || '');
    });
    root.addEventListener('dragend', () => { dragged?.classList.remove('is-dragging'); dragged = null; });
    root.addEventListener('dragover', (e) => {
      const z = e.target.closest?.(dropzone); if (!z || !dragged) return;
      if (canDrop && !canDrop(dragged, z)) return;
      e.preventDefault(); z.classList.add('is-over');
    });
    root.addEventListener('dragleave', (e) => e.target.closest?.(dropzone)?.classList.remove('is-over'));
    root.addEventListener('drop', async (e) => {
      const z = e.target.closest?.(dropzone); if (!z || !dragged) return;
      e.preventDefault(); z.classList.remove('is-over');
      const card = dragged, from = origin;
      z.appendChild(card);
      try { await onDrop?.(card, z); } catch (err) { from.appendChild(card); toast(err.message || 'Не вдалося перемістити', 'error'); }
    });
  }

  /* ---------- Overlay loader with log ----------
     const l = UI.loader({ title: 'Генерація…', text: '…' }); l.log('> step'); l.close(); */
  function loader({ title = 'Завантаження…', text = '', withLog = true } = {}) {
    const el = document.createElement('div');
    el.className = 'ui-loader is-open';
    el.innerHTML = `<div class="ui-loader__box"><span class="ui-spinner"></span><h3>${esc(title)}</h3><p>${esc(text)}</p>${withLog ? '<div class="ui-log"></div>' : ''}</div>`;
    document.body.appendChild(el);
    const logEl = el.querySelector('.ui-log');
    return {
      log(line) { if (!logEl) return; logEl.textContent += line + '\n'; logEl.scrollTop = logEl.scrollHeight; },
      close() { el.remove(); },
    };
  }

  /* ---------- Sidebar (config-driven, same idea as admin/sidebar.js) ----------
     UI.sidebar(container, { brand: '📚 Розклад', groups: [{ title, items: [{ href, icon, text, count, exact }] }] }) */
  function sidebar(container, { brand = '📚 Розклад', groups = [] } = {}) {
    const path = location.pathname.replace(/index\.html$/, '').replace(/\.html$/, '');
    const isActive = (it) => it.exact ? path === it.href : path.includes(it.href.replace(/\/$/, ''));
    container.innerHTML = `<nav class="ui-sidebar" aria-label="Головне меню"><div class="ui-sidebar__brand">${brand}</div>` +
      groups.map((g) => (g.title ? `<div class="ui-sidebar__group">${esc(g.title)}</div>` : '') +
        g.items.map((it) => `<a class="ui-sidebar__link ${isActive(it) ? 'is-active' : ''}" href="${it.href}"${isActive(it) ? ' aria-current="page"' : ''}>
          <span>${it.icon || ''}</span><span>${esc(it.text)}</span>${it.count != null ? `<span class="ui-sidebar__count">${it.count}</span>` : ''}</a>`).join('')).join('') + '</nav>';
  }

  /* ---------- Empty / loading / error states ---------- */
  const state = {
    loading: (el, text = 'Завантаження…') => { el.innerHTML = `<div class="ui-empty"><span class="ui-spinner"></span><p>${esc(text)}</p></div>`; },
    empty: (el, { icon = '📭', title = 'Нічого немає', text = '' } = {}) => { el.innerHTML = `<div class="ui-empty"><span class="ui-empty__icon">${icon}</span><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`; },
    error: (el, message) => { el.innerHTML = `<div class="ui-empty"><span class="ui-empty__icon">⚠️</span><h3>Помилка</h3><p>${esc(message)}</p></div>`; },
  };

  /* ---------- Lesson card renderer (shared by public page and builder) ---------- */
  const LESSON_TYPES = { lecture: ['lec', 'Лекція'], practice: ['pr', 'Практика'], lab: ['lab', 'Лабораторна'] };
  function lessonCard(l, { compact = false } = {}) {
    const [cls, label] = LESSON_TYPES[l.type] || ['', l.type || ''];
    if (compact) return `<div class="ui-lesson ui-lesson--compact ui-lesson--${cls}" draggable="true" data-id="${esc(l.id)}"><div class="ui-lesson__title">${esc(l.subject)}</div><span>${esc(label)} · ${esc(l.room)}</span></div>`;
    return `<div class="ui-lesson ui-lesson--${cls}"><div class="ui-lesson__time"><b>${esc(l.start)}</b>${esc(l.end)}</div>
      <div><div class="ui-lesson__title">${esc(l.subject)}</div><div class="ui-lesson__meta"><span class="ui-badge ui-badge--${cls}">${esc(label)}</span>
      <span>👨‍🏫 ${esc(l.teacher || '—')}</span><span>👥 ${esc(l.group || '—')}</span><span>📍 ${esc(l.room || '—')}</span></div></div></div>`;
  }

  window.UI = { toast, modal, drawer, confirm: modal.confirm, combobox, segmented, calendar, dnd, loader, sidebar, state, lessonCard, esc, debounce };

  /* aliases so existing pages can switch to the kit without code changes */
  window.showToast = window.showToast || ((m, t) => toast(m, t));
  window.showModal = window.showModal || ((id) => modal.open(id));
  window.hideModal = window.hideModal || ((id) => modal.close(id));
})();
