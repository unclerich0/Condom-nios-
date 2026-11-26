import { $, $$, h, esc, icon, toast, banner, segmented, reconcile, hydrateIcons, setFieldError, busy, haptic,
  fmtTime, fmtDay, fmtDateTime, relTime, todayLocal, emptyState, plural, STATUS, PURPOSE } from './ui.js';
import { get, post, requireSession, connectLive, registerSW, enableNotifications, notificationsSupported, systemNotify } from './api.js';
import { mountShell } from './shell.js';

registerSW();
const me = await requireSession('morador');
if (!me) await new Promise(() => {}); // a redirecionar para o início de sessão

let ready = false;
const shell = mountShell({
  me, defaultTab: 'visitas', unitLine: `Bloco ${me.bloco} · Apt ${me.apartamento}`,
  tabs: [{ id: 'visitas', label: 'Visitas', icon: 'people' }, { id: 'nova', label: 'Nova visita', icon: 'compose' }, { id: 'avisos', label: 'Avisos', icon: 'bell' }],
  actions: [{ id: 'new', label: 'Nova visita', icon: 'plus', tabs: ['visitas'], onClick: () => shell.go('nova') }],
  onChange: (t) => { if (ready && t === 'avisos') openNotifs(); },
});
$('#who-unit').textContent = `Bloco ${me.bloco} · Apartamento ${me.apartamento}`;
$('#who-name').textContent = me.name;

// ---------------------------------------------------------------- estado ---
const state = { visits: new Map(), filter: 'upcoming', notifs: [], unread: 0, unreadAtOpen: new Set() };
const ACTIVE = ['pendente', 'aguardando', 'chegou'];
ready = true;

async function loadVisits() { const rows = await get('/api/visits?limit=300'); state.visits = new Map(rows.map((v) => [v.id, v])); render(); }
async function loadNotifs() { const { items, unread } = await get('/api/notifications'); state.notifs = items; state.unread = unread; renderBadge(); if (shell.tab === 'avisos') openNotifs(); }

// --------------------------------------------------------------- render ----
function visitCard(v) {
  const sub = [fmtDay(v.visit_date), PURPOSE[v.purpose],
    v.accompanied ? `${plural(v.companions_count, 'acompanhante', 'acompanhantes')}${v.companions_names ? ` (${v.companions_names})` : ''}` : null,
    v.origin === 'portaria' ? 'registada na portaria' : null].filter(Boolean).join(' · ');
  const when = v.left_at ? `Saiu às ${fmtTime(v.left_at)}` : v.arrived_at ? `Chegou às ${fmtTime(v.arrived_at)}` : '';
  const showCode = ['pendente', 'chegou'].includes(v.status);
  return h(`<article class="group visit" aria-label="Visita de ${esc(v.visitor_name)}">
    <div class="cell"><div class="main"><div class="ttl strong truncate">${esc(v.visitor_name)}</div><div class="sub">${esc(sub)}</div></div>${showCode ? `<div class="trail mono" aria-label="Código de acesso">${v.access_code}</div>` : ''}</div>
    <div class="cell"><div class="main status ${v.status}">${STATUS[v.status]}</div>${when ? `<div class="trail sub num">${when}</div>` : ''}</div>
    ${v.details ? `<div class="cell note"><div class="main sub">${esc(v.details)}</div></div>` : ''}
    ${['pendente', 'aguardando'].includes(v.status) && v.origin === 'morador' ? `<div class="cell action"><button class="btn btn-tinted red btn-block btn-sm" data-cancel="${v.id}">Cancelar visita</button></div>` : ''}
  </article>`);
}
function approvalCard(v) {
  return h(`<article class="group visit">
    <div class="cell"><div class="main"><div class="foot" style="text-transform:uppercase">Está na portaria</div><div class="ttl strong">${esc(v.visitor_name)}</div>
      <div class="sub">${[PURPOSE[v.purpose], v.accompanied ? plural(v.companions_count, 'acompanhante', 'acompanhantes') : null, relTime(v.created_at)].filter(Boolean).join(' · ')}</div></div></div>
    ${v.details ? `<div class="cell note"><div class="main sub">${esc(v.details)}</div></div>` : ''}
    <div class="cell action"><div class="actions"><button class="btn btn-tinted red" data-deny="${v.id}">Recusar</button><button class="btn btn-green" data-approve="${v.id}">Autorizar entrada</button></div></div>
  </article>`);
}

function render() {
  const all = [...state.visits.values()];
  reconcile($('#approvals'), all.filter((v) => v.status === 'aguardando'), { key: (v) => v.id, sig: (v) => v.status, render: approvalCard });
  const today = todayLocal();
  const list = state.filter === 'upcoming'
    ? all.filter((v) => ACTIVE.includes(v.status) && v.status !== 'aguardando' && (v.visit_date >= today || v.status === 'chegou'))
        .sort((a, b) => (a.status === 'chegou' ? -1 : 0) - (b.status === 'chegou' ? -1 : 0) || a.visit_date.localeCompare(b.visit_date) || b.id - a.id)
    : all.filter((v) => !ACTIVE.includes(v.status) || (v.visit_date < today && v.status !== 'chegou')).sort((a, b) => b.visit_date.localeCompare(a.visit_date) || b.id - a.id);
  reconcile($('#visits'), list, {
    key: (v) => v.id, sig: (v) => `${v.status}|${v.arrived_at}|${v.left_at}`, render: visitCard,
    empty: state.filter === 'upcoming' ? emptyState('calendar', 'Sem visitas ativas', 'Toque em + para avisar a portaria.') : emptyState('tray', 'Sem histórico', 'As visitas concluídas ou canceladas aparecem aqui.'),
  });
}
function renderBadge() { shell.setBadge('avisos', state.unread); }

