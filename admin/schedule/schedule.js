/* Розклад (admin): week grid, drag & drop, lesson drawer, generation. */
let currentSemesterId = null;
let semesters = [];
let slots = [];
let slotsById = {};
let lessons = [];
let roomsCache = [];
let weekStartDate = null; // Monday of the displayed week
let loadToken = 0;
const view = { kind: 'all', value: '' };

const DAY_SHORT = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Нд' };
const DAY_NAMES = { 1: 'Понеділок', 2: 'Вівторок', 3: 'Середа', 4: 'Четвер', 5: 'П\'ятниця', 6: 'Субота', 7: 'Неділя' };
const esc = (s) => UI.escapeHtml(s);
const $ = (id) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', init);

async function init() {
    $('prevWeek').innerHTML = Icons.svg('chevron-left', { size: 16 });
    $('nextWeek').innerHTML = Icons.svg('chevron-right', { size: 16 });
    $('prevWeek').addEventListener('click', () => changeWeek(-1));
    $('nextWeek').addEventListener('click', () => changeWeek(1));

    const actions = Shell.actionsEl();
    if (actions) {
        actions.innerHTML =
            '<button type="button" class="btn" id="btnRefresh">Оновити</button>' +
            '<button type="button" class="btn btn-primary" id="btnGenerate">' + Icons.svg('bolt', { size: 16 }) + 'Згенерувати</button>';
        $('btnRefresh').addEventListener('click', () => { if (currentSemesterId) loadSchedule(currentSemesterId); });
        $('btnGenerate').addEventListener('click', askGenerate);
    }

    $('semesterSelect').addEventListener('change', (e) => { if (e.target.value) loadSchedule(e.target.value); });
    $('viewSeg').addEventListener('click', onViewClick);
    $('viewValue').addEventListener('change', (e) => { view.value = e.target.value; renderLessons(); });

    const layout = $('schLayout');
    layout.addEventListener('click', onLayoutClick);
    layout.addEventListener('keydown', (e) => {
        const card = e.target.closest && e.target.closest('.ls');
        if (card && e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openLesson(+card.dataset.id); }
    });
    UI.dnd(layout, {
        draggable: '.ls',
        dropzone: '.wk .cell[data-slot-id], .sch-bin-list',
        onDrop: (card, zone) => moveLesson(+card.dataset.id, zone.dataset.slotId ? +zone.dataset.slotId : null)
    });

    await loadRooms();
    await loadSemesters();
}

async function loadRooms() {
    try {
        const data = await apiRequest('/rooms/');
        roomsCache = data.results || data;
    } catch (error) {
        console.error('Помилка завантаження аудиторій', error);
    }
}

async function loadSemesters() {
    const select = $('semesterSelect');
    try {
        const data = await apiRequest('/semesters/');
        semesters = data.results || data;
        select.innerHTML = '<option value="">Оберіть семестр</option>' +
            semesters.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
        const active = semesters.find(s => s.is_current) || semesters[0];
        if (active) {
            select.value = active.id;
            loadSchedule(active.id);
        } else {
            showGridState('empty', 'Семестрів ще немає');
        }
    } catch (error) {
        UI.toast('Не вдалося завантажити семестри', { type: 'err' });
        showGridState('error', 'Не вдалося завантажити семестри');
    }
}

function showGridState(kind, text) {
    const st = $('gridState');
    $('scheduleGrid').hidden = true;
    st.hidden = false;
    UI.state(st, kind, { text: text });
}

