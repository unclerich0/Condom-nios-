# Chef Burger — API de pedidos e quadro da receção

Serviço web pequeno (Node, Express) para receber os pedidos da ementa e mostrá-los na receção. Destinado a um serviço Render **gratuito** com o nome `chef-burger-pedidos`, em `https://chef-burger-pedidos.onrender.com`.

O site estático (ementa, QR das mesas) continua em `https://chef-burger-kilamba.onrender.com`. Um único QR aponta para `/ementa.html`; o cliente envia o pedido para esta API.

## Arranque

```bash
cd restaurantes/chef-burger-api
npm install
npm start
```

Fica à escuta em `http://127.0.0.1:8787` (ou `$PORT` no Render).

- Quadro da receção: `http://127.0.0.1:8787/recepcao`
- Saúde: `GET /health`

## Variáveis de ambiente

| Variável | Predefinição | Função |
| --- | --- | --- |
| `PORT` | `8787` | Porta HTTP (o Render define-a sozinho). |
| `RECECAO_PIN` | `1234` | PIN da receção (**só para a demonstração**; mude-o no ar). Envia-se no cabeçalho `X-Rececao-Pin` ou, no fluxo SSE, em `?pin=`. |
| `STATIC_ORIGIN` | `https://chef-burger-kilamba.onrender.com` | Origem do site estático, para referência. Em testes locais: `http://127.0.0.1:8765`. |
| `PUBLIC_ORIGIN` | (vazio; no Render usa `RENDER_EXTERNAL_URL`) | Origem pública desta API, também aceite no CORS (o quadro em `/recepcao` faz pedidos a partir desta origem). |
| `CORS_ORIGINS` | (vazio) | Origens extra, separadas por vírgulas. |
| `VAPID_PUBLIC_KEY` | (vazio) | Chave pública VAPID para Web Push. Sem ela, o quadro usa só notificações do sistema enquanto a aba estiver aberta. |
| `VAPID_PRIVATE_KEY` | (vazio) | Chave privada VAPID. **Não a coloque no repositório.** |
| `VAPID_SUBJECT` | `mailto:rececao@chef-burger-pedidos.local` | Contacto obrigatório do Web Push (mailto: ou URL HTTPS). |

## Plano grátis do Render

O disco é **efémero**: os pedidos (e as subscrições de push) desaparecem a cada deploy ou quando a instância muda. O serviço **adormece ao fim de 15 minutos** sem tráfego; o primeiro pedido a seguir pode levar ~50 segundos (o site e o quadro mostram «A ligar…»). Serve para a demonstração. Mais tarde: plano pago e Postgres.

As notificações push **só partem enquanto o serviço está acordado**. No plano grátis isso costuma coincidir com um pedido novo: o `POST /api/pedidos` acorda a instância, e o push é enviado nesse mesmo pedido. Se a receção tiver o quadro aberto, o SSE/polling também mantém o serviço acordado.

## Armazenamento

Tenta `better-sqlite3` (dependência opcional). Se o módulo nativo não compilar no Render, passa a um ficheiro JSON em `data/pedidos.json`. As subscrições Web Push ficam em `data/push-subs.json`. Tudo em `data/`, que não vai no Git.

A lista de preços (`precos.json`) é gerada por `restaurantes/chef-burger/fonte/gerar.mjs`. O total de cada pedido é calculado **no servidor** a partir desta lista; um preço falsificado no cliente é recusado.

## Tipos e estados

- Tipos: `local` (mesa 1–99), `entrega` (nome, telefone, morada), `levantar` (nome, telefone; levantamento no W17).
- Estados: `novo` → `em_preparo` → `servido` (local) / `entregue` (entrega) / `levantado` (levantar) → `fechado`.
- O `PATCH /api/pedidos/:id` aceita o id canónico (`em_preparo`) e também etiquetas como `em preparo`. Sem `estado` (corpo `{}`) avança para o estado seguinte. Pedidos concluídos podem ser **arquivados** («Limpar» / «Limpar concluídos») — saem do quadro mas ficam no histórico do dia. «Fechar mesa» passa todos os pedidos abertos dessa mesa a `fechado`.

O dia dos contadores (total, abertos, em preparo, concluídos, receita em Kz) começa à **00:00 Africa/Luanda**. Pedidos cancelados, se existirem, não entram nas contas.

## CORS

Aceita o site estático (`https://chef-burger-kilamba.onrender.com`), a própria API (`https://chef-burger-pedidos.onrender.com` e `$PUBLIC_ORIGIN` / `$RENDER_EXTERNAL_URL`) e `http://localhost` / `http://127.0.0.1` (qualquer porta). Pedidos sem cabeçalho `Origin` (por exemplo `curl`) também passam. Isto é necessário porque o quadro em `/recepcao` é servido pela API: o navegador envia `Origin: https://chef-burger-pedidos.onrender.com` nos `PATCH`, e essa origem tem de estar autorizada.

## Notificações e PWA

O quadro `/recepcao` é uma PWA instalável (manifesto, ícones da marca, service worker). Há um botão **Ativar notificações** (precisa de um gesto do utilizador):

1. Notificação do sistema (`Notification`) e distintivo no título `(3) Receção`, com som e vibração no telemóvel, enquanto o quadro está aberto.
2. **Web Push** (quando as chaves VAPID estão definidas), para avisar mesmo com a aba em fundo ou fechada.

### iPhone

O Safari no iOS só entrega Web Push a partir do **iOS 16.4**, e só depois de **Adicionar ao ecrã principal** o quadro `/recepcao` (não basta abrir no Safari normal).

### Android e computador

No Chrome (e Chromium) as notificações e o push funcionam no próprio navegador, sem instalar a PWA — embora a instalação também esteja disponível.

