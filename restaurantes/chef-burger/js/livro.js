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
    return (name ? name + " · " : "") + "página " + i + " de " + (total - 2);
  }
  function catName(i) {
    var p = pages[i];
    var t = p && p.dataset.catId ? p.querySelector(".page__t, .page__run") : null;
    return t ? t.childNodes[0].textContent.trim() : "";
  }
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
    window.cbBook = { go: show };
    prev.addEventListener("click", function () { show(cur - step()); });
    next.addEventListener("click", function () { show(cur + step()); });
    show(0);
  } else {
    var phone = window.matchMedia("(max-width: 899px)").matches;
    var w = phone ? Math.min(stage.clientWidth - 24, 440) : 450;
    var h = phone ? Math.max(Math.round(w * 1.56), Math.round(190000 / w)) : Math.round(w * 1.38); // telemóveis estreitos: a página cresce em altura, não corta pratos
    book = new window.St.PageFlip(el, {
      width: w, height: h, size: "fixed",
      showCover: true, usePortrait: true, drawShadow: true, maxShadowOpacity: 0.55,
      flippingTime: 720, mobileScrollSupport: true, swipeDistance: 24,
      clickEventForward: true, showPageCorners: true, disableFlipByClick: false, startZIndex: 1
    });
    book.loadFromHTML(pages);
    book.on("flip", function (e) { cur = e.data; paint(cur); });
    book.on("changeOrientation", function () { paint(book.getCurrentPageIndex()); });
    prev.addEventListener("click", function () { book.flipPrev("bottom"); });
    next.addEventListener("click", function () { book.flipNext("bottom"); });
    window.cbBook = { go: function (i) { book.flip(i, "top"); } };
    paint(0);
  }

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
    if (!idx) return;
    var start = el.querySelector('[data-cat-start="' + idx + '"]');
    if (!start) return;
    chip.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var to = pages.indexOf(start);
      var sec = document.querySelector("[data-book-sec]");
      var r = sec.getBoundingClientRect();
      if (r.top < 0 || r.top > innerHeight * 0.5) sec.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      window.cbBook.go(to);
    }, true);
  });
})();
