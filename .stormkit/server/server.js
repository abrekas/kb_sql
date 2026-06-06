require('dotenv').config();

const serverless = require('@stormkit/serverless');
const { initDb } = require('../../backend/main');
const { createApp } = require('../../backend/app');

let app;
let initError;

const ready = initDb()
  .then(() => {
    app = createApp();
  })
  .catch((error) => {
    initError = error;
    console.error('Database init failed:', error);
  });

exports.handler = serverless(async (req, res) => {
  await ready;

  if (initError) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'Database unavailable',
        detail: initError.message,
      })
    );
    return;
  }

  app(req, res);
});