const filterSeg = segmented($('#filter'), (v) => { state.filter = v; render(); });

// ----------------------------------------------------------- formulário ----
const form = $('#visit-form');
hydrateIcons(form);
let when = 'hoje', companions = 1;
form.accompanied.addEventListener('change', () => {
  const box = $('#companions'); box.hidden = !form.accompanied.checked;
  if (!box.hidden) box.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
});
$$('.stepper button', form).forEach((b) => b.addEventListener('click', () => { companions = Math.max(1, Math.min(30, companions + Number(b.dataset.step))); $('#cc-out').textContent = companions; }));
const dateInput = $('#visit-date'); dateInput.min = todayLocal();
segmented($('#when'), (v) => { when = v; $('#date-cell').hidden = v !== 'outra'; if (v === 'outra') dateInput.value ||= todayLocal(); });
form.visitor_name.addEventListener('input', () => setFieldError(form.visitor_name, ''));
form.visitor_name.addEventListener('blur', () => { if (form.visitor_name.value && form.visitor_name.value.trim().length < 2) setFieldError(form.visitor_name, 'Escreva o nome completo do visitante.'); });

function visitDate() {
  if (when === 'hoje') return todayLocal();
  if (when === 'amanha') return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Luanda' }).format(new Date(Date.now() + 86400000));
  return dateInput.value || todayLocal();
}
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = form.visitor_name.value.trim();
  if (name.length < 2) { setFieldError(form.visitor_name, 'Escreva o nome do visitante.'); form.visitor_name.focus(); haptic([15, 30, 15]); return; }
  const btn = $('#btn-send'); busy(btn, true, 'A enviar…');
  try {
    const v = await post('/api/visits', {
      visitor_name: name, accompanied: form.accompanied.checked, companions_count: companions,
      companions_names: form.companions_names.value, purpose: form.purpose.value, details: form.details.value, visit_date: visitDate(),
    });
    state.visits.set(v.id, v);
    state.filter = 'upcoming'; filterSeg.select('upcoming');
    form.reset(); companions = 1; $('#cc-out').textContent = '1'; $('#companions').hidden = true;
    render(); haptic(12);
    shell.go('visitas');
    toast(`Enviado à portaria · código ${v.access_code}`);
    maybeOfferNotifications();
  } catch (err) { toast(err.message, { error: true }); }
  finally { busy(btn, false); }
});

// ----------------------------------------------------------- ações --------
document.addEventListener('click', async (e) => {
  const cancel = e.target.closest('[data-cancel]'); const approve = e.target.closest('[data-approve]'); const deny = e.target.closest('[data-deny]');
  try {
    if (cancel) {
      busy(cancel, true);
      const v = await post(`/api/visits/${cancel.dataset.cancel}/cancel`); state.visits.set(v.id, v); render();
      toast('Visita cancelada · a portaria foi informada');
    } else if (approve || deny) {
      const btn = approve || deny; busy(btn, true);
      const v = await post(`/api/visits/${btn.dataset.approve || btn.dataset.deny}/decision`, { approve: !!approve });
      state.visits.set(v.id, v); render(); haptic(12);
      toast(approve ? 'Entrada autorizada' : 'Entrada recusada');
    }
  } catch (err) { toast(err.message, { error: true }); loadVisits(); }
});

// ---------------------------------------------------------- avisos --------
function openNotifs() {
  const box = $('#notifs');
  if (state.unread) state.unreadAtOpen = new Set(state.notifs.filter((n) => !n.read_at).map((n) => n.id));
  box.innerHTML = state.notifs.length
    ? `<div class="group">${state.notifs.map((n) => `<div class="cell note" data-nid="${n.id}"><span style="width:.55rem;height:.55rem;border-radius:50%;flex:none;margin-top:.5rem;background:${state.unreadAtOpen.has(n.id) ? 'var(--tint)' : 'transparent'}"></span>
        <div class="main"><div class="ttl strong">${esc(n.title)}</div>${n.body ? `<div class="sub" style="color:var(--label-2);opacity:1">${esc(n.body)}</div>` : ''}<div class="foot num">${fmtDateTime(n.created_at)}</div></div></div>`).join('')}</div>`
    : emptyState('bell', 'Sem avisos', 'A chegada e a saída das visitas aparecem aqui.');
  if (state.unread) { post('/api/notifications/read-all'); state.unread = 0; state.notifs.forEach((n) => { n.read_at ||= new Date().toISOString(); }); renderBadge(); }
}

function maybeOfferNotifications() { if (notificationsSupported() && Notification.permission === 'default') $('#enable-notif').hidden = false; }
$('#btn-enable-notif').addEventListener('click', async () => { if (await enableNotifications()) $('#enable-notif').hidden = true; });
maybeOfferNotifications();

// --------------------------------------------------------- tempo real -----
connectLive({
  'visit:new': (v) => { state.visits.set(v.id, v); render(); },
  'visit:update': (v) => { state.visits.set(v.id, v); render(); },
  notification: (n) => {
    state.notifs.unshift(n);
    if (shell.tab === 'avisos') { state.unreadAtOpen.add(n.id); openNotifs(); post('/api/notifications/read-all'); } else { state.unread++; renderBadge(); }
    banner({ title: n.title, body: n.body, onClick: () => shell.go('avisos') });
    haptic(n.type === 'arrival' ? [12, 60, 12] : 12);
    systemNotify(n.title, n.body, `visit-${n.visit_id || n.id}`);
  },
  resync: () => { loadVisits(); loadNotifs(); },
}, $('#live'));

await Promise.all([loadVisits(), loadNotifs()]);
setInterval(render, 60_000);
