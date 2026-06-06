require('dotenv').config();

const { initDb } = require('./main');
const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    const app = createApp();
    app.listen(PORT, () => {
      console.log(`Server: http://127.0.0.1:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Не удалось подключиться к PostgreSQL:', error.message);
    process.exit(1);
  });
