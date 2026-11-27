'use strict';
// Corre contra Postgres real quando DATABASE_URL está definida.
// Confirma que contas, visitas, subscrições push e o segredo de sessão
// sobrevivem a um reinício do processo (o caso do disco efémero na Render).
const crypto = require('crypto');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { connectionOptions } = require('../src/db');

const ROOT = path.join(__dirname, '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function startServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`servidor não arrancou\n${out}\n${err}`));
    }, 45000);
    child.stdout.on('data', (d) => {
      out += d;
      if (!settled && out.includes('a correr')) {
        settled = true;
        clearTimeout(timer);
        resolve({
          child,
          log: () => `${out}\n${err}`,
        });
      }
    });
    child.stderr.on('data', (d) => { err += d; });
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`servidor saiu (${code})\n${out}\n${err}`));
      }
    });
  });
}

function stopServer(handle) {
  if (!handle) return Promise.resolve();
  const { child } = handle;
  if (child.exitCode !== null || child.signalCode) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 5000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
}

function childEnv(port, schema, extra) {
  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_SCHEMA: schema,
    DISABLE_PUSH: '1',
    NODE_ENV: 'test',
    SEED: '1',
    JWT_SECRET: '',
    ...extra,
  };
  return env;
}

async function api(port, pathname, { method = 'GET', cookie, body } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const setCookie = raw.map((c) => c.split(';')[0]).join('; ');
  return { status: res.status, json, cookie: setCookie || cookie || '' };
}

async function pgQuery(schema, sql, params = []) {
  const client = new Client({
    ...connectionOptions(process.env.DATABASE_URL),
    options: `-c search_path=${schema}`,
  });
  await client.connect();
  try { return await client.query(sql, params); }
  finally { await client.end(); }
}

async function createSchema() {
  const schema = `p_${crypto.randomBytes(6).toString('hex')}`;
  const client = new Client(connectionOptions(process.env.DATABASE_URL));
  await client.connect();
  try { await client.query(`CREATE SCHEMA "${schema}"`); }
  finally { await client.end(); }
  return schema;
}

