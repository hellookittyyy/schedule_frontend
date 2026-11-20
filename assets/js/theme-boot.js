/* Sets data-theme before first paint; load synchronously in <head>. */
(function () {
  var KEY = 'theme';
  function read() {
    try { var v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark') return v; } catch (e) {}
    return null;
  }
  function system() {
    try { return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }
  function apply(t) { document.documentElement.dataset.theme = t; }
  function get() { return document.documentElement.dataset.theme || read() || system(); }
  function set(t) {
    if (t !== 'light' && t !== 'dark') return;
    try { localStorage.setItem(KEY, t); } catch (e) {}
    apply(t);
  }
  function toggle() { var t = get() === 'dark' ? 'light' : 'dark'; set(t); return t; }
  try { apply(read() || system()); } catch (e) {}
  window.Theme = { get: get, set: set, toggle: toggle };
})();
