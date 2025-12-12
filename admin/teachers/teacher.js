
let teachers = [];
let allSubjects = [];
let currentEditId = null;
let currentDeleteId = null;

async function init() {
    await loadSubjects();
    await loadTeachers();
}

async function loadTeachers() {
    showLoading('tableContainer', 'Завантаження викладачів...');
    try {
        teachers = await apiRequest('/teachers/');
        renderTable(teachers);
    } catch (error) {
        showError('tableContainer', 'Не вдалося завантажити список викладачів');
        showToast('Помилка завантаження даних', 'error');
    }
}

async function loadSubjects() {
    try {
        allSubjects = await apiRequest('/subjects/');
    } catch (error) {
        console.error('Failed to load subjects:', error);
    }
}


function renderTable(data) {
    const container = document.getElementById('tableContainer');
    
    if (data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👨‍🏫</div>
                <h3>Викладачів поки немає</h3>
                <p>Додайте першого викладача</p>
            </div>`;
        return;
    }

    const rows = data.map(teacher => {
        const subjectsHtml = (teacher.subjects_details && teacher.subjects_details.length > 0)
            ? `<div class="subject-tags">
                ${teacher.subjects_details.map(s => `<span class="subject-tag">${s.name}</span>`).join('')}
               </div>`
            : `<span class="no-subjects-tag">Предмети не призначені</span>`;

        const safeName = (teacher.name || '').replace(/'/g, "\\'");

        return `
            <tr>
                <td><strong>${teacher.name}</strong></td>
                <td>${subjectsHtml}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-edit" onclick="openEditModal(${teacher.id})">✏️</button>
                        <button class="btn btn-delete" onclick="openDeleteModal(${teacher.id}, '${safeName}')">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th style="width: 30%;">ПІБ</th>
                    <th style="width: 55%;">Предмети</th>
                    <th style="width: 15%;">Дії</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}


function openAddModal() {
    currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Додати викладача';
    document.getElementById('teacherForm').reset();
    document.getElementById('subjectsSection').style.display = 'none';
    showModal('teacherModal');
}

function openEditModal(id) {
    const teacher = teachers.find(t => t.id === id);
    if (!teacher) return;

    currentEditId = id;
    document.getElementById('modalTitle').textContent = 'Редагувати викладача';
    document.getElementById('teacherName').value = teacher.name;
    document.getElementById('subjectsSection').style.display = 'block';
    renderTeacherSubjects(teacher.subjects_details || []);
    
    showModal('teacherModal');
}

function openDeleteModal(id, name) {
    currentDeleteId = id;
    document.getElementById('deleteTeacherName').textContent = name;
    showModal('deleteModal');
}


document.getElementById('teacherForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('teacherName').value.trim();
    if (!name) return showToast('Введіть ім\'я!', 'error');

    const payload = { name };
    
    try {
        if (currentEditId) {
            await apiRequest(`/teachers/${currentEditId}/`, 'PUT', payload);
            showToast('Дані викладача оновлено', 'success');
            hideModal('teacherModal');
        } else {
            const result = await apiRequest('/teachers/', 'POST', payload);
            showToast('Викладача створено. Додайте предмети.', 'success');
            openEditModal(result.id); 
            loadTeachers();
            return; 
        }
        loadTeachers();
    } catch (err) {
        showToast('Помилка: ' + err.message, 'error');
    }
});

async function confirmDelete() {
    if (!currentDeleteId) return;
    try {
        await apiRequest(`/teachers/${currentDeleteId}/`, 'DELETE');
        hideModal('deleteModal');
        loadTeachers();
        showToast('Викладача видалено', 'success');
    } catch (err) {
        showToast('Не вдалося видалити: ' + err.message, 'error');
    }
}


function renderTeacherSubjects(subjects) {
    const list = document.getElementById('teacherSubjects');
    const select = document.getElementById('subjectSelect');
    
    if (subjects.length === 0) {
        list.innerHTML = '<div class="no-subjects">Предметів не додано</div>';
    } else {
        list.innerHTML = subjects.map(sub => `
            <div class="subject-item">
                <span>${sub.name}</span>
                <button type="button" class="btn btn-delete btn-sm" 
                    style="padding: 4px 8px; font-size: 12px;"
                    onclick="manageSubject(${sub.id}, 'remove')">✕</button>
            </div>
        `).join('');
    }

    const assignedIds = subjects.map(s => s.id);
    const available = allSubjects.filter(s => !assignedIds.includes(s.id));
    
    select.innerHTML = '<option value="">-- Оберіть предмет --</option>' +
        available.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

async function manageSubject(subjectId, action) {
    if (!currentEditId) return;
    
    if (action === 'add') {
        const select = document.getElementById('subjectSelect');
        subjectId = parseInt(select.value);
        if (!subjectId) return showToast('Оберіть предмет зі списку', 'error');
    } else if (action === 'remove') {
         if (!confirm('Видалити предмет у цього викладача?')) return;
    }

    try {
        await apiRequest(`/teachers/${currentEditId}/manage_subjects/`, 'POST', {
            subject_id: subjectId,
            action: action
        });

        const updatedTeacher = await apiRequest(`/teachers/${currentEditId}/`);
        renderTeacherSubjects(updatedTeacher.subjects_details);
        
        const idx = teachers.findIndex(t => t.id === currentEditId);
        if (idx !== -1) teachers[idx] = updatedTeacher;
        renderTable(teachers);
        
        if(action === 'add') showToast('Предмет додано', 'success');

    } catch (err) {
        showToast('Помилка: ' + err.message, 'error');
    }
}

window.addSubjectToTeacher = () => manageSubject(null, 'add');

init();