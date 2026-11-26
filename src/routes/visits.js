'use strict';
const express = require('express');
const { requireRole } = require('../auth');
const { HttpError, str, int, bool, date } = require('../validate');
const { todayLocal } = require('../time');

const PURPOSES = ['visita', 'servico', 'entrega', 'familia', 'outro'];
const PURPOSE_LABEL = { visita: 'Visita', servico: 'Serviço/Trabalho', entrega: 'Entrega', familia: 'Família', outro: 'Outro' };

function parseVisitInput(body) {
  const visitor_name = str(body.visitor_name, { field: 'Nome do visitante', max: 120, required: true });
  const accompanied = bool(body.accompanied);
  const companions_count = accompanied ? int(body.companions_count || 1, { field: 'Nº de acompanhantes', min: 1, max: 30 }) : 0;
  const companions_names = accompanied ? str(body.companions_names, { field: 'Acompanhantes', max: 400 }) : '';
  const purpose = PURPOSES.includes(body.purpose) ? body.purpose : 'visita';
  const details = str(body.details, { field: 'Detalhes', max: 500 });
  return { visitor_name, accompanied, companions_count, companions_names, purpose, details };
}

module.exports = function visitsRouter({ db, svc }) {
  const r = express.Router();
  const staff = requireRole('seguranca', 'admin');

  // ---- Listagem -----------------------------------------------------------
  r.get('/', requireRole('morador', 'seguranca', 'admin'), (req, res) => {
    const where = []; const params = {};
    const q = req.query;
    if (req.user.role === 'morador') { where.push('v.resident_id = @me'); params.me = req.user.id; }
    if (q.view === 'pending') {
      where.push("v.status IN ('pendente','aguardando')");
      where.push('v.visit_date <= @today'); params.today = todayLocal();
      if (req.user.role !== 'morador') { where.push('v.visit_date >= @today'); }
    } else if (q.view === 'inside') {
      where.push("v.status = 'chegou'");
    } else if (q.view === 'upcoming') {
      where.push("v.status IN ('pendente','aguardando','chegou')");
    }
    if (q.status) {
      const sts = String(q.status).split(',').filter(Boolean);
      where.push(`v.status IN (${sts.map((_, i) => `@st${i}`).join(',')})`);
      sts.forEach((s, i) => { params[`st${i}`] = s; });
    }
    const from = date(q.from, 'de'); const to = date(q.to, 'até');
    if (from) { where.push('v.visit_date >= @from'); params.from = from; }
    if (to) { where.push('v.visit_date <= @to'); params.to = to; }
    if (q.date) { where.push('v.visit_date = @date'); params.date = date(q.date); }
    if (q.resident_id && req.user.role !== 'morador') { where.push('v.resident_id = @rid'); params.rid = Number(q.resident_id); }
    if (q.q) {
      where.push('(v.visitor_name LIKE @q OR u.name LIKE @q OR v.access_code = @qraw OR (u.bloco || u.apartamento) LIKE @q OR v.companions_names LIKE @q)');
      params.q = `%${String(q.q).trim()}%`; params.qraw = String(q.q).trim();
    }
    const limit = Math.min(Number(q.limit) || 200, 500);
    const sql = `${svc.visitSelect} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE v.status WHEN 'aguardando' THEN 0 WHEN 'pendente' THEN 1 WHEN 'chegou' THEN 2 ELSE 3 END,
               v.visit_date DESC, COALESCE(v.arrived_at, v.created_at) DESC LIMIT ${limit}`;
    res.json(db.prepare(sql).all(params).map(svc.serializeVisit));
  });

  r.get('/stats', staff, (_req, res) => {
    const today = todayLocal();
    const g = (sql, ...p) => db.prepare(sql).get(...p).n;
    res.json({
      today,
      pending: g("SELECT COUNT(*) n FROM visits WHERE status IN ('pendente','aguardando') AND visit_date = ?", today),
      awaiting: g("SELECT COUNT(*) n FROM visits WHERE status = 'aguardando'"),
      inside: g("SELECT COUNT(*) n FROM visits WHERE status = 'chegou'"),
      arrivedToday: g("SELECT COUNT(*) n FROM visits WHERE arrived_at IS NOT NULL AND visit_date = ?", today),
      totalToday: g("SELECT COUNT(*) n FROM visits WHERE visit_date = ?", today),
    });
  });

  r.get('/code/:code', staff, (req, res) => {
    const row = db.prepare(`${svc.visitSelect} WHERE v.access_code = ? AND v.status IN ('pendente','aguardando','chegou') ORDER BY v.id DESC LIMIT 1`).get(String(req.params.code).trim());
    if (!row) throw new HttpError(404, 'Nenhuma visita ativa com este código.');
    res.json(svc.serializeVisit(row));
  });

  // ---- Morador regista visita --------------------------------------------
  r.post('/', requireRole('morador'), (req, res) => {
    const input = parseVisitInput(req.body || {});
    const today = todayLocal();
    const visit_date = date(req.body.visit_date) || today;
    if (visit_date < today) throw new HttpError(400, 'A data da visita não pode ser no passado.');
    const info = db.prepare(`INSERT INTO visits (resident_id, visitor_name, accompanied, companions_count, companions_names, purpose, details, visit_date, access_code, status, origin, created_by)
      VALUES (@resident_id, @visitor_name, @accompanied, @companions_count, @companions_names, @purpose, @details, @visit_date, @access_code, 'pendente', 'morador', @resident_id)`)
      .run({ ...input, accompanied: input.accompanied ? 1 : 0, resident_id: req.user.id, visit_date, access_code: svc.newAccessCode() });
    const visit = svc.getVisit(info.lastInsertRowid);
    svc.audit(req.user.id, 'visit.create', 'visit', visit.id, { visitor: visit.visitor_name, date: visit_date });
    svc.broadcastVisit(visit, 'visit:new');
    res.status(201).json(visit);
  });

  // ---- Portaria regista visitante sem aviso (morador aprova/recusa) -------
  r.post('/walkin', staff, (req, res) => {
    const input = parseVisitInput(req.body || {});
    const resident = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'morador' AND active = 1").get(Number(req.body.resident_id));
    if (!resident) throw new HttpError(400, 'Escolha um morador válido.');
    const info = db.prepare(`INSERT INTO visits (resident_id, visitor_name, accompanied, companions_count, companions_names, purpose, details, visit_date, access_code, status, origin, created_by)
      VALUES (@resident_id, @visitor_name, @accompanied, @companions_count, @companions_names, @purpose, @details, @visit_date, @access_code, 'aguardando', 'portaria', @by)`)
      .run({ ...input, accompanied: input.accompanied ? 1 : 0, resident_id: resident.id, visit_date: todayLocal(), access_code: svc.newAccessCode(), by: req.user.id });
    const visit = svc.getVisit(info.lastInsertRowid);
    svc.audit(req.user.id, 'visit.walkin', 'visit', visit.id, { visitor: visit.visitor_name, resident: resident.name });
    svc.notify(resident.id, { type: 'walkin', title: `${visit.visitor_name} está na portaria`, body: 'Autoriza a entrada? Abra a app para aprovar ou recusar.', visitId: visit.id });
    svc.broadcastVisit(visit, 'visit:new');
    res.status(201).json(visit);
  });

  function loadOr404(id) {
    const v = svc.getVisit(Number(id));
    if (!v) throw new HttpError(404, 'Visita não encontrada.');
    return v;
  }

  r.post('/:id/decision', requireRole('morador'), (req, res) => {
    const v = loadOr404(req.params.id);
    if (v.resident_id !== req.user.id) throw new HttpError(403, 'Esta visita não é sua.');
    if (v.status !== 'aguardando') throw new HttpError(409, 'Esta visita já foi decidida.');
    const approve = bool(req.body.approve);
    db.prepare('UPDATE visits SET status = ?, decided_at = ? WHERE id = ?').run(approve ? 'pendente' : 'recusada', svc.nowIso(), v.id);
    const visit = svc.getVisit(v.id);
    svc.audit(req.user.id, approve ? 'visit.approve' : 'visit.deny', 'visit', v.id);
    svc.broadcastVisit(visit, 'visit:update');
    res.json(visit);
  });

  r.post('/:id/arrive', staff, (req, res) => {
    const v = loadOr404(req.params.id);
    if (v.status !== 'pendente') throw new HttpError(409, v.status === 'aguardando' ? 'Aguarde a aprovação do morador.' : 'Esta visita não está pendente.');
    db.prepare("UPDATE visits SET status = 'chegou', arrived_at = ?, arrived_by = ? WHERE id = ?").run(svc.nowIso(), req.user.id, v.id);
    const visit = svc.getVisit(v.id);
    const extra = visit.accompanied ? ` com ${visit.companions_count} acompanhante${visit.companions_count > 1 ? 's' : ''}` : '';
    svc.notify(visit.resident_id, { type: 'arrival', title: `${visit.visitor_name} chegou`, body: `Entrada registada na portaria${extra}.`, visitId: visit.id });
    svc.audit(req.user.id, 'visit.arrive', 'visit', v.id);
    svc.broadcastVisit(visit, 'visit:update');
    res.json(visit);
  });

  r.post('/:id/leave', staff, (req, res) => {
    const v = loadOr404(req.params.id);
    if (v.status !== 'chegou') throw new HttpError(409, 'Só é possível registar saída de quem está dentro.');
    db.prepare("UPDATE visits SET status = 'saiu', left_at = ?, left_by = ? WHERE id = ?").run(svc.nowIso(), req.user.id, v.id);
    const visit = svc.getVisit(v.id);
    svc.notify(visit.resident_id, { type: 'departure', title: `${visit.visitor_name} saiu`, body: 'Saída registada na portaria.', visitId: visit.id });
    svc.audit(req.user.id, 'visit.leave', 'visit', v.id);
    svc.broadcastVisit(visit, 'visit:update');
    res.json(visit);
  });

  r.post('/:id/cancel', requireRole('morador', 'seguranca', 'admin'), (req, res) => {
    const v = loadOr404(req.params.id);
    if (req.user.role === 'morador' && v.resident_id !== req.user.id) throw new HttpError(403, 'Esta visita não é sua.');
    if (!['pendente', 'aguardando'].includes(v.status)) throw new HttpError(409, 'Só visitas pendentes podem ser canceladas.');
    db.prepare("UPDATE visits SET status = 'cancelada', cancelled_at = ? WHERE id = ?").run(svc.nowIso(), v.id);
    const visit = svc.getVisit(v.id);
    svc.audit(req.user.id, 'visit.cancel', 'visit', v.id);
    svc.broadcastVisit(visit, 'visit:update');
    res.json(visit);
  });

  return r;
};
module.exports.PURPOSE_LABEL = PURPOSE_LABEL;
