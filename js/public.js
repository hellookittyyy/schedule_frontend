/* Public schedule page: search (groups + teachers), ?g= / ?t= links, «мій розклад», now/next, day/week view, ICS. */
(function () {
  'use strict';

  var esc = UI.escapeHtml;
  var ic = function (n, s) { return Icons.svg(n, { size: s || 16 }); };
  var $ = function (id) { return document.getElementById(id); };
  var MY_KEY = 'myschedule';
  var DW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  var DW_FULL = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота', 'Неділя'];
  var MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

  var groups = [], teachers = [], streams = [];
  var cur = null;            // {type:'g'|'t', id, name, obj}
  var weekStart = null;      // Date (Monday 00:00)
  var dayIdx = 0;            // 0..6
  var view = 'day';
  var weekLessons = [];
  var upcoming = [];
  var weekReq = 0, upReq = 0;
  var weekState = 'loading'; // loading | ok | error

  /* ---------- dates ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function mondayOf(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); }
  function dayIndex(d) { return (d.getDay() + 6) % 7; }
  function hm(t) { return (t || '').slice(0, 5); }
  function slot(l) { return l.time_slot_details || {}; }
  function plan(l) { return l.study_plan_details || {}; }
  function startOf(l) { var s = slot(l); var d = parseDate(s.date); var t = (s.start_time || '00:00').split(':'); d.setHours(+t[0], +t[1], 0, 0); return d; }
  function endOf(l) { var s = slot(l); var d = parseDate(s.date); var t = (s.end_time || '00:00').split(':'); d.setHours(+t[0], +t[1], 0, 0); return d; }
  function byTime(a, b) { return startOf(a) - startOf(b) || (slot(a).period_number || 0) - (slot(b).period_number || 0); }
  function dateLong(d) { return d.getDate() + ' ' + MONTHS[d.getMonth()]; }

  /* ---------- data ---------- */
  function list(data) { return (data && data.results) || data || []; }
  function streamNamesOf(groupId) {
    return streams.filter(function (s) {
      var ids = (s.groups || []).concat((s.groups_details || []).map(function (g) { return g.id; }));
      return ids.some(function (id) { return String(id) === String(groupId); });
    }).map(function (s) { return s.name; });
  }
  // streamExtra: params only for the unfiltered stream request (e.g. a date_to bound)
  function lessonsQuery(extra, streamExtra) {
    var p = new URLSearchParams(), base = new URLSearchParams();
    Object.keys(extra).forEach(function (k) { base.append(k, extra[k]); });
    if (cur.type === 'g') p.append('group_id', cur.id); else p.append('teacher_name', cur.name);
    base.forEach(function (v, k) { p.append(k, v); });
    Object.keys(streamExtra || {}).forEach(function (k) { base.append(k, streamExtra[k]); });
    var reqs = [apiRequest('/lessons/?' + p.toString()).then(list)];
    // group_id matches only the plan's own group and the backend has no stream filter: stream lessons are filtered here
    var names = cur.type === 'g' ? streamNamesOf(cur.id) : [];
    if (names.length) reqs.push(apiRequest('/lessons/?' + base.toString()).then(function (d) {
      return list(d).filter(function (l) { return plan(l).stream && names.indexOf(plan(l).stream) !== -1; });
    }));
    return Promise.all(reqs).then(function (r) {
      var seen = {}, ls = [];
      r.forEach(function (part) { part.forEach(function (l) { if (!seen[l.id]) { seen[l.id] = true; ls.push(l); } }); });
      // teacher_name is icontains on the backend: keep exact matches only
      if (cur.type === 't') ls = ls.filter(function (l) { return plan(l).teacher === cur.name; });
      return ls.sort(byTime);
    });
  }

  function typeBadge(name) {
    var n = (name || '').toLowerCase(), c = '';
    if (n.indexOf('лек') === 0) c = 'badge-lec';
    else if (n.indexOf('прак') === 0 || n.indexOf('сем') === 0) c = 'badge-pr';
    else if (n.indexOf('лаб') === 0) c = 'badge-lab';
    else if (n.indexOf('екз') === 0 || n.indexOf('зал') === 0) c = 'badge-exam';
    return name ? '<span class="badge ' + c + '">' + esc(name) + '</span>' : '';
  }
  function who(l) {
    var p = plan(l);
    return cur.type === 'g' ? (p.teacher || '') : (p.group || p.stream || '');
  }
  function room(l) { var r = l.room_details; return r && r.title ? 'ауд. ' + r.title : ''; }
  function metaLine(l) { return [who(l), room(l)].filter(Boolean).map(esc).join(' · '); }

  /* ---------- search ---------- */
  var q = $('q'), sug = $('suggest'), courseSel = $('course');
  var items = [], active = -1;

  function findItems() {
    var s = q.value.trim().toLowerCase(), course = courseSel.value;
    if (!s && !course) return null;
    var gs = groups.filter(function (g) {
      return (!s || (g.name || '').toLowerCase().indexOf(s) !== -1) && (!course || String(g.current_course) === course);
    }).slice(0, 8).map(function (g) { return { type: 'g', id: g.id, name: g.name, label: 'Група' + (g.current_course ? ' · ' + g.current_course + ' курс' : '') }; });
    var ts = (s && !course) ? teachers.filter(function (t) { return (t.name || '').toLowerCase().indexOf(s) !== -1; })
      .slice(0, 8).map(function (t) { return { type: 't', id: t.id, name: t.name, label: 'Викладач' }; }) : [];
    return gs.concat(ts);
  }
  function renderSuggest() {
    items = findItems();
    if (!items) { closeSuggest(); return; }
    active = items.length ? 0 : -1;
    sug.innerHTML = items.length ? items.map(function (it, i) {
      return '<div class="combo-item' + (i === active ? ' is-active' : '') + '" role="option" id="sug' + i + '" data-i="' + i + '"><b>' +
        esc(it.name) + '</b><small>' + esc(it.label) + '</small></div>';
    }).join('') : '<div class="combo-empty">Нічого не знайдено</div>';
    sug.classList.add('is-open');
    q.setAttribute('aria-expanded', 'true');
  }
  function closeSuggest() { sug.classList.remove('is-open'); q.setAttribute('aria-expanded', 'false'); active = -1; }
  function setActive(i) {
    if (!items || !items.length) return;
    active = (i + items.length) % items.length;
    Array.prototype.forEach.call(sug.querySelectorAll('.combo-item'), function (el, k) { el.classList.toggle('is-active', k === active); });
    var el = $('sug' + active); if (el) { el.scrollIntoView({ block: 'nearest' }); q.setAttribute('aria-activedescendant', el.id); }
  }
  function pick(it) { closeSuggest(); q.blur(); openSel(it.type, it.id, 'push'); }

  q.addEventListener('input', renderSuggest);
  q.addEventListener('focus', function () { if (q.value.trim() && (!cur || q.value !== cur.name)) renderSuggest(); });
  courseSel.addEventListener('change', function () { renderSuggest(); q.focus(); });
  q.addEventListener('keydown', function (e) {
    var open = sug.classList.contains('is-open');
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) renderSuggest(); else setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') { if (open && items && items[active]) { e.preventDefault(); pick(items[active]); } }
    else if (e.key === 'Escape') closeSuggest();
  });
  sug.addEventListener('mousedown', function (e) {
    var el = e.target.closest('.combo-item'); if (!el) return;
    e.preventDefault(); pick(items[+el.dataset.i]);
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.pub-find')) closeSuggest(); });

  /* ---------- my schedule ---------- */
  function readMine() {
    try { var v = JSON.parse(localStorage.getItem(MY_KEY) || 'null'); return v && (v.type === 'g' || v.type === 't') && v.id ? v : null; } catch (e) { return null; }
  }
  function isMine() { var m = readMine(); return !!(m && cur && m.type === cur.type && String(m.id) === String(cur.id)); }
  function renderMine() { var on = isMine(); $('mineSwitch').classList.toggle('is-on', on); $('mineSwitch').setAttribute('aria-checked', on ? 'true' : 'false'); }
  $('mineSwitch').addEventListener('click', function () {
    var on = !isMine();
    try {
      if (on) localStorage.setItem(MY_KEY, JSON.stringify({ type: cur.type, id: cur.id, name: cur.name }));
      else localStorage.removeItem(MY_KEY);
    } catch (e) { UI.toast('Браузер не дозволяє зберегти', { type: 'err' }); return; }
    renderMine();
    UI.toast(on ? 'Відкриватиметься за замовчуванням: ' + cur.name : 'Мій розклад скинуто', { type: on ? 'ok' : undefined });
  });

  /* ---------- open a schedule ---------- */
  function urlFor(type, id) { return '/?' + type + '=' + encodeURIComponent(id); }

  function openSel(type, id, history) {
    var src = type === 'g' ? groups : teachers;
    var obj = src.filter(function (x) { return String(x.id) === String(id); })[0];
    if (!obj) { showIntro(type === 'g' ? 'Групу не знайдено' : 'Викладача не знайдено', true); return; }
    cur = { type: type, id: obj.id, name: obj.name, obj: obj };
    if (history === 'push') window.history.pushState({}, '', urlFor(type, obj.id));
    else if (history === 'replace') window.history.replaceState({}, '', urlFor(type, obj.id));
    q.value = obj.name;
    document.title = obj.name + ' · Розклад занять';
    $('intro').hidden = true; $('schedule').hidden = false; $('shareBtn').hidden = false;
    $('title').textContent = obj.name;
    var sub = [];
    if (type === 'g') { sub.push('Група'); if (obj.current_course) sub.push(obj.current_course + ' курс'); if (obj.amount) sub.push(obj.amount + ' студ.'); }
    else { sub.push('Викладач'); var subj = (obj.subjects_details || []).map(function (s) { return s.name; }).filter(Boolean); if (subj.length) sub.push(subj.join(', ')); }
    $('subtitle').textContent = sub.join(' · ');
    renderMine();
    var now = new Date();
    weekStart = mondayOf(now); dayIdx = dayIndex(now);
    loadWeek(); loadUpcoming();
  }

  function showIntro(text, isErr) {
    cur = null;
    $('schedule').hidden = true; $('shareBtn').hidden = true; $('intro').hidden = false;
    document.title = 'Розклад занять';
    UI.state($('intro'), isErr ? 'error' : 'empty', { text: text });
    if (!isErr) {
      var mine = readMine();
      if (mine) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'btn btn-sm'; b.textContent = 'Мій розклад: ' + mine.name;
        b.addEventListener('click', function () { openSel(mine.type, mine.id, 'push'); });
        $('intro').querySelector('.empty').appendChild(b);
      }
    }
  }

  function fromUrl(history) {
    var p = new URLSearchParams(location.search);
    if (p.get('g')) return openSel('g', p.get('g'), history), true;
    if (p.get('t')) return openSel('t', p.get('t'), history), true;
    return false;
  }

  window.addEventListener('popstate', function () {
    if (!groups.length && !teachers.length) return;
    if (!fromUrl(null)) { q.value = ''; showIntro('Знайдіть свою групу або викладача'); }
  });

  /* ---------- week ---------- */
  function loadWeek() {
    var my = ++weekReq;
    weekState = 'loading';
    renderStrip();
    UI.state($('lessons'), 'loading');
    lessonsQuery({ date_from: iso(weekStart), date_to: iso(addDays(weekStart, 6)) }).then(function (ls) {
      if (my !== weekReq) return;
      weekLessons = ls; weekState = 'ok';
      renderStrip(); renderLessons();
    }).catch(function (err) {
      if (my !== weekReq) return;
      weekLessons = []; weekState = 'error'; renderStrip();
      UI.state($('lessons'), 'error', { text: (err && err.message) || 'Не вдалося завантажити розклад', actionLabel: 'Спробувати ще', onAction: loadWeek });
    });
  }
  function loadUpcoming() {
    var my = ++upReq;
    upcoming = [];
    renderNowNext();
    // only the unfiltered stream request is bounded (14 days); the group/teacher one stays open-ended
    var today = new Date();
    lessonsQuery({ date_from: iso(today) }, { date_to: iso(addDays(today, 14)) }).then(function (ls) {
      if (my !== upReq) return;
      var now = new Date();
      upcoming = ls.filter(function (l) { return endOf(l) > now; });
      renderNowNext();
      if (weekState === 'ok') renderLessons();
    }).catch(function () { /* now/next stay hidden; the list shows its own error */ });
  }

  function lessonsOn(i) { var d = iso(addDays(weekStart, i)); return weekLessons.filter(function (l) { return slot(l).date === d; }); }

  function renderStrip() {
    var today = iso(new Date());
    var end = addDays(weekStart, 6);
    $('jumpDate').value = iso(addDays(weekStart, dayIdx));
    $('weekLabel').textContent = weekStart.getMonth() === end.getMonth()
      ? weekStart.getDate() + '–' + dateLong(end)
      : dateLong(weekStart) + ' – ' + dateLong(end);
    $('days').innerHTML = DW.map(function (w, i) {
      var d = addDays(weekStart, i), n = weekState === 'ok' ? lessonsOn(i).length : 0;
      var cls = 'day' + (i === dayIdx && view === 'day' ? ' is-active' : '') + (iso(d) === today ? ' is-today' : '');
      return '<button type="button" class="' + cls + '" data-d="' + i + '" aria-pressed="' + (i === dayIdx && view === 'day') + '" aria-label="' +
        esc(DW_FULL[i] + ', ' + dateLong(d) + (n ? ', пар: ' + n : '')) + '"><span class="dw">' + w + '</span><span class="dn">' + d.getDate() +
        '</span><span class="dc">' + (n ? n + ' пар' + (n === 1 ? 'а' : n < 5 ? 'и' : '') : '') + '</span></button>';
    }).join('');
  }

  function lessonRow(l, todayIso, now) {
    var s = slot(l), p = plan(l), cls = 'lesson';
    if (s.date === todayIso) { if (endOf(l) <= now) cls += ' is-past'; else if (startOf(l) <= now) cls += ' is-now'; }
    return '<div class="' + cls + '"><div class="l-time"><b>' + esc(hm(s.start_time)) + '</b><span>' + esc(hm(s.end_time)) + '</span></div>' +
      '<div class="l-body"><div class="l-title">' + esc(p.subject || '') + '</div><div class="l-meta">' +
      (s.period_number ? esc(s.period_number + ' пара') + (metaLine(l) ? ' · ' : '') : '') + metaLine(l) + '</div></div>' + typeBadge(p.class_type) + '</div>';
  }
  function dayRows(ls) {
    var todayIso = iso(new Date()), now = new Date(), out = '';
    ls.forEach(function (l, k) {
      var prev = ls[k - 1];
      if (prev && (slot(l).period_number || 0) - (slot(prev).period_number || 0) > 1 && startOf(l) > endOf(prev)) {
        out += '<div class="lesson is-gap' + (slot(l).date === todayIso && startOf(l) <= now ? ' is-past' : '') + '"><div class="l-time">' +
          esc(hm(slot(prev).end_time)) + '</div><div>Вікно до ' + esc(hm(slot(l).start_time)) + '</div></div>';
      }
      out += lessonRow(l, todayIso, now);
    });
    return out;
  }
  function headFor(i) { return '<div class="lessons-head">' + DW_FULL[i] + ', ' + dateLong(addDays(weekStart, i)) + '</div>'; }

  function renderLessons() {
    var box = $('lessons');
    if (view === 'day') {
      var ls = lessonsOn(dayIdx);
      if (ls.length) { box.innerHTML = headFor(dayIdx) + dayRows(ls); return; }
      emptyState(box, weekLessons.length ? 'Цього дня пар немає' : 'Цього тижня пар немає');
      return;
    }
    var html = '';
    for (var i = 0; i < 7; i++) { var dl = lessonsOn(i); if (dl.length) html += headFor(i) + dayRows(dl); }
    if (html) box.innerHTML = html; else emptyState(box, 'Цього тижня пар немає');
  }
  function emptyState(box, text) {
    var target = null;
    if (!weekLessons.length && upcoming.length) {
      var d = parseDate(slot(upcoming[0]).date);
      if (mondayOf(d) > weekStart) target = d;
    }
    UI.state(box, 'empty', target ? { text: text, actionLabel: 'Найближчі пари: ' + dateLong(target), onAction: function () { goToDate(target); } } : { text: text });
  }

  function goToDate(d) { weekStart = mondayOf(d); dayIdx = dayIndex(d); loadWeek(); }

  $('days').addEventListener('click', function (e) {
    var b = e.target.closest('.day'); if (!b) return;
    dayIdx = +b.dataset.d;
    if (view !== 'day') setView('day');
    renderStrip(); if (weekState === 'ok') renderLessons();
  });
  $('prevWeek').addEventListener('click', function () { weekStart = addDays(weekStart, -7); loadWeek(); });
  $('nextWeek').addEventListener('click', function () { weekStart = addDays(weekStart, 7); loadWeek(); });
  $('todayBtn').addEventListener('click', function () { goToDate(new Date()); });
  $('jumpDate').addEventListener('change', function () { if (this.value) goToDate(parseDate(this.value)); });
  function setView(v) {
    view = v;
    Array.prototype.forEach.call($('viewSeg').querySelectorAll('button'), function (b) {
      var on = b.dataset.view === v; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  $('viewSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || b.dataset.view === view) return;
    setView(b.dataset.view); renderStrip(); if (weekState === 'ok') renderLessons();
  });

  /* ---------- now / next ---------- */
  function renderNowNext() {
    var now = new Date(), nowL = null, nextL = null;
    for (var i = 0; i < upcoming.length; i++) {
      var l = upcoming[i];
      if (startOf(l) <= now && endOf(l) > now) { if (!nowL) nowL = l; }
      else if (startOf(l) > now) { nextL = l; break; }
    }
    var nc = $('nowCard'), xc = $('nextCard');
    nc.hidden = !nowL; xc.hidden = !nextL;
    if (nowL) {
      var s = slot(nowL), total = endOf(nowL) - startOf(nowL), left = Math.max(0, Math.ceil((endOf(nowL) - now) / 60000));
      var pct = total > 0 ? Math.min(100, Math.round((now - startOf(nowL)) / total * 100)) : 0;
      var meta = [ic('clock', 14) + esc(hm(s.start_time) + ' – ' + hm(s.end_time))];
      if (room(nowL)) meta.push(ic('pin', 14) + esc(room(nowL)));
      if (who(nowL)) meta.push(ic(cur.type === 'g' ? 'user' : 'users', 14) + esc(who(nowL)));
      nc.innerHTML = '<div class="now-top"><span class="now-label"><i class="live"></i>Зараз' + (s.period_number ? ' · ' + esc(s.period_number) + ' пара' : '') +
        '</span><span class="now-left">ще ' + left + ' хв</span></div><div class="now-title">' + esc(plan(nowL).subject || '') + '</div>' +
        '<div class="now-meta"><span>' + meta.join('</span><span>') + '</span></div>' +
        '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Минуло пари"><i style="width:' + pct + '%"></i></div>';
    }
    if (nextL) {
      var ns = slot(nextL), d = parseDate(ns.date), when = hm(ns.start_time);
      if (ns.date !== iso(now)) when = (ns.date === iso(addDays(now, 1)) ? 'завтра' : DW[dayIndex(d)].toLowerCase() + ', ' + dateLong(d)) + ' · ' + when;
      xc.innerHTML = '<span class="next-label">Далі · ' + esc(when) + '</span><span class="next-title">' + esc(plan(nextL).subject || '') + '</span>' +
        typeBadge(plan(nextL).class_type) + (metaLine(nextL) ? '<span class="muted sm">' + metaLine(nextL) + '</span>' : '');
    }
  }
  setInterval(function () {
    if (!cur) return;
    renderNowNext();
    if (weekState === 'ok' && iso(mondayOf(new Date())) === iso(weekStart)) renderLessons();
  }, 30000);

  /* ---------- share ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove(); ok ? resolve() : reject(new Error('copy'));
    });
  }
  $('shareBtn').addEventListener('click', function () {
    var url = location.origin + urlFor(cur.type, cur.id);
    copyText(url).then(function () { UI.toast('Посилання скопійовано', { type: 'ok' }); })
      .catch(function () { UI.toast('Скопіюйте посилання: ' + url); });
  });

  /* ---------- ICS ---------- */
  function icsEsc(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  // RFC 5545: fold lines longer than 75 octets (UTF-8) with CRLF + space
  function icsFold(line) {
    var parts = [], buf = '', n = 0;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i], code = line.charCodeAt(i);
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < line.length) ch += line[++i];
      var b = code < 0x80 ? 1 : code < 0x800 ? 2 : ch.length === 2 ? 4 : 3;
      if (n + b > (parts.length ? 74 : 75)) { parts.push(buf); buf = ''; n = 0; }
      buf += ch; n += b;
    }
    parts.push(buf);
    return parts.join('\r\n ');
  }
  function icsDt(d) { return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00'; }
  function buildIcs(ls) {
    var stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rozklad//Public schedule//UK', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEsc('Розклад ' + cur.name)];
    ls.forEach(function (l) {
      var p = plan(l);
      out.push('BEGIN:VEVENT', 'UID:lesson-' + l.id + '@rozklad', 'DTSTAMP:' + stamp, 'DTSTART:' + icsDt(startOf(l)), 'DTEND:' + icsDt(endOf(l)),
        'SUMMARY:' + icsEsc((p.subject || 'Заняття') + (p.class_type ? ' (' + p.class_type + ')' : '')));
      if (room(l)) out.push('LOCATION:' + icsEsc(room(l) + (l.room_details.building ? ', ' + l.room_details.building : '')));
      out.push('DESCRIPTION:' + icsEsc([p.teacher, p.group || p.stream].filter(Boolean).join(' · ')), 'END:VEVENT');
    });
    out.push('END:VCALENDAR');
    return out.map(icsFold).join('\r\n') + '\r\n';
  }
  $('icsBtn').addEventListener('click', function () {
    if (weekState !== 'ok' || !weekLessons.length) { UI.toast('На цьому тижні немає пар для календаря', { type: 'warn' }); return; }
    var blob = new Blob([buildIcs(weekLessons)], { type: 'text/calendar;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rozklad-' + cur.type + cur.id + '-' + iso(weekStart) + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    UI.toast('Файл календаря для тижня завантажено', { type: 'ok' });
  });

  /* ---------- static bits + init ---------- */
  function themeIcon() { $('themeBtn').innerHTML = ic(window.Theme && Theme.get() === 'dark' ? 'sun' : 'moon', 16); }
  $('themeBtn').addEventListener('click', function () { Theme.toggle(); themeIcon(); });
  themeIcon();
  $('searchIco').outerHTML = ic('search', 18);
  $('shareBtn').innerHTML = ic('link', 15) + 'Поділитися';
  $('prevWeek').innerHTML = ic('chevron-left', 16);
  $('nextWeek').innerHTML = ic('chevron-right', 16);
  $('icsBtn').innerHTML = ic('calendar', 16) + 'Додати тиждень у календар (.ics)';

  UI.state($('intro'), 'loading');
  Promise.all([apiRequest('/groups/'), apiRequest('/teachers/'),
    apiRequest('/streams/').catch(function () { return []; })]).then(function (r) {
    groups = list(r[0]); teachers = list(r[1]); streams = list(r[2]);
    if (fromUrl('replace')) return;
    var mine = readMine();
    if (mine) openSel(mine.type, mine.id, 'replace');
    else showIntro('Знайдіть свою групу або викладача');
  }).catch(function (err) {
    UI.state($('intro'), 'error', { text: (err && err.message) || 'Не вдалося завантажити дані', actionLabel: 'Оновити', onAction: function () { location.reload(); } });
  });
})();
