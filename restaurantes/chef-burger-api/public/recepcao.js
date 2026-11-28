(function () {
  "use strict";
  var PIN_KEY = "cb-rececao-pin";
  var kz = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " Kz"; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var login = $("[data-login]");
  var board = $("[data-board]");
  var liveEl = $("[data-live]");
  var sair = $("[data-sair]");
  var err = $("[data-err]");
  var pin = sessionStorage.getItem(PIN_KEY) || "";
  var pedidos = [];
  var seen = {};
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var labels = { novo: "Novo", em_preparo: "Em preparo", servido: "Servido", entregue: "Entregue", levantado: "Levantado", fechado: "Fechado" };
  var nextLabel = { novo: "Passar a em preparo", em_preparo: "Marcar como feito", servido: "Fechar", entregue: "Fechar", levantado: "Fechar" };

  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "agora";
    if (s < 3600) return "há " + Math.floor(s / 60) + " min";
    return "há " + Math.floor(s / 3600) + " h";
  }
  function headers() { return { "X-Rececao-Pin": pin, "Content-Type": "application/json" }; }

  function chime() {
    if (reduced) return;
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      var ctx = new C();
      var t0 = ctx.currentTime;
      [523, 784, 1046].forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.02 + i * 0.07);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35 + i * 0.07);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0 + i * 0.07); o.stop(t0 + 0.4 + i * 0.07);
      });
      setTimeout(function () { ctx.close(); }, 800);
    } catch (e) {}
  }

  function itemLine(it) {
    var n = document.createElement("li");
    var left = document.createElement("span");
    left.textContent = it.qtd + "× " + it.nome;
    if (it.variante) { var sm = document.createElement("small"); sm.textContent = it.variante; left.appendChild(sm); }
    var right = document.createElement("span");
    right.textContent = kz(it.qtd * it.preco);
    n.appendChild(left); n.appendChild(right);
    return n;
  }

  function ticket(p, flash) {
    var el = document.createElement("article");
    el.className = "ticket";
    el.dataset.id = String(p.id);
    if (flash) el.dataset.flash = "true";
    var meta = document.createElement("div");
    meta.className = "ticket__meta";
    meta.innerHTML = "<span class=\"estado\" data-e=\"" + p.estado + "\"></span><span>n.º " + p.numero + "</span><span data-ago></span>";
    meta.querySelector(".estado").textContent = labels[p.estado] || p.estado;
    meta.querySelector("[data-ago]").textContent = ago(p.criado);
    el.appendChild(meta);
    if (p.tipo !== "local") {
      var who = document.createElement("p");
      who.style.margin = "0 0 8px";
      who.style.fontWeight = "700";
      who.textContent = p.nome + (p.telefone ? " · " + p.telefone : "");
      el.appendChild(who);
      if (p.morada) { var mo = document.createElement("p"); mo.style.margin = "0 0 8px"; mo.style.color = "var(--muted)"; mo.textContent = p.morada; el.appendChild(mo); }
    }
    var ul = document.createElement("ul");
    (p.items || []).forEach(function (it) { ul.appendChild(itemLine(it)); });
    el.appendChild(ul);
    var sum = document.createElement("p");
    sum.className = "ticket__nota";
    sum.style.fontWeight = "800";
    sum.style.color = "var(--ink)";
    sum.textContent = "Total " + kz(p.total);
    el.appendChild(sum);
    if (p.nota) { var nota = document.createElement("p"); nota.className = "ticket__nota"; nota.textContent = "Nota: " + p.nota; el.appendChild(nota); }
    if (p.estado !== "fechado" && nextLabel[p.estado]) {
      var act = document.createElement("div");
      act.className = "ticket__act";
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn " + (p.estado === "novo" ? "btn--red" : "btn--ink");
      b.textContent = nextLabel[p.estado];
      if (p.estado === "em_preparo") {
        b.textContent = p.tipo === "local" ? "Marcar como servido" : (p.tipo === "levantar" ? "Marcar como levantado" : "Marcar como entregue");
      }
      b.addEventListener("click", function () { avancar(p.id, b); });
      act.appendChild(b);
      el.appendChild(act);
    }
    return el;
  }

  function render(flashIds) {
    flashIds = flashIds || {};
    var open = pedidos.filter(function (p) { return p.estado !== "fechado"; });
    var byMesa = {};
    open.filter(function (p) { return p.tipo === "local"; }).forEach(function (p) {
      (byMesa[p.mesa] || (byMesa[p.mesa] = [])).push(p);
    });
    var mesas = Object.keys(byMesa).map(Number).sort(function (a, b) { return a - b; });
    var loc = $("[data-list=local]");
    loc.textContent = "";
    mesas.forEach(function (m) {
      var card = document.createElement("article");
      card.className = "mesa";
      var flash = byMesa[m].some(function (p) { return flashIds[p.id]; });
      if (flash) card.dataset.flash = "true";
      var tot = byMesa[m].reduce(function (s, p) { return s + p.total; }, 0);
      var head = document.createElement("div");
      head.className = "mesa__t";
      head.innerHTML = "<h3>Mesa " + m + "</h3><p class=\"mesa__sum\"></p>";
      head.querySelector(".mesa__sum").textContent = kz(tot);
      card.appendChild(head);
      byMesa[m].sort(function (a, b) { return a.numero - b.numero; }).forEach(function (p) { card.appendChild(ticket(p, flashIds[p.id])); });
      loc.appendChild(card);
    });
    $("[data-empty=local]").hidden = mesas.length > 0;

    ["entrega", "levantar"].forEach(function (tipo) {
      var list = $("[data-list=" + tipo + "]");
      list.textContent = "";
      var rows = open.filter(function (p) { return p.tipo === tipo; }).sort(function (a, b) { return a.numero - b.numero; });
      rows.forEach(function (p) { list.appendChild(ticket(p, flashIds[p.id])); });
      $("[data-empty=" + tipo + "]").hidden = rows.length > 0;
    });

    var nF = pedidos.filter(function (p) { return p.estado === "fechado"; }).length;
    var fe = $("[data-fechados]");
    fe.hidden = nF === 0;
    fe.textContent = nF ? (nF === 1 ? "1 pedido fechado nesta sessão." : nF + " pedidos fechados nesta sessão.") : "";
  }

  function merge(lista, flashNew) {
    var flash = {};
    if (flashNew) {
      lista.forEach(function (p) {
        if (!seen[p.id] && p.estado === "novo") flash[p.id] = true;
      });
      if (Object.keys(flash).length) chime();
    }
    lista.forEach(function (p) { seen[p.id] = true; });
    pedidos = lista.slice();
    render(flash);
  }

  async function carregar(flashNew) {
    var r = await fetch("/api/pedidos", { headers: headers() });
    if (r.status === 401) { sair.click(); return; }
    if (!r.ok) throw new Error("lista");
    var data = await r.json();
    merge(data.pedidos || [], flashNew);
  }

  async function avancar(id, btn) {
    if (btn) btn.disabled = true;
    try {
      var r = await fetch("/api/pedidos/" + id, { method: "PATCH", headers: headers(), body: JSON.stringify({}) });
      if (!r.ok) throw new Error("patch");
      var data = await r.json();
      pedidos = pedidos.map(function (p) { return p.id === data.pedido.id ? data.pedido : p; });
      render();
    } catch (e) {
      if (btn) btn.disabled = false;
      await carregar(false);
    }
  }

  function ligarSSE() {
    var es;
    try { es = new EventSource("/api/pedidos/stream?pin=" + encodeURIComponent(pin)); } catch (e) { return poll(); }
    var ok = false;
    es.addEventListener("hello", function () { ok = true; liveEl.hidden = false; });
    es.addEventListener("novo", function (e) {
      var p = JSON.parse(e.data);
      if (!pedidos.some(function (x) { return x.id === p.id; })) pedidos.push(p);
      var flash = {}; flash[p.id] = true;
      seen[p.id] = true;
      chime();
      render(flash);
    });
    es.addEventListener("atualizado", function (e) {
      var p = JSON.parse(e.data);
      pedidos = pedidos.map(function (x) { return x.id === p.id ? p : x; });
      if (!pedidos.some(function (x) { return x.id === p.id; })) pedidos.push(p);
      render();
    });
    es.onerror = function () {
      es.close();
      liveEl.hidden = true;
      poll();
    };
    setTimeout(function () { if (!ok) { es.close(); poll(); } }, 4000);
  }

  var pollT = 0;
  function poll() {
    liveEl.hidden = true;
    clearInterval(pollT);
    pollT = setInterval(function () { carregar(true).catch(function () {}); }, 4000);
  }

  function entrar(okPin) {
    pin = okPin;
    sessionStorage.setItem(PIN_KEY, pin);
    login.hidden = true;
    board.hidden = false;
    sair.hidden = false;
    carregar(false).then(function () { ligarSSE(); }).catch(function () {
      err.textContent = "Não foi possível abrir o quadro.";
      login.hidden = false; board.hidden = true;
    });
  }

  login.addEventListener("submit", function (e) {
    e.preventDefault();
    err.textContent = "";
    var v = login.pin.value.trim();
    fetch("/api/pedidos", { headers: { "X-Rececao-Pin": v } }).then(function (r) {
      if (r.status === 401) { err.textContent = "PIN inválido."; return; }
      if (!r.ok) { err.textContent = "Não foi possível entrar."; return; }
      entrar(v);
    }).catch(function () { err.textContent = "Sem ligação à receção."; });
  });

  sair.addEventListener("click", function () {
    sessionStorage.removeItem(PIN_KEY);
    pin = "";
    clearInterval(pollT);
    login.hidden = false;
    board.hidden = true;
    sair.hidden = true;
    liveEl.hidden = true;
    login.pin.value = "";
    login.pin.focus();
  });

  setInterval(function () {
    $$("[data-ago]").forEach(function (el) {
      var art = el.closest(".ticket");
      if (!art) return;
      var p = pedidos.find(function (x) { return String(x.id) === art.dataset.id; });
      if (p) el.textContent = ago(p.criado);
    });
  }, 30000);

  if (pin) entrar(pin);
})();