async function loadSchedule(semesterId) {
    currentSemesterId = semesterId;
    const token = ++loadToken;
    showGridState('loading');
    try {
        const [slotsData, lessonsData] = await Promise.all([
            apiRequest(`/timeslots/?semester=${encodeURIComponent(semesterId)}`),
            apiRequest(`/lessons/?semester=${encodeURIComponent(semesterId)}`)
        ]);
        if (token !== loadToken) return;
        slots = slotsData.results || slotsData;
        lessons = lessonsData.results || lessonsData;
        slotsById = {};
        slots.forEach(s => { slotsById[s.id] = s; });

        // Start at the week of the earliest lesson, otherwise the current week.
        const dates = lessons.map(l => l.time_slot_details && l.time_slot_details.date).filter(Boolean).sort();
        weekStartDate = startOfWeek(dates.length ? parseDate(dates[0]) : new Date());

        fillViewValues();
        renderWeek();
    } catch (error) {
        if (token !== loadToken) return;
        UI.toast('Помилка завантаження розкладу', { type: 'err' });
        showGridState('error', 'Помилка завантаження даних');
    }
}

/* ---------- dates ---------- */
function parseDate(str) {
    const p = String(str).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
}

function isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return d;
}

function dateInWeek(dateStr) {
    if (!weekStartDate) return true;
    const d = parseDate(dateStr);
    return d >= weekStartDate && d < addDays(weekStartDate, 7);
}

function formatDate(date) {
    const d = typeof date === 'string' ? parseDate(date) : date;
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function hm(t) { return t ? String(t).slice(0, 5) : ''; }

function changeWeek(delta) {
    if (!weekStartDate) weekStartDate = startOfWeek(new Date());
    weekStartDate = addDays(weekStartDate, delta * 7);
    renderWeek();
}

/* ---------- grid ---------- */
function dayCount() {
    // Mon–Fri always; Saturday/Sunday columns only when the semester has them.
    let max = 5;
    slots.forEach(s => { if (s.day_of_week > max) max = s.day_of_week; });
    lessons.forEach(l => { const d = l.time_slot_details && l.time_slot_details.day_of_week; if (d > max) max = d; });
    return Math.min(max, 7);
}

function renderWeek() {
    const grid = $('scheduleGrid');
    const label = $('weekLabel');
    if (weekStartDate) label.textContent = `${formatDate(weekStartDate)} — ${formatDate(addDays(weekStartDate, 6))}`;

    if (!slots.length) {
        showGridState('empty', 'Для цього семестру немає часових слотів');
        renderLessons();
        return;
    }
    $('gridState').hidden = true;
    grid.hidden = false;

    const days = dayCount();
    grid.style.setProperty('--days', days);

    const byDate = {}, byDay = {}, times = {};
    slots.forEach(s => {
        if (s.date) byDate[s.date + '|' + s.period_number] = s;
        else byDay[s.day_of_week + '|' + s.period_number] = s;
        if (!times[s.period_number]) times[s.period_number] = s;
    });
    const periods = Object.keys(times).map(Number).sort((a, b) => a - b);
    const today = isoDate(new Date());

    let html = '<div class="wh"></div>';
    for (let d = 1; d <= days; d++) {
        const date = addDays(weekStartDate, d - 1);
        const iso = isoDate(date);
        html += `<div class="wh${iso === today ? ' is-today' : ''}">${DAY_SHORT[d]} <span>${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}</span></div>`;
    }
    periods.forEach((p, i) => {
        const last = i === periods.length - 1 ? ' last' : '';
        const t = times[p];
        html += `<div class="tm${last}"><b>${t.start_time ? esc(hm(t.start_time)) : esc(p)}</b>${t.start_time ? esc(hm(t.end_time)) : ''}</div>`;
        for (let d = 1; d <= days; d++) {
            const iso = isoDate(addDays(weekStartDate, d - 1));
            const s = byDate[iso + '|' + p] || byDay[d + '|' + p];
            if (s && s.is_available !== false) {
                html += `<div class="cell${last}" data-slot-id="${esc(s.id)}" data-day="${d}" data-period="${esc(p)}"></div>`;
            } else {
                // Not a drop target (no data-slot-id), but lessons already in an inactive slot render here.
                html += `<div class="cell blocked${last}" title="Слот не активний"${s ? ` data-off-slot-id="${esc(s.id)}"` : ''} data-day="${d}" data-period="${esc(p)}"></div>`;
            }
        }
    });
    grid.innerHTML = html;
    renderLessons();
}

/* ---------- lessons ---------- */
function lessonType(name) {
    const n = String(name || '').toLowerCase();
    if (n.includes('екзам') || n.includes('іспит') || n.includes('exam')) return 'exam';
    if (n.includes('лекц') || n.includes('lecture')) return 'lec';
    if (n.includes('лаб') || n.includes('lab')) return 'lab';
    if (n.includes('практ') || n.includes('семінар') || n.includes('practic')) return 'pr';
    return 'sch-other';
}

function viewKey(lesson, kind) {
    const sp = lesson.study_plan_details || {};
    if (kind === 'group') return sp.group || sp.stream || '';
    if (kind === 'teacher') return sp.teacher || '';
    if (kind === 'room') return (lesson.room_details && lesson.room_details.title) || '';
    return '';
}

function matchesView(lesson) {
    return view.kind === 'all' || viewKey(lesson, view.kind) === view.value;
}

function onViewClick(e) {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    view.kind = b.dataset.view;
    $('viewSeg').querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x === b));
    view.value = '';
    fillViewValues();
    renderLessons();
}

