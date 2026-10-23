'use strict';
// Starts the API (:3000, auto-restart) and the Angular dev server (:4200, proxies /api) together.
const { spawn } = require('node:child_process');

const procs = [
  spawn(process.execPath, ['--watch', 'server/index.js'], { stdio: 'inherit' }),
  spawn('npx ng serve', { stdio: 'inherit', shell: true }),
];

const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => { stop(); process.exit(code ?? 0); }));
