'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { ensureSetting } = require('./db');

const COOKIE = 'cv_session';
const TTL_SECONDS = 60 * 60 * 12; // 12h — um turno de segurança

async function jwtSecret(db) {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (db._jwtSecret) return db._jwtSecret;
  const secret = await ensureSetting(db, 'jwt_secret', () => crypto.randomBytes(48).toString('hex'));
  db._jwtSecret = secret;
  return secret;
}

function hashPassword(pw) { return bcrypt.hashSync(pw, 10); }
function checkPassword(pw, hash) { return bcrypt.compareSync(pw, hash); }

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return { ...rest, active: !!rest.active };
}

async function issue(res, db, user, secure) {
  const token = jwt.sign({ sub: user.id, role: user.role }, await jwtSecret(db), { expiresIn: TTL_SECONDS });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: !!secure, maxAge: TTL_SECONDS * 1000, path: '/' });
}

function authenticate(db) {
  return async (req, _res, next) => {
    try {
      const token = req.cookies && req.cookies[COOKIE];
      if (token) {
        const secret = await jwtSecret(db);
        let payload = null;
        try { payload = jwt.verify(token, secret); }
        catch (err) {
          if (!err || (err.name !== 'JsonWebTokenError' && err.name !== 'TokenExpiredError' && err.name !== 'NotBeforeError')) throw err;
        }
        if (payload) {
          const u = await db.get('SELECT * FROM users WHERE id = ? AND active = 1', payload.sub);
          if (u) req.user = publicUser(u);
        }
      }
      next();
    } catch (err) { next(err); }
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
