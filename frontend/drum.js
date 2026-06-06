const drumEl = document.getElementById('drum');
const usernameMaskEl = document.getElementById('usernameMask');
const passwordMaskEl = document.getElementById('passwordMask');
const statusEl = document.getElementById('status');
const drumStatusEl = document.getElementById('drumStatus');
const fieldTabs = document.querySelectorAll('.field-tab');

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

    const data = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : null;

    if (!response.ok) {
        throw new Error(data?.error || `Ошибка ${response.status}`);
    }

    return data;
}

function renderDrum(drum) {
    drumEl.innerHTML = '';
    drumItems = drum;
    const step = 360 / drum.length;
    const radius = 92;

    drum.forEach((item, index) => {
        const angle = index * step;
        const bullet = document.createElement('button');
        bullet.type = 'button';
        bullet.className = 'bullet';
        bullet.dataset.token = item.token;
        bullet.innerHTML = item.svg;

        const rad = (angle * Math.PI) / 180;
        const x = radius * Math.cos(rad);
        const y = radius * Math.sin(rad);
        bullet.style.transform = `translate(${x}px, ${y}px)`;

        bullet.addEventListener('click', async () => {
            try {
                document.querySelectorAll('.bullet').forEach((b) => b.classList.remove('active'));
                bullet.classList.add('active');
                currentRotation = -angle;
                drumEl.style.transform = `rotate(${currentRotation}deg)`;

                const result = await api('/api/submit-click', {
                    method: 'POST',
                    body: JSON.stringify({ token: item.token }),
                });

                updateMasks(result.usernameMask, result.passwordMask);
                drumStatusEl.textContent = 'Символ принят. Барабан перезаряжен.';
                setStatus('Символ добавлен', 'success');
                await loadDrum();
            } catch (error) {
                setStatus(error.message, 'error');
                drumStatusEl.textContent = error.message;
                await loadDrum();
            }
        });

        drumEl.appendChild(bullet);
    });
}

async function loadDrum() {
    const data = await api('/api/get-drum');
    setActiveField(data.activeField);
    updateMasks(data.usernameMask, data.passwordMask);
    renderDrum(data.drum);
    drumStatusEl.textContent = 'Выберите символ на барабане';
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
            await loadDrum();
        } catch (error) {
            setStatus(error.message, 'error');
        }
    });
});

document.getElementById('backspaceBtn').addEventListener('click', async () => {
    try {
        const data = await api('/api/backspace', { method: 'POST', body: '{}' });
        updateMasks(data.usernameMask, data.passwordMask);
        await loadDrum();
    } catch (error) {
        setStatus(error.message, 'error');
    }
});

document.getElementById('clearBtn').addEventListener('click', async () => {
    try {
        const data = await api('/api/clear-field', { method: 'POST', body: '{}' });
        updateMasks(data.usernameMask, data.passwordMask);
        await loadDrum();
    } catch (error) {
        setStatus(error.message, 'error');
    }
});

document.getElementById('refreshBtn').addEventListener('click', () => loadDrum());

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