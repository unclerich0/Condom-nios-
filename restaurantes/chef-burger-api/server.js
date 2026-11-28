// API de pedidos do Chef Burger — quadro da receção em /recepcao.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { openStore, nextOf } from "./store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const PIN = String(process.env.RECECAO_PIN || "1234");
const STATIC_ORIGIN = process.env.STATIC_ORIGIN || "https://chef-burger-kilamba.onrender.com";

const precos = JSON.parse(fs.readFileSync(path.join(here, "precos.json"), "utf8"));

const allow = (origin) =>
  !origin ||
  origin === "https://chef-burger-kilamba.onrender.com" ||
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(cors({
  origin: (origin, cb) => (allow(origin) ? cb(null, true) : cb(new Error("origem não permitida"))),
  credentials: false,
}));

const store = await openStore();
const clients = new Set();

function broadcast(ev, pedido) {
  const line = `event: ${ev}\ndata: ${JSON.stringify(pedido)}\n\n`;
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

app.get("/health", (_req, res) => {
  res.json({ ok: true, storage: store.kind, pratos: Object.keys(precos).length });
});

app.post("/api/pedidos", (req, res) => {
  const v = validar(req.body);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  const pedido = store.criar(v.ok);
  broadcast("novo", pedido);
  res.status(201).json({ id: pedido.id, numero: pedido.numero, total: pedido.total, estado: pedido.estado });
});

app.get("/api/pedidos", exigePin, (_req, res) => {
  res.json({ pedidos: store.listar() });
});

app.patch("/api/pedidos/:id", exigePin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ erro: "Pedido inválido." });
  const want = req.body && req.body.estado;
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
app.use("/recepcao", express.static(path.join(here, "public"), { index: "recepcao.html", extensions: ["html"] }));
app.get("/recepcao", (_req, res) => res.sendFile(path.join(here, "public", "recepcao.html")));

app.use((err, req, res, next) => {
  if (err && /origem/.test(String(err.message))) return res.status(403).json({ erro: "Origem não permitida." });
  if (err) return res.status(400).json({ erro: "Pedido inválido." });
  next();
});

app.listen(PORT, () => {
  console.log(`Chef Burger pedidos em http://127.0.0.1:${PORT}  (armazenamento: ${store.kind})`);
});
