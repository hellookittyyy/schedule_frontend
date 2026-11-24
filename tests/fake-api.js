/* Fake backend at the apiRequest seam (plan 0002 §3). Classic script: window.FakeApi.
   apiRequest is a top-level function in api.js, so assigning window.apiRequest replaces it
   for every bare apiRequest(...) call in the app's classic scripts. */
(function () {
  'use strict';

  var real = null;
  var installed = false;
  var routes = {};
  var calls = [];

  function fake(endpoint, method, body) {
    method = method || 'GET';
    calls.push({ method: method, endpoint: endpoint, body: body === undefined ? null : body });
    var key = method + ' ' + endpoint;
    if (!Object.prototype.hasOwnProperty.call(routes, key)) {
      return Promise.reject(new Error('FakeApi: no route for ' + key));
    }
    var handler = routes[key];
    return Promise.resolve().then(function () {
      return typeof handler === 'function' ? handler({ method: method, endpoint: endpoint, body: body }) : handler;
    });
  }

  function install() {
    if (!installed) {
      real = window.apiRequest;
      installed = true;
    }
    window.apiRequest = fake;
    calls.length = 0;
  }

  function uninstall() {
    if (installed && real) window.apiRequest = real;
    installed = false;
  }

  function reset() {
    routes = {};
    calls.length = 0;
    uninstall();
  }

  function route(key, handler) {
    routes[key] = handler;
  }

  function defer() {
    var resolve, reject;
    var promise = new Promise(function (res, rej) { resolve = res; reject = rej; });
    return { promise: promise, resolve: resolve, reject: reject };
  }

  window.FakeApi = {
    install: install,
    uninstall: uninstall,
    reset: reset,
    route: route,
    calls: calls,
    defer: defer
  };
})();
