// Gera as páginas do site a partir de fonte/menu.json, fonte/base.html e fonte/partes/.
// Uso: node fonte/gerar.mjs   (a partir de restaurantes/chef-burger)
// O site publicado não precisa deste passo: os .html já vão gerados no repositório.
//
// Páginas (a ordem decide a direção da transição: maior = desliza da direita):
//   index.html            início (-1)
//   ementa.html           a ementa em livro, abre logo (0)
//   <categoria>.html      só reencaminham para ementa.html#livro-<categoria> (links antigos)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const menu = JSON.parse(fs.readFileSync(path.join(here, 'menu.json'), 'utf8'));
const base = fs.readFileSync(path.join(here, 'base.html'), 'utf8');
const part = (n) => fs.readFileSync(path.join(here, 'partes', n + '.html'), 'utf8');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kz = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' Kz';
const slug = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i');
const pratos = (n) => n + (n === 1 ? ' prato' : ' pratos');

const total = menu.reduce((n, c) => n + c.dishes.length, 0);
const file = (c) => `${c.id}.html`;
const bookHref = (c) => `ementa.html#livro-${c.id}`;
// Avaliar no Google: Place ID ChIJNSxFp3YdUhoRfTZkvtmd5ts, confirmado — o CID já no site
// (15845525897477371517) está dentro deste Place ID, e skip.menu liga-o a
// maps/place/?q=place_id:ChIJNSxFp3YdUhoRfTZkvtmd5ts (Chef Huseyin, W17, 925 918 468).
// Para trocar o destino, altere só esta constante.
const GOOGLE_REVIEW = 'https://search.google.com/local/writereview?placeid=ChIJNSxFp3YdUhoRfTZkvtmd5ts';
const minKz = (c) => Math.min(...c.dishes.flatMap((d) => d.prices.map((p) => p.kz)));

/* ---------- Peças partilhadas ---------- */
// Nomes curtos na barra de vidro, para caber numa linha no computador. O título da página fica completo.
const SHORT = { grelhados: 'Grelhados', meze: 'Meze', 'bebidas-quentes': 'Cafés e chá', 'bebidas-frias': 'Bebidas frias' };
function catbar(activeIdx) {
  const items = [{ href: 'ementa.html', title: 'Tudo', idx: 0 }, ...menu.map((c, i) => ({ href: bookHref(c), title: SHORT[c.id] || c.title, idx: i + 1 }))];
  const chips = items.map((it) => `<a class="chip" href="${it.href}" data-idx="${it.idx}"${it.idx === activeIdx ? ' aria-current="page"' : ''}>${esc(it.title)}</a>`).join('\n          ');
  return `      <div class="catbar" data-catbar>
        <nav class="wrap catbar__in glass" aria-label="Páginas da ementa" data-catnav>
          <span class="catbar__thumb" data-thumb aria-hidden="true"></span>
          ${chips}
        </nav>
      </div>
      <script>(function(){var n=document.querySelector("[data-catnav]");if(!n)return;var a=n.querySelector('[aria-current="page"]'),t=n.querySelector("[data-thumb]"),s=window.__cbNav;if(s&&typeof s.sl==="number")n.scrollLeft=s.sl;else if(a)n.scrollLeft=a.offsetLeft-(n.clientWidth-a.offsetWidth)/2;if(a&&t){t.style.width=a.offsetWidth+"px";t.style.transform="translateX("+a.offsetLeft+"px)";t.dataset.on="true";}})();</script>`;
}

function dishLi(c, d, h = 'h3') {
  const id = slug(d.name);
  const search = norm([c.title, d.name, d.desc, ...d.prices.map((p) => p.v)].join(' '));
  const buttons = d.prices.map((p, pi) => {
    const key = `${c.id}:${id}:${pi}`;
    const label = p.v ? `, ${p.v}` : '';
    return `<button type="button" class="add" data-add data-key="${key}" data-name="${esc(d.name)}" data-variant="${esc(p.v)}" data-kz="${p.kz}" data-cat="${c.id}" aria-label="Juntar ${esc(d.name)}${esc(label)}, ${kz(p.kz)}, ao pedido">${p.v ? `<span class="add__label">${esc(p.v)}</span>` : ''}<span class="add__price">${kz(p.kz)}</span><span class="add__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 5v14M5 12h14"/></svg><b data-qty></b></span></button>`;
  }).join('');
  return `<li class="dish" data-dish data-search="${esc(search)}">
              <div class="dish__text"><${h} class="dish__t">${esc(d.name)}</${h}>${d.desc ? `<p>${esc(d.desc)}</p>` : ''}</div>
              <div class="dish__buy${d.prices.length > 1 ? ' dish__buy--two' : ''}">${buttons}</div>
            </li>`;
}

