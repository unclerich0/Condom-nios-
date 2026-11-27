// Teste ponta-a-ponta com Playwright (Chromium headless).
// Arranca um servidor próprio com BD temporária, percorre o fluxo morador ↔ segurança
// e guarda capturas de ecrã em docs/screenshots/.
//   npm run test:e2e        (requer: npx playwright install chromium)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const PORT = Number(process.env.E2E_PORT || 3123);
const BASE = `http://localhost:${PORT}`;
const SHOTS = path.resolve('docs/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cv-e2e-')), 'e2e.db');

const e2eEnv = { ...process.env, PORT: String(PORT), DB_FILE: dbFile, DISABLE_PUSH: '1', SEED: '1' };
delete e2eEnv.DATABASE_URL;
delete e2eEnv.DATABASE_SCHEMA;
delete e2eEnv.SEED_DEMO;
delete e2eEnv.ADMIN_PASSWORD;
const server = spawn(process.execPath, ['src/server.js'], { env: e2eEnv, stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
await new Promise((res, rej) => { server.stdout.on('data', (d) => { if (String(d).includes('a correr')) res(); }); setTimeout(() => rej(new Error('servidor não arrancou')), 20000); });

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try { await fn(); results.push(['✔', name, Date.now() - t]); console.log(`✔ ${name}`); }
  catch (e) { results.push(['✖', name, Date.now() - t]); console.log(`✖ ${name}\n  ${e.message}`); throw e; }
}

const browser = await chromium.launch();
const errors = [];
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ locale: 'pt-PT', timezoneId: 'Africa/Luanda', ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errors.push(`${page.url()}: ${m.text()}`); });
  return page;
}
async function login(page, username, password, expectPath) {
  await page.goto(BASE + '/');
  await page.fill('input[name=username]', username);
  await page.fill('input[name=password]', password);
  await page.click('button[type=submit]');
  await page.waitForURL(`**${expectPath}`);
  await page.waitForSelector('#live.on, #users .cell', { timeout: 5000 });
}
const settle = (p, ms = 700) => p.waitForTimeout(ms);

const tab = (p, id) => p.locator(`[data-tab="${id}"]:visible`).first();
const goTab = async (p, id) => { await tab(p, id).click(); await p.waitForSelector(`[data-screen="${id}"]:not([hidden])`); };

