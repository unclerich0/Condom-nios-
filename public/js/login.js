import { $, $$, icon, installPressFeedback, installGlass, toast, busy, haptic, Spring, reducedMotion } from './ui.js';
import { post, homeFor, registerSW } from './api.js';

installPressFeedback();
installGlass();
registerSW();
$$('[data-chev]').forEach((el) => { el.innerHTML = icon.chevron; });

// Já tem sessão? Vai direto para o painel certo.
fetch('/api/auth/me', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((me) => { if (me) location.replace(homeFor(me.role)); }).catch(() => {});
if (new URLSearchParams(location.search).has('expirada')) toast('A sessão expirou. Entre novamente.');

const form = $('#login');
const errBox = $('#login-error');
const clear = () => { errBox.hidden = true; $$('.cell', form).forEach((c) => c.classList.remove('has-error')); };
for (const input of $$('input', form)) input.addEventListener('input', clear);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = form.username.value.trim(); const password = form.password.value;
  if (!username || !password) {
    errBox.textContent = !username ? 'Indique o utilizador.' : 'Indique a palavra-passe.'; errBox.hidden = false;
    (!username ? form.username : form.password).closest('.cell').classList.add('has-error');
    (!username ? form.username : form.password).focus(); return;
  }
  const btn = $('button[type=submit]', form);
  busy(btn, true, 'A entrar…');
  try {
    const me = await post('/api/auth/login', { username, password });
    haptic(8);
    location.href = homeFor(me.role);
  } catch (err) {
    busy(btn, false);
    errBox.textContent = err.message; errBox.hidden = false;
    if (!reducedMotion()) {
      const group = $('.group', form);
      const shake = group._shake || (group._shake = new Spring({
        value: 0, damping: 0.45, response: 0.3, precision: 0.4,
        onUpdate: (v) => { group.style.transform = Math.abs(v) < 0.4 ? '' : `translateX(${v}px)`; },
      }));
      shake.value = 0; shake.velocity = -380; shake.to(0);
    }
    haptic([20, 40, 20]);
  }
});

$$('.demo .cell').forEach((c) => c.addEventListener('click', () => {
  form.username.value = c.dataset.u; form.password.value = c.dataset.p;
  form.requestSubmit();
}));
