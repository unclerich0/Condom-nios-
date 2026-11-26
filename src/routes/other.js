'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireRole, issue, checkPassword, hashPassword, publicUser, COOKIE } = require('../auth');
const { HttpError, str, bool } = require('../validate');

function authRouter({ db, svc, secureCookies }) {
  const r = express.Router();
  const limiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: Number(process.env.LOGIN_RATE_LIMIT || 30), standardHeaders: true, legacyHeaders: false,
    message: { error: 'Demasiadas tentativas. Tente novamente dentro de alguns minutos.' } });

  r.post('/login', limiter, (req, res) => {
    const username = str(req.body?.username, { field: 'Utilizador', max: 60, required: true });
    const password = str(req.body?.password, { field: 'Palavra-passe', max: 200, required: true });
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!u || !checkPassword(password, u.password_hash)) throw new HttpError(401, 'Utilizador ou palavra-passe incorretos.');
    if (!u.active) throw new HttpError(403, 'Conta desativada. Fale com a administração.');
    issue(res, db, u, secureCookies);
    svc.audit(u.id, 'auth.login', 'user', u.id);
    res.json(publicUser(u));
  });
  r.post('/logout', (req, res) => { res.clearCookie(COOKIE, { path: '/' }); res.json({ ok: true }); });
  r.get('/me', requireRole(), (req, res) => res.json(req.user));
  r.post('/password', requireRole(), (req, res) => {
    const current = str(req.body?.current, { field: 'Palavra-passe atual', required: true });
    const next = str(req.body?.next, { field: 'Nova palavra-passe', required: true, max: 200 });
    if (next.length < 6) throw new HttpError(400, 'A nova palavra-passe deve ter pelo menos 6 caracteres.');
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!checkPassword(current, u.password_hash)) throw new HttpError(400, 'Palavra-passe atual incorreta.');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), u.id);
    svc.audit(u.id, 'auth.password', 'user', u.id);
    res.json({ ok: true });
  });
  return r;
}

function residentsRouter({ db }) {
  const r = express.Router();
  r.get('/', requireRole('seguranca', 'admin'), (req, res) => {
    const q = String(req.query.q || '').trim();
    const params = {};
    let where = "role = 'morador' AND active = 1";
    if (q) {
      // "A 101", "A101", "bloco a", nome, telefone…
      const compact = q.replace(/\s+/g, '').replace(/^bloco/i, '');
      where += ` AND (name LIKE @q OR phone LIKE @q OR REPLACE(phone,' ','') LIKE @qd OR apartamento LIKE @q
                  OR (bloco || apartamento) LIKE @qc OR ('bloco ' || bloco) LIKE @q OR bloco = @qraw)`;
      Object.assign(params, { q: `%${q}%`, qd: `%${q.replace(/\s+/g, '')}%`, qc: `%${compact}%`, qraw: q.toUpperCase() });
    }
    const rows = db.prepare(`SELECT u.id, u.name, u.bloco, u.apartamento, u.phone, u.email,
        (SELECT COUNT(*) FROM visits v WHERE v.resident_id = u.id AND v.status = 'chegou') AS inside_count,
        (SELECT COUNT(*) FROM visits v WHERE v.resident_id = u.id AND v.status IN ('pendente','aguardando')) AS pending_count
      FROM users u WHERE ${where} ORDER BY bloco, CAST(apartamento AS INTEGER), name LIMIT 200`).all(params);
    res.json(rows);
  });
  return r;
}

