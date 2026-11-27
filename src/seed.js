'use strict';
const { hashPassword } = require('./auth');
const { todayLocal } = require('./time');

const RESIDENTS = [
  ['ana.silva', 'Ana Silva', 'A', '101', '+244 923 456 101'],
  ['joao.santos', 'João Santos', 'A', '102', '+244 924 112 233'],
  ['maria.domingos', 'Maria Domingos', 'A', '201', '+244 912 334 455'],
  ['pedro.neto', 'Pedro Neto', 'A', '202', '+244 931 556 677'],
  ['luisa.fernandes', 'Luísa Fernandes', 'A', '301', '+244 923 778 899'],
  ['carlos.mendes', 'Carlos Mendes', 'B', '101', '+244 925 101 202'],
  ['beatriz.costa', 'Beatriz Costa', 'B', '102', '+244 926 303 404'],
  ['antonio.lopes', 'António Lopes', 'B', '201', '+244 913 505 606'],
  ['helena.cardoso', 'Helena Cardoso', 'B', '202', '+244 927 707 808'],
  ['miguel.tavares', 'Miguel Tavares', 'B', '301', '+244 932 909 010'],
  ['sofia.baptista', 'Sofia Baptista', 'C', '101', '+244 923 121 314'],
  ['rui.almeida', 'Rui Almeida', 'C', '102', '+244 924 151 617'],
  ['teresa.gomes', 'Teresa Gomes', 'C', '201', '+244 914 181 920'],
  ['manuel.pereira', 'Manuel Pereira', 'C', '202', '+244 933 212 223'],
  ['catarina.vieira', 'Catarina Vieira', 'C', '301', '+244 928 242 526'],
];

const INS_USER = `INSERT INTO users(username,password_hash,role,name,bloco,apartamento,phone,email)
  VALUES (@username,@password_hash,@role,@name,@bloco,@apartamento,@phone,@email)`;

function demoEnabled(flag = process.env.SEED_DEMO) {
  const v = String(flag ?? '').trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}

/**
 * First-boot seed. `demo: false` creates only the admin account.
 * Passwords are arguments — this function does not read the environment,
 * so tests stay isolated from ADMIN_PASSWORD / SEED_DEMO.
 */
async function seed(db, opts = {}) {
  const demo = opts.demo !== false;
  const withVisits = opts.withVisits !== undefined ? opts.withVisits : demo;
  const adminPassword = opts.adminPassword !== undefined ? opts.adminPassword : 'admin123';
  const pwAdmin = hashPassword(adminPassword);
  const pwSec = hashPassword('seguranca123');
  const pwMorador = hashPassword('morador123');

  await db.transaction(async (tx) => {
    await tx.run(INS_USER, {
      username: 'admin', password_hash: pwAdmin, role: 'admin', name: 'Administração',
      bloco: null, apartamento: null, phone: '+244 222 000 000', email: 'admin@condominio.local',
    });
    if (!demo) return;
    await tx.run(INS_USER, {
      username: 'seguranca', password_hash: pwSec, role: 'seguranca', name: 'Portaria — Turno Dia',
      bloco: null, apartamento: null, phone: '+244 222 000 001', email: null,
    });
    await tx.run(INS_USER, {
      username: 'seguranca2', password_hash: pwSec, role: 'seguranca', name: 'Portaria — Turno Noite',
      bloco: null, apartamento: null, phone: '+244 222 000 002', email: null,
    });
    for (const [username, name, bloco, apartamento, phone] of RESIDENTS) {
      await tx.run(INS_USER, {
        username, password_hash: pwMorador, role: 'morador', name, bloco, apartamento, phone,
        email: `${username}@exemplo.ao`,
      });
    }
    if (!withVisits) return;
    const id = async (u) => (await tx.get('SELECT id FROM users WHERE username = ?', u)).id;
    const sec = await id('seguranca');
    const today = todayLocal();
    const yesterday = todayLocal(new Date(Date.now() - 86400000));
    const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
    const visitSql = `INSERT INTO visits(resident_id,visitor_name,accompanied,companions_count,companions_names,purpose,details,visit_date,access_code,status,origin,created_by,created_at,arrived_at,arrived_by,left_at,left_by)
      VALUES (@r,@n,@acc,@cc,@cn,@p,@d,@date,@code,@st,'morador',@r,@created,@arr,@arrby,@left,@leftby)`;
    const base = { acc: 0, cc: 0, cn: null, d: null, arr: null, arrby: null, left: null, leftby: null };
    const rows = [
      { ...base, r: await id('joao.santos'), n: 'Eduardo Kiala', p: 'servico', d: 'Técnico da operadora de internet — instalação de fibra.', date: today, code: '418203', st: 'pendente', created: hoursAgo(2) },
      { ...base, r: await id('beatriz.costa'), n: 'Joana Costa', acc: 1, cc: 2, cn: 'Marta e Tiago (filhos)', p: 'familia', date: today, code: '552901', st: 'pendente', created: hoursAgo(1) },
      { ...base, r: await id('rui.almeida'), n: 'Paulo Sebastião', p: 'visita', date: today, code: '730114', st: 'chegou', created: hoursAgo(4), arr: hoursAgo(1.5), arrby: sec },
      { ...base, r: await id('ana.silva'), n: 'Inês Moreira', p: 'visita', date: yesterday, code: '100245', st: 'saiu', created: hoursAgo(30), arr: hoursAgo(27), arrby: sec, left: hoursAgo(24), leftby: sec },
      { ...base, r: await id('helena.cardoso'), n: 'Canalizações Luanda Lda', acc: 1, cc: 1, cn: 'Ajudante', p: 'servico', d: 'Reparação da canalização da cozinha.', date: yesterday, code: '664020', st: 'saiu', created: hoursAgo(28), arr: hoursAgo(26), arrby: sec, left: hoursAgo(23), leftby: sec },
    ];
    for (const row of rows) await tx.run(visitSql, row);
  });
}

/** Seeds only when `users` is empty. Never deletes or overwrites existing rows. */
async function seedIfEmpty(db) {
  const row = await db.get('SELECT COUNT(*) AS n FROM users');
  if (Number(row.n) > 0) return false;
  const demo = demoEnabled();
  await seed(db, {
    demo,
    withVisits: demo,
    adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  });
  console.log(demo
    ? '🌱 Base de dados criada com dados de exemplo.'
    : '🌱 Conta de administração criada (sem dados de demonstração).');
  return true;
}

module.exports = { seed, seedIfEmpty, RESIDENTS, demoEnabled };

if (require.main === module) {
  const fs = require('fs');
  const path = require('path');
  const { openDb } = require('./db');
  (async () => {
    const usePg = !!(process.env.DATABASE_URL || '').trim();
    const file = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'condominio.db');
    if (!usePg && process.argv.includes('--reset')) {
      for (const f of [file, `${file}-wal`, `${file}-shm`]) if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    const db = usePg ? await openDb() : await openDb(file);
    if (usePg && process.argv.includes('--reset')) {
      await db.exec('TRUNCATE TABLE users, settings RESTART IDENTITY CASCADE');
    }
    const n = Number((await db.get('SELECT COUNT(*) AS n FROM users')).n);
    if (n > 0) console.log('A base de dados já tem dados. Use "npm run seed:reset" para recriar.');
    else {
      await seedIfEmpty(db);
      console.log(usePg ? '🌱 Dados gravados em PostgreSQL.' : `🌱 Dados gravados em ${file}`);
    }
    await db.close();
  })().catch((err) => { console.error(err); process.exit(1); });
}
