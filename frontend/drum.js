const drumEl = document.getElementById('drum');
const usernameMaskEl = document.getElementById('usernameMask');
const passwordMaskEl = document.getElementById('passwordMask');
const statusEl = document.getElementById('status');
const drumStatusEl = document.getElementById('drumStatus');
const fieldTabs = document.querySelectorAll('.field-tab');

const DRUM_RADIUS = 92;
const POINTER_ANGLE = 90;

let currentRotation = 0;
let activeField = 'username';
let drumItems = [];

function setStatus(text, type = '') {
    statusEl.textContent = text;
    statusEl.className = `status ${type}`;
}

function updateMasks(usernameMask, passwordMask) {
    usernameMaskEl.textContent = usernameMask || '—';
    passwordMaskEl.textContent = passwordMask || '—';
}

function setActiveField(field) {
    activeField = field;
    fieldTabs.forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.field === field);
    });
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        ...options,
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
        throw new Error(data?.error || data?.detail || `Ошибка ${response.status}`);
    }

    if (!data) {
        throw new Error('Сервер вернул не-JSON ответ. Проверьте DATABASE_URL и логи деплоя.');
    }

    return data;
}

function getStep() {
    return drumItems.length ? 360 / drumItems.length : 0;
}

function getPointerIndex() {
    const n = drumItems.length;
    if (!n) return -1;

    const step = getStep();
    const normalized = ((POINTER_ANGLE - currentRotation) % 360 + 360) % 360;
    return Math.round(normalized / step) % n;
}

function setBulletTransform(bullet, angle, x, y) {
    bullet.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg)`;
}

function updateAllBulletTransforms() {
    const step = getStep();

    document.querySelectorAll('.bullet').forEach((bullet) => {
        const index = Number(bullet.dataset.index);
        const angle = index * step;
        const rad = (angle * Math.PI) / 180;
        const x = DRUM_RADIUS * Math.cos(rad);
        const y = DRUM_RADIUS * Math.sin(rad);
        setBulletTransform(bullet, -currentRotation, x, y);
    });
}

function updateAllSVGTransforms() {

}

function applyDrumRotation() {
    drumEl.style.transform = `rotate(${currentRotation}deg)`;
    updateAllBulletTransforms();
    updatePointerHighlight();
}

function updatePointerHighlight() {
    const pointedIndex = getPointerIndex();
    document.querySelectorAll('.bullet').forEach((bullet) => {
        bullet.classList.toggle('active', Number(bullet.dataset.index) === pointedIndex);
    });
}

function renderDrum(drum) {
    drumItems = drum;
    drumEl.innerHTML = '';
    const step = getStep();

    drum.forEach((item, index) => {
        const angle = index * step;
        const bullet = document.createElement('div');
        bullet.className = 'bullet';
        bullet.dataset.token = item.token;
        bullet.dataset.index = String(index);
        bullet.innerHTML = item.svg;

        const rad = (angle * Math.PI) / 180;
        const x = DRUM_RADIUS * Math.cos(rad);
        const y = DRUM_RADIUS * Math.sin(rad);
        setBulletTransform(bullet, angle, x, y);

        drumEl.appendChild(bullet);
    });

    applyDrumRotation();
}

function rotateDrum() {
    if (!drumItems.length) return;

    currentRotation += getStep();
    applyDrumRotation();
    drumStatusEl.textContent = 'Барабан повёрнут. Выберите символ под язычком.';
}

async function selectPointedSymbol() {
    const index = getPointerIndex();
    if (index < 0 || !drumItems[index]) {
        setStatus('Барабан пуст', 'error');
        return;
    }

    try {
        const result = await api('/api/submit-click', {
            method: 'POST',
            body: JSON.stringify({ token: drumItems[index].token }),
        });

        updateMasks(result.usernameMask, result.passwordMask);
        drumStatusEl.textContent = 'Символ принят.';
        setStatus('Символ добавлен', 'success');
        updatePointerHighlight();
    } catch (error) {
        setStatus(error.message, 'error');
        drumStatusEl.textContent = error.message;
    }
}

async function loadDrum() {
    const data = await api('/api/get-drum');
    setActiveField(data.activeField);
    updateMasks(data.usernameMask, data.passwordMask);
    renderDrum(data.drum);
    drumStatusEl.textContent = 'Поверните барабан и выберите символ под язычком';
}

async function refreshDrum() {
    const data = await api('/api/refresh-drum', { method: 'POST', body: '{}' });
    currentRotation = 0;
    setActiveField(data.activeField);
    updateMasks(data.usernameMask, data.passwordMask);
    renderDrum(data.drum);
    drumStatusEl.textContent = 'Новый барабан заряжен';
    setStatus('Барабан обновлён', 'success');
}

fieldTabs.forEach((tab) => {
    tab.addEventListener('click', async () => {
        try {
            const data = await api('/api/set-field', {
                method: 'POST',
                body: JSON.stringify({ field: tab.dataset.field }),
            });
            setActiveField(data.activeField);
            setStatus(`Редактируется: ${data.activeField}`);
        } catch (error) {
            setStatus(error.message, 'error');
        }
    });
});

document.getElementById('rotateBtn').addEventListener('click', rotateDrum);
document.getElementById('selectBtn').addEventListener('click', () => {
    selectPointedSymbol();
});

document.getElementById('backspaceBtn').addEventListener('click', async () => {
    try {
        const data = await api('/api/backspace', { method: 'POST', body: '{}' });
        updateMasks(data.usernameMask, data.passwordMask);
    } catch (error) {
        setStatus(error.message, 'error');
    }
});

document.getElementById('clearBtn').addEventListener('click', async () => {
    try {
        const data = await api('/api/clear-field', { method: 'POST', body: '{}' });
        updateMasks(data.usernameMask, data.passwordMask);
    } catch (error) {
        setStatus(error.message, 'error');
    }
});

document.getElementById('refreshBtn').addEventListener('click', () => {
    refreshDrum().catch((error) => setStatus(error.message, 'error'));
});

document.getElementById('loginBtn').addEventListener('click', async () => {
    setStatus('Проверяем учётные данные…');
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            credentials: 'same-origin',
        });

        const html = await response.text();
        document.open();
        document.write(html);
        document.close();
    } catch (error) {
        setStatus(error.message, 'error');
    }
});

loadDrum().catch((error) => {
    setStatus(error.message, 'error');
    drumStatusEl.textContent = error.message;
});
