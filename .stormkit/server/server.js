require('dotenv').config();

const serverless = require('@stormkit/serverless');
const { initDb } = require('../../backend/main');
const { createApp } = require('../../backend/app');

let app;
const ready = initDb().then(() => {
  app = createApp();
});

exports.handler = serverless(async (req, res) => {
  await ready;
  app(req, res);
});
