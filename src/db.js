'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('morador','seguranca','admin')),
  name          TEXT NOT NULL,
  bloco         TEXT,
  apartamento   TEXT,
  phone         TEXT,
  email         TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS visits (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  resident_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  visitor_name      TEXT NOT NULL,
  accompanied       INTEGER NOT NULL DEFAULT 0,
  companions_count  INTEGER NOT NULL DEFAULT 0,
  companions_names  TEXT,
  purpose           TEXT NOT NULL DEFAULT 'visita',
  details           TEXT,
  visit_date        TEXT NOT NULL,              -- YYYY-MM-DD (Africa/Luanda)
  access_code       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','aguardando','chegou','saiu','cancelada','recusada')),
  origin            TEXT NOT NULL DEFAULT 'morador' CHECK (origin IN ('morador','portaria')),
  created_by        INTEGER REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_at        TEXT,
  arrived_at        TEXT,
  arrived_by        INTEGER REFERENCES users(id),
  left_at           TEXT,
  left_by           INTEGER REFERENCES users(id),
  cancelled_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_resident ON visits(resident_id);
CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visit_date);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  visit_id   INTEGER REFERENCES visits(id) ON DELETE CASCADE,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  details    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function openDb(file) {
  const target = file || process.env.DB_FILE || path.join(__dirname, '..', 'data', 'condominio.db');
  if (target !== ':memory:') fs.mkdirSync(path.dirname(target), { recursive: true });
  const db = new Database(target);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}
function setSetting(db, key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}

module.exports = { openDb, getSetting, setSetting };