const navLinks = (page) => [
  ['ementa', 'ementa.html', 'Ementa', 0],
  ['casa', page === 'inicio' ? '#casa' : './#casa', 'A casa', -1],
  ['reservar', page === 'inicio' ? '#reservar' : './#reservar', 'Reservar', -1],
  ['onde', page === 'inicio' ? '#onde' : './#onde', 'Onde estamos', -1],
].map(([k, href, t, idx]) => `        <a href="${href}" data-idx="${idx}"${(k === 'ementa' && page !== 'inicio') ? ' aria-current="page"' : ''}>${t}</a>`).join('\n');

const restaurantLd = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Restaurant","name":"Chef Burger","alternateName":["Chef Hüseyin İstanbul Burger","Chef Huseyin Burger & Pizza"],"servesCuisine":["Turca","Hambúrgueres","Pizza","Grelhados","Halal"],"telephone":"+244925918468","image":"https://chef-burger-kilamba.onrender.com/img/og.jpg","address":{"@type":"PostalAddress","streetAddress":"Quarteirão W17, Centralidade do Kilamba","addressLocality":"Kilamba","addressRegion":"Luanda","addressCountry":"AO"},"hasMap":"https://www.google.com/maps?cid=15845525897477371517","acceptsReservations":true,"openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":["Monday","Tuesday","Wednesday","Thursday"],"opens":"08:00","closes":"22:30"},{"@type":"OpeningHoursSpecification","dayOfWeek":["Friday","Saturday","Sunday"],"opens":"08:00","closes":"23:30"}],"sameAs":["https://www.instagram.com/chefburgerao/","https://www.facebook.com/profile.php?id=100083841722074","https://www.tiktok.com/@chefburgerao"],"hasMenu":"https://chef-burger-kilamba.onrender.com/ementa.html"}</script>`;
const sectionLd = (c) => ({ '@type': 'MenuSection', name: c.title, hasMenuItem: c.dishes.map((d) => ({
  '@type': 'MenuItem', name: d.name, ...(d.desc ? { description: d.desc } : {}), suitableForDiet: 'https://schema.org/HalalDiet',
  offers: d.prices.map((p) => ({ '@type': 'Offer', price: p.kz, priceCurrency: 'AOA', ...(p.v ? { name: p.v } : {}) })),
})) });
const menuLd = { '@context': 'https://schema.org', '@type': 'Menu', name: 'Ementa do Chef Burger', inLanguage: 'pt-AO', hasMenuSection: menu.map(sectionLd) };

function page({ name, idx, title, desc, preload = '', ld = '', main, scripts = '' }) {
  const H = name === 'inicio' ? '' : './';
  const ementa = 'ementa.html';
  return base
    .replaceAll('{{PAGE}}', name).replaceAll('{{IDX}}', String(idx))
    .replaceAll('{{TITLE}}', esc(title)).replaceAll('{{DESC}}', esc(desc))
    .replace('{{PRELOAD}}', preload).replace('{{LD}}', ld)
    .replace('{{SIMBOLOS}}', part('simbolos').trimEnd())
    .replace('{{NAVLINKS}}', navLinks(name))
    .replace('{{MAIN}}', main.trimEnd())
    .replace('{{RODAPE}}', part('rodape'))
    .replace('{{PEDIDO}}', part('pedido'))
    .replace('{{SCRIPTS}}', scripts)
    .replace('{{DOCK_EMENTA_CUR}}', name === 'ementa' ? ' aria-current="page"' : '')
    .replaceAll('{{EMENTA}}', ementa).replaceAll('{{H}}', H);
}


