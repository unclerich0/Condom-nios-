// ============================================================================
// ui.js — primitivas de interface inspiradas na skill "apple-design":
//  • Spring com os parâmetros da Apple (damping ratio + response), interrompível
//    e que preserva a velocidade quando o alvo muda (sem "parede de tijolo").
//  • Sheet arrastável 1:1 com offset de agarre, rubber-band, projeção de momento
//    (decelerationRate 0.998) e passagem de velocidade para a mola.
//  • Banner de notificação que entra e sai pelo mesmo caminho (topo).
//  • Feedback no pointer-down, haptics só em momentos de commit.
//  • Liquid Glass: lente SVG (Chromium), tinta adaptativa e realce especular
//    que segue o dedo — installGlass().
// ============================================================================

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const TZ = 'Africa/Luanda';

// ---------------------------------------------------------------- Spring ---
export class Spring {
  constructor({ value = 0, damping = 1, response = 0.35, precision = 0.5, onUpdate = () => {}, onRest = () => {} } = {}) {
    Object.assign(this, { value, velocity: 0, target: value, damping, response, precision, onUpdate, onRest });
    this._raf = 0; this._last = 0;
  }
  /** Anima até `target`. Parte do valor atual (apresentação), mantém a velocidade. */
  to(target, { velocity, damping, response } = {}) {
    this.target = target;
    if (velocity !== undefined) this.velocity = velocity;
    if (damping !== undefined) this.damping = damping;
    if (response !== undefined) this.response = response;
    if (reducedMotion()) { this.set(target); this.onRest(this.value); return this; }
    if (!this._raf) { this._last = performance.now(); this._raf = requestAnimationFrame((t) => this._tick(t)); }
    return this;
  }
  set(value) { this.stop(); this.value = this.target = value; this.velocity = 0; this.onUpdate(value); return this; }
  stop() { cancelAnimationFrame(this._raf); this._raf = 0; }
  _tick(now) {
    let dt = Math.min((now - this._last) / 1000, 1 / 30); this._last = now;
    const k = (2 * Math.PI / this.response) ** 2;          // rigidez a partir do "response"
    const c = (4 * Math.PI * this.damping) / this.response; // amortecimento a partir do "damping ratio"
    const steps = 4; const h = dt / steps;
    for (let i = 0; i < steps; i++) {                       // Euler semi-implícito com sub-passos
      const a = -k * (this.value - this.target) - c * this.velocity;
      this.velocity += a * h; this.value += this.velocity * h;
    }
    this.onUpdate(this.value);
    if (Math.abs(this.velocity) < this.precision * 4 && Math.abs(this.value - this.target) < this.precision) {
      this.value = this.target; this.velocity = 0; this.onUpdate(this.value); this._raf = 0; this.onRest(this.value); return;
    }
    this._raf = requestAnimationFrame((t) => this._tick(t));
  }
}

/** Projeção de momento exatamente como no sample code da Apple. */
export function project(velocityPxPerSec, decelerationRate = 0.998) {
  return (velocityPxPerSec / 1000) * decelerationRate / (1 - decelerationRate);
}
/** Resistência progressiva para lá do limite. */
export function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
/** Histórico curto de posições para calcular a velocidade no fim do gesto. */
function velocityTracker() {
  let pts = [];
  return {
    add(y) { const t = performance.now(); pts.push({ y, t }); pts = pts.filter((p) => t - p.t < 100); },
    velocity() { if (pts.length < 2) return 0; const a = pts[0], b = pts[pts.length - 1]; const dt = (b.t - a.t) / 1000; return dt > 0 ? (b.y - a.y) / dt : 0; },
    reset() { pts = []; },
  };
}

export const haptic = (pattern = 10) => { try { navigator.vibrate?.(pattern); } catch { /* sem suporte */ } };


