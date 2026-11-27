/* Chef Burger — pedido, reserva e horário. Sem servidor: tudo sai pelo WhatsApp. */
(function () {
  "use strict";

  var WA = "244925918468";
  var OPEN = 8 * 60;
  var BOOK_LAST = 21 * 60 + 30;
  var BREAKFAST_END = 14 * 60;
  var STORE = "chefburger-pedido";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var sideQuery = window.matchMedia("(min-width: 960px)");

  function kz(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " Kz";
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function luanda(date) {
    var fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Luanda",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    var o = {};
    fmt.formatToParts(date || new Date()).forEach(function (p) {
      o[p.type] = p.value;
    });
    o.minutes = Number(o.hour) * 60 + Number(o.minute);
    o.iso = o.year + "-" + o.month + "-" + o.day;
    o.weekend = o.weekday === "Fri" || o.weekday === "Sat" || o.weekday === "Sun";
    o.close = o.weekend ? 23 * 60 + 30 : 22 * 60 + 30;
    o.open = o.minutes >= OPEN && o.minutes < o.close;
    return o;
  }

  function closeLabel(weekend) {
    return weekend ? "23h30" : "22h30";
  }

  function addDays(iso, days) {
    var d = new Date(iso + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function formatDate(iso) {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("pt-PT", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function slots() {
    var list = [];
    for (var m = OPEN; m <= BOOK_LAST; m += 30) {
      var h = String(Math.floor(m / 60)).padStart(2, "0");
      var min = String(m % 60).padStart(2, "0");
      list.push(h + ":" + min);
    }
    return list;
  }

  var SLOT_LIST = slots();

  function paintStatus() {
    var now = luanda();
    var text;
    if (now.open && now.minutes < BREAKFAST_END) {
      text = "Aberto agora · matabicho até às 14h00";
    } else if (now.open) {
      text = "Aberto agora · até às " + closeLabel(now.weekend);
    } else if (now.minutes < OPEN) {
      text = "Fechado · abre hoje às 08h00";
    } else {
      text = "Fechado · abre amanhã às 08h00";
    }
    document.querySelectorAll("[data-status-text]").forEach(function (el) {
      el.textContent = text;
    });
    document.querySelectorAll("[data-status-short]").forEach(function (el) {
      el.textContent = now.open ? "Aberto" : "Fechado";
    });
    document.querySelectorAll("[data-status]").forEach(function (el) {
      el.dataset.open = now.open ? "true" : "false";
    });
  }

  paintStatus();
  setInterval(paintStatus, 30000);

  var search = document.querySelector("[data-search]");
  var empty = document.querySelector("[data-empty]");
  var dishes = Array.prototype.slice.call(document.querySelectorAll("[data-dish]"));

  function filterMenu() {
    var q = norm(search.value);
    var shown = 0;
    document.querySelectorAll("[data-category]").forEach(function (cat) {
      var any = false;
      cat.querySelectorAll("[data-dish]").forEach(function (dish) {
        var ok = !q || dish.dataset.search.indexOf(q) !== -1;
        dish.hidden = !ok;
        if (ok) {
          any = true;
          shown += 1;
        }
      });
      cat.hidden = !any;
      var link = document.querySelector('[data-catlink="' + cat.id + '"]');
      if (link) link.hidden = !any;
    });
    empty.hidden = shown !== 0 || !q;
    if (!shown && q) empty.textContent = "Nada na ementa com «" + search.value.trim() + "».";
  }

  if (search) search.addEventListener("input", filterMenu);

  var catLinks = Array.prototype.slice.call(document.querySelectorAll("[data-catlink]"));
  var currentId = "";

  function setCurrent(id) {
    if (id === currentId) return;
    currentId = id;
    catLinks.forEach(function (link) {
      var on = link.dataset.catlink === id;
      if (on) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
    var link = document.querySelector('[data-catlink="' + id + '"]');
    if (!link || link.hidden) return;
    var scroller = link.parentElement;
    var left = link.offsetLeft - (scroller.clientWidth - link.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: reduced ? "auto" : "smooth" });
  }

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        var visible = entries
          .filter(function (e) { return e.isIntersecting; })
          .sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; });
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0.1, 0.25, 0.5] }
    );
    document.querySelectorAll("[data-category]").forEach(function (cat) { observer.observe(cat); });
  }

  var cart = [];
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || "[]");
    if (Array.isArray(saved)) {
      cart = saved.filter(function (item) {
        return item && item.key && item.qty > 0 && item.kz > 0 && item.name;
      });
    }
  } catch (err) { cart = []; }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch (err) { /* private mode */ }
  }

  function count() {
    return cart.reduce(function (n, item) { return n + item.qty; }, 0);
  }

  function total() {
    return cart.reduce(function (n, item) { return n + item.qty * item.kz; }, 0);
  }

  var listEl = document.querySelector("[data-cart-list]");
  var emptyCart = document.querySelector("[data-cart-empty]");
  var dock = document.querySelector("[data-dock]");
  var dockText = document.querySelector("[data-dock-text]");
  var totalEl = document.querySelector("[data-cart-total]");
  var previewEl = document.querySelector("[data-order-preview]");
  var orderErrors = document.querySelector("[data-order-errors]");
  var live = document.querySelector("[data-live]");
  var orderForm = document.querySelector("[data-order-form]");

  function say(message) {
    if (live) live.textContent = message;
  }

  function renderCart() {
    if (!listEl) return;
    listEl.innerHTML = cart.map(function (item) {
      var who = item.variant ? esc(item.name) + " <span class=\"dish__size\">" + esc(item.variant) + "</span>" : esc(item.name);
      return (
        "<li data-key=\"" + esc(item.key) + "\">" +
          "<div class=\"cart__top\"><span class=\"cart__name\">" + who + "</span>" +
          "<span class=\"cart__price\">" + esc(kz(item.qty * item.kz)) + "</span></div>" +
          "<div class=\"cart__row\">" +
            "<div class=\"qty\">" +
              "<button type=\"button\" class=\"step\" data-dec=\"" + esc(item.key) + "\" aria-label=\"Menos um " + esc(item.name) + "\">−</button>" +
              "<span>" + item.qty + "</span>" +
              "<button type=\"button\" class=\"step\" data-inc=\"" + esc(item.key) + "\" aria-label=\"Mais um " + esc(item.name) + "\"" + (item.qty >= 20 ? " disabled" : "") + ">+</button>" +
            "</div>" +
            "<button type=\"button\" class=\"ghost\" data-remove=\"" + esc(item.key) + "\">Tirar</button>" +
          "</div>" +
          "<label class=\"field\"><span>Nota para a cozinha</span>" +
            "<textarea class=\"note\" data-note=\"" + esc(item.key) + "\" maxlength=\"140\" rows=\"2\" placeholder=\"Sem cebola, bem passado…\">" + esc(item.note || "") + "</textarea>" +
          "</label>" +
        "</li>"
      );
    }).join("");
    if (emptyCart) emptyCart.hidden = cart.length !== 0;
    if (totalEl) totalEl.textContent = cart.length ? "Total dos pratos: " + kz(total()) : "Sem pratos no pedido.";
    updateDock();
    updateOrderPreview();
  }

  function updateDock() {
    var n = count();
    document.body.classList.toggle("has-dock", n > 0);
    if (!dock) return;
    dock.hidden = n === 0;
    if (dockText) {
      dockText.textContent = "Ver pedido · " + n + (n === 1 ? " artigo · " : " artigos · ") + kz(total());
    }
  }

  function field(name) {
    return orderForm.elements.namedItem(name);
  }

  function orderMode() {
    var checked = orderForm.querySelector('input[name="modo"]:checked');
    return checked ? checked.value : "entrega";
  }

  function buildOrderMessage() {
    var nome = field("nome").value.trim();
    var tel = field("telefone").value.trim();
    var morada = field("morada").value.trim();
    var nota = field("nota").value.trim();
    var modo = orderMode();
    var lines = ["Olá, Chef Burger. Quero fazer um pedido.", ""];
    if (modo === "entrega") {
      lines.push("*Entrega ao domicílio*");
      if (nome) lines.push("Nome: " + nome);
      if (tel) lines.push("Telefone: " + tel);
      if (morada) lines.push("Morada: " + morada);
    } else {
      lines.push("*Levantamento no restaurante*");
      lines.push("Quarteirão W17, Centralidade do Kilamba");
      if (nome) lines.push("Nome: " + nome);
      if (tel) lines.push("Telefone: " + tel);
    }
    lines.push("", "*Pedido*");
    cart.forEach(function (item) {
      var who = item.variant ? item.name + ", " + item.variant : item.name;
      if (item.qty > 1) lines.push(item.qty + " × " + who + " — " + kz(item.kz) + " cada (" + kz(item.qty * item.kz) + ")");
      else lines.push("1 × " + who + " — " + kz(item.kz));
      if (item.note) lines.push("   Nota: " + item.note);
    });
    lines.push("", "*Total dos pratos: " + kz(total()) + "*");
    if (modo === "entrega") lines.push("A taxa de entrega fica confirmada pela equipa.");
    else lines.push("Vou levantar no restaurante.");
    var now = luanda();
    if (cart.some(function (item) { return item.cat === "cat-matabicho"; }) && (now.minutes < OPEN || now.minutes >= BREAKFAST_END)) {
      lines.push("Inclui matabicho, servido das 08h00 às 14h00. A equipa confirma.");
    }
    if (cart.some(function (item) { return item.cat === "cat-pizzas" && !item.variant; })) {
      lines.push("A pizza leva o preço escolhido na carta. O tamanho não vem publicado.");
    }
    if (nota) lines.push("", "Nota do pedido: " + nota);
    if (!now.open) lines.push("", "Estamos fechados neste momento. A equipa responde quando abrir, a partir das 08h00.");
    lines.push("", "Obrigado.");
    return lines.join("\n");
  }

  function updateOrderPreview() {
    if (!previewEl) return;
    previewEl.textContent = cart.length ? buildOrderMessage() : "Escolha pratos na ementa para ver aqui a mensagem.";
  }

  function showErrors(el, messages) {
    if (!el) return;
    el.innerHTML = messages.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("");
    el.hidden = messages.length === 0;
  }

  function validateOrder() {
    var messages = [];
    if (!cart.length) messages.push("O pedido está vazio. Junte um prato na ementa.");
    if (field("nome").value.trim().length < 2) messages.push("Indique o seu nome.");
    var digits = field("telefone").value.replace(/\D/g, "");
    if (digits.length < 9) messages.push("Indique um telemóvel com pelo menos 9 dígitos.");
    if (orderMode() === "entrega" && field("morada").value.trim().length < 5) {
      messages.push("Indique a morada de entrega.");
    }
    return messages;
  }

  function syncAddress() {
    var box = document.querySelector("[data-address]");
    if (box) box.hidden = orderMode() !== "entrega";
    updateOrderPreview();
  }

  document.querySelectorAll("[data-add]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var key = btn.dataset.key;
      var item = cart.find(function (entry) { return entry.key === key; });
      if (item) {
        if (item.qty < 20) item.qty += 1;
      } else {
        cart.push({
          key: key,
          name: btn.dataset.name,
          variant: btn.dataset.variant || "",
          kz: Number(btn.dataset.kz),
          qty: 1,
          note: "",
          cat: btn.dataset.cat,
        });
      }
      save();
      renderCart();
      say(btn.dataset.name + " juntou-se ao pedido");
    });
  });

  if (listEl) {
    listEl.addEventListener("click", function (event) {
      var dec = event.target.closest("[data-dec]");
      var inc = event.target.closest("[data-inc]");
      var remove = event.target.closest("[data-remove]");
      var key = (dec || inc || remove || {}).dataset;
      if (!key) return;
      key = dec ? dec.dataset.dec : inc ? inc.dataset.inc : remove.dataset.remove;
      var item = cart.find(function (entry) { return entry.key === key; });
      if (!item) return;
      if (remove || (dec && item.qty <= 1)) cart = cart.filter(function (entry) { return entry.key !== key; });
      else if (dec) item.qty -= 1;
      else if (inc && item.qty < 20) item.qty += 1;
      save();
      renderCart();
    });
    listEl.addEventListener("input", function (event) {
      var input = event.target.closest("[data-note]");
      if (!input) return;
      var item = cart.find(function (entry) { return entry.key === input.dataset.note; });
      if (!item) return;
      item.note = input.value;
      save();
      updateOrderPreview();
    });
  }

  if (orderForm) {
    orderForm.addEventListener("input", function () {
      syncAddress();
      showErrors(orderErrors, []);
    });
    orderForm.addEventListener("change", syncAddress);
    orderForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var messages = validateOrder();
      showErrors(orderErrors, messages);
      if (messages.length) {
        orderErrors.focus();
        return;
      }
      openWhatsApp(buildOrderMessage());
    });
  }

  function openWhatsApp(text) {
    var url = "https://wa.me/" + WA + "?text=" + encodeURIComponent(text);
    var a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  var sheet = document.querySelector("[data-sheet]");
  var panel = document.querySelector("[data-panel]");
  var handle = document.querySelector("[data-handle]");
  var offset = 0;
  var springFrame = 0;
  var lockY = 0;
  var dragging = false;
  var dragOrigin = 0;
  var dragStart = 0;
  var moves = [];

  function isSide() { return sideQuery.matches; }

  function span() {
    if (!panel) return 0;
    return isSide() ? panel.offsetWidth : panel.offsetHeight;
  }

  function apply(value) {
    offset = value;
    if (!panel) return;
    if (isSide()) panel.style.transform = "translate3d(" + value + "px,0,0)";
    else panel.style.transform = "translate3d(0," + value + "px,0)";
    var overlay = document.querySelector("[data-overlay]");
    var size = span() || 1;
    if (overlay) overlay.style.opacity = String(Math.max(0, Math.min(1, 1 - value / size)));
  }

  function springTo(target, velocity, fromDrag) {
    cancelAnimationFrame(springFrame);
    if (reduced) {
      apply(target);
      if (target > 8) finishClose();
      return;
    }
    var stiffness = 380;
    var damping = fromDrag ? 28 : 40;
    var v = velocity || 0;
    var last = performance.now();
    function frame(now) {
      var dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      var a = -stiffness * (offset - target) - damping * v;
      v += a * dt;
      apply(offset + v * dt);
      if (Math.abs(offset - target) < 0.7 && Math.abs(v) < 14) {
        apply(target);
        if (target > 8) finishClose();
        return;
      }
      springFrame = requestAnimationFrame(frame);
    }
    springFrame = requestAnimationFrame(frame);
  }

  function lock() {
    lockY = window.scrollY || 0;
    document.body.style.top = "-" + lockY + "px";
    document.body.classList.add("lock");
  }

  function unlock() {
    document.body.classList.remove("lock");
    document.body.style.top = "";
    window.scrollTo(0, lockY);
  }

  var opener = null;

  function openSheet() {
    if (!sheet || !panel) return;
    opener = document.activeElement;
    sheet.hidden = false;
    lock();
    requestAnimationFrame(function () {
      var size = span();
      apply(size);
      requestAnimationFrame(function () { springTo(0, 0, false); });
    });
    var closeBtn = sheet.querySelector("[data-close-btn]");
    if (closeBtn) closeBtn.focus();
  }

  function finishClose() {
    if (!sheet) return;
    sheet.hidden = true;
    apply(0);
    unlock();
    if (opener && opener.focus) opener.focus();
  }

  function closeSheet() {
    springTo(span() || 600, 0, false);
  }

  document.querySelectorAll("[data-open-cart]").forEach(function (btn) {
    btn.addEventListener("click", openSheet);
  });
  document.querySelectorAll("[data-close]").forEach(function (el) {
    el.addEventListener("click", closeSheet);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && sheet && !sheet.hidden) closeSheet();
    if (event.key !== "Tab" || !sheet || sheet.hidden) return;
    var nodes = Array.prototype.slice.call(panel.querySelectorAll("a, button, input, select, textarea")).filter(function (el) {
      return !el.disabled && el.offsetParent !== null;
    });
    if (!nodes.length) return;
    var first = nodes[0];
    var last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  if (handle) {
    handle.addEventListener("pointerdown", function (event) {
      if (isSide()) return;
      dragging = true;
      cancelAnimationFrame(springFrame);
      handle.setPointerCapture(event.pointerId);
      dragOrigin = offset;
      dragStart = event.clientY;
      moves = [{ t: performance.now(), y: event.clientY }];
    });
    handle.addEventListener("pointermove", function (event) {
      if (!dragging) return;
      var dy = event.clientY - dragStart;
      var next = dragOrigin + dy;
      if (next < 0) {
        var dim = span() || 1;
        next = (next * dim * 0.55) / (dim + 0.55 * Math.abs(next));
      }
      apply(next);
      moves.push({ t: performance.now(), y: event.clientY });
      if (moves.length > 6) moves.shift();
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      var recent = moves.filter(function (m) { return performance.now() - m.t < 90; });
      var velocity = 0;
      if (recent.length >= 2) {
        var a = recent[0];
        var b = recent[recent.length - 1];
        var dt = (b.t - a.t) / 1000;
        if (dt > 0) velocity = (b.y - a.y) / dt;
      }
      var size = span();
      if (offset > size * 0.38 || velocity > 850) springTo(size + 24, Math.max(velocity, 0), true);
      else springTo(0, velocity, true);
    }
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
  }

  var reserva = document.querySelector("[data-reserva]");
  if (reserva) {
    var dataInput = reserva.querySelector("[name=data]");
    var hora = reserva.querySelector("[name=hora]");
    var pessoasN = reserva.querySelector("[data-pessoas-n]");
    var pessoasInput = reserva.querySelector("[name=pessoas]");
    var reservaPreview = reserva.querySelector("[data-reserva-preview]");
    var reservaErrors = reserva.querySelector("[data-reserva-errors]");
    var now = luanda();
    dataInput.min = now.iso;
    dataInput.max = addDays(now.iso, 60);

    function setPessoas(n) {
      n = Math.max(1, Math.min(12, n));
      pessoasInput.value = String(n);
      pessoasN.textContent = n + (n === 1 ? " pessoa" : " pessoas");
      reserva.querySelector("[data-menos]").disabled = n <= 1;
      reserva.querySelector("[data-mais]").disabled = n >= 12;
      updateReservaPreview();
    }

    function fillHours() {
      var iso = dataInput.value;
      var current = hora.value;
      hora.innerHTML = "";
      if (!iso) {
        var opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Escolha primeiro o dia";
        hora.appendChild(opt);
        hora.disabled = true;
        return;
      }
      var today = luanda();
      var usable = SLOT_LIST.filter(function (slot) {
        if (iso !== today.iso) return true;
        var parts = slot.split(":");
        var mins = Number(parts[0]) * 60 + Number(parts[1]);
        return mins >= today.minutes + 60;
      });
      hora.disabled = usable.length === 0;
      if (!usable.length) {
        var none = document.createElement("option");
        none.value = "";
        none.textContent = "Sem horários livres hoje";
        hora.appendChild(none);
        return;
      }
      var blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "Escolha a hora";
      hora.appendChild(blank);
      usable.forEach(function (slot) {
        var option = document.createElement("option");
        option.value = slot;
        option.textContent = slot.replace(":", "h");
        hora.appendChild(option);
      });
      if (usable.indexOf(current) !== -1) hora.value = current;
    }

    function updateReservaPreview() {
      var iso = dataInput.value;
      var time = hora.value;
      var nome = reserva.elements.namedItem("nome").value.trim();
      var tel = reserva.elements.namedItem("telefone").value.trim();
      var nota = reserva.elements.namedItem("nota").value.trim();
      var n = Number(pessoasInput.value || 2);
      if (!iso && !nome) {
        reservaPreview.textContent = "Preencha o dia, a hora e o contacto para ver a mensagem.";
        return;
      }
      var lines = ["Olá, Chef Burger. Quero reservar uma mesa.", ""];
      if (iso) lines.push("Data: " + formatDate(iso));
      if (time) lines.push("Hora: " + time);
      lines.push("Pessoas: " + n);
      if (nome) lines.push("Nome: " + nome);
      if (tel) lines.push("Telefone: " + tel);
      if (nota) lines.push("Notas: " + nota);
      lines.push("", "Quarteirão W17, Centralidade do Kilamba.");
      lines.push("A reserva só fica confirmada quando a equipa responder.");
      lines.push("", "Obrigado.");
      reservaPreview.textContent = lines.join("\n");
    }

    reserva.querySelector("[data-menos]").addEventListener("click", function () {
      setPessoas(Number(pessoasInput.value) - 1);
    });
    reserva.querySelector("[data-mais]").addEventListener("click", function () {
      setPessoas(Number(pessoasInput.value) + 1);
    });
    dataInput.addEventListener("change", function () {
      fillHours();
      updateReservaPreview();
    });
    reserva.addEventListener("input", updateReservaPreview);
    setPessoas(2);
    fillHours();

    reserva.addEventListener("submit", function (event) {
      event.preventDefault();
      var messages = [];
      var iso = dataInput.value;
      var today = luanda();
      if (!iso || iso < today.iso || iso > addDays(today.iso, 60)) messages.push("Escolha uma data entre hoje e os próximos 60 dias.");
      if (!hora.value) messages.push("Escolha um horário entre as 08h00 e as 21h30.");
      else if (iso === today.iso) {
        var parts = hora.value.split(":");
        var mins = Number(parts[0]) * 60 + Number(parts[1]);
        if (mins < today.minutes + 60) messages.push("Este horário já não está disponível. Escolha outro.");
      }
      var n = Number(pessoasInput.value);
      if (n < 1 || n > 12) messages.push("Online reservamos até 12 pessoas. Para grupos maiores, use o WhatsApp.");
      if (reserva.elements.namedItem("nome").value.trim().length < 2) messages.push("Indique o seu nome.");
      if (reserva.elements.namedItem("telefone").value.replace(/\D/g, "").length < 9) {
        messages.push("Indique um telemóvel com pelo menos 9 dígitos.");
      }
      showErrors(reservaErrors, messages);
      if (messages.length) return;
      updateReservaPreview();
      openWhatsApp(reservaPreview.textContent);
    });
  }

  syncAddress();
  renderCart();
})();
