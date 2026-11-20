/* Tests for assets/js/master-detail.js: ctx.load, ctx.queue, md.setScope, re-render flush. */

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
  var md = MasterDetail.create({
    root: root,
    search: false,
    debounce: 5,
    load: opts.load || function () { return Promise.resolve([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]); },
    renderRow: function (it) { return '<div class="name">' + it.name + '</div>'; },
    renderDetail: function (item, c) {
      renders.push(c);
      return '<div class="detail-body">' +
        '<input data-md-field="name" value="' + item.name + '">' +
        '<span data-md-saved hidden></span></div>' +
        c.danger(opts.danger || {});
    },
    save: opts.save || function (item, changes, c) {
      saves.push({ item: item, changes: changes, ctx: c });
      return Promise.resolve(Object.assign({}, item, changes));
    },
    remove: opts.remove || function (item) { removes.push(item); return Promise.resolve(); }
  });
  return delay(5).then(function () {
    return { root: root, md: md, renders: renders, saves: saves, removes: removes };
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
    save: function (item, changes) { order.push('save'); return saveGate.promise; }
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
