'use strict';
const { openDb } = require('./db');
const { createApp } = require('./app');
const { seedIfEmpty } = require('./seed');

const PORT = Number(process.env.PORT || 3000);

async function main() {
  const db = await openDb();
  const where = db.driver === 'postgres' ? 'PostgreSQL' : `SQLite (${db.file})`;
  console.log(`🗄️  Base de dados: ${where}`);
  if (process.env.SEED !== '0') await seedIfEmpty(db);
  const app = await createApp({ db });
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏢 Portaria Digital a correr em http://localhost:${PORT}`);
  });
  function shutdown() {
    server.close(() => { Promise.resolve(db.close()).finally(() => process.exit(0)); });
    setTimeout(() => process.exit(0), 3000).unref();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => { console.error(err); process.exit(1); });
