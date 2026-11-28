// API de pedidos do Chef Burger — quadro da receção em /recepcao.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { openStore, nextOf, normEstado, FEITOS, pushSubs } from "./store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const PIN = String(process.env.RECECAO_PIN || "1234");
const STATIC_ORIGIN = process.env.STATIC_ORIGIN || "https://chef-burger-kilamba.onrender.com";
const PUBLIC_ORIGIN = String(process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || "")
  .trim()
  .replace(/\/$/, "");
const EXTRA_ORIGINS = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim().replace(/\/$/, ""))
  .filter(Boolean);

const VAPID_PUBLIC = String(process.env.VAPID_PUBLIC_KEY || "").trim();
const VAPID_PRIVATE = String(process.env.VAPID_PRIVATE_KEY || "").trim();
const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || "mailto:rececao@chef-burger-pedidos.local").trim();

const precos = JSON.parse(fs.readFileSync(path.join(here, "precos.json"), "utf8"));

function allow(origin) {
  if (!origin) return true;
  const o = String(origin).replace(/\/$/, "");
  if (o === "https://chef-burger-kilamba.onrender.com") return true;
  if (o === "https://chef-burger-pedidos.onrender.com") return true;
  if (o === STATIC_ORIGIN.replace(/\/$/, "")) return true;
  if (PUBLIC_ORIGIN && o === PUBLIC_ORIGIN) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return true;
  if (EXTRA_ORIGINS.includes(o)) return true;
  return false;
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(cors({
  origin: (origin, cb) => (allow(origin) ? cb(null, true) : cb(new Error("origem não permitida"))),
  credentials: false,
}));

const store = await openStore();
const subs = pushSubs();
const clients = new Set();

let webpush = null;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush = (await import("web-push")).default;
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  } catch (e) {
    console.warn("web-push indisponível:", e && e.message);
    webpush = null;
  }
}

