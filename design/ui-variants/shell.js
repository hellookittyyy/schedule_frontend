/* =====================================================================
   Shared screen markup for the 5 UI variants.
   The UX structure is fixed (chosen combination):
     · Admin home      = task inbox + readiness  (UX v5)
     · Directories     = list + detail, no modals (UX v4)
     · Semester        = step checklist + preflight (UX v1, simplified)
     · Public          = search + "my schedule" + now/next (UX v2 + v5)
   Each variant page only supplies CSS (the visual layer) and calls
   renderApp({ name }). Structural CSS lives here; themes style the look.
   ===================================================================== */
(function () {
  const P = {
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
    chevR: 'M9 6l6 6-6 6', chevL: 'M15 6l-6 6 6 6', chevD: 'M6 9l6 6 6-6',
    sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    bolt: 'M13 3L4 14h7l-1 7 9-11h-7z',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
    link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  };
  const ic = (n, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[n]}"/></svg>`;

  /* ---------- mock data ---------- */
  const PAIRS = [['08:30', '09:50'], ['10:00', '11:20'], ['11:40', '13:00'], ['13:30', '14:50'], ['15:00', '16:20']];
  const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const DAYS_FULL = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П’ятниця', 'Субота'];
  const TYPE = { lec: 'Лекція', pr: 'Практика', lab: 'Лабораторна' };
  const LESSONS = [
    [0, 0, 'Бази даних', 'lec', 'Коваленко О. П.', '301'], [0, 1, 'Бази даних', 'lab', 'Мельник А. В.', 'Лаб-2'], [0, 2, 'Вища математика', 'pr', 'Шевченко Т. І.', '214'],
    [1, 1, 'Алгоритми та структури даних', 'lec', 'Бондар С. М.', 'Ауд. 1'], [1, 2, 'Англійська мова', 'pr', 'Ткаченко Л. О.', '118'],
    [2, 0, 'Операційні системи', 'lec', 'Кравчук Д. Ю.', '301'], [2, 1, 'Веб-технології', 'lab', 'Мельник А. В.', 'Лаб-4'], [2, 2, 'Веб-технології', 'lab', 'Мельник А. В.', 'Лаб-4'],
    [3, 1, 'Комп’ютерні мережі', 'lec', 'Олійник В. Р.', 'Ауд. 2'], [3, 2, 'Алгоритми та структури даних', 'pr', 'Бондар С. М.', '207'], [3, 3, 'Вища математика', 'lec', 'Шевченко Т. І.', 'Ауд. 1'],
    [4, 0, 'Операційні системи', 'lab', 'Кравчук Д. Ю.', 'Лаб-1'], [4, 1, 'Комп’ютерні мережі', 'pr', 'Олійник В. Р.', '210'],
  ].map(([d, p, s, t, tc, r]) => ({ d, p, s, t, tc, r }));
  const TEACHERS = [
    { n: 'Коваленко Олена Петрівна', dep: 'Кафедра комп’ютерних наук', subj: ['Бази даних', 'Інформаційні системи'], load: 16, max: 20, st: 'active', groups: ['КН-31', 'КН-32', 'Потік КН-3'], off: [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4]] },
    { n: 'Мельник Андрій Вікторович', dep: 'Кафедра програмної інженерії', subj: ['Веб-технології', 'Бази даних'], load: 22, max: 22, st: 'active', groups: ['КН-31', 'ПІ-21'], off: [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4]] },
    { n: 'Шевченко Тетяна Іванівна', dep: 'Кафедра вищої математики', subj: ['Вища математика'], load: 12, max: 18, st: 'active', groups: ['КН-31', 'КН-21'], off: [] },
    { n: 'Бондар Сергій Миколайович', dep: 'Кафедра комп’ютерних наук', subj: ['Алгоритми', 'Дискретна математика'], load: 18, max: 20, st: 'active', groups: ['КН-31', 'КН-32'], off: [[0, 3], [0, 4]] },
    { n: 'Ткаченко Лариса Олегівна', dep: 'Кафедра іноземних мов', subj: ['Англійська мова'], load: 10, max: 24, st: 'active', groups: ['Потік Англ-Б2'], off: [[0, 0], [0, 1]] },
    { n: 'Кравчук Дмитро Юрійович', dep: 'Кафедра комп’ютерних наук', subj: [], load: 8, max: 18, st: 'leave', groups: ['КН-31'], off: [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]] },
    { n: 'Олійник Віктор Романович', dep: 'Кафедра мереж', subj: ['Комп’ютерні мережі', 'Кібербезпека'], load: 14, max: 20, st: 'active', groups: ['КН-31', 'ПІ-41'], off: [] },
  ];
  const initials = (n) => n.split(' ').slice(0, 2).map((w) => w[0]).join('');

  /* ---------- structural CSS (layout only, no look) ---------- */
  const BASE = `
  *{box-sizing:border-box}body{margin:0}button,input,select{font:inherit;color:inherit}
  .icon{width:18px;height:18px;flex:none;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
  .app{display:grid;grid-template-columns:var(--nav-w,236px) minmax(0,1fr);min-height:100vh}
  body[data-screen="pub"] .app{display:none}body:not([data-screen="pub"]) .pub-wrap{display:none}
  .nav{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;overflow:auto}
  .nav-item{display:flex;align-items:center;gap:10px;cursor:pointer;text-decoration:none;white-space:nowrap}
  .nav-count{margin-left:auto}.nav-foot{margin-top:auto}
  .main{min-width:0;display:flex;flex-direction:column}
  .screen{display:none}.screen.is-on{display:block}
  .topbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.sp{flex:1}
  .search{display:flex;align-items:center;gap:8px}.search input{border:0;background:none;outline:none;min-width:0;flex:1}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;white-space:nowrap}
  .icon-btn{display:inline-grid;place-items:center;cursor:pointer}
  .avatar{display:inline-grid;place-items:center;flex:none}
  .seg{display:inline-flex}.seg button{cursor:pointer;border:0}
  .card-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .progress{overflow:hidden}.progress>i{display:block;height:100%}
  .home-top{display:grid;grid-template-columns:1.35fr repeat(3,1fr);gap:var(--gap,16px)}
  .home{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:var(--gap,16px);align-items:start}
  .col{display:flex;flex-direction:column;gap:var(--gap,16px);min-width:0}
  .task{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center}
  .task-fix{grid-column:2/-1;display:none}.task.is-open .task-fix{display:block}
  .fix-opt{display:flex;align-items:center;gap:10px;cursor:pointer}
  .today-row{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:10px;align-items:center}
  .heat{display:grid;grid-template-columns:22px repeat(6,1fr);gap:3px}.heat i{display:block;aspect-ratio:1.6}
  .md{display:grid;grid-template-columns:330px minmax(0,1fr);min-height:620px}
  .md-list{display:flex;flex-direction:column;min-width:0}.md-rows{flex:1;overflow:auto}
  .md-row{display:flex;align-items:center;gap:10px;cursor:pointer}
  .md-row .grow{min-width:0;flex:1}.md-row .name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .chips{display:flex;flex-wrap:wrap;gap:6px}.chip{display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap}
  .md-detail{min-width:0}.detail-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
  .fields{display:grid;grid-template-columns:160px minmax(0,1fr);align-items:center}
  .avail{display:grid;grid-template-columns:48px repeat(6,1fr);gap:3px}.avail .c{cursor:pointer;height:28px}
  .steps{display:grid;grid-template-columns:repeat(6,minmax(0,1fr))}
  .step{display:flex;flex-direction:column;gap:2px;min-width:0}
  .sem{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:var(--gap,16px);align-items:start}
  .check{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center}
  .grp-row{display:grid;grid-template-columns:70px minmax(0,1fr) 54px;gap:10px;align-items:center}
  .pub-wrap{min-height:100vh}.pub{max-width:560px;margin:0 auto}
  .pub-head{display:flex;align-items:center;gap:10px}
  .daystrip{display:grid;grid-template-columns:repeat(6,1fr)}.day{cursor:pointer;text-align:center}
  .lesson{display:grid;grid-template-columns:66px minmax(0,1fr) auto;gap:12px;align-items:center}
  .now-meta{display:flex;flex-wrap:wrap;gap:6px 16px}.now-meta span{display:inline-flex;align-items:center;gap:6px}
  .vbar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:999;display:flex;gap:2px;padding:4px;border-radius:10px;background:rgba(20,20,22,.92);font:500 12px/1 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)}
  .vbar button{all:unset;cursor:pointer;color:#c9c9cf;padding:8px 11px;border-radius:7px}.vbar button.on{background:#fff;color:#111}
  .vbar .vname{color:#8a8a92;padding:8px 10px 8px 8px;border-right:1px solid #333;margin-right:2px}
  .embed .vbar{display:none}
  @media (max-width:980px){.app{grid-template-columns:1fr}.nav{display:none}.home,.md,.sem{grid-template-columns:1fr}.home-top{grid-template-columns:1fr 1fr}.steps{grid-template-columns:repeat(3,1fr)}.fields{grid-template-columns:1fr}.vbar{left:8px;right:8px;transform:none;overflow-x:auto}}
  `;

  /* ---------- markup ---------- */
  const NAV = [
    ['', [['home', 'Головна', 'start'], ['inbox', 'Задачі', 'home', 9], ['grid', 'Розклад'], ['calendar', 'Семестри', 'sem']]],
    ['Довідники', [['user', 'Викладачі', 'dir', 42], ['users', 'Групи', null, 24], ['layers', 'Потоки', null, 6], ['door', 'Аудиторії', null, 56], ['book', 'Предмети', null, 87]]],
    ['Планування', [['clipboard', 'Навчальні плани'], ['ban', 'Обмеження']]],
  ];
  const nav = () => `<aside class="nav">
    <div class="nav-brand"><span class="brand-mark">Р</span><span class="brand-name">Розклад</span></div>
    ${NAV.map(([g, items]) => `<div class="nav-group">${g ? `<div class="nav-label">${g}</div>` : ''}${items.map(([i, t, s, c]) => `<a class="nav-item" ${s ? `data-to="${s}"` : ''}>${ic(i)}<span>${t}</span>${c != null ? `<span class="nav-count">${c}</span>` : ''}</a>`).join('')}</div>`).join('')}
    <div class="nav-foot"><a class="nav-item">${ic('sliders')}<span>Налаштування</span></a><div class="nav-user"><span class="avatar">ОК</span><div><div class="nav-user-name">Оксана Кравець</div><div class="nav-user-role">Диспетчер</div></div></div></div>
  </aside>`;

  const topbar = (crumb, title, actions = '') => `<header class="topbar">
    <div class="title-wrap"><div class="crumbs">${crumb}</div><h1 class="page-title">${title}</h1></div><span class="sp"></span>
    ${actions}
    <label class="search">${ic('search')}<input placeholder="Пошук або команда"><kbd>Ctrl K</kbd></label>
    <button class="icon-btn" aria-label="Сповіщення">${ic('bell')}<i class="dot"></i></button>
  </header>`;

  const TASKS = [
    ['high', 'Блокує генерацію', [
      ['«Алгоритми» у КН-32 без викладача', 'Навчальний план · 64 год', 'Призначити', true],
      ['6 груп без навчального плану', 'КН-21, ПІ-21, ПІ-22 та ще 3', 'Скопіювати плани'],
    ]],
    ['mid', 'Погіршує розклад', [
      ['Кравчук Д. Ю. — 20 год плану, доступний 2 дні', 'Обмеження викладача', 'Переглянути'],
      ['Замало лабораторних аудиторій', 'Потрібно ≈ 4, доступно 3', 'Деталі'],
      ['КН-32: вікно 3 пари у вівторок', 'Після останньої генерації', 'Відкрити'],
    ]],
    ['low', 'Поради', [
      ['3 викладачі без предметів', 'Довідник викладачів', 'Показати'],
    ]],
  ];
  /* ---------- Головна: зрозуміла точка входу (не список помилок) ---------- */
  /* [icon, title, total, metric label, metric %, status, status level, screen] */
  const RES = [
    ['user', 'Викладачі', 42, 'середнє навантаження', 78, '2 перевантажені', 'warn', 'dir'],
    ['users', 'Групи', 24, 'мають навчальний план', 75, '6 без плану', 'err', ''],
    ['door', 'Аудиторії', 56, 'зайнятість цього тижня', 71, 'лабораторій замало', 'warn', ''],
    ['book', 'Предмети', 87, 'мають викладача', 97, '3 без викладача', 'warn', ''],
  ];
  const WEEK = [['Пн', 52], ['Вт', 48], ['Ср', 55], ['Чт', 48], ['Пт', 41], ['Сб', 6]];
  const NOW = [['207', 'Алгоритми та СД', 'КН-31', 'pr'], ['Ауд. 1', 'Філософія', 'Потік ПІ-2', 'lec'], ['Лаб-4', 'Веб-технології', 'КН-32', 'lab']];
  const DATES = [['28 лист', 'Дедлайн публікації розкладу', 'через 9 днів', 'high'], ['22 груд', 'Початок заліково-екзаменаційної сесії', 'через 33 дні', ''], ['25 груд', 'Різдво — вихідний день', 'вже в календарі', '']];
  const start = () => `<section class="screen is-on" id="scr-start">
    ${topbar('Четвер, 19 листопада · 12-й тиждень семестру', 'Доброго ранку, Оксано', `<button class="btn btn-ghost btn-sm how-open">${ic('info')}Як це працює?</button>`)}
    <div class="page">
      <div class="card welcome" id="welcome">
        <div class="welcome-text"><h2 class="card-title">Як працює система</h2>
          <p class="muted">Розклад складається у три етапи. До будь-якого з них можна повернутися пізніше.</p></div>
        <button class="btn btn-ghost btn-sm how-close">Зрозуміло, сховати</button>
        <ol class="how">
          <li><b>1</b><span><strong>Довідники</strong>Викладачі, групи, аудиторії й предмети. Заповнюються один раз на рік.</span></li>
          <li><b>2</b><span><strong>Плани й обмеження</strong>Скільки годин має кожна група і коли хто може працювати.</span></li>
          <li><b>3</b><span><strong>Генерація й публікація</strong>Система складає розклад, ви перевіряєте й публікуєте для студентів.</span></li>
        </ol>
      </div>
      <div class="start-grid">
        <div class="col">
          <div class="card journey">
            <div class="card-head"><h2 class="card-title">Осінній семестр 2026</h2><span class="badge badge-status">Підготовка</span><span class="sp"></span><span class="muted sm">2 з 6 етапів готово</span></div>
            <div class="steps">${STEPS.map(([n, s, m], i) => `<div class="step is-${s}"><span class="step-n">${s === 'done' ? ic('check', 'xs') : i + 1}</span><span class="step-name">${n}</span><span class="step-meta">${m}</span></div>`).join('')}</div>
            <div class="next">
              <div class="grow"><div class="next-k">Наступний крок</div><div class="next-t">Заповнити навчальні плани для 6 груп</div><div class="muted sm">приблизно 15 хвилин · КН-21, ПІ-21, ПІ-22 та ще 3</div></div>
              <button class="btn btn-primary" data-to="sem">Продовжити ${ic('arrow')}</button>
            </div>
          </div>
        </div>
        <div class="col">
          <div class="card attention">
            <span class="sev-ico sev-high">${ic('alert')}</span>
            <div class="grow"><b>2 питання блокують генерацію</b><div class="muted sm">і ще 4 поради щодо якості розкладу</div></div>
            <button class="btn btn-ghost btn-sm" data-to="home">Задачі</button>
          </div>
          <!-- «Сьогодні / Зараз іде» прибрано з головної — відкладено для розкладу лаборанта (design/final/backlog.md) -->
          <div class="card">
            <div class="card-head"><h2 class="card-title">Найближчі дати</h2></div>
            ${DATES.slice(0, 2).map(([d, t, m, lvl]) => `<div class="date-row ${lvl ? 'is-' + lvl : ''}"><span class="date-d num">${d}</span><span class="grow"><div class="t">${t}</div><div class="muted sm">${m}</div></span></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="card res-wide">
        <div class="card-head"><h2 class="card-title">Ресурси семестру</h2><span class="sp"></span><span class="muted sm">що є і чого бракує</span></div>
        <div class="res-grid">${RES.map(([i, t, n, ml, mv, st, lvl, to]) => `
          <div class="res" ${to ? `data-to="${to}"` : ''}>
            <div class="res-top"><span class="res-ico">${ic(i)}</span><span class="res-name">${t}</span><span class="res-num num">${n}</span></div>
            <div class="res-metric"><span>${ml}</span><b class="num">${mv}%</b></div>
            <div class="progress sm"><i style="width:${mv}%"></i></div>
            <div class="res-status is-${lvl}">${ic(lvl === 'err' ? 'x' : 'alert', 'xs')}${st}</div>
          </div>`).join('')}</div>
      </div>
      <div class="card changes-wide">
        <div class="card-head"><h2 class="card-title">Останні зміни</h2></div>
        <div class="change"><span class="when">Пт · 2 пара</span><span>Компʼютерні мережі перенесено в ауд. 210</span></div>
        <div class="change"><span class="when">Ср–Пт</span><span>Мельник А. В. на лікарняному, 4 пари без заміни</span></div>
      </div>
    </div></section>`;

  const home = () => `<section class="screen" id="scr-home">
    ${topbar('Осінній семестр 2026', 'Задачі')}
    <div class="page">
      <div class="home-top">
        <div class="card hero">
          <div class="hero-label">Готовність до генерації</div>
          <div class="hero-row"><span class="hero-value">78<small>%</small></span><span class="hero-note">2 блокери залишилось</span></div>
          <div class="progress"><i style="width:78%"></i></div>
          <button class="btn btn-hero" data-to="sem">Відкрити семестр ${ic('arrow')}</button>
        </div>
        ${[['Розподілено пар', '412', '/ 438', 'ще 26 у черзі', 94], ['Конфлікти', '3', '', '−4 після правок', null], ['Вікна у студентів', '11', '', 'у 5 груп', null]].map(([l, v, s, n, pr]) => `
        <div class="card kpi"><div class="kpi-label">${l}</div><div class="kpi-value">${v}<small>${s}</small></div>${pr ? `<div class="progress sm"><i style="width:${pr}%"></i></div>` : ''}<div class="kpi-note">${n}</div></div>`).join('')}
      </div>
      <div class="home">
        <div class="card tasks-card">
          <div class="card-head"><h2 class="card-title">Потребує уваги</h2><span class="sp"></span>
            <div class="seg"><button class="is-on">Усі 6</button><button>Блокери 2</button><button>Поради 1</button></div></div>
          ${TASKS.map(([sev, label, items]) => `<div class="task-group"><div class="task-group-label"><i class="sev sev-${sev}"></i>${label}<span>${items.length}</span></div>
            ${items.map(([t, m, a, fix]) => `<div class="task ${fix ? 'is-open' : ''}">
              <span class="sev-ico sev-${sev}">${ic(sev === 'low' ? 'info' : 'alert')}</span>
              <div class="task-body"><div class="task-title">${t}</div><div class="task-meta">${m}</div></div>
              <button class="btn btn-sm ${sev === 'high' ? 'btn-primary' : 'btn-ghost'} task-toggle">${a}</button>
              ${fix ? `<div class="task-fix"><div class="fix-label">Хто може вести «Алгоритми»</div>
                <label class="fix-opt is-sel"><input type="radio" name="fx" checked><span class="avatar sm">БС</span><span class="grow"><b>Бондар С. М.</b> <span class="muted">веде цей предмет у КН-31 · 18/20 год</span></span><span class="tag">Рекомендовано</span></label>
                <label class="fix-opt"><input type="radio" name="fx"><span class="avatar sm">ОВ</span><span class="grow"><b>Олійник В. Р.</b> <span class="muted">14/20 год · предмет не в профілі</span></span></label>
                <div class="fix-actions"><button class="btn btn-primary btn-sm">Призначити</button><button class="btn btn-ghost btn-sm task-toggle">Пізніше</button></div></div>` : ''}
            </div>`).join('')}</div>`).join('')}
        </div>
        <div class="col">
          <div class="card">
            <div class="card-head"><h2 class="card-title">Зараз у корпусі</h2><span class="sp"></span><span class="muted sm">Чт · 3 пара</span></div>
            ${[['207', 'Алгоритми та СД', 'КН-31', 'pr'], ['Ауд. 1', 'Філософія', 'Потік ПІ-2', 'lec'], ['Лаб-4', 'Веб-технології', 'КН-32', 'lab'], ['214', 'Вища математика', 'ПІ-21', 'pr']].map(([r, s, g, t]) => `
              <div class="today-row"><span class="room">${r}</span><span class="grow"><div class="t">${s}</div><div class="muted sm">${g}</div></span><span class="badge badge-${t}">${TYPE[t]}</span></div>`).join('')}
          </div>
          <div class="card">
            <div class="card-head"><h2 class="card-title">Завантаженість аудиторій</h2></div>
            <div class="heat">${'<span></span>' + DAYS.map((d) => `<span class="hd">${d}</span>`).join('') +
              [[.9, .6, .7, .5, .8, .1], [1, .9, .97, .9, .85, .2], [.8, .85, .9, .95, .7, .1], [.5, .6, .55, .7, .4, 0], [.2, .3, .25, .3, .1, 0]]
                .map((r, p) => `<span class="hd">${p + 1}</span>` + r.map((v) => `<i class="h${Math.min(4, Math.floor(v * 5))}" title="${Math.round(v * 100)}%"></i>`).join('')).join('')}</div>
            <div class="legend"><span>менше</span>${[0, 1, 2, 3, 4].map((i) => `<i class="h${i}"></i>`).join('')}<span>більше</span></div>
          </div>
        </div>
      </div>
    </div></section>`;

  const dir = () => `<section class="screen" id="scr-dir">
    ${topbar('Довідники', 'Викладачі', `<button class="btn btn-ghost">${ic('upload')}Імпорт</button><button class="btn btn-primary">${ic('plus')}Додати</button>`)}
    <div class="page">
      <div class="card md">
        <div class="md-list">
          <label class="search md-search">${ic('search')}<input placeholder="Пошук викладача"></label>
          <div class="chips md-filters"><span class="chip is-on">Усі 42</span><span class="chip">Без предметів 3</span><span class="chip">Перевантажені 2</span></div>
          <div class="md-rows" id="mdRows"></div>
        </div>
        <div class="md-detail" id="mdDetail"></div>
      </div>
    </div></section>`;

  const detail = (t) => `
    <div class="detail-head"><span class="avatar lg">${initials(t.n)}</span>
      <div class="grow"><h2 class="detail-name">${t.n}</h2><div class="muted">${t.dep}</div></div>
      <span class="saved">${ic('check')}Збережено</span><button class="icon-btn" aria-label="Ще">${ic('more')}</button></div>
    <div class="section"><div class="section-title">Основне</div>
      <div class="fields">
        <div class="f-label">ПІБ</div><div class="f-value editable">${t.n}</div>
        <div class="f-label">Статус</div><div class="f-value"><span class="status st-${t.st}">${t.st === 'active' ? 'Активний' : 'Відпустка до 01.12'}</span></div>
        <div class="f-label">Предмети</div><div class="f-value"><div class="chips">${t.subj.map((s) => `<span class="chip">${s}${ic('x', 'xs')}</span>`).join('') || '<span class="muted">Не призначено</span>'}<span class="chip chip-add">${ic('plus', 'xs')}Додати</span></div></div>
        <div class="f-label">Навантаження</div><div class="f-value"><div class="load"><div class="progress"><i style="width:${(t.load / t.max) * 100}%"></i></div><span class="num">${t.load} / ${t.max} год</span></div></div>
      </div></div>
    <div class="section"><div class="section-title">Доступність <span class="muted sm">клікніть клітинку, щоб позначити недоступність</span></div>
      <div class="avail">${'<span></span>' + DAYS.map((d) => `<span class="hd">${d}</span>`).join('') +
        PAIRS.map((p, pi) => `<span class="hd tm">${p[0]}</span>` + DAYS.map((_, d) => `<span class="c ${t.off.some((o) => o[0] === d && o[1] === pi) ? 'off' : ''}"></span>`).join('')).join('')}</div></div>
    <div class="section"><div class="section-title">Веде в групах</div>
      <div class="chips">${t.groups.map((g) => `<span class="chip link">${g}${ic('chevR', 'xs')}</span>`).join('')}</div></div>`;

  const STEPS = [['Календар', 'done', '1 вер – 20 груд'], ['Ресурси', 'done', '42 · 24 · 56'], ['Плани', 'cur', '18 з 24 груп'], ['Обмеження', 'todo', '12 правил'], ['Генерація', 'todo', 'не запускалась'], ['Публікація', 'todo', '—']];
  const sem = () => `<section class="screen" id="scr-sem">
    ${topbar('Семестри', 'Осінь 2026 <span class="badge badge-status">Підготовка</span>', `<button class="btn btn-ghost">${ic('calendar')}Календар</button><button class="btn btn-primary" disabled>${ic('bolt')}Згенерувати</button>`)}
    <div class="page">
      <div class="card steps">${STEPS.map(([n, s, m], i) => `<div class="step is-${s}"><span class="step-n">${s === 'done' ? ic('check', 'xs') : i + 1}</span><span class="step-name">${n}</span><span class="step-meta">${m}</span></div>`).join('')}</div>
      <div class="sem">
        <div class="card">
          <div class="card-head"><h2 class="card-title">Передперевірка</h2><span class="sp"></span><span class="muted sm">оновлено 2 хв тому</span></div>
          ${[['ok', '24 групи мають розклад дзвінків', ''], ['ok', 'Усі 56 аудиторій мають тип і місткість', ''], ['err', '6 груп без навчального плану', 'Заповнити'], ['err', '«Алгоритми» у КН-32 без викладача', 'Призначити'], ['warn', 'Кравчук Д. Ю. доступний лише 2 дні', 'Переглянути'], ['warn', 'Лабораторних аудиторій може не вистачити', 'Деталі']].map(([s, t, a]) => `
            <div class="check is-${s}"><span class="check-ico">${ic(s === 'ok' ? 'check' : s === 'err' ? 'x' : 'alert', 'xs')}</span><span>${t}</span>${a ? `<button class="btn btn-sm btn-ghost">${a}</button>` : '<span></span>'}</div>`).join('')}
        </div>
        <div class="col">
          <div class="card">
            <div class="card-head"><h2 class="card-title">Навчальні плани по групах</h2><span class="sp"></span><span class="muted sm">18 / 24</span></div>
            ${[['КН-31', 100], ['КН-32', 86], ['КН-21', 0], ['ПІ-21', 0], ['ПІ-41', 100], ['ПІ-22', 40]].map(([g, v]) => `
              <div class="grp-row"><span class="g">${g}</span><div class="progress"><i style="width:${v}%"></i></div><span class="num ${v === 100 ? 'ok' : ''}">${v === 100 ? 'готово' : v + '%'}</span></div>`).join('')}
          </div>
          <div class="card">
            <div class="card-head"><h2 class="card-title">Історія генерацій</h2></div>
            <div class="empty"><div class="empty-ico">${ic('bolt')}</div><div>Генерацію ще не запускали</div><div class="muted sm">Кнопка стане активною, коли не залишиться блокерів</div></div>
          </div>
        </div>
      </div>
    </div></section>`;

  const pub = () => `<div class="pub-wrap"><div class="pub">
    <header class="pub-head"><span class="brand-mark">Р</span><span class="brand-name">Розклад</span><span class="sp"></span><button class="btn btn-ghost btn-sm">${ic('link')}Поділитися</button></header>
    <label class="search pub-search">${ic('search')}<input value="КН-31"><span class="muted sm">група</span></label>
    <div class="pub-title"><h1>КН-31</h1><span class="muted">3 курс · Факультет комп’ютерних наук</span></div>
    <div class="card now-card">
      <div class="now-top"><span class="now-label"><i class="live"></i>Зараз · 3 пара</span><span class="now-left">ще 47 хв</span></div>
      <div class="now-title">Алгоритми та структури даних</div>
      <div class="now-meta"><span>${ic('clock', 'xs')}11:40 – 13:00</span><span>${ic('pin', 'xs')}ауд. 207</span><span>${ic('user', 'xs')}Бондар С. М.</span></div>
      <div class="progress"><i style="width:40%"></i></div>
    </div>
    <div class="card next-card"><span class="next-label">Далі · 13:30</span><span class="next-title">Вища математика</span><span class="badge badge-lec">Лекція</span><span class="muted sm">Ауд. 1</span></div>
    <div class="daystrip" id="days"></div>
    <div class="card lessons" id="lessons"></div>
    <div class="pub-foot"><button class="btn btn-ghost">${ic('calendar')}Додати в Google / Apple Calendar</button></div>
  </div></div>`;

  /* ---------- render + interactions ---------- */
  window.renderApp = function ({ name = '', calm = false } = {}) {
    const st = document.createElement('style'); st.textContent = BASE; document.head.prepend(st);
    document.body.innerHTML = `<div class="app">${nav()}<main class="main">${start()}${home()}${dir()}${sem()}</main></div>${pub()}
      <nav class="vbar"><span class="vname">${name}</span><button class="on" data-to="start">Головна</button><button data-to="home">Задачі</button><button data-to="dir">Викладачі</button><button data-to="sem">Семестр</button><button data-to="pub">Студент</button></nav>`;
    const go = (s) => {
      document.body.dataset.screen = s;
      document.querySelectorAll('.screen').forEach((x) => x.classList.toggle('is-on', x.id === 'scr-' + s));
      document.querySelectorAll('.vbar button').forEach((b) => b.classList.toggle('on', b.dataset.to === s));
      document.querySelectorAll('.nav-item[data-to]').forEach((a) => a.classList.toggle('is-active', a.dataset.to === s));
      scrollTo(0, 0);
    };
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-to]'); if (t) go(t.dataset.to);
      if (e.target.closest('.how-close')) { document.getElementById('welcome').classList.add('is-hidden'); try { localStorage.setItem('how-hidden', '1'); } catch (er) {} }
      if (e.target.closest('.how-open')) { document.getElementById('welcome').classList.remove('is-hidden'); try { localStorage.removeItem('how-hidden'); } catch (er) {} }
      const tg = e.target.closest('.task-toggle'); if (tg) tg.closest('.task').classList.toggle('is-open');
      const seg = e.target.closest('.seg button'); if (seg) seg.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b === seg));
      const chip = e.target.closest('.md-filters .chip'); if (chip) chip.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-on', c === chip));
      const cell = e.target.closest('.avail .c'); if (cell) cell.classList.toggle('off');
      const opt = e.target.closest('.fix-opt'); if (opt) opt.parentElement.querySelectorAll('.fix-opt').forEach((o) => o.classList.toggle('is-sel', o === opt));
    });

    /* directory */
    let sel = 0;
    const rows = () => document.getElementById('mdRows').innerHTML = TEACHERS.map((t, i) => `
      <div class="md-row ${i === sel ? 'is-active' : ''}" data-i="${i}"><span class="avatar">${initials(t.n)}</span>
        <div class="grow"><div class="name">${t.n}</div><div class="meta">${t.subj.join(', ') || 'Без предметів'}</div></div>
        <span class="num ${t.load >= t.max ? 'warn' : ''}">${t.load}/${t.max}</span></div>`).join('');
    const showDetail = () => document.getElementById('mdDetail').innerHTML = detail(TEACHERS[sel]);
    document.getElementById('mdRows').addEventListener('click', (e) => { const r = e.target.closest('.md-row'); if (r) { sel = +r.dataset.i; rows(); showDetail(); } });
    rows(); showDetail();

    /* public */
    let day = 3;
    const pubRender = () => {
      document.getElementById('days').innerHTML = DAYS.map((d, i) => `<div class="day ${i === day ? 'is-active' : ''} ${i === 3 ? 'is-today' : ''}" data-d="${i}"><span class="dw">${d}</span><span class="dn">${16 + i}</span><span class="dc">${LESSONS.filter((l) => l.d === i).length || ''}</span></div>`).join('');
      const ls = LESSONS.filter((l) => l.d === day).sort((a, b) => a.p - b.p);
      document.getElementById('lessons').innerHTML = `<div class="lessons-head">${DAYS_FULL[day]}, ${16 + day} листопада</div>` + (ls.length ? ls.map((l) => `
        <div class="lesson ${day === 3 && l.p < 2 ? 'is-past' : ''} ${day === 3 && l.p === 2 ? 'is-now' : ''}"><div class="l-time"><b>${PAIRS[l.p][0]}</b><span>${PAIRS[l.p][1]}</span></div>
        <div class="l-body"><div class="l-title">${l.s}</div><div class="l-meta">${l.tc} · ауд. ${l.r}</div></div><span class="badge badge-${l.t}">${TYPE[l.t]}</span></div>`).join('')
        : `<div class="empty"><div class="empty-ico">${ic('calendar')}</div><div>Пар немає</div></div>`);
    };
    document.getElementById('days').addEventListener('click', (e) => { const d = e.target.closest('.day'); if (d) { day = +d.dataset.d; pubRender(); } });
    pubRender();

    if (calm) { // laconic mode: drop secondary noise
      document.body.classList.add('calm');
      document.querySelectorAll('.task.is-open').forEach((t) => t.classList.remove('is-open'));
      document.querySelectorAll('kbd, .legend, .task-group-label span').forEach((e) => e.remove());
      document.querySelectorAll('.nav-count').forEach((e, i) => { if (i) e.remove(); });
      document.querySelectorAll('.heat').forEach((h) => h.closest('.card').remove());
    }
    if (window.top !== window) document.body.classList.add('embed'); // gallery thumbnails: hide the screen switcher
    try { if (localStorage.getItem('how-hidden')) document.getElementById('welcome').classList.add('is-hidden'); } catch (er) {}
    const first = new URLSearchParams(location.search).get('s'); go(first || 'start');
  };
})();
