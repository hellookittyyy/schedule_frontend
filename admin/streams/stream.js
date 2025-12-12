
let streams = [];
let groups = [];
let currentEditId = null;
let currentDeleteId = null;

async function init() {
    showLoading('tableContainer', 'Завантаження даних...');
    try {
        const [groupsData, streamsData] = await Promise.all([
            apiRequest('/groups/'),
            apiRequest('/streams/')
        ]);
        
        groups = groupsData;
        streams = streamsData;
        
        renderTable(streams);
    } catch (error) {
        showError('tableContainer', 'Не вдалося завантажити дані');
        showToast('Помилка ініціалізації: ' + error.message, 'error');
    }
}

async function loadStreams() {
    try {
        streams = await apiRequest('/streams/');
        renderTable(streams);
    } catch (error) {
        console.error('Error loading streams:', error);
    }
}

function renderTable(data) {
    const container = document.getElementById('tableContainer');
    
    if (data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🌊</div>
                <h3>Створіть перший потік</h3>
                <p>Натисніть кнопку "Додати потік"</p>
            </div>
        `;
        return;
    }

    const table = `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Назва потоку</th>
                    <th>Групи</th>
                    <th>Студентів</th>
                    <th>Дії</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(stream => {
                    const groupTags = (stream.groups_details && stream.groups_details.length > 0)
                        ? stream.groups_details.map(g => `<span class="badge badge-info" style="background:#e3f2fd; color:#0d47a1; margin-right:4px;">${g.name}</span>`).join('')
                        : '<span style="color: #999;">Немає груп</span>';

                    const totalStudents = stream.total_students !== undefined 
                        ? stream.total_students
                        : (stream.groups_details 
                            ? stream.groups_details.reduce((sum, g) => sum + (g.amount || 0), 0)
                            : 0);

                    const safeName = (stream.name || '').replace(/'/g, "\\'");

                    return `
                    <tr>
                        <td>#${stream.id}</td>
                        <td><strong>${stream.name}</strong></td>
                        <td><div class="group-tags">${groupTags}</div></td>
                        <td><span class="student-count">${totalStudents} студ.</span></td>
                        <td>
                            <div class="table-actions">
                                <button class="btn btn-edit" onclick="openEditModal(${stream.id})">✏️</button>
                                <button class="btn btn-delete" onclick="openDeleteModal(${stream.id}, '${safeName}')">🗑️</button>
                            </div>
                        </td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}

function renderGroupCheckboxes(selectedGroupIds = []) {
    const container = document.getElementById('groupsCheckboxContainer');
    
    if (groups.length === 0) {
        container.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">Немає доступних груп. Спочатку створіть групи.</p>';
        return;
    }

    container.innerHTML = groups.map(group => {
        const isChecked = selectedGroupIds.includes(group.id);
        const studentCount = group.amount || 0;
        
        return `
        <div class="checkbox-item" style="margin-bottom: 8px;">
            <input 
                type="checkbox" 
                id="group_${group.id}" 
                value="${group.id}"
                ${isChecked ? 'checked' : ''}
                style="margin-right: 8px;"
            >
            <label for="group_${group.id}" style="cursor: pointer;">
                <strong>${group.name}</strong>
                <span style="font-size: 0.85em; color: #666; margin-left: 5px;">(${studentCount} студ.)</span>
            </label>
        </div>
    `}).join('');
}

function openAddModal() {
    currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Додати потік';
    document.getElementById('streamForm').reset();
    renderGroupCheckboxes([]);
    showModal('streamModal');
}

function openEditModal(id) {
    const stream = streams.find(s => s.id === id);
    if (!stream) return;

    currentEditId = id;
    document.getElementById('modalTitle').textContent = 'Редагувати потік';
    document.getElementById('streamName').value = stream.name;
    
    renderGroupCheckboxes(stream.groups || []);
    
    showModal('streamModal');
}

function openDeleteModal(id, name) {
    currentDeleteId = id;
    document.getElementById('deleteStreamName').textContent = name;
    showModal('deleteModal');
}

document.getElementById('streamForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('streamName').value.trim();
    
    const checkedBoxes = document.querySelectorAll('#groupsCheckboxContainer input[type="checkbox"]:checked');
    const selectedGroups = Array.from(checkedBoxes).map(cb => parseInt(cb.value));

    if (!name) return showToast('Введіть назву потоку!', 'error');

    const data = {
        name: name,
        groups: selectedGroups
    };

    try {
        if (currentEditId) {
            await apiRequest(`/streams/${currentEditId}/`, 'PUT', data);
            showToast('Потік оновлено', 'success');
        } else {
            await apiRequest('/streams/', 'POST', data);
            showToast('Потік створено', 'success');
        }

        hideModal('streamModal');
        loadStreams(); 

    } catch (error) {
        showToast('Помилка: ' + error.message, 'error');
    }
});

async function confirmDelete() {
    if (!currentDeleteId) return;

    try {
        await apiRequest(`/streams/${currentDeleteId}/`, 'DELETE');
        hideModal('deleteModal');
        loadStreams();
        showToast('Потік видалено', 'success');
    } catch (error) {
        showToast('Помилка видалення: ' + error.message, 'error');
    }
}

init();