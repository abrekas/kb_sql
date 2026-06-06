const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PYTHON_URL = process.env.PYTHON_URL || 'http://127.0.0.1:8000';
const INTERNAL_KEY = process.env.INTERNAL_KEY || 'dev-secret-key';
const DRUM_SIZE = 16;

// token -> реальный символ (одноразовая карта на текущий барабан)
const drumMaps = new Map();

const CHARSET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' \"=<>!-_|";

function ensureSessionInput(req) {
  if (!req.session.input) {
    req.session.input = { username: '', password: '', activeField: 'username' };
  }
  return req.session.input;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickDrumChars() {
  const pool = shuffle([...CHARSET]);
  return pool.slice(0, DRUM_SIZE);
}

function createToken() {
  return crypto.randomBytes(16).toString('hex');
}

/** SVG без отдельного поля «буква» в JSON — символ только внутри разметки */
function buildGlyphSvg(char) {
  const escaped = char
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
    <rect width="48" height="48" rx="24" fill="#3a3a3a"/>
    <text x="24" y="28" text-anchor="middle" font-family="Consolas, monospace" font-size="22" fill="#e8e8e8"
      >${escaped}</text>
  </svg>`;
}

function burnDrum(sessionId) {
  drumMaps.delete(sessionId);
}

function buildDrum(sessionId) {
  const chars = pickDrumChars();
  const drumMap = {};
  const clientDrum = chars.map((char) => {
    const token = createToken();
    drumMap[token] = char;
    return { token, svg: buildGlyphSvg(char) };
  });

  drumMaps.set(sessionId, drumMap);
  return clientDrum;
}

const frontendDir = path.join(__dirname, '..', 'frontend');

app.use(express.json());
app.use(express.static(frontendDir));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'drum-session-secret-change-me',
    resave: false,
    saveUninitialized: true,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 },
  })
);

function drumStateResponse(req) {
  const input = ensureSessionInput(req);
  return {
    drum: req.session.drumClient || [],
    activeField: input.activeField,
    usernameMask: '*'.repeat(input.username.length),
    passwordMask: '*'.repeat(input.password.length),
  };
}

app.get('/api/get-drum', (req, res) => {
  const sessionId = req.session.id;

  if (!req.session.drumClient) {
    req.session.drumClient = buildDrum(sessionId);
  }

  res.json(drumStateResponse(req));
});

app.post('/api/refresh-drum', (req, res) => {
  const sessionId = req.session.id;
  burnDrum(sessionId);
  req.session.drumClient = buildDrum(sessionId);

  res.json(drumStateResponse(req));
});

app.post('/api/set-field', (req, res) => {
  const { field } = req.body;
  if (field !== 'username' && field !== 'password') {
    return res.status(400).json({ error: 'Недопустимое поле' });
  }

  const input = ensureSessionInput(req);
  input.activeField = field;

  res.json({ success: true, activeField: field });
});

app.post('/api/submit-click', (req, res) => {
  const sessionId = req.session.id;
  const { token } = req.body;
  const currentMap = drumMaps.get(sessionId);

  if (!currentMap || !currentMap[token]) {
    return res.status(400).json({ error: 'Токен устарел или неверен! Барабан заклинило.' });
  }

  const realChar = currentMap[token];
  const input = ensureSessionInput(req);
  input[input.activeField] += realChar;

  res.json({
    success: true,
    message: 'Символ принят',
    activeField: input.activeField,
    usernameMask: '*'.repeat(input.username.length),
    passwordMask: '*'.repeat(input.password.length),
  });
});

app.post('/api/backspace', (req, res) => {
  const input = ensureSessionInput(req);
  const field = input.activeField;
  input[field] = input[field].slice(0, -1);

  res.json({
    success: true,
    activeField: field,
    usernameMask: '*'.repeat(input.username.length),
    passwordMask: '*'.repeat(input.password.length),
  });
});

app.post('/api/clear-field', (req, res) => {
  const input = ensureSessionInput(req);
  input[input.activeField] = '';

  res.json({
    success: true,
    activeField: input.activeField,
    usernameMask: '',
    passwordMask: '*'.repeat(input.password.length),
  });
});

app.post('/api/login', async (req, res) => {
  const input = ensureSessionInput(req);

  if (!input.username || !input.password) {
    return res.status(400).json({ error: 'Сначала наберите логин и пароль на барабане.' });
  }

  try {
    const body = new URLSearchParams({
      username: input.username,
      password: input.password,
    });

    const pythonResponse = await fetch(`${PYTHON_URL}/internal/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Internal-Key': INTERNAL_KEY,
      },
      body,
    });

    const html = await pythonResponse.text();
    input.username = '';
    input.password = '';
    burnDrum(req.session.id);

    res.status(pythonResponse.status).type('html').send(html);
  } catch (error) {
    res.status(502).send(
      `<h1>Python-бэкенд недоступен</h1><p>${error.message}</p><p>Запустите: uvicorn main:app --port 8000</p>`
    );
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'login.html'));
});

app.listen(PORT, () => {
  console.log(`Drum gateway: http://127.0.0.1:${PORT}`);
  console.log(`Python backend expected at ${PYTHON_URL}`);
});
