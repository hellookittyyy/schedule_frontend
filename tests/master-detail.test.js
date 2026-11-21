/* Tests for assets/js/master-detail.js: ctx.load, ctx.queue, md.setScope, re-render flush, Draft lifecycle. */

function defer() {
  var d = {};
  d.promise = new Promise(function (resolve, reject) { d.resolve = resolve; d.reject = reject; });
  return d;
}

function cleanup(root) {
  if (root && root.parentNode) root.parentNode.removeChild(root);
  var toasts = document.querySelector('.toasts');
  if (toasts && toasts.parentNode) toasts.parentNode.removeChild(toasts);
  var u = new URL(window.location.href);
  ['id', 'filter'].forEach(function (k) { u.searchParams.delete(k); });
  history.replaceState(null, '', u.href);
}

// Mounts the module into a fresh fixture and resolves after the initial load.
function mount(opts) {
  opts = opts || {};
  var root = document.createElement('div');
  document.body.appendChild(root);
  var renders = [];
  var saves = [];
  var removes = [];
  var creates = [];
  var md = MasterDetail.create({
    root: root,
    search: false,
    debounce: 5,
    load: opts.load || function () { return Promise.resolve([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]); },
    renderRow: function (it) { return '<div class="name">' + it.name + '</div>'; },
    renderDetail: function (item, c) {
      renders.push(c);
      return '<div class="detail-body">' +
        '<input id="f-name" data-md-field="name" required value="' + (item.name || '') + '">' +
        '<input id="f-note" data-md-field="note" value="' + (item.note || '') + '">' +
        '<span data-md-saved hidden></span></div>' +
        c.danger(opts.danger || {});
    },
    newItem: function () { return { name: '', note: '' }; },
    canCreate: opts.canCreate,
    create: function (values, item) {
      creates.push(values);
      if (opts.create) return opts.create(values, item);
      return Promise.resolve(Object.assign({ id: 100 + creates.length }, values));
    },
    update: opts.update || function (item, changes, c) {
      saves.push({ item: item, changes: changes, ctx: c });
      return Promise.resolve(Object.assign({}, item, changes));
    },
    remove: opts.remove || function (item) { removes.push(item); return Promise.resolve(); }
  });
  return delay(5).then(function () {
    return { root: root, md: md, renders: renders, saves: saves, removes: removes, creates: creates };
  });
}

test('ctx.load: a held load settled after selecting another record does not call back', async function () {
  var m = await mount();
  try {
    var d = defer();
    var called = false;
    var p = m.renders[0].load(d.promise).then(function () { called = true; });
    m.md.select('2');
    d.resolve('late');
    await delay(20);
    assert(!called, 'stale load must not call back');
    assert(await notSettled(p, 20), 'stale load must never settle');
  } finally { cleanup(m.root); }
});

test('ctx.load: a held load settled after setScope does not call back', async function () {
  var m = await mount();
  try {
    var c = m.renders[0];
    var d = defer();
    var called = false;
    var p = c.load(d.promise).then(function () { called = true; });
    m.md.setScope('s2');
    d.resolve('late');
    await delay(20);
    assert(!called, 'load from the old scope must not call back');
    assert(await notSettled(p, 20), 'load from the old scope must never settle');
    assertEqual(c.alive(), false, 'old render must be dead after setScope');
  } finally { cleanup(m.root); }
});

test('ctx.load: a load resolved in time calls back with the value', async function () {
  var m = await mount();
  try {
    var p = m.renders[0].load(Promise.resolve('ok'));
    assertEqual(await p, 'ok');
  } finally { cleanup(m.root); }
});

