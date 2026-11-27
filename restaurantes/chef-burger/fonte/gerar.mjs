// Gera as páginas do site a partir de fonte/menu.json, fonte/base.html e fonte/partes/.
// Uso: node fonte/gerar.mjs   (a partir de restaurantes/chef-burger)
// O site publicado não precisa deste passo: os .html já vão gerados no repositório.
//
// Páginas (a ordem decide a direção da transição: maior = desliza da direita):
//   index.html            início (-1)
//   ementa.html           a ementa em livro, que se folheia com o dedo (0)
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
const pratos = (n) => n + (n === 1 ? ' prato' : ' pratos');

const total = menu.reduce((n, c) => n + c.dishes.length, 0);
const file = (c) => `${c.id}.html`;
const bookHref = (c) => `ementa.html#livro-${c.id}`;

/* ---------- Peças partilhadas ---------- */
// Nomes curtos na barra de vidro, para caber numa linha no computador. O título da página fica completo.
const SHORT = { grelhados: 'Grelhados', meze: 'Meze', 'bebidas-quentes': 'Cafés e chá', 'bebidas-frias': 'Bebidas frias' };
function catbar(activeIdx) {
  const items = [{ href: 'ementa.html', title: 'Tudo', idx: 0 }, ...menu.map((c, i) => ({ href: bookHref(c), title: SHORT[c.id] || c.title, idx: i + 1 }))];
  const chips = items.map((it) => `<a class="chip" href="${it.href}" data-idx="${it.idx}"${it.idx === activeIdx ? ' aria-current="page"' : ''}>${esc(it.title)}</a>`).join('\n          ');
  return `      <div class="catbar" data-catbar>
        <nav class="wrap catbar__in glass" aria-label="Capítulos da ementa" data-catnav>
          <span class="catbar__thumb" data-thumb aria-hidden="true"></span>
          ${chips}
        </nav>
      </div>
      <script>(function(){var n=document.querySelector("[data-catnav]");if(!n)return;var a=n.querySelector('[aria-current="page"]'),t=n.querySelector("[data-thumb]"),s=window.__cbNav;if(s&&typeof s.sl==="number")n.scrollLeft=s.sl;else if(a)n.scrollLeft=a.offsetLeft-(n.clientWidth-a.offsetWidth)/2;if(a&&t){t.style.width=a.offsetWidth+"px";t.style.transform="translateX("+a.offsetLeft+"px)";t.dataset.on="true";}})();</script>`;
}

const navLinks = (page) => [
  ['ementa', 'ementa.html', 'Ementa', 0],
  ['casa', page === 'inicio' ? '#casa' : './#casa', 'A casa', -1],
  ['reservar', page === 'inicio' ? '#reservar' : './#reservar', 'Reservar', -1],
  ['onde', page === 'inicio' ? '#onde' : './#onde', 'Onde estamos', -1],
].map(([k, href, t, idx]) => `        <a href="${href}" data-idx="${idx}"${(k === 'ementa' && page !== 'inicio') ? ' aria-current="page"' : ''}>${t}</a>`).join('\n');

const restaurantLd = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Restaurant","name":"Chef Burger","alternateName":["Chef Hüseyin İstanbul Burger","Chef Huseyin Burger & Pizza"],"servesCuisine":["Turca","Hambúrgueres","Pizza","Grelhados","Halal"],"telephone":"+244925918468","image":"https://chef-burger-kilamba.onrender.com/img/og.jpg","address":{"@type":"PostalAddress","streetAddress":"Quarteirão W17, Centralidade do Kilamba","addressLocality":"Kilamba","addressRegion":"Luanda","addressCountry":"AO"},"hasMap":"https://www.google.com/maps?cid=15845525897477371517","acceptsReservations":true,"openingHoursSpecification":[{"@type":"OpeningHoursSpecification","dayOfWeek":["Monday","Tuesday","Wednesday","Thursday"],"opens":"08:00","closes":"22:30"},{"@type":"OpeningHoursSpecification","dayOfWeek":["Friday","Saturday","Sunday"],"opens":"08:00","closes":"23:30"}],"sameAs":["https://www.instagram.com/chefburgerao/","https://www.facebook.com/profile.php?id=100083841722074","https://www.tiktok.com/@chefburgerao"],"hasMenu":"https://chef-burger-kilamba.onrender.com/ementa.html"}</script>`;
const sectionLd = (c) => ({ '@type': 'MenuSection', name: c.title, hasMenuItem: c.dishes.map((d) => ({ '@type': 'MenuItem', name: d.name, suitableForDiet: 'https://schema.org/HalalDiet' })) });
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
    .replace('{{SCRIPTS}}', scripts)
    .replace('{{DOCK_EMENTA_CUR}}', name === 'ementa' ? ' aria-current="page"' : '')
    .replaceAll('{{EMENTA}}', ementa).replaceAll('{{H}}', H);
}


