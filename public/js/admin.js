import { $, $$, h, esc, icon, toast, openSheet, segmented, hydrateIcons, busy, fmtDateTime, initials, emptyState, setFieldError, haptic, ROLE } from './ui.js';
import { get, post, patch, requireSession, registerSW } from './api.js';
import { historyPanel } from './history.js';
import { mountShell } from './shell.js';

registerSW();
const me = await requireSession('admin');
if (!me) await new Promise(() => {});

let ready = false; let hist;
const shell = mountShell({
  me, defaultTab: 'contas', unitLine: 'Administração',
  tabs: [{ id: 'contas', label: 'Contas', icon: 'account' }, { id: 'visitas', label: 'Visitas', icon: 'list' }, { id: 'auditoria', label: 'Auditoria', icon: 'shield' }],
  actions: [{ id: 'new', label: 'Nova conta', icon: 'plus', tabs: ['contas'], onClick: (b) => userSheet(null, b) }],
  onChange: (t) => { if (!ready) return; if (t === 'visitas') { hist ||= historyPanel($('#hist-form'), $('#hist'), $('#hist-count')); hist.load(); } if (t === 'auditoria') loadAudit(); },
});

$('#live')?.remove();
const ACTIONS = { 'auth.login': 'Iniciou sessão', 'auth.password': 'Alterou a palavra-passe', 'visit.create': 'Registou visita', 'visit.walkin': 'Registou visitante sem aviso',
  'visit.approve': 'Autorizou entrada', 'visit.deny': 'Recusou entrada', 'visit.arrive': 'Registou chegada', 'visit.leave': 'Registou saída', 'visit.cancel': 'Cancelou visita',
  'user.create': 'Criou conta', 'user.update': 'Atualizou conta' };

