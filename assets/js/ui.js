/* Mosaic UI helpers: toast, inline confirm, drawer, states. Classic script: window.UI. */
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function icon(name, size) {
    return window.Icons ? window.Icons.svg(name, { size: size || 16 }) : '';
  }

  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  /* ---------- Toast ---------- */
  function toastContainer() {
    var c = document.querySelector('.toasts');
    if (!c) {
      c = document.createElement('div');
      c.className = 'toasts';
      c.setAttribute('role', 'status');
      c.setAttribute('aria-live', 'polite');
      document.body.appendChild(c);
    }
    return c;
  }

  function toast(message, opts) {
    opts = opts || {};
    var type = opts.type;
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'ok' || type === 'err' || type === 'warn' ? ' is-' + type : '');
    var msg = document.createElement('span');
    msg.className = 'toast-msg';
    msg.textContent = message == null ? '' : String(message);
    el.appendChild(msg);

    var timer = null, closed = false;
    function close() {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      el.classList.add('is-leaving');
      var done = false;
      function rm() { if (!done) { done = true; el.remove(); } }
      el.addEventListener('animationend', rm);
      setTimeout(rm, 400);
    }

    if (opts.action && opts.action.label) {
      var a = document.createElement('button');
      a.type = 'button';
      a.className = 'toast-action';
      a.textContent = opts.action.label;
      a.addEventListener('click', function () {
        try { if (opts.action.onClick) opts.action.onClick(); } finally { close(); }
      });
      el.appendChild(a);
    }
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'toast-close';
    x.setAttribute('aria-label', 'Закрити');
    x.innerHTML = icon('x', 14);
    x.addEventListener('click', close);
    el.appendChild(x);

    toastContainer().appendChild(el);
    var t = opts.timeout != null ? opts.timeout : (opts.action ? 8000 : 4000);
    if (t > 0) timer = setTimeout(close, t);
    return { close: close };
  }

  /* ---------- Inline confirm ---------- */
  function confirmInline(dangerEl, opts) {
    opts = opts || {};
    if (!dangerEl) return;
    var row = dangerEl.querySelector('.confirm');
    if (!row) {
      row = document.createElement('div');
      row.className = 'confirm';
      dangerEl.appendChild(row);
    }
    row.innerHTML = '';
    if (opts.warning) {
      var w = document.createElement('div');
      w.className = 'confirm-warning';
      w.style.cssText = 'width:100%;color:var(--muted)';
      w.textContent = opts.warning;
      row.style.flexWrap = 'wrap';
      row.appendChild(w);
    }
    var q = document.createElement('span');
    q.textContent = opts.question || 'Видалити?';
    var yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'btn btn-sm btn-danger';
    yes.textContent = opts.yes || 'Так';
    var no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn btn-sm btn-ghost';
    no.textContent = opts.no || 'Ні';
    row.appendChild(q); row.appendChild(yes); row.appendChild(no);

    var trigger = dangerEl.querySelector('[data-confirm]');
    var pending = false;
    if (dangerEl._uiConfirmOff) dangerEl._uiConfirmOff();
    var myId = dangerEl._uiConfirmId = (dangerEl._uiConfirmId || 0) + 1;
    function finish() {
      if (dangerEl._uiConfirmId !== myId) return;
      dangerEl.classList.remove('is-confirm');
      dangerEl.removeEventListener('keydown', onKey);
      if (dangerEl._uiConfirmOff === off) dangerEl._uiConfirmOff = null;
      if (trigger && document.contains(trigger)) { trigger.focus(); return; }
      // Trigger gone (row re-rendered): fall back to a focusable ancestor, else body.
      var host = document.contains(dangerEl) && dangerEl.parentElement && dangerEl.parentElement.closest(FOCUSABLE + ',[tabindex="-1"]');
      if (host) host.focus();
      else if (document.activeElement && dangerEl.contains(document.activeElement)) document.activeElement.blur();
    }
    function off() { dangerEl.removeEventListener('keydown', onKey); }
    dangerEl._uiConfirmOff = off;
    function cancel() {
      if (pending) return;
      finish();
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Esc') { e.stopPropagation(); cancel(); }
    }
    no.addEventListener('click', cancel);
    yes.addEventListener('click', function () {
      if (pending) return;
      var r;
      try { r = opts.onYes && opts.onYes(); } catch (err) { console.error(err); r = null; }
      if (r && typeof r.then === 'function') {
        pending = true; yes.disabled = no.disabled = true;
        r.then(function () {
          pending = false; yes.disabled = no.disabled = false;
          finish();
        }, function (err) { console.error(err); pending = false; yes.disabled = no.disabled = false; });
      } else {
        finish();
      }
    });
    dangerEl.addEventListener('keydown', onKey);
    dangerEl.classList.add('is-confirm');
    no.focus();
  }

  /* ---------- Drawer ---------- */
  function drawer(opts) {
    opts = opts || {};
    var opener = document.activeElement;
    var scrim = document.createElement('div');
    scrim.className = 'drawer-scrim';
    var el = document.createElement('aside');
    el.className = 'drawer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('tabindex', '-1');

    var head = document.createElement('div');
    head.className = 'drawer-head';
    var title = document.createElement('div');
    title.className = 'drawer-title';
    title.textContent = opts.title || '';
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'btn btn-ghost btn-sm';
    x.setAttribute('aria-label', 'Закрити');
    x.innerHTML = icon('x', 16);
    head.appendChild(title); head.appendChild(x);
    var body = document.createElement('div');
    body.className = 'drawer-body';
    function fill(node, v) {
      if (v == null) return;
      if (typeof v === 'string') node.innerHTML = v; else node.appendChild(v);
    }
    fill(body, opts.body);
    el.appendChild(head); el.appendChild(body);
    if (opts.foot != null) {
      var foot = document.createElement('div');
      foot.className = 'drawer-foot';
      fill(foot, opts.foot);
      el.appendChild(foot);
    }
    document.body.appendChild(scrim);
    document.body.appendChild(el);

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      scrim.classList.remove('is-open');
      el.classList.remove('is-open');
      setTimeout(function () { scrim.remove(); el.remove(); }, 300);
      if (opener && opener.focus && document.contains(opener)) opener.focus();
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        // An open inline confirm inside the drawer handles its own Esc.
        if (e.target && e.target.closest && e.target.closest('.danger.is-confirm') && el.contains(e.target)) return;
        e.stopPropagation(); close(); return;
      }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(el.querySelectorAll(FOCUSABLE), function (n) { return n.offsetParent !== null || n === document.activeElement; });
      if (!f.length) { e.preventDefault(); el.focus(); return; }
      var first = f[0], last = f[f.length - 1];
      if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    x.addEventListener('click', close);
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);

    // Force a frame so the transition runs.
    void el.offsetWidth;
    scrim.classList.add('is-open');
    el.classList.add('is-open');
    var firstField = body.querySelector(FOCUSABLE);
    var target = firstField || x;
    target.focus();
    setTimeout(function () { if (!closed && !el.contains(document.activeElement)) target.focus(); }, 60);
    return { el: el, close: close };
  }

  /* ---------- States ---------- */
  function state(container, kind, opts) {
    opts = opts || {};
    if (!container) return;
    var text = escapeHtml(opts.text || '');
    var btn = opts.actionLabel ? '<button type="button" class="btn btn-sm" data-state-action>' + escapeHtml(opts.actionLabel) + '</button>' : '';
    if (kind === 'loading') {
      container.innerHTML = '<div class="loading" role="status"><span class="spinner"></span><span>' + (text || 'Завантаження…') + '</span></div>';
      return;
    }
    var isErr = kind === 'error';
    container.innerHTML = '<div class="empty' + (isErr ? ' is-err' : '') + '"' + (isErr ? ' role="alert"' : '') + '>' +
      '<div class="empty-ico">' + icon(isErr ? 'alert' : 'inbox', 20) + '</div>' +
      '<b>' + (text || (isErr ? 'Не вдалося завантажити' : 'Нічого немає')) + '</b>' + btn + '</div>';
    var b = container.querySelector('[data-state-action]');
    if (b && opts.onAction) b.addEventListener('click', opts.onAction);
  }

  /* Drag & drop: UI.dnd(root, {draggable, dropzone, canDrop(card, zone), onDrop(card, zone)}).
     canDrop false marks the zone .is-conflict; onDrop throwing/rejecting reverts the move. */
  function dnd(root, opts) {
    opts = opts || {};
    if (!root) return { destroy: function () {} };
    var dragSel = opts.draggable || '.ls';
    var dropSel = opts.dropzone || '.wk .cell, .dropzone';
    var dragged = null, origin = null, originNext = null;
    function zoneOf(t) { var z = t && t.closest ? t.closest(dropSel) : null; return z && root.contains(z) ? z : null; }
    function clear() {
      Array.prototype.forEach.call(root.querySelectorAll('.is-over, .is-conflict'), function (n) {
        n.classList.remove('is-over'); n.classList.remove('is-conflict');
      });
    }
    function revert(card, from, next) {
      if (!from) return;
      if (next && next.parentNode === from) from.insertBefore(card, next); else from.appendChild(card);
    }
    function onStart(e) {
      var c = e.target && e.target.closest ? e.target.closest(dragSel) : null;
      if (!c || !root.contains(c)) return;
      if (c.classList.contains('is-locked')) { e.preventDefault(); return; }
      dragged = c; origin = c.parentNode; originNext = c.nextSibling;
      c.classList.add('is-dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', c.getAttribute('data-id') || ''); } catch (err) { /* IE */ }
      }
    }
    function onEnd() {
      if (dragged) dragged.classList.remove('is-dragging');
      dragged = null; clear();
    }
    function onOver(e) {
      var z = zoneOf(e.target);
      if (!z || !dragged || !root.contains(dragged)) return;
      if (opts.canDrop && !opts.canDrop(dragged, z)) {
        z.classList.remove('is-over'); z.classList.add('is-conflict');
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      z.classList.remove('is-conflict'); z.classList.add('is-over');
    }
    function onLeave(e) {
      var z = zoneOf(e.target);
      if (!z || (e.relatedTarget && z.contains(e.relatedTarget))) return;
      z.classList.remove('is-over'); z.classList.remove('is-conflict');
    }
    function onDropEv(e) {
      var z = zoneOf(e.target);
      if (!z || !dragged || !root.contains(dragged)) return;
      e.preventDefault();
      clear();
      var card = dragged, from = origin, next = originNext;
      dragged = origin = originNext = null;
      card.classList.remove('is-dragging');
      if (z === from) return;
      if (opts.canDrop && !opts.canDrop(card, z)) return;
      z.appendChild(card);
      function fail(err) {
        revert(card, from, next);
        toast((err && err.message) || 'Не вдалося перемістити', { type: 'err' });
      }
      var r;
      try { r = opts.onDrop ? opts.onDrop(card, z) : null; } catch (err) { fail(err); return; }
      if (r && typeof r.then === 'function') {
        card.classList.add('is-locked');
        r.then(function () { card.classList.remove('is-locked'); },
          function (err) { card.classList.remove('is-locked'); fail(err); });
      }
    }
    root.addEventListener('dragstart', onStart);
    root.addEventListener('dragend', onEnd);
    root.addEventListener('dragover', onOver);
    root.addEventListener('dragleave', onLeave);
    root.addEventListener('drop', onDropEv);
    return {
      destroy: function () {
        root.removeEventListener('dragstart', onStart);
        root.removeEventListener('dragend', onEnd);
        root.removeEventListener('dragover', onOver);
        root.removeEventListener('dragleave', onLeave);
        root.removeEventListener('drop', onDropEv);
        clear();
        if (dragged) dragged.classList.remove('is-dragging');
        dragged = origin = originNext = null;
      }
    };
  }

  /* ---------- Text helpers ---------- */
  // Ukrainian plural form: pluralForm(3, 'пара', 'пари', 'пар') → 'пари'; plural(...) → '3 пари'.
  function pluralForm(n, one, few, many) {
    var m10 = Math.abs(n) % 10, m100 = Math.abs(n) % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function plural(n, one, few, many) { return n + ' ' + pluralForm(n, one, few, many); }

  // Readable message from an apiRequest error (DRF detail / error / first field error).
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

  window.UI = { toast: toast, confirmInline: confirmInline, drawer: drawer, state: state, dnd: dnd, escapeHtml: escapeHtml,
    plural: plural, pluralForm: pluralForm, errorText: errorText };

})();
