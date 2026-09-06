// The manual's few behaviours: search, the phone's menu, the outline that
// follows the scroll, and the light/dark switch. No framework, no build.
(function () {
  const cfg = window.__docs || { lang: "en", base: "../", noResults: "Nothing matches" };

  // ── Theme ────────────────────────────────────────────────────────────────
  const root = document.documentElement;
  try {
    // The manual's theme choice moved with the name; an old key is carried once.
    var saved = localStorage.getItem("astrolabe-docs-theme");
    if (saved === null && localStorage.getItem("vellum-docs-theme") !== null) {
      saved = localStorage.getItem("vellum-docs-theme");
      localStorage.setItem("astrolabe-docs-theme", saved);
      localStorage.removeItem("vellum-docs-theme");
    }
    if (saved === "light" || saved === "dark") root.dataset.theme = saved;
    else if (matchMedia("(prefers-color-scheme: light)").matches) root.dataset.theme = "light";
  } catch (e) {}
  const themeBtn = document.querySelector("[data-theme]");
  if (themeBtn) themeBtn.addEventListener("click", function () {
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try { localStorage.setItem("astrolabe-docs-theme", next); } catch (e) {}
  });

  // ── Phone menu ───────────────────────────────────────────────────────────
  const nav = document.querySelector("[data-nav]");
  const menu = document.querySelector("[data-menu]");
  if (nav && menu) {
    menu.addEventListener("click", function () { nav.classList.toggle("is-open"); });
    document.addEventListener("click", function (e) {
      if (nav.classList.contains("is-open") && !nav.contains(e.target) && e.target !== menu) nav.classList.remove("is-open");
    });
  }

  // ── Outline follows the scroll ───────────────────────────────────────────
  const links = Array.prototype.slice.call(document.querySelectorAll(".toc__link"));
  if (links.length && "IntersectionObserver" in window) {
    const byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    const heads = Object.keys(byId).map(function (id) { return document.getElementById(id); }).filter(Boolean);
    let active = null;
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          if (active) active.classList.remove("is-active");
          active = byId[en.target.id];
          if (active) active.classList.add("is-active");
        }
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    heads.forEach(function (h) { io.observe(h); });
  }

  // ── Search ───────────────────────────────────────────────────────────────
  const input = document.querySelector("[data-search]");
  const results = document.querySelector("[data-results]");
  if (!input || !results) return;
  let index = null;
  let cursor = -1;
  function load() {
    if (index) return Promise.resolve(index);
    return fetch(cfg.base + "search-" + cfg.lang + ".json").then(function (r) { return r.json(); }).then(function (j) { index = j; return j; });
  }
  function fold(s) { return s.toLowerCase().normalize("NFKD").replace(/[ً-ْـ]/g, ""); }
  function mark(text, q) {
    const i = fold(text).indexOf(q);
    if (i < 0) return escapeHtml(text.slice(0, 160));
    const start = Math.max(0, i - 60);
    const slice = text.slice(start, i + q.length + 100);
    const j = fold(slice).indexOf(q);
    return escapeHtml(slice.slice(0, j)) + "<mark>" + escapeHtml(slice.slice(j, j + q.length)) + "</mark>" + escapeHtml(slice.slice(j + q.length));
  }
  function escapeHtml(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function render(q) {
    const needle = fold(q.trim());
    if (needle.length < 2) { results.hidden = true; results.innerHTML = ""; return; }
    load().then(function (items) {
      const hits = [];
      for (let i = 0; i < items.length && hits.length < 12; i++) {
        const it = items[i];
        const inHeading = fold(it.heading).indexOf(needle) >= 0 || fold(it.page).indexOf(needle) >= 0;
        const inText = fold(it.text).indexOf(needle) >= 0;
        if (inHeading || inText) hits.push({ it: it, score: inHeading ? 0 : 1 });
      }
      hits.sort(function (a, b) { return a.score - b.score; });
      cursor = -1;
      results.innerHTML = hits.length
        ? hits.map(function (h) {
            return '<a class="result" href="' + cfg.base + cfg.lang + "/" + h.it.url + '"><div class="result__page">' + escapeHtml(h.it.page) + "</div>" +
              (h.it.heading ? '<div class="result__heading">' + mark(h.it.heading, needle) + "</div>" : "") +
              '<div class="result__text">' + mark(h.it.text, needle) + "</div></a>";
          }).join("")
        : '<div class="empty">' + escapeHtml(cfg.noResults) + "</div>";
      results.hidden = false;
    });
  }
  input.addEventListener("input", function () { render(input.value); });
  input.addEventListener("focus", function () { if (input.value) render(input.value); });
  input.addEventListener("keydown", function (e) {
    const rows = results.querySelectorAll(".result");
    if (e.key === "Escape") { results.hidden = true; input.blur(); return; }
    if (!rows.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      cursor = (cursor + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
      rows.forEach(function (r, i) { r.classList.toggle("is-active", i === cursor); });
      rows[cursor].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && cursor >= 0) {
      location.href = rows[cursor].getAttribute("href");
    }
  });
  document.addEventListener("click", function (e) { if (!results.contains(e.target) && e.target !== input) results.hidden = true; });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "/" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) && document.activeElement !== input) { e.preventDefault(); input.focus(); }
  });
})();
