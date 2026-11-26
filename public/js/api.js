// api.js — cliente HTTP + tempo real (SSE) + notificações do sistema / Web Push
import { toast } from './ui.js';

export async function api(method, url, body) {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* sem corpo */ }
  if (res.status === 401 && !url.startsWith('/api/auth/') && location.pathname !== '/') { location.href = '/?expirada=1'; throw new Error('Sessão expirada'); }
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Algo correu mal. Tente novamente.'), { status: res.status });
  return data;
}
export const get = (u) => api('GET', u);
export const post = (u, b = {}) => api('POST', u, b);
export const patch = (u, b = {}) => api('PATCH', u, b);

/** Garante sessão com um dos papéis indicados; caso contrário volta ao login. */
export async function requireSession(...roles) {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!r.ok) { location.replace('/?expirada=1'); return null; }
    const me = await r.json();
    if (roles.length && !roles.includes(me.role)) { location.href = homeFor(me.role); return null; }
    return me;
  } catch { return null; }
}
export function homeFor(role) { return role === 'admin' ? '/admin' : role === 'seguranca' ? '/seguranca' : '/morador'; }
export async function logout() { await post('/api/auth/logout'); location.href = '/'; }

/** Liga ao canal SSE. O EventSource reconecta sozinho; ao reconectar pedimos um refresh. */
export function connectLive(handlers, statusEl) {
  let es, first = true;
  const setStatus = (on) => {
    if (!statusEl) return;
    statusEl.classList.toggle('on', on); statusEl.classList.toggle('off', !on);
    statusEl.querySelector('span').textContent = on ? 'Em tempo real' : 'A religar…';
  };
  function open() {
    es = new EventSource('/api/events');
    es.addEventListener('hello', () => { setStatus(true); if (!first) handlers.resync?.(); first = false; });
    es.onerror = () => setStatus(false);
    for (const [name, fn] of Object.entries(handlers)) if (name !== 'resync') es.addEventListener(name, (e) => fn(JSON.parse(e.data)));
  }
  open();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && es.readyState === EventSource.CLOSED) open(); });
  return () => es.close();
}

// ---------------------------------------------------------------- PWA/push --
let swReg = null;
export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try { swReg = await navigator.serviceWorker.register('/sw.js'); } catch { swReg = null; }
  return swReg;
}
export const notificationsSupported = () => 'Notification' in window;
export const notificationsGranted = () => notificationsSupported() && Notification.permission === 'granted';

function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Pede permissão no momento certo (gesto do utilizador) e subscreve Web Push. */
export async function enableNotifications() {
  if (!notificationsSupported()) { toast('Este navegador não suporta notificações.', { error: true }); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notificações bloqueadas nas definições do navegador.', { error: true }); return false; }
  try {
    const reg = swReg || (await registerSW());
    if (reg && 'PushManager' in window) {
      const { publicKey } = await get('/api/push/key');
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(publicKey) });
      await post('/api/push/subscribe', sub.toJSON());
    }
  } catch (e) { console.warn('Push indisponível (requer HTTPS ou localhost):', e); }
  toast('Notificações ativadas');
  return true;
}

/** Mostra notificação do sistema quando a app não está visível (o SSE continua ligado). */
export async function systemNotify(title, body, tag) {
  if (!notificationsGranted() || !document.hidden) return;
  try {
    const reg = swReg || (await navigator.serviceWorker?.getRegistration());
    if (reg) await reg.showNotification(title, { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' });
    else new Notification(title, { body, tag, icon: '/icons/icon-192.png' });
  } catch { /* ignorar */ }
}
