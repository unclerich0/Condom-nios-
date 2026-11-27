'use strict';
const crypto = require('crypto');
const { nowIso } = require('./time');

/** Shared domain helpers: visit serialization, notifications, audit. */
function createServices(db, hub, push) {
  const visitSelect = `
    SELECT v.*, u.name AS resident_name, u.bloco, u.apartamento, u.phone AS resident_phone,
           a.name AS arrived_by_name, l.name AS left_by_name
    FROM visits v
    JOIN users u ON u.id = v.resident_id
    LEFT JOIN users a ON a.id = v.arrived_by
    LEFT JOIN users l ON l.id = v.left_by`;

  function serializeVisit(v) {
    if (!v) return null;
    return { ...v, accompanied: !!v.accompanied };
  }
  async function getVisit(id) { return serializeVisit(await db.get(`${visitSelect} WHERE v.id = ?`, id)); }

  async function notify(userId, { type, title, body, visitId = null }) {
    const info = await db.run(
      'INSERT INTO notifications(user_id,type,title,body,visit_id) VALUES (?,?,?,?,?)',
      userId, type, title, body || null, visitId,
    );
    const n = await db.get('SELECT * FROM notifications WHERE id = ?', info.lastInsertRowid);
    hub.toUser(userId, 'notification', n);
    push.sendToUser(userId, { title, body, tag: `visit-${visitId || n.id}`, url: '/' }).catch(() => {});
    return n;
  }

  async function audit(userId, action, entity, entityId, details) {
    await db.run(
      'INSERT INTO audit_log(user_id,action,entity,entity_id,details) VALUES (?,?,?,?,?)',
      userId || null, action, entity || null, entityId || null, details ? JSON.stringify(details) : null,
    );
  }

  /** Broadcast a visit change to staff and to the owning resident. */
  function broadcastVisit(visit, event = 'visit') {
    hub.toStaff(event, visit);
    hub.toUser(visit.resident_id, event, visit);
  }

  async function newAccessCode() {
    for (let i = 0; i < 50; i++) {
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      const row = await db.get("SELECT 1 AS n FROM visits WHERE access_code = ? AND status IN ('pendente','aguardando','chegou')", code);
      if (!row) return code;
    }
    throw new Error('Não foi possível gerar código de acesso');
  }

  return { visitSelect, getVisit, serializeVisit, notify, audit, broadcastVisit, newAccessCode, nowIso };
}
module.exports = { createServices };
