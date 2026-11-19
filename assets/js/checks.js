/* Preflight checks for a semester, computed client-side from list endpoints (plan 0001 §6).
   Classic script: window.Checks. Needs api.js (apiRequest). Results cached per semester. */
(function () {
  'use strict';

  var cache = {};

  function get(path) { return apiRequest(path); }

  // Raw data used by the checks; also reused by pages (plans per group, counts).
  function data(semesterId) {
    if (semesterId && typeof semesterId === 'object' && semesterId.id != null) semesterId = semesterId.id;
    var key = String(semesterId);
    if (!cache[key]) {
      var p = Promise.all([
        get('/semesters/' + encodeURIComponent(key) + '/'),
        get('/semesters/' + encodeURIComponent(key) + '/slots/'),
        get('/study_plans/?semester=' + encodeURIComponent(key)),
        get('/groups/'), get('/streams/'), get('/subjects/'), get('/teachers/'), get('/rooms/')
      ]).then(function (r) {
        return { semester: r[0], slots: r[1], plans: r[2], groups: r[3], streams: r[4],
          subjects: r[5], teachers: r[6], rooms: r[7] };
      });
      p.catch(function () { if (cache[key] === p) delete cache[key]; });
      cache[key] = p;
    }
    return cache[key];
  }

  // groupId -> number of plans in the semester (own plans + plans of its streams).
  function plansPerGroup(d) {
    var streamGroups = {};
    d.streams.forEach(function (s) {
      streamGroups[s.id] = Array.isArray(s.groups) ? s.groups : (s.groups_details || []).map(function (g) { return g.id; });
    });
    var n = {};
    d.groups.forEach(function (g) { n[g.id] = 0; });
    d.plans.forEach(function (p) {
      if (p.group != null) n[p.group] = (n[p.group] || 0) + 1;
      else if (p.stream != null) (streamGroups[p.stream] || []).forEach(function (gid) { n[gid] = (n[gid] || 0) + 1; });
    });
    return n;
  }

  function audienceSize(p, d) {
    if (p.group != null) {
      var g = d.groups.find(function (x) { return x.id === p.group; });
      return g ? (g.amount || 0) : 0;
    }
    var s = d.streams.find(function (x) { return x.id === p.stream; });
    return s ? (s.total_students || 0) : 0;
  }

  // The API returns teacher subjects / room type only as *_details objects.
  function subjectIds(t) {
    if (Array.isArray(t.subjects)) return t.subjects;
    return (t.subjects_details || []).map(function (s) { return s.id; });
  }
  function roomTypeId(r) {
    return r.room_type != null ? r.room_type : (r.room_type_details ? r.room_type_details.id : null);
  }

  function planLabel(p) {
    return (p.subject_name || 'Предмет') + ' · ' + (p.group_name || p.stream_name || '—') +
      (p.class_type_name ? ' (' + p.class_type_name + ')' : '');
  }

  function evaluate(semesterId, d) {
    var sid = encodeURIComponent(String(semesterId));
    var out = [];
    function add(c) { c.count = c.items ? c.items.length || c.count || 0 : c.count || 0; out.push(c); }

    add({ id: 'timeslots', severity: d.slots.length ? 'ok' : 'block',
      title: d.slots.length ? 'Часові слоти: ' + d.slots.length : 'У семестрі немає часових слотів',
      count: d.slots.length ? 0 : 1, items: [],
      action: { label: 'Календар', href: '/admin/semesters/?id=' + sid + '&view=calendar' } });

    add({ id: 'rooms', severity: d.rooms.length ? 'ok' : 'block',
      title: d.rooms.length ? 'Аудиторії: ' + d.rooms.length : 'Немає жодної аудиторії',
      count: d.rooms.length ? 0 : 1, items: [],
      action: { label: 'Аудиторії', href: '/admin/rooms/' } });

    add({ id: 'plans', severity: d.plans.length ? 'ok' : 'block',
      title: d.plans.length ? 'Навчальних планів у семестрі: ' + d.plans.length : 'У семестрі немає навчальних планів',
      count: d.plans.length ? 0 : 1, items: [],
      action: { label: 'Заповнити', href: '/admin/study-plans/?semester=' + sid } });

    {
      var per = plansPerGroup(d);
      var noPlan = d.groups.filter(function (g) { return !per[g.id]; });
      add({ id: 'groups-without-plan', severity: noPlan.length ? 'warn' : 'ok',
        title: noPlan.length ? 'Груп без навчального плану: ' + noPlan.length : 'Усі групи мають навчальний план',
        items: noPlan.map(function (g) { return { id: g.id, label: g.name }; }),
        action: { label: 'Заповнити', href: '/admin/groups/?filter=no-plan&semester=' + sid } });
    }

    {
      var noRoom = d.plans.filter(function (p) {
        var need = audienceSize(p, d);
        return !d.rooms.some(function (r) {
          return (p.required_room_type == null || roomTypeId(r) === p.required_room_type) && (r.capacity || 0) >= need;
        });
      });
      add({ id: 'plans-without-room', severity: noRoom.length ? 'warn' : 'ok',
        title: noRoom.length ? 'Планів без відповідної аудиторії (тип або місткість): ' + noRoom.length
          : 'Для кожного плану є аудиторія потрібного типу й місткості',
        items: noRoom.map(function (p) { return { id: p.id, label: planLabel(p) }; }),
        action: { label: 'Аудиторії', href: '/admin/rooms/' } });

      var tById = {};
      d.teachers.forEach(function (t) { tById[t.id] = t; });
      var mismatch = d.plans.filter(function (p) {
        var t = tById[p.teacher];
        return t && subjectIds(t).indexOf(p.subject) === -1;
      });
      add({ id: 'teacher-not-on-subject', severity: mismatch.length ? 'warn' : 'ok',
        title: mismatch.length ? 'Викладач у плані не веде цей предмет: ' + mismatch.length : 'Викладачі в планах ведуть свої предмети',
        items: mismatch.map(function (p) { return { id: p.id, label: planLabel(p) + ' — ' + (p.teacher_name || '') }; }),
        action: { label: 'Плани', href: '/admin/study-plans/?semester=' + sid } });
    }

    var taught = {};
    d.teachers.forEach(function (t) { subjectIds(t).forEach(function (s) { taught[s] = 1; }); });
    var subjNoTeacher = d.subjects.filter(function (s) { return !taught[s.id]; });
    add({ id: 'subjects-without-teacher', severity: subjNoTeacher.length ? 'tip' : 'ok',
      title: subjNoTeacher.length ? 'Предметів без викладача: ' + subjNoTeacher.length : 'Кожен предмет має викладача',
      items: subjNoTeacher.map(function (s) { return { id: s.id, label: s.name }; }),
      action: { label: 'Показати', href: '/admin/subjects/?filter=no-teacher' } });

    var teachNoSubj = d.teachers.filter(function (t) { return !subjectIds(t).length; });
    add({ id: 'teachers-without-subjects', severity: teachNoSubj.length ? 'tip' : 'ok',
      title: teachNoSubj.length ? 'Викладачів без предметів: ' + teachNoSubj.length : 'Кожен викладач веде предмети',
      items: teachNoSubj.map(function (t) { return { id: t.id, label: t.name }; }),
      action: { label: 'Показати', href: '/admin/teachers/?filter=no-subjects' } });

    return out;
  }

  var ORDER = { block: 0, warn: 1, tip: 2, ok: 3 };

  // opts.includeOk: also return passed checks (severity 'ok'); opts.force: refetch.
  function run(semesterId, opts) {
    opts = opts || {};
    if (opts.force) invalidate(semesterId);
    return data(semesterId).then(function (d) {
      return evaluate(semesterId, d)
        .filter(function (c) { return opts.includeOk || c.severity !== 'ok'; })
        .sort(function (a, b) { return ORDER[a.severity] - ORDER[b.severity]; });
    });
  }

  function invalidate(semesterId) {
    if (semesterId == null) cache = {}; else delete cache[String(semesterId)];
  }

  function summary(list) {
    var s = { block: 0, warn: 0, tip: 0, ok: 0 };
    (list || []).forEach(function (c) { s[c.severity] = (s[c.severity] || 0) + 1; });
    return s;
  }

  function isBlocked(list) { return (list || []).some(function (c) { return c.severity === 'block'; }); }

  window.Checks = { run: run, data: data, plansPerGroup: plansPerGroup, invalidate: invalidate,
    summary: summary, isBlocked: isBlocked,
    subjectIds: subjectIds, roomTypeId: roomTypeId };
})();
