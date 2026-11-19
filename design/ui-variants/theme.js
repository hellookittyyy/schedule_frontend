/* Light / dark theme for variants 9–13.
   initTheme(key)  — call BEFORE renderApp (sets data-theme early, no flash)
   mountThemeToggle(key) — call AFTER renderApp (adds the toggle buttons)   */
(function () {
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const root = document.documentElement;
  const SUN = '<svg class="icon" viewBox="0 0 24 24"><path d="M12 17a5 5 0 100-10 5 5 0 000 10zM12 1.5v2M12 20.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M1.5 12h2M20.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/></svg>';
  const MOON = '<svg class="icon" viewBox="0 0 24 24"><path d="M20.5 13.2A8.5 8.5 0 1110.8 3.5a6.6 6.6 0 009.7 9.7z"/></svg>';

  window.initTheme = (key) => {
    root.dataset.theme = new URLSearchParams(location.search).get('t') || get(key) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  };
  window.mountThemeToggle = (key) => {
    const btn = '<button class="icon-btn theme-btn" aria-label="Перемкнути тему"></button>';
    document.querySelectorAll('.topbar .search').forEach((s) => s.insertAdjacentHTML('afterend', btn));
    document.querySelector('.pub-head .btn')?.insertAdjacentHTML('beforebegin', btn);
    document.body.insertAdjacentHTML('beforeend', '<div class="pal"><button data-th="light">Світла</button><button data-th="dark">Темна</button></div>');
    const sync = () => {
      const dark = root.dataset.theme === 'dark';
      document.querySelectorAll('.theme-btn').forEach((b) => { b.innerHTML = dark ? SUN : MOON; b.title = dark ? 'Світла тема' : 'Темна тема'; });
      document.querySelectorAll('[data-th]').forEach((b) => b.classList.toggle('on', b.dataset.th === root.dataset.theme));
    };
    document.addEventListener('click', (e) => {
      if (e.target.closest('.theme-btn')) { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; set(key, root.dataset.theme); }
      const t = e.target.closest('[data-th]'); if (t) { root.dataset.theme = t.dataset.th; set(key, t.dataset.th); }
      sync();
    });
    sync();
  };
})();
