let groups = [];
let currentEditId = null;
let currentDeleteId = null;

async function loadGroups() {
    showLoading('tableContainer', 'Завантаження груп...');
    try {
        groups = await apiRequest('/groups/');
        renderTable(groups);
    } catch (error) {
        showError('tableContainer', 'Не вдалося завантажити список груп');
        showToast('Помилка завантаження даних', 'error');
    }
}

function renderTable(data) {
    const container = document.getElementById('tableContainer');
    
    if (data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📚</div>
                <h3>Груп поки немає</h3>
                <p>Додайте першу групу, натиснувши кнопку "Додати групу"</p>
            </div>
        `;
        return;
    }

    const table = `
        <table>
            <thead>
                <tr>
                    <th>Назва</th>
                    <th>Кількість студентів</th>
                    <th>Рік вступу</th>
                    <th>Курс</th>
                    <th>Дії</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(group => `
                    <tr>
                        <td><strong>${group.name || 'Без назви'}</strong></td>
                        <td>${group.amount || 0}</td>
                        <td>${group.start_year || '-'}</td>
                        <td>${calculateCourse(group.start_year)}</td>
                        <td>
                            <div class="table-actions">
                                <button class="btn btn-edit" onclick="openEditModal(${group.id})">
                                    ✏️ Редагувати
                                </button>
                                <button class="btn btn-delete" onclick="openDeleteModal(${group.id}, '${group.name}')">
                                    🗑️ Видалити
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}

function calculateCourse(startYear) {
    if (!startYear) return '-';
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    
    let course = currentYear - startYear;
    if (currentMonth >= 8) course += 1;
    
    if (course <= 0) return 'Абітурієнт';
    if (course > 6) return 'Випускник';
    return `${course} курс`;
}

function openAddModal() {
    currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Додати групу';
    document.getElementById('groupForm').reset();
    showModal('groupModal');
}

function openEditModal(id) {
    const group = groups.find(g => g.id === id);
    if (!group) return;

    currentEditId = id;
    document.getElementById('modalTitle').textContent = 'Редагувати групу';
    document.getElementById('groupName').value = group.name || '';
    document.getElementById('studentCount').value = group.amount || '';
    document.getElementById('startYear').value = group.start_year || '';
    showModal('groupModal');
}

function openDeleteModal(id, name) {
    currentDeleteId = id;
    document.getElementById('deleteGroupName').textContent = name;
    showModal('deleteModal');
}

document.getElementById('groupForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        name: document.getElementById('groupName').value.trim(),
        amount: parseInt(document.getElementById('studentCount').value),
        start_year: parseInt(document.getElementById('startYear').value)
    };

    if (!data.name) return showToast('Введіть назву групи', 'error');

    try {
        if (currentEditId) {
            await apiRequest(`/groups/${currentEditId}/`, 'PUT', data);
            showToast('Групу оновлено', 'success');
        } else {
            await apiRequest('/groups/', 'POST', data);
            showToast('Групу створено', 'success');
        }

        hideModal('groupModal');
        loadGroups();
    } catch (error) {
        showToast('Помилка: ' + error.message, 'error');
    }
});

async function confirmDelete() {
    if (!currentDeleteId) return;

    try {
        await apiRequest(`/groups/${currentDeleteId}/`, 'DELETE');
        hideModal('deleteModal');
        loadGroups();
        showToast('Групу видалено', 'success');
    } catch (error) {
        showToast('Помилка видалення: ' + error.message, 'error');
    }
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = groups.filter(group => {
        const name = (group.name || group.group_name || '').toLowerCase();
        return name.includes(searchTerm);
    });
    renderTable(filtered);
});

loadGroups();