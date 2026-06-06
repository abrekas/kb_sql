const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
  `);

  await pool.query(`
    INSERT INTO users (username, password) VALUES ('admin', 'adminpass')
    ON CONFLICT (username) DO NOTHING
  `);
  await pool.query(`
    INSERT INTO users (username, password) VALUES ('user2', 'abobus')
    ON CONFLICT (username) DO NOTHING
  `);

  return pool;
}

async function runVulnerableLogin(username, password) {
  const query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`;

  try {
    const result = await pool.query(query);
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

module.exports = { initDb, runVulnerableLogin, pool };
