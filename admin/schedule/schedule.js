
let currentSemesterId = null;
let timeSlotsMap = {};
let lessons = [];
let roomsCache = [];
let draggedLessonId = null;
let weekStartDate = null; // Monday of currently displayed week

document.addEventListener('DOMContentLoaded', init);

async function init() {
    await loadSemesters();
    await loadRooms();

    document.getElementById('semesterSelect').addEventListener('change', (e) => {
        if (e.target.value) loadSchedule(e.target.value);
    });

    document.getElementById('btnRefresh').addEventListener('click', () => {
        if (currentSemesterId) loadSchedule(currentSemesterId);
    });

    document.getElementById('btnGenerate').addEventListener('click', generateSchedule);

    const prev = document.getElementById('prevWeek');
    const next = document.getElementById('nextWeek');
    if (prev) prev.addEventListener('click', () => changeWeek(-1));
    if (next) next.addEventListener('click', () => changeWeek(1));

    const bin = document.getElementById('unscheduledList');
    bin.addEventListener('dragover', handleDragOver);
    bin.addEventListener('drop', handleDropUnscheduled);
}

async function loadRooms() {
    try {
        const data = await apiRequest('/rooms/');
        roomsCache = data.results || data;
    } catch (error) {
        console.error("Помилка завантаження аудиторій", error);
    }
}

async function loadSemesters() {
    try {
        const data = await apiRequest('/semesters/');

        const select = document.getElementById('semesterSelect');
        select.innerHTML = '<option value="">-- Оберіть семестр --</option>' +
            data.map(sem => `<option value="${sem.id}">${sem.name}</option>`).join('');

        const activeSemester = data.find(s => s.is_current);

        if (activeSemester) {
            select.value = activeSemester.id;
            loadSchedule(activeSemester.id);
        } else if (data.length > 0) {
            select.value = data[0].id;
            loadSchedule(data[0].id);
        }
    } catch (error) {
        showToast('Не вдалося завантажити семестри', 'error');
    }
}

async function loadSchedule(semesterId) {
    currentSemesterId = semesterId;
    const gridContainer = document.getElementById('scheduleGrid');

    try {
        const [slotsData, lessonsData] = await Promise.all([
            apiRequest(`/timeslots/?semester=${semesterId}`),
            apiRequest(`/lessons/?semester=${semesterId}`)
        ]);

        buildGrid(slotsData);
        lessons = lessonsData.results || lessonsData;
        // Determine starting week: prefer earliest lesson occurrence date, otherwise current week
        const occDates = lessons
            .map(l => l.time_slot_details?.date)
            .filter(Boolean)
            .map(d => new Date(d));

        if (occDates.length > 0) {
            const minD = new Date(Math.min(...occDates.map(d => d.getTime())));
            weekStartDate = startOfWeek(minD);
        } else {
            weekStartDate = startOfWeek(new Date());
        }

        renderWeekLabel();
        renderLessons();

    } catch (error) {
        showToast('Помилка завантаження розкладу', 'error');
        gridContainer.innerHTML = '<div class="empty-state">❌ Помилка завантаження даних</div>';
    }
}

function buildGrid(slots) {
    const grid = document.getElementById('scheduleGrid');
    grid.innerHTML = '';

    timeSlotsMap = {};

    grid.appendChild(createDiv('grid-header-cell', ''));
    ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].forEach(day => grid.appendChild(createDiv('grid-header-cell', day)));

    slots.forEach(slot => {
        if (!timeSlotsMap[slot.day_of_week]) timeSlotsMap[slot.day_of_week] = {};
        timeSlotsMap[slot.day_of_week][slot.period_number] = slot.id;
    });

    for (let p = 1; p <= 8; p++) {
        grid.appendChild(createDiv('grid-time-cell', `${p}`));

        for (let d = 1; d <= 7; d++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.day = d;
            cell.dataset.period = p;

            const slotId = timeSlotsMap[d]?.[p];
            if (slotId) {
                cell.dataset.slotId = slotId;
                cell.addEventListener('dragover', handleDragOver);
                cell.addEventListener('drop', handleDrop);
            } else {
                cell.style.background = `repeating-linear-gradient(
                    45deg,
                    #f1f5f9,
                    #f1f5f9 10px,
                    #e2e8f0 10px,
                    #e2e8f0 20px
                )`;
                cell.title = "Слот не активний";
            }
            grid.appendChild(cell);
        }
    }
}

function renderLessons() {
    document.querySelectorAll('.grid-cell').forEach(cell => cell.innerHTML = '');
    document.getElementById('unscheduledList').innerHTML = '';

    let unscheduledCount = 0;

    lessons.forEach(lesson => {
        const card = createLessonCard(lesson);

        if (lesson.time_slot && lesson.time_slot_details) {
            const slotDetails = lesson.time_slot_details || {};

            // If this lesson occurrence has an explicit date, only render it when it falls into the currently displayed week
            if (slotDetails.date) {
                if (!dateInWeek(slotDetails.date)) {
                    // do not render occurrences outside current week
                    return;
                }
            }

            const day = slotDetails.day_of_week;
            const period = slotDetails.period_number;
            const cell = document.querySelector(`.grid-cell[data-day="${day}"][data-period="${period}"]`);

            if (cell) {
                cell.appendChild(card);
            } else {
                document.getElementById('unscheduledList').appendChild(card);
                unscheduledCount++;
            }
        } else {
            document.getElementById('unscheduledList').appendChild(card);
            unscheduledCount++;
        }
    });

    document.getElementById('unscheduledCount').textContent = unscheduledCount;
}

