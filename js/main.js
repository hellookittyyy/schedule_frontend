const groupInput = document.getElementById('group');
const groupIdInput = document.getElementById('groupId'); 
const groupDropdown = document.getElementById('groupDropdown');

const teacherInput = document.getElementById('teacher');
const teacherDropdown = document.getElementById('teacherDropdown');

let groupDebounceTimer;
let teacherDebounceTimer;

const API_BASE = 'http://127.0.0.1:8000/api';

document.addEventListener('DOMContentLoaded', () => {
    loadActiveSemester();
});

const showGroupDropdownIfNeeded = () => {
    const searchText = groupInput.value.trim();
    if (searchText.length > 0) {
        fetchGroups(searchText);
    } else {
        groupDropdown.classList.remove('show');
    }
};

groupInput.addEventListener('focus', showGroupDropdownIfNeeded);

groupInput.addEventListener('input', function() {
    groupIdInput.value = ''; 
    
    const searchText = this.value.trim();
    clearTimeout(groupDebounceTimer);
    
    if (searchText.length === 0) {
        groupDropdown.classList.remove('show');
        return;
    }

    groupDebounceTimer = setTimeout(() => {
        fetchGroups(searchText);
    }, 300);
});

async function fetchGroups(searchText) {
    try {
        const response = await fetch(`${API_BASE}/groups/?search=${encodeURIComponent(searchText)}`);
        if (!response.ok) throw new Error('Error');
        const data = await response.json();
        let results = data.results || data;

        if (!results || results.length === 0) {
            const fallback = await fetch(`${API_BASE}/groups/`);
            if (fallback.ok) {
                const full = await fallback.json();
                results = full.results || full;
            }
        }

        displayGroups(results);
    } catch (error) {
        console.error(error);
    }
}

function displayGroups(groups) {
    groupDropdown.innerHTML = '';

    if (!groups || groups.length === 0) {
        groupDropdown.classList.remove('show');
        return;
    }
    // Simple behavior: show when input contains letters or digits and match by substring
    const query = (groupInput.value || '').trim().toLowerCase();
    if (!query) {
        groupDropdown.classList.remove('show');
        return;
    }

    if (!/[\p{L}\p{N}]/u.test(query)) {
        groupDropdown.classList.remove('show');
        return;
    }

    const filtered = groups.filter(g => {
        const name = (g.name || '').toLowerCase();
        return name && name.includes(query);
    });

    if (!filtered.length) {
        groupDropdown.classList.remove('show');
        return;
    }

    filtered.forEach(group => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = group.name;
        item.addEventListener('click', () => {
            groupInput.value = group.name;
            groupIdInput.value = group.id; 
            groupDropdown.classList.remove('show');
        });
        groupDropdown.appendChild(item);
    });

    groupDropdown.classList.add('show');
}

const showTeacherDropdownIfNeeded = () => {
    const searchText = teacherInput.value.trim();
    if (searchText.length > 0) {
        fetchTeachers(searchText);
    } else {
        teacherDropdown.classList.remove('show');
    }
};

teacherInput.addEventListener('focus', showTeacherDropdownIfNeeded);

teacherInput.addEventListener('input', function() {
    const searchText = this.value.trim();
    clearTimeout(teacherDebounceTimer);
    
    if (searchText.length === 0) {
        teacherDropdown.classList.remove('show');
        return;
    }

    teacherDebounceTimer = setTimeout(() => {
        fetchTeachers(searchText);
    }, 300);
});

async function fetchTeachers(searchText) {
    try {
        const response = await fetch(`${API_BASE}/teachers/?search=${encodeURIComponent(searchText)}`);
        if (!response.ok) throw new Error('Error');
        const data = await response.json();
        let results = data.results || data;

        // If backend returned no matches, fetch full list and client-filter.
        if (!results || results.length === 0) {
            const fallback = await fetch(`${API_BASE}/teachers/`);
            if (fallback.ok) {
                const full = await fallback.json();
                results = full.results || full;
            }
        }

        displayTeachers(results);
    } catch (error) {
        console.error(error);
    }
}

function displayTeachers(teachers) {
    teacherDropdown.innerHTML = '';

    if (!teachers || teachers.length === 0) {
        teacherDropdown.classList.remove('show');
        return;
    }
    // Simple behavior: show when input contains letters or digits and match by substring
    const query = (teacherInput.value || '').trim().toLowerCase();
    if (!query) {
        teacherDropdown.classList.remove('show');
        return;
    }

    if (!/[\p{L}\p{N}]/u.test(query)) {
        teacherDropdown.classList.remove('show');
        return;
    }

    const filtered = teachers.filter(t => {
        const name = (t.name || '').toLowerCase();
        return name && name.includes(query);
    });

    if (!filtered.length) {
        teacherDropdown.classList.remove('show');
        return;
    }

    filtered.forEach(teacher => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = teacher.name;
        item.addEventListener('click', () => {
            teacherInput.value = teacher.name;
            teacherDropdown.classList.remove('show');
        });
        teacherDropdown.appendChild(item);
    });

    teacherDropdown.classList.add('show');
}

