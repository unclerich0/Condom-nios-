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
| `STATIC_ORIGIN` | `https://chef-burger-kilamba.onrender.com` | Origem do site estático, para a letra Archivo no quadro. Em testes locais: `http://127.0.0.1:8765`. |

## Plano grátis do Render

O disco é **efémero**: os pedidos desaparecem a cada deploy ou quando a instância muda. O serviço **adormece ao fim de 15 minutos** sem tráfego; o primeiro pedido a seguir pode levar ~50 segundos (o site mostra «A ligar à cozinha…»). Serve para a demonstração. Mais tarde: plano pago e Postgres.

## Armazenamento

Tenta `better-sqlite3` (dependência opcional). Se o módulo nativo não compilar no Render, passa a um ficheiro JSON em `data/pedidos.json`. Os dois ficam em `data/`, que não vai no Git.

A lista de preços (`precos.json`) é gerada por `restaurantes/chef-burger/fonte/gerar.mjs`. O total de cada pedido é calculado **no servidor** a partir desta lista; um preço falsificado no cliente é recusado.

## Tipos e estados

- Tipos: `local` (mesa 1–99), `entrega` (nome, telefone, morada), `levantar` (nome, telefone; levantamento no W17).
- Estados: `novo` → `em_preparo` → `servido` (local) / `entregue` (entrega) / `levantado` (levantar) → `fechado`.

## CORS

Só aceita o site estático (`https://chef-burger-kilamba.onrender.com`) e `http://localhost` / `http://127.0.0.1` (qualquer porta).
