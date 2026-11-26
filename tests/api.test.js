'use strict';
process.env.DISABLE_PUSH = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { openDb } = require('../src/db');
const { seed } = require('../src/seed');
const { createApp } = require('../src/app');
const { todayLocal } = require('../src/time');

function setup() {
  const db = openDb(':memory:');
  seed(db, { withVisits: false });
  const app = createApp({ db, secureCookies: false });
  return { db, app };
}
async function login(app, username, password) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username, password });
  assert.equal(res.status, 200, res.body.error);
  return agent;
}

test('login: credenciais erradas são recusadas', async () => {
  const { app } = setup();
  const res = await request(app).post('/api/auth/login').send({ username: 'ana.silva', password: 'errada' });
  assert.equal(res.status, 401);
  assert.match(res.body.error, /incorretos/);
});

test('login: devolve o papel certo e /me funciona', async () => {
  const { app } = setup();
  for (const [u, p, role] of [['ana.silva', 'morador123', 'morador'], ['seguranca', 'seguranca123', 'seguranca'], ['admin', 'admin123', 'admin']]) {
    const agent = await login(app, u, p);
    const me = await agent.get('/api/auth/me');
    assert.equal(me.body.role, role);
    assert.equal(me.body.password_hash, undefined, 'não expõe hash');
  }
});

test('permissões: morador não acede a rotas da portaria nem da administração', async () => {
  const { app } = setup();
  const ana = await login(app, 'ana.silva', 'morador123');
  assert.equal((await ana.get('/api/residents')).status, 403);
  assert.equal((await ana.get('/api/admin/users')).status, 403);
  assert.equal((await request(app).get('/api/visits')).status, 401);
  const sec = await login(app, 'seguranca', 'seguranca123');
  assert.equal((await sec.get('/api/admin/users')).status, 403);
  assert.equal((await sec.post('/api/visits').send({ visitor_name: 'X' })).status, 403);
});

test('fluxo completo: registar → pendente na portaria → chegada notifica → saída', async () => {
  const { app } = setup();
  const ana = await login(app, 'ana.silva', 'morador123');
  const sec = await login(app, 'seguranca', 'seguranca123');

  const created = await ana.post('/api/visits').send({ visitor_name: 'Carlos Kiala', accompanied: true, companions_count: 2, companions_names: 'Filhos', purpose: 'servico', details: 'Pintura' });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'pendente');
  assert.equal(created.body.visit_date, todayLocal());
  assert.match(created.body.access_code, /^\d{6}$/);
  assert.equal(created.body.companions_count, 2);

  const pending = await sec.get('/api/visits?view=pending');
  assert.ok(pending.body.some((v) => v.id === created.body.id && v.resident_name === 'Ana Silva' && v.bloco === 'A'));

  const byCode = await sec.get(`/api/visits/code/${created.body.access_code}`);
  assert.equal(byCode.body.id, created.body.id);

  const arrive = await sec.post(`/api/visits/${created.body.id}/arrive`);
  assert.equal(arrive.body.status, 'chegou');
  assert.ok(arrive.body.arrived_at);
  assert.equal((await sec.post(`/api/visits/${created.body.id}/arrive`)).status, 409, 'não regista chegada duas vezes');

  const notifs = await ana.get('/api/notifications');
  assert.equal(notifs.body.unread, 1);
  assert.equal(notifs.body.items[0].type, 'arrival');
  assert.match(notifs.body.items[0].title, /Carlos Kiala chegou/);

  const inside = await sec.get('/api/visits?view=inside');
  assert.equal(inside.body.length, 1);

  const leave = await sec.post(`/api/visits/${created.body.id}/leave`);
  assert.equal(leave.body.status, 'saiu');
  assert.equal((await sec.get('/api/visits/stats')).body.inside, 0);

  await ana.post('/api/notifications/read-all');
  assert.equal((await ana.get('/api/notifications')).body.unread, 0);
});

test('validação: nome obrigatório e data no passado recusada', async () => {
  const { app } = setup();
  const ana = await login(app, 'ana.silva', 'morador123');
  assert.equal((await ana.post('/api/visits').send({ visitor_name: '  ' })).status, 400);
  assert.equal((await ana.post('/api/visits').send({ visitor_name: 'Zé', visit_date: '2000-01-01' })).status, 400);
});