async function dropSchema(schema) {
  const client = new Client(connectionOptions(process.env.DATABASE_URL));
  await client.connect();
  try {
    for (let i = 0; i < 10; i++) {
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        return;
      } catch (err) {
        if (i === 9) throw err;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  } finally { await client.end(); }
}

async function boot(schema, extra) {
  const port = await freePort();
  const server = await startServer(childEnv(port, schema, extra));
  return { port, server };
}

test('postgres: dados, push e sessão sobrevivem a um reinício', { timeout: 120000 }, async (t) => {
  if (!(process.env.DATABASE_URL || '').trim()) {
    t.skip('DATABASE_URL não definido');
    return;
  }
  const schema = await createSchema();
  let server = null;
  try {
    let current = await boot(schema, { SEED_DEMO: 'false', ADMIN_PASSWORD: 'senha-persist' });
    server = current.server;
    assert.match(server.log(), /PostgreSQL/);
    assert.match(server.log(), /sem dados de demonstração/);

    const bad = await api(current.port, '/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
    assert.equal(bad.status, 401);
    const login = await api(current.port, '/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'senha-persist' } });
    assert.equal(login.status, 200, JSON.stringify(login.json));
    const cookie = login.cookie;
    assert.ok(cookie.includes('cv_session'));

    const users = await api(current.port, '/api/admin/users', { cookie });
    assert.deepEqual(users.json.map((u) => u.username), ['admin']);

    const created = await api(current.port, '/api/admin/users', {
      method: 'POST', cookie,
      body: { name: 'Residente Persistente', username: 'residente.persist', role: 'morador', bloco: 'A', apartamento: '404', password: 'persist123' },
    });
    assert.equal(created.status, 201, JSON.stringify(created.json));

    const asResident = await api(current.port, '/api/auth/login', { method: 'POST', body: { username: 'residente.persist', password: 'persist123' } });
    const visit = await api(current.port, '/api/visits', {
      method: 'POST', cookie: asResident.cookie,
      body: { visitor_name: 'Visita Persistente', purpose: 'visita' },
    });
    assert.equal(visit.status, 201, JSON.stringify(visit.json));

    const endpoint = 'https://push.example/persist';
    const sub = await api(current.port, '/api/push/subscribe', {
      method: 'POST', cookie,
      body: { endpoint, keys: { p256dh: 'p256dh-value', auth: 'auth-value' } },
    });
    assert.equal(sub.status, 201, JSON.stringify(sub.json));

    await stopServer(server);
    server = null;

    current = await boot(schema, { SEED_DEMO: 'false', ADMIN_PASSWORD: 'senha-persist' });
    server = current.server;
    assert.doesNotMatch(server.log(), /sem dados de demonstração/, 'não volta a semear uma base que já tem contas');
    assert.doesNotMatch(server.log(), /dados de exemplo/);

    const meAgain = await api(current.port, '/api/auth/me', { cookie });
    assert.equal(meAgain.status, 200, 'o cookie de sessão tem de continuar válido (jwt_secret na BD)');
    assert.equal(meAgain.json.role, 'admin');

    const usersAgain = await api(current.port, '/api/admin/users', { cookie });
    assert.deepEqual(usersAgain.json.map((u) => u.username).sort(), ['admin', 'residente.persist']);

    const visitsAgain = await api(current.port, '/api/visits', { cookie: asResident.cookie });
    assert.equal(visitsAgain.status, 200, JSON.stringify(visitsAgain.json));
    assert.ok(visitsAgain.json.some((v) => v.visitor_name === 'Visita Persistente' && v.status === 'pendente'));

    const subs = await pgQuery(schema, 'SELECT user_id, p256dh, auth FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    assert.equal(subs.rowCount, 1);
    assert.equal(subs.rows[0].p256dh, 'p256dh-value');
    assert.equal(subs.rows[0].auth, 'auth-value');
    const secret = await pgQuery(schema, "SELECT value FROM settings WHERE key = 'jwt_secret'");
    assert.equal(secret.rowCount, 1);
    assert.ok(secret.rows[0].value.length >= 32);
    const vapid = await pgQuery(schema, "SELECT COUNT(*)::int AS n FROM settings WHERE key IN ('vapid_public','vapid_private')");
    assert.equal(Number(vapid.rows[0].n), 2);

    await stopServer(server);
    server = null;

    current = await boot(schema, { SEED_DEMO: 'true', ADMIN_PASSWORD: 'outra-senha' });
    server = current.server;
    const still = await api(current.port, '/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'senha-persist' } });
    assert.equal(still.status, 200, 'ADMIN_PASSWORD não pode repor a palavra-passe de uma conta já existente');
    const notDemo = await api(current.port, '/api/auth/login', { method: 'POST', body: { username: 'ana.silva', password: 'morador123' } });
    assert.equal(notDemo.status, 401, 'SEED_DEMO=true num arranque seguinte não pode injectar moradores de exemplo');
    const count = await pgQuery(schema, 'SELECT COUNT(*)::int AS n FROM users');
    assert.equal(Number(count.rows[0].n), 2);
  } finally {
    await stopServer(server);
    await dropSchema(schema);
  }
});

test('postgres: dados de demonstração sobrevivem ao reinício e não são duplicados', { timeout: 120000 }, async (t) => {
  if (!(process.env.DATABASE_URL || '').trim()) {
    t.skip('DATABASE_URL não definido');
    return;
  }
  const schema = await createSchema();
  let server = null;
  try {
    let current = await boot(schema, { SEED_DEMO: '', ADMIN_PASSWORD: '' });
    server = current.server;
    assert.match(server.log(), /dados de exemplo/);
    const ana = await api(current.port, '/api/auth/login', { method: 'POST', body: { username: 'ana.silva', password: 'morador123' } });
    assert.equal(ana.status, 200, JSON.stringify(ana.json));
    const created = await api(current.port, '/api/visits', { method: 'POST', cookie: ana.cookie, body: { visitor_name: 'Visita Que Fica' } });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const admin = await api(current.port, '/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
    const before = await api(current.port, '/api/admin/users', { cookie: admin.cookie });
    assert.equal(before.json.length, 18);

    await stopServer(server);
    server = null;
    current = await boot(schema, { SEED_DEMO: '', ADMIN_PASSWORD: '' });
    server = current.server;
    assert.doesNotMatch(server.log(), /dados de exemplo/);
    const anaAgain = await api(current.port, '/api/visits', { cookie: ana.cookie });
    assert.equal(anaAgain.status, 200, 'sessão da Ana continua válida depois do reinício');
    assert.ok(anaAgain.json.some((v) => v.visitor_name === 'Visita Que Fica'));
    const adminAgain = await api(current.port, '/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
    const after = await api(current.port, '/api/admin/users', { cookie: adminAgain.cookie });
    assert.equal(after.json.length, 18, 'o arranque não pode duplicar nem apagar as contas');
  } finally {
    await stopServer(server);
    await dropSchema(schema);
  }
});
