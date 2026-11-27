/* Chef Burger — reserva, horário e movimento. Sem servidor: pedidos e reservas saem pelo WhatsApp. */
(function () {
  "use strict";

  var WA = "244925918468";
  var OPEN = 8 * 60;
  var BREAKFAST_END = 14 * 60;
  var BOOK_LAST = 21 * 60 + 30;
  var rq = window.matchMedia("(prefers-reduced-motion: reduce)");
  var reduced = function () { return rq.matches; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };


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

  /* ---------- Ajudas para a reserva (WhatsApp) ---------- */
  // Sem preços na ementa não há carrinho: o pedido faz-se direto no WhatsApp (botão na barra de baixo).
  var live = $("[data-live]");
  function say(msg) { if (!live) return; live.textContent = ""; setTimeout(function () { live.textContent = msg; }, 30); }
  function pop(el, amount) {
    if (!el || reduced() || !el.animate) return;
    // Mola amostrada para keyframes: pequeno ressalto, porque o toque foi o impulso.
    var frames = [], x = 0, v = 9 * (amount || 1), k = Math.pow(2 * Math.PI / 0.32, 2), c = 4 * Math.PI * 0.55 / 0.32;
    for (var i = 0; i <= 30; i++) { frames.push({ transform: "scale(" + (1 + x * 0.05).toFixed(4) + ")" }); for (var s = 0; s < 4; s++) { var a = -k * x - c * v; v += a * 0.004; x += v * 0.004; } }
    frames.push({ transform: "scale(1)" });
    el.animate(frames, { duration: 480, easing: "linear" });
  }
  function setErr(form, name, msg) {
    var input = form.elements[name];
    var out = form.querySelector('[data-err="' + name + '"]');
    if (input) { if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); }
    if (out) out.textContent = msg || "";
    if (input && out) { if (!out.id) out.id = "err-r-" + name; input.setAttribute("aria-describedby", out.id); }
    return !msg;
  }
  function phoneOk(v) { return v.replace(/\D/g, "").length >= 9; }
  function sendWA(text) {
    var url = "https://wa.me/" + WA + "?text=" + encodeURIComponent(text);
    var w = window.open(url, "_blank", "noopener");
    if (!w) window.location.href = url;
  }

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
