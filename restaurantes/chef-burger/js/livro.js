/* Chef Burger — a ementa em livro. Virar com o dedo (StPageFlip, em js/vendor), setas, ou a barra de vidro. */
(function () {
  "use strict";
  var el = document.querySelector("[data-book]");
  if (!el) return;
  var stage = document.querySelector("[data-book-stage]");
  var where = document.querySelector("[data-book-where]");
  var prev = document.querySelector("[data-book-prev]");
  var next = document.querySelector("[data-book-next]");
  var pages = Array.prototype.slice.call(el.querySelectorAll(".page"));
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var total = pages.length;

  pages.forEach(function (p, i) { var n = p.querySelector(".page__no"); if (n) n.textContent = String(i); });

  function label(i) {
    var p = pages[i];
    if (!p) return "";
    if (i === 0) return "Capa";
    if (i === total - 1) return "Contracapa";
    var cat = p.dataset.catId ? p.querySelector(".page__t, .page__run") : null;
    var name = cat ? cat.childNodes[0].textContent.trim() : "";
    if (window.matchMedia("(max-width: 959px)").matches) return (name ? name + " · " : "") + i + "/" + (total - 2);
    return (name ? name + " · " : "") + "página " + i + " de " + (total - 2);
  }
  function catName(i) {
    var p = pages[i];
    var t = p && p.dataset.catId ? p.querySelector(".page__t, .page__run") : null;
    return t ? t.childNodes[0].textContent.trim() : "";
  }
  function catIdxOf(i) {
    for (var k = Math.min(i, total - 1); k >= 0; k--) { var c = pages[k].dataset.catStart; if (c) return Number(c); }
    return 0;
  }
  function pageFromHash() {
    var m = /^#livro-([a-z0-9-]+)$/.exec(location.hash);
    var p = m && el.querySelector('[data-cat-start][data-cat-id="' + m[1] + '"]');
    return p ? pages.indexOf(p) : 0;
  }
  // O endereço acompanha o capítulo com replaceState: sem entradas novas, o Voltar sai do livro.
  function sync(i) {
    // Duas páginas abertas: se a da direita abre um capítulo, é esse o capítulo à vista.
    if (book && book.getOrientation() === "landscape" && pages[i + 1] && pages[i + 1].dataset.catStart) i += 1;
    var idx = catIdxOf(i);
    if (window.cbCatnav) window.cbCatnav(idx);
    var p = idx ? el.querySelector('[data-cat-start="' + idx + '"]') : null;
    var want = p ? "#livro-" + p.dataset.catId : "";
    if (location.hash !== want && !(want === "" && location.hash === "#livro")) {
      try { history.replaceState(history.state, "", location.pathname + location.search + want); } catch (e) {}
    }
  }
  // js/site.js (barra de vidro) corre depois deste ficheiro: espera por ele antes de mexer no indicador.
  function whenReady(fn) { if (window.cbCatnav) fn(); else { document.addEventListener("DOMContentLoaded", fn); window.addEventListener("load", fn); } }
  function paint(i) {
    var spread = book ? book.getOrientation && book.getOrientation() === "landscape" : window.matchMedia("(min-width: 900px)").matches;
    if (spread && i > 0 && i < total - 1) {
      var a = i % 2 ? i : i - 1, b = Math.min(a + 1, total - 2);
      var na = catName(a), nb = catName(b);
      var names = na && nb && na !== nb ? na + " · " + nb : (nb || na);
      where.textContent = (names ? names + " · " : "") + "páginas " + a + "–" + b + " de " + (total - 2);
    } else where.textContent = label(i);
    prev.disabled = i <= 0;
    next.disabled = i >= total - 1;
  }

  var book = null, cur = 0;

  if (reduced || !window.St || !window.St.PageFlip) {
    // Movimento reduzido (ou sem a biblioteca): uma página de cada vez, troca por esbatimento.
    el.classList.add("flipbook--static");
    var step = function () { return window.matchMedia("(min-width: 900px)").matches && cur > 0 ? 2 : 1; };
    var show = function (i) {
      cur = Math.max(0, Math.min(total - 1, i));
      var wide = window.matchMedia("(min-width: 900px)").matches;
      if (wide && cur > 0 && cur % 2 === 0) cur -= 1; // abre em pares: 1-2, 3-4…
      pages.forEach(function (p, k) { p.hidden = !(k === cur || (wide && cur > 0 && k === cur + 1 && k < total - 1)); });
      paint(cur);
    };
    window.cbBook = { go: function (i) { show(i); } };
    var show0 = show; show = function (i) { show0(i); sync(cur); };
    prev.addEventListener("click", function () { show(cur - step()); });
    next.addEventListener("click", function () { show(cur + step()); });
    show(pageFromHash());
    whenReady(function () { sync(cur); });
  } else {
    var phone = window.matchMedia("(max-width: 899px)").matches;
    var w = phone ? Math.min(stage.clientWidth - 24, 440) : 450;
    var h = phone ? Math.max(Math.round(w * 1.56), Math.round(190000 / w)) : Math.round(w * 1.38); // telemóveis estreitos: a página cresce em altura, não corta pratos
    book = new window.St.PageFlip(el, {
      width: w, height: h, size: "fixed",
      showCover: true, usePortrait: true, drawShadow: true, maxShadowOpacity: 0.55,
      flippingTime: 720, mobileScrollSupport: true, swipeDistance: 24,
      clickEventForward: true, showPageCorners: !phone, disableFlipByClick: false, startZIndex: 1
    });
    book.loadFromHTML(pages);
    var lastTurn = 0;
    book.on("changeState", function (e) { if (e.data !== "read") lastTurn = Date.now(); });
    book.on("flip", function (e) { cur = e.data; paint(cur); sync(cur); });
    // Tocar na borda da página também vira (o resto da página fica livre para ler e tocar nos preços).
    el.addEventListener("click", function (e) {
      if (e.target.closest("a, button, input, select, label, [data-noflip]")) return;
      if (Date.now() - lastTurn < 500 || book.getState() !== "read") return;
      var r = el.getBoundingClientRect();
      var f = (e.clientX - r.left) / r.width;
      var edge = book.getOrientation() === "portrait" ? 0.3 : 0.18;
      if (f > 1 - edge) book.flipNext(e.clientY - r.top > r.height / 2 ? "bottom" : "top");
      else if (f < edge) book.flipPrev(e.clientY - r.top > r.height / 2 ? "bottom" : "top");
    });
    book.on("changeOrientation", function () { paint(book.getCurrentPageIndex()); });
    prev.addEventListener("click", function () { book.flipPrev("bottom"); });
    next.addEventListener("click", function () { book.flipNext("bottom"); });
    window.cbBook = { go: function (i) { if (i !== book.getCurrentPageIndex()) book.flip(i, "top"); }, pf: book };
    var first = pageFromHash();
    if (first) book.turnToPage(first);
    cur = first; paint(first);
    whenReady(function () { sync(first); });
  }

  // Ao chegar por #livro (botão "Folhear a ementa"), o livro fica logo à vista, por baixo da barra de vidro.
  function toBook() {
    // A ementa abre no livro: se não couber por baixo do título, desce até ele (por baixo da barra de vidro).
    var sr = stage.getBoundingClientRect();
    if (!/^#livro/.test(location.hash) && sr.bottom <= window.innerHeight - (window.matchMedia("(max-width: 959px)").matches ? 96 : 0)) return;
    var sec = document.querySelector("[data-book-sec]");
    var off = parseFloat(getComputedStyle(sec).scrollMarginTop) || 0;
    window.scrollTo(0, Math.max(0, stage.getBoundingClientRect().top + window.scrollY - off));
  }
  if (document.readyState === "complete") requestAnimationFrame(toBook);
  else window.addEventListener("load", function () { requestAnimationFrame(toBook); });

  document.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest("input, textarea, select, [data-sheet]:not([hidden])")) return;
    var r = stage.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    if (e.key === "ArrowRight") next.click();
    if (e.key === "ArrowLeft") prev.click();
  });

  // A barra de vidro, nesta página, abre o livro na primeira página da categoria.
  document.querySelectorAll("[data-catnav] .chip").forEach(function (chip) {
    var idx = Number(chip.dataset.idx);
    var start = idx ? el.querySelector('[data-cat-start="' + idx + '"]') : pages[0];
    if (!start) return;
    chip.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var to = pages.indexOf(start);
      // O livro fica à vista, logo por baixo da barra de vidro.
      var sec = document.querySelector("[data-book-sec]");
      var off = parseFloat(getComputedStyle(sec).scrollMarginTop) || 0;
      var st = stage.getBoundingClientRect().top;
      if (st < off - 4 || st > innerHeight * 0.4) window.scrollTo({ top: Math.max(0, st + window.scrollY - off), behavior: reduced ? "auto" : "smooth" });
      window.cbBook.go(to);
      if (window.cbCatnav) window.cbCatnav(idx);
    }, true);
  });
})();

