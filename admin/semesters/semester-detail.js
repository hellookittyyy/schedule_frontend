let semesterId = null;
let semester = null;
let slots = [];
let currentDate = new Date();
let slotsByDate = {};
let currentDateStr = null;

function getSemesterIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

async function loadSemester() {
    semesterId = getSemesterIdFromUrl();
    
    if (!semesterId) {
        showToast('ID семестру не знайдено', 'error');
        setTimeout(() => window.location.href = '/admin/semesters', 1000);
        return;
    }

    try {
        semester = await apiRequest(`/semesters/${semesterId}/`);
        renderSemesterInfo();
        loadSlots();
    } catch (error) {
        showToast('Не вдалося завантажити семестр', 'error');
        setTimeout(() => window.location.href = '/admin/semesters', 2000);
    }
}

function renderSemesterInfo() {
    document.getElementById('semesterName').textContent = semester.name;
    
    const infoContainer = document.getElementById('semesterInfo');
    infoContainer.innerHTML = `
        <div class="info-item">
            <span class="info-label">Назва:</span>
            <span class="info-value">${semester.name}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Дата початку:</span>
            <span class="info-value">${formatDate(semester.start_date)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Дата завершення:</span>
            <span class="info-value">${formatDate(semester.end_date)}</span>
        </div>
        <div class="info-item">
            <span class="info-label">Тривалість:</span>
            <span class="info-value">${calculateDuration(semester.start_date, semester.end_date)} днів</span>
        </div>
    `;

    if (semester.configuration) {
        displayConfiguration(semester.configuration);
    }
}

function displayConfiguration(config) {
    document.getElementById('configCard').style.display = 'block';
    const configDisplay = document.getElementById('configDisplay');
    let html = '';
    
    if (config.weekends && config.weekends.length > 0) {
        html += `
            <div class="config-section">
                <h3>📅 Вихідні дні</h3>
                <div>
                    ${config.weekends.map(day => `<span class="config-badge">${translateDay(day)}</span>`).join('')}
                </div>
            </div>`;
    }
    
    if (config.time_schedule && config.time_schedule.length > 0) {
        html += `
            <div class="config-section">
                <h3>⏰ Розклад дзвінків</h3>
                <div>
                    ${config.time_schedule.map((slot, index) => 
                        `<span class="time-slot-badge">${index + 1}. ${slot[0]} - ${slot[1]}</span>`
                    ).join('')}
                </div>
            </div>`;
    }
    
    if (config.dates_excluded && config.dates_excluded.length > 0) {
        html += `
            <div class="config-section">
                <h3>🚫 Виключені дати</h3>
                <ul class="config-list">
                    ${config.dates_excluded.map(date => `<li>${formatDate(date)}</li>`).join('')}
                </ul>
            </div>`;
    }
    
    if (config.dates_included && config.dates_included.length > 0) {
        html += `
            <div class="config-section">
                <h3>✅ Включені дати</h3>
                <ul class="config-list">
                    ${config.dates_included.map(date => `<li>${formatDate(date)}</li>`).join('')}
                </ul>
            </div>`;
    }
    
    configDisplay.innerHTML = html || '<p style="color: #7f8c8d;">Конфігурація відсутня</p>';
}

