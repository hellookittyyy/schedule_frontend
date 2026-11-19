/* Задачі (plan 0001 phase 6): readiness from Checks, task list with inline fixes,
   lessons happening now, room occupancy heatmap. Needs api.js, ui.js, icons.js, shell.js, checks.js. */
(function () {
  'use strict';

  var esc = UI.escapeHtml;
  var page = document.getElementById('tasksPage');
  var ITEM_LIMIT = 6;
  var DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  var DAY_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var SEV = {
    block: { label: 'Блокує', cls: 'sev-high', icon: 'alert' },
    warn: { label: 'Погіршує', cls: 'sev-mid', icon: 'alert' },
    tip: { label: 'Поради', cls: 'sev-low', icon: 'info' }
  };

  // Checks whose items can be fixed here: both go through POST /teachers/{id}/manage_subjects/.
  var FIX = {
    'subjects-without-teacher': {
      button: 'Призначити викладача',
      label: function (it) { return 'Хто веде «' + it.label + '»'; },
      placeholder: 'Оберіть викладача',
      options: function (d) { return d.teachers; },
      pair: function (it, optId) { return { teacher: optId, subject: it.id }; }
    },
    'teachers-without-subjects': {
      button: 'Додати предмет',
      label: function (it) { return 'Який предмет веде ' + it.label; },
      placeholder: 'Оберіть предмет',
      options: function (d) { return d.subjects; },
      pair: function (it, optId) { return { teacher: it.id, subject: optId }; }
    }
  };

  var st = { sid: null, sem: null, d: null, list: [], open: null, expanded: {}, week: null, today: [] };

  function ic(name, size) { return window.Icons ? Icons.svg(name, { size: size || 16 }) : ''; }

  /* ---------- dates ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(dt) { return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()); }
  function parse(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(dt, n) { var x = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); x.setDate(x.getDate() + n); return x; }
  function monday(dt) { return addDays(dt, -((dt.getDay() + 6) % 7)); }
  function dayIdx(s) { return (parse(s).getDay() + 6) % 7; }
  function shortDate(dt, withMonth) {
    return withMonth ? dt.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' }) : String(dt.getDate());
  }
  function weekLabel(mon) {
    var sun = addDays(mon, 6);
    return mon.getMonth() === sun.getMonth()
      ? shortDate(mon) + '–' + shortDate(sun, true)
      : shortDate(mon, true) + ' – ' + shortDate(sun, true);
  }
  function hm(t) { return String(t || '').slice(0, 5); }

  /* ---------- load ---------- */
  function init() {
    UI.state(page, 'loading');
    var q = new URLSearchParams(location.search).get('semester');
    apiRequest('/semesters/').then(function (sems) {
      sems = sems || [];
      var sem = q ? sems.find(function (s) { return String(s.id) === q; })
        : sems.find(function (s) { return s.is_current; });
      if (!sem) {
        UI.state(page, 'empty', { text: q ? 'Семестр не знайдено' : 'Немає поточного семестру',
          actionLabel: 'Відкрити семестри', onAction: function () { location.href = '/admin/semesters/'; } });
        return;
      }
      st.sem = sem;
      st.sid = sem.id;
      Shell.setCrumbs([{ text: sem.name, href: '/admin/semesters/?id=' + encodeURIComponent(sem.id) }]);
      page.innerHTML = '<div class="tk-top" id="tkTop"></div>' +
        '<div class="split"><div class="card" id="tkList"></div>' +
        '<div class="col"><div class="card" id="tkNow" hidden></div><div class="card" id="tkHeat"></div></div></div>';
      st.week = initialWeek();
      loadChecks();
      loadNow();
      loadWeek();
    }).catch(function () {
      UI.state(page, 'error', { actionLabel: 'Повторити', onAction: init });
    });
  }

  function loadChecks() {
    return Promise.all([Checks.run(st.sid, { includeOk: true }), Checks.data(st.sid)]).then(function (r) {
      st.list = r[0];
      st.d = r[1];
      renderTop();
      renderTasks();
    }).catch(function () {
      UI.state(document.getElementById('tkList'), 'error', { text: 'Не вдалося виконати перевірки',
        actionLabel: 'Повторити', onAction: function () { Checks.invalidate(st.sid); loadChecks(); } });
    });
  }

  function refreshChecks() {
    Checks.invalidate(st.sid);
    return loadChecks();
  }

  /* ---------- hero + KPIs ---------- */
  function renderTop() {
    var box = document.getElementById('tkTop');
    var s = Checks.summary(st.list);
    var total = st.list.length;
    var pct = total ? Math.round(s.ok / total * 100) : 0;
    var capped = s.block > 0 && pct > 50;
    if (capped) pct = 50;
    var items = { block: 0, warn: 0, tip: 0 };
    st.list.forEach(function (c) { if (items[c.severity] != null) items[c.severity] += c.count || 0; });

    var hero = '<div class="card hero">' +
      '<div class="hero-label">Готовність до генерації</div>' +
      '<div class="hero-row"><span class="hero-value">' + pct + '<small>%</small></span>' +
      '<span class="hero-note">' + (s.block ? 'Блокерів: ' + s.block : 'Блокерів немає') + '</span></div>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '<div class="hero-cap">Пройдено ' + s.ok + ' з ' + total + ' перевірок семестру' +
        (capped ? '; поки є блокери, готовність не перевищує 50%' : '') + '</div>' +
      '<a class="btn btn-hero" href="/admin/semesters/?id=' + encodeURIComponent(st.sid) + '">Відкрити семестр ' + ic('arrow') + '</a></div>';

    var kpis = ['block', 'warn', 'tip'].map(function (k) {
      var n = s[k];
      var note = !n ? 'Нічого немає' : items[k] ? 'Записів у переліку: ' + items[k] : 'Див. список задач';
      return '<div class="card kpi kpi-' + k + '"><div class="kpi-label"><i class="sev ' + SEV[k].cls + '"></i>' + SEV[k].label + '</div>' +
        '<div class="kpi-value">' + n + '</div><div class="kpi-note">' + note + '</div></div>';
    }).join('');
    box.innerHTML = hero + kpis;
  }

  /* ---------- task list ---------- */
  function fixPanel(c, it) {
    var f = FIX[c.id];
    var opts = f.options(st.d).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'uk'); });
    return '<div class="task-fix" data-fix="' + esc(c.id) + '" data-item="' + esc(it.id) + '">' +
      '<label class="fix-label" for="fixSel">' + esc(f.label(it)) + '</label>' +
      '<div class="fix-row"><select class="select" id="fixSel"><option value="">' + esc(f.placeholder) + '</option>' +
      opts.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.name) + '</option>'; }).join('') +
      '</select><button type="button" class="btn btn-primary btn-sm" data-act="apply">Зберегти</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="close">Скасувати</button></div></div>';
  }

  function itemsHtml(c) {
    if (!c.items || !c.items.length) return '';
    var fix = FIX[c.id];
    var all = st.expanded[c.id];
    var openIdx = -1;
    c.items.forEach(function (it, i) { if (st.open === c.id + ':' + it.id) openIdx = i; });
    var shown = all || openIdx >= ITEM_LIMIT ? c.items : c.items.slice(0, ITEM_LIMIT);
    var html = shown.map(function (it) {
      var key = c.id + ':' + it.id;
      var isOpen = fix && st.open === key;
      return '<div class="task-item' + (isOpen ? ' is-open' : '') + '"><span class="grow ellipsis">' + esc(it.label) + '</span>' +
        (fix && !isOpen ? '<button type="button" class="link-btn" data-act="open" data-key="' + esc(key) + '">' + esc(fix.button) + '</button>' : '') +
        '</div>' + (isOpen ? fixPanel(c, it) : '');
    }).join('');
    if (c.items.length > shown.length) {
      html += '<button type="button" class="link-btn task-more" data-act="more" data-check="' + esc(c.id) + '">Показати всі (' + c.items.length + ')</button>';
    } else if (all && c.items.length > ITEM_LIMIT) {
      html += '<button type="button" class="link-btn task-more" data-act="less" data-check="' + esc(c.id) + '">Згорнути</button>';
    }
    return '<div class="task-items">' + html + '</div>';
  }

  function taskHtml(c) {
    var sev = SEV[c.severity];
    var meta = c.items && c.items.length ? 'Записів: ' + c.items.length : '';
    return '<div class="task" data-check="' + esc(c.id) + '">' +
      '<span class="sev-ico ' + sev.cls + '">' + ic(sev.icon) + '</span>' +
      '<div><div class="task-title">' + esc(c.title) + '</div>' + (meta ? '<div class="task-meta">' + meta + '</div>' : '') + '</div>' +
      (c.action ? '<a class="btn btn-sm ' + (c.severity === 'block' ? 'btn-primary' : 'btn-ghost') + '" href="' + esc(c.action.href) + '">' + esc(c.action.label) + '</a>' : '<span></span>') +
      itemsHtml(c) + '</div>';
  }

  function renderTasks() {
    var box = document.getElementById('tkList');
    var open = st.list.filter(function (c) { return c.severity !== 'ok'; });
    var ok = st.list.filter(function (c) { return c.severity === 'ok'; });
    var html = '<div class="card-head"><h2 class="card-title">Потребує уваги</h2></div>';
    if (!open.length) html += '<p class="muted">Усі перевірки пройдено — семестр готовий до генерації.</p>';
    ['block', 'warn', 'tip'].forEach(function (k) {
      var g = open.filter(function (c) { return c.severity === k; });
      if (!g.length) return;
      html += '<div class="task-group"><div class="task-group-label"><i class="sev ' + SEV[k].cls + '"></i>' + SEV[k].label +
        ' <span class="num">' + g.length + '</span></div>' + g.map(taskHtml).join('') + '</div>';
    });
    if (ok.length) {
      html += '<div class="task-group"><div class="task-group-label"><i class="sev sev-ok"></i>Пройдено <span class="num">' + ok.length + '</span></div>' +
        ok.map(function (c) {
          return '<div class="task task-ok"><span class="check-ico">' + ic('check', 14) + '</span><div>' + esc(c.title) + '</div><span></span></div>';
        }).join('') + '</div>';
    }
    box.innerHTML = html;
    var sel = box.querySelector('#fixSel');
    if (sel) sel.focus();
  }

  function findItem(checkId, itemId) {
    var c = st.list.find(function (x) { return x.id === checkId; });
    var it = c && c.items.find(function (x) { return String(x.id) === String(itemId); });
    return it ? { c: c, it: it } : null;
  }

  function nameOf(arr, id) {
    var o = (arr || []).find(function (x) { return String(x.id) === String(id); });
    return o ? o.name : '';
  }

  function manage(pair, action) {
    return apiRequest('/teachers/' + encodeURIComponent(pair.teacher) + '/manage_subjects/', 'POST',
      { subject_id: Number(pair.subject), action: action });
  }

  function errText(err, fallback) {
    var d = err && err.data;
    return (d && (d.error || d.detail)) || fallback;
  }

  function applyFix(panel, btn) {
    var hit = findItem(panel.getAttribute('data-fix'), panel.getAttribute('data-item'));
    var sel = panel.querySelector('select');
    if (!hit || !sel.value) { sel.focus(); return; }
    var pair = FIX[hit.c.id].pair(hit.it, sel.value);
    var tName = nameOf(st.d.teachers, pair.teacher);
    var sName = nameOf(st.d.subjects, pair.subject);
    btn.disabled = true;
    manage(pair, 'add').then(function () {
      st.open = null;
      return refreshChecks();
    }).then(function () {
      UI.toast('«' + sName + '» призначено викладачу ' + tName, { type: 'ok', action: { label: 'Скасувати', onClick: function () {
        manage(pair, 'remove').then(refreshChecks).then(function () { UI.toast('Призначення скасовано'); })
          .catch(function (err) { UI.toast(errText(err, 'Не вдалося скасувати'), { type: 'err' }); });
      } } });
    }).catch(function (err) {
      btn.disabled = false;
      UI.toast(errText(err, 'Не вдалося зберегти'), { type: 'err' });
    });
  }

  page.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b || !page.contains(b)) return;
    var act = b.getAttribute('data-act');
    if (act === 'open') { st.open = b.getAttribute('data-key'); renderTasks(); }
    else if (act === 'close') { st.open = null; renderTasks(); }
    else if (act === 'more') { st.expanded[b.getAttribute('data-check')] = true; renderTasks(); }
    else if (act === 'less') { st.expanded[b.getAttribute('data-check')] = false; renderTasks(); }
    else if (act === 'apply') applyFix(b.closest('.task-fix'), b);
    else if (act === 'week') { st.week = addDays(st.week, Number(b.getAttribute('data-step')) * 7); loadWeek(); }
  });

  page.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && st.open && e.target.closest('.task-fix')) { st.open = null; renderTasks(); }
  });

  /* ---------- now in the building ---------- */
  function lessonType(name) {
    var n = String(name || '').toLowerCase();
    if (n.indexOf('лек') === 0) return 'lec';
    if (n.indexOf('лаб') === 0) return 'lab';
    if (n.indexOf('практ') === 0 || n.indexOf('сем') === 0) return 'pr';
    if (n.indexOf('екз') === 0 || n.indexOf('іспит') === 0 || n.indexOf('залік') === 0) return 'exam';
    return '';
  }

  function loadNow() {
    var today = iso(new Date());
    st.todayIso = today;
    apiRequest('/lessons/?date_from=' + today + '&date_to=' + today).then(function (list) {
      st.today = list || [];
      renderNow();
    }).catch(function () { st.today = []; renderNow(); });
  }

  function renderNow() {
    var box = document.getElementById('tkNow');
    if (!box) return;
    var now = new Date();
    if (st.todayIso && iso(now) !== st.todayIso) { loadNow(); return; }
    var t = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    var cur = st.today.filter(function (l) {
      var s = l.time_slot_details || {};
      return s.start_time && s.end_time && s.start_time <= t && t < s.end_time;
    }).sort(function (a, b) { return String((a.room_details || {}).title).localeCompare(String((b.room_details || {}).title), 'uk', { numeric: true }); });
    if (!cur.length) { box.hidden = true; box.innerHTML = ''; return; }
    var s0 = cur[0].time_slot_details;
    box.hidden = false;
    box.innerHTML = '<div class="card-head"><h2 class="card-title">Зараз у корпусі</h2><span class="sp"></span>' +
      '<span class="muted sm">' + (s0.period_number ? s0.period_number + ' пара · ' : '') + hm(s0.start_time) + '–' + hm(s0.end_time) + '</span></div>' +
      cur.map(function (l) {
        var p = l.study_plan_details || {};
        var type = lessonType(p.class_type);
        return '<div class="now-row"><span class="room">' + esc((l.room_details || {}).title || '—') + '</span>' +
          '<span class="grow"><div class="t ellipsis">' + esc(p.subject || '') + '</div><div class="muted sm ellipsis">' + esc(p.group || p.stream || '') + '</div></span>' +
          (p.class_type ? '<span class="badge' + (type ? ' badge-' + type : '') + '">' + esc(p.class_type) + '</span>' : '<span></span>') + '</div>';
      }).join('');
  }

  setInterval(renderNow, 60000);

  /* ---------- room heatmap ---------- */
  function initialWeek() {
    var start = parse(st.sem.start_date), end = parse(st.sem.end_date), today = new Date();
    var d = today < start ? start : today > end ? end : today;
    return monday(d);
  }

  function loadWeek() {
    var box = document.getElementById('tkHeat');
    var mon = st.week, sun = addDays(mon, 6);
    renderHeatHead(box, null);
    Promise.all([
      apiRequest('/lessons/?semester=' + encodeURIComponent(st.sid) + '&date_from=' + iso(mon) + '&date_to=' + iso(sun)),
      Checks.data(st.sid)
    ]).then(function (r) {
      if (st.week !== mon) return;
      renderHeat(box, r[0] || [], r[1].rooms || []);
    }).catch(function () {
      if (st.week !== mon) return;
      renderHeatHead(box, '<p class="muted sm">Не вдалося завантажити заняття тижня.</p>');
    });
  }

  function renderHeatHead(box, body) {
    var start = monday(parse(st.sem.start_date)), end = parse(st.sem.end_date);
    var prevOff = st.week <= start, nextOff = addDays(st.week, 7) > end;
    box.innerHTML = '<div class="card-head"><h2 class="card-title">Завантаженість аудиторій</h2><span class="sp"></span>' +
      '<div class="week-sw"><button type="button" class="icon-btn sm bare" data-act="week" data-step="-1" aria-label="Попередній тиждень"' + (prevOff ? ' disabled' : '') + '>' + ic('chevron-left') + '</button>' +
      '<span class="lbl">' + esc(weekLabel(st.week)) + '</span>' +
      '<button type="button" class="icon-btn sm bare" data-act="week" data-step="1" aria-label="Наступний тиждень"' + (nextOff ? ' disabled' : '') + '>' + ic('chevron-right') + '</button></div></div>' +
      (body == null ? '<div class="loading" role="status"><span class="spinner"></span></div>' : body);
  }

  function renderHeat(box, lessons, rooms) {
    if (!lessons.length) { renderHeatHead(box, '<p class="muted sm">На цьому тижні занять немає.</p>'); return; }
    var weekends = ((st.sem.configuration || {}).weekends) || [];
    var periods = ((st.sem.configuration || {}).time_schedule || []).length;
    var occ = {}, used = {}, maxP = 0;
    lessons.forEach(function (l) {
      var s = l.time_slot_details || {};
      var rid = l.room != null ? l.room : (l.room_details || {}).id;
      if (rid == null || !s.date) return;
      var di = dayIdx(s.date);
      used[di] = 1;
      var k = rid + ':' + di;
      (occ[k] = occ[k] || {})[s.period_number || s.start_time] = 1;
      if (s.period_number > maxP) maxP = s.period_number;
    });
    periods = periods || maxP || 1;
    var days = [];
    for (var i = 0; i < 7; i++) if (used[i] || weekends.indexOf(DAY_EN[i]) === -1) days.push(i);
    rooms = rooms.slice().sort(function (a, b) { return String(a.title).localeCompare(String(b.title), 'uk', { numeric: true }); });

    var cells = '<span></span>' + days.map(function (di) {
      return '<span class="hd">' + DAY_SHORT[di] + ' ' + addDays(st.week, di).getDate() + '</span>';
    }).join('');
    rooms.forEach(function (r) {
      cells += '<span class="rm" title="' + esc(r.title + (r.building ? ' · ' + r.building : '')) + '">' + esc(r.title) + '</span>';
      days.forEach(function (di) {
        var n = Object.keys(occ[r.id + ':' + di] || {}).length;
        var lvl = n ? Math.min(4, Math.max(1, Math.round(n / periods * 4))) : 0;
        cells += '<i class="h' + lvl + '" title="' + esc(r.title + ' · ' + DAY_SHORT[di] + ': ' + n + ' з ' + periods + ' пар') + '"></i>';
      });
    });
    renderHeatHead(box, '<div class="heat" style="grid-template-columns:minmax(40px,auto) repeat(' + days.length + ',minmax(0,1fr))">' + cells + '</div>' +
      '<div class="legend"><span>0</span>' + [0, 1, 2, 3, 4].map(function (i) { return '<i class="h' + i + '"></i>'; }).join('') + '<span>' + periods + ' пар</span></div>' +
      '<div class="heat-cap">Скільки пар із ' + periods + ' зайнято в аудиторії за день.</div>');
  }

  init();
})();
