function renderSidebar() {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;

    const currentPath = window.location.pathname;

    const menuItems = [
        { href: '/admin/semesters', icon: '📅', text: 'Графік навчання' },
        { href: '/admin/', icon: '📊', text: 'Дашборд', exact: true },
        { href: '/admin/subjects', icon: '📖', text: 'Предмети' },
        { href: '/admin/teachers', icon: '👨‍🏫', text: 'Викладачі' },
        { href: '/admin/groups', icon: '👥', text: 'Групи' },
        { href: '/admin/streams', icon: '🌊', text: 'Потоки' },
        { href: '/admin/rooms', icon: '🏛️', text: 'Аудиторії' },
        { href: '/admin/study-plans', icon: '📑', text: 'Навчальні плани' },
        { href: '/admin/constraints', icon: '🚫', text: 'Обмеження' },
        { href: '/admin/schedule', icon: '🗓️', text: 'Розклад' },
    ];

    const menuHtml = menuItems.map(item => {
        let isActive = false;
        
        if (item.exact) {
            isActive = currentPath === item.href || currentPath === item.href + 'index.html';
        } else {
            const cleanPath = currentPath.replace('.html', '');
            const cleanHref = item.href.replace('.html', '');
            isActive = cleanPath.includes(cleanHref);
        }

        const activeClass = isActive ? 'active' : '';

        return `
            <li class="menu-item ${activeClass}">
                <a href="${item.href}" class="menu-link">
                    <span class="menu-icon">${item.icon}</span>
                    <span>${item.text}</span>
                </a>
            </li>
        `;
    }).join('');

    sidebarContainer.innerHTML = `
        <div class="sidebar">
            <div class="sidebar-header">
                <h2>📚 Розклад</h2>
            </div>
            <ul class="menu">
                ${menuHtml}
            </ul>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', renderSidebar);