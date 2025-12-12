let constraints = [];
let semestersCache = [];
let studyPlansCache = {}; 

let resourcesCache = {
    teachers: {},
    groups: {},
    rooms: {},
    streams: {}
};

let currentEditId = null;
let currentDeleteId = null;

const DAYS_OF_WEEK = [
    { value: 1, label: 'Понеділок' },
    { value: 2, label: 'Вівторок' },
    { value: 3, label: 'Середа' },
    { value: 4, label: 'Четвер' },
    { value: 5, label: 'П\'ятниця' },
    { value: 6, label: 'Субота' },
    { value: 7, label: 'Неділя' }
];

const CONSTRAINT_TYPES_LIST = [
    { value: 'day_off', label: '⛔ Вихідний день', class: 'type-day-off' },
    { value: 'max_daily_lessons', label: '🔢 Макс. пар на день', class: 'type-max-daily' },
    { value: 'time_block', label: '📅 Матриця часу', class: 'type-time-block' },
    { value: 'sequential_lessons', label: '🔗 Ланцюжок пар', class: 'type-sequential' }
];

document.addEventListener('DOMContentLoaded', init);

async function init() {
    await Promise.all([
        loadSemesters(),
        loadAllResources() 
    ]);

    const currentSem = semestersCache.find(s => s.is_current);
    if (currentSem) {
        document.getElementById('filterSemester').value = currentSem.id;
        document.getElementById('constraintSemester').value = currentSem.id;
    }
    
    await loadConstraints();
    
    setupEventListeners();
    populateConstraintTypes();
}

async function loadAllResources() {
    try {
        const [t, g, r, s] = await Promise.all([
            apiRequest('/teachers/'),
            apiRequest('/groups/'),
            apiRequest('/rooms/'),
            apiRequest('/streams/')
        ]);

        const toMap = (arr) => {
            const list = arr.results || arr;
            return list.reduce((acc, item) => {
                acc[item.id] = item;
                return acc;
            }, {});
        };

        resourcesCache.teachers = toMap(t);
        resourcesCache.groups = toMap(g);
        resourcesCache.rooms = toMap(r);
        resourcesCache.streams = toMap(s);

    } catch (error) {
        console.error("Не вдалося завантажити довідники:", error);
    }
}

async function loadSemesters() {
    try {
        semestersCache = await apiRequest('/semesters/');
        populateSelect('constraintSemester', semestersCache, 'id', 'name');
        populateSelect('filterSemester', semestersCache, 'id', 'name', 'Усі семестри');
    } catch (error) {
        showToast('Не вдалося завантажити семестри', 'error');
    }
}

async function loadConstraints() {
    showLoading('tableContainer', 'Завантаження обмежень...');
    try {
        const semesterFilter = document.getElementById('filterSemester').value;
        let url = '/semester_constraints/';
        
        const promises = [];
        
        if (semesterFilter) {
            url += `?semester=${semesterFilter}`;
            promises.push(apiRequest(`/study_plans/?semester=${semesterFilter}`));
        } else {
            promises.push(Promise.resolve([])); 
        }

        promises.push(apiRequest(url));

        const [plansData, constraintsData] = await Promise.all(promises);

        studyPlansCache = {};
        const plansList = plansData.results || plansData || [];
        plansList.forEach(p => { studyPlansCache[p.id] = p; });

        constraints = constraintsData;
        renderTable(constraints);
    } catch (error) {
        showError('tableContainer', 'Помилка завантаження обмежень');
        console.error(error);
    }
}

function formatTargetInfo(constraint) {
    if (constraint.teacher) {
        const name = resourcesCache.teachers[constraint.teacher]?.name || `#${constraint.teacher}`;
        return `<span class="badge-target badge-teacher">👨‍🏫 ${name}</span>`;
    }
    if (constraint.group) {
        const name = resourcesCache.groups[constraint.group]?.name || `#${constraint.group}`;
        return `<span class="badge-target badge-group">👥 ${name}</span>`;
    }
    if (constraint.room) {
        const room = resourcesCache.rooms[constraint.room];
        const name = room ? `${room.title} (${room.building})` : `#${constraint.room}`;
        return `<span class="badge-target badge-room">🏛️ ${name}</span>`;
    }
    if (constraint.stream) {
        const name = resourcesCache.streams[constraint.stream]?.name || `#${constraint.stream}`;
        return `<span class="badge-target badge-stream">🌊 ${name}</span>`;
    }
    if (constraint.configuration?.type === 'sequential_lessons') {
        return `<span class="badge-target badge-global">🌐 Глобальне</span>`;
    }
    return '-';
}

