# Chef Burger — proposta de site

Site estático para apresentar ao **Chef Burger** (hamburgueria turca halal, Quarteirão W17, Centralidade do Kilamba, Luanda). Não faz parte da aplicação do condomínio: é uma pasta à parte, sem build e sem servidor.

O site que está no ar em [https://chef-burger-demo.vercel.app/](https://chef-burger-demo.vercel.app/) é uma **demonstração de vendas da Webomarketing** (ligada em [webomarketing.net](https://webomarketing.net/) → Chef Burger → «Abrir o site»). Não é o site oficial do restaurante.

## O que está neste site

Direção visual: **«Touro vermelho em osso»** (ver [DESIGN-NOTES.md](DESIGN-NOTES.md)). Fundo osso, tinta quase preta e o vermelho da caveira de touro do logótipo; tipo Archivo largo e pesado; a comida em fotografia grande, sem nada por cima.

- **Páginas:** início (`index.html`), toda a ementa (`ementa.html`): um livro que se folheia com o dedo (StPageFlip, em `js/vendor/`) e a lista completa com pesquisa e uma página por categoria (`hamburgueres.html`, `pizzas.html`, `grelhados.html`, `faita.html`, `esparguete.html`, `meze.html`, `matabicho.html`, `sobremesas.html`, `bebidas-quentes.html`, `bebidas-frias.html`).
- **Barra de vidro** = navegação da ementa: fica no topo, desliza na horizontal no telemóvel, e o indicador escuro passa de item em item com uma mola.
- **Esfolhar** entre páginas (View Transitions entre documentos): a página atual vira como a folha de uma carta, pela lombada à esquerda, e mostra a seguinte; para trás, a folha volta da esquerda. Sem suporte, meia volta curta ao abrir; com movimento reduzido, só um esbater.
- **Vídeo** no primeiro ecrã e no topo de hambúrgueres, pizzas e grelhados (ver [video/README.md](video/README.md)).
- Hero com vídeo a toda a largura, estado aberto/fechado no fuso de Luanda (`Africa/Luanda`), **Pedir da ementa** e **Reservar mesa**.
- «Onde estamos»: W17 em grande, horário com o dia de hoje marcado, telefones, mapa e WhatsApp.
- «A casa»: quatro capítulos com foto (hambúrgueres, grelhados, pizzas, matabicho e çay).
- Ementa: 94 pratos em 10 categorias, barra de categorias fixa, pesquisa (sem acentos: «cay» encontra Çay), preço em Kz como botão que junta ao pedido.
- Pedido numa folha que se arrasta: quantidades, entrega ou levantamento no W17, nota, pré-visualização e envio para o WhatsApp **+244 925 918 468**.
- Reserva: pessoas, dia (7 dias), hora dentro do horário publicado (08h00–21h30, com 1 hora de antecedência no próprio dia), até 12 pessoas, por WhatsApp.
- Barra inferior em vidro no telemóvel (Ementa, Reservar, Ligar, Pedido).

Nada fica num servidor. O pedido vive no telemóvel (`localStorage`) até a pessoa o enviar.

## Como editar

- **Pratos e preços:** `fonte/menu.json`. Depois: `node fonte/gerar.mjs` (gera as 12 páginas `.html` a partir de `fonte/base.html` e `fonte/partes/`). Não editar os `.html` da raiz à mão.
- **Textos:** `fonte/partes/*.html` (secções do início, rodapé, pedido) e `fonte/gerar.mjs` (páginas da ementa), e voltar a correr o gerador.
- **Estilos e interação:** `css/site.css` e `js/site.js` (sem build).
- **Fotos:** ver [img/README.md](img/README.md).

## Fontes dos dados

| Dado | Fonte |
| --- | --- |
| 94 pratos, 10 categorias, 115 preços em Kz | Ementa de agosto de 2026 em [chef-burger-demo.vercel.app](https://chef-burger-demo.vercel.app/) |
| Horário: segunda a quinta 08h00–22h30; sexta a domingo 08h00–23h30; matabicho 08h00–14h00 | O mesmo site (JSON-LD e página) |
| Reservas online até às 21h30, de 30 em 30 minutos, máximo 12 pessoas, antecedência de 1 hora no próprio dia | Regras do formulário desse site |
| Morada Quarteirão W17, Kilamba; plus code 272G+4V; coordenadas e mapa Google | O mesmo site |
| Telefones +244 925 918 468, +244 925 918 462 e +244 930 877 600 | O mesmo site. O WhatsApp de pedidos é o 468 |
| Instagram @chefburgerao, Instagram do chef, Facebook, TikTok | O mesmo site |
| 4,5 no Google e 278 avaliações | Número que esse site publica. Não é uma leitura em direto |
| Anúncio do Istanbul Döner Kebap no V-10 | Texto desse site. Não é um prato com preço, por isso não entra na ementa |

## O que é exemplo

- **Fotografias.** São referências Unsplash, não fotos do restaurante nem as imagens do site da Webomarketing. A lista, o que cada ficheiro mostra e que pratos cobre está em [img/README.md](img/README.md). Para trocar, grave um ficheiro com o **mesmo nome**.
- **Logótipo.** A marca no cabeçalho é texto (Archivo). Quando a casa enviar o logótipo em vetor, pode entrar no cabeçalho.
- **Tamanho das pizzas.** A carta publicada traz dois preços por pizza e não diz o tamanho. O site mostra os dois valores e diz isso. Não inventámos «média» nem «familiar».
- **Taxa de entrega.** A equipa confirma o valor. Não há número inventado.
- **Descrições em falta** na carta (várias faitas, esparguetes, mezes) ficaram sem texto. Não foram preenchidas.
- **URL pública.** Ainda não há domínio. Título, descrição e Open Graph usam caminhos relativos. Quando o Render der o endereço, pode acrescentar `og:url` e o `url` do JSON-LD.

## O que fica melhor do que o site da Webomarketing

O site deles já tem a ementa certa, pedido por WhatsApp, reservas com página de equipa (PIN) e versão em inglês. Esta proposta não copia isso tudo. O que muda para o cliente:

1. **A comida ocupa o primeiro ecrã.** Fotografia grande, tipo Archivo largo, e o estado aberto/fechado calculado na hora, no fuso de Luanda. No site deles o hero é um cartaz de agência com a mesma informação em todo o lado.
2. **Pedir é um fluxo, não um botão solto.** Barra de categorias que fica visível, pesquisa (incluindo sem acentos: «cay» encontra Çay), quantidades, nota para a cozinha, entrega ou levantamento, e a mensagem do WhatsApp à vista antes de enviar, já com o total.
3. **A reserva não depende de uma API.** Dia, hora só dentro do horário deles (08h00–21h30) e pessoas. Se o servidor deles falhar, o cliente deles cai num plano B. Aqui o plano é o WhatsApp desde o início, e funciona num site estático.
4. **Mais rápido de abrir.** HTML, CSS e JavaScript simples, imagens WebP com `width`/`height` e `loading="lazy"`, fontes em WOFF2. Sem framework.
5. **Telemóvel a sério.** Áreas seguras, botões de 44 px, inputs a 16 px (o iOS não faz zoom), toque sem o flash cinzento, folha do pedido que se arrasta para fechar, e `prefers-reduced-motion`.
6. **A carta lê-se.** Um prato por linha, preço como botão, duas opções quando a carta tem dois preços. O selo halal está no hero e nos dados estruturados, não escondido numa FAQ.
7. **Dá para o dono trocar as fotos sem programador**, pelo nome do ficheiro. O site deles usa imagens pequenas da própria demonstração.

O que o site deles ainda faz e este não: inglês, página da equipa para confirmar reservas, marcar prato esgotado, e as fotos reais da sala. Isso fica para uma segunda conversa, se o restaurante quiser.

## Publicar no Render como site estático

Criar um **serviço novo**. Não usar o serviço da aplicação do condomínio e não publicar a raiz do repositório: a raiz tem o `package.json` do condomínio.

1. No Render: **New → Static Site** e escolher este repositório.
2. **Build command:** `echo "Site estático, sem build"`
3. **Publish directory:** `restaurantes/chef-burger`
4. Variável de ambiente: `SKIP_INSTALL_DEPS` = `true`  
   Sem isto, o Render instala as dependências do `package.json` da raiz (a app do condomínio) e gasta minutos de build à toa.
5. Não é preciso rewrite: cada página é um `.html` na raiz da pasta publicada.
6. Cabeçalhos úteis (Settings → Headers), opcionais:

   | Path | Header | Value |
   | --- | --- | --- |
   | `/img/*` | `Cache-Control` | `public, max-age=86400` |
   | `/video/*` | `Cache-Control` | `public, max-age=86400` |
   | `/fonts/*` | `Cache-Control` | `public, max-age=31536000, immutable` |
   | `/*` | `X-Content-Type-Options` | `nosniff` |

O plano estático do Render tem escalão gratuito (largura de banda e minutos de build contam para o incluído da workspace). Preços atuais: [render.com/pricing](https://render.com/pricing).

Depois do primeiro deploy, o endereço fica `https://<nome>.onrender.com`. As mensagens de WhatsApp funcionam sem mais configuração.

### Exemplo de blueprint, só se for um serviço à parte

Não gravar isto como `render.yaml` na raiz se isso substituir o deploy do condomínio.

```yaml
services:
  - type: web
    runtime: static
    name: chef-burger
    buildCommand: echo "Site estático, sem build"
    staticPublishPath: restaurantes/chef-burger
    envVars:
      - key: SKIP_INSTALL_DEPS
        value: "true"
    headers:
      - path: /fonts/*
        name: Cache-Control
        value: public, max-age=31536000, immutable
      - path: /img/*
        name: Cache-Control
        value: public, max-age=86400
```
