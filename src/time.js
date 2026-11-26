'use strict';
const TZ = process.env.APP_TZ || 'Africa/Luanda';

/** YYYY-MM-DD for "today" in the condominium time zone. */
function todayLocal(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function nowIso() { return new Date().toISOString(); }
function formatLocal(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-PT', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}
module.exports = { TZ, todayLocal, nowIso, formatLocal };