function dateInWeek(dateStr) {
    if (!weekStartDate) return true;
    const d = new Date(dateStr);
    const start = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return d >= start && d < end;
}

function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0) ? -6 : 1 - day; // shift to Monday
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + diff);
    return d;
}

function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderWeekLabel() {
    const label = document.getElementById('weekLabel');
    if (!label || !weekStartDate) return;
    const start = weekStartDate;
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    label.textContent = `${formatDate(start)} — ${formatDate(end)}`;
}

function changeWeek(delta) {
    if (!weekStartDate) weekStartDate = startOfWeek(new Date());
    weekStartDate.setDate(weekStartDate.getDate() + (delta * 7));
    renderWeekLabel();
    renderLessons();
}

function createLessonCard(lesson) {
    const div = document.createElement('div');
    div.className = `lesson-card ${lesson.is_locked ? 'locked' : ''}`;

    const typeName = lesson.study_plan_details?.class_type || '';
    if (typeName.includes('Лекція')) div.classList.add('type-lecture');
    else if (typeName.includes('Лабораторна')) div.classList.add('type-lab');
    else if (typeName.includes('Практична')) div.classList.add('type-practice');

    div.draggable = true;
    div.dataset.id = lesson.id;

    const sp = lesson.study_plan_details || {};
    const room = lesson.room_details || {};

    const subject = sp.subject || 'Невідомий предмет';
    const target = sp.group || sp.stream || 'Target';
    const roomTitle = room.title || '???';
    const icon = lesson.is_locked ? '🔒' : '🔓';
    const iconColor = lesson.is_locked ? '#e74c3c' : '#95a5a6';

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
            <span class="lesson-subject">${subject}</span>
            <button class="btn-icon" style="color:${iconColor}; font-size:1rem; cursor:pointer; background:none; border:none; padding:0;" 
                onclick="toggleLock(${lesson.id}, event)" title="${lesson.is_locked ? 'Розблокувати' : 'Закріпити'}">
                ${icon}
            </button>
        </div>
        <div class="lesson-group">${target}</div>
        <div class="lesson-teacher">${sp.teacher || ''}</div>
        <div style="font-size:0.8em; color:#475569; margin-top:6px; display:flex; align-items:center; gap:4px;">
            <span>📍 ${roomTitle}</span>
            <span class="badge" style="font-size:0.7em; padding:2px 6px;">${sp.class_type || ''}</span>
        </div>
    `;

    div.addEventListener('dragstart', (e) => {
        draggedLessonId = lesson.id;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    div.addEventListener('dragend', (e) => {
        e.target.classList.remove('dragging');
        draggedLessonId = null;
    });

    div.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON') {
            showLessonDetails(lesson);
        }
    });

    return div;
}

function createDiv(className, text) {
    const d = document.createElement('div');
    d.className = className;
    d.textContent = text;
    return d;
}


async function toggleLock(id, event) {
    event.stopPropagation();

    const lesson = lessons.find(l => l.id === id);
    if (!lesson) return;

    const newState = !lesson.is_locked;

    lesson.is_locked = newState;
    renderLessons();

    try {
        await apiRequest(`/lessons/${id}/`, 'PATCH', { is_locked: newState });
        showToast(newState ? 'Заняття закріплено' : 'Заняття відкріплено', 'info');
    } catch (error) {
        showToast('Помилка збереження', 'error');
        lesson.is_locked = !newState;
        renderLessons();
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (e.currentTarget.classList.contains('grid-cell') || e.currentTarget.id === 'unscheduledList') {
        e.currentTarget.classList.add('drag-over');
    }
}

document.addEventListener('dragleave', (e) => {
    if (e.target.classList && (e.target.classList.contains('grid-cell') || e.target.id === 'unscheduledList')) {
        e.target.classList.remove('drag-over');
    }
});

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const newSlotId = e.currentTarget.dataset.slotId;
    if (!draggedLessonId || !newSlotId) return;
    moveLesson(draggedLessonId, parseInt(newSlotId));
}

function handleDropUnscheduled(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    if (!draggedLessonId) return;
    moveLesson(draggedLessonId, null);
}

async function moveLesson(id, slotId) {
    const lesson = lessons.find(l => l.id === id);
    if (!lesson) return;

    if (lesson.is_locked) {
        showToast("🔒 Заняття закріплене!", "warning");
        return;
    }

    const oldSlot = lesson.time_slot;
    const oldDetails = lesson.time_slot_details;

    if (slotId) {
        let foundDay, foundPeriod;
        for (let d in timeSlotsMap) {
            for (let p in timeSlotsMap[d]) {
                if (timeSlotsMap[d][p] == slotId) {
                    foundDay = d; foundPeriod = p;
                }
            }
        }

        lesson.time_slot = slotId;
        lesson.time_slot_details = {
            id: slotId,
            day_of_week: parseInt(foundDay),
            period_number: parseInt(foundPeriod)
        };
    } else {
        lesson.time_slot = null;
        lesson.time_slot_details = null;
    }

    renderLessons();

    try {
        await apiRequest(`/lessons/${id}/`, 'PATCH', { time_slot: slotId });
    } catch (error) {
        showToast(`Помилка: ${error.message}`, 'error');
        lesson.time_slot = oldSlot;
        lesson.time_slot_details = oldDetails;
        renderLessons();
    }
}

async function generateSchedule() {
    if (!currentSemesterId) return showToast("Оберіть семестр", "warning");
    if (!confirm("Запустити генерацію? Це змінить розклад.")) return;

    const loader = document.getElementById('generationLoader');
    const logBox = document.getElementById('generationLog');

    loader.classList.remove('hidden');
    logBox.textContent = "🚀 Запуск алгоритму...";

    try {
        const data = await apiRequest('/generate-schedule/', 'POST', { semester_id: currentSemesterId });

        if (data.success) {
            logBox.textContent = data.logs ? data.logs.join('\n') : "Готово!";
            setTimeout(() => {
                loader.classList.add('hidden');
                loadSchedule(currentSemesterId);
                showToast(`Генерацію завершено! Створено: ${data.created}`, 'success');
            }, 1000);
        } else {
            throw new Error(data.error || "Невідома помилка");
        }

    } catch (error) {
        logBox.textContent += `\n❌ ERROR: ${error.message}`;
        showToast("Помилка генерації", 'error');
        setTimeout(() => loader.classList.add('hidden'), 3000);
    }
}

function showLessonDetails(lesson) {
    const sp = lesson.study_plan_details || {};
    const currentRoomId = lesson.room || null;
    const slot = lesson.time_slot_details || {};
    const dayNames = { 1: 'Понеділок', 2: 'Вівторок', 3: 'Середа', 4: 'Четвер', 5: 'П\'ятниця', 6: 'Субота', 7: 'Неділя' };

    const roomOptions = roomsCache.map(r =>
        `<option value="${r.id}" ${r.id === currentRoomId ? 'selected' : ''}>${r.title} (${r.capacity} місць)</option>`
    ).join('');

    const body = document.getElementById('lessonDetailsBody');
    body.innerHTML = `
        <div class="detail-row">
            <div><div class="detail-label">Предмет</div><div class="detail-value">${sp.subject || '-'}</div></div>
            <div style="text-align:right"><div class="detail-label">Тип</div><span class="badge badge-info">${sp.class_type || '-'}</span></div>
        </div>
        <div class="detail-row">
            <div><div class="detail-label">Викладач</div><div class="detail-value">${sp.teacher || '-'}</div></div>
            <div style="text-align:right"><div class="detail-label">Група</div><div class="detail-value">${sp.group || sp.stream || '-'}</div></div>
        </div>
        
        <div class="detail-row" style="align-items: center;">
            <div style="flex: 1;">
                <div class="detail-label" style="margin-bottom: 5px;">Аудиторія</div>
                <select id="roomSelect" class="form-input" style="width: 100%; padding: 6px;" 
                        onchange="updateLessonRoom(${lesson.id}, this.value)" 
                        ${lesson.is_locked ? 'disabled' : ''}>
                    <option value="">-- Не призначено --</option>
                    ${roomOptions}
                </select>
            </div>
        </div>

        <div class="detail-row">
            <div style="text-align:left; width: 100%;">
                <div class="detail-label">Час (змінюється перетягуванням)</div>
                    <div class="detail-value" style="margin-top: 5px;">
                    ${slot.id ? `🗓️ ${slot.date ? formatDate(slot.date) + ' — ' : ''}${dayNames[slot.day_of_week]}, Пара ${slot.period_number}` : '⏳ Не розклад'}
                </div>
            </div>
        </div>
    `;

    showModal('lessonModal');
}

async function updateLessonRoom(lessonId, newRoomId) {
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return;

    const roomId = newRoomId ? parseInt(newRoomId) : null;
    const oldRoom = lesson.room;
    const oldDetails = lesson.room_details;

    lesson.room = roomId;
    if (roomId) {
        const roomObj = roomsCache.find(r => r.id === roomId);
        lesson.room_details = roomObj || { title: '...' };
    } else {
        lesson.room_details = { title: '???' };
    }

    renderLessons();

    try {
        await apiRequest(`/lessons/${lessonId}/`, 'PATCH', { room: roomId });
        showToast('Аудиторію змінено', 'success');
    } catch (error) {
        console.error(error);
        showToast('Помилка збереження аудиторії', 'error');
        lesson.room = oldRoom;
        lesson.room_details = oldDetails;
        renderLessons();
        const select = document.getElementById('roomSelect');
        if (select) select.value = oldRoom || "";
    }
}

window.toggleLock = toggleLock;
window.updateLessonRoom = updateLessonRoom;