function getPlanLabel(planId) {
    const plan = studyPlansCache[planId];
    if (!plan) return `Plan #${planId}`;
    
    let label = `<strong>${plan.subject_name || 'Предмет'}</strong>`;
    label += ` <span style="font-size:0.85em; color:#666;">(${plan.class_type_name || 'Заняття'})</span>`;
    
    if (plan.teacher_name) {
        label += ` <br><span style="font-size:0.85em;">👨‍🏫 ${plan.teacher_name}</span>`;
    }
    const target = plan.group_name || plan.stream_name || '';
    if (target) {
        label += ` <span class="badge" style="font-size:0.7em; background:#eee;">${target}</span>`;
    }
    return label;
}

const ConstraintStrategies = {
    'day_off': {
        render: (config) => {
            const selectedDays = config?.days || [];
            return `
                <div class="config-section">
                    <label style="display:block; margin-bottom:10px;">Оберіть дні тижня (вихідні):</label>
                    <div class="day-checkboxes">
                        ${DAYS_OF_WEEK.map(day => `
                            <div class="day-checkbox-item">
                                <input type="checkbox" id="day_${day.value}" value="${day.value}"
                                    ${selectedDays.includes(day.value) ? 'checked' : ''}>
                                <label for="day_${day.value}">${day.label}</label>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        },
        buildPayload: (container) => {
            const checkedDays = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
                .map(cb => parseInt(cb.value));
            return { type: 'day_off', days: checkedDays };
        },
        formatSummary: (config) => {
            if (!config?.days) return '-';
            const dayNames = config.days.map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label || d).join(', ');
            return `<strong>Неробочі дні:</strong> ${dayNames}`;
        }
    },

    'max_daily_lessons': {
        render: (config) => {
            const val = config?.value || 4;
            return `
                <div class="config-section">
                    <label style="display:block; margin-bottom:5px;">Максимальна кількість пар на день:</label>
                    <input type="number" id="maxLessons" class="form-input" min="1" max="10" value="${val}" style="width:100px;">
                </div>`;
        },
        buildPayload: (container) => {
            return { type: 'max_daily_lessons', value: parseInt(container.querySelector('#maxLessons').value) };
        },
        formatSummary: (config) => `<strong>Максимум:</strong> ${config?.value} пар`
    },

    'time_block': {
        render: (config) => {
            const periods = [1, 2, 3, 4, 5, 6, 7, 8];
            const workDays = DAYS_OF_WEEK.slice(0, 5);
            const blocked = config?.value || {};
            return `
                <div class="config-section">
                    <label style="display:block; margin-bottom:10px;">Оберіть заборонені пари:</label>
                    <div class="time-matrix-container">
                        <table class="time-matrix">
                            <thead>
                                <tr>
                                    <th>День</th>
                                    ${periods.map(p => `<th>${p}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${workDays.map(day => `
                                    <tr>
                                        <td class="day-label">${day.label}</td>
                                        ${periods.map(period => {
                                            const isChecked = blocked[day.value]?.includes(period) ? 'checked' : '';
                                            return `<td><input type="checkbox" class="time-checkbox" data-day="${day.value}" data-period="${period}" ${isChecked}></td>`;
                                        }).join('')}
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;
        },
        buildPayload: (container) => {
            const checkboxes = container.querySelectorAll('.time-checkbox:checked');
            const blocked = {};
            checkboxes.forEach(cb => {
                const day = cb.dataset.day;
                const period = parseInt(cb.dataset.period);
                if (!blocked[day]) blocked[day] = [];
                blocked[day].push(period);
            });
            return { type: 'time_block', value: blocked };
        },
        formatSummary: (config) => {
            if (!config?.value) return '-';
            const dayMap = {1:'Пн', 2:'Вт', 3:'Ср', 4:'Чт', 5:'Пт', 6:'Сб', 7:'Нд'};
            
            return Object.keys(config.value).map(d => {
                const periods = config.value[d].sort((a,b)=>a-b).join(',');
                return `<b>${dayMap[d] || d}</b>: [${periods}]`;
            }).join('; ');
        }
    },

    'sequential_lessons': {
        render: (config) => {
            return `
                <div class="config-section">
                    <div id="seqWarning" style="color:#e74c3c; margin-bottom:10px; font-size:0.9em; display:none;">
                        ⚠️ Спочатку оберіть семестр у верхньому полі!
                    </div>
                    <div class="sequential-grid">
                        <div class="form-group">
                            <label>1. Опорний план (Лідер):</label>
                            <select id="seqLeaderPlan" class="form-input"><option value="">⏳ Оберіть семестр...</option></select>
                        </div>
                        <div style="text-align:center; color:#e67e22; font-weight:bold;">⬇️ ПОТІМ ⬇️</div>
                        <div class="form-group">
                            <label>2. Залежний план (Послідовник):</label>
                            <select id="seqFollowerPlan" class="form-input" disabled><option value="">-- Спочатку лідер --</option></select>
                        </div>
                        <div class="form-group">
                            <label>Розрив (пар між ними):</label>
                            <input type="number" id="seqGap" class="form-input" value="${config?.value?.time_gap || 1}" min="0">
                        </div>
                    </div>
                </div>`;
        },
        postRender: async (container, config) => {
            const semesterId = document.getElementById('constraintSemester').value;
            const leaderSelect = container.querySelector('#seqLeaderPlan');
            const warningDiv = container.querySelector('#seqWarning');

            if (!semesterId) {
                if (warningDiv) warningDiv.style.display = 'block';
                leaderSelect.disabled = true;
                return;
            }
            if (warningDiv) warningDiv.style.display = 'none';

            let plans = [];
            try {
                const res = await apiRequest(`/study_plans/?semester=${semesterId}`);
                plans = res.results || res;
            } catch (e) {
                leaderSelect.innerHTML = '<option>❌ Помилка завантаження</option>';
                return;
            }

            if (plans.length === 0) {
                leaderSelect.innerHTML = '<option value="">(Планів немає)</option>';
                leaderSelect.disabled = true;
                return;
            }

            const formatPlan = (p) => `${p.subject_name} [${p.class_type_name}] — ${p.teacher_name} (${p.group_name || p.stream_name})`;

            leaderSelect.disabled = false;
            leaderSelect.innerHTML = '<option value="">-- Оберіть план-лідер --</option>' + 
                plans.map(p => `<option value="${p.id}" ${p.id == config?.value?.leader_plan_id ? 'selected' : ''}>${formatPlan(p)}</option>`).join('');

            const followerSelect = container.querySelector('#seqFollowerPlan');
            
            const populateFollowers = (leaderId) => {
                if (!leaderId) {
                    followerSelect.disabled = true;
                    return;
                }
                const leader = plans.find(p => p.id == leaderId);
                const relevant = plans.filter(p => p.id != leaderId);
                
                followerSelect.disabled = false;
                followerSelect.innerHTML = '<option value="">-- Оберіть план-послідовник --</option>' + 
                    relevant.map(p => {
                        const style = (leader && p.subject === leader.subject) ? 'font-weight:bold; color:#0369a1;' : '';
                        return `<option value="${p.id}" style="${style}" ${p.id == config?.value?.follower_plan_id ? 'selected' : ''}>${formatPlan(p)}</option>`;
                    }).join('');
            };

            leaderSelect.onchange = (e) => populateFollowers(e.target.value);
            if (leaderSelect.value) populateFollowers(leaderSelect.value);
        },
        buildPayload: (container) => {
            const leaderSelect = container.querySelector('#seqLeaderPlan');
            const followerSelect = container.querySelector('#seqFollowerPlan');
            const leaderId = parseInt(leaderSelect.value);
            const followerId = parseInt(followerSelect.value);
            const gap = parseInt(container.querySelector('#seqGap').value);

            if (!leaderId || !followerId) return null;

            const leaderText = leaderSelect.options[leaderSelect.selectedIndex].text;
            const followerText = followerSelect.options[followerSelect.selectedIndex].text;

            return {
                type: 'sequential_lessons',
                value: {
                    leader_plan_id: leaderId,
                    follower_plan_id: followerId,
                    time_gap: gap,
                    _snapshot_leader: leaderText,
                    _snapshot_follower: followerText
                }
            };
        },
        formatSummary: (config) => {
            const v = config?.value;
            if (!v) return '-';
            
            const leaderLabel = getPlanLabel(v.leader_plan_id);
            const followerLabel = getPlanLabel(v.follower_plan_id);
            
            return `
                <div style="padding: 6px; background: white; border: 1px solid #eee; border-radius: 6px;">
                    <div style="border-bottom: 1px dashed #ccc; padding-bottom: 4px; margin-bottom: 4px;">${leaderLabel}</div>
                    <div style="text-align: center; color: #e67e22; font-weight: bold; font-size: 0.85em;">⬇️ розрив: ${v.time_gap} ⬇️</div> 
                    <div style="padding-top: 4px;">${followerLabel}</div>
                </div>
            `;
        }
    }
};

function renderTable(data) {
    const container = document.getElementById('tableContainer');
    
    if (data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🚫</div>
                <h3>Список обмежень пустий</h3>
                <p>Додайте перше правило</p>
            </div>`;
        return;
    }

    const rows = data.map(item => {
        const typeInfo = CONSTRAINT_TYPES_LIST.find(t => t.value === item.configuration?.type);
        const typeLabel = typeInfo ? typeInfo.label : item.configuration?.type;
        const typeClass = typeInfo ? typeInfo.class : '';
        
        const strategy = ConstraintStrategies[item.configuration?.type];
        const configSummary = strategy 
            ? strategy.formatSummary(item.configuration) 
            : JSON.stringify(item.configuration);

        return `
            <tr>
                <td><strong>${getSemesterName(item.semester)}</strong></td>
                <td>${formatTargetInfo(item)}</td>
                <td><span class="badge badge-type ${typeClass}">${typeLabel}</span></td>
                <td style="font-size: 0.9em; line-height: 1.4;">${configSummary}</td>
                <td style="color:#666; font-size:0.85em; font-style:italic;">${item.description || '-'}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn btn-edit" onclick="openEditModal(${item.id})">✏️</button>
                        <button class="btn btn-delete" onclick="openDeleteModal(${item.id})">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Семестр</th>
                    <th>Ціль</th>
                    <th>Тип правила</th>
                    <th>Деталі конфігурації</th>
                    <th>Опис</th>
                    <th>Дії</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function populateConstraintTypes() {
    const select = document.getElementById('constraintType');
    select.innerHTML = '<option value="">-- Оберіть тип --</option>' + 
        CONSTRAINT_TYPES_LIST.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
}

function getSemesterName(id) {
    const s = semestersCache.find(x => x.id === id);
    return s ? s.name : id;
}

function populateSelect(elementId, items, valueKey, textKey, defaultText = '-- Оберіть --') {
    const select = document.getElementById(elementId);
    if (!select) return;
    select.innerHTML = `<option value="">${defaultText}</option>` + 
        items.map(item => `<option value="${item[valueKey]}">${item[textKey]}</option>`).join('');
}

function setupEventListeners() {
    document.getElementById('constraintSemester').addEventListener('change', async (e) => {
        const type = document.getElementById('constraintType').value;
        if (type === 'sequential_lessons') {
            const container = document.getElementById('configBuilder');
            const strategy = ConstraintStrategies[type];
            if (strategy.postRender) await strategy.postRender(container);
        }
    });

    document.getElementById('constraintType').addEventListener('change', async (e) => {
        const type = e.target.value;
        const container = document.getElementById('configBuilder');
        const targetTypeSelect = document.getElementById('targetType');
        const targetEntitySelect = document.getElementById('targetEntity');

        if (type === 'sequential_lessons') {
            targetTypeSelect.value = 'global';
            targetTypeSelect.disabled = true;
            targetEntitySelect.value = '';
            targetEntitySelect.disabled = true;
        } else {
            if (targetTypeSelect.disabled) {
                targetTypeSelect.disabled = false;
                if (targetTypeSelect.value === 'global') targetTypeSelect.value = '';
            }
        }

        const strategy = ConstraintStrategies[type];
        if (strategy) {
            container.innerHTML = strategy.render();
            if (strategy.postRender) await strategy.postRender(container);
        } else {
            container.innerHTML = '<div class="config-builder-empty">Оберіть тип обмеження</div>';
        }
    });

    document.getElementById('targetType').addEventListener('change', async (e) => {
        await loadTargetEntities(e.target.value);
    });
    
    document.getElementById('filterSemester').addEventListener('change', loadConstraints);
    document.getElementById('constraintForm').addEventListener('submit', handleFormSubmit);
}

async function loadTargetEntities(type, selectedId = null) {
    const select = document.getElementById('targetEntity');
    
    if (!type || type === 'global') {
        select.disabled = true;
        select.innerHTML = '<option value="">(Не потрібно)</option>';
        return;
    }

    select.disabled = true;
    select.innerHTML = '<option>⏳ Завантаження...</option>';

    try {
        let items = [];
        const typeMap = { 'teacher': 'teachers', 'group': 'groups', 'room': 'rooms', 'stream': 'streams' };
        const cacheKey = typeMap[type];

        if (resourcesCache[cacheKey] && Object.keys(resourcesCache[cacheKey]).length > 0) {
            items = Object.values(resourcesCache[cacheKey]);
        } else {
            const res = await apiRequest(`/${type}s/`);
            items = res.results || res;
        }

        const displayField = type === 'room' ? 'title' : 'name';
        populateSelect('targetEntity', items, 'id', displayField);
        
        if (selectedId) select.value = selectedId;
        select.disabled = false;
    } catch (e) {
        select.innerHTML = '<option>❌ Помилка</option>';
    }
}

function openAddModal() {
    currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Додати обмеження';
    document.getElementById('constraintForm').reset();
    
    document.getElementById('targetType').disabled = false;
    document.getElementById('targetEntity').innerHTML = '<option value="">-- Спочатку оберіть категорію --</option>';
    document.getElementById('targetEntity').disabled = true;
    
    document.getElementById('configBuilder').innerHTML = '<div class="config-builder-empty">Оберіть тип обмеження вище</div>';
    
    const filterSem = document.getElementById('filterSemester').value;
    if (filterSem) document.getElementById('constraintSemester').value = filterSem;

    showModal('constraintModal');
}

async function openEditModal(id) {
    const item = constraints.find(c => c.id === id);
    if (!item) return;

    currentEditId = id;
    document.getElementById('modalTitle').textContent = 'Редагувати обмеження';

    document.getElementById('constraintSemester').value = item.semester;
    document.getElementById('constraintDescription').value = item.description || '';

    let targetType = '';
    let targetId = null;
    if (item.teacher) { targetType = 'teacher'; targetId = item.teacher; }
    else if (item.group) { targetType = 'group'; targetId = item.group; }
    else if (item.room) { targetType = 'room'; targetId = item.room; }
    else if (item.stream) { targetType = 'stream'; targetId = item.stream; }
    else { targetType = 'global'; }
    
    document.getElementById('targetType').value = targetType;
    if (targetType !== 'global') {
        await loadTargetEntities(targetType, targetId);
    } else {
        document.getElementById('targetEntity').disabled = true;
    }

    const type = item.configuration?.type;
    document.getElementById('constraintType').value = type || '';
    
    const strategy = ConstraintStrategies[type];
    const container = document.getElementById('configBuilder');
    
    if (strategy) {
        container.innerHTML = strategy.render(item.configuration);
        if (strategy.postRender) await strategy.postRender(container, item.configuration);
    }

    showModal('constraintModal');
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    const btn = e.target.querySelector('.btn-save');
    btn.textContent = '⏳ Збереження...';
    btn.disabled = true;

    try {
        const semester = parseInt(document.getElementById('constraintSemester').value);
        const targetType = document.getElementById('targetType').value;
        const targetEntity = document.getElementById('targetEntity').value;
        const type = document.getElementById('constraintType').value;
        const description = document.getElementById('constraintDescription').value;

        const strategy = ConstraintStrategies[type];
        if (!strategy) throw new Error('Оберіть тип обмеження');

        const configContainer = document.getElementById('configBuilder');
        const configuration = strategy.buildPayload(configContainer);

        if (!configuration) throw new Error('Заповніть конфігурацію коректно');

        const payload = {
            semester: semester,
            teacher: targetType === 'teacher' ? parseInt(targetEntity) : null,
            group: targetType === 'group' ? parseInt(targetEntity) : null,
            room: targetType === 'room' ? parseInt(targetEntity) : null,
            stream: targetType === 'stream' ? parseInt(targetEntity) : null,
            description: description,
            configuration: configuration
        };

        if (currentEditId) {
            await apiRequest(`/semester_constraints/${currentEditId}/`, 'PUT', payload);
            showToast('Обмеження оновлено', 'success');
        } else {
            await apiRequest('/semester_constraints/', 'POST', payload);
            showToast('Обмеження створено', 'success');
        }

        hideModal('constraintModal');
        await loadConstraints();
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.textContent = '💾 Зберегти';
        btn.disabled = false;
    }
}

function openDeleteModal(id) {
    currentDeleteId = id;
    showModal('deleteModal');
}

async function confirmDelete() {
    if (!currentDeleteId) return;
    try {
        await apiRequest(`/semester_constraints/${currentDeleteId}/`, 'DELETE');
        hideModal('deleteModal');
        loadConstraints();
        showToast('Видалено успішно', 'success');
    } catch (error) {
        showToast(error.message, 'error');
    }
}

window.openAddModal = openAddModal;
window.openEditModal = openEditModal;
window.openDeleteModal = openDeleteModal;
window.confirmDelete = confirmDelete;