document.addEventListener('click', function(e) {
    if (e.target !== groupInput && !groupDropdown.contains(e.target)) {
        groupDropdown.classList.remove('show');
    }
    if (e.target !== teacherInput && !teacherDropdown.contains(e.target)) {
        teacherDropdown.classList.remove('show');
    }
});

async function loadActiveSemester() {
    try {
        const response = await fetch(`${API_BASE}/semesters/`);
        if (response.ok) {
            const data = await response.json();
            const activeSemester = data.find(s => s.is_current) || data[0]; 
            
            if (activeSemester) {
                document.getElementById('dateFrom').value = activeSemester.start_date;
                document.getElementById('dateTo').value = activeSemester.end_date;
            }
        }
    } catch (error) {
        console.error(error);
    }
}

async function showSchedule() {
    const teacherName = document.getElementById('teacher').value.trim();
    const groupName = document.getElementById('group').value.trim();
    const groupId = document.getElementById('groupId').value;
    const course = document.getElementById('course').value;
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    const container = document.getElementById('scheduleResults');

    if (!teacherName && !groupName && !course && !dateFrom && !dateTo) {
        alert('Please fill at least one field');
        return;
    }

    container.innerHTML = '<div class="loading-spinner">Searching...</div>';

    const params = new URLSearchParams();
    
    if (groupId) {
        params.append('group_id', groupId);
    } else if (groupName) {
        params.append('group_name', groupName);
    }

    if (teacherName) params.append('teacher_name', teacherName);
    if (course) params.append('course', course);
    
    if (dateFrom) params.append('date_from', dateFrom);
    if (dateTo) params.append('date_to', dateTo);

    try {
        const response = await fetch(`${API_BASE}/lessons/?${params.toString()}`);
        
        if (!response.ok) throw new Error('Server Error');
        
        const data = await response.json();
        const lessons = data.results || data;

        renderSchedule(lessons);

    } catch (error) {
        console.error(error);
        container.innerHTML = `<div class="dropdown-empty" style="text-align:center; color: red;">Error: ${error.message}</div>`;
    }
}

function renderSchedule(lessons) {
    const container = document.getElementById('scheduleResults');
    container.innerHTML = '';

    if (lessons.length === 0) {
        container.innerHTML = '<div class="dropdown-empty" style="text-align:center; padding: 20px;">No lessons found</div>';
        return;
    }

    lessons.sort((a, b) => {
        const dateA = new Date(a.time_slot_details?.date || a.date || '1970-01-01');
        const dateB = new Date(b.time_slot_details?.date || b.date || '1970-01-01');
        if (dateA - dateB !== 0) return dateA - dateB;
        return (a.time_slot_details?.period_number || 0) - (b.time_slot_details?.period_number || 0);
    });

    const lessonsByDate = {};
    lessons.forEach(lesson => {
        const dateKey = lesson.time_slot_details?.date || lesson.date || 'Unknown Date'; 
        if (!lessonsByDate[dateKey]) {
            lessonsByDate[dateKey] = [];
        }
        lessonsByDate[dateKey].push(lesson);
    });

    Object.keys(lessonsByDate).forEach(date => {
        const dayBlock = document.createElement('div');
        dayBlock.className = 'day-block';

        let displayDate = date;
        if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const d = new Date(date);
            displayDate = d.toLocaleDateString('uk-UA', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
            });
            displayDate = displayDate.charAt(0).toUpperCase() + displayDate.slice(1);
        }

        let html = `<div class="day-header">${displayDate}</div>`;

        lessonsByDate[date].forEach(lesson => {
            const details = lesson.study_plan_details || {};
            const slot = lesson.time_slot_details || {};
            const room = lesson.room_details || {};

            let typeClass = '';
            const typeName = (details.class_type || '').toLowerCase();
            if (typeName.includes('лек')) typeClass = 'badge-lection';
            else if (typeName.includes('прак')) typeClass = 'badge-practice';
            else typeClass = 'badge-lab';

            const timeStart = slot.start_time ? slot.start_time.substring(0, 5) : '';
            const timeEnd = slot.end_time ? slot.end_time.substring(0, 5) : '';
            const timeString = timeStart && timeEnd ? `${timeStart} - ${timeEnd}` : '';

            html += `
                <div class="lesson-card">
                    <div class="lesson-time">
                        <div style="font-size: 1.2em;">${slot.period_number || '?'}</div>
                        <div style="font-size: 0.8em; color: #999;">${timeString}</div>
                    </div>
                    <div class="lesson-info">
                        <div class="lesson-subject">${details.subject || 'Subject'}</div>
                        <div class="lesson-details">
                            <span class="detail-item badge ${typeClass}">${details.class_type || 'Type'}</span>
                            <span class="detail-item">👨‍🏫 ${details.teacher || 'TBA'}</span>
                            <span class="detail-item">👥 ${details.group || details.stream || 'Group'}</span>
                            <span class="detail-item">📍 ${room.title || 'TBA'}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        dayBlock.innerHTML = html;
        container.appendChild(dayBlock);
    });
}