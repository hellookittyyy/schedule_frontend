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
    function cancel() {
      if (pending) return;
      dangerEl.classList.remove('is-confirm');
      dangerEl.removeEventListener('keydown', onKey);
      if (trigger) trigger.focus();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
    }
    no.addEventListener('click', cancel);
    yes.addEventListener('click', function () {
      if (pending) return;
      var r;
      try { r = opts.onYes && opts.onYes(); } catch (err) { console.error(err); r = null; }
      if (r && typeof r.then === 'function') {
        pending = true; yes.disabled = no.disabled = true;
        var fin = function () {
          pending = false; yes.disabled = no.disabled = false;
          dangerEl.classList.remove('is-confirm');
        };
        r.then(fin, function (err) { console.error(err); pending = false; yes.disabled = no.disabled = false; });
      } else {
        dangerEl.classList.remove('is-confirm');
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
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
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

  window.UI = { toast: toast, confirmInline: confirmInline, drawer: drawer, state: state, escapeHtml: escapeHtml };

  /* Migration aliases: only where admin/common.js has not defined them. */
  if (typeof window.showToast !== 'function') {
    window.showToast = function (msg, type) {
      toast(msg, { type: type === 'error' ? 'err' : type === 'success' ? 'ok' : type });
    };
  }
  if (typeof window.showModal !== 'function') {
    window.showModal = function (id) { var m = document.getElementById(id); if (m) m.classList.add('show'); };
  }
  if (typeof window.hideModal !== 'function') {
    window.hideModal = function (id) { var m = document.getElementById(id); if (m) m.classList.remove('show'); };
  }
})();