test('morador só vê e cancela as suas visitas', async () => {
  const { app } = setup();
  const ana = await login(app, 'ana.silva', 'morador123');
  const joao = await login(app, 'joao.santos', 'morador123');
  const v = (await ana.post('/api/visits').send({ visitor_name: 'Visita da Ana' })).body;
  assert.equal((await joao.get('/api/visits')).body.length, 0);
  assert.equal((await joao.post(`/api/visits/${v.id}/cancel`)).status, 403);
  assert.equal((await ana.post(`/api/visits/${v.id}/cancel`)).body.status, 'cancelada');
});

test('visitante sem aviso: morador autoriza ou recusa', async () => {
  const { app, db } = setup();
  const sec = await login(app, 'seguranca', 'seguranca123');
  const ana = await login(app, 'ana.silva', 'morador123');
  const anaId = db.prepare("SELECT id FROM users WHERE username='ana.silva'").get().id;
  const w = (await sec.post('/api/visits/walkin').send({ resident_id: anaId, visitor_name: 'Entregador' })).body;
  assert.equal(w.status, 'aguardando');
  assert.equal((await sec.post(`/api/visits/${w.id}/arrive`)).status, 409, 'precisa de aprovação');
  assert.equal((await ana.get('/api/notifications')).body.items[0].type, 'walkin');
  const ok = (await ana.post(`/api/visits/${w.id}/decision`).send({ approve: true })).body;
  assert.equal(ok.status, 'pendente');
  assert.equal((await sec.post(`/api/visits/${w.id}/arrive`)).body.status, 'chegou');

  const w2 = (await sec.post('/api/visits/walkin').send({ resident_id: anaId, visitor_name: 'Desconhecido' })).body;
  assert.equal((await ana.post(`/api/visits/${w2.id}/decision`).send({ approve: false })).body.status, 'recusada');
});

test('pesquisa de moradores por nome, bloco/apartamento e telefone', async () => {
  const { app } = setup();
  const sec = await login(app, 'seguranca', 'seguranca123');
  const all = (await sec.get('/api/residents')).body;
  assert.equal(all.length, 15);
  assert.deepEqual((await sec.get('/api/residents?q=sofia')).body.map((r) => r.name), ['Sofia Baptista']);
  assert.deepEqual((await sec.get('/api/residents?q=B 201')).body.map((r) => r.name), ['António Lopes']);
  assert.deepEqual((await sec.get('/api/residents?q=C102')).body.map((r) => r.name), ['Rui Almeida']);
  assert.deepEqual((await sec.get('/api/residents?q=932909')).body.map((r) => r.name), ['Miguel Tavares']);
  assert.equal((await sec.get('/api/residents?q=bloco A')).body.length, 5);
});

test('admin: cria, edita e desativa contas; auditoria regista', async () => {
  const { app } = setup();
  const admin = await login(app, 'admin', 'admin123');
  const created = await admin.post('/api/admin/users').send({ name: 'Nova Moradora', username: 'nova.moradora', role: 'morador', bloco: 'd', apartamento: '401', phone: '+244 900 000 000', password: 'segredo1' });
  assert.equal(created.status, 201);
  assert.equal(created.body.bloco, 'D');
  assert.equal((await admin.post('/api/admin/users').send({ name: 'X', username: 'nova.moradora', role: 'morador', bloco: 'D', apartamento: '1', password: 'segredo1' })).status, 409);
  await login(app, 'nova.moradora', 'segredo1');
  const upd = await admin.patch(`/api/admin/users/${created.body.id}`).send({ active: false });
  assert.equal(upd.body.active, false);
  const res = await request(app).post('/api/auth/login').send({ username: 'nova.moradora', password: 'segredo1' });
  assert.equal(res.status, 403);
  const audit = (await admin.get('/api/admin/audit')).body;
  assert.ok(audit.some((a) => a.action === 'user.create'));
});

test('tempo real: SSE entrega nova visita à portaria', async () => {
  const { app } = setup();
  const server = app.listen(0); const port = server.address().port;
  try {
    const loginRes = await request(app).post('/api/auth/login').send({ username: 'seguranca', password: 'seguranca123' });
    const sid = loginRes.headers['set-cookie'][0].split(';')[0];
    const ctrl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/events`, { headers: { cookie: sid }, signal: ctrl.signal });
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    const got = (async () => { while (!buf.includes('event: visit:new')) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value); } return buf; })();
    const ana = await login(app, 'ana.silva', 'morador123');
    await ana.post('/api/visits').send({ visitor_name: 'Em Tempo Real' });
    const text = await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout SSE')), 3000))]);
    assert.match(text, /Em Tempo Real/);
    ctrl.abort();
  } finally { server.closeAllConnections?.(); server.close(); }
});