test('ctx.queue: two ops and a field autosave run in the queue order', async function () {
  var saveGate = defer(), op1Gate = defer(), op2Gate = defer();
  var order = [];
  var m = await mount({
    update: function (item, changes) { order.push('save'); return saveGate.promise; }
  });
  try {
    var c = m.renders[0];
    var input = m.root.querySelector('[data-md-field="name"]');
    input.value = 'X';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await delay(15);
    assertEqual(order, ['save'], 'autosave must start first');

    var p1 = c.queue(function () { order.push('op1'); return op1Gate.promise; });
    var p2 = c.queue(function () { order.push('op2'); return op2Gate.promise; });
    await delay(5);
    assertEqual(order, ['save'], 'ops wait for the held save');

    saveGate.resolve({ id: 1, name: 'X' });
    await delay(5);
    assertEqual(order, ['save', 'op1'], 'op1 runs after the save');

    op1Gate.resolve('one');
    await delay(5);
    assertEqual(order, ['save', 'op1', 'op2'], 'op2 runs after op1');

    op2Gate.resolve('two');
    await Promise.all([p1, p2]);
  } finally { cleanup(m.root); }
});

test('ctx.queue: a failing op shows an error and the next op still runs', async function () {
  var m = await mount();
  try {
    var c = m.renders[0];
    var failed = c.queue(function () { return Promise.reject(new Error('boom')); });
    failed.catch(function () {});
    var ran = false;
    var p = c.queue(function () { ran = true; return Promise.resolve('ok'); });
    await p;
    await failed.catch(function () {});
    assert(ran, 'the op after a failure must run');
    assert(document.querySelector('.toast.is-err'), 'a failing op shows an error toast');
  } finally { cleanup(m.root); }
});

test('ctx.queue: an op that catches its own error ends the chip «Збережено»', async function () {
  var m = await mount();
  try {
    var c = m.renders[0];
    await c.queue(function () {
      return Promise.reject(new Error('x')).catch(function () {});
    });
    var el = m.root.querySelector('[data-md-saved]');
    assert(!el.hidden, 'chip must be visible');
    assert(el.textContent.indexOf('Збережено') >= 0, 'chip must read «Збережено»');
  } finally { cleanup(m.root); }
});

test('ctx.queue: the chip ends «Збережено» only when the batch had no failure', async function () {
  var m = await mount();
  try {
    var c = m.renders[0];
    var failed = c.queue(function () { return Promise.reject(new Error('boom')); });
    failed.catch(function () {});
    await c.queue(function () { return Promise.resolve('ok'); });
    await failed.catch(function () {});
    var el = m.root.querySelector('[data-md-saved]');
    assertEqual(el.hidden, true, 'chip is hidden after a failed batch');
    assert(el.textContent.indexOf('Збережено') < 0, 'chip must not read «Збережено»');
  } finally { cleanup(m.root); }
});

test('ctx.queue: DELETE waits for a pending queued op', async function () {
  var order = [];
  var gate = defer();
  var m = await mount({
    danger: { title: 'Видалити' },
    remove: function () { order.push('remove'); return Promise.resolve(); }
  });
  try {
    var c = m.renders[0];
    var p = c.queue(function () { order.push('op'); return gate.promise; });

    m.root.querySelector('[data-confirm]').click();
    m.root.querySelector('.confirm .btn-danger').click();
    await delay(5);
    assertEqual(order, ['op'], 'remove must wait for the queued op');

    gate.resolve('done');
    await p;
    await delay(15);
    assertEqual(order, ['op', 'remove'], 'remove runs last');
  } finally { cleanup(m.root); }
});

test('md.rerender(): a field mid-debounce is saved by the re-render', async function () {
  var m = await mount();
  try {
    var input = m.root.querySelector('[data-md-field="name"]');
    input.value = 'X';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    m.md.rerender();
    await delay(20);
    assertEqual(m.saves.length, 1, 'exactly one save');
    assertEqual(m.saves[0].changes, { name: 'X' });
  } finally { cleanup(m.root); }
});

/* ---------- Draft lifecycle (plan 0002 §4.4) ---------- */

