const { openDb } = require('./db');
const { createApp } = require('./app');
const { createLogger } = require('./log');

const port = process.env.PORT || 3000;
const log = createLogger();
const app = createApp(openDb(process.env.DB_PATH || 'taskhub.db'), { log });

app.listen(port, () => {
  log.info({ msg: 'listening', url: `http://localhost:${port}` });
});
