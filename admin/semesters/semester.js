
let semesters = [];
let currentEditId = null;
let currentDeleteId = null;

async function loadSemesters() {
    showLoading('tableContainer', 'Завантаження семестрів...');
    try {
        semesters = await apiRequest('/semesters/');
        renderTable(semesters);
    } catch (error) {
        showError('tableContainer', 'Не вдалося завантажити список семестрів');
        showToast('Помилка завантаження даних', 'error');
    }
}

function renderTable(data) {
    const container = document.getElementById('tableContainer');
    
    if (data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📅</div>
                <h3>Семестрів поки немає</h3>
                <p>Додайте перший семестр, натиснувши кнопку "Додати семестр"</p>
            </div>
        `;
        return;
    }

    const table = `
        <table>
            <thead>
                <tr>
                    <th style="width: 50px;">Статус</th> 
                    <th>Назва</th>
                    <th>Дати</th>
                    <th style="width: 200px; text-align: center;">Дії</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(semester => `
                    <tr class="${semester.is_current ? 'active-row' : ''}">
                        <td style="text-align: center;">
                            ${semester.is_current 
                                ? '<span class="status-badge active" title="Поточний семестр">★</span>' 
                                : `<button class="btn-icon-small" onclick="setAsCurrent(${semester.id})" title="Зробити поточним">☆</button>`
                            }
                        </td>
                        <td>
                            <strong>${semester.name || 'Без назви'}</strong>
                            ${semester.is_current ? '<span class="text-green">(Поточний)</span>' : ''}
                        </td>
                        <td>
                            <div class="semester-dates">
                                <span class="date-badge">З: ${semester.start_date}</span>
                                <span class="date-badge">По: ${semester.end_date}</span>
                            </div>
                        </td>
                        <td>
                            <div class="table-actions" style="justify-content: center;">
                                <a href="detail.html?id=${semester.id}" class="btn btn-view" title="Деталі">👁️</a>
                                <button class="btn btn-edit" onclick="openEditModal(${semester.id})" title="Редагувати">✏️</button>
                                <button class="btn btn-delete" onclick="openDeleteModal(${semester.id}, '${semester.name}')" title="Видалити">🗑️</button>
                                <button class="btn btn-warning" onclick="generateSchedule(${semester.id})" title="Генерувати розклад">⚡</button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    container.innerHTML = table;
}

async function setAsCurrent(id) {
    if (!confirm('Зробити цей семестр поточним? Це змінить активний розклад для всіх користувачів.')) return;

    try {
        await apiRequest(`/semesters/${id}/set_current/`, 'POST');
        loadSemesters();
        showToast('Поточний семестр змінено', 'success');
    } catch (error) {
        showToast('Помилка оновлення статусу', 'error');
    }
}

function toggleConfig() {
    const checkbox = document.getElementById('enableGeneration');
    const content = document.getElementById('configContent');
    
    if (checkbox.checked) {
        content.classList.add('show');
    } else {
        content.classList.remove('show');
    }
}

function addTimeSlot(start = '', end = '') {
    const container = document.getElementById('timeSlotsList');
    const div = document.createElement('div');
    div.className = 'time-slot-item';
    div.style.marginBottom = '10px';
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.alignItems = 'center';
    
    div.innerHTML = `
        <input type="time" class="slot-start form-input" value="${start}" required>
        <span>—</span>
        <input type="time" class="slot-end form-input" value="${end}" required>
        <button type="button" class="btn btn-delete btn-sm" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(div);
}

function openAddModal() {
    currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Додати семестр';
    document.getElementById('semesterForm').reset();
    
    document.getElementById('enableGeneration').checked = false;
    document.getElementById('configContent').classList.remove('show');
    
    document.getElementById('timeSlotsList').innerHTML = '';
    const defaultSlots = [
        ["08:30", "09:50"],
        ["10:10", "11:30"],
        ["11:50", "13:10"],
        ["13:30", "14:50"]
    ];
    defaultSlots.forEach(slot => addTimeSlot(slot[0], slot[1]));
    
    document.querySelectorAll('input[name="weekend"]').forEach(cb => {
        cb.checked = ['Saturday', 'Sunday'].includes(cb.value);
    });

    showModal('semesterModal');
}

function openEditModal(id) {
    const semester = semesters.find(s => s.id === id);
    if (!semester) return;

    currentEditId = id;
    document.getElementById('modalTitle').textContent = 'Редагувати семестр';
    document.getElementById('semesterName').value = semester.name || '';
    document.getElementById('startDate').value = semester.start_date || '';
    document.getElementById('endDate').value = semester.end_date || '';
    
    document.getElementById('enableGeneration').checked = false;
    document.getElementById('configContent').classList.remove('show');
    
    const config = semester.configuration || {};
    
    document.getElementById('timeSlotsList').innerHTML = '';
    const slots = config.time_schedule || [
        ["08:30", "09:50"],
        ["10:10", "11:30"],
        ["11:50", "13:10"],
        ["13:30", "14:50"]
    ];
    slots.forEach(slot => addTimeSlot(slot[0], slot[1]));

    const weekends = config.weekends || ['Saturday', 'Sunday'];
    document.querySelectorAll('input[name="weekend"]').forEach(cb => {
        cb.checked = weekends.includes(cb.value);
    });

    document.getElementById('excludedDates').value = (config.dates_excluded || []).join('\n');
    document.getElementById('includedDates').value = (config.dates_included || []).join('\n');

    showModal('semesterModal');
}

function openDeleteModal(id, name) {
    currentDeleteId = id;
    document.getElementById('deleteSemesterName').textContent = name;
    showModal('deleteModal');
}

document.getElementById('semesterForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        name: document.getElementById('semesterName').value.trim(),
        start_date: document.getElementById('startDate').value,
        end_date: document.getElementById('endDate').value
    };

    if (document.getElementById('enableGeneration').checked) {
        const weekends = Array.from(document.querySelectorAll('input[name="weekend"]:checked'))
            .map(cb => cb.value);

        const timeSchedule = Array.from(document.querySelectorAll('.time-slot-item')).map(div => {
            return [
                div.querySelector('.slot-start').value,
                div.querySelector('.slot-end').value
            ];
        });

        const excludedDates = document.getElementById('excludedDates').value
            .split('\n').map(d => d.trim()).filter(d => d);
        
        const includedDates = document.getElementById('includedDates').value
            .split('\n').map(d => d.trim()).filter(d => d);

        data.generation_config = {
            weekends: weekends,
            time_schedule: timeSchedule,
            dates_excluded: excludedDates,
            dates_included: includedDates,
            day_time_excluded: {}, 
            date_time_excluded: {}
        };
    }

    try {
        const btnSave = e.target.querySelector('.btn-save');
        const originalText = btnSave.textContent;
        btnSave.textContent = '⏳ Збереження...';
        btnSave.disabled = true;

        if (currentEditId) {
            await apiRequest(`/semesters/${currentEditId}/`, 'PUT', data);
            showToast('Семестр оновлено', 'success');
        } else {
            await apiRequest('/semesters/', 'POST', data);
            showToast('Семестр створено', 'success');
        }
        
        hideModal('semesterModal');
        loadSemesters();
        
        btnSave.textContent = originalText;
        btnSave.disabled = false;

    } catch (error) {
        showToast('Помилка: ' + error.message, 'error');
        e.target.querySelector('.btn-save').disabled = false;
        e.target.querySelector('.btn-save').textContent = '💾 Зберегти';
    }
});

async function confirmDelete() {
    if (!currentDeleteId) return;

    try {
        await apiRequest(`/semesters/${currentDeleteId}/`, 'DELETE');
        hideModal('deleteModal');
        loadSemesters();
        showToast('Семестр видалено', 'success');
    } catch (error) {
        showToast('Помилка при видаленні: ' + error.message, 'error');
    }
}

async function generateSchedule(semesterId) {
    if (!confirm('⚠️ УВАГА: Це видалить поточний чорновик розкладу для цього семестру. Продовжити?')) {
        return;
    }
    
    showToast('Генерація розпочата, зачекайте...', 'info');

    try {
        const data = await apiRequest('/generate-schedule/', 'POST', { semester_id: semesterId });

        if (data.success) {
            let msg = `Розклад згенеровано! Створено: ${data.created}`;
            if (data.failed > 0) msg += `, Помилок: ${data.failed}`;
            
            showToast(msg, data.failed > 0 ? 'warning' : 'success');
            console.log("Generation Logs:", data.logs);
        }

    } catch (error) {
        showToast('Помилка генерації: ' + error.message, 'error');
    }
}

window.setAsCurrent = setAsCurrent;
window.generateSchedule = generateSchedule;

loadSemesters();