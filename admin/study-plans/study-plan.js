let studyPlans = [];
let currentEditId = null;
let currentDeleteId = null;

const cache = {
    semesters: [],
    subjects: [],
    allTeachers: [],  
    groups: [],
    streams: [],
    roomTypes: [],
    classTypes: []
};

let currentFilters = {
    semester: '',
    group: '',
    teacher: ''
};

const CLASS_TYPES_FALLBACK = [
    { id: 1, name: 'Лекція' },
    { id: 2, name: 'Практика' },
    { id: 3, name: 'Лабораторна' },
    { id: 4, name: 'Семінар' },
    { id: 5, name: 'Екзамен' }
];


async function init() {
    await loadAllDropdowns();
    
    setupFilterListeners();
    setupTargetSelector();
    setupCascadingSelects();
    
    loadStudyPlans();
}


async function loadAllDropdowns() {
    try {
        const [semesters, subjects, teachersData, groups, streams, roomTypes, classTypesData] = await Promise.all([
            apiRequest('/semesters/'),
            apiRequest('/subjects/'),
            apiRequest('/teachers/'),
            apiRequest('/groups/'),
            apiRequest('/streams/'),
            apiRequest('/room_types/'),
            apiRequest('/class_types/').catch(() => CLASS_TYPES_FALLBACK) 
        ]);
        
        cache.semesters = semesters;
        cache.subjects = subjects;
        cache.allTeachers = teachersData.results || teachersData;
        cache.groups = groups;
        cache.streams = streams;
        cache.roomTypes = roomTypes;
        cache.classTypes = classTypesData.length ? classTypesData : CLASS_TYPES_FALLBACK;

        populateDropdowns();
        populateFilters();

    } catch (error) {
        console.error('Failed to load dropdown data:', error);
        showToast('Помилка завантаження довідників', 'error');
    }
}


function populateDropdowns() {
    populateSelect('planSemester', cache.semesters, 'id', 'name');
    populateSelect('planSubject', cache.subjects, 'id', 'name');
    populateSelect('planGroup', cache.groups, 'id', 'name');
    populateSelect('planStream', cache.streams, 'id', 'name');
    populateSelect('planRoomType', cache.roomTypes, 'id', 'name', true);
    populateSelect('planClassType', cache.classTypes, 'id', 'name');
}

function populateFilters() {
    populateSelect('filterSemester', cache.semesters, 'id', 'name', 'Усі семестри');
    populateSelect('filterGroup', cache.groups, 'id', 'name', 'Усі групи');
    populateSelect('filterTeacher', cache.allTeachers, 'id', 'name', 'Усі викладачі');
}


function setupFilterListeners() {
    const fSemester = document.getElementById('filterSemester');
    const fGroup = document.getElementById('filterGroup');
    const fTeacher = document.getElementById('filterTeacher');
    const btnReset = document.getElementById('resetFiltersBtn');

    const onFilterChange = () => {
        currentFilters.semester = fSemester.value;
        currentFilters.group = fGroup.value;
        currentFilters.teacher = fTeacher.value;
        loadStudyPlans();
    };

    fSemester.addEventListener('change', onFilterChange);
    fGroup.addEventListener('change', onFilterChange);
    fTeacher.addEventListener('change', onFilterChange);

    btnReset.addEventListener('click', () => {
        fSemester.value = '';
        fGroup.value = '';
        fTeacher.value = '';
        currentFilters = { semester: '', group: '', teacher: '' };
        loadStudyPlans();
    });
}


async function loadStudyPlans() {
    showLoading('tableContainer', 'Завантаження навчальних планів...');

    try {
        const params = new URLSearchParams();
        if (currentFilters.semester) params.append('semester', currentFilters.semester);
        if (currentFilters.group) params.append('group', currentFilters.group);
        if (currentFilters.teacher) params.append('teacher', currentFilters.teacher);
        params.append('ordering', '-id'); 

        const data = await apiRequest(`/study_plans/?${params.toString()}`);
        
        studyPlans = data.results || data;
        renderTable(studyPlans);

    } catch (error) {
        showError('tableContainer', 'Не вдалося завантажити дані');
        showToast('Помилка завантаження: ' + error.message, 'error');
    }
}


