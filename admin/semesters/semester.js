/* Семестр page (plan 0001 phase 4): semester list, semester overview (steps, preflight,
   plans by group), «Календар» step, create/edit drawer, generation. Needs checks.js, calendar.js. */
(function () {
  'use strict';

  var esc = function (s) { return UI.escapeHtml(s); };
  var ic = function (n, size) { return Icons.svg(n, { size: size || 16 }); };
  var errText = function (e) { return SemCalendar.errText(e); };
  var page = document.getElementById('semPage');

  var DEFAULT_TIMES = [['08:30', '09:50'], ['10:10', '11:30'], ['11:50', '13:10'], ['13:30', '14:50']];
  var DAYS = [['Monday', 'Пн'], ['Tuesday', 'Вт'], ['Wednesday', 'Ср'], ['Thursday', 'Чт'],
    ['Friday', 'Пт'], ['Saturday', 'Сб'], ['Sunday', 'Нд']];

  var st = { semesters: [], sem: null, view: 'overview', checks: null, data: null, lessons: null,
    constraints: null, calendar: null, token: 0, generating: false };

  /* ---------- routing ---------- */
  function params() { return new URLSearchParams(location.search); }

  function go(query, replace) {
    var url = location.pathname + (query ? '?' + query : '');
    history[replace ? 'replaceState' : 'pushState'](null, '', url);
    route();
  }

  function route() {
    var p = params();
    if (st.calendar) { st.calendar.close(); st.calendar = null; }
    if (p.has('list')) return renderList();
    var id = p.get('id');
    var sem = id ? st.semesters.find(function (s) { return String(s.id) === id; })
      : st.semesters.find(function (s) { return s.is_current; });
    if (id && !sem) {
      UI.toast('Семестр не знайдено', { type: 'err' });
      return go('list=1', true);
    }
    if (!sem) return renderList();
    renderSemester(sem, p.get('view') === 'calendar' ? 'calendar' : 'overview');
  }

  function loadSemesters() {
    return apiRequest('/semesters/').then(function (list) { st.semesters = list || []; });
  }

  function init() {
    UI.state(page, 'loading', { text: 'Завантаження семестрів…' });
    loadSemesters().then(route, function () {
      UI.state(page, 'error', { text: 'Не вдалося завантажити семестри', actionLabel: 'Спробувати ще', onAction: init });
    });
  }

  function setActions(html) {
    var a = Shell.actionsEl();
    if (a) a.innerHTML = html || '';
    return a;
  }

  function fmtShort(s) {
    return new Date(s + 'T00:00:00').toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    return n + ' ' + (m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many);
  }

  /* ---------- semester list ---------- */
  function renderList() {
    st.sem = null; st.token++;
    document.title = 'Семестри — Адмін панель';
    Shell.setTitle('Семестри');
    Shell.setCrumbs(st.semesters.some(function (s) { return s.is_current; })
      ? [{ text: 'Поточний семестр', href: '/admin/semesters/' }] : []);
    setActions('<button type="button" class="btn btn-primary" data-new>' + ic('plus') + 'Новий семестр</button>')
      .querySelector('[data-new]').addEventListener('click', function () { openForm(null); });

    if (!st.semesters.length) {
      UI.state(page, 'empty', { text: 'Семестрів поки немає', actionLabel: 'Створити семестр', onAction: function () { openForm(null); } });
      return;
    }
    var rows = st.semesters.slice().sort(function (a, b) { return b.start_date.localeCompare(a.start_date); });
    page.innerHTML = (st.semesters.some(function (s) { return s.is_current; }) ? '' :
      '<div class="hint warn">' + ic('alert') + '<span><b>Поточний семестр не вибрано.</b> Оберіть семестр, з яким працюють усі сторінки за замовчуванням.</span></div>') +
      '<div class="card flush sem-list"><div class="sem-row sem-head"><span>Семестр</span><span>Період</span><span>Статус</span><span></span></div>' +
      rows.map(function (s) {
        var href = '/admin/semesters/?id=' + encodeURIComponent(s.id);
        return '<div class="sem-item danger" data-sem="' + s.id + '"><div class="sem-row' + (s.is_current ? ' is-current' : '') + '">' +
          '<span class="sem-name"><a href="' + href + '" data-open>' + esc(s.name || 'Без назви') + '</a></span>' +
          '<span class="muted num">' + esc(fmtShort(s.start_date)) + ' — ' + esc(fmtShort(s.end_date)) + '</span>' +
          '<span>' + (s.is_current ? '<span class="badge badge-ok">Поточний</span>' : '') + '</span>' +
          '<span class="sem-row-actions">' + (s.is_current ? '' :
            '<button type="button" class="btn btn-sm btn-ghost" data-confirm data-set-current>Зробити поточним</button>') +
          '<a class="btn btn-sm" href="' + href + '" data-open>Відкрити' + ic('chevron-right', 14) + '</a></span></div></div>';
      }).join('') + '</div>';
  }

  page.addEventListener('click', function (e) {
    var open = e.target.closest('a[data-open]');
    if (open && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
      e.preventDefault();
      go(open.getAttribute('href').split('?')[1] || '');
      return;
    }
    var sc = e.target.closest('[data-set-current]');
    if (sc) {
      var host = sc.closest('[data-sem]');
      confirmSetCurrent(host, Number(host.getAttribute('data-sem')));
    }
  });

  window.addEventListener('popstate', function () { if (st.semesters.length) route(); });

  function confirmSetCurrent(host, id) {
    UI.confirmInline(host, {
      warning: 'Поточний семестр бачать усі користувачі за замовчуванням: це змінить активний розклад для всіх.',
      question: 'Зробити семестр поточним?', yes: 'Так, зробити поточним', no: 'Скасувати',
      onYes: function () {
        return apiRequest('/semesters/' + id + '/set_current/', 'POST').then(function () {
          UI.toast('Поточний семестр змінено', { type: 'ok' });
          return loadSemesters().then(route);
        }, function (err) { UI.toast('Помилка оновлення статусу: ' + errText(err), { type: 'err' }); });
      }
    });
  }

  /* ---------- semester page ---------- */
  function renderSemester(sem, view) {
    var same = st.sem && st.sem.id === sem.id;
    st.sem = sem; st.view = view;
    var token = ++st.token;
    if (!same) { st.checks = st.data = st.lessons = st.constraints = null; }

    document.title = (sem.name || 'Семестр') + ' — Адмін панель';
    Shell.setTitle(sem.name || 'Без назви');
    var h = document.querySelector('.sh-title');
    if (h && sem.is_current) h.insertAdjacentHTML('beforeend', '<span class="badge badge-ok">Поточний</span>');
    Shell.setCrumbs([{ text: 'Усі семестри', href: '/admin/semesters/?list=1' }]);

    var a = setActions(
      (view === 'calendar'
        ? '<button type="button" class="btn btn-ghost" data-view="overview">' + ic('chevron-left') + 'Огляд</button>'
        : '<button type="button" class="btn btn-ghost" data-view="calendar">' + ic('calendar') + 'Календар</button>') +
      '<button type="button" class="btn btn-primary' + (st.generating ? ' is-busy' : '') + '" data-generate disabled>' + ic('bolt') + 'Згенерувати</button>');
    a.querySelector('[data-view]').addEventListener('click', function (e) { setView(e.currentTarget.getAttribute('data-view')); });
    a.querySelector('[data-generate]').addEventListener('click', askGenerate);

    page.innerHTML =
      '<div class="danger sem-confirm" id="genConfirm"></div>' +
      '<div class="card steps" id="semSteps" aria-label="Етапи семестру"><div class="loading" style="grid-column:1/-1"><span class="spinner"></span>Перевірка семестру…</div></div>' +
      (sem.is_current ? '' :
        '<div class="hint sem-hint">' + ic('info') + '<span class="grow"><b>Цей семестр не поточний.</b> Інші сторінки за замовчуванням працюють з поточним семестром.</span>' +
        '<div class="danger" data-sem="' + sem.id + '"><button type="button" class="btn btn-sm" data-confirm data-set-current>Зробити поточним</button></div></div>') +
      '<div id="semView"></div>';

    var viewEl = document.getElementById('semView');
    if (view === 'calendar') renderCalendarView(viewEl, sem);
    else viewEl.innerHTML = '<div class="sem-grid"><div class="card" id="preflight"></div><div class="card" id="groupPlans"></div></div>';

    page.querySelector('#semSteps').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-step-view]');
      if (b) setView(b.getAttribute('data-step-view'));
    });

    if (st.checks && same) { paint(); return; }
    if (view !== 'calendar') {
      UI.state(document.getElementById('preflight'), 'loading', { text: 'Передперевірка…' });
      UI.state(document.getElementById('groupPlans'), 'loading');
    }
    loadSemesterData(sem.id).then(function () { if (token === st.token) paint(); }, function (err) {
      if (token !== st.token) return;
      var box = document.getElementById('semSteps');
      UI.state(box, 'error', { text: 'Не вдалося перевірити семестр: ' + errText(err), actionLabel: 'Спробувати ще',
        onAction: function () { Checks.invalidate(sem.id); st.checks = null; renderSemester(sem, st.view); } });
      box.firstChild.style.gridColumn = '1/-1';
      var pf = document.getElementById('preflight');
      if (pf) pf.closest('.sem-grid').remove();
    });
  }

  function setView(view) {
    if (!st.sem || view === st.view) return;
    go('id=' + encodeURIComponent(st.sem.id) + (view === 'calendar' ? '&view=calendar' : ''));
  }

  function loadSemesterData(id, force) {
    if (force) Checks.invalidate(id);
    return Promise.all([
      Checks.run(id, { includeOk: true }), Checks.data(id),
      apiRequest('/lessons/?semester=' + encodeURIComponent(id)),
      apiRequest('/semester_constraints/?semester=' + encodeURIComponent(id))
    ]).then(function (r) {
      st.checks = r[0]; st.data = r[1];
      st.lessons = { total: r[2].length, locked: r[2].filter(function (l) { return l.is_locked; }).length };
      st.constraints = r[3].length;
    });
  }

  function paint() {
    renderSteps();
    renderPreflight();
    renderGroupPlans();
    var gen = document.querySelector('[data-generate]');
    if (gen) {
      var blocks = st.checks.filter(function (c) { return c.severity === 'block'; }).length;
      gen.disabled = st.generating || blocks > 0;
      gen.classList.toggle('is-busy', st.generating);
      gen.title = st.generating ? 'Генерація триває…' : blocks ? 'Спершу усуньте блокери: ' + blocks : '';
    }
    var edit = document.querySelector('[data-edit]');
    if (edit && st.lessons) { edit.disabled = false; edit.title = ''; }
  }

  function groupStats() {
    var per = Checks.plansPerGroup(st.data);
    var total = st.data.groups.length;
    var ready = st.data.groups.filter(function (g) { return per[g.id] > 0; }).length;
    return { per: per, total: total, ready: ready };
  }

  function renderSteps() {
    var d = st.data, g = groupStats();
    var blocks = st.checks.filter(function (c) { return c.severity === 'block'; }).length;
    var resOk = d.rooms.length && d.teachers.length && d.groups.length && d.subjects.length;
    var steps = [
      { name: 'Календар', done: d.slots.length > 0, meta: d.slots.length ? plural(d.slots.length, 'слот', 'слоти', 'слотів') : 'немає слотів',
        view: 'calendar', req: true },
      { name: 'Ресурси', done: !!resOk, meta: plural(d.rooms.length, 'аудиторія', 'аудиторії', 'аудиторій') + ' · ' +
        plural(d.teachers.length, 'викладач', 'викладачі', 'викладачів'), view: 'overview', req: true },
      { name: 'Плани', done: d.plans.length > 0 && g.ready === g.total, meta: d.plans.length ? g.ready + ' з ' + g.total + ' груп' : 'немає планів',
        href: '/admin/study-plans/', req: true },
      { name: 'Обмеження', done: st.constraints > 0, meta: st.constraints ? plural(st.constraints, 'обмеження', 'обмеження', 'обмежень') : 'не задано',
        href: '/admin/constraints/' },
      { name: 'Генерація', done: st.lessons.total > 0, meta: st.lessons.total ? plural(st.lessons.total, 'заняття', 'заняття', 'занять')
        : blocks ? 'блокерів: ' + blocks : 'не запускали', view: 'overview', req: true }
    ];
    var cur = steps.find(function (s) { return s.req && !s.done; });
    document.getElementById('semSteps').innerHTML = steps.map(function (s, i) {
      var cls = 'step ' + (s.done ? 'is-done' : s === cur ? 'is-cur' : 'is-todo') + (s.view === 'calendar' && st.view === 'calendar' ? ' is-view' : '');
      var inner = '<span class="step-n">' + (s.done ? Icons.svg('check', { cls: 'xs', size: 14 }) : i + 1) + '</span>' +
        '<span class="step-name">' + s.name + '</span><span class="step-meta">' + esc(s.meta) + '</span>';
      return s.href ? '<a class="' + cls + '" href="' + s.href + '">' + inner + '</a>'
        : '<button type="button" class="' + cls + '" data-step-view="' + s.view + '"' +
          (s.view === st.view && s.view === 'calendar' ? ' aria-current="page"' : '') + '>' + inner + '</button>';
    }).join('');
  }

  var SEV = { block: ['is-err', 'x'], warn: ['is-warn', 'alert'], tip: ['is-tip', 'info'], ok: ['is-ok', 'check'] };

  function renderPreflight() {
    var box = document.getElementById('preflight');
    if (!box) return;
    var sum = Checks.summary(st.checks);
    var head = [];
    if (sum.block) head.push('блокує: ' + sum.block);
    if (sum.warn) head.push('попереджень: ' + sum.warn);
    if (sum.tip) head.push('порад: ' + sum.tip);
    box.innerHTML = '<div class="card-head"><h2 class="card-title">Передперевірка</h2><span class="sp"></span>' +
      '<span class="muted sm">' + esc(head.length ? head.join(' · ') : 'усе гаразд') + '</span>' +
      '<button type="button" class="icon-btn sm bare" data-recheck aria-label="Перевірити ще раз" title="Перевірити ще раз">' + ic('clock', 15) + '</button></div>' +
      (sum.block ? '<div class="hint err" style="margin-bottom:6px">' + ic('alert') + '<span><b>Генерацію заблоковано.</b> Усуньте блокери нижче, і кнопка «Згенерувати» стане активною.</span></div>' : '') +
      st.checks.map(function (c) {
        var sv = SEV[c.severity];
        var preview = c.items && c.items.length ? c.items.slice(0, 4).map(function (it) { return it.label; }).join(', ') +
          (c.items.length > 4 ? ' та ще ' + (c.items.length - 4) : '') : '';
        return '<div class="check ' + sv[0] + '"><span class="check-ico">' + Icons.svg(sv[1], { cls: 'xs', size: 14 }) + '</span>' +
          '<span>' + esc(c.title) + (preview ? '<span class="check-sub">' + esc(preview) + '</span>' : '') + '</span>' +
          (c.severity !== 'ok' && c.action ? '<a class="btn btn-sm btn-ghost" href="' + esc(c.action.href) + '">' + esc(c.action.label) + '</a>' : '<span></span>') +
          '</div>';
      }).join('');
    box.querySelector('[data-recheck]').addEventListener('click', function () { refresh(true); });
  }

  function refresh(announce) {
    var token = st.token, sem = st.sem;
    return loadSemesterData(sem.id, true).then(function () {
      if (token === st.token) { paint(); if (announce) UI.toast('Перевірку оновлено', { type: 'ok', timeout: 2000 }); }
    }, function (err) { UI.toast('Не вдалося перевірити семестр: ' + errText(err), { type: 'err' }); });
  }

  function renderGroupPlans() {
    var box = document.getElementById('groupPlans');
    if (!box) return;
    var g = groupStats();
    if (!g.total) {
      box.innerHTML = '<div class="card-head"><h2 class="card-title">Навчальні плани по групах</h2></div>';
      box.insertAdjacentHTML('beforeend', '<div></div>');
      UI.state(box.lastChild, 'empty', { text: 'Груп ще немає' });
      return;
    }
    var list = st.data.groups.slice().sort(function (a, b) {
      var x = g.per[a.id] > 0, y = g.per[b.id] > 0;
      return x === y ? String(a.name).localeCompare(String(b.name), 'uk') : x ? 1 : -1;
    });
    box.innerHTML = '<div class="card-head"><h2 class="card-title">Навчальні плани по групах</h2><span class="sp"></span>' +
      '<span class="muted sm num">' + g.ready + ' / ' + g.total + '</span></div>' +
      '<div class="grp-sum"><div class="progress' + (g.ready < g.total ? ' warn' : '') + '"><i style="width:' + Math.round(g.ready / g.total * 100) + '%"></i></div></div>' +
      '<p class="muted sm" style="margin-bottom:8px">Група має план, якщо в цьому семестрі для неї є хоча б один план (власний або її потоку).</p>' +
      list.map(function (gr) {
        var n = g.per[gr.id] || 0;
        return '<div class="grp-row"><span class="g">' + esc(gr.name) + '</span>' +
          (n ? '<span class="muted num">' + esc(plural(n, 'план', 'плани', 'планів')) + '</span>' : '<span class="t-err">немає планів</span>') + '</div>';
      }).join('') +
      '<div class="form-actions"><a class="btn btn-sm" href="/admin/study-plans/">' + ic('clipboard') + 'Навчальні плани</a></div>';
  }

  /* ---------- «Календар» step ---------- */
  function renderCalendarView(el, sem) {
    var days = Math.round((new Date(sem.end_date + 'T00:00:00') - new Date(sem.start_date + 'T00:00:00')) / 864e5);
    el.innerHTML = '<div class="stack">' +
      '<div class="card"><div class="card-head"><h2 class="card-title">Про семестр</h2><span class="sp"></span>' +
      '<button type="button" class="btn btn-sm" data-edit' + (st.lessons ? '' : ' disabled title="Завантаження даних семестру…"') + '>' + ic('edit', 14) + 'Редагувати</button></div>' +
      '<dl class="kv"><dt>Назва</dt><dd>' + esc(sem.name) + '</dd><dt>Початок</dt><dd>' + esc(SemCalendar.fmtDate(sem.start_date)) + '</dd>' +
      '<dt>Кінець</dt><dd>' + esc(SemCalendar.fmtDate(sem.end_date)) + '</dd><dt>Тривалість</dt><dd class="num">' + esc(plural(days, 'день', 'дні', 'днів')) + '</dd>' +
      '<dt>Статус</dt><dd>' + (sem.is_current ? 'поточний' : 'не поточний') + '</dd></dl></div>' +
      '<div data-calendar class="stack"></div>' +
      '<div class="danger" id="semDanger" style="margin-top:8px"><div class="grow"><b>Видалити семестр</b><div class="muted sm">Разом із семестром буде видалено всі його слоти та заняття.</div></div>' +
      '<button type="button" class="btn btn-sm btn-danger-ghost" data-confirm data-del>' + ic('trash', 14) + 'Видалити</button></div></div>';
    el.querySelector('[data-edit]').addEventListener('click', function () { openForm(sem); });
    el.querySelector('[data-del]').addEventListener('click', function () { confirmDelete(sem); });
    st.calendar = SemCalendar.mount(el.querySelector('[data-calendar]'), sem, {
      onChange: function () { refresh(); }
    });
  }

  function confirmDelete(sem) {
    UI.confirmInline(document.getElementById('semDanger'), {
      warning: 'Це призведе до видалення всіх слотів та занять цього семестру. Дію не можна скасувати.',
      question: 'Видалити семестр «' + (sem.name || '') + '»?', yes: 'Так, видалити', no: 'Скасувати',
      onYes: function () {
        return apiRequest('/semesters/' + sem.id + '/', 'DELETE').then(function () {
          UI.toast('Семестр видалено', { type: 'ok' });
          Checks.invalidate(sem.id);
          return loadSemesters().then(function () { go('list=1'); });
        }, function (err) { UI.toast('Помилка при видаленні: ' + errText(err), { type: 'err' }); });
      }
    });
  }

  /* ---------- generation ---------- */
  function askGenerate() {
    var btn = document.querySelector('[data-generate]');
    if (!st.sem || !st.lessons || st.generating || (btn && btn.disabled)) return;
    var L = st.lessons, unlocked = L.total - L.locked;
    var warning = L.total
      ? 'Буде видалено ' + plural(unlocked, 'незаблоковане заняття', 'незаблоковані заняття', 'незаблокованих занять') +
        ' цього семестру, і розклад буде складено заново з навчальних планів.' +
        (L.locked ? ' Заблоковані заняття (' + L.locked + ') залишаться.' : '')
      : 'Розклад цього семестру буде складено з навчальних планів. Генерація може тривати кілька хвилин.';
    var host = document.getElementById('genConfirm');
    UI.confirmInline(host, { warning: warning, question: 'Згенерувати розклад для «' + st.sem.name + '»?',
      yes: 'Так, згенерувати', no: 'Скасувати', onYes: runGenerate });
    host.scrollIntoView({ block: 'nearest' });
  }

  function runGenerate() {
    var sem = st.sem, btn = document.querySelector('[data-generate]');
    if (st.generating) return;
    st.generating = true;
    if (btn) { btn.disabled = true; btn.classList.add('is-busy'); btn.title = 'Генерація триває…'; }
    UI.toast('Генерація розпочата, зачекайте…', { timeout: 6000 });
    return apiRequest('/generate-schedule/', 'POST', { semester_id: sem.id }).then(function (data) {
      if (data && data.success) {
        var miss = data.failed || data.unassigned || 0;
        UI.toast('Розклад згенеровано! Створено: ' + data.created + (miss ? ', не розміщено: ' + miss : ''), { type: miss ? 'warn' : 'ok', timeout: 8000 });
        console.log('Generation Logs:', data.logs);
      } else {
        UI.toast('Генерацію не виконано: ' + ((data && data.error) || 'невідома помилка'), { type: 'err', timeout: 8000 });
      }
    }, function (err) {
      UI.toast('Помилка генерації: ' + errText(err), { type: 'err', timeout: 8000 });
    }).then(function () {
      st.generating = false;
      // The button may have been re-rendered meanwhile; paint() restores its state.
      if (st.checks) paint();
      if (st.sem && st.sem.id === sem.id) return refresh();
    });
  }

  /* ---------- create / edit drawer ---------- */
  function timeRow(a, b) {
    return '<div class="time-row"><span class="n"></span>' +
      '<input type="time" class="input slot-start" value="' + esc(a || '') + '" required aria-label="Початок пари">' +
      '<span class="muted">–</span><input type="time" class="input slot-end" value="' + esc(b || '') + '" required aria-label="Кінець пари">' +
      '<button type="button" class="icon-btn sm bare" data-rm-time aria-label="Прибрати пару">' + ic('x', 14) + '</button></div>';
  }

  function formHtml(sem) {
    var c = (sem && sem.configuration) || {};
    var times = c.time_schedule && c.time_schedule.length ? c.time_schedule : DEFAULT_TIMES;
    var weekends = c.weekends || ['Saturday', 'Sunday'];
    return '<form class="sem-form" id="semForm" novalidate>' +
      '<div class="field"><label for="fName">Назва семестру <span class="req">*</span></label>' +
      '<input class="input" id="fName" required placeholder="Наприклад: Осінній 2025" value="' + esc(sem ? sem.name : '') + '"></div>' +
      '<div class="form-grid"><div class="field"><label for="fStart">Дата початку <span class="req">*</span></label>' +
      '<input type="date" class="input" id="fStart" required value="' + esc(sem ? sem.start_date : '') + '"></div>' +
      '<div class="field"><label for="fEnd">Дата завершення <span class="req">*</span></label>' +
      '<input type="date" class="input" id="fEnd" required value="' + esc(sem ? sem.end_date : '') + '"></div></div>' +
      '<label class="check-row"><input type="checkbox" id="fGen"> Згенерувати часові слоти</label>' +
      (sem ? '<p class="muted sm" style="margin-top:-8px">Без цієї позначки слоти синхронізуються з уже збереженими налаштуваннями.</p>' : '') +
      '<div class="cfg-block" id="fCfg" hidden>' +
      '<div class="field"><span class="label">Вихідні дні</span><div class="days" role="group" aria-label="Вихідні дні">' +
      DAYS.map(function (d) {
        var on = weekends.indexOf(d[0]) !== -1;
        return '<button type="button" class="' + (on ? 'is-on' : '') + '" aria-pressed="' + on + '" data-day="' + d[0] + '">' + d[1] + '</button>';
      }).join('') + '</div></div>' +
      '<div class="field"><span class="label">Розклад дзвінків</span><div class="time-rows" id="fTimes">' +
      times.map(function (t) { return timeRow(t[0], t[1]); }).join('') + '</div>' +
      '<div><button type="button" class="btn btn-sm btn-ghost" data-add-time>' + ic('plus', 14) + 'Додати пару</button></div></div>' +
      '<div class="field"><label for="fExcl">Виключити дати (свята)</label><textarea class="textarea" id="fExcl" placeholder="2025-12-25">' +
      esc((c.dates_excluded || []).join('\n')) + '</textarea><span class="help">Кожна дата з нового рядка (РРРР-ММ-ДД)</span></div>' +
      '<div class="field"><label for="fIncl">Включити дати (відпрацювання)</label><textarea class="textarea" id="fIncl" placeholder="2025-12-28">' +
      esc((c.dates_included || []).join('\n')) + '</textarea><span class="help">Кожна дата з нового рядка (РРРР-ММ-ДД)</span></div>' +
      '</div></form>';
  }

  function numberTimes(form) {
    Array.prototype.forEach.call(form.querySelectorAll('.time-row .n'), function (n, i) { n.textContent = (i + 1) + '.'; });
  }

  function lines(v) { return v.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }

  function collect(form) {
    var data = {
      name: form.querySelector('#fName').value.trim(),
      start_date: form.querySelector('#fStart').value,
      end_date: form.querySelector('#fEnd').value
    };
    if (form.querySelector('#fGen').checked) {
      data.generation_config = {
        weekends: Array.prototype.map.call(form.querySelectorAll('[data-day].is-on'), function (b) { return b.getAttribute('data-day'); }),
        time_schedule: Array.prototype.map.call(form.querySelectorAll('.time-row'), function (r) {
          return [r.querySelector('.slot-start').value, r.querySelector('.slot-end').value];
        }),
        dates_excluded: lines(form.querySelector('#fExcl').value),
        dates_included: lines(form.querySelector('#fIncl').value),
        day_time_excluded: {},
        date_time_excluded: {}
      };
    }
    return data;
  }

  function validate(form, data) {
    var bad = null;
    ['#fName', '#fStart', '#fEnd'].forEach(function (s) {
      var el = form.querySelector(s), empty = !el.value.trim();
      el.classList.toggle('is-err', empty);
      if (empty && !bad) bad = el;
    });
    if (bad) { bad.focus(); UI.toast('Заповніть обовʼязкові поля', { type: 'err' }); return false; }
    if (data.end_date < data.start_date) {
      form.querySelector('#fEnd').classList.add('is-err');
      UI.toast('Дата завершення раніше за дату початку', { type: 'err' });
      return false;
    }
    if (data.generation_config && data.generation_config.time_schedule.some(function (t) { return !t[0] || !t[1]; })) {
      UI.toast('Вкажіть початок і кінець кожної пари', { type: 'err' });
      return false;
    }
    return true;
  }

  function openForm(sem) {
    var foot = '<div class="danger sem-confirm" id="fFoot"><span data-confirm class="row">' +
      '<button type="button" class="btn btn-ghost" data-cancel>Скасувати</button>' +
      '<button type="submit" form="semForm" class="btn btn-primary" data-save>Зберегти</button></span></div>';
    var dr = UI.drawer({ title: sem ? 'Редагувати семестр' : 'Новий семестр', body: formHtml(sem), foot: foot });
    var form = dr.el.querySelector('#semForm');
    var cfg = form.querySelector('#fCfg');
    numberTimes(form);

    form.querySelector('#fGen').addEventListener('change', function (e) { cfg.hidden = !e.target.checked; });
    form.addEventListener('click', function (e) {
      var day = e.target.closest('[data-day]');
      if (day) { var on = day.classList.toggle('is-on'); day.setAttribute('aria-pressed', String(on)); return; }
      if (e.target.closest('[data-add-time]')) {
        form.querySelector('#fTimes').insertAdjacentHTML('beforeend', timeRow('', ''));
        numberTimes(form);
        form.querySelector('#fTimes .time-row:last-child .slot-start').focus();
        return;
      }
      var rm = e.target.closest('[data-rm-time]');
      if (rm) { rm.closest('.time-row').remove(); numberTimes(form); }
    });
    dr.el.querySelector('[data-cancel]').addEventListener('click', dr.close);

    var footHost = dr.el.querySelector('#fFoot');
    var saveBtn = dr.el.querySelector('[data-save]');

    function askScheduleDeletion(data) {
      UI.confirmInline(footHost, {
        warning: 'Цей семестр вже має згенерований розклад. Редагування параметрів семестру призведе до повного видалення поточного розкладу.',
        question: 'Продовжити?', yes: 'Так, видалити та змінити', no: 'Скасувати',
        onYes: function () {
          var d = Object.assign({}, data, { confirm_schedule_deletion: true });
          return save(d);
        }
      });
    }

    function save(data) {
      saveBtn.disabled = true; saveBtn.textContent = 'Збереження…';
      var req = sem ? apiRequest('/semesters/' + sem.id + '/', 'PUT', data) : apiRequest('/semesters/', 'POST', data);
      return req.then(function (res) {
        UI.toast(sem ? 'Семестр оновлено' : 'Семестр створено', { type: 'ok' });
        if (sem) Checks.invalidate(sem.id);
        dr.close();
        return loadSemesters().then(function () {
          var id = sem ? sem.id : res && res.id;
          if (sem) { st.checks = null; st.sem = null; }
          go(id ? 'id=' + encodeURIComponent(id) + (sem && st.view === 'calendar' ? '&view=calendar' : '') : 'list=1', !!sem);
        });
      }, function (err) {
        saveBtn.disabled = false; saveBtn.textContent = 'Зберегти';
        if (sem && err.status === 409 && !data.confirm_schedule_deletion) {
          setTimeout(function () { askScheduleDeletion(data); }, 0);
          return;
        }
        if (sem && err.status >= 500) {
          UI.toast('Сервер не зміг оновити семестр (помилка ' + err.status + '). Якщо в семестрі вже є розклад, бекенд поки не дозволяє змінювати його параметри.', { type: 'err', timeout: 10000 });
          return;
        }
        UI.toast('Помилка: ' + errText(err), { type: 'err', timeout: 8000 });
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (saveBtn.disabled) return;
      var data = collect(form);
      if (!validate(form, data)) return;
      var hasSchedule = sem && (sem.is_generated || sem.schedule ||
        (st.sem && st.sem.id === sem.id && st.lessons && st.lessons.total > 0));
      if (hasSchedule) { askScheduleDeletion(data); return; }
      save(data);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
