document.addEventListener('DOMContentLoaded', () => {
    generateCalendar();
    loadDashboardData();
});

async function loadDashboardData() {
    try {
        const [stats, semesters] = await Promise.all([
            apiRequest('/stats/'),
            apiRequest('/semesters/')
        ]);

        updateStatsUI(stats);
        
        const activeSemester = semesters.find(s => s.is_current);
        if (activeSemester) {
            renderCurrentSemester(activeSemester);
        } else {
            renderNoActiveSemester();
        }

    } catch (error) {
        console.error("Помилка завантаження дашборду:", error);
        showToast("Не вдалося оновити дані дашборду", "error");
    }
}

function updateStatsUI(data) {
    if (!data) return;
    
    const setSafeText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val !== undefined ? val : '-';
    };

    setSafeText('teachersCount', data.teachers);
    setSafeText('subjectsCount', data.subjects);
    setSafeText('groupsCount', data.groups);
    setSafeText('roomsCount', data.rooms);
    setSafeText('weeklyLoadCount', data.weekly_load);
    setSafeText('semestersCount', data.semesters);
}

function renderCurrentSemester(semester) {
    const container = document.getElementById('currentSemesterContainer');
    const template = document.getElementById('semesterTemplate');
    
    if (!container || !template) return;

    const clone = template.cloneNode(true);
    clone.style.display = 'block';
    clone.id = 'activeSemesterCard'; 
    const start = new Date(semester.start_date);
    const end = new Date(semester.end_date);
    const today = new Date();

    clone.querySelector('#semName').textContent = semester.name;
    clone.querySelector('#semDates').textContent = 
        `${formatDate(start)} - ${formatDate(end)}`;

    const diffTime = Math.abs(end - start);
    const totalWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24) / 7);
    clone.querySelector('#semDuration').textContent = `${totalWeeks} тижнів`;

    let statusText, statusClass, weekInfoHTML;

    if (today < start) {
        statusText = "Ще не розпочався";
        statusClass = "pending";
        weekInfoHTML = statusText;
    } else if (today > end) {
        statusText = "Завершено";
        statusClass = "finished";
        weekInfoHTML = statusText;
    } else {
        statusText = "Активний";
        statusClass = "active";
        
        const timeFromStart = today - start;
        const currentWeekNum = Math.floor(timeFromStart / (1000 * 60 * 60 * 24) / 7) + 1;
        
        const weekType = (currentWeekNum % 2 !== 0) ? "Чисельник" : "Знаменник";
        weekInfoHTML = `${currentWeekNum}-й тиждень <span class="badge-week">${weekType}</span>`;
    }

    const statusSpan = clone.querySelector('#semStatus');
    statusSpan.textContent = statusText;
    statusSpan.classList.add(statusClass);

    clone.querySelector('#currentWeekInfo').innerHTML = weekInfoHTML;

    container.innerHTML = '';
    container.appendChild(clone);
}

function renderNoActiveSemester() {
    const container = document.getElementById('currentSemesterContainer');
    if (container) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                <p style="color: var(--text-muted); margin-bottom: 10px;">Немає активного семестру.</p>
                <a href="/admin/semesters" class="btn btn-view" style="font-size: 0.9rem;">Налаштувати</a>
            </div>
        `;
    }
}

function formatDate(date) {
    return date.toLocaleDateString('uk-UA', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
    });
}

let currentDate = new Date();

function generateCalendar() {
    const calendar = document.getElementById('calendar');
    if (!calendar) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const monthNames = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    const monthDisplay = document.getElementById('currentMonth');
    if (monthDisplay) monthDisplay.textContent = `${monthNames[month]} ${year}`;

    calendar.innerHTML = '';

    ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].forEach(day => {
        const el = document.createElement('div');
        el.className = 'calendar-header';
        el.textContent = day;
        calendar.appendChild(el);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const startOffset = (firstDay === 0) ? 6 : firstDay - 1;

    for (let i = 0; i < startOffset; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        calendar.appendChild(empty);
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = day;

        const dateToCheck = new Date(year, month, day);
        const dayOfWeek = dateToCheck.getDay();

        if (dateToCheck.toDateString() === today.toDateString()) {
            dayElement.classList.add('today');
        } else if (dayOfWeek === 0 || dayOfWeek === 6) {
            dayElement.classList.add('weekend');
        } else {
            dayElement.classList.add('workday');
        }
        
        calendar.appendChild(dayElement);
    }
}

window.changeMonth = function(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    generateCalendar();
};