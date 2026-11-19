/* «Аудиторії»: master–detail + inline «Типи аудиторій». */
(function () {
  'use strict';

  var esc = UI.escapeHtml;
  function ic(name, size) { return Icons.svg(name, { size: size || 16 }); }

  var roomTypes = [];
  var md;
  // Live filter list: master-detail does `opts.filters.slice()`, so hand it an object whose slice() returns this array.
  var filterList = [{ id: 'all', label: 'Усі', test: function () { return true; } }];

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function errText(err, fb) { return MasterDetail.errorText(err, fb); }
  function list(x) { return (x && x.results) || x || []; }
  function typeOf(r) { return r.room_type_details || null; }
  function typeId(r) { return r.room_type != null ? r.room_type : (typeOf(r) ? typeOf(r).id : null); }
  function typeName(r) {
    var id = typeId(r);
    var t = roomTypes.find(function (x) { return x.id === id; }) || typeOf(r);
    return t ? t.name : 'Без типу';
  }
  function seatsText(n) { return (n || 0) + ' ' + plural(n || 0, 'місце', 'місця', 'місць'); }
  function byTitle(a, b) {
    return String(a.title || '').localeCompare(String(b.title || ''), 'uk', { numeric: true });
  }

  function rebuildFilters() {
    filterList.length = 1;
    roomTypes.forEach(function (t) {
      filterList.push({ id: 't' + t.id, label: t.name, test: function (r) { return typeId(r) === t.id; } });
    });
  }

  /* ---------- rooms ---------- */
  function renderRow(r) {
    return '<div class="grow"><div class="name">' + esc(r.title || 'Без номера') + '</div>' +
      '<div class="meta">' + esc(typeName(r)) + '</div></div>' +
      '<span class="num">' + esc(r.capacity || 0) + '</span>';
  }

  function subText(r) {
    var p = [];
    if (r.building) p.push(r.building);
    p.push(typeName(r));
    p.push(seatsText(r.capacity));
    return p.join(' · ');
  }

  function typeOptions(sel) {
    var o = sel == null ? '<option value="" selected disabled>Оберіть тип</option>' : '';
    return o + roomTypes.map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (t.id === sel ? ' selected' : '') + '>' + esc(t.name) + '</option>';
    }).join('');
  }

  function renderDetail(r, ctx) {
    var draft = ctx.isDraft;
    function fld(key, extra) { return draft ? '' : ' data-md-field="' + key + '"' + (extra || ''); }
    return '' +
      '<div class="detail-head">' +
        '<div class="grow"><h2 class="detail-name" id="r-title">' + esc(r.title || 'Нова аудиторія') + '</h2>' +
        (draft ? '' : '<div class="muted" id="r-sub">' + esc(subText(r)) + '</div>') + '</div>' +
        '<span class="saved" data-md-saved hidden></span>' +
      '</div>' +
      '<div class="section"><div class="section-title">Основне</div><div class="fields">' +
        '<label class="f-label" for="r-name">Назва / номер</label>' +
        '<div class="f-value"><input class="input" id="r-name"' + fld('title') + ' required autocomplete="off" maxlength="50" placeholder="Наприклад: 305" value="' + esc(r.title || '') + '"></div>' +
        '<label class="f-label" for="r-bld">Корпус</label>' +
        '<div class="f-value"><input class="input" id="r-bld"' + fld('building') + ' required autocomplete="off" maxlength="50" placeholder="Наприклад: 1" value="' + esc(r.building || '') + '"></div>' +
      '</div></div>' +
      '<div class="section"><div class="section-title">Тип</div><div class="fields">' +
        '<label class="f-label" for="r-type">Тип аудиторії</label>' +
        '<div class="f-value"><select class="select" id="r-type"' + fld('room_type', ' data-md-type="number"') + ' required>' + typeOptions(draft ? null : typeId(r)) + '</select></div>' +
        '<label class="f-label" for="r-cap">Місткість</label>' +
        '<div class="f-value"><input class="input" type="number" min="0" id="r-cap"' + fld('capacity', ' data-md-type="number"') + ' required value="' + esc(r.capacity == null ? '' : r.capacity) + '"></div>' +
      '</div></div>' +
      '<div class="section"><div class="section-title">Примітка</div>' +
        '<textarea class="textarea" id="r-note" aria-label="Примітка"' + fld('note') + ' placeholder="Наприклад: проєктор, 12 комп’ютерів">' + esc(r.note || '') + '</textarea></div>' +
      (draft ? '<div class="section"><button type="button" class="btn btn-primary" id="r-create">Створити аудиторію</button></div>' : '') +
      ctx.danger({ title: 'Видалити аудиторію', text: 'Аудиторію буде видалено з довідника.', draftText: 'З’явиться у списку після натискання «Створити аудиторію».' });
  }

  function mount(el, r, ctx) {
    var name = el.querySelector('#r-name');
    name.addEventListener('input', function () {
      el.querySelector('#r-title').textContent = name.value.trim() || 'Нова аудиторія';
    });
    if (!ctx.isDraft) {
      var upd = function () {
        var sub = el.querySelector('#r-sub'), bld = el.querySelector('#r-bld'), cap = el.querySelector('#r-cap'), ty = el.querySelector('#r-type');
        if (!sub) return;
        var t = roomTypes.find(function (x) { return String(x.id) === ty.value; });
        var n = cap.value === '' ? 0 : Number(cap.value);
        sub.textContent = [bld.value.trim(), t ? t.name : typeName(r), seatsText(n)].filter(Boolean).join(' · ');
      };
      el.addEventListener('input', upd);
      el.addEventListener('change', upd);
      return;
    }
    // Draft: backend needs all four required fields at once, so create via an explicit button.
    var btn = el.querySelector('#r-create');
    function submit() {
      var bad = ['r-name', 'r-bld', 'r-type', 'r-cap'].filter(function (id) {
        var node = el.querySelector('#' + id), empty = node.value.trim() === '';
        node.classList.toggle('is-err', empty);
        return empty;
      });
      if (bad.length) {
        UI.toast('Заповніть назву, корпус, тип і місткість', { type: 'warn' });
        el.querySelector('#' + bad[0]).focus();
        return;
      }
      btn.disabled = true;
      ctx.save({
        title: name.value.trim(),
        building: el.querySelector('#r-bld').value.trim(),
        room_type: Number(el.querySelector('#r-type').value),
        capacity: Number(el.querySelector('#r-cap').value),
        note: el.querySelector('#r-note').value.trim()
      }).then(function () {
        UI.toast('Аудиторію створено', { type: 'ok' });
      }, function () { btn.disabled = false; });
    }
    btn.addEventListener('click', submit);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit(); }
    });
  }

  function saveRoom(r, ch) {
    var req = r.id == null ? apiRequest('/rooms/', 'POST', ch) : apiRequest('/rooms/' + r.id + '/', 'PATCH', ch);
    return req.then(function (saved) {
      if (ch.room_type != null) saved.room_type = ch.room_type;
      else if (saved.room_type_details) saved.room_type = saved.room_type_details.id;
      setTimeout(updateCounts, 0);
      return saved;
    });
  }

  /* ---------- room types ---------- */
  var typesEl = document.getElementById('room-types');

  function countFor(id) {
    return md ? md.items().filter(function (r) { return typeId(r) === id; }).length : 0;
  }
  function countText(n) { return n ? n + ' ' + plural(n, 'аудиторія', 'аудиторії', 'аудиторій') : 'Не використовується'; }
  function updateCounts() {
    typesEl.querySelectorAll('[data-rt-count]').forEach(function (s) {
      s.textContent = countText(countFor(Number(s.getAttribute('data-rt-count'))));
    });
  }

  function renderTypes() {
    typesEl.innerHTML =
      '<div class="card-head"><h2 class="card-title">Типи аудиторій</h2>' +
        '<span class="muted sm">' + roomTypes.length + ' ' + plural(roomTypes.length, 'тип', 'типи', 'типів') + '</span></div>' +
      '<p class="muted sm rt-hint">Назву й опис можна змінити прямо в рядку. Тип, який використовують аудиторії, видалити не вийде.</p>' +
      (roomTypes.length ? '<div class="rt-list">' + roomTypes.map(function (t) {
        return '<div class="rt-item" data-rt="' + esc(t.id) + '"><div class="rt-row">' +
          '<input class="input sm" data-rt-f="name" required maxlength="100" aria-label="Назва типу" value="' + esc(t.name) + '">' +
          '<input class="input sm" data-rt-f="description" maxlength="255" aria-label="Опис типу" placeholder="Опис" value="' + esc(t.description || '') + '">' +
          '<span class="rt-n" data-rt-count="' + esc(t.id) + '"></span>' +
          '<button type="button" class="icon-btn sm bare" data-rt-del aria-label="Видалити тип «' + esc(t.name) + '»">' + ic('trash', 16) + '</button>' +
        '</div><div class="danger"></div></div>';
      }).join('') + '</div>' : '<p class="muted">Типів поки немає. Додайте перший, щоб створювати аудиторії.</p>') +
      '<div class="rt-add"><input class="input" id="rt-new-name" maxlength="100" placeholder="Новий тип, напр. Лабораторна" aria-label="Назва нового типу">' +
        '<input class="input" id="rt-new-desc" maxlength="255" placeholder="Опис (необов’язково)" aria-label="Опис нового типу">' +
        '<button type="button" class="btn" id="rt-add">' + ic('plus', 16) + 'Додати тип</button></div>';
    updateCounts();
  }

  function typeById(id) { return roomTypes.find(function (t) { return t.id === id; }); }

  function afterTypesChange() {
    rebuildFilters();
    renderTypes();
    return md.reload();
  }

  typesEl.addEventListener('change', function (e) {
    var inp = e.target.closest('[data-rt-f]');
    if (!inp) return;
    var item = inp.closest('[data-rt]'), t = typeById(Number(item.getAttribute('data-rt')));
    var key = inp.getAttribute('data-rt-f'), v = inp.value.trim();
    if (!t || v === (t[key] || '')) return;
    if (key === 'name' && !v) { inp.value = t.name; UI.toast('Назва типу не може бути порожньою', { type: 'warn' }); return; }
    var body = {}; body[key] = v;
    apiRequest('/room_types/' + t.id + '/', 'PATCH', body).then(function (saved) {
      t[key] = saved[key] != null ? saved[key] : v;
      UI.toast('Тип оновлено', { type: 'ok' });
      if (key === 'name') afterTypesChange();
    }, function (err) {
      inp.value = t[key] || '';
      UI.toast(errText(err, 'Не вдалося зберегти тип'), { type: 'err' });
    });
  });

  typesEl.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    if (e.target.matches('[data-rt-f]')) { e.preventDefault(); e.target.blur(); }
    else if (e.target.id === 'rt-new-name' || e.target.id === 'rt-new-desc') { e.preventDefault(); addType(); }
  });

  typesEl.addEventListener('click', function (e) {
    if (e.target.closest('#rt-add')) { addType(); return; }
    var del = e.target.closest('[data-rt-del]');
    if (!del) return;
    var item = del.closest('[data-rt]'), t = typeById(Number(item.getAttribute('data-rt')));
    if (!t) return;
    var n = countFor(t.id);
    UI.confirmInline(item.querySelector('.danger'), {
      question: 'Видалити тип «' + t.name + '»?',
      warning: n ? 'Тип використовують аудиторії (' + n + '), тому сервер може відмовити.' : '',
      yes: 'Так, видалити',
      onYes: function () {
        return apiRequest('/room_types/' + t.id + '/', 'DELETE').then(function () {
          roomTypes = roomTypes.filter(function (x) { return x.id !== t.id; });
          UI.toast('Тип видалено', { type: 'ok' });
          return afterTypesChange();
        }, function (err) {
          // Backend answers a protected delete with an HTML 500, so give a readable reason instead.
          var readable = err && err.data && typeof err.data === 'object';
          UI.toast(readable ? errText(err) : 'Не вдалося видалити тип: його ще використовують аудиторії.', { type: 'err' });
        });
      }
    });
  });

  function addType() {
    var nameEl = document.getElementById('rt-new-name'), descEl = document.getElementById('rt-new-desc');
    var name = nameEl.value.trim();
    if (!name) { nameEl.classList.add('is-err'); nameEl.focus(); UI.toast('Введіть назву типу', { type: 'warn' }); return; }
    nameEl.classList.remove('is-err');
    var btn = document.getElementById('rt-add'); btn.disabled = true;
    apiRequest('/room_types/', 'POST', { name: name, description: descEl.value.trim() }).then(function (t) {
      roomTypes.push(t);
      roomTypes.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'uk'); });
      UI.toast('Тип додано', { type: 'ok' });
      return afterTypesChange();
    }).then(function () {
      var n = document.getElementById('rt-new-name'); if (n) n.focus();
    }, function (err) {
      btn.disabled = false;
      UI.toast(errText(err, 'Не вдалося додати тип'), { type: 'err' });
    });
  }

  /* ---------- controller ---------- */
  md = MasterDetail.create({
    root: '#rooms',
    title: 'Аудиторії',
    color: '--c1',
    searchPlaceholder: 'Пошук за номером, корпусом, типом',
    addLabel: 'Додати аудиторію',
    draftLabel: 'Нова аудиторія',
    emptyText: 'Аудиторій поки немає',
    removedText: 'Аудиторію видалено',
    removeQuestion: 'Точно видалити аудиторію?',
    countLabel: function (n) { return n + ' ' + plural(n, 'аудиторія', 'аудиторії', 'аудиторій'); },
    filters: { slice: function () { return filterList; } },
    load: function () {
      return Promise.all([apiRequest('/rooms/'), apiRequest('/room_types/')]).then(function (r) {
        roomTypes = list(r[1]).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'uk'); });
        rebuildFilters();
        var rooms = list(r[0]);
        rooms.forEach(function (x) { x.room_type = typeOf(x) ? typeOf(x).id : null; });
        setTimeout(renderTypes, 0);
        return rooms;
      });
    },
    sort: byTitle,
    groupBy: function (r) { return r.building ? 'Корпус ' + r.building : 'Без корпусу'; },
    search: function (r, q) {
      return [r.title, r.building, typeName(r), r.note].some(function (s) { return String(s || '').toLowerCase().indexOf(q) >= 0; });
    },
    renderRow: renderRow,
    renderDetail: renderDetail,
    mount: mount,
    onCreate: function () { return { title: '', building: '', capacity: null, room_type: null, note: '' }; },
    save: saveRoom,
    remove: function (r) { return apiRequest('/rooms/' + r.id + '/', 'DELETE').then(function () { setTimeout(updateCounts, 0); }); }
  });
})();