function fillViewValues() {
    const sel = $('viewValue');
    if (view.kind === 'all') { sel.hidden = true; return; }
    const values = Array.from(new Set(lessons.map(l => viewKey(l, view.kind)).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'uk', { numeric: true }));
    if (!values.includes(view.value)) view.value = values[0] || '';
    sel.innerHTML = values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    sel.value = view.value;
    sel.hidden = !values.length;
}

function renderLessons() {
    const grid = $('scheduleGrid');
    grid.querySelectorAll('.cell').forEach(c => { c.innerHTML = ''; });
    const bin = $('unscheduledList');
    bin.innerHTML = '';
    let unscheduled = 0;

    lessons.forEach(lesson => {
        if (!matchesView(lesson)) return;
        const sd = lesson.time_slot ? lesson.time_slot_details : null;
        let cell = null;
        if (sd) {
            if (sd.date && !dateInWeek(sd.date)) return; // other week
            const id = CSS.escape(String(lesson.time_slot));
            cell = grid.querySelector(`.cell[data-slot-id="${id}"], .cell[data-off-slot-id="${id}"]`) ||
                grid.querySelector(`.cell[data-day="${sd.day_of_week}"][data-period="${sd.period_number}"]`);
        }
        const card = lessonCardHtml(lesson);
        if (cell) cell.insertAdjacentHTML('beforeend', card);
        else { bin.insertAdjacentHTML('beforeend', card); unscheduled++; }
    });

    if (!unscheduled) bin.innerHTML = '<div class="sch-bin-empty">Усі пари розміщені</div>';
    const count = $('unscheduledCount');
    count.textContent = unscheduled;
    count.className = 'badge' + (unscheduled ? ' badge-err' : '');
}

function lessonCardHtml(lesson) {
    const sp = lesson.study_plan_details || {};
    const room = lesson.room_details && lesson.room_details.title;
    const target = sp.group || sp.stream;
    const locked = !!lesson.is_locked;
    return `<div class="ls ${lessonType(sp.class_type)}${locked ? ' is-locked' : ''}" data-id="${esc(lesson.id)}" draggable="${locked ? 'false' : 'true'}" tabindex="0">` +
        (sp.class_type ? `<span class="tp">${esc(sp.class_type)}</span>` : '') +
        `<b>${esc(sp.subject || 'Без предмета')}</b>` +
        (target ? `<span class="m">${esc(target)}</span>` : '') +
        (sp.teacher ? `<span class="m">${esc(sp.teacher)}</span>` : '') +
        `<span class="m">${room ? 'ауд. ' + esc(room) : 'без аудиторії'}</span>` +
        `<button type="button" class="sch-lock${locked ? ' is-on' : ''}" aria-pressed="${locked}" ` +
        `aria-label="${locked ? 'Розблокувати' : 'Закріпити'}" title="${locked ? 'Розблокувати' : 'Закріпити'}">${Icons.svg('lock', { size: 14 })}</button>` +
        '</div>';
}

