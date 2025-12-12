let rooms = [];
let roomTypes = [];
let currentEditId = null;
let currentDeleteId = null;

async function init() {
    showLoading('tableContainer', 'Завантаження аудиторій...');
    try {
        const [roomsData, typesData] = await Promise.all([
            apiRequest('/rooms/'),
            apiRequest('/room_types/')
        ]);
        
        rooms = roomsData;
        roomTypes = typesData;
        
        renderTable(rooms);
        updateRoomTypeSelect();
    } catch (error) {
        showError('tableContainer', 'Не вдалося завантажити дані');
        showToast('Помилка ініціалізації: ' + error.message, 'error');
    }
}

async function loadRooms() {
    try {
        rooms = await apiRequest('/rooms/');
        renderTable(rooms);
    } catch (error) {
        console.error(error);
        showToast('Не вдалося оновити список аудиторій', 'error');
    }
}

async function loadRoomTypes() {
    try {
        roomTypes = await apiRequest('/room_types/');
        updateRoomTypeSelect();
        if (document.getElementById('typesModal').classList.contains('show')) {
            renderTypesList();
        }
    } catch (error) {
        console.error(error);
    }
}

function updateRoomTypeSelect() {
    const select = document.getElementById('roomType');
    select.innerHTML = '<option value="">-- Оберіть тип --</option>' +
        roomTypes.map(type => `<option value="${type.id}">${type.name}</option>`).join('');
}

function renderTable(data) {
    const container = document.getElementById('tableContainer');
    
    if (data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🏛️</div>
                <h3>Аудиторій поки немає</h3>
                <p>Додайте першу аудиторію</p>
            </div>`;
        return;
    }

    const rows = data.map(room => {
        const safeTitle = (room.title || '').replace(/'/g, "\\'");
        const typeBadge = room.room_type_details 
            ? `<span class="badge badge-info" style="background:#e3f2fd; color:#0d47a1;">${room.room_type_details.name}</span>` 
            : '<em style="color: #bdc3c7;">Не вказано</em>';

        return `
            <tr>
                <td><strong>${room.title || 'Без номера'}</strong></td>
                <td>${room.building || '-'}</td>
                <td>${typeBadge}</td>
                <td>${room.capacity || 0} місць</td>
                <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${room.note || ''}">
                    ${room.note || '<em style="color: #bdc3c7;">-</em>'}
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-edit" onclick="openEditModal(${room.id})">✏️</button>
                        <button class="btn btn-delete" onclick="openDeleteModal(${room.id}, '${safeTitle}')">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Аудиторія</th>
                    <th>Корпус</th>
                    <th>Тип</th>
                    <th>Місткість</th>
                    <th>Примітка</th>
                    <th>Дії</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function openAddModal() {
    currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Додати аудиторію';
    document.getElementById('roomForm').reset();
    showModal('roomModal');
}

function openEditModal(id) {
    const room = rooms.find(r => r.id === id);
    if (!room) return;

    currentEditId = id;
    document.getElementById('modalTitle').textContent = 'Редагувати аудиторію';
    document.getElementById('roomTitle').value = room.title || '';
    document.getElementById('roomBuilding').value = room.building || '';
    document.getElementById('roomCapacity').value = room.capacity || '';
    document.getElementById('roomType').value = room.room_type || '';
    document.getElementById('roomNote').value = room.note || '';
    showModal('roomModal');
}

function openDeleteModal(id, title) {
    currentDeleteId = id;
    document.getElementById('deleteRoomName').textContent = title;
    showModal('deleteModal');
}

document.getElementById('roomForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = {
        title: document.getElementById('roomTitle').value.trim(),
        building: document.getElementById('roomBuilding').value.trim(),
        capacity: parseInt(document.getElementById('roomCapacity').value),
        room_type: parseInt(document.getElementById('roomType').value),
        note: document.getElementById('roomNote').value.trim()
    };

    if (!data.title || !data.building || !data.room_type) {
        return showToast('Заповніть обов\'язкові поля', 'error');
    }

    try {
        if (currentEditId) {
            await apiRequest(`/rooms/${currentEditId}/`, 'PUT', data);
            showToast('Аудиторію оновлено', 'success');
        } else {
            await apiRequest('/rooms/', 'POST', data);
            showToast('Аудиторію створено', 'success');
        }
        
        hideModal('roomModal');
        loadRooms();
    } catch (error) {
        showToast(error.message, 'error');
    }
});

async function confirmDelete() {
    if (!currentDeleteId) return;

    try {
        await apiRequest(`/rooms/${currentDeleteId}/`, 'DELETE');
        hideModal('deleteModal');
        loadRooms();
        showToast('Аудиторію видалено', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

function openTypesModal() {
    renderTypesList();
    showModal('typesModal');
}

function renderTypesList() {
    const container = document.getElementById('typesList');
    
    if (roomTypes.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px;">Типів поки немає</div>';
        return;
    }

    container.innerHTML = roomTypes.map(type => `
        <div class="type-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #eee;">
            <div class="type-item-info">
                <h4 style="margin: 0 0 5px 0;">${type.name}</h4>
                <p style="margin: 0; font-size: 0.85em; color: #666;">${type.description || 'Опис відсутній'}</p>
            </div>
            <button class="btn btn-delete btn-sm" style="padding: 4px 8px;" onclick="deleteType(${type.id})">🗑️</button>
        </div>
    `).join('');
}

async function addNewType() {
    const name = document.getElementById('newTypeName').value.trim();
    const description = document.getElementById('newTypeDescription').value.trim();

    if (!name) return showToast('Введіть назву типу', 'error');

    try {
        await apiRequest('/room_types/', 'POST', { name, description });
        
        document.getElementById('newTypeName').value = '';
        document.getElementById('newTypeDescription').value = '';
        await loadRoomTypes();
        showToast('Тип додано', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function deleteType(id) {
    if (!confirm('Видалити цей тип аудиторії?')) return;

    try {
        await apiRequest(`/room_types/${id}/`, 'DELETE');
        await loadRoomTypes();
        showToast('Тип видалено', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = rooms.filter(room => {
        const title = (room.title || '').toLowerCase();
        const building = (room.building || '').toLowerCase();
        const type = room.room_type_details ? room.room_type_details.name.toLowerCase() : '';
        const note = (room.note || '').toLowerCase();
        return title.includes(term) || building.includes(term) || type.includes(term) || note.includes(term);
    });
    renderTable(filtered);
});

init();