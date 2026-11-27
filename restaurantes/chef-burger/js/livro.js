/* Chef Burger — a ementa é um livro. Vira-se com o dedo (arrastar ou um gesto rápido), tocando na borda
   da página, com as setas do teclado, ou pela barra de vidro, que abre o livro no capítulo.
   Motor: StPageFlip (js/vendor, com as correções de toque descritas lá).
   Endereço: #livro-<capítulo> acompanha a página com history.replaceState, sem criar entradas novas.
   Assim o Voltar sai do livro para onde se estava (o início), em vez de recuar página a página. */
(function () {
  "use strict";
  var el = document.querySelector("[data-book]");
  if (!el) return;
  var stage = document.querySelector("[data-book-stage]");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var pages = [], total = 0;
  function collect() { pages = Array.prototype.slice.call(el.querySelectorAll(":scope > .page")); total = pages.length; }
  collect();
  function whenReady(fn) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn); else fn(); }

  // Reparte cada capítulo pelas folhas que forem precisas para o tamanho de página deste ecrã.
  function paginate(w, h) {
    var probe = document.createElement("div");
    probe.className = "flipbook";
    probe.style.cssText = "position:fixed;left:-9999px;top:0;visibility:hidden;";
    document.body.appendChild(probe);
    var out = [];
    pages.forEach(function (src) {
      if (!src.dataset.catStart) { out.push(src); return; }
      var names = Array.prototype.slice.call(src.querySelectorAll(".page__dishes li"));
      var first = true, page, inn, ul;
      function open() {
        page = document.createElement("div");
        page.className = "page";
        page.dataset.catId = src.dataset.catId;
        page.style.cssText = "position:relative;width:" + w + "px;height:" + h + "px;";
        inn = document.createElement("div");
        inn.className = "page__in";
        if (first) {
          page.dataset.catStart = src.dataset.catStart;
          inn.appendChild(src.querySelector(".page__pic").cloneNode(true));
          inn.appendChild(src.querySelector(".page__t").cloneNode(true));
        } else {
          var run = document.createElement("p");
          run.className = "page__run";
          run.textContent = src.dataset.catTitle;
          inn.appendChild(run);
        }
        ul = document.createElement("ul");
        ul.className = "page__dishes";
        ul.setAttribute("role", "list");
        inn.appendChild(ul);
        page.appendChild(inn);
        probe.appendChild(page);
        first = false;
      }
      open();
      names.forEach(function (li) {
        var n = li.cloneNode(true);
        ul.appendChild(n);
        if (inn.scrollHeight > inn.clientHeight + 1 && ul.children.length > 1) {
          ul.removeChild(n);
          out.push(page);
          open();
          ul.appendChild(n);
        }
      });
      out.push(page);
    });
    out.forEach(function (p) { p.style.cssText = ""; });
    // Capa + folhas + contracapa: número par, para a contracapa fechar o livro. A folha "Bom apetite" só entra se faltar uma.
    var note = out.filter(function (p) { return p.classList.contains("page--note"); })[0];
    if (note && out.length % 2 === 1) out.splice(out.indexOf(note), 1);
    el.textContent = "";
    out.forEach(function (p) { el.appendChild(p); });
    probe.remove();
    collect();
  }

  function catIdxOf(i) {
    for (var k = Math.min(i, total - 1); k >= 0; k--) { var s = pages[k].dataset.catStart; if (s) return Number(s); }
    return 0;
  }
  function pageFromHash() {
    var m = /^#livro-([a-z0-9-]+)$/.exec(location.hash);
    if (!m) return 0;
    // Sem id nas páginas, de propósito: um id faria o navegador rolar até à folha e esconder o topo do livro.
    var p = el.querySelector('[data-cat-start][data-cat-id="' + m[1] + '"]');
    return p ? pages.indexOf(p) : 0;
  }
  function startOf(idx) {
    var p = el.querySelector('[data-cat-start="' + idx + '"]');
    return p ? pages.indexOf(p) : 0;
  }
  function sync(i) {
    var idx = catIdxOf(i);
    if (window.cbCatnav) window.cbCatnav(idx);
    var id = idx ? pages[startOf(idx)].dataset.catId : "";
    var want = id ? "#livro-" + id : "";
    if (location.hash !== want && !(want === "" && location.hash === "#livro")) {
      try { history.replaceState(history.state, "", location.pathname + location.search + want); } catch (e) {}
    }
  }

  var go = function () {}, next = go, prev = go;

  if (reduced || !window.St || !window.St.PageFlip) {
    // Movimento reduzido (ou sem a biblioteca): a ementa fica uma lista simples de nomes, por capítulos.
    el.classList.add("flipbook--list");
    go = function (i) {
      var p = pages[i];
      if (p) p.scrollIntoView({ block: "start" });
    };
    next = prev = function () {};
    var first = pageFromHash();
    if (first) requestAnimationFrame(function () { go(first); });
    whenReady(function () { if (window.cbCatnav) window.cbCatnav(catIdxOf(first)); });
  } else {
    // Mede depois de a letra (Archivo) carregar, para as folhas saírem certas.
    var fontsReady = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 1500); })]) : Promise.resolve();
    fontsReady.then(function () { whenReady(initFlip); });
  }

  function initFlip() {
    var phone = window.matchMedia("(max-width: 899px)").matches;
    var top = stage.getBoundingClientRect().top + window.scrollY;
    var avail = window.innerHeight - top - (phone ? 96 : 0) - 16;
    var w, h;
    if (phone) {
      w = Math.min(stage.clientWidth - 24, 440);
      h = Math.round(Math.max(380, Math.min(avail, w * 1.6)));
    } else {
      h = Math.round(Math.max(520, Math.min(avail, 680)));
      w = Math.round(h / 1.36);
    }
    paginate(w, h);
    var book = new window.St.PageFlip(el, {
      width: w, height: h, size: "fixed",
      showCover: true, usePortrait: true, drawShadow: true, maxShadowOpacity: 0.55,
      flippingTime: 720, mobileScrollSupport: true, swipeDistance: 24,
      clickEventForward: true, showPageCorners: !phone, disableFlipByClick: false, startZIndex: 1
    });
    book.loadFromHTML(pages);
    var start = pageFromHash();
    if (start) book.turnToPage(start);
    sync(start);

    var lastTurn = 0;
    book.on("changeState", function (e) { if (e.data !== "read") lastTurn = Date.now(); });
    book.on("flip", function (e) { sync(e.data); });
    next = function () { book.flipNext("bottom"); };
    prev = function () { book.flipPrev("bottom"); };
    go = function (i) {
      if (i === book.getCurrentPageIndex()) return;
      book.flip(i, "top");
    };
    // Tocar na borda da página vira; o meio fica livre para ler.
    el.addEventListener("click", function (e) {
      if (e.target.closest("a, button, input, select, label, [data-noflip]")) return;
      if (Date.now() - lastTurn < 500 || book.getState() !== "read") return;
      var r = el.getBoundingClientRect();
      var f = (e.clientX - r.left) / r.width;
      var edge = book.getOrientation() === "portrait" ? 0.3 : 0.18;
      var corner = e.clientY - r.top > r.height / 2 ? "bottom" : "top";
      if (f > 1 - edge) book.flipNext(corner);
      else if (f < edge) book.flipPrev(corner);
    });
    window.cbBook = { go: function (i) { go(i); }, pf: book };
    el.classList.add("is-ready");
  }

  document.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); next(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
  });

  // Mudar o capítulo no endereço (ex.: link de outra página para #livro-pizzas) abre o livro lá.
  window.addEventListener("hashchange", function () { go(pageFromHash()); });

  // A barra de vidro, nesta página, vira o livro até ao capítulo (sem trocar de página).
  document.querySelectorAll("[data-catnav] .chip").forEach(function (chip) {
    var idx = Number(chip.dataset.idx);
    chip.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      go(idx ? startOf(idx) : 0);
      if (window.cbCatnav) window.cbCatnav(idx);
    }, true);
  });
})();