// ------------------------------------------------- Feedback no pointer-down -
export function installPressFeedback() {
  const SEL = '.btn, .gbtn, .tab, .tab-solo, .chip';
  let pressed = null;
  const release = () => { pressed?.classList.remove('is-pressed'); pressed = null; };
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(SEL); if (!el || el.disabled) return;
    pressed = el; el.classList.add('is-pressed');
  }, { passive: true });
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  document.addEventListener('pointermove', (e) => {           // cancelar arrastando para fora (histerese ~10px)
    if (!pressed) return; const r = pressed.getBoundingClientRect(); const pad = 10;
    const inside = e.clientX > r.left - pad && e.clientX < r.right + pad && e.clientY > r.top - pad && e.clientY < r.bottom + pad;
    pressed.classList.toggle('is-pressed', inside);
  }, { passive: true });
}

// =========================================================== Liquid Glass ===
/**
 * 1) Lente: filtros SVG com feDisplacementMap aplicados ao backdrop (só Chromium;
 *    Safari/Firefox ignoram url() em backdrop-filter, por isso detetamos a capacidade
 *    e deixamos o blur+saturação+aro como alternativa — já é um bom vidro).
 *    A direção do deslocamento aponta sempre para o interior (nunca amostra fora da caixa).
 * 2) Tinta adaptativa: mede a cor do conteúdo por baixo de cada [data-adapt] ao scroll.
 * 3) Realce especular que segue o dedo/rato (--px/--py/--spec).
 */
