# Notas de desenho — Chef Burger

Direção: montra de grelha à noite (fundo carvão `#14110f`) e uma folha de ementa em papel (`#ementa`, `#f3ecdf`). Letra de tabuleta **Big Shoulders Display** e letra de leitura **Literata**. O chili `#c51b32` fica só nas acções. Fotografias quadradas, sem legenda por baixo.

O `concept-seed` do Impeccable não correu: pedia um `PRODUCT.md` na raiz, e esse ficheiro mudaria o produto do condomínio. A direcção veio do pedido (fotografia, ementa editorial, vidro só em barras e botões, mola, marca turca halal) e do que o detector marcou na versão anterior (creme + Fraunces).

## Regras usadas

### taste-skill
- Sem Inter, Fraunces, gradiente, grelha de cartões, ícones emoji ou legenda debaixo da foto. Crédito Unsplash só no rodapé.
- Fotos quadradas, margens iguais (`--wrap`), um momento de tipo (`#onde-titulo`, até 6rem), entrada do hero uma vez (`data-enter` / `rise`), zoom da foto 1.025 só com rato, botões em `scale(0.97)`.
- Não aplicado de propósito: telefones reais (o pedido exige os números do restaurante); vidro nas barras (o pedido pede Liquid Glass aí); a ementa de 94 pratos não cabe “uma secção por ecrã”; o gate completo do kit não substitui o site de encomendas.

### impeccable
- Sem sobrancelha acima do H1, sem fila de métricas, sem texto em gradiente. `text-wrap: balance` nos títulos e `pretty` nos parágrafos, medida até 68ch.
- Vidro só em `.nav`, `.catbar`, `.dock`, `.btn-glass` e `.price`. O resto é tinta lisa.
- `prefers-reduced-transparency` torna essas superfícies papel sólido.

### apple-design
- Material de vidro limitado ao cromado (barras e botões), não a cartões.
- Arrasto do sheet com a fórmula de elástico da Apple em `site.js` (`overshoot * dim * 0.55`).
- `color-scheme: dark` na página e `light` na ementa e no painel do pedido.

### emil-design-eng
- Mola interrompível no fecho e no arrasto (`springTo`, rigidez 380). Fecho por botão amortecido (damping 40); largar o arrasto com um pouco de ressalto (damping 28).
- Pressão dos botões em 120ms `ease-out`. `prefers-reduced-motion` salta a mola para o fim e tira escala e entrada.

### animate
- Uma entrada, 680ms, `cubic-bezier(0.23, 1, 0.32, 1)`, só no texto do hero. Sem animar cada prato ao scroll.

### gestures
- Sheet a seguir o dedo 1:1, captura de ponteiro, velocidade dos últimos ~90ms. Fecha se passar 38% da altura ou 850 px/s. O véu acompanha o arrasto.

### mobile-native
- Pedido em bottom sheet no telemóvel; painel lateral a partir de 960px, sem puxador.
- `viewport-fit=cover`, `safe-area`, alvos de 44px, inputs a 16px, `100svh`, scroll do body bloqueado com `position: fixed`.

### learn-taste
- As regras acima ficam neste ficheiro. O pedido era redesenhar, por isso o código mudou em vez de parar numa proposta.

## Auditoria Impeccable

Detector em `http://127.0.0.1:8765/` (390×844 e 1440×900) e em `index.html`.

| Passagem | Achado | Correcção |
| --- | --- | --- |
| URL, depois da troca de tipo | `dark-glow` nos três `.btn-primary` (sombra `#c51b32` sobre carvão) | Sombra exterior passou a `rgba(20, 17, 15, 0.28)` |
| `index.html` | `cramped-padding` em `#ementa` | `padding-inline: 1rem` na secção |
| `index.html` | `cramped-padding` em `.catbar` | `padding-inline: 0.75rem` na lista |

Nova passagem: **0 achados** no URL (telemóvel e secretária) e no HTML.

Crítica visual (mesma sessão, não dois subagentes isolados): o hero enche o primeiro ecrã com a foto e os dois botões; a ementa lê-se como folha, não como grelha de cartões; o pedido abre em folha com linhas, quantidades e total. A foto de categoria estava vazia (altura 100% sem altura definida) e passou a `aspect-ratio: 1` na própria imagem. O chili não faz brilho. Cantos dos botões principais são rectos; as pastilhas de preço ficam em vidro, que é o sítio combinado para esse material.
