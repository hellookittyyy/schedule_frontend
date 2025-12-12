let subjects = [];
let currentEditId = null;
let currentDeleteId = null;

async function loadSubjects() {
    showLoading('tableContainer', 'Завантаження предметів...');
    try {
        subjects = await apiRequest('/subjects/');
        renderTable(subjects);
    } catch (error) {
        showError('tableContainer', 'Не вдалося завантажити список предметів');
        showToast('Помилка з\'єднання з сервером', 'error');
    }
}

function renderTable(data) {
    const container = document.getElementById('tableContainer');
    
    if (data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📖</div>
                <h3>Предметів поки немає</h3>
                <p>Додайте перший предмет</p>
            </div>`;
        return;
    }

    const rows = data.map(subject => {
        const safeName = (subject.name || '').replace(/'/g, "\\'");
        const description = subject.description || '<em style="color: #bdc3c7;">Опис відсутній</em>';
        
        return `
            <tr>
                <td><strong>${subject.name}</strong></td>
                <td><div class="subject-description" title="${subject.description || ''}">${description}</div></td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-edit" onclick="openEditModal(${subject.id})">✏️</button>
                        <button class="btn btn-delete" onclick="openDeleteModal(${subject.id}, '${safeName}')">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th style="width: 30%;">Назва</th>
                    <th style="width: 55%;">Опис</th>
                    <th style="width: 15%;">Дії</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function openAddModal() {
    currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Додати предмет';
    document.getElementById('subjectForm').reset();
    updateCharCount();
    showModal('subjectModal');
}

function openEditModal(id) {
    const subject = subjects.find(s => s.id === id);
    if (!subject) return;

    currentEditId = id;
    document.getElementById('modalTitle').textContent = 'Редагувати предмет';
    document.getElementById('subjectName').value = subject.name || '';
    document.getElementById('subjectDescription').value = subject.description || '';
    updateCharCount();
    showModal('subjectModal');
}

function openDeleteModal(id, name) {
    currentDeleteId = id;
    document.getElementById('deleteSubjectName').textContent = name;
    showModal('deleteModal');
}

function updateCharCount() {
    const len = document.getElementById('subjectDescription').value.length;
    document.getElementById('charCount').textContent = len;
}

document.getElementById('subjectDescription').addEventListener('input', updateCharCount);

document.getElementById('subjectForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        name: document.getElementById('subjectName').value.trim(),
        description: document.getElementById('subjectDescription').value.trim()
    };

    if (!data.name) return showToast('Назва предмету обов\'язкова!', 'error');

    try {
        if (currentEditId) {
            await apiRequest(`/subjects/${currentEditId}/`, 'PUT', data);
            showToast('Предмет оновлено', 'success');
        } else {
            await apiRequest('/subjects/', 'POST', data);
            showToast('Предмет створено', 'success');
        }
        
        hideModal('subjectModal');
        loadSubjects();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

async function confirmDelete() {
    if (!currentDeleteId) return;

    try {
        await apiRequest(`/subjects/${currentDeleteId}/`, 'DELETE');
        hideModal('deleteModal');
        loadSubjects();
        showToast('Предмет видалено', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = subjects.filter(sub => {
        const name = (sub.name || '').toLowerCase();
        const desc = (sub.description || '').toLowerCase();
        return name.includes(term) || desc.includes(term);
    });
    renderTable(filtered);
});

loadSubjects();