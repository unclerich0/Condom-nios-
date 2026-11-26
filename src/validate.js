'use strict';
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
function str(v, { field, max = 200, required = false } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') throw new HttpError(400, `Campo inválido: ${field}`);
  const s = String(v).trim();
  if (required && !s) throw new HttpError(400, `Preencha o campo: ${field}`);
  if (s.length > max) throw new HttpError(400, `${field} é demasiado longo (máx. ${max} caracteres)`);
  return s;
}
function int(v, { field, min = 0, max = 50 } = {}) {
  const n = Number.parseInt(v ?? 0, 10);
  if (Number.isNaN(n) || n < min || n > max) throw new HttpError(400, `${field} deve estar entre ${min} e ${max}`);
  return n;
}
function bool(v) { return v === true || v === 'true' || v === 1 || v === '1' || v === 'on'; }
function date(v, field = 'data') {
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) throw new HttpError(400, `Data inválida: ${field}`);
  return String(v);
}
module.exports = { HttpError, str, int, bool, date };
