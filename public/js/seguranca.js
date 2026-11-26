import { $, $$, h, esc, icon, toast, banner, openSheet, reconcile, hydrateIcons, busy, haptic,
  fmtTime, fmtDay, relTime, todayLocal, emptyState, initials, plural, STATUS, PURPOSE, setFieldError } from './ui.js';
import { get, post, requireSession, connectLive, registerSW, systemNotify, notificationsSupported } from './api.js';
import { historyPanel } from './history.js';
import { mountShell } from './shell.js';

registerSW();
const me = await requireSession('seguranca', 'admin');
if (!me) await new Promise(() => {}); // a redirecionar

let ready = false; let history;
const shell = mountShell({
  me, defaultTab: 'pendentes', unitLine: 'Segurança',
  tabs: [
    { id: 'pendentes', label: 'Pendentes', icon: 'clock' }, { id: 'dentro', label: 'No condomínio', icon: 'building' },
    { id: 'historico', label: 'Histórico', icon: 'history' }, { id: 'moradores', label: 'Moradores', icon: 'search', solo: true },
  ],
  actions: [
    { id: 'code', label: 'Verificar código de acesso', icon: 'key', onClick: (b) => codeSheetOpen(b) },
    { id: 'walkin', label: 'Visitante sem aviso', icon: 'plus', onClick: (b) => walkinSheet(null, b) },
  ],
  onChange: (t) => {
    if (!ready) return;
    if (t === 'moradores') { searchResidents(); setTimeout(() => { if (matchMedia('(pointer: fine)').matches) $('#res-q').focus(); }, 60); }
    if (t === 'historico') { history ||= historyPanel($('#hist-form'), $('#hist'), $('#hist-count')); history.load(); }
  },
});

