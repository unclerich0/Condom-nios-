'use strict';
const { openDb } = require('./db');
const { createApp } = require('./app');
const { seedIfEmpty } = require('./seed');

const PORT = Number(process.env.PORT || 3000);
const db = openDb();
if (process.env.SEED !== '0') seedIfEmpty(db);
const app = createApp({ db });
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🏢 Portaria Digital a correr em http://localhost:${PORT}`);
});
function shutdown() { server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 3000).unref(); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
