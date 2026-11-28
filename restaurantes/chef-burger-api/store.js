// Persistência: SQLite (better-sqlite3) se o módulo carregar; senão um ficheiro JSON.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
fs.mkdirSync(dir, { recursive: true });

const ESTADOS = new Set(["novo", "em_preparo", "servido", "entregue", "levantado", "fechado"]);

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
      const row = { id: data.seq, numero: data.seq, ...p, estado: "novo", criado: now(), atualizado: now() };
      data.pedidos.push(row);
      write();
      return row;
    },
    listar() { return data.pedidos.slice(); },
    obter(id) { return data.pedidos.find((p) => p.id === id) || null; },
    avancar(id) {
      const p = data.pedidos.find((x) => x.id === id);
      if (!p) return { erro: "nao_encontrado" };
      const n = nextOf(p.tipo, p.estado);
      if (!n) return { erro: "estado" };
      p.estado = n;
      p.atualizado = now();
      write();
      return { pedido: p };
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
  const parse = (r) => r && { ...r, items: JSON.parse(r.items) };
  return {
    kind: "sqlite",
    criar(p) {
      const t = now();
      const info = db.prepare(`INSERT INTO pedidos (numero, tipo, mesa, nome, telefone, morada, nota, items, total, estado, criado, atualizado)
        VALUES (0, @tipo, @mesa, @nome, @telefone, @morada, @nota, @items, @total, 'novo', @t, @t)`).run({
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
      const n = nextOf(p.tipo, p.estado);
      if (!n) return { erro: "estado" };
      db.prepare("UPDATE pedidos SET estado = ?, atualizado = ? WHERE id = ?").run(n, now(), id);
      return { pedido: parse(db.prepare("SELECT * FROM pedidos WHERE id = ?").get(id)) };
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

export { ESTADOS, nextOf };