const tick = () => { $('#today-label').textContent = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Africa/Luanda', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()) + ' · ' + new Intl.DateTimeFormat('pt-PT', { timeZone: 'Africa/Luanda', hour: '2-digit', minute: '2-digit' }).format(new Date()); };
tick(); setInterval(tick, 15_000);

// --------------------------------------------------------------- estado ---
const state = { pending: new Map(), inside: new Map(), fresh: new Set() };
async function loadLists() {
  const [pending, inside] = await Promise.all([get('/api/visits?view=pending'), get('/api/visits?view=inside')]);
  state.pending = new Map(pending.map((v) => [v.id, v])); state.inside = new Map(inside.map((v) => [v.id, v]));
  render(); loadStats();
}
async function loadStats() {
  const s = await get('/api/visits/stats');
  $('#summary').textContent = `${plural(s.pending, 'pendente', 'pendentes')} · ${s.inside} no condomínio · ${plural(s.arrivedToday, 'chegada', 'chegadas')} hoje`;
  $('#summary-in').textContent = s.inside ? `${plural(s.inside, 'visitante', 'visitantes')} dentro do condomínio` : 'Ninguém de visita neste momento';
}

// --------------------------------------------------------------- render ---
const unitText = (v) => `Bloco ${v.bloco} · Apt ${v.apartamento}`;
function pendingCard(v) {
  const waiting = v.status === 'aguardando';
  const sub = [PURPOSE[v.purpose], v.accompanied ? `${plural(v.companions_count, 'acompanhante', 'acompanhantes')}${v.companions_names ? ` (${v.companions_names})` : ''}` : 'sozinho'].join(' · ');
  const el = h(`<article class="group visit${state.fresh.has(v.id) ? ' is-new' : ''}" aria-label="Visita de ${esc(v.visitor_name)}">
    <div class="cell"><div class="main"><div class="ttl strong truncate">${esc(v.visitor_name)}</div><div class="sub">${esc(sub)}</div></div><div class="trail mono" aria-label="Código de acesso">${v.access_code}</div></div>
    <div class="cell"><div class="main"><div class="ttl truncate">${esc(v.resident_name)}</div><div class="sub">${unitText(v)} · <span class="status ${v.status}">${STATUS[v.status]}</span> · ${relTime(v.created_at)}</div></div>
      <a class="btn btn-gray" style="min-width:2.75rem;padding:0" href="tel:${esc((v.resident_phone || '').replace(/\s/g, ''))}" aria-label="Ligar a ${esc(v.resident_name)}">${icon.phone}</a></div>
    ${v.details ? `<div class="cell note"><div class="main sub">${esc(v.details)}</div></div>` : ''}
    <div class="cell action">${waiting
      ? `<div class="actions"><button class="btn btn-gray" disabled>A aguardar o morador</button><button class="btn btn-tinted red" style="flex:0 0 auto" data-cancel="${v.id}">Cancelar</button></div>`
      : `<button class="btn btn-lg btn-green btn-block" data-arrive="${v.id}">Chegada</button>`}</div>
  </article>`);
  if (state.fresh.has(v.id)) setTimeout(() => { el.classList.remove('is-new'); state.fresh.delete(v.id); }, 2500);
  return el;
}
function insideCard(v) {
  return h(`<article class="group visit">
    <div class="cell"><div class="main"><div class="ttl strong truncate">${esc(v.visitor_name)}</div><div class="sub">Entrou às <span class="num">${fmtTime(v.arrived_at)}</span> · ${relTime(v.arrived_at)}</div></div><div class="trail mono">${v.access_code}</div></div>
    <div class="cell"><div class="main"><div class="ttl truncate">${esc(v.resident_name)}</div><div class="sub">${unitText(v)}${v.accompanied ? ` · ${plural(v.companions_count, 'acompanhante', 'acompanhantes')}` : ''}${v.visit_date !== todayLocal() ? ` · desde ${fmtDay(v.visit_date)}` : ''}</div></div></div>
    <div class="cell action"><button class="btn btn-tinted btn-block" data-leave="${v.id}">Registar saída</button></div>
  </article>`);
}
function render() {
  const pend = [...state.pending.values()].sort((a, b) => (a.status === 'aguardando' ? -1 : 1) - (b.status === 'aguardando' ? -1 : 1) || a.id - b.id);
  const ins = [...state.inside.values()].sort((a, b) => b.arrived_at.localeCompare(a.arrived_at));
  reconcile($('#pending'), pend, { key: (v) => v.id, sig: (v) => v.status, render: pendingCard, empty: emptyState('check', 'Tudo em dia', 'As novas visitas aparecem aqui assim que o morador as envia.') });
  reconcile($('#inside'), ins, { key: (v) => v.id, sig: (v) => v.status, render: insideCard, empty: emptyState('building', 'Ninguém de visita', 'Quem entrar aparece aqui até registar a saída.') });
  shell.setBadge('pendentes', pend.length);
}

// -------------------------------------------------------------- moradores --
let resTimer;
async function searchResidents() {
  const q = $('#res-q').value.trim();
  const rows = await get(`/api/residents?q=${encodeURIComponent(q)}`);
  const box = $('#residents'); residents = new Map(rows.map((r) => [r.id, r]));
  box.innerHTML = rows.length ? rows.map((r) => `<button class="cell tap" data-resident="${r.id}"><div class="avatar">${esc(initials(r.name))}</div>
      <div class="main"><div class="ttl strong truncate">${esc(r.name)}</div><div class="sub">Bloco ${esc(r.bloco)} · Apt ${esc(r.apartamento)} · <span class="num">${esc(r.phone || '')}</span></div></div>
      <div class="trail foot">${r.inside_count ? `<span class="green">${r.inside_count} dentro</span>` : ''}${r.pending_count ? `<span class="orange">${r.inside_count ? ' · ' : ''}${r.pending_count} pendente${r.pending_count > 1 ? 's' : ''}</span>` : ''}</div><span class="chev">${icon.chevron}</span></button>`).join('')
    : emptyState('search', 'Nenhum morador encontrado', q ? `Sem resultados para “${q}”. Tente o nome, “A 101” ou o telefone.` : 'Ainda não há moradores.');
}
let residents = new Map();
$('#res-q').addEventListener('input', () => { clearTimeout(resTimer); resTimer = setTimeout(searchResidents, 120); });
addEventListener('keydown', (e) => { if (e.key === '/' && !e.target.closest('input,textarea,select')) { e.preventDefault(); shell.go('moradores'); } });

function residentSheet(r, origin) {
  const tel = (r.phone || '').replace(/\s/g, '');
  const c = h(`<div>
    <div class="group"><div class="cell"><div class="avatar">${esc(initials(r.name))}</div><div class="main"><div class="ttl strong">${esc(r.name)}</div><div class="sub">Bloco ${esc(r.bloco)} · Apartamento ${esc(r.apartamento)}</div></div></div>
      <div class="cell"><span class="main ttl">Telefone</span><span class="trail num">${esc(r.phone || '—')}</span></div>
      ${r.inside_count || r.pending_count ? `<div class="cell"><span class="main ttl">Visitas</span><span class="trail">${[r.inside_count && `${r.inside_count} no condomínio`, r.pending_count && `${r.pending_count} pendente${r.pending_count > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}</span></div>` : ''}</div>
    <div class="group" style="margin-top:1rem">
      ${tel ? `<a class="cell tap" href="tel:${esc(tel)}"><span class="main ttl tint">Ligar</span><span class="chev">${icon.chevron}</span></a>` : ''}
      <button class="cell tap" data-walkin><span class="main ttl tint">Registar visitante sem aviso</span><span class="chev">${icon.chevron}</span></button></div></div>`);
  const sh = openSheet({ title: 'Morador', content: c, origin });
  $('[data-walkin]', c).addEventListener('click', () => { sh.close(); setTimeout(() => walkinSheet({ id: r.id, name: r.name, unit: `Bloco ${r.bloco} · Apt ${r.apartamento}` }, origin), 260); });
}

// ----------------------------------------------------------------- ações ---
function upsert(v) {
  state.pending.delete(v.id); state.inside.delete(v.id);
  if (['pendente', 'aguardando'].includes(v.status) && v.visit_date === todayLocal()) state.pending.set(v.id, v);
  if (v.status === 'chegou') state.inside.set(v.id, v);
}
async function act(btn, url, okMsg) {
  busy(btn, true);
  try { const v = await post(url); upsert(v); render(); loadStats(); haptic(15); toast(okMsg(v)); return v; }
  catch (err) { busy(btn, false); toast(err.message, { error: true }); loadLists(); }
}
let codeSheet = null;
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-arrive]'); const l = e.target.closest('[data-leave]'); const c = e.target.closest('[data-cancel]'); const r = e.target.closest('[data-resident]');
  if (a) act(a, `/api/visits/${a.dataset.arrive}/arrive`, (v) => `Chegada registada · ${v.resident_name.split(' ')[0]} foi avisado(a)`).then(() => codeSheet?.close());
  if (l) act(l, `/api/visits/${l.dataset.leave}/leave`, (v) => `Saída de ${v.visitor_name} registada`).then(() => codeSheet?.close());
  if (c) act(c, `/api/visits/${c.dataset.cancel}/cancel`, () => 'Pedido cancelado');
  if (r) residentSheet(residents.get(Number(r.dataset.resident)), r);
});

// Verificação por código
function codeSheetOpen(origin) {
  const c = h(`<form novalidate autocomplete="off">
    <div class="group"><label class="cell"><span class="lbl" style="width:auto">Código</span><input class="inline-input mono" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" enterkeyhint="go" placeholder="6 dígitos" aria-label="Código de acesso" style="font-size:1.25rem"></label></div>
    <div style="margin-top:1rem"><button class="btn btn-lg btn-block" type="submit">Verificar</button></div>
    <div id="code-result" style="margin-top:1rem"></div></form>`);
  codeSheet = openSheet({ title: 'Código de acesso', content: c, origin, onClose: () => { codeSheet = null; } });
  c.code.focus();
  c.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = c.code.value.trim(); const out = $('#code-result', c); out.innerHTML = '';
    if (!/^\d{6}$/.test(code)) { toast('O código tem 6 dígitos.', { error: true }); return; }
    try { const v = await get(`/api/visits/code/${code}`); out.append(v.status === 'chegou' ? insideCard(v) : pendingCard(v)); haptic(10); }
    catch (err) { toast(err.message, { error: true }); haptic([20, 40, 20]); }
  });
}

// --------------------------------------------------- visitante sem aviso ---
function walkinSheet(preset, origin) {
  const content = h(`<form novalidate autocomplete="off">
    <div class="section-title">Morador a visitar</div>
    <div id="wk-picked" ${preset ? '' : 'hidden'}><div class="group"><button type="button" class="cell tap" id="wk-change"><div class="main"><div class="ttl strong" id="wk-name">${esc(preset?.name || '')}</div><div class="sub" id="wk-unit">${esc(preset?.unit || '')}</div></div><span class="trail tint">Alterar</span></button></div></div>
    <div id="wk-search" ${preset ? 'hidden' : ''}>
      <div class="searchfield" style="margin:0 0 .5rem"><span data-icon="search"></span><input id="wk-q" type="search" placeholder="Nome ou bloco e apartamento" aria-label="Pesquisar morador" autocomplete="off"></div>
      <div class="group" id="wk-results" style="max-height:13rem;overflow:auto"></div>
    </div>
    <div class="section-title">Visitante</div>
    <div class="group">
      <label class="cell"><span class="lbl" style="width:5.5rem">Nome</span><input class="inline-input" name="visitor_name" maxlength="120" placeholder="Nome e apelido" autocapitalize="words"></label>
      <label class="cell" for="wk-acc"><span class="main ttl">Vem acompanhado</span><span class="switch"><input type="checkbox" id="wk-acc" name="accompanied" role="switch"><span class="track"></span><span class="thumb"></span></span></label>
      <label class="cell" id="wk-cc" hidden><span class="main ttl">Acompanhantes</span><input class="inline-input" type="number" inputmode="numeric" min="1" max="30" value="1" name="companions_count" style="flex:none;width:4rem"></label>
      <label class="cell"><span class="main ttl">Motivo</span><span class="select-wrap"><select name="purpose">${Object.entries(PURPOSE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><span data-icon="updown"></span></span></label>
    </div>
    <div class="section-title">Detalhes</div>
    <div class="group"><textarea class="plain-textarea" name="details" maxlength="500" placeholder="Opcional" aria-label="Detalhes" style="min-height:4rem"></textarea></div>
    <div style="margin-top:1.25rem"><button class="btn btn-lg btn-block" type="submit">Pedir autorização ao morador</button></div>
  </form>`);
  hydrateIcons(content);
  let residentId = preset?.id || null;
  const sheet = openSheet({ title: 'Visitante sem aviso', content, origin });
  const q = $('#wk-q', content); const res = $('#wk-results', content);
  async function find() {
    const rows = await get(`/api/residents?q=${encodeURIComponent(q.value.trim())}`);
    res.innerHTML = rows.slice(0, 30).map((r) => `<button type="button" class="cell tap" data-pick="${r.id}" data-name="${esc(r.name)}" data-unit="Bloco ${esc(r.bloco)} · Apt ${esc(r.apartamento)}"><div class="main"><div class="ttl">${esc(r.name)}</div><div class="foot">Bloco ${esc(r.bloco)} · Apt ${esc(r.apartamento)}</div></div></button>`).join('') || '<div class="cell sub">Sem resultados</div>';
  }
  let t; q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(find, 120); });
  if (!preset) find();
  res.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    residentId = Number(b.dataset.pick); $('#wk-name', content).textContent = b.dataset.name; $('#wk-unit', content).textContent = b.dataset.unit;
    $('#wk-picked', content).hidden = false; $('#wk-search', content).hidden = true; content.visitor_name.focus();
  });
  $('#wk-change', content).addEventListener('click', () => { $('#wk-picked', content).hidden = true; $('#wk-search', content).hidden = false; q.focus(); find(); });
  content.accompanied.addEventListener('change', () => { $('#wk-cc', content).hidden = !content.accompanied.checked; });
  content.visitor_name.addEventListener('input', () => setFieldError(content.visitor_name, ''));
  content.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!residentId) { toast('Escolha o morador a visitar.', { error: true }); q.focus(); return; }
    if (content.visitor_name.value.trim().length < 2) { setFieldError(content.visitor_name, 'Escreva o nome do visitante.'); return; }
    const btn = e.submitter || $('button[type=submit]', content); busy(btn, true, 'A enviar…');
    try {
      const v = await post('/api/visits/walkin', { resident_id: residentId, visitor_name: content.visitor_name.value, accompanied: content.accompanied.checked,
        companions_count: content.companions_count.value, purpose: content.purpose.value, details: content.details.value });
      upsert(v); render(); loadStats(); sheet.close(); shell.go('pendentes'); haptic(12);
      toast(`Pedido enviado a ${v.resident_name.split(' ')[0]}`);
    } catch (err) { busy(btn, false); toast(err.message, { error: true }); }
  });
}

// ------------------------------------------------------------ tempo real ---
connectLive({
  'visit:new': (v) => {
    const isNew = !state.pending.has(v.id) && v.created_by !== me.id;
    upsert(v);
    if (isNew && v.origin === 'morador') {
      state.fresh.add(v.id);
      if (v.visit_date === todayLocal()) {
        banner({ title: `Nova visita: ${v.visitor_name}`, body: `${v.resident_name} · ${unitText(v)}${v.accompanied ? ` · +${v.companions_count}` : ''}`, onClick: () => shell.go('pendentes') });
        haptic(10);
        systemNotify(`Nova visita: ${v.visitor_name}`, `${v.resident_name} · ${unitText(v)}`, `new-${v.id}`);
      }
    }
    render(); loadStats();
  },
  'visit:update': (v) => {
    const was = state.pending.get(v.id);
    upsert(v); render(); loadStats();
    if (was?.status === 'aguardando' && v.status === 'pendente') { state.fresh.add(v.id); banner({ title: `${v.resident_name.split(' ')[0]} autorizou a entrada`, body: `${v.visitor_name} pode entrar — registe a chegada.` }); haptic([10, 50, 10]); }
    if (was?.status === 'aguardando' && v.status === 'recusada') { banner({ title: 'Entrada recusada', body: `${v.resident_name} recusou a visita de ${v.visitor_name}.` }); haptic([20, 40, 20]); }
    if (was && v.status === 'cancelada' && v.origin === 'morador') banner({ title: 'Visita cancelada', body: `${v.resident_name} cancelou a visita de ${v.visitor_name}.` });
  },
  resync: loadLists,
}, $('#live'));

ready = true;
await loadLists();
if (shell.tab === 'moradores') searchResidents();
if (shell.tab === 'historico') { history ||= historyPanel($('#hist-form'), $('#hist'), $('#hist-count')); history.load(); }
setInterval(() => { $$('#pending .visit, #inside .visit').forEach((el) => { el.dataset.sig = ''; }); render(); }, 60_000);
if (notificationsSupported() && Notification.permission === 'default') $('#enable-notif').hidden = false;
$('#btn-enable-notif').addEventListener('click', async () => { const { enableNotifications } = await import('./api.js'); if (await enableNotifications()) $('#enable-notif').hidden = true; });
