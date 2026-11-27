# Notas de desenho — Chef Burger (versão 3)

A versão anterior (fundo carvão, «folha de ementa em papel», Big Shoulders + Literata) foi recusada pelo cliente: «ficou horrível». Esta é uma substituição completa do mundo visual, não um retoque.

## Direção: «Touro vermelho em osso»

O site parte da própria casa: o logótipo é uma caveira de touro vermelha com a palavra BURGER numa grotesca larga e pesada, o balcão é ardósia escura com néon vermelho e as almofadas são kilim turco. Daí saem três decisões:

- **Fundo osso claro (`#f4efe6`), tinta ardósia (`#141518`) e um só vermelho de touro (`#c41e2a`)**. O claro foi escolhido pela cena de uso (telemóvel ao sol, em Luanda) e porque as fotografias de comida, escuras e quentes, saltam do papel como montras. O vermelho fica só na ação principal, no anel de foco, no estado «aberto» e numa única faixa de marca no fecho.
- **Uma só família, Archivo variável (largura 62–125, peso 100–900)**. Os títulos vão largos e pesados (largura 118, peso 800, tracking negativo), a ecoar o BURGER do logótipo. O texto corrido fica na largura normal, 400/500. Números da ementa em algarismos tabulares.
- **Fotografia a mandar**: hero de fotografia inteira sem nada por cima, um capítulo de fotografias a ecrã inteiro, uma foto quadrada por categoria e uma fotografia de ponta a ponta. Fotos de referência Unsplash até chegarem as do Instagram (ver `img/README.md`).

O vidro (Liquid Glass) aparece **só em barras e botões**: barra de topo, barra de categorias, doca do telemóvel e o botão de pedido. Cartões, secções e fotografias são tinta lisa.

## Plano da página

1. **Hero** — fotografia inteira do hambúrguer duplo com cebola caramelizada; por baixo, o H1 «Hambúrgueres turcos halal, no Kilamba», o estado de agora (aberto/fechado, calculado na hora de Luanda) e dois botões.
2. **Onde estamos** — momento de tipo: «W17» gigante (o quarteirão), horário com o dia de hoje marcado, contactos e mapa.
3. **A casa** — momento `photo-chapters`: quatro capítulos (hambúrgueres, grelhados, pizzas, matabicho e çay), cada fotografia descoberta de baixo para cima enquanto a secção fica presa.
4. **Ementa** — 94 pratos em 10 categorias, pesquisa, barra de categorias em vidro com indicador que desliza em mola; o botão de preço transforma-se num contador − 1 + ao juntar.
5. **Frase** — momento `word-highlight` com a frase da própria casa, «Um pedacinho autêntico da Turquia em Angola», seguida de uma fotografia de ponta a ponta.
6. **Reservar mesa** — formulário curto com uma fotografia ao lado; a mensagem segue para o WhatsApp.
7. **Fecho** — faixa vermelha de marca com a ação de pedir, depois o rodapé com morada, horário e contactos.

O pedido abre numa folha (sheet) que sobe de baixo no telemóvel e entra pela direita no computador.

## Regras aplicadas, por skill

### taste-skill (tasteskill 2.5)
- Tipo de negócio: **place** (`<html data-type="place">`, metas `page-type`, `site-kind`, `page-kind`).
- Distribuição tirada com os scripts do kit, não por gosto: `moments.mjs pick --page place --count 2` deu `photo-chapters` + `word-highlight`; a linha de partes deu `nav-split`, `footer-visit`, ritmo `colour-band`, botões `arrow`, composição da casa `bleed`, momento de tipo `address`.
- Paleta: o `start.mjs deal` propôs verde/chocolate e Garamond; ficou de lado porque o cliente tem cores próprias (o touro vermelho e a ardósia do balcão). A regra do kit para isso é `start.mjs brand` com as cores do cliente, foi o que se seguiu.
- Hero de *place*: fotografia inteira por baixo da barra, sem texto, sem véu e sem gradiente por cima; as palavras ficam no fundo, por baixo. Entra uma vez ao carregar.
- Sem legendas debaixo das fotos; créditos numa só linha do rodapé. Fotografias quadradas, de cantos retos.
- Margens iguais: uma só `.wrap` (`min(100% - 2*gut, 1240px)`) da barra ao rodapé.
- Camada de hover: foto com zoom 1.03 dentro da moldura, botões que sobem e afundam ao carregar, sublinhados que se desenham, setas que andam 3px. Só com `(hover: hover) and (pointer: fine)`.
- Nada aparece com fade ao fazer scroll. Só os dois momentos se mexem com o scroll, e cada um dentro da sua secção.
- Cada prato com preço real da carta; nada inventado (sem avaliações, sem taxa de entrega, sem tamanho de pizza, que a carta não publica).
- **Desvios conscientes**: o pedido do cliente pede vidro nas barras (o kit proíbe barras translúcidas num *place*) e os telefones reais (o kit pede `.example`); a ementa de 94 pratos não cabe em «uma secção por ecrã» e ocupa várias.

### Impeccable
- Modo **Persuade**: a ação (juntar ao pedido) funciona no próprio sítio, não é um link para outro lado.
- Redesign: verdade do produto mantida (ementa, preços, horário, contactos, funções), mundo visual antigo tratado como anti-referência.
- Proibições cumpridas: nenhum eyebrow/kicker por cima de títulos, nenhuma fila de métricas, nenhum texto em gradiente, nenhuma barra lateral colorida em caixas, nenhuma sombra dura, nenhum emoji como ícone (ícones SVG desenhados com traço único de 1.75).
- Contraste verificado: tinta 15.9:1, cinzento 6.0:1, vermelho sobre osso 5.1:1, branco sobre vermelho 5.9:1.
- Superfícies do browser com a marca: seleção de texto, caret, anel de foco, barra de scroll, `accent-color`.
- Estados: hover, ativo, foco, vazio (pesquisa sem resultados, pedido vazio), erro por campo, desativado.
- Tipo: medida até 65ch, display até 6rem, tracking mínimo −0.04em, `text-wrap: balance` nos títulos.

