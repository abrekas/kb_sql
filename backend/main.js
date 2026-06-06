const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required');
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
      max: Number(process.env.PGPOOL_MAX || 2),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  return pool;
}

async function initDb() {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default" PRIMARY KEY,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);

  await db.query(`
    INSERT INTO users (username, password) VALUES ('admin', 'adminpass')
    ON CONFLICT (username) DO NOTHING
  `);
  await db.query(`
    INSERT INTO users (username, password) VALUES ('user2', 'abobus')
    ON CONFLICT (username) DO NOTHING
  `);

  return db;
}

async function runVulnerableLogin(username, password) {
  const query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`;

  try {
    const result = await getPool().query(query);
    const row = result.rows[0];

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

module.exports = { initDb, runVulnerableLogin, getPool };
