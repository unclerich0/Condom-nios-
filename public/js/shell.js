// shell.js — estrutura nativa: barra de navegação com título grande que colapsa,
// separadores de vidro flutuantes (iPhone) / barra lateral opaca com cabeçalho de vidro (iPad),
// folha da conta. As páginas só declaram separadores e ecrãs.
import { $, $$, h, esc, icon, Spring, hydrateIcons, installPressFeedback, installGlass, openSheet, toast, busy, setFieldError, haptic, initials, ROLE, makeSlider, expandSearch, reducedMotion } from './ui.js';
import { post, logout, enableNotifications, notificationsSupported, notificationsGranted } from './api.js';

export function mountShell({ me, tabs, actions = [], defaultTab, unitLine = '', onChange }) {
  installPressFeedback();
  installGlass();
  hydrateIcons();
  const navbar = $('#navbar');
  navbar.classList.add('lens-bar');
  navbar.dataset.adapt = '';
  navbar.innerHTML = `<div class="navbar-inner">
      <div class="nb-lead"><span class="live" id="live"><i></i><span>A ligar…</span></span></div>
      <div class="nb-title" id="nb-title" aria-hidden="true"></div>
      <div class="nb-trail" id="nb-trail"></div></div>`;
  const trail = $('#nb-trail');
  for (const a of actions) {
    const b = h(`<button class="gbtn round glass lens-btn" data-action="${a.id}" aria-label="${esc(a.label)}">${icon[a.icon]}${a.badge ? '<span class="tbadge" hidden>0</span>' : ''}</button>`);
    b.addEventListener('click', (e) => a.onClick(e.currentTarget)); trail.append(b); a.el = b;
  }
  const acc = h(`<button class="gbtn round glass lens-btn" id="btn-account" aria-label="Conta">${icon.account}</button>`);
  acc.addEventListener('click', (e) => accountSheet(me, e.currentTarget)); trail.append(acc);

  // ---- separadores (telemóvel) e barra lateral (iPad)
  const main = tabs.filter((t) => !t.solo), solo = tabs.find((t) => t.solo);
  const tabHtml = (t, extra = '') => `<button class="tab${extra}" data-tab="${t.id}" aria-selected="false" aria-label="${esc(t.label)}">${icon[t.icon]}<span class="t">${esc(t.label)}</span><span class="tbadge" hidden>0</span></button>`;
  const tabbar = h(`<nav class="tabbar" aria-label="Secções"><div class="tab-pill glass lens-bar" data-adapt>${main.map((t) => tabHtml(t)).join('')}<span class="tab-ind"></span></div>
    ${solo ? `<button class="tab-solo glass lens-btn" data-tab="${solo.id}" aria-selected="false" aria-label="${esc(solo.label)}" data-adapt>${icon[solo.icon]}</button>` : ''}</nav>`);
  const sidebar = h(`<aside class="sidebar"><div class="sb-brand glass lens-bar"><img src="/icons/icon-192.png" alt=""><div><strong>Portaria</strong><small>${esc(unitLine || ROLE[me.role])}</small></div></div>
    <nav class="sb-tabs" aria-label="Secções">${tabs.map((t) => tabHtml(t, ' glass lens-btn')).join('')}<span class="sb-ind"></span></nav></aside>`);
  document.body.append(tabbar, sidebar);

  // indicadores deslizantes: mola na posição e esticão na direção do movimento
  const pillInd = makeSlider($('.tab-ind', tabbar), 'x'), sideInd = makeSlider($('.sb-ind', sidebar), 'y');
  const allTabs = () => $$('[data-tab]', document);
  const place = (animate) => {
    const id = state.tab;
    const p = $(`.tab-pill [data-tab="${id}"]`, tabbar); pillInd.el.hidden = !p;
    if (p && p.offsetWidth) pillInd.to(p.offsetLeft, p.offsetWidth, animate);
    const s = $(`.sb-tabs [data-tab="${id}"]`, sidebar); if (s && s.offsetHeight) sideInd.to(s.offsetTop, s.offsetHeight, animate);
  };

  const state = { tab: null };
  let io, titleCollapsed = false;
  const nbTitle = () => $('#nb-title');
  const titleSpring = new Spring({
    value: 0, damping: 1, response: 0.32, precision: 0.01,
    onUpdate: (p) => {
      const t = nbTitle(); if (!t) return;
      t.style.opacity = String(Math.max(0, Math.min(1, p)));
      t.style.transform = p >= 0.999 ? 'none' : `translateY(${(1 - p) * 6}px)`;
    },
  });
  function springScreen(screen) {
    if (reducedMotion()) { screen.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 }); return; }
    screen._spring?.stop();
    const s = new Spring({
      value: 0, damping: 1, response: 0.36, precision: 0.002,
      onUpdate: (p) => {
        if (screen._spring !== s) return;
        screen.style.opacity = String(Math.min(1, Math.max(0, p)));
        screen.style.transform = p >= 0.999 ? '' : `translateY(${(1 - p) * 12}px)`;
      },
      onRest: () => {
        if (screen._spring !== s) return;
        screen.style.opacity = ''; screen.style.transform = '';
      },
    });
    screen._spring = s;
    s.to(1);
  }
  function observeTitle(screen) {
    io?.disconnect(); navbar.classList.remove('is-collapsed'); titleCollapsed = false; titleSpring.set(0);
    const lt = $('.large-title', screen); if (!lt) return;
    io = new IntersectionObserver(([e]) => {
      const next = !e.isIntersecting && e.boundingClientRect.top < 40;
      navbar.classList.toggle('is-collapsed', next);
      if (next !== titleCollapsed) { titleCollapsed = next; titleSpring.to(next ? 1 : 0); }
    }, { rootMargin: '-52px 0px 0px 0px', threshold: 0 });
    io.observe(lt);
  }
  function go(id, { animate = true, push = true } = {}) {
    if (!tabs.some((t) => t.id === id)) id = defaultTab;
    const changed = state.tab !== id; state.tab = id;
    $$('[data-screen]').forEach((s) => { s.hidden = s.dataset.screen !== id; });
    allTabs().forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    const screen = $(`[data-screen="${id}"]`);
    $('#nb-title').textContent = screen.dataset.title || tabs.find((t) => t.id === id).label;
    actions.forEach((a) => { a.el.hidden = !!a.tabs && !a.tabs.includes(id); });
    document.title = `${screen.dataset.title} — Portaria`;
    if (changed) {
      window.scrollTo(0, 0);
      if (animate) { springScreen(screen); $$('.searchfield', screen).forEach((f) => expandSearch(f)); }
      if (push) history.replaceState(null, '', `#${id}`);
    }
    place(animate && changed); observeTitle(screen);
    onChange?.(id);
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { haptic(6); go(b.dataset.tab); } });
  new ResizeObserver(() => place(false)).observe(document.body);
  const initial = location.hash.slice(1);
  go(tabs.some((t) => t.id === initial) ? initial : defaultTab, { animate: false, push: false });
  requestAnimationFrame(() => place(false));

  return {
    go, get tab() { return state.tab; },
    setBadge(id, n) { $$(`[data-tab="${id}"] .tbadge`).forEach((b) => { b.hidden = !n; b.textContent = n > 9 ? '9+' : n; }); },
    setActionBadge(id, n) { const b = $(`[data-action="${id}"] .tbadge`); if (b) { b.hidden = !n; b.textContent = n; } },
  };
}

