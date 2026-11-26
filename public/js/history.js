// Histórico de visitas com filtros (partilhado entre segurança e administração)
import { esc, fmtDay, fmtTime, todayLocal, STATUS, PURPOSE, emptyState, plural } from './ui.js';
import { get } from './api.js';

export function historyPanel(form, list, countEl) {
  form.from.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Luanda' }).format(new Date(Date.now() - 6 * 86400000));
  form.to.value = todayLocal();
  async function load() {
    const p = new URLSearchParams();
    for (const k of ['q', 'from', 'to', 'status']) if (form[k].value) p.set(k, form[k].value);
    p.set('limit', '500');
    const rows = await get(`/api/visits?${p}`);
    rows.sort((a, b) => b.visit_date.localeCompare(a.visit_date) || b.id - a.id);
    if (countEl) countEl.textContent = plural(rows.length, 'visita', 'visitas');
    list.innerHTML = rows.length ? rows.map((v) => {
      const times = [v.arrived_at && `chegada ${fmtTime(v.arrived_at)}`, v.left_at && `saída ${fmtTime(v.left_at)}`].filter(Boolean).join(' · ');
      return `<div class="cell"><div class="main"><div class="ttl strong truncate">${esc(v.visitor_name)}${v.accompanied ? ` <span class="foot">+${v.companions_count}</span>` : ''}</div>
        <div class="sub">${esc(v.resident_name)} · ${esc(v.bloco)}${esc(v.apartamento)} · ${PURPOSE[v.purpose] || ''}</div>
        ${times ? `<div class="foot num">${times}</div>` : ''}</div>
        <div class="trail"><div class="sub num">${fmtDay(v.visit_date)}</div><div class="status ${v.status}">${STATUS[v.status]}</div></div></div>`;
    }).join('') : emptyState('tray', 'Nada encontrado', 'Ajuste a pesquisa ou o intervalo de datas.');
  }
  let t; const soon = () => { clearTimeout(t); t = setTimeout(load, 180); };
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', soon); form.addEventListener('change', load);
  return { load };
}