async function loadSlots() {
    try {
        slots = await apiRequest(`/semesters/${semesterId}/slots/`);
        
        slotsByDate = {};
        slots.forEach(slot => {
            if (!slotsByDate[slot.date]) {
                slotsByDate[slot.date] = [];
            }
            slotsByDate[slot.date].push(slot);
        });
        
        Object.keys(slotsByDate).forEach(date => {
            slotsByDate[date].sort((a, b) => a.start_time.localeCompare(b.start_time));
        });
        
        updateStats();
        renderCalendar();
    } catch (error) {
        document.getElementById('calendarContainer').innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📅</div>
                <h3>Слоти не знайдено</h3>
                <p>Для цього семестру ще не згенеровано часові слоти</p>
            </div>
        `;
    }
}

function updateStats() {
    const uniqueDates = new Set(slots.map(slot => slot.date));
    const totalDays = uniqueDates.size;
    const totalSlots = slots.length;
    const avgSlotsPerDay = totalDays > 0 ? (totalSlots / totalDays).toFixed(1) : 0;
    
    document.getElementById('semesterStats').innerHTML = `
        <div class="stat-item">
            <span class="stat-number">${totalDays}</span>
            <span class="stat-label">Робочих днів</span>
        </div>
        <div class="stat-item">
            <span class="stat-number">${totalSlots}</span>
            <span class="stat-label">Всього слотів</span>
        </div>
        <div class="stat-item">
            <span class="stat-number">${avgSlotsPerDay}</span>
            <span class="stat-label">Середньо пар/день</span>
        </div>
    `;
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const monthNames = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
                        'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    document.getElementById('currentMonth').textContent = `${monthNames[month]} ${year}`;
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    let startingDayOfWeek = firstDay.getDay();
    const adjustedStart = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;
    
    let html = '<div class="calendar-grid">';
    
    const dayHeaders = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
    dayHeaders.forEach(day => {
        html += `<div class="calendar-day-header">${day}</div>`;
    });
    
    for (let i = 0; i < adjustedStart; i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDateISO(date);
        
        const dayOfWeek = date.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        const daySlots = slotsByDate[dateStr] || [];
        const hasSlots = daySlots.length > 0;
        
        const classes = ['calendar-day'];
        if (isWeekend) classes.push('weekend');
        if (hasSlots) classes.push('has-slots');
        
        html += `
            <div class="${classes.join(' ')}" onclick="openDayModal('${dateStr}')" title="${dateStr}">
                <span class="day-number">${day}</span>
                ${hasSlots ? `<span class="slots-count">${daySlots.length} пар</span>` : '<span class="slots-count no-slots">Немає пар</span>'}
            </div>
        `;
    }
    
    html += '</div>';
    document.getElementById('calendarContainer').innerHTML = html;
}

function openDayModal(dateStr) {
    currentDateStr = dateStr;
    const daySlots = slotsByDate[dateStr] || [];
    const formattedDate = formatDate(dateStr);
    
    document.getElementById('sidebarDate').textContent = formattedDate;
    
    const slotsList = document.getElementById('sidebarSlotsList');
    if (daySlots.length > 0) {
        slotsList.innerHTML = daySlots.map(slot => `
            <div class="slot-item">
                <div class="slot-time">
                    <strong>${slot.start_time.substring(0, 5)} - ${slot.end_time.substring(0, 5)}</strong>
                </div>
                <button class="btn btn-delete btn-small" onclick="deleteSlot(${slot.id})">
                    🗑️
                </button>
            </div>
        `).join('');
    } else {
        slotsList.innerHTML = '<p style="color: #7f8c8d; text-align: center; padding: 20px;">На цей день немає пар</p>';
    }
    
    const timeSchedule = semester.configuration?.time_schedule || [];
    const addSlotSection = document.getElementById('addSlotSection');
    
    if (timeSchedule.length > 0) {
        addSlotSection.style.display = 'block';
        const select = document.getElementById('newSlotTime');
        select.innerHTML = '<option value="">-- Оберіть час --</option>' +
            timeSchedule.map((time, idx) => 
                `<option value="${time[0]}|${time[1]}">${idx + 1}. ${time[0]} - ${time[1]}</option>`
            ).join('');
    } else {
        addSlotSection.style.display = 'none';
    }
    
    document.getElementById('slotSidebar').classList.add('open');
}

function closeDayPanel() {
    document.getElementById('slotSidebar').classList.remove('open');
    currentDateStr = null;
}

async function addSlotFromSidebar() {
    const select = document.getElementById('newSlotTime');
    const value = select.value;
    
    if (!value) return showToast('Оберіть час пари!', 'error');
    
    const [startTime, endTime] = value.split('|');
    
    try {
        await apiRequest('/timeslots/', 'POST', {
            semester: semesterId,
            date: currentDateStr,
            start_time: startTime,
            end_time: endTime
        });
        
        await loadSlots();
        openDayModal(currentDateStr);
        showToast('Пару додано!', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function deleteSlot(slotId) {
    if (!confirm('Видалити цю пару?')) return;
    
    try {
        await apiRequest(`/timeslots/${slotId}/`, 'DELETE');
        await loadSlots();
        openDayModal(currentDateStr);
        showToast('Пару видалено', 'success');
    } catch (error) {
        showToast('Помилка при видаленні', 'error');
    }
}

function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    renderCalendar();
}

function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('uk-UA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function calculateDuration(startDate, endDate) {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function translateDay(day) {
    const translations = {
        'Monday': 'Понеділок', 'Tuesday': 'Вівторок', 'Wednesday': 'Середа',
        'Thursday': 'Четвер', 'Friday': 'П\'ятниця', 'Saturday': 'Субота', 'Sunday': 'Неділя'
    };
    return translations[day] || day;
}

loadSemester();

window.openDayModal = openDayModal;
window.closeDayPanel = closeDayPanel;
window.addSlotFromSidebar = addSlotFromSidebar;
window.deleteSlot = deleteSlot;
window.changeMonth = changeMonth;