function onLayoutClick(e) {
    const lock = e.target.closest('.sch-lock');
    const card = e.target.closest('.ls');
    if (!card) return;
    if (lock) { toggleLock(+card.dataset.id); return; }
    openLesson(+card.dataset.id);
}

async function toggleLock(id) {
    const lesson = lessons.find(l => l.id === id);
    if (!lesson) return;
    const next = !lesson.is_locked;
    lesson.is_locked = next;
    renderLessons();
    try {
        await apiRequest(`/lessons/${id}/`, 'PATCH', { is_locked: next });
        UI.toast(next ? 'Заняття закріплено' : 'Заняття відкріплено');
    } catch (error) {
        UI.toast('Помилка збереження', { type: 'err' });
        lesson.is_locked = !next;
        renderLessons();
    }
}

// Called from UI.dnd onDrop; a throw/reject makes UI.dnd put the card back and toast the message.
async function moveLesson(id, slotId) {
    const lesson = lessons.find(l => l.id === id);
    if (!lesson) throw new Error('Заняття не знайдено');
    if (lesson.is_locked) throw new Error('Заняття закріплене');
    try {
        await apiRequest(`/lessons/${id}/`, 'PATCH', { time_slot: slotId });
    } catch (error) {
        throw new Error(`Помилка: ${error.message}`);
    }
    lesson.time_slot = slotId;
    lesson.time_slot_details = slotId ? (slotsById[slotId] || null) : null;
    renderLessons();
}

/* ---------- lesson drawer ---------- */
function openLesson(id) {
    const lesson = lessons.find(l => l.id === id);
    if (!lesson) return;
    const sp = lesson.study_plan_details || {};
    const slot = lesson.time_slot ? (lesson.time_slot_details || {}) : null;
    const locked = !!lesson.is_locked;
    const type = lessonType(sp.class_type);

    const roomOptions = roomsCache.map(r =>
        `<option value="${esc(r.id)}"${r.id === lesson.room ? ' selected' : ''}>${esc(r.title)} (${esc(r.capacity)} місць)</option>`
    ).join('');

    let when = 'Не розміщено';
    if (slot && slot.day_of_week) {
        when = (slot.date ? formatDate(slot.date) + ', ' : '') + DAY_NAMES[slot.day_of_week] + `, ${slot.period_number} пара` +
            (slot.start_time ? ` (${hm(slot.start_time)}–${hm(slot.end_time)})` : '');
    }

    const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
    const body =
        '<dl class="sch-dl">' +
        row('Предмет', esc(sp.subject)) +
        row('Тип', sp.class_type ? `<span class="badge${type === 'sch-other' ? '' : ' badge-' + type}">${esc(sp.class_type)}</span>` : '') +
        row('Викладач', esc(sp.teacher)) +
        row(sp.group ? 'Група' : 'Потік', esc(sp.group || sp.stream)) +
        row('Час', esc(when)) +
        '</dl>' +
        '<div class="field">' +
        '<label for="drRoom">Аудиторія</label>' +
        `<select id="drRoom" class="select"${locked ? ' disabled' : ''}><option value="">Не призначено</option>${roomOptions}</select>` +
        `<span class="help">${locked ? 'Пара закріплена: спершу розблокуйте її.' : 'Час змінюється перетягуванням у сітці.'}</span>` +
        '</div>';

    const foot = document.createElement('div');
    foot.style.cssText = 'display:flex;gap:8px';
    foot.innerHTML = '<button type="button" class="btn btn-ghost" data-act="cancel">Скасувати</button>' +
        `<button type="button" class="btn btn-primary" data-act="save"${locked ? ' disabled' : ''}>Зберегти</button>`;

    const d = UI.drawer({ title: 'Деталі заняття', body: body, foot: foot });
    foot.querySelector('[data-act="cancel"]').addEventListener('click', d.close);
    const save = foot.querySelector('[data-act="save"]');
    save.addEventListener('click', async () => {
        const v = d.el.querySelector('#drRoom').value;
        const roomId = v ? parseInt(v, 10) : null;
        if (roomId === (lesson.room || null)) { d.close(); return; }
        save.disabled = true;
        try {
            await apiRequest(`/lessons/${lesson.id}/`, 'PATCH', { room: roomId });
            lesson.room = roomId;
            lesson.room_details = roomId ? (roomsCache.find(r => r.id === roomId) || null) : null;
            renderLessons();
            UI.toast('Аудиторію змінено', { type: 'ok' });
            d.close();
        } catch (error) {
            console.error(error);
            UI.toast('Помилка збереження аудиторії', { type: 'err' });
            save.disabled = false;
        }
    });
}