function field(m, key) { return m.root.querySelector('[data-md-field="' + key + '"]'); }
function type(el, v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
function blur(el) {
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}
function last(m) { return m.renders[m.renders.length - 1]; }

test('Draft: a change with a required field empty sends nothing', async function () {
  var m = await mount();
  try {
    m.md.startDraft();
    type(field(m, 'note'), 'x');
    blur(field(m, 'note'));
    await delay(10);
    assertEqual(m.creates.length, 0, 'no create');
    assert(m.root.querySelector('.md-row.is-draft'), 'Draft row stays');
  } finally { cleanup(m.root); }
});

test('Draft: filling the last required field and blurring sends one create with all values', async function () {
  var m = await mount();
  try {
    m.md.startDraft();
    type(field(m, 'note'), 'x');
    type(field(m, 'name'), 'N');
    blur(field(m, 'name'));
    await delay(10);
    assertEqual(m.creates, [{ name: 'N', note: 'x' }]);
    assert(!m.root.querySelector('.md-row.is-draft'), 'Draft row is gone');
    assert(m.root.querySelector('.md-row[data-md-id="101"].is-active'), 'the new record is selected');
    assertEqual(last(m).isDraft, false, 'detail re-rendered as saved');
  } finally { cleanup(m.root); }
});

test('Draft: ctx.save creates when canCreate passes and sends nothing when it fails', async function () {
  var m = await mount({ canCreate: function (v) { return v.ok ? true : 'Need ok'; } });
  try {
    m.md.startDraft();
    var c = last(m);
    await c.save({ other: 1 });
    assertEqual(m.creates.length, 0, 'failing canCreate sends nothing');
    assertEqual(m.root.querySelector('[data-md-draft] .muted').textContent, 'Need ok', 'shows what is missing');
    await c.save({ ok: 1 });
    await delay(10);
    assertEqual(m.creates.length, 1, 'one create');
    assertEqual(m.creates[0].ok, 1);
    assertEqual(m.creates[0].other, 1, 'earlier ctx.save changes are kept in the values');
  } finally { cleanup(m.root); }
});

test('Draft: typing during a held create sends one update with the typed value', async function () {
  var gate = defer();
  var m = await mount({ create: function () { return gate.promise; } });
  try {
    m.md.startDraft();
    type(field(m, 'name'), 'N');
    blur(field(m, 'name'));
    type(field(m, 'note'), 'late');
    blur(field(m, 'note'));
    await delay(5);
    assertEqual(m.creates.length, 1, 'no second create while one is in flight');
    gate.resolve({ id: 9, name: 'N', note: '' });
    await delay(20);
    assertEqual(m.saves.length, 1, 'one update');
    assertEqual(m.saves[0].changes, { note: 'late' });
    assertEqual(field(m, 'note').value, 'late', 'typed value shown after re-render');
  } finally { cleanup(m.root); }
});

test('Draft: a ctx.queue op during a held create runs after it with the id, before the re-render', async function () {
  var gate = defer();
  var m = await mount({ create: function () { return gate.promise; } });
  try {
    m.md.startDraft();
    var c = last(m);
    type(field(m, 'name'), 'N');
    blur(field(m, 'name'));
    var seen = null;
    var p = c.queue(function () { seen = { id: c.item.id, renders: m.renders.length }; return Promise.resolve(); });
    var before = m.renders.length;
    await delay(5);
    assertEqual(seen, null, 'op waits for the create');
    gate.resolve({ id: 9, name: 'N', note: '' });
    await p;
    assertEqual(seen, { id: 9, renders: before }, 'op sees the id and runs before the re-render');
    await delay(10);
    assertEqual(m.renders.length, before + 1, 'one re-render after the op');
    assertEqual(last(m).isDraft, false);
  } finally { cleanup(m.root); }
});

test('Draft: a ctx.queue op before any create is held until Promotion', async function () {
  var m = await mount();
  try {
    m.md.startDraft();
    var c = last(m);
    var seen = null;
    var p = c.queue(function () { seen = c.item.id; return Promise.resolve('ok'); });
    await delay(10);
    assertEqual(seen, null, 'held');
    type(field(m, 'name'), 'N');
    blur(field(m, 'name'));
    assertEqual(await p, 'ok');
    assertEqual(seen, 101, 'runs with the new id');
  } finally { cleanup(m.root); }
});

test('Draft: a held ctx.queue op is dropped when the Draft is discarded', async function () {
  var m = await mount();
  try {
    m.md.startDraft();
    var c = last(m);
    var ran = false;
    var p = c.queue(function () { ran = true; return Promise.resolve(); });
    m.root.querySelector('[data-md-discard]').click();
    await delay(10);
    assert(!ran, 'op never runs');
    assert(await notSettled(p, 10), 'op promise never settles');
    assert(!m.root.querySelector('.md-row.is-draft'), 'Draft is gone');
  } finally { cleanup(m.root); }
});

test('Draft: focus and caret stay in the same field after Promotion', async function () {
  var gate = defer();
  var m = await mount({ create: function () { return gate.promise; } });
  try {
    m.md.startDraft();
    type(field(m, 'name'), 'N');
    var note = field(m, 'note');
    note.focus();
    blur(field(m, 'name'));
    type(note, 'abc');
    note.setSelectionRange(1, 1);
    gate.resolve({ id: 9, name: 'N', note: '' });
    await delay(20);
    assertEqual(last(m).isDraft, false, 're-rendered');
    assertEqual(document.activeElement && document.activeElement.id, 'f-note', 'focus kept');
    assertEqual(document.activeElement.selectionStart, 1, 'caret kept');
  } finally { cleanup(m.root); }
});

test('Draft: a failed create keeps the Draft and a later change retries', async function () {
  var n = 0;
  var m = await mount({ create: function (v) { n++; return n === 1 ? Promise.reject(new Error('boom')) : Promise.resolve(Object.assign({ id: 9 }, v)); } });
  try {
    m.md.startDraft();
    type(field(m, 'name'), 'N');
    blur(field(m, 'name'));
    await delay(10);
    assert(m.root.querySelector('.md-row.is-draft'), 'Draft stays after a failure');
    assert(document.querySelector('.toast.is-err'), 'error toast');
    type(field(m, 'name'), 'N2');
    blur(field(m, 'name'));
    await delay(10);
    assertEqual(m.creates.length, 2, 'retried');
    assertEqual(m.creates[1].name, 'N2');
    assert(!m.root.querySelector('.md-row.is-draft'), 'promoted');
  } finally { cleanup(m.root); }
});

test('Draft: md.rerender() keeps typed values', async function () {
  var m = await mount();
  try {
    m.md.startDraft();
    type(field(m, 'name'), 'abc');
    type(field(m, 'note'), 'zz');
    m.md.rerender();
    assertEqual(last(m).isDraft, true);
    assertEqual(field(m, 'name').value, 'abc');
    assertEqual(field(m, 'note').value, 'zz');
    await delay(10);
    assertEqual(m.creates.length, 0, 'a re-render does not create');
  } finally { cleanup(m.root); }
});

test('Draft: discarded while the create is held, the record joins the list unselected', async function () {
  var gate = defer();
  var m = await mount({ create: function () { return gate.promise; } });
  try {
    m.md.startDraft();
    type(field(m, 'name'), 'N');
    blur(field(m, 'name'));
    m.root.querySelector('[data-md-discard]').click();
    gate.resolve({ id: 9, name: 'N', note: '' });
    await delay(20);
    assert(m.md.items().some(function (x) { return x.id === 9; }), 'record is in the list');
    assert(m.root.querySelector('.md-row[data-md-id="9"]'), 'row is shown');
    assert(!m.root.querySelector('.md-row[data-md-id="9"].is-active'), 'not selected');
    assert(new URLSearchParams(window.location.search).get('id') !== '9', 'URL does not point at it');
  } finally { cleanup(m.root); }
});