/* ---------- Ementa em livro (StPageFlip) ---------- */
// Cada categoria abre numa página com fotografia; os pratos seguem em páginas de papel.
// O peso de cada prato decide quantos cabem numa página (dois preços e descrição longa pesam mais).
function livro() {
  const weight = (d) => 1 + (d.prices.length > 1 ? 0.45 : 0) + (d.desc && d.desc.length > 60 ? 0.3 : 0);
  const pages = [];
  pages.push(`<div class="page page--cover" data-density="hard"><div class="page__in">
          <p class="cover__brand"><span class="brand__chef">Chef</span><span class="brand__burger">Burger</span></p>
          <p class="cover__t">Ementa</p>
          <p class="cover__s">${total} pratos turcos, 100% halal · Quarteirão W17, Kilamba</p>
          <p class="cover__hint" aria-hidden="true">Arraste a página <svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg></p>
        </div></div>`);
  menu.forEach((c, ci) => {
    const chunks = []; let cur = [], w = 0, cap = 3.3;
    c.dishes.forEach((d) => { const dw = weight(d); if (cur.length && w + dw > cap) { chunks.push(cur); cur = []; w = 0; cap = 5.6; } cur.push(d); w += dw; });
    if (cur.length) chunks.push(cur);
    chunks.forEach((ch, k) => {
      const head = k === 0
        ? `<figure class="page__pic"><img src="${c.img}" srcset="${c.img.replace(".webp", "-480.webp")} 480w, ${c.img} 800w" sizes="(max-width: 899px) calc(100vw - 24px), 450px" alt="" width="800" height="800" loading="lazy" decoding="async"></figure><h3 class="page__t">${esc(c.title)}</h3>${c.intro ? `<p class="page__intro">${esc(c.intro)}</p>` : ''}`
        : `<p class="page__run">${esc(c.title)} <span>${k + 1}/${chunks.length}</span></p>`;
      pages.push(`<div class="page" data-cat-id="${c.id}"${k === 0 ? ` data-cat-start="${ci + 1}"` : ''}><div class="page__in">
          ${head}
          <ul class="page__dishes" role="list">
            ${ch.map((d) => dishLi(c, d, 'h4')).join('\n            ')}
          </ul>
          <p class="page__no" aria-hidden="true"></p>
        </div></div>`);
    });
  });
  if (pages.length % 2) pages.push(`<div class="page page--note"><div class="page__in"><p class="page__t">Bom apetite.</p><p class="page__intro">Toque no preço para juntar ao pedido. O pedido segue pelo WhatsApp e a equipa responde a confirmar.</p></div></div>`);
  pages.push(`<div class="page page--cover page--back" data-density="hard"><div class="page__in">
          <p class="cover__brand"><span class="brand__chef">Chef</span><span class="brand__burger">Burger</span></p>
          <p class="cover__s">Quarteirão W17, Centralidade do Kilamba · +244 925 918 468 · @chefburgerao</p>
        </div></div>`);
  return `    <section class="book-sec" id="livro" aria-labelledby="livro-t" data-book-sec>
      <div class="wrap book-sec__head">
        <h2 id="livro-t">Folhear a ementa</h2>
        <p>Arraste a página com o dedo, ou toque na borda dela ou nas setas. O preço junta o prato ao pedido.</p>
      </div>
      <div class="book-stage" data-book-stage>
        <div class="flipbook" data-book>
        ${pages.join('\n        ')}
        </div>
      </div>
      <div class="wrap book-ctl">
        <button type="button" class="book-ctl__b" data-book-prev aria-label="Página anterior"><svg class="ic ic--back" aria-hidden="true"><use href="#i-arrow"/></svg></button>
        <p class="book-ctl__where" data-book-where aria-live="polite">Capa</p>
        <button type="button" class="book-ctl__b" data-book-next aria-label="Página seguinte"><svg class="ic" aria-hidden="true"><use href="#i-arrow"/></svg></button>
      </div>
    </section>
`;
}

const out = {};

