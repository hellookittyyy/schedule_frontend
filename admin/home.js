/* Головна (plan 0001 phase 6): greeting, «Як працює система», semester stages + next step,
   blockers line, semester dates, «Ресурси семестру». Needs api.js, ui.js, icons.js, shell.js, checks.js. */
(function () {
  'use strict';

  var page = document.getElementById('homePage');
  var esc = function (s) { return UI.escapeHtml(s); };
  var ic = function (n, size) { return Icons.svg(n, { size: size || 16 }); };
  var DAY = 864e5;
  var HOW_KEY = 'home.howDismissed';

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    return n + ' ' + (m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many);
  }
  function parseDate(s) { return new Date(s + 'T00:00:00'); }
  function today0() { var t = new Date(); t.setHours(0, 0, 0, 0); return t; }
  function daysBetween(a, b) { return Math.round((b - a) / DAY); }
  function fmtDay(d) { return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }); }
  function rel(d) {
    var n = daysBetween(today0(), d);
    if (n === 0) return 'сьогодні';
    return n > 0 ? 'через ' + plural(n, 'день', 'дні', 'днів') : plural(-n, 'день', 'дні', 'днів') + ' тому';
  }
  function errText(e) { return (e && e.data && (e.data.detail || e.data.error)) || (e && e.message) || 'помилка мережі'; }

  // Week of the semester for today, or null outside its dates.
  function weekInfo(sem) {
    var s = parseDate(sem.start_date), e = parseDate(sem.end_date), t = today0();
    var total = Math.max(1, Math.ceil((daysBetween(s, e) + 1) / 7));
    if (t < s || t > e) return { total: total, week: null };
    return { total: total, week: Math.floor(daysBetween(s, t) / 7) + 1 };
  }

  /* ---------- greeting (top bar) ---------- */
  function greeting() {
    var h = new Date().getHours();
    return h >= 5 && h < 12 ? 'Доброго ранку' : h >= 12 && h < 18 ? 'Добрий день' : h >= 18 && h < 23 ? 'Добрий вечір' : 'Доброї ночі';
  }
  function setHeading(sem) {
    var d = new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
    var line = d.charAt(0).toUpperCase() + d.slice(1);
    var w = sem ? weekInfo(sem) : null;
    if (w && w.week) line += ' · ' + w.week + '-й тиждень семестру';
    Shell.setTitle(greeting());
    Shell.setCrumbs([line]);
  }

  /* ---------- «Як працює система» ---------- */
  function howDismissed() { try { return localStorage.getItem(HOW_KEY) === '1'; } catch (e) { return false; } }
  function setHowDismissed(on) {
    try { if (on) localStorage.setItem(HOW_KEY, '1'); else localStorage.removeItem(HOW_KEY); } catch (e) { /* storage blocked */ }
  }
  function howHtml() {
    return '<section class="card welcome" id="howCard" aria-labelledby="howTitle"' + (howDismissed() ? ' hidden' : '') + '>' +
      '<div class="welcome-text"><h2 class="card-title" id="howTitle">Як працює система</h2>' +
      '<p class="muted">Розклад складається у три етапи. До будь-якого з них можна повернутися пізніше.</p></div>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-how-close>Зрозуміло, сховати</button>' +
      '<ol class="how">' +
      '<li><b>1</b><span><strong>Довідники</strong>Викладачі, групи, аудиторії й предмети. Заповнюються один раз на рік.</span></li>' +
      '<li><b>2</b><span><strong>Плани й обмеження</strong>Скільки годин має кожна група і коли хто може працювати.</span></li>' +
      '<li><b>3</b><span><strong>Генерація й публікація</strong>Система складає розклад, ви перевіряєте й публікуєте для студентів.</span></li>' +
      '</ol></section>';
  }
  function renderHowToggle() {
    var a = Shell.actionsEl();
    if (!a) return;
    a.innerHTML = '<button type="button" class="btn btn-ghost btn-sm" data-how-open' + (howDismissed() ? '' : ' hidden') + '>' +
      ic('info') + 'Як це працює?</button>';
    a.querySelector('[data-how-open]').addEventListener('click', function (e) {
      setHowDismissed(false);
      document.getElementById('howCard').hidden = false;
      e.currentTarget.hidden = true;
    });
  }
  page.addEventListener('click', function (e) {
    if (!e.target.closest('[data-how-close]')) return;
    setHowDismissed(true);
    document.getElementById('howCard').hidden = true;
    var open = document.querySelector('[data-how-open]');
    if (open) { open.hidden = false; open.focus(); }
  });

  /* ---------- load ---------- */
  function init() {
    page.innerHTML = howHtml() + '<div id="homeBody"></div>';
    renderHowToggle();
    setHeading(null);
    load();
  }

  function load() {
    var body = document.getElementById('homeBody');
    UI.state(body, 'loading', { text: 'Завантаження…' });
    Promise.all([apiRequest('/semesters/'), apiRequest('/stats/')]).then(function (r) {
      var sem = (r[0] || []).find(function (s) { return s.is_current; });
      setHeading(sem || null);
      if (!sem) return renderNoSemester(body);
      return Promise.all([
        Checks.run(sem.id, { includeOk: true }), Checks.data(sem.id),
        apiRequest('/lessons/?semester=' + encodeURIComponent(sem.id)),
        apiRequest('/semester_constraints/?semester=' + encodeURIComponent(sem.id))
      ]).then(function (x) {
        render(body, { sem: sem, stats: r[1] || {}, checks: x[0], data: x[1], lessons: x[2].length, constraints: x[3].length });
      });
    }).catch(function (err) {
      UI.state(body, 'error', { text: 'Не вдалося завантажити дані: ' + errText(err), actionLabel: 'Спробувати ще', onAction: load });
    });
  }

  function renderNoSemester(body) {
    body.innerHTML = '<div class="card next-only"><div class="next">' +
      '<div class="grow"><div class="next-k">Наступний крок</div><div class="next-t">Оберіть поточний семестр</div>' +
      '<div class="muted sm">Жоден семестр не позначено поточним — етапи й ресурси рахуються для нього.</div></div>' +
      '<a class="btn btn-primary" href="/admin/semesters/?list=1">До списку семестрів' + ic('arrow') + '</a></div></div>';
  }

  /* ---------- stages (same status logic as admin/semesters/semester.js) ---------- */
  function stages(m) {
    var d = m.data;
    var per = Checks.plansPerGroup(d);
    var ready = d.groups.filter(function (g) { return per[g.id] > 0; }).length;
    var blocks = m.checks.filter(function (c) { return c.severity === 'block'; }).length;
    var resOk = d.rooms.length && d.teachers.length && d.groups.length && d.subjects.length;
    var semHref = '/admin/semesters/?id=' + encodeURIComponent(m.sem.id);
    return {
      blocks: blocks, ready: ready, semHref: semHref,
      list: [
        { id: 'calendar', name: 'Календар', done: d.slots.length > 0, req: true, href: semHref + '&view=calendar',
          meta: d.slots.length ? plural(d.slots.length, 'слот', 'слоти', 'слотів') : 'немає слотів' },
        { id: 'resources', name: 'Ресурси', done: !!resOk, req: true, href: semHref,
          meta: plural(d.rooms.length, 'аудиторія', 'аудиторії', 'аудиторій') + ' · ' + plural(d.teachers.length, 'викладач', 'викладачі', 'викладачів') },
        { id: 'plans', name: 'Плани', done: d.plans.length > 0 && ready === d.groups.length, req: true, href: '/admin/study-plans/',
          meta: d.plans.length ? ready + ' з ' + d.groups.length + ' груп' : 'немає планів' },
        { id: 'constraints', name: 'Обмеження', done: m.constraints > 0, href: '/admin/constraints/',
          meta: m.constraints ? plural(m.constraints, 'обмеження', 'обмеження', 'обмежень') : 'не задано' },
        { id: 'generation', name: 'Генерація', done: m.lessons > 0, req: true, href: semHref,
          meta: m.lessons ? plural(m.lessons, 'заняття', 'заняття', 'занять') : blocks ? 'блокерів: ' + blocks : 'не запускали' }
      ]
    };
  }

  function nextStep(m, s, cur) {
    var d = m.data;
    if (!cur) return { t: 'Розклад згенеровано', sub: plural(m.lessons, 'заняття', 'заняття', 'занять') + ' у семестрі',
      label: 'Відкрити семестр', href: s.semHref };
    if (cur.id === 'calendar') return { t: 'Налаштувати календар семестру', sub: 'У семестрі ще немає часових слотів',
      label: 'Відкрити календар', href: cur.href };
    if (cur.id === 'resources') {
      var miss = [[d.rooms, 'аудиторій'], [d.teachers, 'викладачів'], [d.groups, 'груп'], [d.subjects, 'предметів']]
        .filter(function (x) { return !x[0].length; }).map(function (x) { return x[1]; });
      return { t: 'Заповнити довідники', sub: 'Бракує: ' + miss.join(', '), label: 'Продовжити', href: s.semHref };
    }
    if (cur.id === 'plans') {
      if (!d.plans.length) return { t: 'Заповнити навчальні плани', sub: 'У семестрі ще немає жодного плану', label: 'Продовжити', href: s.semHref };
      var c = m.checks.find(function (x) { return x.id === 'groups-without-plan'; });
      var names = c ? c.items.map(function (it) { return it.label; }) : [];
      var n = d.groups.length - s.ready;
      return { t: 'Заповнити навчальні плани для ' + plural(n, 'групи', 'груп', 'груп'),
        sub: names.slice(0, 3).join(', ') + (names.length > 3 ? ' та ще ' + (names.length - 3) : ''), label: 'Продовжити', href: s.semHref };
    }
    if (s.blocks) return { t: 'Усунути блокери перед генерацією', sub: plural(s.blocks, 'питання блокує', 'питання блокують', 'питань блокують') + ' генерацію',
      label: 'Продовжити', href: s.semHref };
    return { t: 'Згенерувати розклад', sub: 'Усі обовʼязкові етапи готові', label: 'Продовжити', href: s.semHref };
  }

  function journeyHtml(m) {
    var s = stages(m);
    var cur = s.list.find(function (x) { return x.req && !x.done; });
    var done = s.list.filter(function (x) { return x.done; }).length;
    var nx = nextStep(m, s, cur);
    return '<div class="card journey">' +
      '<div class="card-head"><h2 class="card-title">' + esc(m.sem.name) + '</h2>' +
      '<span class="badge badge-status">' + (m.lessons ? 'Розклад згенеровано' : 'Підготовка') + '</span><span class="sp"></span>' +
      '<span class="muted sm">' + done + ' з ' + s.list.length + ' етапів готово</span></div>' +
      '<nav class="steps" aria-label="Етапи семестру">' + s.list.map(function (x, i) {
        var cls = 'step ' + (x.done ? 'is-done' : x === cur ? 'is-cur' : 'is-todo');
        return '<a class="' + cls + '" href="' + esc(x.href) + '"' + (x === cur ? ' aria-current="step"' : '') + '>' +
          '<span class="step-n">' + (x.done ? Icons.svg('check', { cls: 'xs', size: 14 }) : i + 1) + '</span>' +
          '<span class="step-name">' + x.name + '</span><span class="step-meta">' + esc(x.meta) + '</span></a>';
      }).join('') + '</nav>' +
      '<div class="next"><div class="grow"><div class="next-k">Наступний крок</div><div class="next-t">' + esc(nx.t) + '</div>' +
      (nx.sub ? '<div class="muted sm">' + esc(nx.sub) + '</div>' : '') + '</div>' +
      '<a class="btn btn-primary" href="' + esc(nx.href) + '">' + esc(nx.label) + ic('arrow') + '</a></div></div>';
  }

  /* ---------- blockers line + dates ---------- */
  function attentionHtml(m) {
    var sum = Checks.summary(m.checks);
    if (!sum.block && !sum.warn) return '';
    var parts = [];
    if (sum.block) parts.push(sum.block + ' блокує');
    if (sum.warn) parts.push(sum.warn + ' погіршує');
    return '<div class="card attention"><span class="sev-ico ' + (sum.block ? 'sev-high' : 'sev-mid') + '">' + ic('alert') + '</span>' +
      '<div class="grow"><b>' + parts.join(' · ') + '</b><div class="muted sm">' +
      (sum.block ? 'Поки є блокери, розклад не згенерувати' : 'Генерація можлива, але розклад вийде гіршим') + '</div></div>' +
      '<a class="btn btn-ghost btn-sm" href="/admin/tasks/">Задачі' + ic('arrow') + '</a></div>';
  }

  function datesHtml(m) {
    var s = parseDate(m.sem.start_date), e = parseDate(m.sem.end_date), t = today0(), w = weekInfo(m.sem);
    var todayMeta = w.week ? w.week + '-й тиждень з ' + w.total
      : t < s ? 'до початку семестру ' + plural(daysBetween(t, s), 'день', 'дні', 'днів')
      : 'семестр завершився ' + rel(e);
    var rows = [
      { d: s, t: 'Початок семестру', m: rel(s) },
      { d: e, t: 'Завершення семестру', m: rel(e) },
      { d: t, t: 'Сьогодні', m: todayMeta, today: true }
    ].sort(function (a, b) { return a.d - b.d || (a.today ? 1 : -1); });
    return '<div class="card dates"><div class="card-head"><h2 class="card-title">Найближчі дати</h2></div>' +
      rows.map(function (r) {
        return '<div class="date-row' + (r.today ? ' is-today' : '') + '"><span class="date-d num">' + esc(fmtDay(r.d)) + '</span>' +
          '<span class="grow"><div class="t">' + esc(r.t) + '</div><div class="muted sm">' + esc(r.m) + '</div>' +
          (r.today && w.week ? '<div class="progress sm" role="img" aria-label="' + w.week + ' з ' + w.total + ' тижнів">' +
            '<i style="width:' + Math.round(w.week / w.total * 100) + '%"></i></div>' : '') + '</span></div>';
      }).join('') + '</div>';
  }

  /* ---------- «Ресурси семестру» ---------- */
  function tile(o) {
    var href = o.missing && o.filter ? o.href + '?filter=' + o.filter : o.href;
    var pct = o.total ? Math.round(o.have / o.total * 100) : 0;
    var metric = o.metric != null ? '<div class="res-metric"><span>' + esc(o.metric) + '</span></div>'
      : o.total ? '<div class="res-metric"><span>' + esc(o.label) + ' · ' + o.have + ' з ' + o.total + '</span><b class="num">' + pct + '%</b></div>' +
        '<div class="progress sm" role="img" aria-label="' + pct + '%"><i style="width:' + pct + '%"></i></div>' : '';
    var lvl = o.status ? o.status[0] : 'none';
    return '<a class="res" style="--c:var(' + o.c + ')" href="' + esc(href) + '">' +
      '<div class="res-top"><span class="res-ico">' + ic(o.icon) + '</span><span class="res-name">' + o.name + '</span>' +
      '<span class="res-num num">' + esc(o.count) + '</span></div>' + metric +
      (o.status ? '<div class="res-status is-' + lvl + '">' + ic(lvl === 'ok' ? 'check' : 'alert', 14) + esc(o.status[1]) + '</div>' : '') + '</a>';
  }

  function resourcesHtml(m) {
    var d = m.data, st = m.stats;
    var per = Checks.plansPerGroup(d);
    var tWith = d.teachers.filter(function (t) { return Checks.subjectIds(t).length; }).length;
    var taught = {};
    d.teachers.forEach(function (t) { Checks.subjectIds(t).forEach(function (id) { taught[id] = 1; }); });
    var sWith = d.subjects.filter(function (s) { return taught[s.id]; }).length;
    var gWith = d.groups.filter(function (g) { return per[g.id] > 0; }).length;
    var types = {};
    d.rooms.forEach(function (r) { var n = r.room_type_details ? r.room_type_details.name : 'без типу'; types[n] = (types[n] || 0) + 1; });
    var typeLine = Object.keys(types).sort(function (a, b) { return types[b] - types[a]; })
      .map(function (k) { return k + ' ' + types[k]; }).join(' · ');
    var noRoom = m.checks.find(function (c) { return c.id === 'plans-without-room'; });
    function status(total, miss, bad, good) {
      if (!total) return ['warn', 'ще немає жодного запису'];
      return miss ? ['warn', bad] : ['ok', good];
    }
    var tMiss = d.teachers.length - tWith, gMiss = d.groups.length - gWith, sMiss = d.subjects.length - sWith;
    return '<section class="card res-wide" aria-labelledby="resTitle"><div class="card-head"><h2 class="card-title" id="resTitle">Ресурси семестру</h2>' +
      '<span class="sp"></span><span class="muted sm">що є і чого бракує</span></div><div class="res-grid">' +
      tile({ name: 'Викладачі', icon: 'user', c: '--c4', count: st.teachers, href: '/admin/teachers/', filter: 'no-subjects',
        label: 'мають предмети', have: tWith, total: d.teachers.length, missing: tMiss,
        status: status(d.teachers.length, tMiss, tMiss + ' без предметів', 'усі мають предмети') }) +
      tile({ name: 'Групи', icon: 'users', c: '--c5', count: st.groups, href: '/admin/groups/', filter: 'no-plan',
        label: 'мають план', have: gWith, total: d.groups.length, missing: gMiss,
        status: status(d.groups.length, gMiss, plural(gMiss, 'група', 'групи', 'груп') + ' без плану', 'усі мають навчальний план') }) +
      tile({ name: 'Аудиторії', icon: 'door', c: '--c1', count: st.rooms, href: '/admin/rooms/', metric: typeLine || null,
        status: !d.rooms.length ? ['warn', 'ще немає жодного запису']
          : noRoom && noRoom.severity !== 'ok' ? ['warn', plural(noRoom.count, 'план', 'плани', 'планів') + ' без відповідної аудиторії']
          : noRoom ? ['ok', 'для кожного плану є аудиторія'] : null }) +
      tile({ name: 'Предмети', icon: 'book', c: '--c3', count: st.subjects, href: '/admin/subjects/', filter: 'no-teacher',
        label: 'мають викладача', have: sWith, total: d.subjects.length, missing: sMiss,
        status: status(d.subjects.length, sMiss, plural(sMiss, 'предмет', 'предмети', 'предметів') + ' без викладача', 'усі мають викладача') }) +
      '</div></section>';
  }

  function render(body, m) {
    var side = attentionHtml(m) + datesHtml(m);
    body.innerHTML = '<div class="start-grid"><div class="col">' + journeyHtml(m) + '</div>' +
      '<div class="col">' + side + '</div></div>' + resourcesHtml(m);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
