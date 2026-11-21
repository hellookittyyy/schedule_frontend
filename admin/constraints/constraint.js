/* «Обмеження»: master–detail (assets/js/master-detail.js). Writes are full PUT (partial PATCH is rejected). */
(function () {
  'use strict';

  var esc = UI.escapeHtml;
  function ic(name, size) { return Icons.svg(name, { size: size || 16 }); }

  var DAY_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'];
  var DAY_CAP = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  var DAY_FULL = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота', 'Неділя'];

  var CATS = [
    { id: 'teacher', label: 'Викладач', hint: 'Один викладач', icon: 'user', c: '--c4', pick: 'викладача', list: '/teachers/' },
    { id: 'group', label: 'Група', hint: 'Одна група', icon: 'users', c: '--c5', pick: 'групу', list: '/groups/' },
    { id: 'room', label: 'Аудиторія', hint: 'Одна аудиторія', icon: 'door', c: '--c1', pick: 'аудиторію', list: '/rooms/' },
    { id: 'stream', label: 'Потік', hint: 'Один потік', icon: 'streams', c: '--c6', pick: 'потік', list: '/streams/' },
    { id: 'global', label: 'Глобальне', hint: 'Зв’язок між навчальними планами', icon: 'layers', c: '--c3' }
  ];
  var TYPES = [
    { id: 'day_off', label: 'Вихідний день', hint: 'Цілі дні без занять', icon: 'ban', c: '--c5' },
    { id: 'time_block', label: 'Матриця часу', hint: 'Заборонені пари по днях', icon: 'grid', c: '--c2' },
    { id: 'max_daily_lessons', label: 'Макс. пар на день', hint: 'Ліміт занять за день', icon: 'sliders', c: '--c1' },
    { id: 'sequential_lessons', label: 'Ланцюжок пар', hint: 'Один план іде після іншого', icon: 'link', c: '--c3', global: true }
  ];

  var semesters = [];
  var semId = null;
  var res = { teacher: [], group: [], room: [], stream: [] };
  var plansCache = {}; // semester id -> Promise<plans[]>
  var plansMap = {};   // plan id -> plan (current semester)
  var gridCache = {};  // semester id -> Promise<{days, periods}>
  var baseLoaded = null;
  var semSelect = null;
  var md;

  var plural = UI.pluralForm;
  function list(r) { return (r && r.results) || r || []; }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function catById(id) { return CATS.find(function (c) { return c.id === id; }) || null; }
  function typeById(id) { return TYPES.find(function (t) { return t.id === id; }) || null; }
  function typesFor(cat) { return TYPES.filter(function (t) { return cat === 'global' ? t.global : !t.global; }); }
  function semName(id) {
    var s = semesters.find(function (x) { return String(x.id) === String(id); });
    return s ? s.name : '';
  }
  function errText(err, fb) { return UI.errorText(err, fb); }

  /* ---------- reading a constraint ---------- */
  function catOf(c) {
    if (c.teacher) return 'teacher';
    if (c.group) return 'group';
    if (c.room) return 'room';
    if (c.stream) return 'stream';
    return 'global';
  }
  function entityLabel(cat, e) {
    if (!e) return '';
    if (cat === 'room') return e.title + (e.building ? ', ' + e.building : '');
    return e.name || '';
  }
  function entityName(cat, id, c) {
    var e = (res[cat] || []).find(function (x) { return String(x.id) === String(id); });
    if (e) return entityLabel(cat, e);
    return (c && c[cat + '_name']) || '#' + id;
  }
  function ranges(nums) {
    nums = nums.map(Number).filter(function (n, i, a) { return a.indexOf(n) === i; }).sort(function (a, b) { return a - b; });
    var out = [], i = 0;
    while (i < nums.length) {
      var j = i;
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
      out.push(j > i ? nums[i] + '–' + nums[j] : String(nums[i]));
      i = j + 1;
    }
    return out.join(', ');
  }
  function planLabel(id, snap) {
    var p = plansMap[id];
    if (!p) return snap || 'план #' + id;
    return (p.subject_name || 'Предмет') + (p.class_type_name ? ' (' + p.class_type_name + ')' : '') +
      ((p.group_name || p.stream_name) ? ', ' + (p.group_name || p.stream_name) : '');
  }
  function planOption(p) {
    return (p.subject_name || 'Предмет') + ' [' + (p.class_type_name || 'Заняття') + '] — ' + (p.teacher_name || 'без викладача') +
      ' (' + (p.group_name || p.stream_name || '') + ')';
  }

  // The part of the sentence after the target name.
  function summary(cat, cfg) {
    var type = cfg && cfg.type;
    if (type === 'day_off') {
      var days = (cfg.days || []).map(Number).sort(function (a, b) { return a - b; });
      return days.length ? 'вихідний у ' + days.map(function (d) { return DAY_SHORT[d - 1] || d; }).join(', ') : 'вихідні дні не обрано';
    }
    if (type === 'time_block') {
      var v = cfg.value || {};
      var parts = Object.keys(v).filter(function (k) { return (v[k] || []).length; })
        .sort(function (a, b) { return a - b; })
        .map(function (k) { return (DAY_SHORT[k - 1] || k) + ', ' + ranges(v[k]) + ' пара'; });
      if (!parts.length) return 'заборонені пари не обрано';
      return (cat === 'teacher' ? 'не працює у ' : 'без занять у ') + parts.join('; ');
    }
    if (type === 'max_daily_lessons') {
      var n = Number(cfg.value);
      return 'не більше ' + n + ' ' + plural(n, 'пари', 'пар', 'пар') + ' на день';
    }
    if (type === 'sequential_lessons') {
      var s = cfg.value || {};
      if (!s.leader_plan_id || !s.follower_plan_id) return 'плани не обрано';
      return planLabel(s.leader_plan_id, s._snapshot_leader) + ' → ' + planLabel(s.follower_plan_id, s._snapshot_follower) +
        ', розрив ' + (s.time_gap != null ? s.time_gap : 1);
    }
    return type ? String(type) : 'тип не обрано';
  }
  function sentence(c) {
    var cat = catOf(c);
    if (!c.configuration || !c.configuration.type) return 'Нове обмеження';
    var s = summary(cat, c.configuration);
    if (cat === 'global') return (c.configuration.type === 'sequential_lessons' ? 'Ланцюжок: ' : 'Усі: ') + s;
    return entityName(cat, c[cat], c) + ' — ' + s;
  }

  /* ---------- semester grid (as on the teachers page) ---------- */
  function semesterGrid(id) {
    if (!gridCache[id]) {
      gridCache[id] = apiRequest('/timeslots/?semester=' + encodeURIComponent(id)).then(function (slots) {
        slots = list(slots);
        var per = {}, sunday = false;
        slots.forEach(function (s) {
          if (Number(s.day_of_week) === 7) sunday = true;
          var n = Number(s.period_number);
          if (!per[n]) per[n] = { n: n, start: String(s.start_time || '').slice(0, 5), end: String(s.end_time || '').slice(0, 5) };
        });
        var periods = Object.keys(per).map(function (k) { return per[k]; }).sort(function (a, b) { return a.n - b.n; });
        if (!periods.length) {
          var sem = semesters.find(function (x) { return String(x.id) === String(id); });
          var ts = (sem && sem.configuration && sem.configuration.time_schedule) || [];
          periods = ts.map(function (p, i) { return { n: i + 1, start: String(p[0] || ''), end: String(p[1] || '') }; });
        }
        return { days: sunday ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5, 6], periods: periods };
      });
      gridCache[id].catch(function () { delete gridCache[id]; });
    }
    return gridCache[id];
  }
  function plansFor(id) {
    if (!plansCache[id]) {
      plansCache[id] = apiRequest('/study_plans/?semester=' + encodeURIComponent(id)).then(list);
      plansCache[id].catch(function () { delete plansCache[id]; });
    }
    return plansCache[id];
  }

  /* ---------- list ---------- */
  function renderRow(c) {
    var t = typeById(c.configuration && c.configuration.type);
    var off = c.is_active === false;
    return '<span class="avatar sm sq sec' + (off ? ' is-off' : '') + '">' + ic(t ? t.icon : 'constraints', 14) + '</span>' +
      '<div class="grow' + (off ? ' cn-off' : '') + '"><div class="name cn-name">' + esc(sentence(c)) + '</div>' +
      '<div class="meta">' + esc((t ? t.label : 'Невідомий тип') + (off ? ' · вимкнене' : '')) + '</div></div>';
  }
  function sortKey(c) { return CATS.findIndex(function (x) { return x.id === catOf(c); }); }

  /* ---------- detail: working state ---------- */
  function defaultCfg(type) {
    if (type === 'day_off') return { type: type, days: [] };
    if (type === 'time_block') return { type: type, value: {} };
    if (type === 'max_daily_lessons') return { type: type, value: 4 };
    if (type === 'sequential_lessons') return { type: type, value: { time_gap: 1 } };
    return null;
  }
  function workOf(item, draft) {
    var cat = draft ? null : catOf(item);
    var cfg = clone(item.configuration) || null;
    return {
      cat: cat,
      entity: cat && cat !== 'global' ? item[cat] : null,
      type: cfg ? cfg.type : null,
      cfg: cfg,
      active: item.is_active !== false,
      semester: item.semester != null ? item.semester : Number(semId)
    };
  }
  function missing(w) {
    if (!w.cat) return 'Оберіть ціль';
    if (w.cat !== 'global' && !w.entity) return 'Оберіть ' + catById(w.cat).pick;
    if (!w.type || !w.cfg) return 'Оберіть тип обмеження';
    if (w.type === 'day_off' && !(w.cfg.days || []).length) return 'Позначте хоча б один день';
    if (w.type === 'time_block' && !Object.keys(w.cfg.value || {}).some(function (k) { return (w.cfg.value[k] || []).length; })) return 'Позначте хоча б одну пару';
    if (w.type === 'max_daily_lessons' && !(Number(w.cfg.value) >= 1)) return 'Вкажіть ліміт пар';
    if (w.type === 'sequential_lessons' && !(w.cfg.value && w.cfg.value.leader_plan_id && w.cfg.value.follower_plan_id)) return 'Оберіть обидва навчальні плани';
    return '';
  }
  function payloadOf(w) {
    return {
      semester: Number(w.semester),
      teacher: w.cat === 'teacher' ? Number(w.entity) : null,
      group: w.cat === 'group' ? Number(w.entity) : null,
      stream: w.cat === 'stream' ? Number(w.entity) : null,
      room: w.cat === 'room' ? Number(w.entity) : null,
      configuration: w.cfg,
      is_active: w.active
    };
  }

  function renderDetail(item, ctx) {
    var w = ctx.w = workOf(item, ctx.isDraft);
    var semOptions = semesters.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (String(s.id) === String(w.semester) ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
    return '' +
      '<div class="detail-head">' +
        '<span class="avatar lg sq sec" id="cn-ava"></span>' +
        '<div class="grow"><h2 class="detail-name" id="cn-title"></h2>' +
        '<div class="muted" id="cn-sub"></div></div>' +
        '<span class="saved" data-md-saved hidden></span>' +
      '</div>' +
      '<p class="cn-hint" id="cn-hint" hidden></p>' +
      '<div class="section"><div class="section-title">Ціль</div>' +
        '<div class="rcards cn-cats" id="cn-cats" role="radiogroup" aria-label="Ціль"></div>' +
        '<div id="cn-entity"></div></div>' +
      '<div class="section" id="cn-types-sec"><div class="section-title">Тип</div>' +
        '<div class="rcards" id="cn-types" role="radiogroup" aria-label="Тип обмеження"></div></div>' +
      '<div class="section" id="cn-editor-sec"><div class="section-title" id="cn-editor-title">Параметри</div>' +
        '<div id="cn-editor"></div></div>' +
      '<div class="section"><div class="fields">' +
        (ctx.isDraft ? '' :
          '<label class="f-label" for="cn-sem">Семестр</label>' +
          '<div class="f-value"><select class="select" id="cn-sem">' + semOptions + '</select></div>') +
        '<span class="f-label" id="cn-active-l">Активне</span>' +
        '<div class="f-value"><button type="button" class="switch" id="cn-active" role="switch" aria-labelledby="cn-active-l"></button>' +
          '<span class="muted sm cn-active-t" id="cn-active-t"></span></div>' +
      '</div></div>' +
      ctx.danger({ title: 'Видалити обмеження', text: 'Генератор більше не враховуватиме це правило.', draftText: 'З’явиться у списку, щойно ви оберете ціль, тип і параметри.' });
  }

  function mount(el, item, ctx) {
    var w = ctx.w;
    paintHead(ctx); paintCats(ctx); paintEntity(ctx); paintTypes(ctx); paintEditor(ctx); paintActive(ctx);
    el.querySelector('#cn-cats').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]');
      if (!b) return;
      var cat = b.getAttribute('data-cat');
      if (cat === w.cat) return;
      w.cat = cat; w.entity = null;
      if (cat === 'global') {
        if (w.type !== 'sequential_lessons') { w.type = 'sequential_lessons'; w.cfg = defaultCfg(w.type); }
      } else if (w.type === 'sequential_lessons') { w.type = null; w.cfg = null; }
      paintCats(ctx); paintEntity(ctx); paintTypes(ctx); paintEditor(ctx);
      commit(ctx);
      var inp = el.querySelector('#cn-ent');
      if (inp) inp.focus();
    });
    el.querySelector('#cn-types').addEventListener('click', function (e) {
      var b = e.target.closest('[data-type]');
      if (!b) return;
      var type = b.getAttribute('data-type');
      if (type === w.type) return;
      w.type = type; w.cfg = defaultCfg(type);
      paintTypes(ctx); paintEditor(ctx);
      commit(ctx);
    });
    el.querySelector('#cn-active').addEventListener('click', function () {
      w.active = !w.active;
      paintActive(ctx);
      commit(ctx);
    });
    var sem = el.querySelector('#cn-sem');
    if (sem) sem.addEventListener('change', function () {
      w.semester = Number(sem.value);
      commit(ctx).then(function (ok) {
        if (ok && String(w.semester) !== String(semId)) switchSemester(String(w.semester), true);
      });
    });
    if (ctx.isDraft) {
      var first = el.querySelector('#cn-cats [data-cat]');
      if (first) first.focus();
    }
  }

  function paintHead(ctx) {
    var w = ctx.w, el = ctx.el;
    var t = typeById(w.type), cat = catById(w.cat);
    var p = payloadOf(w);
    el.querySelector('#cn-title').textContent = !w.cat || !w.type ? 'Нове обмеження'
      : w.cat !== 'global' && !w.entity ? cat.label + ' — ' + summary(w.cat, w.cfg) : sentence(p);
    el.querySelector('#cn-ava').innerHTML = ic(t ? t.icon : 'constraints', 22);
    el.querySelector('#cn-sub').textContent = [cat ? cat.label : '', t ? t.label : '', semName(w.semester), w.active ? '' : 'вимкнене']
      .filter(Boolean).join(' · ');
    var hint = el.querySelector('#cn-hint');
    var miss = missing(w);
    hint.hidden = !miss;
    hint.textContent = miss ? (ctx.isDraft ? miss + ' — тоді обмеження збережеться.' : 'Не збережено: ' + miss.charAt(0).toLowerCase() + miss.slice(1) + '.') : '';
  }

  function rcard(attr, id, on, o) {
    return '<button type="button" class="rcard' + (on ? ' is-on' : '') + '" role="radio" aria-checked="' + on + '" ' + attr + '="' + esc(id) + '"' +
      (o.c ? ' style="--c:var(' + o.c + ')"' : '') + '><span class="ri">' + ic(o.icon, 16) + '</span>' +
      '<span><b>' + esc(o.label) + '</b><span>' + esc(o.hint) + '</span></span></button>';
  }
  function paintCats(ctx) {
    var w = ctx.w;
    ctx.el.querySelector('#cn-cats').innerHTML = CATS.map(function (c) { return rcard('data-cat', c.id, c.id === w.cat, c); }).join('');
  }
  function paintTypes(ctx) {
    var w = ctx.w, el = ctx.el;
    el.querySelector('#cn-types-sec').hidden = !w.cat;
    el.querySelector('#cn-types').innerHTML = w.cat ? typesFor(w.cat).map(function (t) { return rcard('data-type', t.id, t.id === w.type, t); }).join('') : '';
  }
  function paintActive(ctx) {
    var w = ctx.w, b = ctx.el.querySelector('#cn-active');
    b.classList.toggle('is-on', w.active);
    b.setAttribute('aria-checked', String(w.active));
    ctx.el.querySelector('#cn-active-t').textContent = w.active ? 'Генератор враховує правило' : 'Правило збережене, але не діє';
  }

  /* ---------- target entity combobox ---------- */
  function paintEntity(ctx) {
    var w = ctx.w, box = ctx.el.querySelector('#cn-entity');
    var cat = catById(w.cat);
    if (!cat || w.cat === 'global') { box.innerHTML = ''; return; }
    var items = res[w.cat] || [];
    var current = w.entity ? entityName(w.cat, w.entity, ctx.item) : '';
    box.innerHTML = '<div class="fields mt"><label class="f-label" for="cn-ent">' + esc(cat.label) + '</label>' +
      '<div class="f-value"><div class="combo cn-combo"><input class="input' + (w.entity ? '' : ' is-empty') + '" id="cn-ent" role="combobox" aria-expanded="false" ' +
      'aria-controls="cn-ent-list" aria-autocomplete="list" autocomplete="off" placeholder="Оберіть ' + esc(cat.pick) + '…" value="' + esc(current) + '">' +
      '<div class="combo-list" id="cn-ent-list" role="listbox" aria-label="' + esc(cat.label) + '"></div></div></div></div>';
    var input = box.querySelector('#cn-ent'), listEl = box.querySelector('#cn-ent-list');
    var active = 0, opts = [], typing = false;
    function filtered() {
      var q = typing ? input.value.trim().toLowerCase() : '';
      return items.filter(function (e) { return !q || entityLabel(w.cat, e).toLowerCase().indexOf(q) >= 0; })
        .sort(function (a, b) { return entityLabel(w.cat, a).localeCompare(entityLabel(w.cat, b), 'uk'); });
    }
    function open() {
      opts = filtered();
      active = Math.min(active, Math.max(opts.length - 1, 0));
      listEl.innerHTML = opts.length ? opts.map(function (e, i) {
        var label = w.cat === 'room' ? esc(e.title) + (e.building ? '<small>' + esc(e.building) + '</small>' : '') : esc(e.name);
        var sel = String(e.id) === String(w.entity);
        return '<div class="combo-item' + (i === active ? ' is-active' : '') + '" role="option" id="cn-ent-o' + i + '" aria-selected="' + sel + '" data-ent="' + esc(e.id) + '">' + label + '</div>';
      }).join('') : '<div class="combo-empty">' + (items.length ? 'Нічого не знайдено' : 'Довідник порожній') + '</div>';
      listEl.classList.add('is-open');
      input.setAttribute('aria-expanded', 'true');
      if (opts.length) input.setAttribute('aria-activedescendant', 'cn-ent-o' + active); else input.removeAttribute('aria-activedescendant');
      var a = listEl.querySelector('.is-active');
      if (a) a.scrollIntoView({ block: 'nearest' });
    }
    function close() {
      listEl.classList.remove('is-open');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      typing = false;
      input.value = w.entity ? entityName(w.cat, w.entity, ctx.item) : '';
    }
    function pick(id) {
      w.entity = Number(id);
      input.classList.remove('is-empty');
      close();
      commit(ctx);
    }
    input.addEventListener('focus', function () { active = Math.max(0, filtered().findIndex(function (e) { return String(e.id) === String(w.entity); })); open(); input.select(); });
    input.addEventListener('input', function () { typing = true; active = 0; open(); });
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, opts.length - 1); open(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); open(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (opts[active]) pick(opts[active].id); }
      else if (e.key === 'Escape') { if (listEl.classList.contains('is-open')) { e.stopPropagation(); close(); } }
    });
    listEl.addEventListener('mousedown', function (e) { e.preventDefault(); });
    listEl.addEventListener('click', function (e) {
      var it = e.target.closest('[data-ent]');
      if (it) pick(it.getAttribute('data-ent'));
    });
  }

  /* ---------- value editors ---------- */
  function paintEditor(ctx) {
    var w = ctx.w, el = ctx.el;
    var sec = el.querySelector('#cn-editor-sec'), box = el.querySelector('#cn-editor');
    paintHead(ctx);
    sec.hidden = !w.type;
    box.onclick = null;
    if (!w.type) { box.innerHTML = ''; return; }
    var t = typeById(w.type);
    el.querySelector('#cn-editor-title').innerHTML = t ? esc(t.label) + ' <span class="muted sm">' + esc(editorHint(w)) + '</span>' : 'Параметри';
    if (w.type === 'day_off') return editDayOff(ctx, box);
    if (w.type === 'max_daily_lessons') return editMax(ctx, box);
    if (w.type === 'time_block') return editTimeBlock(ctx, box);
    if (w.type === 'sequential_lessons') return editSequential(ctx, box);
    box.innerHTML = '<pre class="cn-raw">' + esc(JSON.stringify(w.cfg, null, 2)) + '</pre>';
  }
  function editorHint(w) {
    if (w.type === 'day_off') return 'дні без жодних занять';
    if (w.type === 'time_block') return 'клік по клітинці — заборонена пара, по дню — увесь день';
    if (w.type === 'max_daily_lessons') return 'скільки пар максимум за один день';
    if (w.type === 'sequential_lessons') return 'залежний план ставиться після опорного';
    return '';
  }

  function editDayOff(ctx, box) {
    var w = ctx.w;
    function paint() {
      var days = (w.cfg.days || []).map(Number);
      box.innerHTML = '<div class="days cn-days" role="group" aria-label="Вихідні дні">' + DAY_CAP.map(function (d, i) {
        var on = days.indexOf(i + 1) >= 0;
        return '<button type="button" class="' + (on ? 'is-on' : '') + '" aria-pressed="' + on + '" data-day="' + (i + 1) + '" title="' + DAY_FULL[i] + '">' + d + '</button>';
      }).join('') + '</div>';
    }
    paint();
    box.onclick = function (e) {
      var b = e.target.closest('[data-day]');
      if (!b) return;
      var d = Number(b.getAttribute('data-day'));
      var days = (w.cfg.days || []).map(Number);
      days = days.indexOf(d) >= 0 ? days.filter(function (x) { return x !== d; }) : days.concat([d]);
      w.cfg.days = days.sort(function (a, b2) { return a - b2; });
      paint();
      var nb = box.querySelector('[data-day="' + d + '"]');
      if (nb) nb.focus();
      commit(ctx);
    };
  }

  function stepper(id, value, label) {
    return '<div class="stepper" role="group" aria-label="' + esc(label) + '">' +
      '<button type="button" data-step="-1" aria-label="Менше">−</button><b id="' + id + '" aria-live="polite">' + esc(value) + '</b>' +
      '<button type="button" data-step="1" aria-label="Більше">' + ic('plus', 14) + '</button></div>';
  }
  function editMax(ctx, box) {
    var w = ctx.w;
    box.innerHTML = '<div class="row cn-step">' + stepper('cn-max', w.cfg.value, 'Максимум пар на день') + '<span class="muted" id="cn-max-t"></span></div>';
    function label() { box.querySelector('#cn-max-t').textContent = plural(Number(w.cfg.value), 'пара', 'пари', 'пар') + ' на день'; }
    label();
    box.onclick = function (e) {
      var b = e.target.closest('[data-step]');
      if (!b) return;
      var v = Math.min(10, Math.max(1, Number(w.cfg.value || 4) + Number(b.getAttribute('data-step'))));
      if (v === Number(w.cfg.value)) return;
      w.cfg.value = v;
      box.querySelector('#cn-max').textContent = v;
      label();
      commit(ctx); // saves are serialised, so each step goes out at once and none is lost on leave
    };
  }

  function editTimeBlock(ctx, box) {
    var w = ctx.w, sid = w.semester;
    UI.state(box, 'loading');
    ctx.load(semesterGrid(sid)).then(function (g) {
      if (w.type !== 'time_block' || w.semester !== sid) return;
      var v = w.cfg.value || (w.cfg.value = {});
      // Keep periods/days stored in the value even if the semester grid lacks them.
      var days = g.days.slice(), pers = g.periods.slice();
      Object.keys(v).forEach(function (k) {
        var d = Number(k);
        if (days.indexOf(d) < 0 && d >= 1 && d <= 7) days.push(d);
        (v[k] || []).forEach(function (p) {
          p = Number(p);
          if (!pers.some(function (x) { return x.n === p; })) pers.push({ n: p, start: '', end: '' });
        });
      });
      days.sort(function (a, b) { return a - b; });
      pers.sort(function (a, b) { return a.n - b.n; });
      if (!pers.length) { UI.state(box, 'empty', { text: 'У семестрі ще немає розкладу дзвінків' }); return; }
      function blocked(d, p) { return (v[String(d)] || []).map(Number).indexOf(p) >= 0; }
      function paint() {
        var h = '<span></span>' + days.map(function (d) {
          var all = pers.every(function (p) { return blocked(d, p.n); });
          return '<button type="button" class="hd" data-day="' + d + '" aria-pressed="' + all + '" title="' + DAY_FULL[d - 1] +
            (all ? ': дозволити всі пари' : ': заборонити всі пари') + '">' + DAY_CAP[d - 1] + '</button>';
        }).join('');
        pers.forEach(function (p) {
          var time = p.start ? p.start + (p.end ? '–' + p.end : '') : '';
          h += '<span class="hd tm" title="' + p.n + ' пара' + (time ? ', ' + time : '') + '">' + esc(p.start || p.n + ' п.') + '</span>';
          days.forEach(function (d) {
            var b = blocked(d, p.n);
            h += '<button type="button" class="c' + (b ? ' off' : '') + '" data-day="' + d + '" data-p="' + p.n + '" aria-pressed="' + b + '" aria-label="' +
              DAY_FULL[d - 1] + ', ' + p.n + ' пара: заборонена"></button>';
          });
        });
        box.innerHTML = '<div class="avail" style="--days:' + days.length + '">' + h + '</div>' +
          '<div class="legend"><span><i class="free"></i>дозволена</span><span><i class="off"></i>заборонена</span></div>';
      }
      function set(d, p, on) {
        var k = String(d), arr = (v[k] || []).map(Number).filter(function (x) { return x !== p; });
        if (on) arr.push(p);
        arr.sort(function (a, b) { return a - b; });
        if (arr.length) v[k] = arr; else delete v[k];
      }
      paint();
      box.onclick = function (e) {
        var c = e.target.closest('button.c[data-p]'), hd = e.target.closest('button.hd[data-day]');
        var focus = null;
        if (c) {
          var d = Number(c.dataset.day), p = Number(c.dataset.p);
          set(d, p, !blocked(d, p));
          focus = 'button.c[data-day="' + d + '"][data-p="' + p + '"]';
        } else if (hd) {
          var dd = Number(hd.dataset.day);
          var all = pers.every(function (x) { return blocked(dd, x.n); });
          pers.forEach(function (x) { set(dd, x.n, !all); });
          focus = 'button.hd[data-day="' + dd + '"]';
        } else return;
        paint();
        var f = box.querySelector(focus);
        if (f) f.focus();
        paintHead(ctx);
        commit(ctx);
      };
    }, function (err) {
      UI.state(box, 'error', { text: errText(err, 'Не вдалося завантажити розклад дзвінків'), actionLabel: 'Спробувати ще', onAction: function () { paintEditor(ctx); } });
    });
  }

  function editSequential(ctx, box) {
    var w = ctx.w, sid = w.semester;
    if (!w.cfg.value) w.cfg.value = { time_gap: 1 };
    UI.state(box, 'loading');
    ctx.load(plansFor(sid)).then(function (plans) {
      if (w.type !== 'sequential_lessons' || w.semester !== sid) return;
      var v = w.cfg.value;
      if (!plans.length) { UI.state(box, 'empty', { text: 'У семестрі ще немає навчальних планів' }); return; }
      plans = plans.slice().sort(function (a, b) { return planOption(a).localeCompare(planOption(b), 'uk'); });
      function opt(p, sel) { return '<option value="' + esc(p.id) + '"' + (String(p.id) === String(sel) ? ' selected' : '') + '>' + esc(planOption(p)) + '</option>'; }
      function followerOptions() {
        var leader = plans.find(function (p) { return String(p.id) === String(v.leader_plan_id); });
        if (!leader) return '<option value="">Спочатку оберіть опорний план</option>';
        var rest = plans.filter(function (p) { return p.id !== leader.id; });
        var same = rest.filter(function (p) { return p.subject === leader.subject; });
        var other = rest.filter(function (p) { return p.subject !== leader.subject; });
        return '<option value="">Оберіть залежний план</option>' +
          (same.length ? '<optgroup label="Той самий предмет">' + same.map(function (p) { return opt(p, v.follower_plan_id); }).join('') + '</optgroup>' : '') +
          (other.length ? '<optgroup label="Інші предмети">' + other.map(function (p) { return opt(p, v.follower_plan_id); }).join('') + '</optgroup>' : '');
      }
      box.innerHTML = '<div class="fields">' +
        '<label class="f-label" for="cn-lead">Опорний план</label><div class="f-value"><select class="select" id="cn-lead">' +
          '<option value="">Оберіть опорний план</option>' + plans.map(function (p) { return opt(p, v.leader_plan_id); }).join('') + '</select></div>' +
        '<label class="f-label" for="cn-follow">Залежний план</label><div class="f-value"><select class="select" id="cn-follow"' + (v.leader_plan_id ? '' : ' disabled') + '>' +
          followerOptions() + '</select></div>' +
        '<span class="f-label">Розрив, пар</span><div class="f-value">' + stepper('cn-gap', v.time_gap != null ? v.time_gap : 1, 'Розрив між планами, пар') + '</div>' +
        '</div>';
      var lead = box.querySelector('#cn-lead'), follow = box.querySelector('#cn-follow');
      function snap(sel) { var o = sel.options[sel.selectedIndex]; return o ? o.text : ''; }
      lead.addEventListener('change', function () {
        v.leader_plan_id = lead.value ? Number(lead.value) : null;
        v._snapshot_leader = lead.value ? snap(lead) : undefined;
        if (!v.leader_plan_id || String(v.follower_plan_id) === String(v.leader_plan_id)) { v.follower_plan_id = null; delete v._snapshot_follower; }
        follow.innerHTML = followerOptions();
        follow.disabled = !v.leader_plan_id;
        paintHead(ctx); commit(ctx);
      });
      follow.addEventListener('change', function () {
        v.follower_plan_id = follow.value ? Number(follow.value) : null;
        if (follow.value) v._snapshot_follower = snap(follow); else delete v._snapshot_follower;
        paintHead(ctx); commit(ctx);
      });
      box.onclick = function (e) {
        var b = e.target.closest('[data-step]');
        if (!b) return;
        var g = Math.max(0, Number(v.time_gap != null ? v.time_gap : 1) + Number(b.getAttribute('data-step')));
        if (g === Number(v.time_gap)) return;
        v.time_gap = g;
        box.querySelector('#cn-gap').textContent = g;
        commit(ctx);
      };
    }, function (err) {
      UI.state(box, 'error', { text: errText(err, 'Не вдалося завантажити навчальні плани'), actionLabel: 'Спробувати ще', onAction: function () { paintEditor(ctx); } });
    });
  }

  /* ---------- saving ---------- */
  // Saves the whole working state when it is complete; resolves true when saved.
  function commit(ctx) {
    paintHead(ctx);
    var w = ctx.w;
    if (missing(w)) return Promise.resolve(false);
    if (w.cfg && w.cfg.type === 'sequential_lessons') {
      var v = w.cfg.value || {};
      Object.keys(v).forEach(function (k) { if (v[k] === undefined) delete v[k]; });
    }
    return ctx.save(clone(payloadOf(w))).then(function () { return true; }, function () { return false; });
  }

  /* ---------- semester switch (top bar select, ?semester=) ---------- */
  // A user switch is a history step (pushState); moving a record to another semester only replaces it.
  function semUrl(id, dropId) {
    var u = new URL(window.location.href);
    u.searchParams.set('semester', id);
    if (dropId) u.searchParams.delete('id');
    return u.href;
  }
  function switchSemester(id, keepSelection) {
    semId = String(id);
    if (semSelect) semSelect.value = semId;
    var href = semUrl(semId, !keepSelection);
    if (href !== window.location.href) history[keepSelection ? 'replaceState' : 'pushState'](history.state, '', href);
    if (!keepSelection) md.select(null);
    md.reload();
  }
  function defaultSem() {
    var cur = semesters.find(function (s) { return s.is_current; }) || semesters[0];
    return cur ? String(cur.id) : null;
  }
  function buildSemSelect() {
    var host = Shell.actionsEl && Shell.actionsEl();
    if (!host || semSelect) return;
    semSelect = document.createElement('select');
    semSelect.className = 'select sm cn-semsel';
    semSelect.setAttribute('aria-label', 'Семестр');
    semSelect.hidden = true;
    semSelect.addEventListener('change', function () { switchSemester(semSelect.value, false); });
    host.insertBefore(semSelect, host.firstChild);
    fillSemSelect();
  }
  function fillSemSelect() {
    if (!semSelect || !semesters.length) return;
    semSelect.innerHTML = semesters.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (String(s.id) === String(semId) ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
    semSelect.hidden = false;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildSemSelect);
  else buildSemSelect();

  function loadBase() {
    if (!baseLoaded) {
      baseLoaded = Promise.all([
        apiRequest('/semesters/'),
        Promise.all(['teacher', 'group', 'room', 'stream'].map(function (k) {
          return apiRequest(catById(k).list).then(function (r) { res[k] = list(r); }, function () {
            UI.toast('Не вдалося завантажити довідник «' + catById(k).label + '»', { type: 'warn' });
          });
        }))
      ]).then(function (r) {
        semesters = list(r[0]);
        var want = new URLSearchParams(window.location.search).get('semester');
        if (!want || !semName(want)) want = defaultSem();
        semId = want;
        fillSemSelect();
      });
      baseLoaded.catch(function () { baseLoaded = null; });
    }
    return baseLoaded;
  }

  /* ---------- controller ---------- */
  md = MasterDetail.create({
    root: '#constraints',
    title: 'Обмеження',
    color: '--c5',
    searchPlaceholder: 'Пошук за ціллю або правилом',
    addLabel: 'Додати обмеження',
    draftLabel: 'Нове обмеження',
    emptyText: 'У цьому семестрі обмежень немає',
    selectText: 'Оберіть обмеження зі списку',
    removedText: 'Обмеження видалено',
    removeQuestion: 'Точно видалити обмеження?',
    countLabel: function (n) { return n + ' ' + plural(n, 'обмеження', 'обмеження', 'обмежень'); },
    load: function (lc) {
      return loadBase().then(function () {
        if (!semId) return [];
        var sid = semId;
        return Promise.all([
          apiRequest('/semester_constraints/?semester=' + encodeURIComponent(sid)),
          plansFor(sid).catch(function () { return []; })
        ]).then(function (r) {
          if (sid !== semId || (lc && !lc.isCurrent())) return []; // stale: a newer load owns plansMap
          plansMap = {};
          r[1].forEach(function (p) { plansMap[p.id] = p; });
          return list(r[0]);
        });
      });
    },
    sort: function (a, b) {
      return (sortKey(a) - sortKey(b)) || sentence(a).localeCompare(sentence(b), 'uk') || (a.id - b.id);
    },
    groupBy: function (c) { return catById(catOf(c)).label; },
    search: function (c, q) {
      var t = typeById(c.configuration && c.configuration.type);
      return sentence(c).toLowerCase().indexOf(q) >= 0 || (t && t.label.toLowerCase().indexOf(q) >= 0);
    },
    filters: CATS.map(function (cat) {
      return { id: cat.id, label: cat.label, test: function (c) { return catOf(c) === cat.id; } };
    }),
    renderRow: renderRow,
    renderDraftRow: function () {
      return '<span class="avatar sm sq sec">' + ic('plus', 14) + '</span><div class="grow"><div class="name">Нове обмеження</div><div class="meta">Ще не збережено</div></div>';
    },
    renderDetail: renderDetail,
    mount: mount,
    newItem: function () {
      return { semester: semId != null ? Number(semId) : null, teacher: null, group: null, stream: null, room: null, configuration: null, is_active: true };
    },
    // Category, entity and type are not fields: the working state on ctx decides (commit() calls ctx.save).
    canCreate: function (values, item, ctx) { return missing(ctx.w) || true; },
    create: function (payload) { return apiRequest('/semester_constraints/', 'POST', payload); },
    update: function (c, payload) { return apiRequest('/semester_constraints/' + c.id + '/', 'PUT', payload); },
    remove: function (c) { return apiRequest('/semester_constraints/' + c.id + '/', 'DELETE'); }
  });

  // Registered after MasterDetail's own handler, so the item from the URL is selected first.
  window.addEventListener('popstate', function () {
    if (!semesters.length) return;
    var want = new URLSearchParams(window.location.search).get('semester');
    if (!want || !semName(want)) want = defaultSem();
    if (want == null || String(want) === String(semId)) return;
    semId = String(want);
    if (semSelect) semSelect.value = semId;
    md.reload();
  });
})();
