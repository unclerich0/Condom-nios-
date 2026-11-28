// Persistência: SQLite (better-sqlite3) se o módulo carregar; senão um ficheiro JSON.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
fs.mkdirSync(dir, { recursive: true });

const ESTADOS = new Set(["novo", "em_preparo", "servido", "entregue", "levantado", "fechado"]);
const FEITOS = new Set(["servido", "entregue", "levantado", "fechado"]);

function nextOf(tipo, estado) {
  if (estado === "novo") return "em_preparo";
  if (estado === "em_preparo") {
    if (tipo === "local") return "servido";
    if (tipo === "levantar") return "levantado";
    return "entregue";
  }
  if (estado === "servido" || estado === "entregue" || estado === "levantado") return "fechado";
  return null;
}

function now() { return new Date().toISOString(); }

/** Aceita ids canónicos e etiquetas do quadro («em preparo», «Passar a em preparo», etc.). */
function normEstado(s) {
  if (s == null || s === "") return null;
  let t = String(s).trim().toLowerCase();
  t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  t = t.replace(/^passar a\s+/, "").replace(/^marcar como\s+/, "");
  t = t.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const key = t.replace(/ /g, "_");
  const map = {
    novo: "novo",
    em_preparo: "em_preparo",
    empreparo: "em_preparo",
    servido: "servido",
    entregue: "entregue",
    levantado: "levantado",
    fechado: "fechado",
    fechar: "fechado",
  };
  return map[key] || map[t.replace(/ /g, "")] || null;
}

function normRow(p) {
  if (!p) return null;
  return {
    ...p,
    arquivado: Boolean(p.arquivado),
    cancelado: Boolean(p.cancelado),
    arquivadoEm: p.arquivadoEm || null,
  };
}

function jsonStore() {
  const file = path.join(dir, "pedidos.json");
  let data = { seq: 0, pedidos: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (raw && Array.isArray(raw.pedidos)) data = { seq: Number(raw.seq) || 0, pedidos: raw.pedidos };
  } catch (e) { /* vazio */ }
  const write = () => fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return {
    kind: "json",
    criar(p) {
      data.seq += 1;
      const row = {
        id: data.seq, numero: data.seq, ...p,
        estado: "novo", arquivado: false, cancelado: false, arquivadoEm: null,
        criado: now(), atualizado: now(),
      };
      data.pedidos.push(row);
      write();
      return normRow(row);
    },
    listar() { return data.pedidos.map(normRow); },
    obter(id) { return normRow(data.pedidos.find((p) => p.id === id) || null); },
    avancar(id) {
      const p = data.pedidos.find((x) => x.id === id);
      if (!p) return { erro: "nao_encontrado" };
      if (p.arquivado || p.cancelado) return { erro: "estado" };
      const n = nextOf(p.tipo, p.estado);
      if (!n) return { erro: "estado" };
      p.estado = n;
      p.atualizado = now();
      write();
      return { pedido: normRow(p) };
    },
    fecharIds(ids) {
      const out = [];
      for (const id of ids) {
        const p = data.pedidos.find((x) => x.id === id);
        if (!p || p.arquivado || p.cancelado || p.estado === "fechado") continue;
        p.estado = "fechado";
        p.atualizado = now();
        out.push(normRow(p));
      }
      if (out.length) write();
      return out;
    },
    arquivar(ids) {
      const out = [];
      const t = now();
      for (const id of ids) {
        const p = data.pedidos.find((x) => x.id === id);
        if (!p || p.arquivado || p.cancelado) continue;
        if (!FEITOS.has(p.estado)) continue;
        p.arquivado = true;
        p.arquivadoEm = t;
        p.atualizado = t;
        out.push(normRow(p));
      }
      if (out.length) write();
      return out;
    },
    desarquivar(ids) {
      const out = [];
      for (const id of ids) {
        const p = data.pedidos.find((x) => x.id === id);
        if (!p || !p.arquivado) continue;
        p.arquivado = false;
        p.arquivadoEm = null;
        p.atualizado = now();
        out.push(normRow(p));
      }
      if (out.length) write();
      return out;
    },
  };
}

