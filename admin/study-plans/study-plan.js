/* «Навчальні плани»: list of groups/streams + the selected one's plan for a semester (master-detail.js). */
(function () {
  'use strict';

  var esc = UI.escapeHtml;
  function ic(name, size) { return Icons.svg(name, { size: size || 16 }); }
  function errText(err, fb) { return MasterDetail.errorText(err, fb); }
  function list(d) { return (d && d.results) || d || []; }

  // /class_types/ may be missing on older backends (migration 0020): same fallback as before.
  var CLASS_TYPES_FALLBACK = [
    { id: 1, name: 'Лекція' }, { id: 2, name: 'Практика' }, { id: 3, name: 'Лабораторна' },
    { id: 4, name: 'Семінар' }, { id: 5, name: 'Екзамен' }
  ];

  var ref = null; // {semesters, subjects, groups, streams, roomTypes, classTypes, classTypesFallback}
  var semId = null;
  var plans = [];         // entries of the selected semester
  var fresh = {};         // ids of entries created by «Скопіювати план» (highlighted)
  var teacherCache = {};  // subject id -> Promise<[teacher]>
  var draftSeq = 0;
  var md;

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    return n + ' ' + (m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many);
  }
  function byName(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'uk', { numeric: true }); }
  function find(arr, id) { return arr.find(function (x) { return String(x.id) === String(id); }); }
  function keyOf(p) { return p.group ? 'g' + p.group : p.stream ? 's' + p.stream : null; }
  function plansOf(item) { return plans.filter(function (p) { return keyOf(p) === item.key; }); }
  function options(arr, sel, empty) {
    return (empty != null ? '<option value="">' + esc(empty) + '</option>' : '') + arr.map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (String(x.id) === String(sel) ? ' selected' : '') + '>' + esc(x.name) + '</option>';
    }).join('');
  }

  /* ---------- URL: ?semester=N&item=g12|s3 (incoming ?group=N / ?stream=N translated) ---------- */
  (function translateUrl() {
    var u = new URL(window.location.href), p = u.searchParams;
    var g = p.get('group'), s = p.get('stream');
    if (!g && !s) return;
    if (!p.get('item')) p.set('item', g ? 'g' + g : 's' + s);
    p.delete('group'); p.delete('stream');
    history.replaceState(null, '', u.href);
  })();
  function setSemUrl(id) {
    var u = new URL(window.location.href);
    u.searchParams.set('semester', id);
    history.replaceState(history.state, '', u.href);
  }

  /* ---------- data ---------- */
  function loadRef() {
    if (ref) return Promise.resolve(ref);
    var soft = function (what) { return function () { UI.toast('Не вдалося завантажити: ' + what, { type: 'warn' }); return []; }; };
    var ctFallback = false;
    return Promise.all([
      apiRequest('/semesters/'),
      apiRequest('/groups/'),
      apiRequest('/streams/'),
      apiRequest('/subjects/').catch(soft('предмети')),
      apiRequest('/room_types/').catch(soft('типи аудиторій')),
      apiRequest('/class_types/').catch(function () { ctFallback = true; return []; })
    ]).then(function (r) {
      var ct = list(r[5]);
      if (!ct.length) { ctFallback = true; ct = CLASS_TYPES_FALLBACK.map(function (x) { return { id: x.id, name: x.name }; }); }
      ref = {
        semesters: list(r[0]), groups: list(r[1]).slice().sort(byName), streams: list(r[2]).slice().sort(byName),
        subjects: list(r[3]).slice().sort(byName), roomTypes: list(r[4]), classTypes: ct, classTypesFallback: ctFallback
      };
      var want = new URLSearchParams(window.location.search).get('semester');
      var cur = find(ref.semesters, want) || ref.semesters.find(function (s) { return s.is_current; }) || ref.semesters[0];
      semId = cur ? String(cur.id) : null;
      renderSemSelect();
      return ref;
    });
  }

  // Fallback class-type names: prefer the real names the plans carry (class_type_name).
  function learnClassTypes() {
    if (!ref.classTypesFallback) return;
    plans.forEach(function (p) {
      if (p.class_type == null || !p.class_type_name) return;
      var t = find(ref.classTypes, p.class_type);
      if (t) t.name = p.class_type_name; else ref.classTypes.push({ id: p.class_type, name: p.class_type_name });
    });
  }

  function load() {
    return loadRef().then(function () {
      if (!semId) { plans = []; return []; }
      return apiRequest('/study_plans/?semester=' + encodeURIComponent(semId)).then(function (d) {
        plans = list(d);
        learnClassTypes();
        var items = [];
        ref.groups.forEach(function (g) { items.push({ key: 'g' + g.id, kind: 'group', id: g.id, name: g.name, src: g }); });
        ref.streams.forEach(function (s) { items.push({ key: 's' + s.id, kind: 'stream', id: s.id, name: s.name, src: s }); });
        return items;
      });
    });
  }

  function teachersFor(subjectId) {
    if (!subjectId) return Promise.resolve([]);
    if (!teacherCache[subjectId]) {
      teacherCache[subjectId] = apiRequest('/teachers/?subjects=' + encodeURIComponent(subjectId))
        .then(function (d) { return list(d).slice().sort(byName); }, function (err) { delete teacherCache[subjectId]; throw err; });
    }
    return teacherCache[subjectId];
  }

  /* ---------- top bar: semester ---------- */
  function renderSemSelect() {
    var a = Shell.actionsEl();
    if (!a || !ref.semesters.length) return;
    a.innerHTML = '<label class="sp-sem"><span class="muted sm">Семестр</span>' +
      '<select class="select sm" id="sp-sem" aria-label="Семестр">' + options(ref.semesters, semId) + '</select></label>';
    a.querySelector('#sp-sem').addEventListener('change', function (e) {
      semId = e.target.value; fresh = {};
      setSemUrl(semId);
      md.reload();
    });
  }

  /* ---------- list ---------- */
  function rowMeta(it) {
    if (it.kind === 'group') return it.src.current_course ? it.src.current_course + ' курс' : '';
    var gs = it.src.groups_details || [];
    return gs.length ? gs.map(function (g) { return g.name; }).join(', ') : 'Без груп';
  }
  function renderRow(it) {
    var n = plansOf(it).length;
    var meta = rowMeta(it);
    return '<span class="avatar sm sec">' + ic(it.kind === 'group' ? 'users' : 'streams', 14) + '</span>' +
      '<div class="grow"><div class="name">' + esc(it.name) + '</div>' + (meta ? '<div class="meta">' + esc(meta) + '</div>' : '') + '</div>' +
      '<span class="num' + (n ? '' : ' warn') + '" title="Записів у плані">' + n + '</span>';
  }

  /* ---------- detail ---------- */
  function renderDetail(it) {
    var sem = find(ref.semesters, semId);
    var sub;
    if (it.kind === 'group') {
      sub = [it.src.current_course ? it.src.current_course + ' курс' : '', it.src.amount != null ? plural(it.src.amount, 'студент', 'студенти', 'студентів') : '']
        .filter(Boolean).join(' · ');
    } else {
      sub = 'Потік' + (it.src.total_students != null ? ' · ' + plural(it.src.total_students, 'студент', 'студенти', 'студентів') : '');
    }
    return '' +
      '<div class="detail-head">' +
        '<span class="avatar lg sec">' + ic(it.kind === 'group' ? 'users' : 'streams', 22) + '</span>' +
        '<div class="grow"><h2 class="detail-name">' + esc(it.name) + '</h2>' +
          '<div class="muted">' + esc(sub) + (sub && sem ? ' · ' : '') + (sem ? esc(sem.name) : '') + '</div></div>' +
        '<span class="saved" data-md-saved hidden></span>' +
      '</div>' +
      (it.kind === 'stream' && (it.src.groups_details || []).length
        ? '<div class="chips mt">' + it.src.groups_details.map(function (g) {
            return '<a class="chip link" href="?item=g' + esc(g.id) + (semId ? '&semester=' + esc(semId) : '') + '">' + esc(g.name) + '</a>';
          }).join('') + '</div>'
        : '') +
      '<div class="section">' +
        '<div class="section-title">План на семестр <span class="muted sm" id="sp-total"></span></div>' +
        '<div class="sp-tools">' +
          '<button type="button" class="btn btn-sm" data-add>' + ic('plus', 14) + 'Додати предмет</button>' +
          (it.kind === 'group' ? '<button type="button" class="btn btn-sm btn-ghost" data-copy aria-expanded="false" aria-controls="sp-copy">' + ic('copy', 14) + 'Скопіювати план з іншої групи</button>' : '') +
        '</div>' +
        (it.kind === 'group' ? '<div class="sp-copy" id="sp-copy" hidden></div>' : '') +
        '<div id="sp-plan"></div>' +
      '</div>';
  }

  function mount(el, it, ctx) {
    var st = { it: it, ctx: ctx, drafts: [], scope: 'one' };
    el._sp = st;
    renderPlan(st);
    el.querySelector('[data-add]').addEventListener('click', function () { addDraft(st); });
    var copyBtn = el.querySelector('[data-copy]');
    if (copyBtn) copyBtn.addEventListener('click', function () { toggleCopy(st, copyBtn); });
    var box = el.querySelector('#sp-plan');
    box.addEventListener('change', function (e) {
      var f = e.target.closest('[data-f]');
      if (f) onFieldChange(st, f.closest('tr'), f);
      var sc = e.target.closest('[data-scope]');
      if (sc) st.scope = sc.value;
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches('input[data-f]')) { e.preventDefault(); e.target.blur(); }
    });
    box.addEventListener('click', function (e) {
      var del = e.target.closest('[data-del] [data-confirm]');
      if (del) askDelete(st, del.closest('tr'));
      var dis = e.target.closest('[data-discard]');
      if (dis) discardDraft(st, dis.closest('tr'));
    });
  }

  function entryOf(st, tr) {
    var k = tr && tr.getAttribute('data-k');
    if (!k) return null;
    if (k.charAt(0) === 'd') return st.drafts.find(function (d) { return d._tmp === k; }) || null;
    return find(plans, k) || null;
  }

  function rowHtml(p) {
    var draft = !!p._tmp;
    var subj = p.subject != null ? find(ref.subjects, p.subject) : null;
    var subjects = ref.subjects.slice();
    if (p.subject != null && !subj) subjects.unshift({ id: p.subject, name: p.subject_name || ('Предмет ' + p.subject) });
    var teacherOpt = p.teacher != null
      ? '<option value="' + esc(p.teacher) + '" selected>' + esc(p.teacher_name || ('Викладач ' + p.teacher)) + '</option>' : '';
    var lbl = draft ? 'нового запису' : '«' + (p.subject_name || '') + '»';
    return '<tr data-k="' + esc(draft ? p._tmp : p.id) + '"' + (draft ? ' class="sp-draft"' : fresh[p.id] ? ' class="is-new"' : '') + '>' +
      '<td><select class="select sm" data-f="subject" aria-label="Предмет ' + esc(lbl) + '">' + options(subjects, p.subject, draft ? 'Оберіть предмет' : null) + '</select></td>' +
      '<td><select class="select sm" data-f="class_type" aria-label="Тип заняття ' + esc(lbl) + '">' + options(ref.classTypes, p.class_type, p.class_type == null ? 'Тип' : null) + '</select></td>' +
      '<td><select class="select sm" data-f="teacher" aria-label="Викладач ' + esc(lbl) + '"' + (p.subject == null ? ' disabled' : '') + '>' +
        (p.subject == null ? '<option value="">Спочатку предмет</option>' : (teacherOpt || '<option value="">Оберіть викладача</option>')) + '</select></td>' +
      '<td class="r"><input class="input sm num" type="number" min="1" step="1" data-f="amount" aria-label="Кількість занять ' + esc(lbl) + '" value="' + esc(p.amount != null ? p.amount : '') + '"></td>' +
      '<td class="r"><input class="input sm num" type="number" min="1" step="1" data-f="duration" aria-label="Тривалість у парах ' + esc(lbl) + '" value="' + esc(p.duration != null ? p.duration : 1) + '"></td>' +
      '<td><select class="select sm" data-f="required_room_type" aria-label="Тип аудиторії ' + esc(lbl) + '">' + options(ref.roomTypes, p.required_room_type, 'Будь-яка') + '</select></td>' +
      '<td class="act">' + (draft
        ? '<button type="button" class="icon-btn sm bare" data-discard aria-label="Скасувати новий запис" title="Скасувати">' + ic('x', 14) + '</button>'
        : '<div class="danger sp-del" data-del><button type="button" class="icon-btn sm bare" data-confirm aria-label="Видалити ' + esc(lbl) + '" title="Видалити">' + ic('trash', 14) + '</button></div>') +
      '</td></tr>';
  }

  function renderPlan(st) {
    var box = st.ctx.el.querySelector('#sp-plan');
    if (!box || !st.ctx.alive()) return;
    var rows = plansOf(st.it).sort(function (a, b) {
      return String(a.subject_name || '').localeCompare(String(b.subject_name || ''), 'uk') || (a.class_type - b.class_type) || (a.id - b.id);
    });
    var total = st.ctx.el.querySelector('#sp-total');
    var pairs = rows.reduce(function (s, p) { return s + (Number(p.amount) || 0) * (Number(p.duration) || 0); }, 0);
    if (total) total.textContent = rows.length ? plural(rows.length, 'запис', 'записи', 'записів') + ' · ' + plural(pairs, 'пара', 'пари', 'пар') : '';
    if (!rows.length && !st.drafts.length) {
      UI.state(box, 'empty', { text: 'У цьому семестрі план порожній', actionLabel: 'Додати предмет', onAction: function () { addDraft(st); } });
      return;
    }
    var scopeRow = '';
    if (st.drafts.length && st.it.kind === 'group' && st.it.src.current_course) {
      scopeRow = '<tr class="sp-scope"><td colspan="7"><label>Новий запис для ' +
        '<select class="select sm" data-scope aria-label="Для кого створити запис">' +
          '<option value="one"' + (st.scope === 'one' ? ' selected' : '') + '>групи ' + esc(st.it.name) + '</option>' +
          '<option value="course"' + (st.scope === 'course' ? ' selected' : '') + '>усіх груп ' + esc(st.it.src.current_course) + ' курсу</option>' +
        '</select></label><span class="muted sm">Запис збережеться, щойно заповните предмет, тип, викладача й кількість.</span></td></tr>';
    }
    box.innerHTML = '<div class="tbl-wrap"><table class="tbl sp-tbl">' +
      '<colgroup><col class="c-subj"><col class="c-type"><col class="c-teach"><col class="c-n"><col class="c-n"><col class="c-room"><col class="c-act"></colgroup>' +
      '<thead><tr><th>Предмет</th><th>Тип заняття</th><th>Викладач</th><th class="r">Занять</th><th class="r" title="Тривалість одного заняття в парах">Пар</th><th>Аудиторія</th><th class="act"></th></tr></thead>' +
      '<tbody>' + rows.map(rowHtml).join('') + st.drafts.map(rowHtml).join('') + scopeRow + '</tbody></table></div>';
    // Fill teacher selects with the teachers qualified for each row's subject.
    box.querySelectorAll('tbody tr[data-k]').forEach(function (tr) {
      var p = entryOf(st, tr);
      if (p && p.subject != null) fillTeachers(st, tr, p.subject, p.teacher, p.teacher_name || ('Викладач ' + p.teacher));
    });
  }

  // keepName: an unqualified current teacher stays visible (saved data is shown as is).
  function fillTeachers(st, tr, subjectId, selected, keepName) {
    var sel = tr.querySelector('[data-f="teacher"]');
    return teachersFor(subjectId).then(function (ts) {
      if (!st.ctx.alive() || !tr.isConnected) return false;
      var subjNow = tr.querySelector('[data-f="subject"]').value;
      if (String(subjNow) !== String(subjectId)) return false;
      var keep = ts.some(function (t) { return String(t.id) === String(selected); });
      if (!keep && selected != null && keepName) {
        ts = [{ id: selected, name: keepName }].concat(ts); keep = true;
      }
      sel.innerHTML = (keep ? '' : '<option value="">' + (ts.length ? 'Оберіть викладача' : 'Немає викладачів предмета') + '</option>') +
        options(ts, keep ? selected : null);
      sel.disabled = false;
      return keep;
    }, function () {
      if (st.ctx.alive()) UI.toast('Не вдалося завантажити викладачів предмета', { type: 'err' });
      return false;
    });
  }

  function rowValues(tr) {
    function v(f) { var el = tr.querySelector('[data-f="' + f + '"]'); return el ? el.value : ''; }
    function n(x) { return x === '' ? null : Number(x); }
    return {
      subject: n(v('subject')), class_type: n(v('class_type')), teacher: n(v('teacher')),
      amount: n(v('amount')), duration: n(v('duration')), required_room_type: n(v('required_room_type'))
    };
  }
  function missing(v) {
    var m = [];
    if (v.subject == null) m.push('subject');
    if (v.class_type == null) m.push('class_type');
    if (v.teacher == null) m.push('teacher');
    if (!(v.amount >= 1) || Math.floor(v.amount) !== v.amount) m.push('amount');
    if (!(v.duration >= 1) || Math.floor(v.duration) !== v.duration) m.push('duration');
    return m;
  }
  function markErr(tr, fields) {
    tr.querySelectorAll('[data-f]').forEach(function (el) {
      var bad = fields.indexOf(el.getAttribute('data-f')) >= 0;
      el.classList.toggle('is-err', bad);
      if (bad) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    });
  }

  function onFieldChange(st, tr, el) {
    var p = entryOf(st, tr);
    if (!p) return;
    el.classList.remove('is-err'); el.removeAttribute('aria-invalid');
    if (el.getAttribute('data-f') === 'subject') {
      var sid = el.value === '' ? null : Number(el.value);
      var tsel = tr.querySelector('[data-f="teacher"]');
      var prev = tsel.value;
      tsel.disabled = true;
      if (sid == null) { tsel.innerHTML = '<option value="">Спочатку предмет</option>'; return; }
      fillTeachers(st, tr, sid, prev === '' ? null : prev).then(function (kept) {
        if (!tr.isConnected) return;
        if (!kept && !p._tmp) { markErr(tr, ['teacher']); tr.querySelector('[data-f="teacher"]').focus(); return; }
        commitRow(st, tr);
      });
      return;
    }
    commitRow(st, tr);
  }

  // Saves the row when it is complete: POST for a draft, full PUT for an existing entry.
  function commitRow(st, tr) {
    tr._chain = (tr._chain || Promise.resolve()).then(function () { return saveRow(st, tr); }).catch(function () {});
    return tr._chain;
  }
  function saveRow(st, tr) {
    var p = entryOf(st, tr);
    if (!p || !tr.isConnected) return;
    var v = rowValues(tr);
    var miss = missing(v);
    if (miss.length) { if (!p._tmp) markErr(tr, miss); return; }
    markErr(tr, []);
    var body = Object.assign({
      semester: p.semester != null ? p.semester : Number(semId),
      group: st.it.kind === 'group' ? st.it.id : null,
      stream: st.it.kind === 'stream' ? st.it.id : null,
      constraints: p.constraints || {}
    }, v);
    if (!p._tmp && ['subject', 'class_type', 'teacher', 'amount', 'duration', 'required_room_type'].every(function (k) {
      return String(p[k] == null ? '' : p[k]) === String(v[k] == null ? '' : v[k]);
    })) return;
    var ctx = st.ctx;
    ctx.status('saving');
    if (p._tmp && st.scope === 'course' && st.it.kind === 'group') return saveForCourse(st, tr, p, body);
    var req = p._tmp ? apiRequest('/study_plans/', 'POST', body) : apiRequest('/study_plans/' + p.id + '/', 'PUT', body);
    return req.then(function (saved) {
      if (p._tmp) {
        st.drafts = st.drafts.filter(function (d) { return d !== p; });
        plans.push(saved);
        tr.setAttribute('data-k', saved.id);
        tr.classList.remove('sp-draft');
        var act = tr.querySelector('td.act');
        act.innerHTML = '<div class="danger sp-del" data-del><button type="button" class="icon-btn sm bare" data-confirm aria-label="Видалити «' +
          esc(saved.subject_name || '') + '»" title="Видалити">' + ic('trash', 14) + '</button></div>';
        if (!st.drafts.length) { var sc = tr.parentNode.querySelector('.sp-scope'); if (sc) sc.remove(); }
        md.refresh(st.it);
      } else {
        Object.assign(p, saved);
      }
      updateTotal(st);
      ctx.status('saved');
    }, function (err) {
      ctx.status('error');
      UI.toast(errText(err, 'Не вдалося зберегти'), { type: 'err' });
      var d = err && err.data;
      if (d && typeof d === 'object') markErr(tr, Object.keys(d));
    });
  }

  function saveForCourse(st, tr, p, body) {
    var ctx = st.ctx;
    var payload = Object.assign({}, body, { course_number: st.it.src.current_course });
    delete payload.group; delete payload.stream;
    return apiRequest('/study_plans/', 'POST', payload).then(function (res) {
      st.drafts = st.drafts.filter(function (d) { return d !== p; });
      var n = res && res.created_count != null ? res.created_count : 0;
      var skipped = res && res.skipped_count ? ', пропущено ' + res.skipped_count + ' (вже є)' : '';
      UI.toast('Створено ' + plural(n, 'запис', 'записи', 'записів') + ' для ' + st.it.src.current_course + ' курсу' + skipped, { type: 'ok' });
      return apiRequest('/study_plans/?semester=' + encodeURIComponent(semId)).then(function (d) {
        plans = list(d);
        md.items().forEach(function (x) { md.refresh(x); });
        if (ctx.alive()) { renderPlan(st); ctx.status('saved'); }
      });
    }, function (err) {
      ctx.status('error');
      UI.toast(errText(err, 'Не вдалося створити записи для курсу'), { type: 'err' });
    });
  }

  function updateTotal(st) {
    var total = st.ctx.el.querySelector('#sp-total');
    if (!total) return;
    var rows = plansOf(st.it);
    var pairs = rows.reduce(function (s, p) { return s + (Number(p.amount) || 0) * (Number(p.duration) || 0); }, 0);
    total.textContent = rows.length ? plural(rows.length, 'запис', 'записи', 'записів') + ' · ' + plural(pairs, 'пара', 'пари', 'пар') : '';
  }

  function addDraft(st) {
    var box = st.ctx.el.querySelector('#sp-plan');
    var existing = st.drafts[0] && box.querySelector('tr[data-k="' + st.drafts[0]._tmp + '"]');
    if (!existing) {
      st.drafts.push({ _tmp: 'd' + (++draftSeq), semester: Number(semId), subject: null, class_type: null, teacher: null, amount: null, duration: 1, required_room_type: null });
      renderPlan(st);
    }
    var tr = box.querySelector('tr.sp-draft');
    if (tr) tr.querySelector('[data-f="subject"]').focus();
  }

  function discardDraft(st, tr) {
    var p = entryOf(st, tr);
    st.drafts = st.drafts.filter(function (d) { return d !== p; });
    renderPlan(st);
    var add = st.ctx.el.querySelector('[data-add]');
    if (add) add.focus();
  }

  function askDelete(st, tr) {
    var p = entryOf(st, tr);
    if (!p) return;
    UI.confirmInline(tr.querySelector('[data-del]'), {
      question: 'Видалити?', yes: 'Так', no: 'Ні',
      onYes: function () {
        return apiRequest('/study_plans/' + p.id + '/', 'DELETE').then(function () {
          plans = plans.filter(function (x) { return x !== p; });
          delete fresh[p.id];
          md.refresh(st.it);
          UI.toast('Запис «' + (p.subject_name || '') + '» видалено', { type: 'ok' });
          renderPlan(st);
        }, function (err) {
          UI.toast(errText(err, 'Не вдалося видалити'), { type: 'err' });
        });
      }
    });
  }

  /* ---------- «Скопіювати план з іншої групи» ---------- */
  function toggleCopy(st, btn) {
    var panel = st.ctx.el.querySelector('#sp-copy');
    if (!panel.hidden) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); return; }
    panel.hidden = false; btn.setAttribute('aria-expanded', 'true');
    var sources = ref.groups.filter(function (g) {
      return g.id !== st.it.id && plans.some(function (p) { return p.group === g.id; });
    });
    if (!sources.length) {
      panel.innerHTML = '<div class="sp-copy-body"><span class="muted">В інших груп цього семестру ще немає планів.</span><span class="sp"></span>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-copy-close>Закрити</button></div>';
      panel.querySelector('[data-copy-close]').addEventListener('click', function () { toggleCopy(st, btn); btn.focus(); });
      return;
    }
    panel.innerHTML = '<div class="sp-copy-body">' +
      '<label class="muted sm" for="sp-src">Звідки</label>' +
      '<div class="combo inline"><input class="input sm" id="sp-src" role="combobox" aria-expanded="false" aria-controls="sp-src-list" aria-autocomplete="list" autocomplete="off" placeholder="Оберіть групу…">' +
        '<div class="combo-list" id="sp-src-list" role="listbox" aria-label="Групи з планом"></div></div>' +
      '<span class="sp-copy-preview muted sm" id="sp-copy-preview" aria-live="polite"></span>' +
      '<span class="sp"></span>' +
      '<button type="button" class="btn btn-sm btn-primary" data-copy-go disabled>Скопіювати</button>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-copy-close>Скасувати</button></div>';
    var input = panel.querySelector('#sp-src');
    var listEl = panel.querySelector('#sp-src-list');
    var go = panel.querySelector('[data-copy-go]');
    var preview = panel.querySelector('#sp-copy-preview');
    var chosen = null, todo = [], active = 0, opts = [];
    function count(g) { return plans.filter(function (p) { return p.group === g.id; }).length; }
    function open() {
      var q = input.value.trim().toLowerCase();
      opts = sources.filter(function (g) { return !q || String(g.name).toLowerCase().indexOf(q) >= 0; });
      active = Math.min(active, Math.max(opts.length - 1, 0));
      listEl.innerHTML = opts.length ? opts.map(function (g, i) {
        return '<div class="combo-item' + (i === active ? ' is-active' : '') + '" role="option" id="sp-src-o' + i + '" aria-selected="' + (i === active) + '" data-g="' + esc(g.id) + '">' +
          esc(g.name) + '<small>' + esc(plural(count(g), 'запис', 'записи', 'записів')) + '</small></div>';
      }).join('') : '<div class="combo-empty">Нічого не знайдено</div>';
      listEl.classList.add('is-open');
      input.setAttribute('aria-expanded', 'true');
      if (opts.length) input.setAttribute('aria-activedescendant', 'sp-src-o' + active); else input.removeAttribute('aria-activedescendant');
      var a = listEl.querySelector('.is-active'); if (a) a.scrollIntoView({ block: 'nearest' });
    }
    function close() { listEl.classList.remove('is-open'); input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); }
    function pick(g) {
      chosen = g; input.value = g.name; close();
      var have = {};
      plansOf(st.it).forEach(function (p) { have[p.subject] = true; });
      var src = plans.filter(function (p) { return p.group === g.id; });
      todo = src.filter(function (p) { return !have[p.subject]; });
      var skip = src.length - todo.length;
      preview.textContent = 'Буде скопійовано ' + todo.length + ' з ' + src.length +
        (skip ? '; ' + plural(skip, 'запис пропущено', 'записи пропущено', 'записів пропущено') + ' — ці предмети вже є в плані' : '');
      go.disabled = !todo.length;
      go.textContent = todo.length ? 'Скопіювати ' + todo.length : 'Нічого копіювати';
    }
    input.addEventListener('focus', open);
    input.addEventListener('input', function () { active = 0; chosen = null; go.disabled = true; go.textContent = 'Скопіювати'; preview.textContent = ''; open(); });
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, opts.length - 1); open(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); open(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (opts[active]) pick(opts[active]); }
      else if (e.key === 'Escape') { if (listEl.classList.contains('is-open')) { e.stopPropagation(); close(); } }
    });
    listEl.addEventListener('mousedown', function (e) { e.preventDefault(); });
    listEl.addEventListener('click', function (e) {
      var o = e.target.closest('[data-g]');
      if (o) pick(find(sources, o.getAttribute('data-g')));
    });
    panel.querySelector('[data-copy-close]').addEventListener('click', function () { toggleCopy(st, btn); btn.focus(); });
    go.addEventListener('click', function () {
      if (!chosen || !todo.length) return;
      go.disabled = true; go.classList.add('is-busy');
      runCopy(st, chosen, todo.slice()).then(function () {
        if (!st.ctx.alive()) return;
        panel.hidden = true; btn.setAttribute('aria-expanded', 'false');
      });
    });
    input.focus();
  }

  function runCopy(st, src, todo) {
    var ctx = st.ctx, made = 0, failed = 0, lastErr = null;
    ctx.status('saving');
    var chain = Promise.resolve();
    todo.forEach(function (p) {
      chain = chain.then(function () {
        return apiRequest('/study_plans/', 'POST', {
          semester: p.semester, group: st.it.id, stream: null, subject: p.subject, teacher: p.teacher,
          class_type: p.class_type, required_room_type: p.required_room_type, amount: p.amount, duration: p.duration,
          constraints: p.constraints || {}
        }).then(function (saved) { plans.push(saved); fresh[saved.id] = true; made++; },
          function (err) { failed++; lastErr = err; });
      });
    });
    return chain.then(function () {
      md.refresh(st.it);
      if (made) UI.toast('Скопійовано з ' + src.name + ': ' + plural(made, 'запис', 'записи', 'записів'), { type: 'ok' });
      if (failed) UI.toast('Не скопійовано ' + plural(failed, 'запис', 'записи', 'записів') + ': ' + errText(lastErr, 'помилка'), { type: 'err' });
      if (ctx.alive()) { renderPlan(st); ctx.status(made ? 'saved' : 'error'); }
    });
  }

  /* ---------- controller ---------- */
  md = MasterDetail.create({
    root: '#study-plans',
    title: 'Групи та потоки',
    color: '--c4',
    idParam: 'item',
    getId: function (it) { return it.key; },
    searchPlaceholder: 'Група, потік, предмет або викладач',
    emptyText: 'Груп і потоків поки немає',
    selectText: 'Оберіть групу або потік зі списку',
    countLabel: function (n) { return plural(n, 'група чи потік', 'групи чи потоки', 'груп чи потоків'); },
    load: function () {
      return load().then(function (items) {
        if (!semId) UI.toast('Семестрів ще немає — створіть семестр', { type: 'warn' });
        return items;
      });
    },
    sort: function (a, b) { return (a.kind === b.kind ? 0 : a.kind === 'group' ? -1 : 1) || byName(a, b); },
    groupBy: function (it) { return it.kind === 'group' ? 'Групи' : 'Потоки'; },
    search: function (it, q) {
      if (String(it.name).toLowerCase().indexOf(q) >= 0) return true;
      return plansOf(it).some(function (p) {
        return String(p.subject_name || '').toLowerCase().indexOf(q) >= 0 || String(p.teacher_name || '').toLowerCase().indexOf(q) >= 0;
      });
    },
    filters: [{ id: 'empty', label: 'Без плану', test: function (it) { return !plansOf(it).length; } }],
    renderRow: renderRow,
    renderDetail: renderDetail,
    mount: mount
  });
})();
