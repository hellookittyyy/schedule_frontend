/* Mosaic app shell: nav column, top bar, theme toggle, mobile drawer.
   Classic script; needs icons.js (window.Icons) and theme-boot.js (window.Theme). */
(function () {
  'use strict';

  // Plan 0001 §4. hidden: kept in config, not rendered (page not built yet).
  var NAV = [
    { items: [
      { id: 'home', text: 'Головна', href: '/admin/', icon: 'home', c: 2, exact: true },
      { id: 'tasks', text: 'Задачі', href: '/admin/tasks/', icon: 'tasks', c: 1, hidden: true },
      { id: 'semester', text: 'Семестр', href: '/admin/semesters/', icon: 'semester', c: 3 }
    ] },
    { label: 'Довідники', items: [
      { id: 'teachers', text: 'Викладачі', href: '/admin/teachers/', icon: 'teachers', c: 4 },
      { id: 'groups', text: 'Групи', href: '/admin/groups/', icon: 'groups', c: 5 },
      { id: 'streams', text: 'Потоки', href: '/admin/streams/', icon: 'streams', c: 6 },
      { id: 'rooms', text: 'Аудиторії', href: '/admin/rooms/', icon: 'rooms', c: 1 },
      { id: 'subjects', text: 'Предмети', href: '/admin/subjects/', icon: 'subjects', c: 3 }
    ] },
    { label: 'Планування', items: [
      { id: 'study-plans', text: 'Навчальні плани', href: '/admin/study-plans/', icon: 'study-plans', c: 4 },
      { id: 'constraints', text: 'Обмеження', href: '/admin/constraints/', icon: 'constraints', c: 5 },
      { id: 'schedule', text: 'Розклад', href: '/admin/schedule/', icon: 'schedule', c: 2 }
    ] }
  ];

  // Pages below a nav item that need their own title / crumbs.
  var SUBPAGES = {
    '/admin/semesters/detail.html': { title: 'Деталі семестру', crumbs: ['Семестр', 'Деталі'] }
  };

  var state = { app: null, nav: null, top: null, menuBtn: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function icon(name, size) {
    return window.Icons ? Icons.svg(name, { cls: 'sh-icon', size: size || 18 }) : '';
  }

  function isActive(item, path) {
    if (item.exact) return path === item.href || path === item.href + 'index.html';
    var base = item.href.replace(/\/$/, '');
    return path === base || path.indexOf(base + '/') === 0;
  }

  function findActive(path) {
    for (var g = 0; g < NAV.length; g++) {
      for (var i = 0; i < NAV[g].items.length; i++) {
        var it = NAV[g].items[i];
        if (!it.hidden && isActive(it, path)) return { item: it, group: NAV[g] };
      }
    }
    return null;
  }

  function navHtml(path) {
    var html = '<a class="sh-brand" href="/admin/"><span class="sh-brand-mark">Р</span>' +
      '<span class="sh-brand-name">Розклад</span></a>';
    NAV.forEach(function (group) {
      var items = group.items.filter(function (it) { return !it.hidden; });
      if (!items.length) return;
      html += '<div class="sh-nav-group">' +
        (group.label ? '<div class="sh-nav-label">' + esc(group.label) + '</div>' : '');
      items.forEach(function (it) {
        var on = isActive(it, path);
        html += '<a class="sh-nav-item' + (on ? ' is-active' : '') + '"' +
          (on ? ' aria-current="page"' : '') + ' style="--c:var(--c' + it.c + ')"' +
          ' href="' + esc(it.href) + '">' + icon(it.icon) +
          '<span class="sh-nav-text">' + esc(it.text) + '</span></a>';
      });
      html += '</div>';
    });
    return html;
  }

  function themeIcon() { return icon(window.Theme && Theme.get() === 'dark' ? 'sun' : 'moon', 17); }

  function topHtml() {
    return '<button type="button" class="sh-menu-btn" aria-label="Меню" aria-controls="sh-nav" aria-expanded="false">' +
      icon('menu') + '</button>' +
      '<div class="sh-heading"><div class="sh-crumbs" hidden></div><h1 class="sh-title"></h1></div>' +
      '<div class="sh-actions"><span class="sh-page-actions" style="display:contents"></span>' +
      '<button type="button" class="sh-theme" aria-label="Змінити тему">' + themeIcon() + '</button></div>';
  }

  /* ---------- drawer (below 980px) ---------- */
  function isOpen() { return !!state.app && state.app.classList.contains('sh-nav-open'); }

  function openNav() {
    if (!state.app) return;
    state.app.classList.add('sh-nav-open');
    if (state.menuBtn) state.menuBtn.setAttribute('aria-expanded', 'true');
    var target = state.nav.querySelector('.sh-nav-item.is-active') || state.nav.querySelector('a');
    if (target) setTimeout(function () { target.focus(); }, 30);
  }

  function closeNav(restoreFocus) {
    if (!isOpen()) return;
    state.app.classList.remove('sh-nav-open');
    if (state.menuBtn) {
      state.menuBtn.setAttribute('aria-expanded', 'false');
      if (restoreFocus) state.menuBtn.focus();
    }
  }

  function onKey(e) {
    if ((e.key === 'Escape' || e.key === 'Esc') && isOpen()) closeNav(true);
  }

  /* ---------- public API ---------- */
  function setTitle(text) {
    var h = state.top && state.top.querySelector('.sh-title');
    if (h) h.textContent = text == null ? '' : String(text);
  }

  // arr: strings or {text, href}
  function setCrumbs(arr) {
    var box = state.top && state.top.querySelector('.sh-crumbs');
    if (!box) return;
    arr = (arr || []).filter(Boolean);
    box.innerHTML = arr.map(function (c) {
      var t = typeof c === 'string' ? { text: c } : c;
      return t.href ? '<a href="' + esc(t.href) + '">' + esc(t.text) + '</a>' : esc(t.text);
    }).join('<span class="sh-crumbs-sep">/</span>');
    box.hidden = !arr.length;
  }

  function actionsEl() {
    return state.top ? state.top.querySelector('.sh-page-actions') : null;
  }

  function render() {
    var path = window.location.pathname;

    var host = document.getElementById('sidebar-container');
    if (host) {
      host.classList.add('sh-app');
      host.innerHTML = '<nav class="sh-nav" id="sh-nav" aria-label="Меню">' + navHtml(path) + '</nav>' +
        '<div class="sh-scrim"></div>';
      state.app = host;
      state.nav = host.querySelector('.sh-nav');
      host.querySelector('.sh-scrim').addEventListener('click', function () { closeNav(true); });
      state.nav.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('a')) closeNav(false);
      });
    }

    var work = document.querySelector('.main-content') || document.querySelector('.sh-main');
    if (work) {
      var old = work.querySelector(':scope > .sh-top');
      if (old) old.remove();
      var top = document.createElement('header');
      top.className = 'sh-top';
      top.innerHTML = topHtml();
      work.insertBefore(top, work.firstChild);
      state.top = top;
      state.menuBtn = top.querySelector('.sh-menu-btn');
      state.menuBtn.addEventListener('click', function () { isOpen() ? closeNav(false) : openNav(); });
      var themeBtn = top.querySelector('.sh-theme');
      themeBtn.addEventListener('click', function () {
        if (window.Theme) Theme.toggle();
        themeBtn.innerHTML = themeIcon();
      });

      var sub = SUBPAGES[path];
      var hit = findActive(path);
      if (sub) {
        setTitle(sub.title);
        setCrumbs(sub.crumbs.map(function (t, i) {
          return i === 0 && hit ? { text: t, href: hit.item.href } : t;
        }));
      } else if (hit) {
        setTitle(hit.item.text);
        setCrumbs(hit.group.label ? [hit.group.label] : []);
      } else {
        setTitle(document.title);
        setCrumbs([]);
      }
    }
  }

  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', function () {
    if (isOpen() && window.innerWidth > 980) closeNav(false);
  });

  window.Shell = { render: render, setTitle: setTitle, setCrumbs: setCrumbs, actionsEl: actionsEl, nav: NAV };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