// ------------------------------------------------------------ Conta --------
export function accountSheet(me, origin) {
  const unit = me.bloco ? `Bloco ${me.bloco} · Apartamento ${me.apartamento}` : ROLE[me.role];
  const other = me.role === 'admin' ? [['/seguranca', 'Abrir painel da portaria'], ['/admin', 'Administração']] : [];
  const content = h(`<div>
    <div class="group"><div class="cell"><div class="avatar">${esc(initials(me.name))}</div><div class="main"><div class="ttl strong">${esc(me.name)}</div><div class="sub">${esc(unit)}${me.phone ? ` · ${esc(me.phone)}` : ''}</div></div></div></div>
    <div class="section-title">Preferências</div>
    <div class="group">
      <button class="cell tap" id="ac-notif"><span class="main ttl">Notificações do dispositivo</span><span class="trail" id="ac-notif-state"></span></button>
      <button class="cell tap" id="ac-pass"><span class="main ttl">Alterar palavra-passe</span><span class="chev">${icon.chevron}</span></button>
      ${other.map(([href, label]) => `<a class="cell tap" href="${href}"><span class="main ttl">${label}</span><span class="chev">${icon.chevron}</span></a>`).join('')}
    </div>
    <div class="group" style="margin-top:1.25rem"><button class="cell tap" id="ac-out"><span class="main ttl red" style="text-align:center">Terminar sessão</span></button></div>
  </div>`);
  const sheet = openSheet({ title: 'Conta', content, origin });
  const st = $('#ac-notif-state', content);
  const refresh = () => { st.textContent = !notificationsSupported() ? 'Indisponível' : notificationsGranted() ? 'Ativadas' : Notification.permission === 'denied' ? 'Bloqueadas' : 'Ativar'; if (st.textContent === 'Ativar') st.className = 'trail tint'; };
  refresh();
  $('#ac-notif', content).addEventListener('click', async () => { if (notificationsSupported() && !notificationsGranted()) { await enableNotifications(); refresh(); } });
  $('#ac-out', content).addEventListener('click', logout);
  $('#ac-pass', content).addEventListener('click', () => { sheet.close(); setTimeout(() => passwordSheet(origin), 280); });
}

function passwordSheet(origin) {
  const f = h(`<form novalidate autocomplete="off">
    <div class="group">
      <label class="cell"><span class="lbl">Atual</span><input class="inline-input" name="current" type="password" autocomplete="current-password"></label>
      <label class="cell"><span class="lbl">Nova</span><input class="inline-input" name="next" type="password" autocomplete="new-password" placeholder="mín. 6 caracteres"></label>
    </div>
    <div style="margin-top:1.25rem"><button class="btn btn-lg btn-block" type="submit">Guardar</button></div>
  </form>`);
  const sheet = openSheet({ title: 'Palavra-passe', content: f, origin });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (f.next.value.length < 6) { setFieldError(f.next, 'A nova palavra-passe deve ter pelo menos 6 caracteres.'); return; }
    const btn = $('button[type=submit]', f); busy(btn, true);
    try { await post('/api/auth/password', { current: f.current.value, next: f.next.value }); sheet.close(); toast('Palavra-passe alterada'); }
    catch (err) { busy(btn, false); toast(err.message, { error: true }); }
  });
}
