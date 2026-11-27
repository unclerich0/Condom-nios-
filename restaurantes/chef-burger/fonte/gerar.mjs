// Gera index.html a partir de fonte/menu.json e fonte/pagina.html.
// Uso: node fonte/gerar.mjs   (a partir de restaurantes/chef-burger)
// O site publicado não precisa deste passo: index.html já vai gerado no repositório.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const menu = JSON.parse(fs.readFileSync(path.join(here, 'menu.json'), 'utf8'));
const tpl = fs.readFileSync(path.join(here, 'pagina.html'), 'utf8');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kz = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' Kz';
const slug = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i');

const total = menu.reduce((n, c) => n + c.dishes.length, 0);

const chips = menu.map((c) => `<a class="chip" href="#cat-${c.id}" data-chip="cat-${c.id}">${esc(c.title)}</a>`).join('\n          ');

const cats = menu.map((c, ci) => {
  const dishes = c.dishes.map((d) => {
    const id = slug(d.name);
    const search = norm([c.title, d.name, d.desc, ...d.prices.map((p) => p.v)].join(' '));
    const buttons = d.prices.map((p, pi) => {
      const key = `${c.id}:${id}:${pi}`;
      const label = p.v ? `, ${p.v}` : '';
      return `<button type="button" class="add" data-add data-key="${key}" data-name="${esc(d.name)}" data-variant="${esc(p.v)}" data-kz="${p.kz}" data-cat="${c.id}" aria-label="Juntar ${esc(d.name)}${esc(label)}, ${kz(p.kz)}, ao pedido">${p.v ? `<span class="add__label">${esc(p.v)}</span>` : ''}<span class="add__price">${kz(p.kz)}</span><span class="add__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 5v14M5 12h14"/></svg><b data-qty></b></span></button>`;
    }).join('');
    return `<li class="dish" data-dish data-search="${esc(search)}">
              <div class="dish__text"><h4>${esc(d.name)}</h4>${d.desc ? `<p>${esc(d.desc)}</p>` : ''}</div>
              <div class="dish__buy${d.prices.length > 1 ? ' dish__buy--two' : ''}">${buttons}</div>
            </li>`;
  }).join('\n            ');
  return `<section class="cat" id="cat-${c.id}" data-cat aria-labelledby="t-${c.id}">
        <div class="cat__side">
          <figure class="cat__photo"><img src="${c.img}" alt="${esc(c.alt)}" width="800" height="800" loading="lazy" decoding="async"></figure>
          <div class="cat__head">
            <h3 id="t-${c.id}">${esc(c.title)}</h3>
            ${c.intro ? `<p>${esc(c.intro)}</p>` : ''}
          </div>
        </div>
        <ul class="dishes" role="list">
            ${dishes}
        </ul>
      </section>`;
}).join('\n      ');

const ldMenu = {
  '@context': 'https://schema.org', '@type': 'Menu', '@id': '#ementa', name: 'Ementa do Chef Burger', inLanguage: 'pt-AO',
  hasMenuSection: menu.map((c) => ({ '@type': 'MenuSection', name: c.title, hasMenuItem: c.dishes.map((d) => ({
    '@type': 'MenuItem', name: d.name, ...(d.desc ? { description: d.desc } : {}), suitableForDiet: 'https://schema.org/HalalDiet',
    offers: d.prices.map((p) => ({ '@type': 'Offer', price: p.kz, priceCurrency: 'AOA', ...(p.v ? { name: p.v } : {}) })),
  })) })),
};

const out = tpl
  .replace('{{TOTAL}}', String(total))
  .replaceAll('{{TOTAL}}', String(total))
  .replace('{{CHIPS}}', chips)
  .replace('{{CATEGORIAS}}', cats)
  .replace('{{LD_MENU}}', JSON.stringify(ldMenu));
fs.writeFileSync(path.join(root, 'index.html'), out);
console.log(`index.html: ${total} pratos em ${menu.length} categorias`);