function renderTable(data) {
    const container = document.getElementById('tableContainer');
    
    if (data.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📚</div>
                <h3>Немає навчальних планів</h3>
                <p>Створіть перший план або змініть фільтри</p>
            </div>
        `;
        return;
    }

    const table = `
        <table>
            <thead>
                <tr>
                    <th style="width: 50px;">ID</th>
                    <th style="width: 20%;">Семестр</th>
                    <th style="width: 30%;">Дисципліна</th>
                    <th style="width: 20%;">Ціль</th>
                    <th style="width: 10%;">Тип</th>
                    <th style="width: 10%;">К-сть</th>
                    <th style="width: 10%;">Дії</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(plan => {
                    const fullSemester = getSemesterName(plan.semester);
                    const semesterHtml = truncateText(fullSemester, 25);
                    const semesterTitle = fullSemester.length > 25 ? `title="${fullSemester}"` : '';

                    const targetBadge = plan.group 
                        ? `<span class="badge badge-group">👥 ${plan.group_name || getGroupName(plan.group)}</span>`
                        : `<span class="badge badge-stream">🌊 ${plan.stream_name || getStreamName(plan.stream)}</span>`;

                    return `
                    <tr>
                        <td>#${plan.id}</td>
                        <td ${semesterTitle}>${semesterHtml}</td>
                        <td>
                            <div class="subject-cell">
                                <span class="subject-name">${plan.subject_name || getSubjectName(plan.subject)}</span>
                                <span class="teacher-name">
                                    👨‍🏫 ${plan.teacher_name || getTeacherName(plan.teacher)}
                                </span>
                            </div>
                        </td>
                        <td>${targetBadge}</td>
                        <td>${plan.class_type_name || getClassTypeName(plan.class_type)}</td>
                        <td>
                            <span style="font-weight: 600;">${plan.amount}</span> 
                            <span style="color:#999; font-size:0.85em;">x ${plan.duration}г</span>
                        </td>
                        <td>
                            <div class="table-actions">
                                <button class="btn btn-edit" onclick="openEditModal(${plan.id})">✏️</button>
                                <button class="btn btn-delete" onclick="openDeleteModal(${plan.id})">🗑️</button>
                            </div>
                        </td>
                    </tr>
                `}).join('')}
            </tbody>
        </table>
    `;
    
    container.innerHTML = table;
}


function setupCascadingSelects() {
    const subjectSelect = document.getElementById('planSubject');
    const teacherSelect = document.getElementById('planTeacher');

    subjectSelect.addEventListener('change', async (e) => {
        const subjectId = e.target.value;
        if (!subjectId) {
            teacherSelect.innerHTML = '<option value="">-- Спочатку оберіть предмет --</option>';
            teacherSelect.disabled = true;
            return;
        }
        await loadTeachersBySubject(subjectId);
    });
}

async function loadTeachersBySubject(subjectId, selectedTeacherId = null) {
    const teacherSelect = document.getElementById('planTeacher');
    
    try {
        teacherSelect.innerHTML = '<option value="">⏳ Завантаження...</option>';
        teacherSelect.disabled = true;

        const data = await apiRequest(`/teachers/?subjects=${subjectId}`);
        const teachers = data.results || data;
        
        let html = '<option value="">-- Оберіть викладача --</option>';
        teachers.forEach(teacher => {
            html += `<option value="${teacher.id}">${teacher.name}</option>`;
        });
        
        teacherSelect.innerHTML = html;
        teacherSelect.disabled = false;

        if (selectedTeacherId) {
            teacherSelect.value = selectedTeacherId;
        }

    } catch (error) {
        console.error('Error:', error);
        teacherSelect.innerHTML = '<option value="">❌ Помилка</option>';
    }
}


function setupTargetSelector() {
    const radios = document.querySelectorAll('input[name="targetType"]');
    const groupSelect = document.getElementById('groupSelectContainer');
    const streamSelect = document.getElementById('streamSelectContainer');
    const labels = document.querySelectorAll('.radio-label');

    radios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            labels.forEach(l => l.classList.remove('active'));
            e.target.closest('label').classList.add('active');

            if (e.target.value === 'group') {
                groupSelect.classList.remove('hidden');
                streamSelect.classList.add('hidden');
                document.getElementById('planStream').value = ''; 
            } else {
                streamSelect.classList.remove('hidden');
                groupSelect.classList.add('hidden');
                document.getElementById('planGroup').value = '';
            }
        });
    });
}


function openAddModal() {
    currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Додати навчальний план';
    document.getElementById('planForm').reset();
    
    const teacherSelect = document.getElementById('planTeacher');
    teacherSelect.innerHTML = '<option value="">-- Спочатку оберіть предмет --</option>';
    teacherSelect.disabled = true;
    
    const groupRadio = document.querySelector('input[value="group"]');
    if (groupRadio) {
        groupRadio.click();
        groupRadio.checked = true;
    }
    
    showModal('planModal');
}

async function openEditModal(id) {
    const plan = studyPlans.find(p => p.id === id);
    if (!plan) return;

    currentEditId = id;
    document.getElementById('modalTitle').textContent = 'Редагувати навчальний план';
    
    document.getElementById('planSemester').value = plan.semester;
    document.getElementById('planClassType').value = plan.class_type;
    document.getElementById('planRoomType').value = plan.required_room_type || '';
    document.getElementById('planAmount').value = plan.amount;
    document.getElementById('planDuration').value = plan.duration;
    document.getElementById('planSubject').value = plan.subject;

    await loadTeachersBySubject(plan.subject, plan.teacher);

    if (plan.group) {
        const radio = document.querySelector('input[value="group"]');
        if (radio) radio.click();
        document.getElementById('planGroup').value = plan.group;
    } else {
        const radio = document.querySelector('input[value="stream"]');
        if (radio) radio.click();
        document.getElementById('planStream').value = plan.stream;
    }

    showModal('planModal');
}

function openDeleteModal(id) {
    currentDeleteId = id;
    showModal('deleteModal');
}


document.getElementById('planForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const targetType = document.querySelector('input[name="targetType"]:checked').value;
    
    const data = {
        semester: parseInt(document.getElementById('planSemester').value),
        subject: parseInt(document.getElementById('planSubject').value),
        teacher: parseInt(document.getElementById('planTeacher').value),
        class_type: parseInt(document.getElementById('planClassType').value),
        required_room_type: document.getElementById('planRoomType').value ? parseInt(document.getElementById('planRoomType').value) : null,
        amount: parseInt(document.getElementById('planAmount').value),
        duration: parseInt(document.getElementById('planDuration').value),
        group: targetType === 'group' ? parseInt(document.getElementById('planGroup').value) : null,
        stream: targetType === 'stream' ? parseInt(document.getElementById('planStream').value) : null,
        constraints: {}
    };

    if (targetType === 'group' && !data.group) return showToast('Оберіть групу!', 'error');
    if (targetType === 'stream' && !data.stream) return showToast('Оберіть потік!', 'error');

    try {
        const btnSave = e.target.querySelector('.btn-save');
        btnSave.disabled = true;

        if (currentEditId) {
            await apiRequest(`/study_plans/${currentEditId}/`, 'PUT', data);
            showToast('План оновлено', 'success');
        } else {
            await apiRequest('/study_plans/', 'POST', data);
            showToast('План створено', 'success');
        }
        
        hideModal('planModal');
        loadStudyPlans();
        btnSave.disabled = false;

    } catch (error) {
        showToast('Помилка: ' + error.message, 'error');
        e.target.querySelector('.btn-save').disabled = false;
    }
});

async function confirmDelete() {
    if (!currentDeleteId) return;
    try {
        await apiRequest(`/study_plans/${currentDeleteId}/`, 'DELETE');
        hideModal('deleteModal');
        loadStudyPlans();
        showToast('План видалено', 'success');
    } catch (error) {
        showToast('Помилка видалення: ' + error.message, 'error');
    }
}


function populateSelect(elementId, items, valueKey, textKey, defaultTextOrIsOptional = '-- Оберіть --') {
    const select = document.getElementById(elementId);
    if (!select) return;

    let defaultText = typeof defaultTextOrIsOptional === 'string' ? defaultTextOrIsOptional : '-- Оберіть --';
    if (defaultTextOrIsOptional === true) defaultText = "-- Не обов'язково --";

    const currentVal = select.value;

    let html = `<option value="">${defaultText}</option>`;
    items.forEach(item => {
        html += `<option value="${item[valueKey]}">${item[textKey]}</option>`;
    });
    select.innerHTML = html;

    if (currentVal) select.value = currentVal;
}

const getSemesterName = (id) => cache.semesters.find(s => s.id === id)?.name || id;
const getSubjectName = (id) => cache.subjects.find(s => s.id === id)?.name || id;
const getTeacherName = (id) => cache.allTeachers.find(s => s.id === id)?.name || id;
const getGroupName = (id) => cache.groups.find(s => s.id === id)?.name || id;
const getStreamName = (id) => cache.streams.find(s => s.id === id)?.name || id;
const getClassTypeName = (id) => cache.classTypes.find(s => s.id === id)?.name || 'Тип ' + id;

function truncateText(text, maxLength) {
    if (!text) return '';
    const str = String(text);
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + '...';
}

init();