/* ---------- generation ---------- */
// Same rules as the semester page: blocked by preflight blockers, one run at a time.
let generating = false;

function plural(n, one, few, many) { return UI.plural(n, one, few, many); }

async function askGenerate() {
    if (!currentSemesterId) { UI.toast('Оберіть семестр', { type: 'warn' }); return; }
    if (generating) return;
    const semId = currentSemesterId;
    const btn = $('btnGenerate');
    if (btn) btn.disabled = true;
    let checks = null;
    try {
        checks = await Checks.run(semId, { force: true });
    } catch (error) {
        UI.toast('Не вдалося перевірити семестр перед генерацією: ' + UI.errorText(error), { type: 'err' });
    } finally {
        if (btn && !generating) btn.disabled = false;
    }
    if (!checks || semId !== currentSemesterId) return;
    const blocks = checks.filter(c => c.severity === 'block');
    if (blocks.length) {
        UI.toast('Генерацію заблоковано: ' + blocks.map(c => c.title).join('; '), {
            type: 'err', timeout: 10000,
            action: { label: 'Відкрити семестр', onClick: () => { location.href = '/admin/semesters/?id=' + encodeURIComponent(semId); } }
        });
        return;
    }
    const sem = semesters.find(s => String(s.id) === String(semId));
    const total = lessons.length, locked = lessons.filter(l => l.is_locked).length;
    const warning = total
        ? 'Буде видалено ' + plural(total - locked, 'незаблоковане заняття', 'незаблоковані заняття', 'незаблокованих занять') +
          (sem ? ' семестру «' + sem.name + '»' : '') + ', і розклад буде складено заново.' +
          (locked ? ' Заблоковані заняття (' + locked + ') залишаться.' : '')
        : 'Розклад семестру' + (sem ? ' «' + sem.name + '»' : '') + ' буде складено з навчальних планів.';
    UI.confirmInline($('genConfirm'), {
        warning: warning,
        question: 'Запустити генерацію?',
        yes: 'Згенерувати',
        no: 'Скасувати',
        onYes: () => runGeneration(semId)
    });
}

async function runGeneration(semId) {
    if (generating) return;
    generating = true;
    const btn = $('btnGenerate');
    if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
    const loader = $('generationLoader');
    const logBox = $('generationLog');
    loader.classList.add('is-open');
    logBox.textContent = 'Запуск алгоритму…';
    try {
        const data = await apiRequest('/generate-schedule/', 'POST', { semester_id: semId });
        if (!data.success) throw new Error(data.error || 'Невідома помилка');
        logBox.textContent = data.logs ? data.logs.join('\n') : 'Готово';
        Checks.invalidate(semId);
        await new Promise(r => setTimeout(r, 1000));
        loader.classList.remove('is-open');
        if (String(semId) === String(currentSemesterId)) loadSchedule(semId);
        UI.toast(`Генерацію завершено. Створено: ${data.created}`, { type: 'ok' });
    } catch (error) {
        logBox.textContent += `\nПомилка: ${error.message}`;
        UI.toast('Помилка генерації', { type: 'err' });
        await new Promise(r => setTimeout(r, 3000));
        loader.classList.remove('is-open');
    } finally {
        generating = false;
        if (btn) { btn.disabled = false; btn.classList.remove('is-busy'); }
    }
}
