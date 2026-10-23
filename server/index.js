'use strict';
const path = require('node:path');
const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3000;
const app = createApp({
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db'),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  staticDir: path.join(__dirname, '..', 'dist', 'web', 'browser'),
});

app.listen(port, () => console.log(`Ajaia Docs listening on http://localhost:${port}`));