function lensMap(axis, band) {
  const hi = axis === 'x' ? 'rgb(255,128,128)' : 'rgb(128,255,128)';
  const lo = axis === 'x' ? 'rgb(0,128,128)' : 'rgb(128,0,128)';
  const [x2, y2] = axis === 'x' ? [1, 0] : [0, 1];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${hi}"/><stop offset="${band}" stop-color="rgb(128,128,128)"/><stop offset="${1 - band}" stop-color="rgb(128,128,128)"/><stop offset="1" stop-color="${lo}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
function lensFilter(id, { bx, by, scale }) {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feImage href="${lensMap('x', bx)}" preserveAspectRatio="none" result="mx"/>
    <feDisplacementMap in="SourceGraphic" in2="mx" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="dx"/>
    <feImage href="${lensMap('y', by)}" preserveAspectRatio="none" result="my"/>
    <feDisplacementMap in="dx" in2="my" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`;
}
const parseRgb = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };

export function installGlass() {
  if (document.getElementById('lg-defs')) return;
  const chromium = 'chrome' in window || navigator.userAgentData?.brands?.some((b) => /Chromium/.test(b.brand));
  if (chromium && CSS.supports('backdrop-filter', 'url(#a)')) {
    const svg = h(`<svg id="lg-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
      ${lensFilter('lg-bar', { bx: 0.05, by: 0.36, scale: 32 })}
      ${lensFilter('lg-btn', { bx: 0.3, by: 0.3, scale: 16 })}
    </defs></svg>`.replace(/<svg /, '<svg xmlns="http://www.w3.org/2000/svg" '));
    document.body.append(svg);
    document.documentElement.dataset.lens = '';
  } else document.body.append(h('<i id="lg-defs" hidden></i>'));

  // --- tinta adaptativa
  let raf = 0;
  const sample = (el) => {
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    let rgb = null;
    for (const n of stack) {
      if (n.closest('.glass, .glass-thick, .navbar, .sheet-root')) continue;
      const c = parseRgb(getComputedStyle(n).backgroundColor); if (c && c.a > 0.6) { rgb = c; break; }
    }
    if (!rgb) rgb = parseRgb(getComputedStyle(document.body).backgroundColor) || { r: 242, g: 242, b: 247, a: 1 };
    el.style.setProperty('--behind', `rgb(${rgb.r} ${rgb.g} ${rgb.b})`);
    el.dataset.behind = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) < 110 ? 'dark' : 'light';
  };
  const run = () => { raf = 0; document.querySelectorAll('[data-adapt]').forEach(sample); };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(run); };
  addEventListener('scroll', schedule, { passive: true }); addEventListener('resize', schedule);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', schedule);
  schedule();

  // --- realce especular
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let cur = null;
  const set = (el, e, spec) => { const r = el.getBoundingClientRect(); el.style.setProperty('--px', `${((e.clientX - r.left) / r.width) * 100}%`); el.style.setProperty('--py', `${((e.clientY - r.top) / r.height) * 100}%`); el.style.setProperty('--spec', spec); };
  const target = (e) => e.target.closest('.gbtn, .tab-solo, .tab-pill, .btn, .sidebar');
  document.addEventListener('pointermove', (e) => { const el = target(e); if (cur && cur !== el) cur.style.setProperty('--spec', 0); cur = el; if (el && (e.pointerType === 'mouse' || e.buttons)) set(el, e, e.buttons ? 1 : 0.55); }, { passive: true });
  document.addEventListener('pointerdown', (e) => { const el = target(e); if (el) { cur = el; set(el, e, 1); } }, { passive: true });
  const off = () => { if (cur) cur.style.setProperty('--spec', 0); };
  document.addEventListener('pointerup', off, { passive: true }); document.addEventListener('pointercancel', off, { passive: true });
  document.addEventListener('pointerleave', off, { passive: true });
}


// ------------------------------------------------------------- Utilitários -
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

export function fmtTime(iso) { if (!iso) return ''; return new Intl.DateTimeFormat('pt-PT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }
export function fmtDateTime(iso) { if (!iso) return ''; return new Intl.DateTimeFormat('pt-PT', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }
export function todayLocal() { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function fmtDay(ymd) {
  if (!ymd) return '';
  const today = todayLocal();
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 86400000));
  if (ymd === today) return 'Hoje';
  if (ymd === tomorrow) return 'Amanhã';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}
export function relTime(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'agora mesmo';
  const m = Math.round(s / 60); if (m < 60) return `há ${m} min`;
  const hh = Math.floor(m / 60); if (hh < 24) return `há ${hh} h${m % 60 ? ` ${m % 60} min` : ''}`;
  if (s < 7 * 86400) return `há ${Math.floor(hh / 24)} d`;
  return fmtDateTime(iso);          // passada uma semana, data absoluta (ui-cheatsheet)
}
export function initials(name) { return String(name || '?').split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((p) => p[0]).join('').toUpperCase(); }

export const STATUS = { pendente: 'Pendente', aguardando: 'A aguardar morador', chegou: 'No condomínio', saiu: 'Saiu', cancelada: 'Cancelada', recusada: 'Recusada' };
export const ROLE = { morador: 'Morador', seguranca: 'Segurança', admin: 'Administração' };
export const PURPOSE = { visita: 'Visita', servico: 'Serviço / Trabalho', entrega: 'Entrega', familia: 'Família', outro: 'Outro' };


// ------------------------------------------------------------------ Ícones -
// Linhas de 1.7px, extremidades redondas — no estilo dos SF Symbols.
const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const icon = {
  bell: P('<path d="M6 9a6 6 0 1 1 12 0c0 4.5 1.5 6 2 7H4c.5-1 2-2.500 2-7Z"/><path d="M10 19.500a2.200 2.200 0 0 0 4 0"/>'),
  search: P('<circle cx="10.500" cy="10.500" r="6.500"/><path d="m20 20-4.900-4.900"/>'),
  person: P('<circle cx="12" cy="8" r="3.800"/><path d="M5 20c.5-3.600 3.200-5.500 7-5.500s6.500 1.900 7 5.500"/>'),
  people: P('<circle cx="9" cy="8.500" r="3.300"/><path d="M2.800 19.500c.5-3.200 2.800-5 6.200-5s5.700 1.800 6.200 5"/><path d="M16 5.400a3.300 3.300 0 0 1 0 6.200M18.500 14.800c1.600.7 2.500 2 2.800 4.200"/>'),
  account: P('<circle cx="12" cy="12" r="9.200"/><circle cx="12" cy="10" r="3"/><path d="M6.500 18.200c1-2.200 3-3.200 5.500-3.200s4.500 1 5.500 3.200"/>'),
  building: P('<rect x="4.500" y="3" width="10" height="18" rx="1.500"/><path d="M14.500 9H18a1.500 1.500 0 0 1 1.500 1.500V21M8 7.500h3M8 11h3M8 14.500h3M3 21h18"/>'),
  door: P('<path d="M6 21V4.800a1.300 1.300 0 0 1 1-1.300L15 2.200a1.300 1.300 0 0 1 1.500 1.300V21"/><path d="M3.500 21h17M13 12v.5"/>'),
  check: P('<path d="m5 12.500 4.500 4.500L19 7.500"/>'),
  x: P('<path d="M6.500 6.500l11 11M17.500 6.500l-11 11"/>'),
  clock: P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5.200l3.300 2"/>'),
  phone: P('<path d="M5.500 3.500h3l1.600 4-2 1.300a11 11 0 0 0 5.100 5.100l1.300-2 4 1.600v3a2 2 0 0 1-2.200 2A15.500 15.500 0 0 1 3.500 5.700 2 2 0 0 1 5.500 3.500Z"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  compose: P('<path d="M11 4H6.500A2.500 2.500 0 0 0 4 6.500v11A2.500 2.500 0 0 0 6.500 20h11a2.500 2.500 0 0 0 2.500-2.500V13"/><path d="M18.200 3.800a1.800 1.800 0 0 1 2.500 2.500L12.500 14.500 9 15.200l.700-3.500Z"/>'),
  key: P('<circle cx="8" cy="15.500" r="4.200"/><path d="m11 12.500 8.500-8.500M16 7l2.500 2.500M14 9l1.800 1.800"/>'),
  exit: P('<path d="M10 4H6.500A2.500 2.500 0 0 0 4 6.500v11A2.500 2.500 0 0 0 6.500 20H10"/><path d="M15 8l4 4-4 4M19 12H9.500"/>'),
  list: P('<path d="M9 6.500h11M9 12h11M9 17.500h11"/><circle cx="4.700" cy="6.500" r=".6" fill="currentColor"/><circle cx="4.700" cy="12" r=".6" fill="currentColor"/><circle cx="4.700" cy="17.500" r=".6" fill="currentColor"/>'),
  history: P('<path d="M3.500 12a8.500 8.500 0 1 0 2.600-6.100L3.500 8.500"/><path d="M3.500 4v4.500H8M12 7.500v4.800l3 1.800"/>'),
  doc: P('<path d="M7 3h6.500L19 8.500V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M13.500 3v5.500H19M8.500 13h7M8.500 16.500h5"/>'),
  shield: P('<path d="M12 3 5 5.800v5.700c0 4.200 2.800 7.700 7 9.500 4.200-1.800 7-5.300 7-9.500V5.800Z"/><path d="m9 12 2.200 2.200L15.200 10"/>'),
  calendar: P('<rect x="3.500" y="5" width="17" height="15.500" rx="2.500"/><path d="M3.500 10h17M8 3v4M16 3v4"/>'),
  tray: P('<path d="M4 13.500 6.200 6a2 2 0 0 1 1.900-1.500h7.800A2 2 0 0 1 17.800 6l2.200 7.500v4A2.500 2.500 0 0 1 17.500 20h-11A2.500 2.500 0 0 1 4 17.500Z"/><path d="M4 13.500h4.500a1.500 1.500 0 0 1 1.500 1.500 2 2 0 0 0 4 0 1.500 1.500 0 0 1 1.500-1.500H20"/>'),
  chevron: P('<path d="m9 5.500 6.500 6.500L9 18.500"/>'),
  updown: P('<path d="m8 9.500 4-4 4 4M8 14.500l4 4 4-4"/>'),
  send: P('<path d="M20.500 3.500 10.500 13.500M20.500 3.500 14 20.500l-3.500-7-7-3.500Z"/>'),
  lock: P('<rect x="5" y="10.500" width="14" height="10" rx="2.500"/><path d="M8 10.500V8a4 4 0 0 1 8 0v2.500"/>'),
  info: P('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.800v.2"/>'),
};

// ------------------------------------------------------------------- Toast -
let toastEl, toastSpring, toastTimer;
export function toast(message, { error = false, duration = 2600 } = {}) {
  if (!toastEl) {
    toastEl = h('<div class="toast glass" role="status" aria-live="polite" data-adapt></div>'); document.body.append(toastEl);
    toastSpring = new Spring({ value: 0, damping: 1, response: 0.35, precision: 0.002, onUpdate: (p) => {
      toastEl.style.opacity = Math.max(0, Math.min(1, p));
      toastEl.style.transform = `translateX(-50%) translateY(${(1 - p) * 14}px) scale(${0.96 + 0.04 * p})`;
    } });
  }
  toastEl.textContent = message; toastEl.classList.toggle('error', error);
  toastSpring.to(1); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastSpring.to(0), duration);
}

// ------------------------------------------------------------------ Banner -
// Aviso no estilo das notificações do iOS: vidro, ícone da app, "agora".
let bannerHost;
export function banner({ title, body = '', onClick, duration = 6000 }) {
  if (!bannerHost) { bannerHost = h('<div class="banners" aria-live="assertive"></div>'); document.body.append(bannerHost); }
  const el = h(`<div class="banner glass glass-thick lens-bar" role="alert"><img src="/icons/icon-192.png" alt=""><div class="meta"><span>Portaria</span><span>agora</span></div><div><div class="tt">${esc(title)}</div>${body ? `<div class="bd">${esc(body)}</div>` : ''}</div></div>`);
  bannerHost.prepend(el);
  const height = 140;
  const y = new Spring({ value: -height, damping: 1, response: 0.42, onUpdate: (v) => {
    el.style.transform = `translateY(${v}px)`;
    el.style.opacity = reducedMotion() ? 1 : Math.max(0, Math.min(1, 1 + v / height * 1.4));
  } });
  if (reducedMotion()) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }); y.set(0); } else y.to(0);
  let timer = setTimeout(dismiss, duration); let gone = false;
  function dismiss(velocity = 0) {
    if (gone) return; gone = true; clearTimeout(timer);
    if (reducedMotion()) { el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 }).onfinish = () => el.remove(); return; }
    y.onRest = () => el.remove(); y.to(-height, { velocity: Math.min(velocity, -400) });   // sai por onde entrou
  }
  const vt = velocityTracker(); let startY = 0, dragging = false, moved = false;
  el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); y.stop(); startY = e.clientY - y.value; dragging = true; moved = false; vt.reset(); vt.add(e.clientY); clearTimeout(timer); });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return; let d = e.clientY - startY; if (Math.abs(d - y.value) > 3) moved = true;
    if (d > 0) d = rubberband(d, 80); y.value = d; y.onUpdate(d); vt.add(e.clientY);
  });
  const end = () => {
    if (!dragging) return; dragging = false; const v = vt.velocity();
    if (!moved) { dismiss(); onClick?.(); return; }
    if (y.value + project(v) < -40) dismiss(v); else { y.to(0, { velocity: v, damping: 0.8, response: 0.35 }); timer = setTimeout(dismiss, duration); }
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  return { dismiss };
}

// ------------------------------------------------------------------- Sheet -
/**
 * openSheet({ title, content }) → { close, el }
 * Folha de vidro flutuante no telemóvel (arrastável, com projeção de momento),
 * cartão central em ecrãs grandes que "materializa" a partir do botão de origem.
 */
export function openSheet({ title, content, onClose, origin } = {}) {
  const root = h(`<div class="sheet-root is-open" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="scrim"></div>
      <section class="sheet glass glass-thick">
        <div class="grabber" aria-hidden="true"></div>
        <header class="sheet-head"><span></span><h2>${esc(title)}</h2><button class="gbtn round glass" data-close aria-label="Fechar">${icon.x}</button></header>
        <div class="sheet-body"></div>
      </section></div>`);
  const sheet = $('.sheet', root), scrim = $('.scrim', root), body = $('.sheet-body', root);
  if (typeof content === 'string') body.innerHTML = content; else if (content) body.append(content);
  document.body.append(root);
  const prevFocus = document.activeElement;
  document.documentElement.style.overflow = 'hidden';
  const desktop = matchMedia('(min-width: 720px)').matches;
  const H = () => sheet.getBoundingClientRect().height || 600;

  let spring;
  if (desktop) {
    if (origin) { const r = origin.getBoundingClientRect(); const s = sheet.getBoundingClientRect(); sheet.style.transformOrigin = `${r.left + r.width / 2 - s.left}px ${r.top + r.height / 2 - s.top}px`; }
    spring = new Spring({ value: 0, damping: 1, response: 0.32, precision: 0.002, onUpdate: (p) => {
      const c = Math.max(0, Math.min(1, p));
      sheet.style.transform = `translateY(-50%) scale(${0.92 + 0.08 * p})`; sheet.style.opacity = c;
      scrim.style.opacity = c;
    } });
  } else {
    spring = new Spring({ value: H(), damping: 1, response: 0.38, onUpdate: (y) => {
      sheet.style.transform = `translateY(${y}px)`;
      scrim.style.opacity = Math.max(0, Math.min(1, 1 - y / H()));
    } });
  }
  spring.onUpdate(spring.value);
  requestAnimationFrame(() => spring.to(desktop ? 1 : 0));

  let closed = false;
  function close({ velocity = 0 } = {}) {
    if (closed) return; closed = true;
    root.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    removeEventListener('keydown', onKey);
    spring.onRest = () => { root.remove(); onClose?.(); prevFocus?.focus?.(); };
    if (desktop) spring.to(0, { response: 0.25 }); else spring.to(H() + 60, { velocity: Math.max(velocity, 0), damping: 1, response: 0.3 });
  }
  scrim.addEventListener('click', () => close());
  $('[data-close]', root).addEventListener('click', () => close());
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);

  if (!desktop) {
    const vt = velocityTracker(); let grabY = null, startY = 0, intent = null;
    const down = (e) => {
      if (e.target.closest('input,textarea,select,button,a,label')) return;
      if (e.currentTarget === body && body.scrollTop > 0) return;
      grabY = e.clientY; startY = spring.value; intent = null; vt.reset(); vt.add(e.clientY);
      spring.stop();
    };
    const move = (e) => {
      if (grabY === null) return;
      const d = e.clientY - grabY;
      if (intent === null) {
        if (Math.abs(d) < 10) return;
        if (d < 0 && e.currentTarget === body) { grabY = null; return; }
        intent = 'drag'; e.currentTarget.setPointerCapture?.(e.pointerId);
      }
      let y = startY + d;
      if (y < 0) y = rubberband(y, H());
      spring.value = y; spring.onUpdate(y); vt.add(e.clientY);
    };
    const up = () => {
      if (grabY === null) return; grabY = null;
      if (intent !== 'drag') { if (spring.value !== 0) spring.to(0); return; }
      const v = vt.velocity(); const projected = spring.value + project(v);
      if (projected > H() * 0.5) close({ velocity: v });
      else spring.to(0, { velocity: v, damping: Math.abs(v) > 300 ? 0.8 : 1, response: 0.3 });
    };
    for (const zone of [$('.grabber', root), $('.sheet-head', root), body]) {
      zone.addEventListener('pointerdown', down); zone.addEventListener('pointermove', move);
      zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
    }
  }
  setTimeout(() => { const f = body.querySelector('input:not([type=hidden]):not([type=checkbox]),textarea,select'); if (f && desktop) f.focus(); }, 60);
  return { close, el: body, root };
}

// --------------------------------------------------------- Segmented control
export function segmented(el, onChange) {
  const ind = h('<span class="indicator" aria-hidden="true"></span>'); el.prepend(ind);
  const x = new Spring({ value: 0, damping: 1, response: 0.3, onUpdate: (v) => { ind.style.transform = `translateX(${v}px)`; } });
  const w = new Spring({ value: 0, damping: 1, response: 0.3, onUpdate: (v) => { ind.style.width = `${v}px`; } });
  const btns = () => $$('button', el);
  function select(btn, animate = true) {
    btns().forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    const left = btn.offsetLeft, width = btn.offsetWidth;
    if (animate) { x.to(left); w.to(width); } else { x.set(left); w.set(width); }
  }
  el.setAttribute('role', 'tablist');
  btns().forEach((b) => { b.setAttribute('role', 'tab'); b.type = 'button'; });
  el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.getAttribute('aria-selected') === 'true') return; select(b); onChange?.(b.dataset.value, b); });
  const initial = btns().find((b) => b.getAttribute('aria-selected') === 'true') || btns()[0];
  requestAnimationFrame(() => select(initial, false));
  new ResizeObserver(() => { const cur = btns().find((b) => b.getAttribute('aria-selected') === 'true'); if (cur) select(cur, false); }).observe(el);
  return { select: (value) => { const b = btns().find((x2) => x2.dataset.value === value); if (b) { select(b); } } };
}


/** Anima a entrada de um elemento novo numa lista (mola criticamente amortecida, sem overshoot). */
export function enter(el, { delay = 0 } = {}) {
  if (reducedMotion()) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay }); return; }
  el.style.opacity = 0;
  const s = new Spring({ value: 0, damping: 1, response: 0.4, precision: 0.002, onUpdate: (p) => {
    el.style.opacity = Math.min(1, p * 1.2);
    el.style.transform = p >= 1 ? '' : `translateY(${(1 - p) * 14}px) scale(${0.98 + 0.02 * p})`;
  } });
  setTimeout(() => s.to(1), delay);
}
/** Remove com fade + encolher, depois tira do DOM. */
export function leave(el) {
  return new Promise((resolve) => {
    if (reducedMotion()) { el.remove(); resolve(); return; }
    const hgt = el.offsetHeight;
    el.style.overflow = 'hidden';
    const s = new Spring({ value: 1, damping: 1, response: 0.32, precision: 0.002, onUpdate: (p) => {
      el.style.opacity = Math.max(0, p); el.style.transform = `scale(${0.96 + 0.04 * p})`;
      el.style.height = `${Math.max(0, hgt * p)}px`; el.style.marginBottom = `${(p - 1) * 12}px`;
    }, onRest: () => { el.remove(); resolve(); } });
    s.to(0);
  });
}


/** Validação inline (não só ao submeter). */
export function setFieldError(input, message) {
  const holder = input.closest('.cell') || input.closest('.group'); if (!holder) return;
  holder.classList.toggle('has-error', !!message);
  const group = input.closest('.group'); const after = group || holder;
  let hint = after.nextElementSibling?.matches('.field-error') ? after.nextElementSibling : null;
  if (message) { if (!hint) { hint = h('<p class="field-error" role="alert"></p>'); after.after(hint); } hint.textContent = message; input.setAttribute('aria-invalid', 'true'); }
  else { hint?.remove(); input.removeAttribute('aria-invalid'); }
}

export function emptyState(iconName, title, text) {
  return `<div class="empty">${icon[iconName] || ''}<div class="headline">${esc(title)}</div><div class="sub">${esc(text)}</div></div>`;
}

export function busy(btn, on, label) {
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${label ? `<span>${esc(label)}</span>` : ''}`; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

/** Plural em português via Intl.PluralRules (1 acompanhante, 2 acompanhantes). */
const pr = new Intl.PluralRules('pt');
export function plural(n, one, other) { return `${n} ${pr.select(n) === 'one' ? one : other}`; }

/**
 * Reconciliação com chave: reaproveita nós inalterados, anima os novos (enter)
 * e os que saem (leave). Mantém a lista estável enquanto chegam eventos em tempo real.
 */
export function reconcile(container, items, { key, sig, render, empty = '', animateNew = true }) {
  const existing = new Map($$(':scope > [data-key]', container).map((el) => [el.dataset.key, el]));
  const emptyEl = $(':scope > .empty', container);
  if (!items.length) {
    existing.forEach((el) => leave(el));
    if (!emptyEl && empty) { const e = h(empty); container.append(e); enter(e); }
    return;
  }
  emptyEl?.remove();
  const seen = new Set(); let prev = null;
  for (const item of items) {
    const k = String(key(item)); const s = String(sig(item)); seen.add(k);
    let el = existing.get(k);
    if (!el || el.dataset.sig !== s) {
      const fresh = render(item); fresh.dataset.key = k; fresh.dataset.sig = s;
      if (el) { el.replaceWith(fresh); } else if (animateNew) { requestAnimationFrame(() => enter(fresh)); }
      el = fresh;
    }
    const want = prev ? prev.nextElementSibling : container.firstElementChild;
    if (want !== el) { if (prev) prev.after(el); else container.prepend(el); }
    prev = el;
  }
  existing.forEach((el, k) => { if (!seen.has(k)) leave(el); });
}

/** Substitui <span data-icon="nome"> pelo SVG correspondente. */
export function hydrateIcons(root = document) { $$('[data-icon]', root).forEach((el) => { const s = icon[el.dataset.icon]; if (s) el.outerHTML = s; }); }
