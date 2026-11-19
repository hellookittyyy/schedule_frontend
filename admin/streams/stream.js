/* «Потоки»: master–detail (assets/js/master-detail.js). */
(function () {
  'use strict';

  var esc = UI.escapeHtml;
  function ic(name, size) { return Icons.svg(name, { size: size || 16 }); }

  var allGroups = [];
  var md;

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function groupsOf(s) { return s.groups_details || []; }
  function byName(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'uk', { numeric: true }); }
  function total(s) { return groupsOf(s).reduce(function (n, g) { return n + (g.amount || 0); }, 0); }
  function groupsText(n) { return n + ' ' + plural(n, 'група', 'групи', 'груп'); }
  function summary(s) {
    var n = groupsOf(s).length;
    return n ? groupsText(n) + ' · ' + total(s) + ' студ.' : 'Без груп';
  }
  function errText(err, fb) { return MasterDetail.errorText(err, fb); }

  function renderRow(s) {
    var g = groupsOf(s);
    return '<div class="grow"><div class="name">' + esc(s.name) + '</div>' +
      '<div class="meta">' + (g.length ? esc(g.map(function (x) { return x.name; }).join(', ')) : 'Без груп') + '</div></div>' +
      '<span class="num">' + g.length + '</span>';
  }

  function renderDetail(s, ctx) {
    return '' +
      '<div class="detail-head">' +
        '<div class="grow"><h2 class="detail-name" id="s-title">' + esc(s.name || 'Новий потік') + '</h2>' +
        '<div class="muted" id="s-sub">' + esc(summary(s)) + '</div></div>' +
        '<span class="saved" data-md-saved hidden></span>' +
      '</div>' +
      '<div class="section"><div class="section-title">Основне</div>' +
        '<div class="fields">' +
          '<label class="f-label" for="s-name">Назва</label>' +
          '<div class="f-value"><input class="input" id="s-name" data-md-field="name" required autocomplete="off" ' +
            'placeholder="Наприклад: Потік КН-2 курс" value="' + esc(s.name || '') + '"></div>' +
        '</div></div>' +
      '<div class="section"><div class="section-title">Групи у потоці</div>' +
        '<div class="chips" id="s-chips"></div>' +
        (allGroups.length
          ? '<div class="combo inline mt"><input class="input sm" id="s-add" role="combobox" aria-expanded="false" aria-controls="s-list" ' +
              'aria-autocomplete="list" autocomplete="off" placeholder="Додати групу…">' +
              '<div class="combo-list" id="s-list" role="listbox" aria-label="Групи"></div></div>'
          : '<p class="muted sm mt">У довіднику ще немає груп. <a href="/admin/groups/">Додати групи</a></p>') +
      '</div>' +
      ctx.danger({ title: 'Видалити потік', text: 'Самі групи залишаться в довіднику.' });
  }

  function mount(el, s, ctx) {
    var name = el.querySelector('#s-name');
    name.addEventListener('input', function () {
      el.querySelector('#s-title').textContent = name.value.trim() || 'Новий потік';
    });
    renderChips(s, ctx);
    wireCombo(s, ctx);
  }

  function renderChips(s, ctx) {
    var box = ctx.el.querySelector('#s-chips');
    if (!box || !ctx.alive()) return;
    var g = groupsOf(s);
    box.innerHTML = g.length ? g.map(function (x) {
      return '<span class="chip static"><a href="/admin/groups/?id=' + esc(x.id) + '">' + esc(x.name) + '</a>' +
        '<span class="n">' + esc(x.amount || 0) + '</span>' +
        '<button type="button" class="x" data-rm="' + esc(x.id) + '" aria-label="Прибрати «' + esc(x.name) + '»">' + ic('x', 12) + '</button></span>';
    }).join('') : '<span class="muted sm">Груп немає</span>';
    var sub = ctx.el.querySelector('#s-sub');
    if (sub) sub.textContent = summary(s);
  }

  function wireCombo(s, ctx) {
    var el = ctx.el;
    el.querySelector('#s-chips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-rm]');
      if (b) removeGroup(s, ctx, Number(b.getAttribute('data-rm')));
    });
    var input = el.querySelector('#s-add');
    if (!input) return;
    var list = el.querySelector('#s-list');
    var active = 0, opts = [];
    function available() {
      var have = groupsOf(s).map(function (g) { return g.id; });
      var q = input.value.trim().toLowerCase();
      return allGroups.filter(function (g) {
        return have.indexOf(g.id) < 0 && (!q || String(g.name).toLowerCase().indexOf(q) >= 0);
      });
    }
    function open() {
      opts = available();
      active = Math.min(active, Math.max(opts.length - 1, 0));
      list.innerHTML = opts.length ? opts.map(function (g, i) {
        return '<div class="combo-item' + (i === active ? ' is-active' : '') + '" role="option" id="s-o' + i + '" aria-selected="' + (i === active) + '" data-add="' + esc(g.id) + '">' +
          esc(g.name) + ' <span class="muted sm">' + esc(g.amount || 0) + ' студ.</span></div>';
      }).join('') : '<div class="combo-empty">' + (input.value.trim() ? 'Нічого не знайдено' : 'Усі групи вже в потоці') + '</div>';
      list.classList.add('is-open');
      input.setAttribute('aria-expanded', 'true');
      if (opts.length) input.setAttribute('aria-activedescendant', 's-o' + active); else input.removeAttribute('aria-activedescendant');
      var a = list.querySelector('.is-active');
      if (a) a.scrollIntoView({ block: 'nearest' });
    }
    function close() {
      list.classList.remove('is-open');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    function pick(id) {
      input.value = ''; active = 0;
      addGroup(s, ctx, id);
      if (document.activeElement === input) open(); else close();
    }
    input.addEventListener('focus', open);
    input.addEventListener('input', function () { active = 0; open(); });
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, opts.length - 1); open(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); open(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (opts[active]) pick(opts[active].id); }
      else if (e.key === 'Escape') { if (list.classList.contains('is-open')) { e.stopPropagation(); close(); } }
    });
    list.addEventListener('mousedown', function (e) { e.preventDefault(); });
    list.addEventListener('click', function (e) {
      var it = e.target.closest('[data-add]');
      if (it) pick(Number(it.getAttribute('data-add')));
    });
  }

  /* All stream writes go through one queue; each PUT is built when it runs from the local
     membership list (s.groups_details, updated immediately) and the latest requested name. */
  var queue = Promise.resolve();
  function enqueue(fn) {
    var p = queue.then(fn);
    queue = p.then(null, function () {});
    return p;
  }
  function ids(s) { return groupsOf(s).map(function (g) { return g.id; }); }
  function nameOf(s) { return s._name != null ? s._name : s.name; }
  function putNow(s) {
    return apiRequest('/streams/' + s.id + '/', 'PUT', { name: nameOf(s), groups: ids(s) });
  }

  function resync(s, ctx) {
    if (s.id == null) return;
    apiRequest('/streams/' + s.id + '/').then(function (fresh) {
      Object.assign(s, fresh); delete s._name;
      md.refresh(s);
      if (ctx.alive()) renderChips(s, ctx);
    }, function () {});
  }

  function syncGroups(s, ctx, failText) {
    md.refresh(s);
    renderChips(s, ctx);
    if (s.id == null && !s._posting) return Promise.resolve();
    ctx.status('saving');
    return enqueue(function () { return s.id == null ? null : putNow(s); })
      .then(function () { ctx.status('saved'); }, function (err) {
        ctx.status('error');
        UI.toast(errText(err, failText), { type: 'err' });
        resync(s, ctx);
        throw err;
      });
  }

  function addGroup(s, ctx, groupId) {
    var grp = allGroups.find(function (g) { return g.id === groupId; });
    if (!grp || groupsOf(s).some(function (g) { return g.id === groupId; })) return Promise.resolve();
    s.groups_details = groupsOf(s).concat([grp]);
    return syncGroups(s, ctx, 'Не вдалося додати групу').catch(function () {});
  }

  function removeGroup(s, ctx, groupId) {
    var grp = groupsOf(s).find(function (g) { return g.id === groupId; });
    if (!grp) return;
    s.groups_details = groupsOf(s).filter(function (g) { return g.id !== groupId; });
    var draft = s.id == null && !s._posting;
    syncGroups(s, ctx, 'Не вдалося прибрати групу').then(function () {
      if (draft) return;
      UI.toast('Групу «' + grp.name + '» прибрано з потоку', {
        type: 'ok',
        action: { label: 'Повернути', onClick: function () { addGroup(s, ctx, groupId); } }
      });
    }, function () {});
  }

  md = MasterDetail.create({
    root: '#streams',
    title: 'Потоки',
    color: '--c6',
    searchPlaceholder: 'Пошук потоку або групи',
    addLabel: 'Додати потік',
    draftLabel: 'Новий потік',
    emptyText: 'Потоків поки немає',
    removedText: 'Потік видалено',
    removeQuestion: 'Точно видалити потік?',
    countLabel: function (n) { return n + ' ' + plural(n, 'потік', 'потоки', 'потоків'); },
    load: function () {
      return Promise.all([
        apiRequest('/streams/'),
        apiRequest('/groups/').catch(function () { UI.toast('Не вдалося завантажити групи', { type: 'warn' }); return []; })
      ]).then(function (r) {
        allGroups = ((r[1] && r[1].results) || r[1] || []).slice().sort(byName);
        return r[0];
      });
    },
    sort: byName,
    search: function (s, q) {
      if (String(s.name || '').toLowerCase().indexOf(q) >= 0) return true;
      return groupsOf(s).some(function (g) { return String(g.name).toLowerCase().indexOf(q) >= 0; });
    },
    filters: [{ id: 'nogroups', label: 'Без груп', test: function (s) { return !groupsOf(s).length; } }],
    renderRow: renderRow,
    renderDetail: renderDetail,
    mount: mount,
    onCreate: function () { return { name: '', groups_details: [] }; },
    save: function (s, ch) {
      var sent = ch.name != null ? ch.name : nameOf(s);
      s._name = sent;
      function undo(err) { if (s._name === sent) delete s._name; throw err; }
      if (s.id == null) {
        s._posting = true;
        return enqueue(function () { return apiRequest('/streams/', 'POST', { name: nameOf(s), groups: ids(s) }); })
          .then(function (r) {
            s._posting = false; s.id = r.id;
            return Object.assign({}, r, { groups_details: groupsOf(s) });
          }, function (err) { s._posting = false; undo(err); });
      }
      // Resolve only the name: queued membership changes may be newer than this response.
      return enqueue(function () { return putNow(s); }).then(function () { return { name: sent }; }, undo);
    },
    remove: function (s) { return apiRequest('/streams/' + s.id + '/', 'DELETE'); }
  });
})();