let exitCode = 0;
try {
  const desktop = { viewport: { width: 1280, height: 860 } };
  const tablet = { viewport: { width: 1180, height: 820 } };
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

  // 1) Login + papéis --------------------------------------------------------
  const anon = await newPage({ viewport: { width: 1280, height: 760 } });
  await step('página de login abre', async () => {
    await anon.goto(BASE + '/');
    await anon.waitForSelector('text=Contas de demonstração');
    await settle(anon, 300);
    await anon.screenshot({ path: `${SHOTS}/01-login.png` });
  });
  await step('login com palavra-passe errada mostra erro', async () => {
    await anon.fill('input[name=username]', 'ana.silva'); await anon.fill('input[name=password]', 'errada');
    await anon.click('button[type=submit]');
    await anon.waitForSelector('#login-error:not([hidden])');
    assert.match(await anon.textContent('#login-error'), /incorretos/);
  });

  const sec = await newPage(tablet);
  const res = await newPage(tablet);
  await step('login por papel: segurança → /seguranca, morador → /morador', async () => {
    await login(sec, 'seguranca', 'seguranca123', '/seguranca');
    await login(res, 'joao.santos', 'morador123', '/morador');
    assert.equal(await res.textContent('#who-name'), 'João Santos');
  });
  await step('morador não consegue abrir o painel da portaria', async () => {
    const p = await newPage(desktop);
    await login(p, 'ana.silva', 'morador123', '/morador');
    await p.goto(BASE + '/seguranca'); await p.waitForURL('**/morador');
    const r = await p.request.get(BASE + '/api/residents'); assert.equal(r.status(), 403);
    await p.context().close();
  });
  await step('estrutura nativa: vidro só em barras e botões; listas e a barra lateral são opacas', async () => {
    assert.ok(await res.locator('.sidebar').isVisible()); assert.ok(!(await res.locator('.tabbar').isVisible()));
    const mat = await res.evaluate(() => {
      const bf = (sel) => getComputedStyle(document.querySelector(sel)).backdropFilter;
      return { header: bf('.sb-brand'), sidebar: bf('.sidebar'), group: bf('.group'), navbar: bf('.navbar'), tab: bf('.sb-tabs .tab') };
    });
    assert.notEqual(mat.header, 'none', 'cabeçalho da barra lateral com vidro');
    assert.notEqual(mat.navbar, 'none', 'barra de navegação com vidro');
    assert.notEqual(mat.tab, 'none', 'item de separador com vidro');
    assert.equal(mat.sidebar, 'none', 'corpo da barra lateral opaco');
    assert.equal(mat.group, 'none', 'lista agrupada opaca');
  });

  // 2) Morador envia → aparece em tempo real na portaria ---------------------
  const visitor = 'Marcos Teixeira';
  await step('morador envia visita e ela aparece ao vivo no painel do segurança', async () => {
    const before = await sec.locator('#pending .visit').count();
    await goTab(res, 'nova');
    await res.fill('input[name=visitor_name]', visitor);
    await res.click('label[for=accompanied]');
    await res.click('.stepper [data-step="1"]');
    await res.fill('input[name=companions_names]', 'Dois ajudantes');
    await res.selectOption('select[name=purpose]', 'servico');
    await res.fill('textarea[name=details]', 'Vem montar os armários da cozinha.');
    await res.click('#btn-send');
    await res.waitForSelector(`[data-screen="visitas"]:not([hidden]) #visits .visit:has-text("${visitor}")`);
    const t0 = Date.now();
    await sec.waitForSelector(`#pending .visit:has-text("${visitor}")`, { timeout: 4000 });  // sem recarregar
    console.log(`  ↳ entregue à portaria em ${Date.now() - t0} ms (SSE)`);
    assert.equal(await sec.locator('#pending .visit').count(), before + 1);
    await sec.waitForSelector(`.banner:has-text("Nova visita: ${visitor}")`);
    const card = sec.locator(`#pending .visit:has-text("${visitor}")`);
    assert.match(await card.textContent(), /2 acompanhantes \(Dois ajudantes\)/);
    assert.match(await card.textContent(), /João Santos/);
    assert.match(await card.textContent(), /Bloco A · Apt 102/);
    await settle(sec, 900);
    await sec.screenshot({ path: `${SHOTS}/03-seguranca-pendentes.png` });
  });

  // 3) Chegada → morador notificado ao vivo ----------------------------------
  await step('segurança carrega em "Chegada" e o morador é notificado no momento', async () => {
    await sec.locator(`#pending .visit:has-text("${visitor}") [data-arrive]`).click();
    await res.waitForSelector(`.banner:has-text("${visitor} chegou")`, { timeout: 4000 });
    assert.equal((await tab(res, 'avisos').locator('.tbadge').textContent()).trim(), '1');
    await res.waitForSelector(`#visits .visit:has-text("${visitor}") .status.chegou`);
    await settle(res, 700);
    await res.screenshot({ path: `${SHOTS}/02-morador-notificacao.png` });
    await goTab(sec, 'dentro');
    await sec.waitForSelector(`#inside .visit:has-text("${visitor}")`);
  });
  await step('separador Avisos mostra a chegada e limpa o contador', async () => {
    await goTab(res, 'avisos');
    await res.waitForSelector(`#notifs .cell:has-text("${visitor} chegou")`);
    await res.waitForFunction(() => [...document.querySelectorAll('[data-tab="avisos"] .tbadge')].every((b) => b.hidden));
  });

  // 4) Pesquisa de moradores -------------------------------------------------
  await step('pesquisa de moradores (nome, bloco/apt, telefone)', async () => {
    await goTab(sec, 'moradores');
    await sec.waitForFunction(() => document.querySelectorAll('#residents .cell').length === 15);
    await sec.fill('#res-q', 'B 201');
    await sec.waitForFunction(() => document.querySelectorAll('#residents .cell').length === 1);
    assert.match(await sec.textContent('#residents'), /António Lopes/);
    await sec.fill('#res-q', '933 212');
    await sec.waitForFunction(() => document.querySelector('#residents')?.textContent.includes('Manuel Pereira'));
    await sec.fill('#res-q', 'bloco C');
    await sec.waitForFunction(() => document.querySelectorAll('#residents .cell').length === 5);
    await sec.evaluate(() => document.querySelector('.banners')?.replaceChildren());
    await settle(sec, 400);
    await sec.screenshot({ path: `${SHOTS}/04-seguranca-pesquisa.png` });
  });

  // 5) Visitante sem aviso → morador autoriza → código de acesso -------------
  await step('visitante sem aviso: morador autoriza e a portaria vê na hora', async () => {
    await sec.fill('#res-q', 'João');
    await sec.waitForFunction(() => document.querySelectorAll('#residents .cell').length === 1);
    await sec.click('#residents [data-resident]');
    await sec.waitForSelector('.sheet [data-walkin]');
    await sec.click('.sheet [data-walkin]');
    await sec.waitForSelector('.sheet input[name=visitor_name]');
    await sec.fill('.sheet input[name=visitor_name]', 'Estafeta Kubinga');
    await sec.selectOption('.sheet select[name=purpose]', 'entrega');
    await sec.click('.sheet button[type=submit]');
    await goTab(res, 'visitas');
    await res.waitForSelector('#approvals .visit:has-text("Estafeta Kubinga")', { timeout: 4000 });
    await res.click('#approvals [data-approve]');
    await sec.waitForSelector('.banner:has-text("autorizou a entrada")', { timeout: 4000 });
    await sec.waitForSelector('#pending .visit:has-text("Estafeta Kubinga") [data-arrive]');
  });
  await step('verificar código de acesso e registar a chegada por código', async () => {
    const code = (await sec.locator('#pending .visit:has-text("Estafeta Kubinga") .mono').textContent()).trim();
    assert.match(code, /^\d{6}$/);
    await sec.click('[data-action=code]');
    await sec.fill('.sheet input[name=code]', code);
    await sec.click('.sheet button[type=submit]');
    await sec.waitForSelector('.sheet [data-arrive]');
    await sec.click('.sheet [data-arrive]');
    await res.waitForSelector('.banner:has-text("Estafeta Kubinga chegou")', { timeout: 4000 });
    await sec.waitForSelector('.sheet-root', { state: 'detached' });
  });

  // 6) Saída -------------------------------------------------------------------
  await step('registar saída retira o visitante de "No condomínio"', async () => {
    await goTab(sec, 'dentro');
    await sec.locator(`#inside .visit:has-text("${visitor}") [data-leave]`).click();
    await sec.waitForSelector(`#inside .visit:has-text("${visitor}")`, { state: 'detached' });
    await res.waitForSelector(`.banner:has-text("${visitor} saiu")`, { timeout: 4000 });
  });

  await step('histórico com filtros', async () => {
    await goTab(sec, 'historico');
    await sec.waitForSelector(`#hist .cell:has-text("${visitor}")`);
    await sec.fill('#hist-form input[name=q]', 'Estafeta');
    await sec.waitForFunction(() => document.querySelectorAll('#hist .cell').length === 1 && document.querySelector('#hist').textContent.includes('Estafeta'));
  });

  // 7) Admin -------------------------------------------------------------------
  await step('administração: lista contas e cria um novo morador', async () => {
    const adm = await newPage(tablet);
    await login(adm, 'admin', 'admin123', '/admin');
    await adm.waitForFunction(() => document.querySelectorAll('#users .cell').length >= 18);
    await settle(adm, 400);
    await adm.screenshot({ path: `${SHOTS}/05-admin.png` });
    await adm.click('[data-action=new]');
    await adm.fill('.sheet input[name=name]', 'Isabel Quintas');
    await adm.fill('.sheet input[name=username]', 'isabel.quintas');
    await adm.fill('.sheet input[name=bloco]', 'D');
    await adm.fill('.sheet input[name=apartamento]', '101');
    await adm.fill('.sheet input[name=phone]', '+244 923 000 111');
    await adm.fill('.sheet input[name=password]', 'morador123');
    await settle(adm, 400);
    await adm.screenshot({ path: `${SHOTS}/06-admin-nova-conta.png` });
    await adm.click('.sheet button[type=submit]');
    await adm.waitForSelector('#users .cell:has-text("Isabel Quintas")');
    await goTab(adm, 'auditoria');
    await adm.waitForSelector('#audit .cell:has-text("Registou chegada")');
    await adm.context().close();
  });
  await step('conta criada pelo admin consegue iniciar sessão', async () => {
    const p = await newPage(desktop);
    await login(p, 'isabel.quintas', 'morador123', '/morador');
    await p.context().close();
  });

  // 8) Telemóvel ---------------------------------------------------------------
  await step('telemóvel: separadores de vidro, título grande que colapsa, folha arrastável', async () => {
    const mob = await newPage(phone);
    await login(mob, 'joao.santos', 'morador123', '/morador');
    for (const [n, p, d] of [['Rui Pedrosa', 'visita', 'Jantar de aniversário'], ['Clínica Vida — enfermeira', 'servico', 'Cuidados ao domicílio'], ['Entrega Glovo', 'entrega', ''], ['Tia Amélia', 'familia', 'Fica para o fim de semana']]) {
      const r = await mob.request.post(BASE + '/api/visits', { data: { visitor_name: n, purpose: p, details: d } }); assert.equal(r.status(), 201);
    }
    await mob.waitForFunction(() => document.querySelectorAll('#visits .visit').length >= 5);
    assert.equal(await mob.locator('.tabbar').isVisible(), true);
    assert.equal(await mob.locator('.navbar').evaluate((n) => n.classList.contains('is-collapsed')), false);
    await mob.evaluate(() => window.scrollTo(0, 260)); await settle(mob, 700);
    assert.equal(await mob.locator('.navbar').evaluate((n) => n.classList.contains('is-collapsed')), true, 'título grande colapsou');
    await mob.screenshot({ path: `${SHOTS}/07-mobile-morador.png` });
    await goTab(mob, 'avisos'); await settle(mob, 500);
    await mob.screenshot({ path: `${SHOTS}/08-mobile-avisos.png` });
    await goTab(mob, 'nova'); await settle(mob, 500);
    await mob.screenshot({ path: `${SHOTS}/10-mobile-nova-visita.png` });
    await goTab(mob, 'visitas');
    await mob.evaluate(() => window.scrollTo(0, 120));
    await mob.click('#btn-account');
    await mob.waitForSelector('.sheet .group'); await settle(mob, 700);
    const mat = await mob.evaluate(() => {
      const bf = (sel) => getComputedStyle(document.querySelector(sel)).backdropFilter;
      return { sheet: bf('.sheet'), pill: bf('.tab-pill'), group: bf('.group'), btn: bf('.visit .btn') };
    });
    assert.equal(mat.sheet, 'none', 'folha opaca');
    assert.equal(mat.group, 'none', 'lista opaca');
    assert.notEqual(mat.pill, 'none', 'barra de separadores com vidro');
    assert.notEqual(mat.btn, 'none', 'botão da lista com vidro');
    await mob.screenshot({ path: `${SHOTS}/11-mobile-folha-conta.png` });
    // arrastar a folha para baixo com um gesto rápido fecha-a (projeção de momento)
    const g = await mob.locator('.sheet .grabber').boundingBox();
    await mob.mouse.move(g.x + g.width / 2, g.y + 8); await mob.mouse.down();
    for (let i = 1; i <= 6; i++) { await mob.mouse.move(g.x + g.width / 2, g.y + 8 + i * 30); await mob.waitForTimeout(8); }
    await mob.mouse.up();
    await mob.waitForSelector('.sheet-root', { state: 'detached', timeout: 3000 });
    await mob.context().close();
  });
  await step('telemóvel (portaria): separador de pesquisa destacado', async () => {
    const m = await newPage(phone);
    await login(m, 'seguranca', 'seguranca123', '/seguranca');
    assert.ok(await m.locator('.tab-solo').isVisible());
    await m.waitForSelector('#pending .visit'); await settle(m, 600);
    await m.evaluate(() => window.scrollTo(0, 140)); await settle(m, 500);
    await m.screenshot({ path: `${SHOTS}/12-mobile-seguranca.png` });
    await m.click('.tab-solo'); await m.waitForSelector('#residents .cell'); await settle(m, 400);
    await m.context().close();
  });

  await step('modo escuro (tablet da portaria)', async () => {
    const dark = await newPage({ ...tablet, colorScheme: 'dark' });
    await login(dark, 'seguranca', 'seguranca123', '/seguranca');
    await settle(dark, 600);
    await dark.screenshot({ path: `${SHOTS}/09-seguranca-escuro.png` });
    await dark.context().close();
  });
  await step('reduzir movimento: navegação continua a funcionar sem molas', async () => {
    const rm = await newPage({ ...phone, reducedMotion: 'reduce' });
    await login(rm, 'ana.silva', 'morador123', '/morador');
    await goTab(rm, 'nova'); await goTab(rm, 'avisos');
    await rm.click('#btn-account'); await rm.waitForSelector('.sheet .group');
    await rm.click('.sheet [data-close]'); await rm.waitForSelector('.sheet-root', { state: 'detached' });
    await rm.context().close();
  });

  assert.deepEqual(errors, [], 'erros de JavaScript nas páginas');
} catch (e) {
  exitCode = 1;
  if (errors.length) console.log('Erros no browser:\n' + errors.join('\n'));
} finally {
  await browser.close();
  server.kill('SIGTERM');
  const ok = results.filter((r) => r[0] === '✔').length;
  console.log(`\n${ok}/${results.length} passos E2E OK · capturas em docs/screenshots/`);
  process.exit(exitCode);
}