/* ---------- Ementa em livro (StPageFlip) ---------- */
// Só os nomes dos pratos, em letra grande. Aqui sai um capítulo por página (é o que se vê sem JavaScript
// ou com movimento reduzido: uma lista de nomes). js/livro.js mede o ecrã e reparte cada capítulo
// pelas folhas que forem precisas, com o título repetido no topo das seguintes.
function livro() {
  const pages = [];
  pages.push(`<div class="page page--cover" data-density="hard"><div class="page__in">
          <p class="cover__brand"><span class="brand__chef">Chef</span><span class="brand__burger">Burger</span></p>
          <p class="cover__t">Ementa</p>
          <p class="cover__s">${total} pratos turcos, 100% halal · Quarteirão W17, Kilamba</p>
        </div></div>`);
  menu.forEach((c, ci) => {
    pages.push(`<div class="page" data-cat-id="${c.id}" data-cat-start="${ci + 1}" data-cat-title="${esc(c.title)}"><div class="page__in">
          <figure class="page__pic"><img src="${c.img}" alt="" width="800" height="800" loading="lazy" decoding="async"></figure><h2 class="page__t">${esc(c.title)}</h2>
          <ul class="page__dishes" role="list">
            ${c.dishes.map((d) => `<li>${esc(d.name)}</li>`).join('\n            ')}
          </ul>
        </div></div>`);
  });
  pages.push(`<div class="page page--note"><div class="page__in"><p class="page__t">Bom apetite.</p><p class="page__intro">Pedidos pelo WhatsApp, +244 925 918 468. Para levantar no W17 ou para entrega em casa.</p></div></div>`);
  pages.push(`<div class="page page--cover page--back" data-density="hard"><div class="page__in">
          <p class="cover__brand"><span class="brand__chef">Chef</span><span class="brand__burger">Burger</span></p>
          <p class="cover__s">Quarteirão W17, Centralidade do Kilamba · +244 925 918 468 · @chefburgerao</p>
        </div></div>`);
  return `    <section class="book-sec" id="livro" aria-labelledby="livro-t" data-book-sec>
      <h1 class="sr" id="livro-t">Ementa do Chef Burger</h1>
      <div class="book-stage" data-book-stage>
        <div class="flipbook" data-book>
        ${pages.join('\n        ')}
        </div>
      </div>
    </section>
`;
}

const out = {};

/* ---------- Início ---------- */
const cards = menu.map((c, i) => `        <li class="card"><a href="${bookHref(c)}" data-idx="0">
          <figure class="card__pic"><img src="${c.img}" alt="${esc(c.alt)}" width="800" height="800" loading="lazy" decoding="async"></figure>
          <span class="card__t">${esc(c.title)}</span>
          <span class="card__m">${pratos(c.dishes.length)}</span>
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

/* ---------- A ementa: só o livro ---------- */
out['ementa.html'] = page({
  name: 'ementa', idx: 0,
  title: 'Ementa · Chef Burger, Kilamba',
  desc: `Os ${total} pratos do Chef Burger num livro que se folheia com o dedo: hambúrgueres, pizzas, grelhados turcos, faita, meze, matabicho, sobremesas e bebidas. Pedido pelo WhatsApp.`,
  ld: `  <script type="application/ld+json">${JSON.stringify(menuLd)}</script>`,
  scripts: '  <script src="js/vendor/page-flip.browser.js" defer></script>\n  <script src="js/livro.js" defer></script>\n',
  main: `${catbar(0)}
${livro()}`,
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

for (const [f, html] of Object.entries(out)) fs.writeFileSync(path.join(root, f), html);
console.log(`${Object.keys(out).length} ficheiros: ${Object.keys(out).join(', ')} · ${total} pratos em ${menu.length} categorias`);