/* ---------- Início ---------- */
const cards = menu.map((c, i) => `        <li class="card"><a href="${bookHref(c)}" data-idx="0">
          <figure class="card__pic"><img src="${c.img}" srcset="${c.img.replace(".webp", "-480.webp")} 480w, ${c.img} 800w" sizes="(max-width: 639px) 50vw, 280px" alt="${esc(c.alt)}" width="800" height="800" loading="lazy" decoding="async"></figure>
          <span class="card__t">${esc(c.title)}</span>
          <span class="card__m">${pratos(c.dishes.length)} · desde ${kz(minKz(c))}</span>
        </a></li>`).join('\n');
out['index.html'] = page({
  name: 'inicio', idx: -1,
  title: 'Chef Burger · Hambúrgueres turcos halal no Kilamba',
  desc: 'Hambúrgueres, grelhados e pizzas turcas, 100% halal, do chef Hüseyin Daştan, no Quarteirão W17 do Kilamba. Ementa com preços em kwanzas, pedido pelo WhatsApp e reserva de mesa.',
  preload: `  <link rel="preload" href="video/hero.webp" as="image" media="(min-width: 640px)" fetchpriority="high">\n  <link rel="preload" href="video/hero-phone.webp" as="image" media="(max-width: 639px)" fetchpriority="high">`,
  ld: '  ' + restaurantLd,
  main: part('inicio-hero') + part('onde') + part('casa')
    + part('inicio-ementa').replace('{{TOTAL}}', String(total)).replace('{{CATBAR}}', catbar(null)).replace('{{CARTOES}}', cards)
    + part('frase') + part('reservar'),
});

/* ---------- A ementa: o livro, aberto logo ---------- */
out['ementa.html'] = page({
  name: 'ementa', idx: 0,
  title: 'Ementa · Chef Burger, Kilamba',
  desc: `Os ${total} pratos do Chef Burger com o preço da carta em kwanzas: hambúrgueres, pizzas, grelhados turcos, faita, meze, matabicho, sobremesas e bebidas. Pedido pelo WhatsApp.`,
  ld: `  <script type="application/ld+json">${JSON.stringify(menuLd)}</script>`,
  scripts: '  <script src="js/vendor/page-flip.browser.js" defer></script>\n  <script src="js/livro.js" defer></script>\n',
  main: `${catbar(0)}
${livro()}
    <p class="wrap book-review">
      <a class="btn glass book-review__btn" href="${GOOGLE_REVIEW}" target="_blank" rel="noopener">
        <svg class="book-review__g" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Avaliar no Google
      </a>
    </p>
`,
});

/* ---------- Links antigos: as páginas de categoria reencaminham para o livro ---------- */
// location.replace não deixa a página antiga no histórico: o Voltar sai do livro para onde se estava.
const stub = (c) => `<!DOCTYPE html>
<html lang="pt-AO">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(c.title)} · Ementa do Chef Burger</title>
  <meta name="robots" content="noindex, follow">
  <link rel="canonical" href="https://chef-burger-kilamba.onrender.com/${bookHref(c)}">
  <meta http-equiv="refresh" content="0; url=${bookHref(c)}">
  <script>location.replace(${JSON.stringify(bookHref(c))});</script>
</head>
<body style="font-family: system-ui, sans-serif; padding: 24px; background: #f4efe6; color: #141518;">
  <p><a href="${bookHref(c)}">${esc(c.title)}: abrir a ementa do Chef Burger</a></p>
</body>
</html>
`;
menu.forEach((c) => { out[file(c)] = stub(c); });

const precos = {};
menu.forEach((c) => {
  c.dishes.forEach((d) => {
    const id = slug(d.name);
    d.prices.forEach((pr, pi) => { precos[`${c.id}:${id}:${pi}`] = { nome: d.name, variante: pr.v || '', kz: pr.kz }; });
  });
});
const apiDir = path.resolve(root, '..', 'chef-burger-api');
fs.mkdirSync(apiDir, { recursive: true });
fs.writeFileSync(path.join(apiDir, 'precos.json'), JSON.stringify(precos, null, 2) + '\n');

for (const [f, html] of Object.entries(out)) fs.writeFileSync(path.join(root, f), html);
console.log(`${Object.keys(out).length} ficheiros: ${Object.keys(out).join(', ')} · ${total} pratos em ${menu.length} categorias`);