### apple-design
- Resposta no `pointerdown`: botões afundam para `scale(0.97)` no toque, em 120ms.
- Folha do pedido: arrasto 1:1 com o dedo, respeitando o ponto onde se agarrou, com `setPointerCapture`; elástico de borda (`rubberband` da Apple, constante 0.55); ao largar, projeção de momento (`decelerationRate 0.998`) para decidir fechar ou ficar, e a velocidade do dedo passa para a mola.
- Molas: amortecimento 1.0 por omissão (abrir/fechar por botão, indicador das categorias), 0.8 só depois de um arrasto com força.
- Materiais: barras em vidro com blur 20px + saturação 180% e borda superior clara; o pedido escurece o fundo (tarefa modal).
- `prefers-reduced-motion`, `prefers-reduced-transparency` e `prefers-contrast` tratados.

### emil-design-eng / animate / gestures / mobile-native
- Curvas próprias: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`. Nunca `ease-in`, nunca `transition: all`, nunca `scale(0)`.
- Animações de UI abaixo de 300ms; só folha e entrada do hero passam disso.
- Entrada do hero: uma vez, linhas a subir 14px com blur de 6px → 0, 60–80ms entre elas.
- Fecho dismiss por distância **ou** velocidade (flick > 0.4 px/ms, depois de 24px).
- Base móvel: `viewport-fit=cover`, `100svh` no hero, inputs a 16px, `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent`, `env(safe-area-inset-bottom)` na doca, `theme-color` por esquema, sem `user-scalable=no`.

## Versão 4: páginas, barra de vidro, folha e vídeo

- **Páginas em vez de uma página só.** Ordem: início (-1), ementa (0), categorias (1–10). A ordem decide a direção da transição.
- **Barra de vidro = navegação** (Liquid Glass só em barras e botões). Indicador escuro com mola (amortecimento 0,82, resposta 0,38 s); responde no toque, antes de a página seguinte chegar. No início não há item ativo: o indicador nasce no centro do item tocado.
- **Folha (v4, substituída na v5 pelo esfolhar)** (apple-design §7, «entra e sai pelo mesmo caminho»; emil choreograph «direction-aware steps»): para a frente, a página nova entra a 100% pela direita com sombra no bordo, a antiga recua 30% e escurece; para trás, o inverso. Mola criticamente amortecida, resposta 0,36 s, amostrada em `linear()` (520 ms). Topo, doca e barra têm nome próprio na transição e não deslizam. Entre categorias o indicador viaja à parte com um ressalto pequeno (tipo `within`); de e para o início viaja dentro da barra.
- **Sem View Transitions entre documentos:** o `main` entra 28 px de lado em 420 ms. **Movimento reduzido:** esbatimento de 180 ms, sem vídeo.
- **Vídeo:** imagem fixa por baixo (é o LCP), vídeo por cima com `opacity` quando começa a tocar; só toca à vista.

## Versão 5: esfolhar

- Entre páginas, a folha atual vira pela lombada (bordo esquerdo): `rotateY(0 → -90deg)` com a perspetiva no `::view-transition-image-pair(root)` (ponto de fuga no centro do ecrã, `max(2200px, 190vw)`), escurece a meio da volta e some no fim; a página de baixo sai da sombra (`brightness .62 → 1`). Para trás, a folha anterior volta da esquerda e pousa por cima.
- Mola criticamente amortecida, resposta 0,5 s, amostrada em `linear()` durante 640 ms. Só transform, opacity e filter; sombra fixa (não animada).
- Sem View Transitions entre documentos: meia volta curta no `main` (460 ms). Movimento reduzido: esbatimento de 120 ms.

## v5 — Ementa em livro (folha de papel a sério)

- `ementa.html#livro`: a ementa é um livro que se folheia com o dedo. Arrastar do canto ou da borda dobra a folha em tempo real (sombra na dobra, gradiente no verso, sombra por baixo); largar depois do meio completa a viragem, antes disso a folha volta. Tocar nas bordas ou nas setas também vira.
- Motor: StPageFlip 2.0.7 (MIT), em `js/vendor/` sem CDN. Remendo único: `checkTarget` usa `closest()`, para o toque no preço (button > span) juntar ao pedido em vez de virar a folha. Ver `js/vendor/README.md`.
- Telemóvel: uma página (largura até 440 px; em ecrãs estreitos a página cresce em altura para não cortar pratos). Computador: duas páginas lado a lado, 450×621 cada.
- Capa e contracapa duras, em vermelho touro. Cada categoria abre com foto, título e introdução; as páginas seguintes têm cabeçalho corrido "Categoria k/n". Os pratos são os mesmos itens (mesmos botões, mesma chave) da lista.
- A barra de vidro, em `ementa.html`, abre o livro na primeira página da categoria; nas páginas de categoria continua a navegar como antes. No início há o botão "Folhear a ementa".
- Movimento reduzido: sem dobra; uma página (ou um par no computador) de cada vez, troca por esbatimento curto.
- Por baixo do livro continua "A ementa toda, em lista", com a pesquisa.
