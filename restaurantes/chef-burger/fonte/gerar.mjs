// Gera as páginas do site a partir de fonte/menu.json, fonte/base.html e fonte/partes/.
// Uso: node fonte/gerar.mjs   (a partir de restaurantes/chef-burger)
// O site publicado não precisa deste passo: os .html já vão gerados no repositório.
//
// Páginas (a ordem decide a direção da transição: maior = desliza da direita):
//   index.html            início (-1)
//   ementa.html           toda a ementa com pesquisa (0)
//   <categoria>.html      uma página por categoria (1…10)
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
const minKz = (c) => Math.min(...c.dishes.flatMap((d) => d.prices.map((p) => p.kz)));

// Vídeos curtos (Pexels) no topo de algumas categorias. As outras usam fotografia.
const VIDEOS = {
  hamburgueres: { src: 'video/hamburgueres.mp4', phone: 'video/hamburgueres-phone.mp4', poster: 'video/hamburgueres.webp', posterPhone: 'video/hamburgueres-phone.webp', alt: 'Fatias de queijo a derreter sobre hambúrgueres na grelha' },
  pizzas: { src: 'video/pizzas.mp4', phone: 'video/pizzas-phone.mp4', poster: 'video/pizzas.webp', posterPhone: 'video/pizzas-phone.webp', alt: 'Forno a lenha aceso, com massa à espera junto à boca do forno' },
  grelhados: { src: 'video/grelhados.mp4', phone: 'video/grelhados-phone.mp4', poster: 'video/grelhados.webp', posterPhone: 'video/grelhados-phone.webp', alt: 'Espetadas de frango e pimento sobre brasas vermelhas' },
};

/* ---------- Peças partilhadas ---------- */
// Nomes curtos na barra de vidro, para caber numa linha no computador. O título da página fica completo.
const SHORT = { grelhados: 'Grelhados', meze: 'Meze', 'bebidas-quentes': 'Cafés e chá', 'bebidas-frias': 'Bebidas frias' };
function catbar(activeIdx) {
  const items = [{ href: 'ementa.html', title: 'Tudo', idx: 0 }, ...menu.map((c, i) => ({ href: file(c), title: SHORT[c.id] || c.title, idx: i + 1 }))];
  const chips = items.map((it) => `<a class="chip" href="${it.href}" data-idx="${it.idx}"${it.idx === activeIdx ? ' aria-current="page"' : ''}>${esc(it.title)}</a>`).join('\n          ');
  return `      <div class="catbar" data-catbar>
        <nav class="wrap catbar__in glass" aria-label="Páginas da ementa" data-catnav>
          <span class="catbar__thumb" data-thumb aria-hidden="true"></span>
          ${chips}
        </nav>
      </div>
      <script>(function(){var n=document.querySelector("[data-catnav]");if(!n)return;var a=n.querySelector('[aria-current="page"]'),t=n.querySelector("[data-thumb]"),s=window.__cbNav;if(s&&typeof s.sl==="number")n.scrollLeft=s.sl;else if(a)n.scrollLeft=a.offsetLeft-(n.clientWidth-a.offsetWidth)/2;if(a&&t){t.style.width=a.offsetWidth+"px";t.style.transform="translateX("+a.offsetLeft+"px)";t.dataset.on="true";}})();</script>`;
}

