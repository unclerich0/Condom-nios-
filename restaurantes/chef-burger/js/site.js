/* Chef Burger — pedido, reserva, horário e movimento. Sem servidor: tudo sai pelo WhatsApp. */
(function () {
  "use strict";

  var WA = "244925918468";
  // Um só sítio para o endereço da API. Em 127.0.0.1 / localhost usa-se a API local (:8787).
  var PEDIDOS_API = "https://chef-burger-pedidos.onrender.com";
  if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
    PEDIDOS_API = location.protocol + "//" + location.hostname + ":8787";
  }
  var OPEN = 8 * 60;
  var BREAKFAST_END = 14 * 60;
  var BOOK_LAST = 21 * 60 + 30;
  var STORE = "chefburger-pedido-v3";
  var rq = window.matchMedia("(prefers-reduced-motion: reduce)");
  var wideQ = window.matchMedia("(min-width: 960px)");
  var reduced = function () { return rq.matches; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  function kz(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " Kz"; }
  function norm(s) { return String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ı/g, "i"); }

  /* ---------- Mola (Apple: amortecimento + resposta) ---------- */
  // Interrompível: um novo alvo parte do valor e da velocidade atuais.
  function Spring(value, onUpdate) {
    this.x = value; this.v = 0; this.target = value; this.onUpdate = onUpdate;
    this.raf = 0; this.done = null;
  }
  Spring.prototype.to = function (target, opts) {
    opts = opts || {};
    var self = this;
    var damping = opts.damping == null ? 1 : opts.damping;
    var response = opts.response || 0.4;
    if (opts.velocity != null) this.v = opts.velocity;
    this.target = target;
    this.done = opts.done || null;
    if (reduced() || opts.instant) {
      cancelAnimationFrame(this.raf); this.raf = 0;
      this.x = target; this.v = 0; this.onUpdate(this.x);
      if (this.done) this.done();
      return;
    }
    var k = Math.pow((2 * Math.PI) / response, 2);
    var c = (4 * Math.PI * damping) / response;
    var last = performance.now();
    cancelAnimationFrame(this.raf);
    function step(now) {
      var dt = Math.min(0.032, (now - last) / 1000); last = now;
      var n = 4, h = dt / n;
      for (var i = 0; i < n; i++) {
        var a = -k * (self.x - self.target) - c * self.v;
        self.v += a * h; self.x += self.v * h;
      }
      self.onUpdate(self.x);
      if (Math.abs(self.v) < 0.5 && Math.abs(self.x - self.target) < 0.25) {
        self.x = self.target; self.v = 0; self.onUpdate(self.x); self.raf = 0;
        if (self.done) self.done();
        return;
      }
      self.raf = requestAnimationFrame(step);
    }
    this.raf = requestAnimationFrame(step);
  };
  Spring.prototype.set = function (x) { cancelAnimationFrame(this.raf); this.raf = 0; this.x = x; this.v = 0; this.target = x; this.onUpdate(x); };

  /* ---------- Horas de Luanda ---------- */
  function luanda(date) {
    var fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Luanda", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    var o = {};
    fmt.formatToParts(date || new Date()).forEach(function (p) { o[p.type] = p.value; });
    o.minutes = Number(o.hour) * 60 + Number(o.minute);
    o.iso = o.year + "-" + o.month + "-" + o.day;
    o.dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(o.weekday) + 1;
    o.weekend = o.dow >= 5;
    o.close = o.weekend ? 23 * 60 + 30 : 22 * 60 + 30;
    o.open = o.minutes >= OPEN && o.minutes < o.close;
    return o;
  }
  function closeLabel(weekend) { return weekend ? "23h30" : "22h30"; }

  function paintStatus() {
    var now = luanda();
    var text, short;
    if (now.open && now.minutes < BREAKFAST_END) { text = "Aberto agora, matabicho até às 14h00."; short = "Aberto"; }
    else if (now.open) { text = "Aberto agora, até às " + closeLabel(now.weekend) + "."; short = "Aberto até " + closeLabel(now.weekend); }
    else if (now.minutes < OPEN) { text = "Fechado agora, abre hoje às 08h00."; short = "Abre às 08h00"; }
    else { text = "Fechado agora, abre amanhã às 08h00."; short = "Fechado"; }
    $$("[data-status-text]").forEach(function (el) { el.textContent = text; });
    $$("[data-status-short]").forEach(function (el) { el.textContent = short; });
    $$("[data-status]").forEach(function (el) { el.dataset.open = now.open ? "true" : "false"; });
    $$("[data-hours] [data-days]").forEach(function (row) {
      var r = row.dataset.days.split("-").map(Number);
      row.dataset.today = now.dow >= r[0] && now.dow <= r[1] ? "true" : "false";
    });
  }
  paintStatus();
  setInterval(paintStatus, 30000);

  /* ---------- Barra de topo e doca ---------- */
  var nav = $("[data-nav]");
  var dock = $("[data-dock]");
  var dockY = new Spring(1, function (p) {
    dock.style.transform = "translateY(" + (p * 110) + "%)";
    dock.style.opacity = String(clamp(1 - p * 1.4, 0, 1));
  });
  var dockShown = false;
  function showDock(on, instant) {
    if (on === dockShown) return;
    dockShown = on;
    if (on) dock.dataset.shown = "true";
    dockY.to(on ? 0 : 1, { damping: on ? 0.86 : 1, response: 0.42, instant: instant, done: function () { if (!dockShown) dock.dataset.shown = "false"; } });
  }
  var heroActions = $("[data-hero-actions]");
  if ("IntersectionObserver" in window && heroActions) {
    new IntersectionObserver(function (es) {
      var e = es[0];
      showDock(!e.isIntersecting && e.boundingClientRect.top < 0);
    }).observe(heroActions);
  } else { showDock(true, true); }

  function onScrollNav() { nav.dataset.scrolled = window.scrollY > 8 ? "true" : "false"; }
  onScrollNav();

  /* ---------- Momento 1: photo-chapters ---------- */
  var chapters = $("[data-moment='photo-chapters']");
  var chItems = chapters ? $$(".chapter", chapters) : [];
  var chBars = [];
  var chLive = false;
  function setupChapters() {
    if (!chapters) return;
    var want = !reduced() && window.innerHeight >= 600;
    if (want === chLive) return;
    chLive = want;
    chapters.classList.toggle("is-live", want);
    if (want && !chBars.length) {
      var prog = document.createElement("div");
      prog.className = "chapters__progress"; prog.setAttribute("aria-hidden", "true");
      chItems.forEach(function () { var s = document.createElement("span"); s.appendChild(document.createElement("i")); prog.appendChild(s); chBars.push(s.firstChild); });
      $(".chapters__head", chapters).appendChild(prog);
      $$("img", chapters).forEach(function (img) { img.loading = "eager"; });
    }
    if (!want) chItems.forEach(function (li) { li.removeAttribute("data-active"); });
    paintChapters();
  }
  function paintChapters() {
    if (!chLive) return;
    var r = chapters.getBoundingClientRect();
    var span = Math.max(1, r.height - window.innerHeight);
    var p = clamp(-r.top / span, 0, 1);
    var n = chItems.length;
    var t = p * (n - 1);
    var active = 0;
    chItems.forEach(function (li, k) {
      var local = k === 0 ? 1 : clamp(t - (k - 1), 0, 1);
      var w = k === 0 ? 1 : clamp(local / 0.62, 0, 1);
      w = 1 - Math.pow(1 - w, 3);
      var pic = li.firstElementChild;
      if (k > 0) {
        pic.style.setProperty("--c", ((1 - w) * 100).toFixed(2) + "%");
        pic.firstElementChild.querySelector("img").style.setProperty("--z", (1.08 - 0.08 * w).toFixed(4));
      }
      if (w > 0.5) active = k;
      if (chBars[k]) chBars[k].style.setProperty("--p", k === 0 ? 1 : w.toFixed(3));
    });
    chItems.forEach(function (li, k) { li.dataset.active = k === active ? "true" : "false"; });
  }

  /* ---------- Momento 2: word-highlight ---------- */
  var words = [];
  var wordBox = $("[data-words]");
  if (wordBox && !reduced()) {
    (function split(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
        if (ch.nodeType === 3) {
          var frag = document.createDocumentFragment();
          ch.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var s = document.createElement("span"); s.className = "w"; s.textContent = part; frag.appendChild(s); words.push(s);
          });
          node.replaceChild(frag, ch);
        } else if (ch.nodeType === 1) { split(ch); }
      });
    })(wordBox);
  }
  function paintWords() {
    if (!words.length) return;
    var r = wordBox.getBoundingClientRect();
    var vh = window.innerHeight;
    var p = clamp((vh * 0.58 - r.top) / Math.max(1, r.height + vh * 0.12), 0, 1);
    var on = Math.round(p * words.length);
    words.forEach(function (w, i) { w.dataset.on = i < on ? "true" : "false"; });
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; onScrollNav(); paintChapters(); paintWords(); });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () { setupChapters(); onScroll(); moveThumb(true); });
  setupChapters();
  paintWords();

  var navInfo = window.__cbNav || { from: null, dir: "" };
  var revealed = window.__cbReveal || Promise.resolve();
  var vtCross = "CSSViewTransitionRule" in window;

  /* ---------- Barra de vidro: as páginas da ementa ---------- */
  // O indicador escuro é uma mola. Entre páginas, a View Transition leva-o do item antigo ao novo;
  // sem View Transitions, parte do item de onde se veio e assenta no novo com a mesma mola.
  var catnav = $("[data-catnav]");
  var thumb = catnav && $("[data-thumb]", catnav);
  var chips = catnav ? $$(".chip", catnav) : [];
  var active = chips.filter(function (c) { return c.getAttribute("aria-current") === "page"; })[0] || null;
  var thumbX = thumb && new Spring(active ? active.offsetLeft : 0, function (x) { thumb.style.transform = "translateX(" + x.toFixed(2) + "px)"; });
  var thumbW = thumb && new Spring(active ? active.offsetWidth : 0, function (w) { thumb.style.width = Math.max(0, w).toFixed(2) + "px"; });
  var thumbOn = null;

  function moveThumb(instant, to) {
    if (!thumb) return;
    var chip = to || active;
    if (!chip) { thumb.dataset.on = "false"; return; }
    thumb.dataset.on = "true";
    var o = { damping: 0.82, response: 0.38, instant: instant };
    thumbX.to(chip.offsetLeft, o);
    thumbW.to(chip.offsetWidth, o);
  }
  function revealChip(chip, smooth) {
    if (!catnav || !chip) return;
    var l = catnav.scrollLeft, w = catnav.clientWidth, pad = 24;
    var x = chip.offsetLeft, cw = chip.offsetWidth;
    if (x >= l + pad && x + cw <= l + w - pad) return;
    catnav.scrollTo({ left: Math.max(0, x - (w - cw) / 2), behavior: smooth && !reduced() ? "smooth" : "auto" });
  }
  if (thumb) {
    var fromChip = navInfo.from != null ? chips.filter(function (c) { return Number(c.dataset.idx) === navInfo.from; })[0] : null;
    if (!vtCross && fromChip && active && fromChip !== active && !reduced()) {
      thumbX.set(fromChip.offsetLeft); thumbW.set(fromChip.offsetWidth); thumb.dataset.on = "true";
      requestAnimationFrame(function () { moveThumb(false); });
    } else moveThumb(true);
    revealed.then(function () { revealChip(active, true); });
    // Resposta no toque: o indicador vai já para o item escolhido, antes de a página seguinte chegar.
    chips.forEach(function (chip) {
      chip.addEventListener("click", function (e) {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
        if (chip === active) { e.preventDefault(); window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" }); return; }
        chips.forEach(function (c) { c.removeAttribute("aria-current"); });
        chip.setAttribute("aria-current", "page");
        if (!active) {
          // No início não há item ativo: o indicador nasce no centro do item tocado.
          thumbX.set(chip.offsetLeft + chip.offsetWidth / 2); thumbW.set(0);
          thumb.dataset.on = "true";
          var o = { damping: 0.82, response: 0.3 };
          thumbX.to(chip.offsetLeft, o); thumbW.to(chip.offsetWidth, o);
        } else moveThumb(false, chip);
      });
    });
    // O livro (js/livro.js) chama isto ao virar a página: o indicador acompanha o capítulo aberto.
    window.cbCatnav = function (idx) {
      var chip = chips.filter(function (c) { return Number(c.dataset.idx) === idx; })[0];
      if (!chip || chip === active) return;
      chips.forEach(function (c) { if (c === chip) c.setAttribute("aria-current", "page"); else c.removeAttribute("aria-current"); });
      active = chip; moveThumb(false, chip); revealChip(chip, true);
    };
    window.addEventListener("pageshow", function (e) {
      if (!e.persisted) return;
      chips.forEach(function (c) { if (c === active) c.setAttribute("aria-current", "page"); else c.removeAttribute("aria-current"); });
      moveThumb(true);
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveThumb(true); });

  /* ---------- Pesquisa (página «Toda a ementa») ---------- */
  var search = $("[data-search]");
  var empty = $("[data-empty]");
  var cats = $$("[data-cat]");
  function filter() {
    var q = norm(search.value.trim());
    var shown = 0;
    cats.forEach(function (cat) {
      var any = 0;
      $$("[data-dish]", cat).forEach(function (d) { var ok = !q || d.dataset.search.indexOf(q) !== -1; d.hidden = !ok; if (ok) any++; });
      cat.hidden = !any; shown += any;
    });
    empty.hidden = !(q && !shown);
    if (q && !shown) empty.textContent = "Nada na ementa com «" + search.value.trim() + "». Experimente «burger», «frango» ou «sumo».";
  }
  if (search) {
    var form = search.form;
    var q0 = new URLSearchParams(location.search).get("q");
    if (q0) { search.value = q0; filter(); }
    search.addEventListener("input", function () {
      filter();
      var u = new URL(location.href);
      if (search.value.trim()) u.searchParams.set("q", search.value.trim()); else u.searchParams.delete("q");
      history.replaceState(null, "", u.pathname.split("/").pop() + u.search);
    });
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); search.blur(); });
  }

  /* ---------- Vídeo: só a tocar quando se vê ---------- */
  // Sem vídeo com movimento reduzido, Poupança de dados ou ligação lenta: fica a imagem fixa.
  var conn = navigator.connection || {};
  var saveData = conn.saveData === true || /(^|-)2g$/.test(conn.effectiveType || "") || window.matchMedia("(prefers-reduced-data: reduce)").matches;
  var phoneQ = window.matchMedia("(max-width: 639px)");
  $$("[data-video]").forEach(function (v) {
    if (reduced() || saveData || !("IntersectionObserver" in window)) { v.remove(); return; }
    var loaded = false, visible = false;
    function load() {
      if (loaded) return;
      loaded = true;
      v.src = phoneQ.matches && v.dataset.srcPhone ? v.dataset.srcPhone : v.dataset.src;
    }
    function play() {
      if (!visible || document.hidden) return;
      load();
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* autoplay recusado: fica a imagem */ });
    }
    v.addEventListener("playing", function () { v.dataset.playing = "true"; });
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) play(); else if (loaded) v.pause();
    }, { threshold: 0.2 }).observe(v);
    document.addEventListener("visibilitychange", function () { if (document.hidden) v.pause(); else play(); });
    rq.addEventListener("change", function () { if (rq.matches) { v.pause(); v.dataset.playing = "false"; } });
  });

  /* ---------- Pedido ---------- */
  var cart = [];
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || "[]");
    if (Array.isArray(saved)) cart = saved.filter(function (i) { return i && i.key && i.qty > 0 && i.kz > 0; });
  } catch (e) { cart = []; }
  var live = $("[data-live]");
  function save() { try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch (e) {} }
  function find(key) { for (var i = 0; i < cart.length; i++) if (cart[i].key === key) return cart[i]; return null; }
  function totals() { return cart.reduce(function (a, i) { a.n += i.qty; a.kz += i.qty * i.kz; return a; }, { n: 0, kz: 0 }); }
  function say(msg) { live.textContent = ""; setTimeout(function () { live.textContent = msg; }, 30); }

  function pop(el, amount) {
    if (!el || reduced() || !el.animate) return;
    // Mola amostrada para keyframes: pequeno ressalto, porque o toque foi o impulso.
    var frames = [], x = 0, v = 9 * (amount || 1), k = Math.pow(2 * Math.PI / 0.32, 2), c = 4 * Math.PI * 0.55 / 0.32;
    for (var i = 0; i <= 30; i++) { frames.push({ transform: "scale(" + (1 + x * 0.05).toFixed(4) + ")" }); for (var s = 0; s < 4; s++) { var a = -k * x - c * v; v += a * 0.004; x += v * 0.004; } }
    frames.push({ transform: "scale(1)" });
    el.animate(frames, { duration: 480, easing: "linear" });
  }

  var addBtns = $$("[data-add]");
  function paintButtons() {
    addBtns.forEach(function (b) {
      var item = find(b.dataset.key);
      var q = item ? item.qty : 0;
      b.dataset.in = q ? "true" : "false";
      b.querySelector("[data-qty]").textContent = q ? String(q) : "";
    });
  }
  function paintCounts() {
    var t = totals();
    $$("[data-count]").forEach(function (el) { el.textContent = String(t.n); el.hidden = t.n === 0; });
    $$("[data-open-cart]").forEach(function (b) { b.setAttribute("aria-label", t.n ? "Abrir o pedido, " + t.n + (t.n === 1 ? " prato" : " pratos") + ", " + kz(t.kz) : "Abrir o pedido, vazio"); });
    var dockText = $("[data-dock-text]");
    var dockCart = $("[data-dock-cart]");
    dockText.textContent = t.n ? kz(t.kz) : "Pedido";
    dockCart.dataset.has = t.n ? "true" : "false";
  }
  function add(btn) {
    var key = btn.dataset.key;
    var item = find(key);
    if (item) item.qty += 1;
    else cart.push({ key: key, name: btn.dataset.name, variant: btn.dataset.variant || "", kz: Number(btn.dataset.kz), cat: btn.dataset.cat, qty: 1 });
    save(); paintButtons(); paintCounts(); renderCart();
    pop(btn.querySelector(".add__icon"), 1);
    $$("[data-count]").forEach(function (c) { if (!c.hidden) pop(c, 0.8); });
    var t = totals();
    say(btn.dataset.name + (btn.dataset.variant ? ", " + btn.dataset.variant : "") + " juntou-se ao pedido. " + t.n + (t.n === 1 ? " prato, " : " pratos, ") + kz(t.kz) + ".");
  }
  addBtns.forEach(function (b) { b.addEventListener("click", function () { add(b); }); });

  function changeQty(key, d) {
    var item = find(key);
    if (!item) return;
    item.qty += d;
    var row = list.querySelector('[data-key="' + CSS.escape(key) + '"]');
    if (item.qty <= 0) {
      cart = cart.filter(function (i) { return i.key !== key; });
      save(); paintButtons(); paintCounts();
      if (row && !reduced()) {
        row.dataset.leaving = "true";
        setTimeout(renderCart, 300);
      } else renderCart();
      say(item.name + " saiu do pedido.");
      return;
    }
    save(); paintButtons(); paintCounts(); renderCart();
  }

  var sheet = $("[data-sheet]");
  var panel = $("[data-panel]");
  var scrim = $("[data-scrim]");
  var list = $("[data-cart-list]");
  var order = $("[data-order]");
  var preview = $("[data-preview]");
  var totalEl = $("[data-total]");

  function renderCart() {
    var t = totals();
    sheet.dataset.empty = t.n ? "false" : "true";
    list.innerHTML = "";
    cart.forEach(function (i) {
      var li = document.createElement("li");
      li.className = "cart__item"; li.dataset.key = i.key;
      li.innerHTML =
        '<div class="cart__row"><p class="cart__name"></p><div class="qty" role="group"><button type="button" data-d="-1"><svg class="ic" aria-hidden="true"><use href="#i-minus"/></svg></button><output></output><button type="button" data-d="1"><svg class="ic" aria-hidden="true"><use href="#i-plus"/></svg></button></div><p class="cart__sum"></p></div>';
      var name = li.querySelector(".cart__name");
      name.textContent = i.name;
      if (i.variant) { var sm = document.createElement("small"); sm.textContent = i.variant; name.appendChild(sm); }
      li.querySelector("output").textContent = String(i.qty);
      li.querySelector(".cart__sum").textContent = i.qty + " × " + kz(i.kz) + " = " + kz(i.qty * i.kz);
      li.querySelector(".qty").setAttribute("aria-label", "Quantidade de " + i.name);
      li.querySelector('[data-d="-1"]').setAttribute("aria-label", i.qty === 1 ? "Tirar " + i.name + " do pedido" : "Menos um " + i.name);
      li.querySelector('[data-d="1"]').setAttribute("aria-label", "Mais um " + i.name);
      li.querySelectorAll("[data-d]").forEach(function (b) { b.addEventListener("click", function () { changeQty(i.key, Number(b.dataset.d)); }); });
      list.appendChild(li);
    });
    totalEl.textContent = kz(t.kz);
    updatePreview();
    if (t.n && sheet && sheet.dataset.phase === "ok") phase("form");
  }

  var seg = $("[data-seg]");
  var addressField = $("[data-address]");
  var mesaField = $("[data-mesa]");
  var clienteFields = $("[data-cliente]");
  function mode() { var r = order.querySelector('input[name="modo"]:checked'); return r ? r.value : "local"; }
  function paintMode() {
    var m = mode();
    if (seg) seg.dataset.value = m;
    if (mesaField) mesaField.hidden = m !== "local";
    if (addressField) addressField.hidden = m !== "entrega";
    if (clienteFields) clienteFields.hidden = m === "local";
    updatePreview();
  }
  if (order) $$('input[name="modo"]', order).forEach(function (r) { r.addEventListener("change", paintMode); });
  var mesaQ = Number(new URLSearchParams(location.search).get("mesa"));
  if (order && Number.isInteger(mesaQ) && mesaQ >= 1 && mesaQ <= 99) {
    var localR = order.querySelector('input[name="modo"][value="local"]');
    if (localR) { localR.checked = true; order.elements.mesa.value = String(mesaQ); }
  }

  function orderMessage() {
    var f = order.elements;
    var lines = ["Olá, Chef Burger. Quero fazer um pedido.", ""];
    cart.forEach(function (i) { lines.push(i.qty + "× " + i.name + (i.variant ? " (" + i.variant + ")" : "") + " — " + kz(i.qty * i.kz)); });
    lines.push("", "Total: " + kz(totals().kz));
    if (cart.some(function (i) { return i.cat === "pizzas"; })) lines.push("As pizzas levam o preço escolhido na carta; confirmem o tamanho, por favor.");
    lines.push("");
    if (mode() === "entrega") lines.push("Entrega em: " + (f.morada.value.trim() || "…"));
    else if (mode() === "levantar") lines.push("Vou levantar no Quarteirão W17.");
    else lines.push("No local, mesa " + (f.mesa.value || "…") + ".");
    if (mode() !== "local" && f.nome.value.trim()) lines.push("Nome: " + f.nome.value.trim());
    if (mode() !== "local" && f.telefone.value.trim()) lines.push("Telefone: " + f.telefone.value.trim());
    if (f.nota.value.trim()) lines.push("Nota: " + f.nota.value.trim());
    return lines.join("\n");
  }
  function updatePreview() { if (preview) preview.textContent = cart.length ? orderMessage() : ""; }
  order.addEventListener("input", updatePreview);

  function setErr(form, name, msg) {
    var input = form.elements[name];
    var out = form.querySelector('[data-err="' + name + '"]');
    if (input) { if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); }
    if (out) out.textContent = msg || "";
    if (input && out) { if (!out.id) out.id = (form.hasAttribute("data-reserva") ? "err-r-" : "err-o-") + name; input.setAttribute("aria-describedby", out.id); }
    return !msg;
  }
  function phoneOk(v) { return v.replace(/\D/g, "").length >= 9; }
  function sendWA(text) {
    var url = "https://wa.me/" + WA + "?text=" + encodeURIComponent(text);
    var w = window.open(url, "_blank", "noopener");
    if (!w) window.location.href = url;
  }

  var waitEl = $("[data-order-wait]");
  var okEl = $("[data-order-ok]");
  var failEl = $("[data-order-fail]");
  var sendBtn = $("[data-send]");
  var waFallback = $("[data-wa-fallback]");
  function phase(name) {
    if (sheet) sheet.dataset.phase = name || "form";
    if (waitEl) waitEl.hidden = name !== "wait";
    if (okEl) okEl.hidden = name !== "ok";
    if (failEl) failEl.hidden = name !== "fail";
    if (sendBtn) sendBtn.disabled = name === "wait";
  }
  function celebrate() {
    if (reduced() || !document.body) return;
    var c = document.createElement("canvas");
    c.className = "confetti";
    c.setAttribute("aria-hidden", "true");
    document.body.appendChild(c);
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    c.style.width = innerWidth + "px"; c.style.height = innerHeight + "px";
    var ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    var colors = ["#c41e2a", "#f4efe6", "#141518", "#a51722", "#ebe3d6"];
    var cx = innerWidth / 2, cy = Math.min(innerHeight * 0.42, 360);
    var bits = [];
    for (var i = 0; i < 52; i++) {
      var a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
      bits.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4, w: 5 + Math.random() * 5, h: 3 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, color: colors[i % colors.length], life: 1 });
    }
    var t0 = performance.now();
    function frame(now) {
      var dt = Math.min(32, now - t0) / 16.6; t0 = now;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      var alive = false;
      bits.forEach(function (b) {
        b.vy += 0.22 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.r += b.vr * dt; b.life -= 0.018 * dt;
        if (b.life <= 0) return;
        alive = true;
        ctx.save(); ctx.globalAlpha = Math.max(0, b.life); ctx.translate(b.x, b.y); ctx.rotate(b.r);
        ctx.fillStyle = b.color; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
      });
      if (alive) requestAnimationFrame(frame);
      else c.remove();
    }
    requestAnimationFrame(frame);
    setTimeout(function () { if (c.parentNode) c.remove(); }, 1400);
  }
  function showOk(numero) {
    phase("ok");
    var n = $("[data-order-num]");
    if (n) n.textContent = String(numero);
    if (!reduced()) {
      var mark = okEl && okEl.querySelector(".ok-mark");
      if (mark && mark.animate) mark.animate(
        [{ transform: "scale(0.4)", opacity: 0 }, { transform: "scale(1.08)", opacity: 1, offset: 0.7 }, { transform: "scale(1)", opacity: 1 }],
        { duration: 640, easing: "linear", fill: "forwards" }
      );
    }
    celebrate();
  }
  if (waFallback) waFallback.addEventListener("click", function () { sendWA(orderMessage()); say("Abrimos o WhatsApp com o pedido. Só fica confirmado quando a equipa responder."); });
  if (order) order.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sheet && sheet.dataset.phase === "ok") return;
    var f = order.elements, ok = true, first = null;
    function check(name, msg) { var good = setErr(order, name, msg); if (!good) { ok = false; first = first || f[name]; } }
    var m = mode();
    check("mesa", m === "local" && !(Number(f.mesa.value) >= 1 && Number(f.mesa.value) <= 99) ? "Indique o número da mesa (1 a 99)." : "");
    check("morada", m === "entrega" && !f.morada.value.trim() ? "Escreva a morada de entrega." : "");
    check("nome", m !== "local" && !f.nome.value.trim() ? "Escreva o seu nome." : "");
    check("telefone", m !== "local" && !phoneOk(f.telefone.value) ? "Escreva um telefone com pelo menos 9 algarismos." : "");
    if (!ok) { phase("form"); first.focus(); return; }
    var body = {
      items: cart.map(function (i) { return { id: i.key, nome: i.name, qtd: i.qty, preco: i.kz }; }),
      tipo: m,
      mesa: m === "local" ? Number(f.mesa.value) : undefined,
      nome: f.nome.value.trim(),
      telefone: f.telefone.value.trim(),
      morada: f.morada.value.trim(),
      nota: f.nota.value.trim()
    };
    var waiting = setTimeout(function () { phase("wait"); }, 800);
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "A enviar…"; }
    var ctrl = new AbortController();
    var kill = setTimeout(function () { ctrl.abort(); }, 55000);
    fetch(PEDIDOS_API + "/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, d: d }; });
    }).then(function (res) {
      clearTimeout(waiting); clearTimeout(kill);
      if (!res.ok) throw new Error((res.d && res.d.erro) || "Não foi possível enviar à cozinha.");
      cart = [];
      save(); paintButtons(); paintCounts(); renderCart();
      showOk(res.d.numero);
      say("Pedido n.º " + res.d.numero + " enviado à cozinha.");
    }).catch(function (err) {
      clearTimeout(waiting); clearTimeout(kill);
      phase("fail");
      var msg = $("[data-fail-msg]");
      if (msg) msg.textContent = (err && err.message ? err.message : "Não foi possível enviar à cozinha.") + " Pode enviar o mesmo pedido pelo WhatsApp.";
      say("Não foi possível enviar à cozinha. Pode usar o WhatsApp.");
    }).finally(function () {
      if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Enviar pedido"; }
    });
  });

  /* ---------- Folha: abrir, fechar, arrastar ---------- */
  var sheetOpen = false;
  var lastFocus = null;
  var travel = function () { return wideQ.matches ? panel.offsetWidth + 24 : panel.offsetHeight; };
  // p: 0 aberto, 1 fechado
  var sheetP = new Spring(1, function (p) {
    var d = p * travel();
    panel.style.transform = wideQ.matches ? "translateX(" + d + "px)" : "translateY(" + d + "px)";
    scrim.style.opacity = String(clamp(1 - p, 0, 1));
  });
  function resetPhase() { if (okEl && !okEl.hidden) { phase("form"); } else if (failEl && !failEl.hidden) { phase("form"); } }
  function openSheet() {
    if (sheetOpen) return;
    sheetOpen = true;
    lastFocus = document.activeElement;
    renderCart();
    sheet.hidden = false;
    document.documentElement.style.overflow = "hidden";
    sheetP.set(1);
    requestAnimationFrame(function () {
      sheetP.to(0, { damping: 1, response: 0.42 });
      panel.focus({ preventScroll: true });
    });
  }
  function closeSheet(velocity) {
    if (!sheetOpen) return;
    sheetOpen = false;
    var opts = velocity != null ? { damping: 1, response: 0.32, velocity: velocity } : { damping: 1, response: 0.36 };
    opts.done = function () { if (!sheetOpen) { sheet.hidden = true; document.documentElement.style.overflow = ""; if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); } };
    sheetP.to(1, opts);
  }
  $$("[data-open-cart]").forEach(function (b) { b.addEventListener("click", openSheet); });
  sheet.addEventListener("click", function (e) {
    var c = e.target.closest("[data-close]");
    if (!c) return;
    if (c.tagName === "A") { closeSheet(); return; }
    closeSheet();
  });
  document.addEventListener("keydown", function (e) {
    if (!sheetOpen) return;
    if (e.key === "Escape") { e.preventDefault(); closeSheet(); return; }
    if (e.key === "Tab") {
      var f = $$('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])', panel).filter(function (el) { return !el.disabled && el.offsetParent !== null; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  // Arrasto 1:1, elástico na borda, projeção de momento e velocidade passada à mola.
  function rubberband(over, dim) { var c = 0.55; return (over * dim * c) / (dim + c * Math.abs(over)); }
  function project(v, d) { d = d || 0.998; return (v / 1000) * d / (1 - d); }
  var body = $("[data-sheet-body]");
  var drag = null;
  panel.addEventListener("pointerdown", function (e) {
    if (wideQ.matches || !sheetOpen || drag) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    var inBody = body.contains(e.target);
    if (e.target.closest("input, select, textarea, button, a, summary, label")) return;
    if (inBody && body.scrollTop > 0) return;
    drag = { id: e.pointerId, y0: e.clientY, start: sheetP.x * travel(), last: [{ y: e.clientY, t: e.timeStamp }], moved: false, inBody: inBody };
  });
  panel.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dy = e.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.abs(dy) < 8) return;
      if (drag.inBody && dy < 0) { drag = null; return; }
      drag.moved = true;
      try { panel.setPointerCapture(e.pointerId); } catch (err) {}
      cancelAnimationFrame(sheetP.raf); sheetP.raf = 0;
    }
    var h = travel();
    var y = drag.start + dy;
    if (y < 0) y = rubberband(y, h);
    sheetP.x = y / h; sheetP.v = 0; sheetP.onUpdate(sheetP.x);
    drag.last.push({ y: e.clientY, t: e.timeStamp });
    if (drag.last.length > 6) drag.last.shift();
    if (e.cancelable) e.preventDefault();
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag; drag = null;
    if (!d.moved) return;
    var a = d.last[0], b = d.last[d.last.length - 1];
    var dt = Math.max(1, b.t - a.t);
    var v = ((b.y - a.y) / dt) * 1000; // px/s
    var h = travel();
    var y = sheetP.x * h;
    var projected = y + project(v);
    var flick = v / 1000 > 0.4 && y > 24;
    if (projected > h * 0.45 || flick) closeSheet(v / h);
    else sheetP.to(0, { damping: 0.8, response: 0.3, velocity: v / h });
  }
  panel.addEventListener("pointerup", endDrag);
  panel.addEventListener("pointercancel", endDrag);
  wideQ.addEventListener("change", function () { sheetP.set(sheetOpen ? 0 : 1); });

  paintButtons(); paintCounts(); renderCart(); paintMode();

  // O pedido é o mesmo em todas as páginas: volta a ler-se ao regressar (bfcache) ou se mudar noutro separador.
  function reloadCart() {
    try {
      var s2 = JSON.parse(localStorage.getItem(STORE) || "[]");
      cart = Array.isArray(s2) ? s2.filter(function (i) { return i && i.key && i.qty > 0 && i.kz > 0; }) : [];
    } catch (e) { cart = []; }
    paintButtons(); paintCounts(); renderCart();
  }
  window.addEventListener("pageshow", function (e) { if (e.persisted) reloadCart(); });
  window.addEventListener("storage", function (e) { if (e.key === STORE) reloadCart(); });

  /* ---------- Reserva ---------- */
  var reserva = $("[data-reserva]");
  if (reserva) {
    var pessoas = $("[data-pessoas]");
    var pessoasOut = $("[data-pessoas-out]");
    var dataInput = $("[data-data]");
    var hora = $("[data-hora]");
    var daysBox = $("[data-days-pick]");
    var MAXP = 12;
    function paintPessoas() {
      var n = Number(pessoas.value);
      pessoasOut.textContent = n + (n === 1 ? " pessoa" : " pessoas");
      reserva.querySelector('[data-step="-1"]').disabled = n <= 1;
      reserva.querySelector('[data-step="1"]').disabled = n >= MAXP;
    }
    $$("[data-step]", reserva).forEach(function (b) {
      b.addEventListener("click", function () { pessoas.value = clamp(Number(pessoas.value) + Number(b.dataset.step), 1, MAXP); paintPessoas(); pop(pessoasOut, 0.6); });
    });
    paintPessoas();

    function addDays(iso, n) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
    function dayLabel(iso, i) {
      var d = new Date(iso + "T12:00:00Z");
      var wd = d.toLocaleDateString("pt-PT", { weekday: "short", timeZone: "UTC" }).replace(".", "");
      var dm = d.toLocaleDateString("pt-PT", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
      var top = i === 0 ? "Hoje" : i === 1 ? "Amanhã" : wd.charAt(0).toUpperCase() + wd.slice(1);
      return { top: top, sub: dm };
    }
    function buildDays() {
      var today = luanda();
      var start = 0;
      if (today.minutes + 60 > BOOK_LAST) start = 1;
      daysBox.innerHTML = "";
      for (var i = start; i < start + 7; i++) {
        var iso = addDays(today.iso, i);
        var l = dayLabel(iso, i);
        var lab = document.createElement("label"); lab.className = "day";
        lab.innerHTML = '<input type="radio" name="dia" value="' + iso + '"><span></span>';
        var sp = lab.querySelector("span");
        sp.textContent = l.top;
        var sm = document.createElement("small"); sm.textContent = l.sub; sp.appendChild(sm);
        daysBox.appendChild(lab);
      }
      $$('input[name="dia"]', daysBox).forEach(function (r) { r.addEventListener("change", function () { dataInput.value = r.value; buildSlots(); setErr(reserva, "hora", ""); }); });
    }
    function slotsFor(iso) {
      var today = luanda();
      var list = [];
      for (var m = OPEN; m <= BOOK_LAST; m += 30) {
        if (iso === today.iso && m < today.minutes + 60) continue;
        list.push(String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"));
      }
      return list;
    }
    function buildSlots() {
      var cur = hora.value;
      hora.innerHTML = "";
      var iso = dataInput.value;
      if (!iso) { hora.innerHTML = '<option value="">Escolha primeiro o dia</option>'; hora.disabled = true; return; }
      var s = slotsFor(iso);
      hora.disabled = !s.length;
      var blank = document.createElement("option"); blank.value = ""; blank.textContent = s.length ? "Escolha a hora" : "Sem horas livres neste dia"; hora.appendChild(blank);
      s.forEach(function (v) { var o = document.createElement("option"); o.value = v; o.textContent = v.replace(":", "h"); hora.appendChild(o); });
      if (s.indexOf(cur) !== -1) hora.value = cur;
    }
    buildDays(); buildSlots();
    function longDate(iso) { return new Date(iso + "T12:00:00Z").toLocaleDateString("pt-PT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }); }
    reserva.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = reserva.elements, ok = true, first = null;
      function check(name, msg, el) { var good = setErr(reserva, name, msg); if (!good) { ok = false; first = first || el || f[name]; } }
      if (!dataInput.value) { check("hora", "Escolha o dia e depois a hora.", daysBox.querySelector("input")); }
      else check("hora", !hora.value ? "Escolha a hora." : "");
      check("nome", !f.nome.value.trim() ? "Escreva o seu nome." : "");
      check("telefone", !phoneOk(f.telefone.value) ? "Escreva um telefone com pelo menos 9 algarismos." : "");
      if (!ok) { first.focus(); return; }
      var lines = ["Olá, Chef Burger. Quero reservar uma mesa.", "", "Dia: " + longDate(dataInput.value), "Hora: " + hora.value.replace(":", "h"), "Pessoas: " + pessoas.value, "Nome: " + f.nome.value.trim(), "Telefone: " + f.telefone.value.trim()];
      if (f.nota.value.trim()) lines.push("Notas: " + f.nota.value.trim());
      sendWA(lines.join("\n"));
      say("Abrimos o WhatsApp com a reserva. Fica marcada quando a equipa responder.");
    });
  }
})();
