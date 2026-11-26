'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getSetting, setSetting } = require('./db');

const COOKIE = 'cv_session';
const TTL_SECONDS = 60 * 60 * 12; // 12h — um turno de segurança

function jwtSecret(db) {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  let s = getSetting(db, 'jwt_secret');
  if (!s) { s = crypto.randomBytes(48).toString('hex'); setSetting(db, 'jwt_secret', s); }
  return s;
}

function hashPassword(pw) { return bcrypt.hashSync(pw, 10); }
function checkPassword(pw, hash) { return bcrypt.compareSync(pw, hash); }

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return { ...rest, active: !!rest.active };
}

function issue(res, db, user, secure) {
  const token = jwt.sign({ sub: user.id, role: user.role }, jwtSecret(db), { expiresIn: TTL_SECONDS });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: !!secure, maxAge: TTL_SECONDS * 1000, path: '/' });
}

function authenticate(db) {
  const findUser = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1');
  return (req, _res, next) => {
    const token = req.cookies && req.cookies[COOKIE];
    if (token) {
      try {
        const payload = jwt.verify(token, jwtSecret(db));
        const u = findUser.get(payload.sub);
        if (u) req.user = publicUser(u);
      } catch { /* token inválido/expirado */ }
    }
    next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sessão expirada. Inicie sessão novamente.' });
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Sem permissão para esta ação.' });
    next();
  };
}

module.exports = { COOKIE, issue, authenticate, requireRole, hashPassword, checkPassword, publicUser };