function sqliteStore(Database) {
  const db = new Database(path.join(dir, "pedidos.db"));
  db.exec(`CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    mesa INTEGER,
    nome TEXT, telefone TEXT, morada TEXT, nota TEXT,
    items TEXT NOT NULL,
    total INTEGER NOT NULL,
    estado TEXT NOT NULL,
    criado TEXT NOT NULL,
    atualizado TEXT NOT NULL
  )`);
  const cols = new Set(db.prepare("PRAGMA table_info(pedidos)").all().map((c) => c.name));
  if (!cols.has("arquivado")) db.exec("ALTER TABLE pedidos ADD COLUMN arquivado INTEGER NOT NULL DEFAULT 0");
  if (!cols.has("cancelado")) db.exec("ALTER TABLE pedidos ADD COLUMN cancelado INTEGER NOT NULL DEFAULT 0");
  if (!cols.has("arquivadoEm")) db.exec("ALTER TABLE pedidos ADD COLUMN arquivadoEm TEXT");
  const parse = (r) => r && normRow({ ...r, items: JSON.parse(r.items), arquivado: Boolean(r.arquivado), cancelado: Boolean(r.cancelado) });
  return {
    kind: "sqlite",
    criar(p) {
      const t = now();
      const info = db.prepare(`INSERT INTO pedidos (numero, tipo, mesa, nome, telefone, morada, nota, items, total, estado, criado, atualizado, arquivado, cancelado, arquivadoEm)
        VALUES (0, @tipo, @mesa, @nome, @telefone, @morada, @nota, @items, @total, 'novo', @t, @t, 0, 0, NULL)`).run({
        tipo: p.tipo, mesa: p.mesa, nome: p.nome, telefone: p.telefone, morada: p.morada, nota: p.nota,
        items: JSON.stringify(p.items), total: p.total, t,
      });
      const id = Number(info.lastInsertRowid);
      db.prepare("UPDATE pedidos SET numero = ? WHERE id = ?").run(id, id);
      return parse(db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id));
    },
    listar() { return db.prepare("SELECT * FROM pedidos ORDER BY id").all().map(parse); },
    obter(id) { return parse(db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id)); },
    avancar(id) {
      const p = parse(db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id));
      if (!p) return { erro: "nao_encontrado" };
      if (p.arquivado || p.cancelado) return { erro: "estado" };
      const n = nextOf(p.tipo, p.estado);
      if (!n) return { erro: "estado" };
      db.prepare("UPDATE pedidos SET estado = ?, atualizado = ? WHERE id = ?").run(n, now(), id);
      return { pedido: parse(db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id)) };
    },
    fecharIds(ids) {
      const out = [];
      const t = now();
      const upd = db.prepare("UPDATE pedidos SET estado = 'fechado', atualizado = ? WHERE id = ?");
      for (const id of ids) {
        const p = parse(db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id));
        if (!p || p.arquivado || p.cancelado || p.estado === "fechado") continue;
        upd.run(t, id);
        out.push(parse(db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id)));
      }
      return out;
    },
    arquivar(ids) {
      const out = [];
      const t = now();
      const upd = db.prepare("UPDATE pedidos SET arquivado = 1, arquivadoEm = ?, atualizado = ? WHERE id = ?");
      for (const id of ids) {
        const p = parse(db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id));
        if (!p || p.arquivado || p.cancelado) continue;
        if (!FEITOS.has(p.estado)) continue;
        upd.run(t, t, id);
        out.push(parse(db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id)));
      }
      return out;
    },
    desarquivar(ids) {
      const out = [];
      const t = now();
      const upd = db.prepare("UPDATE pedidos SET arquivado = 0, arquivadoEm = NULL, atualizado = ? WHERE id = ?");
      for (const id of ids) {
        const p = parse(db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id));
        if (!p || !p.arquivado) continue;
        upd.run(t, id);
        out.push(parse(db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id)));
      }
      return out;
    },
  };
}

function pushSubs() {
  const file = path.join(dir, "push-subs.json");
  let subs = [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(raw)) subs = raw;
  } catch (e) { /* vazio */ }
  const write = () => fs.writeFileSync(file, JSON.stringify(subs, null, 2));
  return {
    listar() { return subs.slice(); },
    guardar(sub) {
      if (!sub || !sub.endpoint) return false;
      subs = subs.filter((s) => s.endpoint !== sub.endpoint);
      subs.push({
        endpoint: String(sub.endpoint),
        keys: sub.keys && { p256dh: String(sub.keys.p256dh || ""), auth: String(sub.keys.auth || "") },
        criado: now(),
      });
      write();
      return true;
    },
    remover(endpoint) {
      const n = subs.length;
      subs = subs.filter((s) => s.endpoint !== endpoint);
      if (subs.length !== n) write();
      return n !== subs.length;
    },
  };
}

export async function openStore() {
  try {
    const { default: Database } = await import("better-sqlite3");
    return sqliteStore(Database);
  } catch (e) {
    return jsonStore();
  }
}

export { ESTADOS, FEITOS, nextOf, normEstado, pushSubs };
