const { openDb } = require('./db');
const { createApp } = require('./app');

const port = process.env.PORT || 3000;
const app = createApp(openDb(process.env.DB_PATH || 'taskhub.db'));

app.listen(port, () => {
  console.log(`TaskHub listening on http://localhost:${port}`);
});
