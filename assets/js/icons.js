/* Inline SVG icon set (Mosaic). Classic script: window.Icons, global ic(). */
(function () {
  var P = {
    home: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
    inbox: 'M3 13h5l1.5 3h5l1.5-3h5M5.5 5h13L21 13v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z',
    calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
    grid: 'M3 4h18v16H3zM3 10h18M3 15h18M9 4v16M15 4v16',
    user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
    users: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M16 3.5a4 4 0 010 7.5M18 14a6 6 0 014 7',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
    door: 'M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17M3 21h18M14 12h.01',
    book: 'M5 4h10a4 4 0 014 4v13H9a4 4 0 01-4-4zM5 17a4 4 0 014-4h10',
    clipboard: 'M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M9 11h6M9 15h4',
    ban: 'M12 21a9 9 0 100-18 9 9 0 000 18zM5.6 5.6l12.8 12.8',
    search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
    bell: 'M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 004 0',
    plus: 'M12 5v14M5 12h14',
    check: 'M5 12.5l4.5 4.5L19 7',
    alert: 'M12 9v4M12 17h.01M10.3 4.3L2.5 18a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z',
    x: 'M6 6l12 12M18 6L6 18',
    clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
    pin: 'M12 21s7-6 7-12a7 7 0 00-14 0c0 6 7 12 7 12zM12 11a2 2 0 100-4 2 2 0 000 4z',
    'chevron-right': 'M9 6l6 6-6 6',
    'chevron-left': 'M15 6l-6 6 6 6',
    'chevron-down': 'M6 9l6 6 6-6',
    sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    bolt: 'M13 3L4 14h7l-1 7 9-11h-7z',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
    link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
    download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    drag: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
    edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    menu: 'M4 7h16M4 12h16M4 17h16',
    sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
    external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
    lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4',
    tasks: 'M9 6h11M9 12h11M9 18h11M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2',
    semester: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4M8 15h8',
    streams: 'M6 3v6a4 4 0 004 4h4a4 4 0 004-4V3M12 13v8'
  };
  // Aliases: mockup short names and semantic names for old features / nav.
  var A = {
    chevR: 'chevron-right', chevL: 'chevron-left', chevD: 'chevron-down',
    close: 'x', import: 'upload', export: 'download',
    teachers: 'user', groups: 'users', rooms: 'door', subjects: 'book',
    'study-plans': 'clipboard', constraints: 'lock', schedule: 'grid'
  };
  var warned = {};
  var names = Object.keys(P).concat(Object.keys(A));

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function svg(name, opts) {
    if (typeof opts === 'string') opts = { cls: opts };
    opts = opts || {};
    var d = P[A[name] || name];
    if (!d) {
      if (!warned[name]) { warned[name] = 1; console.warn('Icons: unknown icon "' + name + '"'); }
      return '';
    }
    var size = opts.size || 18;
    var cls = 'icon' + (opts.cls ? ' ' + esc(opts.cls) : '');
    var a11y = opts.title ? 'role="img"' : 'aria-hidden="true"';
    var title = opts.title ? '<title>' + esc(opts.title) + '</title>' : '';
    return '<svg class="' + cls + '" width="' + size + '" height="' + size +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"' +
      ' stroke-linecap="round" stroke-linejoin="round" ' + a11y + '>' + title +
      '<path d="' + d + '"/></svg>';
  }

  window.Icons = { svg: svg, names: names };
  window.ic = svg;
})();
