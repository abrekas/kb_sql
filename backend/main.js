const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'test.db');

let db;

function initDb() {
  db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
  `);

  db.prepare(
    "INSERT OR IGNORE INTO users (username, password) VALUES ('admin', 'adminpass')"
  ).run();
  db.prepare(
    "INSERT OR IGNORE INTO users (username, password) VALUES ('user', 'userpass')"
  ).run();

  return db;
}

function runVulnerableLogin(username, password) {
  const query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`;

  try {
    const row = db.prepare(query).get();

    if (row) {
      return {
        status: 200,
        html: [
          `<h1>Welcome, ${row.username}!</h1>`,
          '<p>SQL-запрос выполнен (уязвимость намеренная):</p>',
          `<pre>${query}</pre>`,
          "<a href='/'>Back</a>",
        ].join(''),
      };
    }

    return {
      status: 200,
      html: [
        '<h1>Invalid credentials.</h1>',
        `<pre>${query}</pre>`,
        "<a href='/'>Try again</a>",
      ].join(''),
    };
  } catch (error) {
    return {
      status: 500,
      html: `<h1>Database error: ${error.message}</h1><pre>${query}</pre>`,
    };
  }
}

module.exports = { initDb, runVulnerableLogin };
