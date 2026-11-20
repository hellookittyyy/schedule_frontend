/* «Групи»: master–detail (assets/js/master-detail.js). */
(function () {
  'use strict';

  var esc = UI.escapeHtml;
  function ic(name, size) { return Icons.svg(name, { size: size || 16 }); }

  var curSem = null;        // semester for plan counts: ?semester= or the current one
  var directCount = {};     // group id -> study-plan entries of the group itself
  var streamCount = {};     // group id -> study-plan entries via its streams
  var streamsOf = {};       // group id -> streams containing the group
  var plansOk = false;
  var md;

  var plural = UI.pluralForm;
  function list(r) { return (r && r.results) || r || []; }
  // API: 1–6, 0 for a future intake, or a string («Випускник») past 6th year.
  function course(g) { var c = g.current_course; return c == null || c === '' ? null : c; }
  function courseLabel(c) {
    if (c == null) return 'Без курсу';
    if (typeof c !== 'number') return String(c);
    return c > 0 ? c + ' курс' : 'Абітурієнт';
  }
  function courseRank(c) { return c == null ? 99 : typeof c === 'number' ? c : 50; }
  function byGroup(a, b) {
    return courseRank(course(a)) - courseRank(course(b)) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'uk', { numeric: true });
  }
  function planTotal(g) { return (directCount[g.id] || 0) + (streamCount[g.id] || 0); }

  function loadAll() {
    return Promise.all([
      apiRequest('/groups/'),
      apiRequest('/streams/').catch(function () { return []; }),
      apiRequest('/semesters/').catch(function () { return []; })
    ]).then(function (r) {
      var groups = list(r[0]), streams = list(r[1]), sems = list(r[2]);
      // ?semester=N (links from a semester's checks) wins over the current semester.
      var want = new URLSearchParams(window.location.search).get('semester');
      curSem = (want && sems.find(function (s) { return String(s.id) === want; })) ||
        sems.find(function (s) { return s.is_current; }) || null;
      streamsOf = {};
      var streamById = {};
      streams.forEach(function (s) {
        streamById[s.id] = s;
        (s.groups_details || []).forEach(function (g) { (streamsOf[g.id] = streamsOf[g.id] || []).push(s); });
      });
      directCount = {}; streamCount = {}; plansOk = false;
      if (!curSem) return groups;
      return apiRequest('/study_plans/?semester=' + encodeURIComponent(curSem.id)).then(function (p) {
        list(p).forEach(function (pl) {
          if (pl.group) directCount[pl.group] = (directCount[pl.group] || 0) + 1;
          else if (pl.stream && streamById[pl.stream]) {
            (streamById[pl.stream].groups_details || []).forEach(function (g) { streamCount[g.id] = (streamCount[g.id] || 0) + 1; });
          }
        });
        plansOk = true;
        return groups;
      }, function () { UI.toast('Не вдалося завантажити навчальні плани', { type: 'warn' }); return groups; });
    });
  }

  /* ---------- list ---------- */
  function renderRow(g) {
    var meta = [];
    if (g.start_year) meta.push('вступ ' + g.start_year);
    if (plansOk && !planTotal(g)) meta.push('без плану');
    return '<div class="grow"><div class="name">' + esc(g.name) + '</div>' +
      (meta.length ? '<div class="meta">' + esc(meta.join(' · ')) + '</div>' : '') + '</div>' +
      '<span class="num" title="Студентів">' + esc(g.amount == null ? '' : g.amount) + '</span>';
  }

  /* ---------- detail ---------- */
  function subText(g) {
    var parts = [];
    if (g.amount != null) parts.push(g.amount + ' ' + plural(g.amount, 'студент', 'студенти', 'студентів'));
    parts.push(courseLabel(course(g)));
    return parts.join(' · ');
  }

  function planBlock(g) {
    if (!curSem) return '<p class="muted sm">Поточного семестру немає. <a href="/admin/semesters/">Семестри</a></p>';
    if (!plansOk) return '<p class="muted sm">Не вдалося завантажити навчальні плани.</p>';
    var d = directCount[g.id] || 0, s = streamCount[g.id] || 0;
    var text;
    if (!d && !s) text = 'У цьому семестрі навчального плану немає.';
    else {
      text = d + ' ' + plural(d, 'запис', 'записи', 'записів') + ' у навчальному плані групи';
      if (s) text += ' і ще ' + s + ' через потоки';
      text += '.';
    }
    return '<p class="sm">' + esc(text) + '</p>' +
      '<a class="btn btn-sm" href="/admin/study-plans/?group=' + esc(g.id) + '&semester=' + esc(curSem.id) + '">' + ic('chevR', 14) + 'Навчальний план групи</a>';
  }

  // Shown only for a saved group (also inserted in place after a draft's first save).
  function courseHtml(g) {
    return '<span class="f-label">Поточний курс</span><div class="f-value" id="g-course">' + esc(courseLabel(course(g))) + '</div>';
  }
  function savedHtml(g) {
    var streams = streamsOf[g.id] || [];
    return '<div class="section"><div class="section-title">Потоки</div>' +
        (streams.length
          ? '<div class="chips">' + streams.map(function (s) {
              return '<a class="chip link" href="/admin/streams/?id=' + esc(s.id) + '">' + esc(s.name) + ic('chevR', 12) + '</a>';
            }).join('') + '</div><p class="muted sm mt">Склад потоку змінюється на сторінці потоку.</p>'
          : '<span class="muted sm">Група не входить до жодного потоку</span>') +
      '</div>' +
      '<div class="section"><div class="section-title">Навчальний план' + (curSem ? ' <span class="muted sm">' + esc(curSem.name) + '</span>' : '') + '</div>' +
        planBlock(g) + '</div>' +
      '<div class="section"><div class="section-title">Розклад</div><div class="row wrap">' +
        '<a class="btn btn-sm" href="/?g=' + esc(g.id) + '">' + ic('chevR', 14) + 'Розклад групи</a>' +
        '<a class="btn btn-sm" href="/admin/schedule/">' + ic('chevR', 14) + 'Редактор розкладу</a>' +
      '</div></div>';
  }

  function renderDetail(g, ctx) {
    var draft = ctx.isDraft;
    return '' +
      '<div class="detail-head">' +
        '<div class="grow"><h2 class="detail-name" id="g-title">' + esc(g.name || 'Нова група') + '</h2>' +
        '<div class="muted" id="g-sub">' + esc(draft ? 'Заповніть усі поля — групу буде створено після цього' : subText(g)) + '</div></div>' +
        '<span class="saved" data-md-saved hidden></span>' +
      '</div>' +
      '<div class="section"><div class="section-title">Основне</div><div class="fields">' +
        '<label class="f-label" for="g-name">Назва</label>' +
        '<div class="f-value"><input class="input" id="g-name" data-md-field="name" required autocomplete="off" placeholder="Наприклад: ФЕІ-21" value="' + esc(g.name || '') + '"></div>' +
        '<label class="f-label" for="g-amount">Кількість студентів</label>' +
        '<div class="f-value"><input class="input" id="g-amount" type="number" min="0" data-md-field="amount" data-md-type="number" required value="' + esc(g.amount == null ? '' : g.amount) + '"></div>' +
        '<label class="f-label" for="g-year">Рік вступу</label>' +
        '<div class="f-value"><input class="input" id="g-year" type="number" min="1990" max="2100" data-md-field="start_year" data-md-type="number" required value="' + esc(g.start_year == null ? '' : g.start_year) + '"></div>' +
        (draft ? '' : courseHtml(g)) +
      '</div></div>' +
      (draft ? '' : savedHtml(g)) +
      ctx.danger({ title: 'Видалити групу', text: 'Разом із групою буде видалено її навчальні плани й заняття в розкладі.' });
  }

  function mount(el, g, ctx) {
    var name = el.querySelector('#g-name');
    if (ctx.isDraft) {
      // Hold autosave until all required fields are filled (API needs them together).
      var fields = el.querySelector('.fields');
      // Capture values on the item: save() must not read the DOM, which may show another record by then.
      var sync = function () {
        g._form = { name: name.value.trim(), amount: el.querySelector('#g-amount').value.trim(), start_year: el.querySelector('#g-year').value.trim() };
      };
      sync();
      ['input', 'change'].forEach(function (t) { fields.addEventListener(t, sync, true); });
      var hold = function (e) {
        if (!ctx.isDraft) return;
        var empty = Array.prototype.some.call(fields.querySelectorAll('input[required]'), function (i) { return i.value.trim() === ''; });
        if (empty) e.stopPropagation();
      };
      ['change', 'focusout'].forEach(function (t) { fields.addEventListener(t, hold, true); });
      fields.addEventListener('keydown', function (e) { if (e.key === 'Enter') hold(e); }, true);
    }
    name.addEventListener('input', function () {
      el.querySelector('#g-title').textContent = name.value.trim() || 'Нова група';
    });
  }

  /* ---------- controller ---------- */
  // Course chips follow the loaded groups, so an emptied course drops out after an edit.
  function filters() {
    var seen = {};
    (md ? md.items() : []).forEach(function (g) { var c = course(g); if (c != null) seen['c' + c] = c; });
    var out = [{ id: 'no-plan', label: 'Без плану', test: function (g) { return plansOk && !planTotal(g); } }];
    Object.keys(seen).map(function (k) { return seen[k]; })
      .sort(function (a, b) { return courseRank(a) - courseRank(b); })
      .forEach(function (c) {
        out.push({ id: 'c' + c, label: courseLabel(c), test: function (g) { return course(g) === c; } });
      });
    return out;
  }

  md = MasterDetail.create({
    root: '#groups',
    title: 'Групи',
    color: '--c5',
    searchPlaceholder: 'Пошук групи',
    addLabel: 'Додати групу',
    draftLabel: 'Нова група',
    emptyText: 'Груп поки немає',
    removedText: 'Групу видалено',
    removeQuestion: 'Точно видалити групу?',
    countLabel: function (n) { return n + ' ' + plural(n, 'група', 'групи', 'груп'); },
    load: loadAll,
    sort: byGroup,
    groupBy: function (g) { return courseLabel(course(g)); },
    search: function (g, q) { return String(g.name || '').toLowerCase().indexOf(q) >= 0; },
    filters: filters,
    renderRow: renderRow,
    renderDetail: renderDetail,
    mount: mount,
    onCreate: function () { return { name: '', amount: null, start_year: null }; },
    onCreated: function (g, ctx) {
      var el = ctx.el;
      var sub = el.querySelector('#g-sub');
      if (sub) sub.textContent = subText(g);
      var fields = el.querySelector('.fields');
      if (fields && !el.querySelector('#g-course')) fields.insertAdjacentHTML('beforeend', courseHtml(g));
      var anchor = el.querySelector('[data-md-danger]');
      if (anchor) anchor.insertAdjacentHTML('beforebegin', savedHtml(g)); else el.insertAdjacentHTML('beforeend', savedHtml(g));
    },
    save: function (g, ch, ctx) {
      if (g.id == null) {
        // Draft: the API requires all three fields; use the values mount() captured on the item.
        var p = Object.assign({ name: '', amount: '', start_year: '' }, g._form);
        if (!p.name || p.amount === '' || p.start_year === '') {
          return Promise.reject(new Error('Заповніть назву, кількість студентів і рік вступу'));
        }
        p.amount = Number(p.amount); p.start_year = Number(p.start_year);
        return apiRequest('/groups/', 'POST', p).then(function (saved) {
          delete g._form;
          return saved;
        });
      }
      var body = { name: g.name, amount: g.amount, start_year: g.start_year };
      Object.assign(body, ch);
      return apiRequest('/groups/' + g.id + '/', 'PUT', body).then(function (saved) {
        if (ctx.alive()) {
          var sub = ctx.el.querySelector('#g-sub');
          if (sub) sub.textContent = subText(saved);
          var c = ctx.el.querySelector('#g-course');
          if (c) c.textContent = courseLabel(course(saved));
        }
        return saved;
      });
    },
    remove: function (g) { return apiRequest('/groups/' + g.id + '/', 'DELETE'); }
  });
})();