let role = ''; let users = [];
async function loadUsers() {
  const q = $('#u-q').value.trim();
  users = await get(`/api/admin/users?role=${role}&q=${encodeURIComponent(q)}`);
  $('#users').innerHTML = users.length ? users.map((u) => `<button class="cell tap" data-edit="${u.id}" style="${u.active ? '' : 'opacity:.5'}">
      <div class="avatar">${esc(initials(u.name))}</div>
      <div class="main"><div class="ttl strong truncate">${esc(u.name)}</div>
        <div class="sub truncate">${u.bloco ? `Bloco ${esc(u.bloco)} · Apt ${esc(u.apartamento)} · ` : ''}@${esc(u.username)}${u.active ? '' : ' · desativada'}</div></div>
      <span class="trail foot">${u.role === 'morador' ? '' : ROLE[u.role]}</span><span class="chev">${icon.chevron}</span></button>`).join('')
    : emptyState('people', 'Sem contas', 'Nenhuma conta corresponde à pesquisa.');
}
let t; $('#u-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(loadUsers, 120); });
segmented($('#u-role'), (v) => { role = v; loadUsers(); });

function userSheet(u, origin) {
  const creating = !u; u ||= { role: 'morador', active: true };
  const form = h(`<form novalidate autocomplete="off">
    <div class="group"><div class="cell"><div class="segmented wide" id="f-role"><button data-value="morador">Morador</button><button data-value="seguranca">Segurança</button><button data-value="admin">Admin</button></div></div></div>
    <div class="section-title">Pessoa</div>
    <div class="group">
      <label class="cell"><span class="lbl" style="width:5.5rem">Nome</span><input class="inline-input" name="name" value="${esc(u.name || '')}" placeholder="Nome completo"></label>
      <label class="cell"><span class="lbl" style="width:5.5rem">Telefone</span><input class="inline-input" name="phone" type="tel" value="${esc(u.phone || '')}" placeholder="+244 9XX XXX XXX"></label>
      <label class="cell"><span class="lbl" style="width:5.5rem">Email</span><input class="inline-input" name="email" type="email" value="${esc(u.email || '')}" placeholder="Opcional" autocapitalize="none"></label>
    </div>
    <div id="f-unit"><div class="section-title">Fração</div><div class="group">
      <label class="cell"><span class="lbl" style="width:5.5rem">Bloco</span><input class="inline-input" name="bloco" value="${esc(u.bloco || '')}" maxlength="10" autocapitalize="characters"></label>
      <label class="cell"><span class="lbl" style="width:5.5rem">Apartamento</span><input class="inline-input" name="apartamento" value="${esc(u.apartamento || '')}" maxlength="10" inputmode="numeric"></label></div></div>
    <div class="section-title">Acesso</div>
    <div class="group">
      <label class="cell"><span class="lbl" style="width:5.5rem">Utilizador</span><input class="inline-input" name="username" value="${esc(u.username || '')}" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="nome.apelido"></label>
      <label class="cell"><span class="lbl" style="width:5.5rem">${creating ? 'Palavra-passe' : 'Nova palavra-passe'}</span><input class="inline-input" name="password" type="text" autocomplete="new-password" placeholder="${creating ? 'mín. 6 caracteres' : 'Manter'}"></label>
      ${creating ? '' : `<label class="cell" for="f-active"><span class="main ttl">Conta ativa</span><span class="switch"><input type="checkbox" id="f-active" name="active" role="switch" ${u.active ? 'checked' : ''}><span class="track"></span><span class="thumb"></span></span></label>`}
    </div>
    <div style="margin-top:1.25rem"><button class="btn btn-lg btn-block" type="submit">${creating ? 'Criar conta' : 'Guardar'}</button></div>
  </form>`);
  let r = u.role;
  $$('#f-role button', form).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.value === r)));
  const unit = $('#f-unit', form); unit.hidden = r !== 'morador';
  const sheet = openSheet({ title: creating ? 'Nova conta' : 'Editar conta', content: form, origin });
  segmented($('#f-role', form), (v) => { r = v; unit.hidden = v !== 'morador'; });
  $$('input', form).forEach((i) => i.addEventListener('input', () => setFieldError(i, '')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.name.value.trim()) { setFieldError(form.name, 'Indique o nome.'); return; }
    if (!/^[a-z0-9._-]{3,}$/.test(form.username.value.trim().toLowerCase())) { setFieldError(form.username, 'Use 3 ou mais letras minúsculas, números, ponto ou hífen.'); return; }
    if (creating && form.password.value.length < 6) { setFieldError(form.password, 'Mínimo de 6 caracteres.'); return; }
    const body = { role: r, name: form.name.value, username: form.username.value, bloco: form.bloco.value, apartamento: form.apartamento.value, phone: form.phone.value, email: form.email.value };
    if (form.password.value) body.password = form.password.value;
    if (!creating) body.active = form.active.checked;
    const btn = $('button[type=submit]', form); busy(btn, true, 'A guardar…');
    try {
      if (creating) await post('/api/admin/users', body); else await patch(`/api/admin/users/${u.id}`, body);
      sheet.close(); haptic(10); toast(creating ? 'Conta criada' : 'Alterações guardadas'); loadUsers();
    } catch (err) { busy(btn, false); toast(err.message, { error: true }); }
  });
}
document.addEventListener('click', (e) => { const b = e.target.closest('[data-edit]'); if (b) userSheet(users.find((x) => x.id === Number(b.dataset.edit)), b); });

async function loadAudit() {
  const rows = await get('/api/admin/audit');
  $('#audit').innerHTML = rows.map((a) => {
    let det = ''; try { const d = JSON.parse(a.details || 'null'); if (d) det = Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · '); } catch { /* */ }
    return `<div class="cell"><div class="main"><div class="ttl">${esc(ACTIONS[a.action] || a.action)}${a.entity_id ? ` <span class="foot">#${a.entity_id}</span>` : ''}</div><div class="sub">${esc(a.user_name || '—')}${a.user_role ? ` · ${ROLE[a.user_role]}` : ''}${det ? ` · ${esc(det)}` : ''}</div></div><div class="trail foot num">${fmtDateTime(a.created_at)}</div></div>`;
  }).join('') || emptyState('list', 'Sem registos', 'As ações aparecem aqui.');
}
ready = true;
loadUsers();
if (shell.tab === 'visitas') { hist ||= historyPanel($('#hist-form'), $('#hist'), $('#hist-count')); hist.load(); }
if (shell.tab === 'auditoria') loadAudit();