function broadcast(ev, payload) {
  const line = `event: ${ev}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) { try { res.write(line); } catch (e) { clients.delete(res); } }
}

function pinOk(req) {
  const a = String(req.get("x-rececao-pin") || req.query.pin || "").trim();
  if (!a || a.length !== PIN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(PIN));
}
function exigePin(req, res, next) {
  if (!pinOk(req)) return res.status(401).json({ erro: "PIN inválido." });
  next();
}

function limpar(s, n) { return String(s || "").trim().slice(0, n); }
function telOk(v) { return limpar(v, 20).replace(/\D/g, "").length >= 9; }

function validar(body) {
  if (!body || typeof body !== "object") return { erro: "Pedido em falta." };
  const tipo = body.tipo;
  if (tipo !== "local" && tipo !== "entrega" && tipo !== "levantar") return { erro: "Escolha no local, entrega ou levantar no W17." };
  const raw = Array.isArray(body.items) ? body.items : [];
  if (!raw.length) return { erro: "O pedido está vazio." };
  const items = [];
  let total = 0;
  for (const it of raw) {
    const id = String(it && it.id || "");
    const cardapio = precos[id];
    if (!cardapio) return { erro: "Há um prato que não está na ementa." };
    const qtd = Number(it.qtd);
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 99) return { erro: "A quantidade tem de ser entre 1 e 99." };
    if (it.preco != null && Number(it.preco) !== cardapio.kz) return { erro: "O preço não confere com a ementa." };
    items.push({ id, nome: cardapio.nome, variante: cardapio.variante, qtd, preco: cardapio.kz });
    total += qtd * cardapio.kz;
  }
  const nota = limpar(body.nota, 200);
  if (tipo === "local") {
    const mesa = Number(body.mesa);
    if (!Number.isInteger(mesa) || mesa < 1 || mesa > 99) return { erro: "Indique o número da mesa (1 a 99)." };
    return { ok: { tipo, mesa, nome: "", telefone: "", morada: "", nota, items, total } };
  }
  const nome = limpar(body.nome, 80);
  const telefone = limpar(body.telefone, 20);
  if (nome.length < 2) return { erro: "Escreva o seu nome." };
  if (!telOk(telefone)) return { erro: "Escreva um telefone com pelo menos 9 algarismos." };
  if (tipo === "entrega") {
    const morada = limpar(body.morada, 160);
    if (morada.length < 4) return { erro: "Escreva a morada de entrega." };
    return { ok: { tipo, mesa: null, nome, telefone, morada, nota, items, total } };
  }
  return { ok: { tipo, mesa: null, nome, telefone, morada: "", nota, items, total } };
}

function kz(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " Kz"; }

function textoNovo(p) {
  const prato = (p.items && p.items[0] && p.items[0].nome) || "Pedido";
  const mais = p.items && p.items.length > 1 ? " e mais" : "";
  if (p.tipo === "local") return `Mesa ${p.mesa} · ${prato}${mais} · ${kz(p.total)}`;
  if (p.tipo === "levantar") return `Levantar · ${p.nome || ""} · ${prato}${mais} · ${kz(p.total)}`;
  return `Entrega · ${p.nome || ""} · ${prato}${mais} · ${kz(p.total)}`;
}

async function notificarPush(pedido) {
  if (!webpush) return;
  const payload = JSON.stringify({
    title: "Novo pedido n.º " + pedido.numero,
    body: textoNovo(pedido),
    tag: "pedido-" + pedido.id,
    url: "/recepcao/",
  });
  const lista = subs.listar();
  await Promise.all(lista.map(async (s) => {
    try {
      await webpush.sendNotification(s, payload, { TTL: 60, urgency: "high" });
    } catch (e) {
      const code = e && (e.statusCode || e.status);
      if (code === 404 || code === 410) {
        console.warn("push: inscrição expirada (" + code + "), a remover.");
        subs.remover(s.endpoint);
      } else {
        console.warn("push falhou:", code || (e && e.message));
      }
    }
  }));
}

function idsDoBody(body, fallback) {
  const raw = body && Array.isArray(body.ids) ? body.ids : fallback;
  if (!Array.isArray(raw)) return [];
  return raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    storage: store.kind,
    pratos: Object.keys(precos).length,
    push: Boolean(webpush),
  });
});

app.post("/api/pedidos", (req, res) => {
  const v = validar(req.body);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  const pedido = store.criar(v.ok);
  broadcast("novo", pedido);
  res.status(201).json({ id: pedido.id, numero: pedido.numero, total: pedido.total, estado: pedido.estado });
  notificarPush(pedido).catch((e) => console.warn("push:", e && e.message));
});

app.get("/api/pedidos", exigePin, (_req, res) => {
  res.json({ pedidos: store.listar() });
});

app.patch("/api/pedidos/:id", exigePin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ erro: "Pedido inválido." });
  const wantRaw = req.body && req.body.estado;
  const want = wantRaw == null || wantRaw === "" ? null : normEstado(wantRaw);
  if (wantRaw && !want) return res.status(400).json({ erro: "Estado não reconhecido." });
  const cur = store.obter(id);
  if (!cur) return res.status(404).json({ erro: "Este pedido já não está na lista." });
  const n = nextOf(cur.tipo, cur.estado);
  if (!n) return res.status(409).json({ erro: "Este pedido já está fechado." });
  if (want && want !== n) return res.status(409).json({ erro: "Esse não é o estado seguinte." });
  const r = store.avancar(id);
  if (r.erro) return res.status(409).json({ erro: "Não foi possível atualizar." });
  broadcast("atualizado", r.pedido);
  res.json({ pedido: r.pedido });
});

app.post("/api/pedidos/arquivar", exigePin, (req, res) => {
  let ids = idsDoBody(req.body, null);
  if (!ids.length) {
    ids = store.listar()
      .filter((p) => !p.arquivado && !p.cancelado && FEITOS.has(p.estado))
      .map((p) => p.id);
  }
  const pedidos = store.arquivar(ids);
  for (const p of pedidos) broadcast("atualizado", p);
  res.json({ pedidos, ids: pedidos.map((p) => p.id) });
});

app.post("/api/pedidos/desarquivar", exigePin, (req, res) => {
  const ids = idsDoBody(req.body, []);
  if (!ids.length) return res.status(400).json({ erro: "Indique os pedidos a repor." });
  const pedidos = store.desarquivar(ids);
  for (const p of pedidos) broadcast("atualizado", p);
  res.json({ pedidos, ids: pedidos.map((p) => p.id) });
});

app.post("/api/pedidos/mesa/:mesa/fechar", exigePin, (req, res) => {
  const mesa = Number(req.params.mesa);
  if (!Number.isInteger(mesa) || mesa < 1 || mesa > 99) return res.status(400).json({ erro: "Mesa inválida." });
  const ids = store.listar()
    .filter((p) => p.tipo === "local" && Number(p.mesa) === mesa && !p.arquivado && !p.cancelado && p.estado !== "fechado")
    .map((p) => p.id);
  const pedidos = store.fecharIds(ids);
  for (const p of pedidos) broadcast("atualizado", p);
  res.json({ pedidos, ids: pedidos.map((p) => p.id) });
});

app.get("/api/push/vapid", exigePin, (_req, res) => {
  if (!webpush || !VAPID_PUBLIC) return res.status(404).json({ erro: "Notificações push não estão configuradas." });
  res.json({ publicKey: VAPID_PUBLIC });
});

app.post("/api/push/subscribe", exigePin, (req, res) => {
  const sub = req.body && req.body.subscription ? req.body.subscription : req.body;
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return res.status(400).json({ erro: "Subscrição inválida." });
  }
  if (!subs.guardar(sub)) return res.status(400).json({ erro: "Não foi possível guardar a subscrição." });
  res.status(201).json({ ok: true });
});

app.delete("/api/push/subscribe", exigePin, (req, res) => {
  const sub = req.body && (req.body.subscription || req.body);
  const endpoint = (sub && sub.endpoint) || (req.body && req.body.endpoint);
  if (!endpoint) return res.status(400).json({ erro: "Endpoint em falta." });
  subs.remover(String(endpoint));
  res.json({ ok: true });
});

app.get("/api/pedidos/stream", exigePin, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write("event: hello\ndata: {}\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
});

app.get("/recepcao/config.js", (_req, res) => {
  res.type("js").send(`window.CB_STATIC=${JSON.stringify(STATIC_ORIGIN)};\n`);
});
app.use("/recepcao", express.static(path.join(here, "public"), {
  index: "recepcao.html",
  extensions: ["html"],
  setHeaders(res, filePath) {
    if (filePath.endsWith("sw.js") || filePath.endsWith("service-worker.js")) {
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Service-Worker-Allowed", "/recepcao/");
    }
    if (filePath.endsWith(".html") || filePath.endsWith(".js") || filePath.endsWith("recepcao.js")) {
      res.setHeader("Cache-Control", "no-cache");
    }
    if (filePath.endsWith(".webmanifest") || filePath.endsWith("manifest.json")) {
      res.type("application/manifest+json");
    }
  },
}));
app.get("/recepcao", (_req, res) => res.sendFile(path.join(here, "public", "recepcao.html")));

app.use((err, req, res, next) => {
  if (err && /origem/.test(String(err.message))) return res.status(403).json({ erro: "Origem não permitida." });
  if (err) return res.status(400).json({ erro: "Pedido inválido." });
  next();
});

app.listen(PORT, () => {
  console.log(`Chef Burger pedidos em http://127.0.0.1:${PORT}  (armazenamento: ${store.kind}${webpush ? ", push ligado" : ""})`);
});
