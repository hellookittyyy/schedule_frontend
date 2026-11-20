/* «Викладачі»: master–detail (assets/js/master-detail.js). */
(function () {
  'use strict';

  var esc = UI.escapeHtml;
  function ic(name, size) { return Icons.svg(name, { size: size || 16 }); }

  var DAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  var DAY_FULL = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота', 'Неділя'];

  var allSubjects = [];
  var semesters = [];
  var semId = null;
  var gridCache = {}; // semester id -> Promise<{days, periods}>
  var md;

  var plural = UI.pluralForm;
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0] || '').charAt(0) + (p[1] || '').charAt(0)).toUpperCase() || '?';
  }
  function subjOf(t) { return t.subjects_details || []; }
  function byName(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'uk'); }
  function semName(id) {
    var s = semesters.find(function (x) { return String(x.id) === String(id); });
    return s ? s.name : '';
  }
  function subjCountText(n) { return n ? n + ' ' + plural(n, 'предмет', 'предмети', 'предметів') : 'Без предметів'; }
  function errText(err, fb) { return MasterDetail.errorText(err, fb); }

  /* ---------- list ---------- */
  function renderRow(t) {
    var s = subjOf(t);
    return '<span class="avatar sm sec">' + esc(initials(t.name)) + '</span>' +
      '<div class="grow"><div class="name">' + esc(t.name) + '</div>' +
      '<div class="meta">' + (s.length ? esc(s.map(function (x) { return x.name; }).join(', ')) : 'Без предметів') + '</div></div>' +
      '<span class="num">' + s.length + '</span>';
  }

  /* ---------- detail ---------- */
  // Sections that exist only for a saved teacher (also inserted in place after a draft's first save).
  function savedHtml() {
    if (!semesters.length) return '';
    var semOptions = semesters.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (String(s.id) === String(semId) ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
    return '<div class="section"><div class="section-title">Доступність <span class="muted sm">клік по клітинці — недоступна пара, по дню — вихідний</span>' +
        '<select class="select sm" id="t-sem" aria-label="Семестр">' + semOptions + '</select></div>' +
        '<div id="t-avail"></div></div>' +
      '<div class="section"><div class="section-title">Веде в групах <span class="muted sm" id="t-groups-sem"></span></div>' +
        '<div id="t-groups"></div></div>';
  }

  function renderDetail(t, ctx) {
    var draft = ctx.isDraft;
    return '' +
      '<div class="detail-head">' +
        '<span class="avatar lg sec">' + (draft && !t.name ? ic('user', 22) : esc(initials(t.name))) + '</span>' +
        '<div class="grow"><h2 class="detail-name" id="t-title">' + esc(t.name || 'Новий викладач') + '</h2>' +
        '<div class="muted" id="t-sub">' + esc(subjCountText(subjOf(t).length)) + '</div></div>' +
        '<span class="saved" data-md-saved hidden></span>' +
      '</div>' +
      '<div class="section"><div class="section-title">Основне</div>' +
        '<div class="fields">' +
          '<label class="f-label" for="t-name">ПІБ</label>' +
          '<div class="f-value"><input class="input" id="t-name" data-md-field="name" required autocomplete="off" ' +
            'placeholder="Наприклад: Іванов Іван Іванович" value="' + esc(t.name || '') + '"></div>' +
        '</div></div>' +
      '<div class="section"><div class="section-title">Предмети</div>' +
        '<div class="chips" id="t-subj-chips"></div>' +
        (allSubjects.length
          ? '<div class="combo inline mt"><input class="input sm" id="t-subj-add" role="combobox" aria-expanded="false" aria-controls="t-subj-list" ' +
              'aria-autocomplete="list" autocomplete="off" placeholder="Додати предмет…">' +
              '<div class="combo-list" id="t-subj-list" role="listbox" aria-label="Предмети"></div></div>'
          : '<p class="muted sm mt">У довіднику ще немає предметів. <a href="/admin/subjects/">Додати предмети</a></p>') +
      '</div>' +
      (draft ? '' : savedHtml()) +
      ctx.danger({ title: 'Видалити викладача', text: 'Разом із викладачем буде видалено його навчальні плани й заняття в розкладі.' });
  }

  function mount(el, t, ctx) {
    var name = el.querySelector('#t-name');
    name.addEventListener('input', function () {
      el.querySelector('#t-title').textContent = name.value.trim() || 'Новий викладач';
    });
    renderSubjectChips(t, ctx);
    wireCombo(t, ctx);
    if (!ctx.isDraft) mountSaved(el, t, ctx);
  }

  function mountSaved(el, t, ctx) {
    var sel = el.querySelector('#t-sem');
    if (sel) {
      sel.addEventListener('change', function () {
        semId = sel.value;
        md.setScope(semId);
      });
      loadSemesterParts(t, ctx);
    }
  }

  /* ---------- subjects ---------- */
  function renderSubjectChips(t, ctx) {
    var box = ctx.el.querySelector('#t-subj-chips');
    if (!box || !ctx.alive()) return;
    var s = subjOf(t);
    box.innerHTML = s.length ? s.map(function (x) {
      return '<span class="chip static">' + esc(x.name) +
        '<button type="button" class="x" data-rm="' + esc(x.id) + '" aria-label="Прибрати «' + esc(x.name) + '»">' + ic('x', 12) + '</button></span>';
    }).join('') : '<span class="muted sm">Не призначено</span>';
    var sub = ctx.el.querySelector('#t-sub');
    if (sub) sub.textContent = subjCountText(s.length);
  }

  function wireCombo(t, ctx) {
    var el = ctx.el;
    el.querySelector('#t-subj-chips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-rm]');
      if (b) removeSubject(t, ctx, Number(b.getAttribute('data-rm')));
    });
    var input = el.querySelector('#t-subj-add');
    if (!input) return;
    var list = el.querySelector('#t-subj-list');
    var active = 0, opts = [];
    function available() {
      var have = subjOf(t).map(function (s) { return s.id; });
      var q = input.value.trim().toLowerCase();
      return allSubjects.filter(function (s) {
        return have.indexOf(s.id) < 0 && (!q || String(s.name).toLowerCase().indexOf(q) >= 0);
      });
    }
    function open() {
      opts = available();
      active = Math.min(active, Math.max(opts.length - 1, 0));
      list.innerHTML = opts.length ? opts.map(function (s, i) {
        return '<div class="combo-item' + (i === active ? ' is-active' : '') + '" role="option" id="t-subj-o' + i + '" aria-selected="' + (i === active) + '" data-add="' + esc(s.id) + '">' + esc(s.name) + '</div>';
      }).join('') : '<div class="combo-empty">' + (input.value.trim() ? 'Нічого не знайдено' : 'Усі предмети вже призначено') + '</div>';
      list.classList.add('is-open');
      input.setAttribute('aria-expanded', 'true');
      if (opts.length) input.setAttribute('aria-activedescendant', 't-subj-o' + active); else input.removeAttribute('aria-activedescendant');
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
      addSubject(t, ctx, id).then(function () { if (document.activeElement === input) open(); });
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

  function syncTeacher(t, ctx, quiet) {
    return apiRequest('/teachers/' + t.id + '/').then(function (fresh) {
      Object.assign(t, fresh);
      md.refresh(t);
      if (ctx.alive()) { renderSubjectChips(t, ctx); if (!quiet) ctx.status('saved'); }
    });
  }

  function subjectIds(t) {
    return subjOf(t).map(function (s) { return s.id; }).join(',');
  }

  // One PUT per chip edit. Chip edits queue, so a newer edit may already be in flight when this
  // op fails; that newer op carries the failed change, so only re-read the server when it does not.
  function saveSubjects(t, ctx, failText) {
    var sent = null;
    return ctx.queue(function () {
      sent = subjectIds(t);
      return apiRequest('/teachers/' + t.id + '/', 'PUT', { name: t.name, subjects: subjOf(t).map(function (s) { return s.id; }) });
    }, { errorText: failText }).then(function (fresh) {
      var local = subjOf(t);
      var localIds = subjectIds(t);
      Object.assign(t, fresh);
      if (localIds !== sent) t.subjects_details = local; // a newer chip write owns the list; its response follows
      md.refresh(t);
      if (ctx.alive()) renderSubjectChips(t, ctx);
    }, function () {
      // No newer chip edit: re-read the server truth. Otherwise the queued op already carries the failed change.
      if (sent == null || sent !== subjectIds(t)) return;
      return syncTeacher(t, ctx, true).catch(function () {});
    });
  }

  function addSubject(t, ctx, subjectId) {
    var subj = allSubjects.find(function (s) { return s.id === subjectId; });
    if (!subj) return Promise.resolve();
    if (ctx.isDraft) {
      if (!subjOf(t).some(function (s) { return s.id === subjectId; })) {
        t.subjects_details = subjOf(t).concat([subj]);
      }
      renderSubjectChips(t, ctx);
      return Promise.resolve();
    }
    if (!subjOf(t).some(function (s) { return s.id === subjectId; })) {
      t.subjects_details = subjOf(t).concat([subj]);
    }
    return saveSubjects(t, ctx, 'Не вдалося додати предмет');
  }

  function removeSubject(t, ctx, subjectId) {
    var subj = subjOf(t).find(function (s) { return s.id === subjectId; });
    if (!subj) return;
    if (ctx.isDraft) {
      t.subjects_details = subjOf(t).filter(function (s) { return s.id !== subjectId; });
      renderSubjectChips(t, ctx);
      return;
    }
    t.subjects_details = subjOf(t).filter(function (s) { return s.id !== subjectId; });
    saveSubjects(t, ctx, 'Не вдалося прибрати предмет').then(function () {
      UI.toast('Предмет «' + subj.name + '» прибрано', {
        type: 'ok',
        action: { label: 'Повернути', onClick: function () { addSubject(t, ctx, subjectId); } }
      });
    }, function () {});
  }

  /* ---------- semester grid: days × periods from the semester's timeslots ---------- */
  function semesterGrid(id) {
    if (!gridCache[id]) {
      gridCache[id] = apiRequest('/timeslots/?semester=' + encodeURIComponent(id)).then(function (slots) {
        slots = (slots && slots.results) || slots || [];
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

  function loadSemesterParts(t, ctx) {
    var sid = semId;
    var sub = ctx.el.querySelector('#t-groups-sem');
    if (sub) sub.textContent = semName(sid);
    loadAvailability(t, ctx, sid);
    loadGroups(t, ctx, sid);
  }

  /* ---------- availability: time_block / day_off constraints of this teacher ---------- */
  function loadAvailability(t, ctx, sid) {
    var box = ctx.el.querySelector('#t-avail');
    if (!box) return;
    UI.state(box, 'loading');
    ctx.load(Promise.all([
      semesterGrid(sid),
      apiRequest('/semester_constraints/?semester=' + encodeURIComponent(sid) + '&teacher=' + t.id + '&is_active=true')
    ])).then(function (r) {
      var cons = (r[1] && r[1].results) || r[1] || [];
      new AvailGrid(box, t, sid, r[0], cons, ctx);
    }, function (err) {
      UI.state(box, 'error', { text: errText(err, 'Не вдалося завантажити доступність'), actionLabel: 'Спробувати ще', onAction: function () { loadAvailability(t, ctx, sid); } });
    });
  }

  function AvailGrid(box, t, sid, grid, cons, ctx) {
    this.box = box; this.t = t; this.sid = sid; this.grid = grid; this.cons = cons; this.ctx = ctx;
    if (!grid.periods.length) {
      UI.state(box, 'empty', { text: 'У семестрі ще немає розкладу дзвінків' });
      return;
    }
    this.render();
    box._grid = this; // one listener per box; a reload replaces the grid it talks to
    if (box._gridWired) return;
    box._gridWired = true;
    box.addEventListener('click', function (e) {
      var self = box._grid;
      if (!self) return;
      var c = e.target.closest('button.c[data-day]');
      var h = e.target.closest('button.hd[data-day]');
      if (c) {
        var on = !c.classList.contains('off');
        c.classList.toggle('off', on); c.setAttribute('aria-pressed', String(on));
        self.ctx.queue(function () { return self.setBlocked(Number(c.dataset.day), Number(c.dataset.p), on); },
          { errorText: 'Не вдалося зберегти доступність' }).then(function () {
            if (self.ctx.pending === 0 && self.ctx.alive() && document.contains(self.box)) self.render();
          }, function () {
            if (self.ctx.alive()) loadAvailability(self.t, self.ctx, self.sid);
          });
      } else if (h) {
        var off = !h.classList.contains('is-off');
        h.classList.toggle('is-off', off); h.setAttribute('aria-pressed', String(off));
        self.ctx.queue(function () { return self.setDayOff(Number(h.dataset.day), off); },
          { errorText: 'Не вдалося зберегти доступність' }).then(function () {
            if (self.ctx.pending === 0 && self.ctx.alive() && document.contains(self.box)) self.render();
          }, function () {
            if (self.ctx.alive()) loadAvailability(self.t, self.ctx, self.sid);
          });
      }
    });
  }
  AvailGrid.prototype.of = function (type) {
    return this.cons.filter(function (c) { return c.configuration && c.configuration.type === type; });
  };
  AvailGrid.prototype.isBlocked = function (day, p) {
    return this.of('time_block').some(function (c) {
      var v = (c.configuration.value || {})[String(day)] || [];
      return v.map(Number).indexOf(p) >= 0;
    });
  };
  AvailGrid.prototype.isDayOff = function (day) {
    return this.of('day_off').some(function (c) { return (c.configuration.days || []).map(Number).indexOf(day) >= 0; });
  };
  AvailGrid.prototype.render = function () {
    var self = this, g = this.grid;
    var h = '<span></span>' + g.days.map(function (d) {
      var off = self.isDayOff(d);
      return '<button type="button" class="hd' + (off ? ' is-off' : '') + '" data-day="' + d + '" aria-pressed="' + off + '" title="' +
        DAY_FULL[d - 1] + (off ? ': вихідний — натисніть, щоб скасувати' : ': зробити вихідним') + '">' + DAY_SHORT[d - 1] + '</button>';
    }).join('');
    g.periods.forEach(function (p) {
      var time = p.start ? p.start + (p.end ? '–' + p.end : '') : '';
      h += '<span class="hd tm" title="' + p.n + ' пара' + (time ? ', ' + time : '') + '">' + esc(p.start || p.n) + '</span>';
      g.days.forEach(function (d) {
        var label = DAY_FULL[d - 1] + ', ' + p.n + ' пара';
        if (self.isDayOff(d)) {
          h += '<button type="button" class="c block" disabled aria-label="' + label + ': вихідний день"></button>';
        } else {
          var b = self.isBlocked(d, p.n);
          h += '<button type="button" class="c' + (b ? ' off' : '') + '" data-day="' + d + '" data-p="' + p.n + '" aria-pressed="' + b + '" aria-label="' + label + ': недоступний"></button>';
        }
      });
    });
    this.box.innerHTML = '<div class="avail" style="--days:' + g.days.length + '">' + h + '</div>' +
      '<div class="legend"><span><i class="free"></i>доступний</span><span><i class="off"></i>недоступний</span><span><i class="block"></i>вихідний день</span></div>';
  };
  AvailGrid.prototype.replace = function (old, fresh) {
    var i = this.cons.indexOf(old);
    if (fresh) { if (i >= 0) this.cons[i] = fresh; else this.cons.push(fresh); }
    else if (i >= 0) this.cons.splice(i, 1);
  };
  // Same shape as admin/constraints (the API validates the entity even on partial updates).
  AvailGrid.prototype.payload = function (configuration, active) {
    return { semester: Number(this.sid), teacher: this.t.id, group: null, stream: null, room: null, configuration: configuration, is_active: active };
  };
  AvailGrid.prototype.post = function (configuration) {
    var self = this;
    return apiRequest('/semester_constraints/', 'POST', this.payload(configuration, true))
      .then(function (c) { self.replace(null, c); });
  };
  // Write a new configuration; an emptied rule is deleted instead of kept empty.
  AvailGrid.prototype.write = function (c, configuration, empty) {
    var self = this;
    if (empty) return apiRequest('/semester_constraints/' + c.id + '/', 'DELETE').then(function () { self.replace(c, null); });
    return apiRequest('/semester_constraints/' + c.id + '/', 'PUT', this.payload(configuration, c.is_active !== false))
      .then(function (fresh) { self.replace(c, fresh); });
  };
  AvailGrid.prototype.setBlocked = function (day, p, on) {
    var self = this, key = String(day);
    if (on === this.isBlocked(day, p)) return Promise.resolve();
    var tbs = this.of('time_block');
    if (on) {
      if (!tbs.length) { var v = {}; v[key] = [p]; return this.post({ type: 'time_block', value: v }); }
      var val = JSON.parse(JSON.stringify(tbs[0].configuration.value || {}));
      val[key] = (val[key] || []).map(Number).concat([p]).sort(function (a, b) { return a - b; });
      return this.write(tbs[0], { type: 'time_block', value: val }, false);
    }
    return tbs.reduce(function (pr, c) {
      return pr.then(function () {
        var val = JSON.parse(JSON.stringify(c.configuration.value || {}));
        var arr = (val[key] || []).map(Number);
        if (arr.indexOf(p) < 0) return;
        arr = arr.filter(function (x) { return x !== p; });
        if (arr.length) val[key] = arr; else delete val[key];
        return self.write(c, { type: 'time_block', value: val }, !Object.keys(val).length);
      });
    }, Promise.resolve());
  };
  AvailGrid.prototype.setDayOff = function (day, on) {
    var self = this;
    if (on === this.isDayOff(day)) return Promise.resolve();
    var dos = this.of('day_off');
    if (on) {
      if (!dos.length) return this.post({ type: 'day_off', days: [day] });
      var days = (dos[0].configuration.days || []).map(Number).concat([day]).sort(function (a, b) { return a - b; });
      return this.write(dos[0], { type: 'day_off', days: days }, false);
    }
    return dos.reduce(function (pr, c) {
      return pr.then(function () {
        var days = (c.configuration.days || []).map(Number);
        if (days.indexOf(day) < 0) return;
        days = days.filter(function (x) { return x !== day; });
        return self.write(c, { type: 'day_off', days: days }, !days.length);
      });
    }, Promise.resolve());
  };

  /* ---------- groups / streams taught in the semester (study plans) ---------- */
  function loadGroups(t, ctx, sid) {
    var box = ctx.el.querySelector('#t-groups');
    if (!box) return;
    UI.state(box, 'loading');
    ctx.load(apiRequest('/study_plans/?semester=' + encodeURIComponent(sid) + '&teacher=' + t.id)).then(function (plans) {
      plans = (plans && plans.results) || plans || [];
      var seen = {}, list = [];
      plans.forEach(function (p) {
        var key = p.group ? 'g' + p.group : 's' + p.stream;
        if (!seen[key]) {
          seen[key] = { href: p.group ? '/admin/groups/?id=' + p.group : '/admin/streams/?id=' + p.stream, name: p.group ? p.group_name : p.stream_name, stream: !p.group, subj: [] };
          list.push(seen[key]);
        }
        if (p.subject_name && seen[key].subj.indexOf(p.subject_name) < 0) seen[key].subj.push(p.subject_name);
      });
      if (!list.length) { box.innerHTML = '<span class="muted sm">У цьому семестрі занять немає</span>'; return; }
      list.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'uk'); });
      box.innerHTML = '<div class="chips">' + list.map(function (g) {
        return '<a class="chip link" href="' + esc(g.href) + '" title="' + esc(g.subj.join(', ')) + '">' +
          esc(g.name) + (g.stream ? ' <span class="muted">потік</span>' : '') + ic('chevR', 12) + '</a>';
      }).join('') + '</div>';
    }, function (err) {
      UI.state(box, 'error', { text: errText(err, 'Не вдалося завантажити навчальні плани'), actionLabel: 'Спробувати ще', onAction: function () { loadGroups(t, ctx, sid); } });
    });
  }

  /* ---------- first save of a draft: saved-only sections + chips changed during the POST ---------- */
  var posted = new WeakMap();
  function onCreated(t, ctx) {
    var html = savedHtml();
    if (html) {
      var anchor = ctx.el.querySelector('[data-md-danger]');
      if (anchor) anchor.insertAdjacentHTML('beforebegin', html); else ctx.el.insertAdjacentHTML('beforeend', html);
      mountSaved(ctx.el, t, ctx);
    }
    var res = posted.get(t);
    posted.delete(t);
    var server = ((res && res.subjects_details) || []).map(function (s) { return s.id; });
    var local = subjOf(t).map(function (s) { return s.id; });
    var ops = local.filter(function (id) { return server.indexOf(id) < 0; }).map(function (id) { return { subject_id: id, action: 'add' }; })
      .concat(server.filter(function (id) { return local.indexOf(id) < 0; }).map(function (id) { return { subject_id: id, action: 'remove' }; }));
    if (!ops.length) return;
    ctx.status('saving');
    ops.reduce(function (p, body) {
      return p.then(function () { return apiRequest('/teachers/' + t.id + '/manage_subjects/', 'POST', body); });
    }, Promise.resolve())
      .then(function () { return syncTeacher(t, ctx); })
      .catch(function (err) { ctx.status('error'); UI.toast(errText(err, 'Не вдалося зберегти предмети'), { type: 'err' }); });
  }

  /* ---------- controller ---------- */
  md = MasterDetail.create({
    root: '#teachers',
    title: 'Викладачі',
    color: '--c4',
    searchPlaceholder: 'Пошук викладача або предмета',
    addLabel: 'Додати викладача',
    draftLabel: 'Новий викладач',
    emptyText: 'Викладачів поки немає',
    removedText: 'Викладача видалено',
    removeQuestion: 'Точно видалити викладача?',
    countLabel: function (n) { return n + ' ' + plural(n, 'викладач', 'викладачі', 'викладачів'); },
    load: function () {
      return Promise.all([
        apiRequest('/teachers/'),
        apiRequest('/subjects/').catch(function () { UI.toast('Не вдалося завантажити предмети', { type: 'warn' }); return []; }),
        apiRequest('/semesters/').catch(function () { return []; })
      ]).then(function (r) {
        allSubjects = ((r[1] && r[1].results) || r[1] || []).slice().sort(byName);
        semesters = (r[2] && r[2].results) || r[2] || [];
        if (semId == null || !semName(semId)) {
          var cur = semesters.find(function (s) { return s.is_current; }) || semesters[0];
          semId = cur ? String(cur.id) : null;
        }
        return r[0];
      });
    },
    sort: byName,
    search: function (t, q) {
      if (String(t.name || '').toLowerCase().indexOf(q) >= 0) return true;
      return subjOf(t).some(function (s) { return String(s.name).toLowerCase().indexOf(q) >= 0; });
    },
    filters: [{ id: 'no-subjects', label: 'Без предметів', test: function (t) { return !subjOf(t).length; } }],
    renderRow: renderRow,
    renderDetail: renderDetail,
    mount: mount,
    onCreate: function () { return { name: '', subjects_details: [] }; },
    onCreated: onCreated,
    save: function (t, ch) {
      if (t.id == null) {
        var payload = { name: ch.name };
        if (subjOf(t).length) payload.subjects = subjOf(t).map(function (s) { return s.id; });
        return apiRequest('/teachers/', 'POST', payload).then(function (r) { posted.set(t, r); return r; });
      }
      return apiRequest('/teachers/' + t.id + '/', 'PUT', { name: ch.name != null ? ch.name : t.name });
    },
    remove: function (t) { return apiRequest('/teachers/' + t.id + '/', 'DELETE'); }
  });
})();
