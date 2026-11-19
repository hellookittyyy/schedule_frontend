/* «Предмети»: master–detail (assets/js/master-detail.js). */
(function () {
  'use strict';

  var esc = UI.escapeHtml;
  function ic(name, size) { return Icons.svg(name, { size: size || 16 }); }

  var teachers = [];
  var semesters = [];
  var md;

  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  function list(r) { return (r && r.results) || r || []; }
  function byName(a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'uk'); }
  function teachersOf(s) {
    return teachers.filter(function (t) {
      return (t.subjects_details || []).some(function (x) { return x.id === s.id; });
    }).sort(byName);
  }
  function semName(id) {
    var s = semesters.find(function (x) { return String(x.id) === String(id); });
    return s ? s.name : '';
  }
  function teachersText(n) { return n ? n + ' ' + plural(n, 'викладач', 'викладачі', 'викладачів') : 'Без викладача'; }

  function renderRow(s) {
    var tt = teachersOf(s);
    return '<div class="grow"><div class="name">' + esc(s.name) + '</div>' +
      '<div class="meta">' + (tt.length ? esc(tt.map(function (t) { return t.name; }).join(', ')) : 'Без викладача') + '</div></div>' +
      '<span class="num">' + tt.length + '</span>';
  }

  function renderDetail(s, ctx) {
    var draft = ctx.isDraft;
    var tt = draft ? [] : teachersOf(s);
    return '' +
      '<div class="detail-head">' +
        '<div class="grow"><h2 class="detail-name" id="s-title">' + esc(s.name || 'Новий предмет') + '</h2>' +
        (draft ? '' : '<div class="muted">' + esc(teachersText(tt.length)) + '</div>') + '</div>' +
        '<span class="saved" data-md-saved hidden></span>' +
      '</div>' +
      '<div class="section"><div class="section-title">Основне</div>' +
        '<div class="fields">' +
          '<label class="f-label" for="s-name">Назва</label>' +
          '<div class="f-value"><input class="input" id="s-name" data-md-field="name" required autocomplete="off" ' +
            'placeholder="Наприклад: Програмування" value="' + esc(s.name || '') + '"></div>' +
          '<label class="f-label" for="s-desc">Опис</label>' +
          '<div class="f-value"><textarea class="textarea" id="s-desc" rows="4" data-md-field="description" ' +
            'placeholder="Необов’язково">' + esc(s.description || '') + '</textarea></div>' +
        '</div></div>' +
      (draft ? '' :
        '<div class="section"><div class="section-title">Викладачі</div>' +
          (tt.length
            ? '<div class="chips">' + tt.map(function (t) {
                return '<a class="chip link" href="/admin/teachers/?id=' + esc(t.id) + '">' + esc(t.name) + ic('chevR', 12) + '</a>';
              }).join('') + '</div>'
            : '<span class="muted sm">Жоден викладач не веде цей предмет</span>') +
          '<p class="muted sm mt">Призначення змінюється на сторінці викладача.</p></div>' +
        '<div class="section" id="s-plans-sec" hidden><div class="section-title">Де використовується</div>' +
          '<div id="s-plans"></div></div>') +
      ctx.danger({ title: 'Видалити предмет', text: 'Разом із предметом буде видалено навчальні плани, що його використовують.' });
  }

  function mount(el, s, ctx) {
    var name = el.querySelector('#s-name');
    name.addEventListener('input', function () {
      el.querySelector('#s-title').textContent = name.value.trim() || 'Новий предмет';
    });
    if (ctx.isDraft) {
      // Hold draft autosave until the name is filled; save() then reads both fields.
      var fields = el.querySelector('.fields');
      var hold = function (e) { if (!ctx.item.id && name.value.trim() === '') e.stopPropagation(); };
      ['change', 'focusout'].forEach(function (t) { fields.addEventListener(t, hold, true); });
      fields.addEventListener('keydown', function (e) { if (e.key === 'Enter') hold(e); }, true);
      return;
    }
    apiRequest('/study_plans/?subject=' + encodeURIComponent(s.id)).then(function (plans) {
      if (!ctx.alive()) return;
      plans = list(plans);
      if (!plans.length) return;
      var seen = {}, rows = [];
      plans.forEach(function (p) {
        var key = (p.group ? 'g' + p.group : 's' + p.stream) + '|' + p.semester;
        if (seen[key]) return;
        seen[key] = true;
        rows.push({
          href: p.group ? '/admin/groups/?id=' + p.group : '/admin/streams/?id=' + p.stream,
          name: p.group ? p.group_name : p.stream_name, stream: !p.group, sem: semName(p.semester)
        });
      });
      rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'uk'); });
      el.querySelector('#s-plans').innerHTML = '<div class="chips">' + rows.map(function (g) {
        return '<a class="chip link" href="' + esc(g.href) + '">' + esc(g.name) +
          (g.stream ? ' <span class="muted">потік</span>' : '') +
          (g.sem ? ' <span class="muted">' + esc(g.sem) + '</span>' : '') + ic('chevR', 12) + '</a>';
      }).join('') + '</div>';
      el.querySelector('#s-plans-sec').hidden = false;
    }, function () { /* section stays hidden */ });
  }

  md = MasterDetail.create({
    root: '#subjects',
    title: 'Предмети',
    color: '--c3',
    searchPlaceholder: 'Пошук предмета',
    addLabel: 'Додати предмет',
    draftLabel: 'Новий предмет',
    emptyText: 'Предметів поки немає',
    removedText: 'Предмет видалено',
    removeQuestion: 'Точно видалити предмет?',
    countLabel: function (n) { return n + ' ' + plural(n, 'предмет', 'предмети', 'предметів'); },
    load: function () {
      return Promise.all([
        apiRequest('/subjects/'),
        apiRequest('/teachers/').catch(function () { UI.toast('Не вдалося завантажити викладачів', { type: 'warn' }); return []; }),
        apiRequest('/semesters/').catch(function () { return []; })
      ]).then(function (r) {
        teachers = list(r[1]);
        semesters = list(r[2]);
        return list(r[0]);
      });
    },
    sort: byName,
    search: function (s, q) {
      return String(s.name || '').toLowerCase().indexOf(q) >= 0 ||
        String(s.description || '').toLowerCase().indexOf(q) >= 0;
    },
    filters: [{ id: 'no-teacher', label: 'Без викладача', test: function (s) { return !teachersOf(s).length; } }],
    renderRow: renderRow,
    renderDetail: renderDetail,
    mount: mount,
    onCreate: function () { return { name: '', description: '' }; },
    save: function (s, ch) {
      if (s.id == null) {
        var q = function (k) { return document.querySelector('#subjects [data-md-field="' + k + '"]'); };
        var name = q('name') ? q('name').value.trim() : (ch.name || '');
        if (!name) return Promise.reject(new Error('Вкажіть назву предмета'));
        return apiRequest('/subjects/', 'POST', { name: name, description: q('description') ? q('description').value.trim() : (ch.description || '') });
      }
      return apiRequest('/subjects/' + s.id + '/', 'PUT', {
        name: ch.name != null ? ch.name : s.name,
        description: ch.description != null ? ch.description : (s.description || '')
      });
    },
    remove: function (s) { return apiRequest('/subjects/' + s.id + '/', 'DELETE'); }
  });
})();
