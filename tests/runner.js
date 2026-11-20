/* Minimal browser test runner (plan 0002 phase 0). Classic script.
   window.test(name, fn) registers; tests run in registration order after load.
   The last marker is <pre id="test-summary">PASS p/t</pre> or FAIL plus one line per failure. */
(function () {
  'use strict';

  var tests = [];
  var results = [];
  var running = false;
  var finished = false;

  window.test = function (name, fn) {
    tests.push({ name: String(name), fn: fn });
  };

  window.assert = function (cond, message) {
    if (!cond) throw new Error(message || 'assertion failed');
  };

  window.assertEqual = function (actual, expected, message) {
    var a = JSON.stringify(actual);
    var e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error((message ? message + ': ' : '') + 'expected ' + e + ', got ' + a);
    }
  };

  window.delay = function (ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  };

  // Resolves true when `p` is still pending after `ms`, false once it settles.
  // The rejection handler is attached first, so a rejected promise never goes unhandled.
  window.notSettled = function (p, ms) {
    var settled = false;
    Promise.resolve(p).then(function () { settled = true; }, function () { settled = true; });
    return window.delay(ms).then(function () { return !settled; });
  };

  function errorMessage(err) {
    if (err && err.message) return String(err.message);
    return String(err);
  }

  function counts() {
    var passed = 0, failed = 0, failures = [];
    results.forEach(function (r) {
      if (r.status === 'pass') passed++;
      else if (r.status === 'fail') { failed++; failures.push({ name: r.name, message: r.message }); }
    });
    return { passed: passed, failed: failed, failures: failures };
  }

  function render() {
    var root = document.getElementById('tests');
    if (!root) return;
    var c = counts();
    var total = Math.max(tests.length, results.length);
    var head = (c.failed ? 'FAIL ' + c.failed : 'PASS ' + c.passed) + '/' + total;

    var pre = document.createElement('pre');
    pre.id = 'test-summary';
    var text = head;
    c.failures.forEach(function (f) { text += '\n- ' + f.name + ' — ' + f.message; });
    pre.textContent = text;

    var list = document.createElement('div');
    list.className = 't-list';
    results.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 't-row ' + r.status;
      var status = document.createElement('span');
      status.className = 't-status';
      status.textContent = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : '…';
      var name = document.createElement('span');
      name.className = 't-name';
      name.textContent = r.name;
      row.appendChild(status);
      row.appendChild(name);
      if (r.message) {
        var msg = document.createElement('div');
        msg.className = 't-msg';
        msg.textContent = r.message;
        row.appendChild(msg);
      }
      list.appendChild(row);
    });

    root.innerHTML = '';
    root.style.color = c.failed ? 'var(--high)' : 'var(--ok)';
    root.appendChild(pre);
    root.appendChild(list);

    document.title = head;
    window.__testResult = {
      ok: finished && c.failed === 0 && c.passed === total && total > 0,
      passed: c.passed,
      total: total,
      failures: c.failures
    };
  }

  function addFailure(name, message) {
    results.push({ name: name, status: 'fail', message: message });
  }

  function finish() {
    if (finished) return;
    finished = true;
    running = false;
    render();
  }

  function setResult(index, test, ok, err) {
    results[index] = {
      name: test.name,
      status: ok ? 'pass' : 'fail',
      message: ok ? '' : errorMessage(err)
    };
    render();
  }

  function next(i) {
    if (finished) return;
    if (i >= tests.length) { finish(); return; }
    var test = tests[i];
    var p;
    try {
      p = Promise.resolve(test.fn());
    } catch (err) {
      p = Promise.reject(err);
    }
    p.then(function () {
      setResult(i, test, true);
      next(i + 1);
    }, function (err) {
      setResult(i, test, false, err);
      next(i + 1);
    });
  }

  function run() {
    if (running || finished) return;
    running = true;
    finished = false;
    results = [];
    tests.forEach(function (t) {
      results.push({ name: t.name, status: 'pending', message: '' });
    });
    render();
    try {
      next(0);
    } catch (err) {
      addFailure('runner', errorMessage(err));
      finish();
    }
  }

  // An exception outside a test (a stray listener, a broken timeout) still yields a FAIL marker.
  window.addEventListener('error', function (e) {
    if (!running || finished) return;
    addFailure('unexpected', e && e.message ? e.message : 'uncaught error');
    finish();
  });

  if (document.readyState === 'complete') setTimeout(run, 0);
  else window.addEventListener('load', run);
})();