function notificationsRouter({ db }) {
  const r = express.Router();
  r.use(requireRole());
  r.get('/', (req, res) => {
    res.json({
      items: db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id),
      unread: db.prepare('SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).n,
    });
  });
  r.post('/read-all', (req, res) => {
    db.prepare("UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND read_at IS NULL").run(req.user.id);
    res.json({ ok: true });
  });
  r.post('/:id/read', (req, res) => {
    db.prepare("UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user.id);
    res.json({ ok: true });
  });
  return r;
}

function pushRouter({ db, push }) {
  const r = express.Router();
  r.get('/key', (_req, res) => res.json({ publicKey: push.publicKey }));
  r.post('/subscribe', requireRole(), (req, res) => {
    const s = req.body || {};
    if (!s.endpoint || !s.keys?.p256dh || !s.keys?.auth) throw new HttpError(400, 'Subscrição inválida.');
    db.prepare(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES (?,?,?,?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`)
      .run(req.user.id, s.endpoint, s.keys.p256dh, s.keys.auth);
    res.status(201).json({ ok: true });
  });
  r.post('/unsubscribe', requireRole(), (req, res) => {
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(String(req.body?.endpoint || ''), req.user.id);
    res.json({ ok: true });
  });
  return r;
}

function adminRouter({ db, svc }) {
  const r = express.Router();
  r.use(requireRole('admin'));
  const ROLES = ['morador', 'seguranca', 'admin'];

  r.get('/users', (req, res) => {
    const role = ROLES.includes(req.query.role) ? req.query.role : null;
    const q = String(req.query.q || '').trim();
    const rows = db.prepare(`SELECT * FROM users WHERE (@role IS NULL OR role = @role)
      AND (@q = '' OR name LIKE @ql OR username LIKE @ql OR phone LIKE @ql OR (bloco || apartamento) LIKE @ql)
      ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'seguranca' THEN 1 ELSE 2 END, bloco, CAST(apartamento AS INTEGER), name`)
      .all({ role, q, ql: `%${q.replace(/\s+/g, '')}%` });
    res.json(rows.map(publicUser));
  });

  function parseUser(body, creating) {
    const out = {
      name: str(body.name, { field: 'Nome', max: 120, required: true }),
      username: str(body.username, { field: 'Utilizador', max: 60, required: true }).toLowerCase(),
      role: ROLES.includes(body.role) ? body.role : 'morador',
      bloco: str(body.bloco, { field: 'Bloco', max: 10 }).toUpperCase() || null,
      apartamento: str(body.apartamento, { field: 'Apartamento', max: 10 }) || null,
      phone: str(body.phone, { field: 'Telefone', max: 30 }) || null,
      email: str(body.email, { field: 'Email', max: 120 }) || null,
    };
    if (!/^[a-z0-9._-]{3,60}$/.test(out.username)) throw new HttpError(400, 'Utilizador: use 3+ letras minúsculas, números, ponto ou hífen.');
    if (out.role === 'morador' && (!out.bloco || !out.apartamento)) throw new HttpError(400, 'Moradores precisam de bloco e apartamento.');
    if (creating || body.password) {
      const pw = str(body.password, { field: 'Palavra-passe', required: creating, max: 200 });
      if (pw && pw.length < 6) throw new HttpError(400, 'A palavra-passe deve ter pelo menos 6 caracteres.');
      if (pw) out.password_hash = hashPassword(pw);
    }
    return out;
  }

  r.post('/users', (req, res) => {
    const u = parseUser(req.body || {}, true);
    try {
      const info = db.prepare(`INSERT INTO users(name,username,role,bloco,apartamento,phone,email,password_hash)
        VALUES (@name,@username,@role,@bloco,@apartamento,@phone,@email,@password_hash)`).run(u);
      svc.audit(req.user.id, 'user.create', 'user', info.lastInsertRowid, { username: u.username, role: u.role });
      res.status(201).json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)));
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Já existe um utilizador com esse nome de utilizador.');
      throw e;
    }
  });

  r.patch('/users/:id', (req, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) throw new HttpError(404, 'Utilizador não encontrado.');
    const body = { ...publicUser(existing), ...req.body };
    const u = parseUser(body, false);
    const active = body.active === undefined ? existing.active : (bool(body.active) ? 1 : 0);
    if (id === req.user.id && (!active || u.role !== 'admin')) throw new HttpError(400, 'Não pode desativar nem despromover a sua própria conta.');
    try {
      db.prepare(`UPDATE users SET name=@name, username=@username, role=@role, bloco=@bloco, apartamento=@apartamento,
        phone=@phone, email=@email, active=@active ${u.password_hash ? ', password_hash=@password_hash' : ''} WHERE id=@id`).run({ ...u, active, id });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Já existe um utilizador com esse nome de utilizador.');
      throw e;
    }
    svc.audit(req.user.id, 'user.update', 'user', id, { fields: Object.keys(req.body || {}).filter((k) => k !== 'password') });
    res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
  });

  r.get('/audit', (_req, res) => {
    res.json(db.prepare(`SELECT a.*, u.name AS user_name, u.role AS user_role FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 200`).all());
  });
  return r;
}

module.exports = { authRouter, residentsRouter, notificationsRouter, pushRouter, adminRouter };
