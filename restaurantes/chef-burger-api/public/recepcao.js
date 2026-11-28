(function () {
  "use strict";
  var PIN_KEY = "cb-rececao-pin";
  var TITLE = "Receção";
  var FEITOS = { servido: 1, entregue: 1, levantado: 1, fechado: 1 };
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
  var nextOf = function (p) {
    if (p.estado === "novo") return "em_preparo";
    if (p.estado === "em_preparo") {
      if (p.tipo === "local") return "servido";
      if (p.tipo === "levantar") return "levantado";
      return "entregue";
    }
    if (FEITOS[p.estado] && p.estado !== "fechado") return "fechado";
    return null;
  };
  var nextLabel = function (p) {
    if (p.estado === "novo") return "Passar a em preparo";
    if (p.estado === "em_preparo") {
      if (p.tipo === "local") return "Marcar como servido";
      if (p.tipo === "levantar") return "Marcar como levantado";
      return "Marcar como entregue";
    }
    if (p.estado === "servido" || p.estado === "entregue" || p.estado === "levantado") return "Fechar";
    return "";
  };
  var pendentes = {};
  var esRef = null;
  var ligando = false;

  function diaLuanda(iso) {
    var d = iso ? new Date(iso) : new Date();
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Luanda", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(d);
  }
  function hojeLuanda() { return diaLuanda(); }

  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "agora";
    if (s < 3600) return "há " + Math.floor(s / 60) + " min";
    return "há " + Math.floor(s / 3600) + " h";
  }
  function headers() { return { "X-Rececao-Pin": pin, "Content-Type": "application/json" }; }

  function toast(msg, opts) {
    opts = opts || {};
    var box = $("[data-toasts]");
    if (!box) return;
    var el = document.createElement("div");
    el.className = "toast" + (opts.kind === "erro" ? " toast--erro" : "");
    el.setAttribute("role", opts.kind === "erro" ? "alert" : "status");
    var p = document.createElement("p");
    p.textContent = msg;
    el.appendChild(p);
    var t;
    var fechar = function () {
      clearTimeout(t);
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    if (opts.undo) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = "Desfazer";
      b.addEventListener("click", function () {
        fechar();
        Promise.resolve(opts.undo()).catch(function (e) {
          toast(e && e.message ? e.message : "Não foi possível desfazer.", { kind: "erro" });
        });
      });
      el.appendChild(b);
    }
    box.appendChild(el);
    t = setTimeout(fechar, opts.ms || (opts.undo ? 5000 : 4200));
    return fechar;
  }

  function confirmar(titulo, msg) {
    return new Promise(function (resolve) {
      var modal = $("[data-confirm]");
      $("[data-confirm-title]").textContent = titulo || "Confirmar";
      $("[data-confirm-msg]").textContent = msg || "";
      modal.hidden = false;
      var ok = $("[data-confirm-ok]");
      var no = $("[data-confirm-no]");
      var done = function (v) {
        modal.hidden = true;
        ok.removeEventListener("click", onOk);
        no.removeEventListener("click", onNo);
        modal.removeEventListener("click", onBg);
        resolve(v);
      };
      var onOk = function () { done(true); };
      var onNo = function () { done(false); };
      var onBg = function (e) { if (e.target === modal) done(false); };
      ok.addEventListener("click", onOk);
      no.addEventListener("click", onNo);
      modal.addEventListener("click", onBg);
      ok.focus();
    });
  }

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

  function vibrar() {
    try { if (navigator.vibrate) navigator.vibrate([80, 40, 80]); } catch (e) {}
  }

  function tituloBadge() {
    var n = pedidos.filter(function (p) {
      return !p.arquivado && !p.cancelado && (p.estado === "novo" || p.estado === "em_preparo");
    }).length;
    document.title = n ? "(" + n + ") " + TITLE : TITLE + " · Chef Burger";
  }

  function springStat(el, target, asKz) {
    var inited = el.dataset.val != null;
    var from = Number(el.dataset.val || 0);
    el.dataset.val = String(target);
    if (!inited || from === target || reduced) {
      el.textContent = asKz ? kz(target) : String(target);
      return;
    }
    el.dataset.bump = "true";
    setTimeout(function () { el.dataset.bump = "false"; }, 520);
    var t0 = performance.now();
    var dur = 520;
    function frame(now) {
      var t = Math.min(1, (now - t0) / dur);
      var e = 1 - Math.pow(1 - t, 3);
      var cur = from + (target - from) * e;
      el.textContent = asKz ? kz(cur) : String(Math.round(cur));
      if (t < 1) requestAnimationFrame(frame);
      else el.textContent = asKz ? kz(target) : String(target);
    }
    requestAnimationFrame(frame);
  }

  function resumo() {
    var dia = hojeLuanda();
    var hoje = pedidos.filter(function (p) { return !p.cancelado && diaLuanda(p.criado) === dia; });
    var ativos = pedidos.filter(function (p) { return !p.arquivado && !p.cancelado; });
    var abertos = ativos.filter(function (p) { return p.estado !== "fechado"; });
    var preparo = ativos.filter(function (p) { return p.estado === "em_preparo"; });
    var feitos = hoje.filter(function (p) { return FEITOS[p.estado]; });
    var receita = hoje.reduce(function (s, p) { return s + (Number(p.total) || 0); }, 0);
    springStat($("[data-stat=hoje]"), hoje.length, false);
    springStat($("[data-stat=abertos]"), abertos.length, false);
    springStat($("[data-stat=preparo]"), preparo.length, false);
    springStat($("[data-stat=feitos]"), feitos.length, false);
    springStat($("[data-stat=receita]"), receita, true);
    var nF = ativos.filter(function (p) { return p.estado === "fechado"; }).length;
    var fe = $("[data-fechados]");
    fe.hidden = nF === 0;
    fe.textContent = nF ? (nF === 1 ? "1 pedido fechado à espera de ser limpo." : nF + " pedidos fechados à espera de serem limpos.") : "";
    tituloBadge();
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

  function ticket(p, flash, opts) {
    opts = opts || {};
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
    if (!opts.historico) {
      var act = document.createElement("div");
      act.className = "ticket__act";
      var nxt = nextOf(p);
      if (nxt) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn " + (p.estado === "novo" ? "btn--red" : "btn--ink");
        b.textContent = nextLabel(p);
        b.addEventListener("click", function () { avancar(p.id, b); });
        act.appendChild(b);
      }
      if (FEITOS[p.estado]) {
        var lim = document.createElement("button");
        lim.type = "button";
        lim.className = "btn btn--ghost btn--sm";
        lim.textContent = "Limpar";
        lim.addEventListener("click", function () { arquivar([p.id], false); });
        act.appendChild(lim);
      }
      if (act.childNodes.length) el.appendChild(act);
    }
    return el;
  }

  function visiveis() {
    return pedidos.filter(function (p) { return !p.arquivado && !p.cancelado && p.estado !== "fechado"; });
  }

  function render(flashIds) {
    flashIds = flashIds || {};
    var open = visiveis();
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
      var h3 = document.createElement("h3");
      h3.textContent = "Mesa " + m;
      var sum = document.createElement("p");
      sum.className = "mesa__sum";
      sum.textContent = kz(tot);
      var fechar = document.createElement("button");
      fechar.type = "button";
      fechar.className = "btn btn--ghost btn--sm";
      fechar.textContent = "Fechar mesa";
      fechar.addEventListener("click", function () { fecharMesa(m); });
      head.appendChild(h3);
      head.appendChild(sum);
      head.appendChild(fechar);
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

    var painel = $("[data-historico-painel]");
    if (painel && !painel.hidden) pintarHistorico();
    resumo();
  }

  function pintarHistorico() {
    var dia = hojeLuanda();
    var lista = $("[data-historico-lista]");
    var vazio = $("[data-historico-vazio]");
    lista.textContent = "";
    var rows = pedidos.filter(function (p) {
      if (p.cancelado) return false;
      if (diaLuanda(p.criado) !== dia && diaLuanda(p.atualizado) !== dia && diaLuanda(p.arquivadoEm) !== dia) return false;
      return p.arquivado || FEITOS[p.estado];
    }).sort(function (a, b) { return (b.atualizado || "").localeCompare(a.atualizado || ""); });
    rows.forEach(function (p) { lista.appendChild(ticket(p, false, { historico: true })); });
    vazio.hidden = rows.length > 0;
  }

  function upsert(p) {
    var i = pedidos.findIndex(function (x) { return x.id === p.id; });
    if (i >= 0) pedidos[i] = p;
    else pedidos.push(p);
  }

  function merge(lista, flashNew) {
    var flash = {};
    if (flashNew) {
      lista.forEach(function (p) {
        if (!seen[p.id] && p.estado === "novo" && !p.arquivado) flash[p.id] = true;
      });
      if (Object.keys(flash).length) avisarNovos(lista.filter(function (p) { return flash[p.id]; }));
    }
    lista.forEach(function (p) { seen[p.id] = true; });
    var keepPend = {};
    Object.keys(pendentes).forEach(function (id) {
      var server = lista.find(function (p) { return String(p.id) === String(id); });
      if (server && pendentes[id].atualizado && server.atualizado && server.atualizado < pendentes[id].atualizado) {
        keepPend[id] = true;
      }
    });
    pedidos = lista.map(function (p) {
      if (keepPend[p.id] || keepPend[String(p.id)]) {
        var local = pedidos.find(function (x) { return x.id === p.id; });
        return local || p;
      }
      return p;
    });
    render(flash);
  }

  function avisarNovos(novos) {
    chime();
    vibrar();
    novos.forEach(function (p) { notificarLocal(p); });
  }

  function notificarLocal(p) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    try {
      var n = new Notification("Novo pedido n.º " + p.numero, {
        body: (p.tipo === "local" ? "Mesa " + p.mesa : (p.nome || p.tipo)) + " · " + kz(p.total),
        icon: "icon-192.png",
        tag: "pedido-" + p.id,
      });
      n.onclick = function () { try { window.focus(); n.close(); } catch (e) {} };
    } catch (e) {}
  }

  function erroDe(r, data) {
    if (data && data.erro) return data.erro;
    if (r && r.status === 403) return "A origem deste quadro não está autorizada. Actualize o serviço.";
    if (r && r.status === 401) return "PIN inválido.";
    if (r && r.status === 409) return "Esse não é o estado seguinte.";
    if (r && (r.status === 502 || r.status === 503 || r.status === 504)) return "A receção está a acordar. Tente outra vez dentro de instantes.";
    return "Não foi possível concluir a acção.";
  }

  async function api(method, path, body, opts) {
    opts = opts || {};
    var ctrl = new AbortController();
    var slow = setTimeout(function () {
      if (liveEl) {
        liveEl.hidden = false;
        liveEl.textContent = "A ligar à receção…";
      }
    }, 800);
    var kill = setTimeout(function () { ctrl.abort(); }, opts.timeout || 60000);
    try {
      var r = await fetch(path, {
        method: method,
        headers: headers(),
        body: body != null ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      var data = null;
      try { data = await r.json(); } catch (e) { data = null; }
      if (r.status === 401) { sair.click(); throw new Error("PIN inválido."); }
      if (!r.ok) throw new Error(erroDe(r, data));
      return data || {};
    } catch (e) {
      if (e && e.name === "AbortError") throw new Error("A receção demorou demasiado. Tente outra vez.");
      if (e && e.message) throw e;
      throw new Error("Sem ligação à receção. Se o serviço estiver a acordar, espere um pouco e tente de novo.");
    } finally {
      clearTimeout(slow);
      clearTimeout(kill);
      if (liveEl && liveEl.textContent === "A ligar à receção…") liveEl.textContent = "Ao vivo";
    }
  }

  async function carregar(flashNew) {
    var data = await api("GET", "/api/pedidos", null);
    merge(data.pedidos || [], flashNew);
  }

  async function avancar(id, btn) {
    var cur = pedidos.find(function (p) { return p.id === id; });
    if (!cur) return;
    var n = nextOf(cur);
    if (!n) return;
    var snapshot = Object.assign({}, cur);
    pendentes[id] = { atualizado: new Date().toISOString() };
    if (btn) btn.disabled = true;
    cur.estado = n;
    cur.atualizado = pendentes[id].atualizado;
    render();
    try {
      var data = await api("PATCH", "/api/pedidos/" + id, { estado: n });
      if (data.pedido) upsert(data.pedido);
      delete pendentes[id];
      render();
    } catch (e) {
      upsert(snapshot);
      delete pendentes[id];
      render();
      toast(e && e.message ? e.message : "Não foi possível avançar o pedido.", { kind: "erro" });
    }
  }

  async function arquivar(ids, pedirConfirmacao) {
    if (!ids.length) {
      toast("Não há pedidos concluídos para limpar.");
      return;
    }
    if (pedirConfirmacao) {
      var ok = await confirmar("Limpar concluídos", "Os pedidos servidos, entregues, levantados ou fechados saem do quadro. Ficam no histórico de hoje. Pode desfazer durante uns segundos.");
      if (!ok) return;
    }
    var snapshots = pedidos.filter(function (p) { return ids.indexOf(p.id) >= 0; }).map(function (p) { return Object.assign({}, p); });
    ids.forEach(function (id) {
      var p = pedidos.find(function (x) { return x.id === id; });
      if (p) { p.arquivado = true; p.arquivadoEm = new Date().toISOString(); }
    });
    render();
    try {
      var data = await api("POST", "/api/pedidos/arquivar", { ids: ids });
      (data.pedidos || []).forEach(upsert);
      render();
      var feitos = (data.ids && data.ids.length) ? data.ids : ids;
      toast(feitos.length === 1 ? "Pedido limpo do quadro." : feitos.length + " pedidos limpos do quadro.", {
        undo: function () { return desarquivar(feitos); },
        ms: 5000,
      });
    } catch (e) {
      snapshots.forEach(upsert);
      render();
      toast(e && e.message ? e.message : "Não foi possível limpar.", { kind: "erro" });
    }
  }

  async function desarquivar(ids) {
    var data = await api("POST", "/api/pedidos/desarquivar", { ids: ids });
    (data.pedidos || []).forEach(upsert);
    render();
  }

  async function fecharMesa(mesa) {
    var ok = await confirmar("Fechar mesa " + mesa, "Todos os pedidos abertos desta mesa passam a fechados e saem do quadro. Continuam no histórico de hoje.");
    if (!ok) return;
    var rows = visiveis().filter(function (p) { return p.tipo === "local" && Number(p.mesa) === mesa; });
    var snapshots = rows.map(function (p) { return Object.assign({}, p); });
    rows.forEach(function (p) { p.estado = "fechado"; p.atualizado = new Date().toISOString(); });
    render();
    try {
      var data = await api("POST", "/api/pedidos/mesa/" + mesa + "/fechar", {});
      (data.pedidos || []).forEach(upsert);
      render();
      toast("Mesa " + mesa + " fechada.");
    } catch (e) {
      snapshots.forEach(upsert);
      render();
      toast(e && e.message ? e.message : "Não foi possível fechar a mesa.", { kind: "erro" });
    }
  }

  function ligarSSE() {
    if (esRef) { try { esRef.close(); } catch (e) {} esRef = null; }
    var es;
    try { es = new EventSource("/api/pedidos/stream?pin=" + encodeURIComponent(pin)); } catch (e) { return poll(); }
    esRef = es;
    var ok = false;
    es.addEventListener("hello", function () {
      ok = true;
      liveEl.hidden = false;
      liveEl.textContent = "Ao vivo";
    });
    es.addEventListener("novo", function (e) {
      var p = JSON.parse(e.data);
      var eraNovo = !seen[p.id];
      upsert(p);
      seen[p.id] = true;
      var flash = {}; flash[p.id] = true;
      if (eraNovo) avisarNovos([p]);
      render(flash);
    });
    es.addEventListener("atualizado", function (e) {
      var p = JSON.parse(e.data);
      if (pendentes[p.id]) return;
      upsert(p);
      seen[p.id] = true;
      render();
    });
    es.onerror = function () {
      es.close();
      if (esRef === es) esRef = null;
      liveEl.hidden = true;
      poll();
    };
    setTimeout(function () { if (!ok) { es.close(); if (esRef === es) esRef = null; poll(); } }, 4000);
  }

  var pollT = 0;
  function poll() {
    liveEl.hidden = true;
    clearInterval(pollT);
    pollT = setInterval(function () { carregar(true).catch(function () {}); }, 4000);
  }

  function b64ToBytes(b64) {
    var pad = "=".repeat((4 - (b64.length % 4)) % 4);
    var raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function ativarNotificacoes() {
    var state = $("[data-notify-state]");
    var btn = $("[data-notify]");
    if (!("Notification" in window)) {
      toast("Este navegador não suporta notificações.", { kind: "erro" });
      return;
    }
    if (!window.isSecureContext) {
      toast("As notificações só funcionam em HTTPS (ou em localhost).", { kind: "erro" });
      return;
    }
    var perm = Notification.permission;
    if (perm !== "granted") {
      perm = await Notification.requestPermission();
    }
    if (perm !== "granted") {
      toast("As notificações ficaram bloqueadas neste navegador. Pode activá-las nas definições.", { kind: "erro" });
      return;
    }
    try {
      if ("serviceWorker" in navigator) {
        var reg = await navigator.serviceWorker.register("sw.js", { scope: "/recepcao/" });
        await navigator.serviceWorker.ready;
        var vapid;
        try { vapid = await api("GET", "/api/push/vapid", null); } catch (e) { vapid = null; }
        if (vapid && vapid.publicKey && reg.pushManager) {
          var sub = await reg.pushManager.getSubscription();
          if (!sub) {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: b64ToBytes(vapid.publicKey),
            });
          }
          await api("POST", "/api/push/subscribe", { subscription: sub.toJSON ? sub.toJSON() : sub });
          if (state) { state.hidden = false; state.textContent = "Notificações do sistema e push activados neste aparelho."; }
          if (btn) btn.textContent = "Notificações ligadas";
          toast("Notificações activadas.");
          return;
        }
      }
      if (state) { state.hidden = false; state.textContent = "Notificações do sistema activadas enquanto o quadro estiver aberto."; }
      if (btn) btn.textContent = "Notificações ligadas";
      toast("Notificações do sistema activadas.");
    } catch (e) {
      toast(e && e.message ? e.message : "Não foi possível activar as notificações.", { kind: "erro" });
    }
  }

  function entrar(okPin) {
    pin = okPin;
    sessionStorage.setItem(PIN_KEY, pin);
    login.hidden = true;
    board.hidden = false;
    sair.hidden = false;
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("sw.js", { scope: "/recepcao/" }).catch(function () {});
    }
    if (Notification && Notification.permission === "granted") {
      var btn = $("[data-notify]");
      if (btn) btn.textContent = "Notificações ligadas";
    }
    ligando = true;
    carregar(false).then(function () {
      ligando = false;
      ligarSSE();
    }).catch(function (e) {
      ligando = false;
      err.textContent = (e && e.message) || "Não foi possível abrir o quadro.";
      login.hidden = false; board.hidden = true; sair.hidden = true;
    });
  }

  login.addEventListener("submit", function (e) {
    e.preventDefault();
    err.textContent = "";
    var v = login.pin.value.trim();
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 60000);
    err.textContent = "A ligar à receção…";
    fetch("/api/pedidos", { headers: { "X-Rececao-Pin": v }, signal: ctrl.signal }).then(function (r) {
      if (r.status === 401) { err.textContent = "PIN inválido."; return; }
      if (!r.ok) { err.textContent = "Não foi possível entrar."; return; }
      err.textContent = "";
      entrar(v);
    }).catch(function () { err.textContent = "Sem ligação à receção. Se o serviço estiver a acordar, espere até um minuto e tente de novo."; }).finally(function () { clearTimeout(t); });
  });

  sair.addEventListener("click", function () {
    sessionStorage.removeItem(PIN_KEY);
    pin = "";
    clearInterval(pollT);
    if (esRef) { try { esRef.close(); } catch (e) {} esRef = null; }
    login.hidden = false;
    board.hidden = true;
    sair.hidden = true;
    liveEl.hidden = true;
    document.title = TITLE + " · Chef Burger";
    login.pin.value = "";
    login.pin.focus();
  });

  $("[data-notify]").addEventListener("click", function () { ativarNotificacoes(); });
  $("[data-limpar-todos]").addEventListener("click", function () {
    var ids = pedidos.filter(function (p) { return !p.arquivado && !p.cancelado && FEITOS[p.estado]; }).map(function (p) { return p.id; });
    arquivar(ids, true);
  });
  $("[data-historico]").addEventListener("click", function () {
    var painel = $("[data-historico-painel]");
    painel.hidden = !painel.hidden;
    if (!painel.hidden) {
      pintarHistorico();
      painel.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }
  });

  setInterval(function () {
    $$("[data-ago]").forEach(function (el) {
      var art = el.closest(".ticket");
      if (!art) return;
      var p = pedidos.find(function (x) { return String(x.id) === art.dataset.id; });
      if (p) el.textContent = ago(p.criado);
    });
    resumo();
  }, 30000);

  if (pin) entrar(pin);
})();
