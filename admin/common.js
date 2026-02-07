const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const API_BASE_URL = isLocal
    ? 'http://127.0.0.1:8000/api'
    : 'https://api.velab.space/schedule/api';

async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

    // Перевірка на HTML (помилка сервера)
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("text/html")) {
        throw new Error("Сервер повернув помилку (HTML). Перевірте URL або маршрути в Django.");
    }

    if (response.status === 204) return true;
    const data = await response.json();

    if (!response.ok) {
        const error = new Error(data.detail || 'Сталася помилка');
        error.status = response.status; // Важливо для обробки 409 Conflict
        throw error;
    }
    return data;
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('show');
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('show');
}

window.onclick = (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('show');
    }
};

function showLoading(containerId, message = 'Завантаження...') {
    document.getElementById(containerId).innerHTML = `
        <div class="loading">
            <div style="font-size: 48px; margin-bottom: 20px;">⏳</div>
            <div>${message}</div>
        </div>
    `;
}

function showError(containerId, message) {
    document.getElementById(containerId).innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <h3>Помилка</h3>
            <p>${message}</p>
        </div>
    `;
}

/**
 * Відображає спливаюче повідомлення
 * @param {string} message - Текст повідомлення
 * @param {string} type - Тип: 'success', 'error', 'info'
 */
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };

    toast.innerHTML = `
        <span style="font-size: 1.2em;">${icons[type] || ''}</span>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    const removeToast = () => {
        toast.classList.add('hide');
        toast.addEventListener('animationend', () => toast.remove());
    };

    const timeout = setTimeout(removeToast, 3000);

    toast.onclick = () => {
        clearTimeout(timeout);
        removeToast();
    };
}