function procura(live) {
  return `        <form class="search" action="ementa.html" method="get" role="search"${live ? ' data-search-form' : ''}>
          <label class="sr" for="q">Procurar na ementa</label>
          <svg class="ic" aria-hidden="true"><use href="#i-search"/></svg>
          <input id="q" name="q" type="search" placeholder="Procurar: köfte, pizza, milkshake…" autocomplete="off" enterkeyhint="search"${live ? ' data-search' : ''}>
        </form>`;
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
  ['ementa', page === 'inicio' ? '#ementa' : 'ementa.html', 'Ementa', 0],
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

function page({ name, idx, title, desc, preload = '', ld = '', main }) {
  const H = name === 'inicio' ? '' : './';
  const ementa = name === 'inicio' ? '#ementa' : 'ementa.html';
  return base
    .replaceAll('{{PAGE}}', name).replaceAll('{{IDX}}', String(idx))
    .replaceAll('{{TITLE}}', esc(title)).replaceAll('{{DESC}}', esc(desc))
    .replace('{{PRELOAD}}', preload).replace('{{LD}}', ld)
    .replace('{{SIMBOLOS}}', part('simbolos').trimEnd())
    .replace('{{NAVLINKS}}', navLinks(name))
    .replace('{{MAIN}}', main.trimEnd())
    .replace('{{RODAPE}}', part('rodape'))
    .replace('{{PEDIDO}}', part('pedido'))
    .replace('{{DOCK_EMENTA_CUR}}', name !== 'inicio' ? ' aria-current="page"' : '')
    .replaceAll('{{EMENTA}}', ementa).replaceAll('{{H}}', H);
}

const out = {};

/* ---------- Início ---------- */
const cards = menu.map((c, i) => `        <li class="card"><a href="${file(c)}" data-idx="${i + 1}">
          <figure class="card__pic"><img src="${c.img}" alt="${esc(c.alt)}" width="800" height="800" loading="lazy" decoding="async"></figure>
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
    + part('inicio-ementa').replace('{{TOTAL}}', String(total)).replace('{{PROCURA}}', procura(false)).replace('{{CATBAR}}', catbar(null)).replace('{{CARTOES}}', cards)
    + part('frase') + part('reservar'),
});

/* ---------- Toda a ementa ---------- */
const allCats = menu.map((c, i) => `      <section class="cat" id="cat-${c.id}" data-cat aria-labelledby="t-${c.id}">
        <div class="cat__side">
          <figure class="cat__photo"><img src="${c.img}" alt="${esc(c.alt)}" width="800" height="800" loading="lazy" decoding="async"></figure>
          <div class="cat__head">
            <h2 id="t-${c.id}"><a href="${file(c)}" data-idx="${i + 1}">${esc(c.title)}</a></h2>
            ${c.intro ? `<p>${esc(c.intro)}</p>` : ''}
            <a class="link-arrow" href="${file(c)}" data-idx="${i + 1}">Página de ${esc(c.title.toLowerCase())}<svg class="ic ic--arrow" aria-hidden="true"><use href="#i-arrow"/></svg></a>
          </div>
        </div>
        <ul class="dishes" role="list">
            ${c.dishes.map((d) => dishLi(c, d)).join('\n            ')}
        </ul>
      </section>`).join('\n');
out['ementa.html'] = page({
  name: 'ementa', idx: 0,
  title: 'Ementa · Chef Burger, Kilamba',
  desc: `Os ${total} pratos do Chef Burger com o preço da carta em kwanzas: hambúrgueres, pizzas, grelhados turcos, faita, meze, matabicho, sobremesas e bebidas. Pedido pelo WhatsApp.`,
  ld: `  <script type="application/ld+json">${JSON.stringify(menuLd)}</script>`,
  main: `${catbar(0)}
    <section class="menu menu--page" aria-labelledby="ementa-t">
      <div class="wrap menu__head">
        <h1 id="ementa-t">Ementa</h1>
        <p>${total} pratos com o preço da carta, em kwanzas. Toque no preço para juntar ao pedido e envie tudo pelo WhatsApp; a equipa responde a confirmar.</p>
${procura(true)}
      </div>
      <div class="wrap menu__body">
      <p class="empty" data-empty hidden>Nada na ementa com esse nome.</p>
${allCats}
      </div>
    </section>
`,
});

/* ---------- Uma página por categoria ---------- */
menu.forEach((c, i) => {
  const idx = i + 1;
  const prev = menu[i - 1], next = menu[i + 1];
  const v = VIDEOS[c.id];
  const media = v
    ? `<picture><source media="(max-width: 639px)" srcset="${v.posterPhone}" width="576" height="720"><img src="${v.poster}" alt="${esc(v.alt)}" width="960" height="540" fetchpriority="high" decoding="async"></picture>
          <video class="media__v" data-video data-src="${v.src}" data-src-phone="${v.phone}" muted loop playsinline disablepictureinpicture preload="none" aria-hidden="true" tabindex="-1"></video>`
    : `<picture><source media="(max-width: 639px)" srcset="${c.img}" width="900" height="900"><img src="img/head-${c.id}.webp" alt="${esc(c.alt)}" width="2000" height="800" fetchpriority="high" decoding="async"></picture>`;
  const pager = `    <nav class="wrap pager" aria-label="Outras páginas da ementa">
      ${prev ? `<a class="pager__a pager__a--prev" href="${file(prev)}" data-idx="${idx - 1}"><small>Anterior</small><span><svg class="ic ic--back" aria-hidden="true"><use href="#i-arrow"/></svg>${esc(prev.title)}</span></a>` : `<a class="pager__a pager__a--prev" href="ementa.html" data-idx="0"><small>Anterior</small><span><svg class="ic ic--back" aria-hidden="true"><use href="#i-arrow"/></svg>Toda a ementa</span></a>`}
      ${next ? `<a class="pager__a pager__a--next" href="${file(next)}" data-idx="${idx + 1}"><small>Seguinte</small><span>${esc(next.title)}<svg class="ic ic--arrow" aria-hidden="true"><use href="#i-arrow"/></svg></span></a>` : `<a class="pager__a pager__a--next" href="./#reservar" data-idx="-1"><small>Depois de comer</small><span>Reservar mesa<svg class="ic ic--arrow" aria-hidden="true"><use href="#i-arrow"/></svg></span></a>`}
    </nav>`;
  out[file(c)] = page({
    name: c.id, idx,
    title: `${c.title} · Ementa do Chef Burger, Kilamba`,
    desc: `${c.title} do Chef Burger: ${pratos(c.dishes.length)}, desde ${kz(minKz(c))}. ${c.intro || ''} Pedido pelo WhatsApp, entrega ou levantamento no W17.`.replace(/\s+/g, ' ').trim(),
    preload: v ? `  <link rel="preload" href="${v.poster}" as="image" media="(min-width: 640px)" fetchpriority="high">\n  <link rel="preload" href="${v.posterPhone}" as="image" media="(max-width: 639px)" fetchpriority="high">` : `  <link rel="preload" href="img/head-${c.id}.webp" as="image" media="(min-width: 640px)" fetchpriority="high">\n  <link rel="preload" href="${c.img}" as="image" media="(max-width: 639px)" fetchpriority="high">`,
    ld: `  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...sectionLd(c) })}</script>`,
    main: `${catbar(idx)}
    <section class="catpage" aria-labelledby="t-${c.id}">
      <figure class="cathero media">
          ${media}
      </figure>
      <header class="wrap cathead">
        <div class="cathead__t"><h1 id="t-${c.id}" style="--w: ${Math.max(...c.title.split(/\s+/).map((w) => w.length))}">${esc(c.title)}</h1></div>
        <div class="cathead__side">
          ${c.intro ? `<p>${esc(c.intro)}</p>` : ''}
          <p class="cathead__meta">${pratos(c.dishes.length)} · desde ${kz(minKz(c))}</p>
        </div>
      </header>
      <div class="wrap">
        <ul class="dishes dishes--page" role="list">
            ${c.dishes.map((d) => dishLi(c, d, 'h2')).join('\n            ')}
        </ul>
      </div>
    </section>
${pager}
`,
  });
});

for (const [f, html] of Object.entries(out)) fs.writeFileSync(path.join(root, f), html);
console.log(`${Object.keys(out).length} páginas: ${Object.keys(out).join(', ')} · ${total} pratos em ${menu.length} categorias`);
