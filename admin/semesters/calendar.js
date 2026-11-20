/* «Календар» step of the semester page: generation settings, slot stats, month grid,
   day drawer with slots (add / inline delete). Classic script: window.SemCalendar. */
(function () {
  'use strict';

  var esc = function (s) { return UI.escapeHtml(s); };
  var ic = function (n, size) { return Icons.svg(n, { size: size || 16 }); };

  var MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  var DAY_UK = { Monday: 'Понеділок', Tuesday: 'Вівторок', Wednesday: 'Середа', Thursday: 'Четвер',
    Friday: "П'ятниця", Saturday: 'Субота', Sunday: 'Неділя' };

  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtDate(s) {
    return new Date(s + 'T00:00:00').toLocaleDateString('uk-UA', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function mount(host, semester, opts) {
    opts = opts || {};
    var st = { slots: [], byDate: {}, month: null, drawer: null, dateStr: null };
    var today = iso(new Date());
    var start = new Date(semester.start_date + 'T00:00:00');
    st.month = (today >= semester.start_date && today <= semester.end_date) ? new Date() : start;
    st.month = new Date(st.month.getFullYear(), st.month.getMonth(), 1);

    host.innerHTML =
      '<div class="sem-cal-grid">' + settingsHtml(semester.configuration || {}) +
      '<div class="card"><div class="card-head"><h2 class="card-title">Статистика слотів</h2></div><div data-stats></div></div></div>' +
      '<div class="card"><div class="card-head"><h2 class="card-title">Календар часових слотів</h2><span class="sp"></span>' +
      '<div class="cal-nav"><button type="button" class="icon-btn sm" data-month="-1" aria-label="Попередній місяць">' + ic('chevron-left') + '</button>' +
      '<span class="cal-month" data-month-label></span>' +
      '<button type="button" class="icon-btn sm" data-month="1" aria-label="Наступний місяць">' + ic('chevron-right') + '</button></div></div>' +
      '<div data-cal></div>' +
      '<div class="cal-legend"><span><i class="has"></i>є пари</span><span><i class="we"></i>субота, неділя</span></div></div>';

    var statsEl = host.querySelector('[data-stats]');
    var calEl = host.querySelector('[data-cal]');

    host.addEventListener('click', function (e) {
      var m = e.target.closest('[data-month]');
      if (m) { st.month.setMonth(st.month.getMonth() + Number(m.getAttribute('data-month'))); renderMonth(); return; }
      var d = e.target.closest('[data-date]');
      if (d) openDay(d.getAttribute('data-date'));
    });

    function load() {
      UI.state(calEl, 'loading', { text: 'Завантаження календаря…' });
      return apiRequest('/semesters/' + semester.id + '/slots/').then(function (slots) {
        st.slots = slots || [];
        st.byDate = {};
        st.slots.forEach(function (s) { (st.byDate[s.date] = st.byDate[s.date] || []).push(s); });
        Object.keys(st.byDate).forEach(function (k) {
          st.byDate[k].sort(function (a, b) { return a.start_time.localeCompare(b.start_time); });
        });
        renderStats();
        renderMonth();
      }, function () {
        statsEl.innerHTML = '';
        UI.state(calEl, 'error', { text: 'Не вдалося завантажити часові слоти', actionLabel: 'Спробувати ще', onAction: load });
      });
    }

    function renderStats() {
      var days = Object.keys(st.byDate).length;
      var total = st.slots.length;
      if (!total) {
        statsEl.innerHTML = '<div class="hint warn">' + ic('alert') + '<span><b>Слотів ще немає.</b> Відредагуйте семестр і увімкніть «Згенерувати часові слоти».</span></div>';
        return;
      }
      statsEl.innerHTML = '<div class="sem-stats">' +
        stat(days, 'робочих днів') + stat(total, 'усього слотів') + stat((total / days).toFixed(1), 'пар на день у середньому') + '</div>';
    }
    function stat(v, label) { return '<div class="sem-stat"><b>' + esc(v) + '</b><span>' + esc(label) + '</span></div>'; }

    function renderMonth() {
      var y = st.month.getFullYear(), mo = st.month.getMonth();
      host.querySelector('[data-month-label]').textContent = MONTHS[mo] + ' ' + y;
      var first = new Date(y, mo, 1), days = new Date(y, mo + 1, 0).getDate();
      var lead = (first.getDay() + 6) % 7;
      var html = '<div class="cal">' + ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].map(function (d) {
        return '<div class="cal-dh">' + d + '</div>';
      }).join('');
      for (var i = 0; i < lead; i++) html += '<div class="cal-gap"></div>';
      for (var d = 1; d <= days; d++) {
        var date = new Date(y, mo, d), ds = iso(date), dow = date.getDay();
        var n = (st.byDate[ds] || []).length;
        var cls = 'cal-day' + (dow === 0 || dow === 6 ? ' is-weekend' : '') + (n ? ' has-slots' : '') +
          (ds < semester.start_date || ds > semester.end_date ? ' is-out' : '') + (ds === today ? ' is-today' : '');
        html += '<button type="button" class="' + cls + '" data-date="' + ds + '" aria-label="' + esc(fmtDate(ds)) + ', пар: ' + n + '">' +
          '<span class="cal-n">' + d + '</span><span class="cal-c">' + (n ? n + (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? ' пари' : n % 10 === 1 && n % 100 !== 11 ? ' пара' : ' пар') : 'немає пар') + '</span></button>';
      }
      calEl.innerHTML = html + '</div>';
    }

    function dayBody(ds) {
      var list = st.byDate[ds] || [];
      var html = '<div class="section-title">Пари на цей день</div>';
      html += list.length ? '<div data-slot-list>' + list.map(function (s) {
        return '<div class="slot-row danger" data-slot="' + s.id + '"><span class="t">' + esc(s.start_time.substring(0, 5)) + ' – ' +
          esc(s.end_time.substring(0, 5)) + '</span>' + (s.period_number ? '<span class="muted sm">' + esc(s.period_number) + ' пара</span>' : '') +
          '<span class="sp"></span><button type="button" class="btn btn-sm btn-danger-ghost" data-confirm data-del-slot="' + s.id + '">' +
          ic('trash', 14) + 'Видалити</button></div>';
      }).join('') + '</div>' : '<p class="muted">На цей день немає пар</p>';
      var times = (semester.configuration && semester.configuration.time_schedule) || [];
      if (times.length) {
        html += '<div class="section"><div class="section-title">Додати пару</div><div class="slot-add">' +
          '<select class="select" data-new-slot aria-label="Час пари"><option value="">Оберіть час</option>' +
          times.map(function (t, i) {
            return '<option value="' + esc(t[0] + '|' + t[1]) + '">' + (i + 1) + '. ' + esc(t[0]) + ' – ' + esc(t[1]) + '</option>';
          }).join('') + '</select><button type="button" class="btn btn-primary" data-add-slot>' + ic('plus') + 'Додати</button></div></div>';
      }
      return html;
    }

    function openDay(ds) {
      st.dateStr = ds;
      if (st.drawer) st.drawer.close();
      var dr = st.drawer = UI.drawer({ title: fmtDate(ds), body: dayBody(ds), onClose: function () { if (st.drawer === dr) st.drawer = null; } });
      dr.el.addEventListener('click', function (e) {
        var del = e.target.closest('[data-del-slot]');
        if (del) {
          var row = del.closest('.slot-row');
          UI.confirmInline(row, { question: 'Видалити цю пару?', yes: 'Видалити', no: 'Скасувати',
            onYes: function () { return deleteSlot(Number(del.getAttribute('data-del-slot'))); } });
          return;
        }
        if (e.target.closest('[data-add-slot]')) addSlot(dr.el.querySelector('[data-new-slot]'));
      });
    }

    function refreshDay() {
      return load().then(function () {
        if (st.drawer && st.dateStr) st.drawer.el.querySelector('.drawer-body').innerHTML = dayBody(st.dateStr);
        if (opts.onChange) opts.onChange();
      });
    }

    function addSlot(select) {
      if (!select || !select.value) { UI.toast('Оберіть час пари', { type: 'err' }); return; }
      var t = select.value.split('|');
      return apiRequest('/timeslots/', 'POST', { semester: semester.id, date: st.dateStr, start_time: t[0], end_time: t[1] })
        .then(function () { UI.toast('Пару додано', { type: 'ok' }); return refreshDay(); },
          function (err) { UI.toast('Не вдалося додати пару: ' + errText(err), { type: 'err' }); });
    }

    function deleteSlot(id) {
      return apiRequest('/timeslots/' + id + '/', 'DELETE')
        .then(function () { UI.toast('Пару видалено', { type: 'ok' }); return refreshDay(); },
          function (err) { UI.toast('Помилка при видаленні: ' + errText(err), { type: 'err' }); });
    }

    load();
    return { reload: load, close: function () { if (st.drawer) st.drawer.close(); } };
  }

  function settingsHtml(c) {
    var rows = [];
    if (c.weekends && c.weekends.length) rows.push(['Вихідні дні', c.weekends.map(function (d) {
      return '<span class="badge">' + esc(DAY_UK[d] || d) + '</span>';
    }).join('')]);
    if (c.time_schedule && c.time_schedule.length) rows.push(['Розклад дзвінків', c.time_schedule.map(function (t, i) {
      return '<span class="badge num">' + (i + 1) + '. ' + esc(t[0]) + ' – ' + esc(t[1]) + '</span>';
    }).join('')]);
    if (c.dates_excluded && c.dates_excluded.length) rows.push(['Виключені дати', c.dates_excluded.map(function (d) {
      return '<span class="badge">' + esc(fmtDate(d)) + '</span>';
    }).join('')]);
    if (c.dates_included && c.dates_included.length) rows.push(['Додаткові робочі дати', c.dates_included.map(function (d) {
      return '<span class="badge">' + esc(fmtDate(d)) + '</span>';
    }).join('')]);
    var body = rows.length ? '<dl>' + rows.map(function (r) {
      return '<div class="cfg-row"><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>';
    }).join('') + '</dl>' : '<p class="muted">Налаштування генерації не задано</p>';
    return '<div class="card"><div class="card-head"><h2 class="card-title">Налаштування генерації слотів</h2></div>' + body + '</div>';
  }

  function errText(err) { return UI.errorText(err, 'невідома помилка'); }

  window.SemCalendar = { mount: mount, errText: errText, fmtDate: fmtDate, DAY_UK: DAY_UK };
})();
