const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const crypto = require('crypto');
const path = require('path');
const { getPool, runVulnerableLogin } = require('./main');

const DRUM_SIZE = 16;
const CHARSET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' \"=<>!-_|";

const frontendDir = path.join(__dirname, '..', 'frontend');

function ensureSessionInput(req) {
  if (!req.session) {
    return { username: '', password: '', activeField: 'username' };
  }

  if (!req.session.input || typeof req.session.input !== 'object') {
    req.session.input = { username: '', password: '', activeField: 'username' };
  }

  if (!req.session.input.activeField) {
    req.session.input.activeField = 'username';
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
  const poolChars = shuffle([...CHARSET]);
  return poolChars.slice(0, DRUM_SIZE);
}

function createToken() {
  return crypto.randomBytes(16).toString('hex');
}

function buildGlyphSvg(char) {
  const escaped = char
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
    <rect width="48" height="48" rx="24" fill="#3a3a3a"/>
    <text x="24" y="28" text-anchor="middle" font-family="Consolas, monospace" font-size="22" fill="#e8e8e8">${escaped}</text>
  </svg>`;
}

function burnDrum(req) {
  if (!req.session) return;
  delete req.session.drumTokenMap;
  delete req.session.drumClient;
}

function buildDrum(req) {
  const chars = pickDrumChars();
  const drumTokenMap = {};
  const clientDrum = chars.map((char) => {
    const token = createToken();
    drumTokenMap[token] = char;
    return { token, svg: buildGlyphSvg(char) };
  });

  req.session.drumTokenMap = drumTokenMap;
  req.session.drumClient = clientDrum;
  return clientDrum;
}

function drumStateResponse(req) {
  const input = ensureSessionInput(req);
  return {
    drum: req.session?.drumClient || [],
    activeField: input.activeField || 'username',
    usernameMask: '*'.repeat((input.username || '').length),
    passwordMask: '*'.repeat((input.password || '').length),
  };
}

function apiHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(express.json());

  if (process.env.NODE_ENV !== 'production') {
    app.use(express.static(frontendDir));
  }

  app.use(
    session({
      store: new pgSession({
        pool: getPool(),
        tableName: 'session',
      }),
      secret: process.env.SESSION_SECRET || 'drum-session-secret-change-me',
      resave: false,
      saveUninitialized: true,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60,
        sameSite: 'lax',
      },
    })
  );

  app.get('/api/get-drum', apiHandler(async (req, res) => {
    if (!req.session.drumClient) {
      buildDrum(req);
    }

    res.json(drumStateResponse(req));
  }));

  app.post('/api/refresh-drum', apiHandler(async (req, res) => {
    burnDrum(req);
    buildDrum(req);
    res.json(drumStateResponse(req));
  }));

  app.post('/api/set-field', apiHandler(async (req, res) => {
    const { field } = req.body;
    if (field !== 'username' && field !== 'password') {
      return res.status(400).json({ error: 'Недопустимое поле' });
    }

    const input = ensureSessionInput(req);
    input.activeField = field;

    res.json({ success: true, activeField: field });
  }));

  app.post('/api/submit-click', apiHandler(async (req, res) => {
    const { token } = req.body;
    const currentMap = req.session?.drumTokenMap;

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
  }));

  app.post('/api/backspace', apiHandler(async (req, res) => {
    const input = ensureSessionInput(req);
    const field = input.activeField;
    input[field] = input[field].slice(0, -1);

    res.json({
      success: true,
      activeField: field,
      usernameMask: '*'.repeat(input.username.length),
      passwordMask: '*'.repeat(input.password.length),
    });
  }));

  app.post('/api/clear-field', apiHandler(async (req, res) => {
    const input = ensureSessionInput(req);
    input[input.activeField] = '';

    res.json({
      success: true,
      activeField: input.activeField,
      usernameMask: '',
      passwordMask: '*'.repeat(input.password.length),
    });
  }));

  app.post('/api/login', apiHandler(async (req, res) => {
    const input = ensureSessionInput(req);

    if (!input.username || !input.password) {
      return res.status(400).json({ error: 'Сначала наберите логин и пароль на барабане.' });
    }

    const { status, html } = await runVulnerableLogin(input.username, input.password);

    input.username = '';
    input.password = '';
    burnDrum(req);

    res.status(status).type('html').send(html);
  }));

  app.get('/', (_req, res) => {
    res.sendFile(path.join(frontendDir, 'login.html'));
  });

  app.use((err, req, res, _next) => {
    console.error('API error:', err);

    if (req.path.startsWith('/api')) {
      return res.status(500).json({
        error: err.message || 'Internal server error',
      });
    }

    res.status(500).send('Internal server error');
  });

  return app;
}

module.exports = { createApp };
