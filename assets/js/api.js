const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

const API_BASE_URL = isLocal
    ? 'http://127.0.0.1:8000/api'
    : 'https://api.velab.space/schedule/api';

// Errors carry err.status (HTTP status, 0 for network) and err.data (parsed body).
async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) options.body = JSON.stringify(body);

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${endpoint}`, options);
    } catch (e) {
        e.status = 0;
        e.data = null;
        throw e;
    }

    // Перевірка на HTML (помилка сервера)
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("text/html")) {
        const error = new Error("Сервер повернув помилку (HTML). Перевірте URL або маршрути в Django.");
        error.status = response.status;
        error.data = null;
        throw error;
    }

    if (response.status === 204) return true;
    const data = await response.json();

    if (!response.ok) {
        const error = new Error(data.detail || 'Сталася помилка');
        error.status = response.status; // Важливо для обробки 409 Conflict
        error.data = data;
        throw error;
    }
    return data;
}

window.Api = { BASE: API_BASE_URL, request: apiRequest };
