// BUILD THE DOCUMENTATION SITE.
//
//   node scripts/build-docs.mjs        →  docs/site/{en,ar}/<slug>/index.html
//
// The sources are the Markdown files a reader can already open on GitHub:
// docs/*.md in English and docs/ar/*.md in Arabic, one file per page, same
// names. This turns them into a site with a sidebar, an outline of the open
// page, search, previous/next, an "edit on GitHub" link on every page, and a
// language switch that keeps the page. Arabic pages read right to left; a
// page that has no Arabic yet is shown in English under a notice that says so
// in Arabic, rather than vanishing from the Arabic navigation.
//
// No framework: one shell string, one stylesheet, one script. The pages site
// (docs/index.html) links here; GitHub Pages serves docs/ at the repo's URL.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { marked } from "marked";

const root = new URL("../", import.meta.url).pathname;
const DOCS = join(root, "docs");
const OUT = join(DOCS, "site");
const REPO = "https://github.com/ZahakJ/astrolabe";

/** The navigation: sections and pages, in reading order, named in both
 *  languages. `file` is the Markdown source under docs/ and docs/ar/. */
const SECTIONS = [
  {
    id: "start",
    title: { en: "Getting started", ar: "البداية" },
    pages: [
      { slug: "configuration", file: "configuration.md", title: { en: "Configuration", ar: "الإعداد" } },
      { slug: "publishing", file: "publishing.md", title: { en: "Publishing & access", ar: "النشر والوصول" } },
      { slug: "backup-and-sync", file: "backup-and-sync.md", title: { en: "Backup & sync", ar: "النسخ الاحتياطي والمزامنة" } },
      { slug: "desktop", file: "desktop.md", title: { en: "The desktop app", ar: "تطبيق سطح المكتب" } },
    ],
  },
  {
    id: "writing",
    title: { en: "Writing", ar: "الكتابة" },
    pages: [
      { slug: "editor", file: "editor.md", title: { en: "The editor & reading view", ar: "المحرر وعرض القراءة" } },
      { slug: "templates-and-notes", file: "templates-and-notes.md", title: { en: "Templates, banners & notes", ar: "القوالب واللافتات والملاحظات" } },
      { slug: "latex", file: "latex.md", title: { en: "LaTeX notes", ar: "ملاحظات LaTeX" } },
      { slug: "trackers", file: "trackers.md", title: { en: "Trackers", ar: "المتتبِّعات" } },
      { slug: "drawing", file: "drawing.md", title: { en: "Drawings", ar: "الرسومات" } },
      { slug: "books", file: "books.md", title: { en: "The PDF reader", ar: "قارئ PDF" } },
      { slug: "workspace", file: "workspace.md", title: { en: "Panes, tabs & windows", ar: "اللوحات والتبويبات والنوافذ" } },
      { slug: "printing", file: "printing.md", title: { en: "Printing & PDF", ar: "الطباعة وPDF" } },
      { slug: "keymap", file: "keymap.md", title: { en: "Keymap", ar: "اختصارات لوحة المفاتيح" } },
    ],
  },
  {
    id: "publishing",
    title: { en: "Your site", ar: "موقعك" },
    pages: [
      { slug: "blog-mode", file: "blog-mode.md", title: { en: "Blog mode", ar: "وضع المدونة" } },
      { slug: "designer", file: "designer.md", title: { en: "Designed mode", ar: "وضع التصميم" } },
      { slug: "library", file: "library.md", title: { en: "The library", ar: "المكتبة" } },
    ],
  },
  {
    id: "look",
    title: { en: "Look & language", ar: "المظهر واللغة" },
    pages: [
      { slug: "theming", file: "theming.md", title: { en: "Theming", ar: "السمات" } },
      { slug: "typography", file: "typography.md", title: { en: "Typography", ar: "الخطوط" } },
      { slug: "arabic-and-rtl", file: "arabic-and-rtl.md", title: { en: "Arabic & RTL", ar: "العربية والكتابة من اليمين" } },
    ],
  },
  {
    id: "more",
    title: { en: "Deeper", ar: "أعمق" },
    pages: [{ slug: "development", file: "development.md", title: { en: "Development", ar: "التطوير" } }],
  },
];
const PAGES = SECTIONS.flatMap((s) => s.pages.map((p) => ({ ...p, section: s })));

const UI = {
  en: {
    dir: "ltr",
    docs: "Documentation",
    home: "Overview",
    search: "Search the docs…",
    noResults: "Nothing matches",
    onThisPage: "On this page",
    prev: "Previous",
    next: "Next",
    edit: "Edit this page on GitHub",
    switchTo: "العربية",
    switchHref: "ar",
    untranslated: "",
    menu: "Menu",
    theme: "Light / dark",
    repo: "GitHub",
    app: "Astrolabe",
    tagline: "The manual. The app's own tour (Ctrl/Cmd P → Take the tour) shows most of it live.",
    foot: "Astrolabe is free software. These pages are built from the Markdown in the repo's docs folder.",
  },
  ar: {
    dir: "rtl",
    docs: "دليل",
    home: "نظرة عامة",
    search: "ابحث في الدليل…",
    noResults: "لا نتائج",
    onThisPage: "في هذه الصفحة",
    prev: "السابق",
    next: "التالي",
    edit: "حرّر هذه الصفحة على GitHub",
    switchTo: "English",
    switchHref: "en",
    untranslated: "هذه الصفحة لم تُترجم بعد، فتُعرض بالإنجليزية. الترجمة على الطريق.",
    menu: "القائمة",
    theme: "فاتح / داكن",
    repo: "GitHub",
    app: "أسطرلاب",
    tagline: "الدليل الكامل. جولة التطبيق نفسه (Ctrl/Cmd P ← خذ الجولة) تعرض معظمه حيًّا.",
    foot: "أسطرلاب برنامج حر. هذه الصفحات مبنية من ملفات Markdown في مجلد docs بالمستودع.",
  },
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "section";

/** Where a Markdown link points once the page lives at /site/<lang>/<slug>/. */
function rewriteHref(href, lang) {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [path, hash] = href.split("#");
  const anchor = hash ? `#${hash}` : "";
  if (path === "" ) return anchor;
  if (path === "README.md") return `../${anchor}`;
  if (path === "../README.md") return `${REPO}#readme`;
  const repoFile = /^\.\.\/([A-Z0-9_.-]+\.md)$/.exec(path);
  if (repoFile) return `${REPO}/blob/main/${repoFile[1]}${anchor}`;
  const local = /^([a-z0-9-]+)\.md$/.exec(path);
  if (local) {
    const page = PAGES.find((p) => p.file === path);
    return page ? `../${page.slug}/${anchor}` : `${REPO}/blob/main/docs/${path}${anchor}`;
  }
  if (path.startsWith("screenshots/")) return `../../../${path}`;
  if (path.startsWith("../")) return `${REPO}/blob/main/${path.slice(3)}`;
  return href;
}

function render(markdown, lang, page) {
  const headings = [];
  const seen = new Map();
  const renderer = {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      let id = slugify(text);
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      if (n > 0) id = `${id}-${n + 1}`;
      if (depth === 2 || depth === 3) headings.push({ depth, id, text: text.replace(/<[^>]+>/g, "") });
      if (depth === 1) return `<h1 id="${id}">${text}</h1>\n`;
      return `<h${depth} id="${id}"><a class="anchor" href="#${id}">${text}</a></h${depth}>\n`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const out = rewriteHref(href, lang, page);
      const ext = /^https?:/.test(out) ? ' target="_blank" rel="noreferrer"' : "";
      return `<a href="${esc(out)}"${title ? ` title="${esc(title)}"` : ""}${ext}>${text}</a>`;
    },
    image({ href, title, text }) {
      const out = rewriteHref(href, lang, page);
      return `<figure><img src="${esc(out)}" alt="${esc(text)}" loading="lazy">${title ? `<figcaption>${esc(title)}</figcaption>` : ""}</figure>`;
    },
    table({ header, rows }) {
      const cell = (c, tag) => `<${tag}${c.align ? ` style="text-align:${c.align}"` : ""}>${this.parser.parseInline(c.tokens)}</${tag}>`;
      const head = `<tr>${header.map((c) => cell(c, "th")).join("")}</tr>`;
      const body = rows.map((r) => `<tr>${r.map((c) => cell(c, "td")).join("")}</tr>`).join("");
      return `<div class="table"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    },
  };
  marked.use({ renderer, gfm: true });
  const html = marked.parse(markdown);
  return { html, headings };
}

/** The first paragraph after the title, for the home cards and search. */
function summaryOf(markdown) {
  const m = /^\*(.+?)\*\s*$/m.exec(markdown) ?? /^(?!#)(?!\s*$)(?!\||<|---|←)(.+)$/m.exec(markdown);
  return m ? m[1].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "").trim() : "";
}

function plainText(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
}

function shell({ lang, title, body, toc, current, prev, next, editHref, summary, untranslated, depth }) {
  const ui = UI[lang];
  const base = "../".repeat(depth); // to /site/
  const other = current ? `${base}${ui.switchHref}/${current}/` : `${base}${ui.switchHref}/`;
  const nav = SECTIONS.map(
    (s) => `<div class="nav__section"><div class="nav__title">${esc(s.title[lang])}</div>${s.pages
      .map((p) => `<a class="nav__link${p.slug === current ? " is-current" : ""}" href="${base}${lang}/${p.slug}/">${esc(p.title[lang])}</a>`)
      .join("")}</div>`,
  ).join("");
  const tocHtml = toc.length
    ? `<aside class="toc"><div class="toc__title">${ui.onThisPage}</div>${toc.map((h) => `<a class="toc__link toc__link--${h.depth}" href="#${h.id}">${esc(h.text)}</a>`).join("")}</aside>`
    : "";
  const pager = `<nav class="pager">${prev ? `<a class="pager__link pager__link--prev" href="${base}${lang}/${prev.slug}/"><span class="pager__kicker">${ui.prev}</span><span class="pager__title">${esc(prev.title[lang])}</span></a>` : "<span></span>"}${next ? `<a class="pager__link pager__link--next" href="${base}${lang}/${next.slug}/"><span class="pager__kicker">${ui.next}</span><span class="pager__title">${esc(next.title[lang])}</span></a>` : "<span></span>"}</nav>`;
  return `<!doctype html>
<html lang="${lang}" dir="${ui.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${lang === "ar" ? `${ui.docs} ${ui.app}` : `${ui.app} ${ui.docs}`}</title>
<meta name="description" content="${esc(summary)}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23c9a227' d='M12 2l2.4 7.6H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.5 2.4-7.4L2 9.6h7.6z'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Noto+Naskh+Arabic:wght@400;600&family=Noto+Sans:wght@400;600&family=Noto+Sans+Arabic:wght@400;600&display=swap">
<link rel="stylesheet" href="${base}docs.css">
</head>
<body>
<header class="top">
  <button class="top__menu" type="button" aria-label="${ui.menu}" data-menu>☰</button>
  <a class="top__brand" href="${base}${lang}/"><span class="top__star"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="22" height="22" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="50" cy="9" r="5" stroke-width="2.6"/><circle cx="50" cy="55" r="40" stroke-width="4"/><circle cx="50" cy="55" r="28" stroke-width="1.6"/><path d="M75.28 33.79 L24.72 76.21" stroke-width="2.8"/><path d="M77.08 35.93 L80.64 29.29 L73.48 31.64 Z M22.92 74.07 L19.36 80.71 L26.52 78.36 Z" fill="currentColor" stroke="none"/><circle cx="50" cy="55" r="2.52" fill="currentColor" stroke="none"/></svg></span> ${lang === "ar" ? `<span class="top__docs">${ui.docs}</span> ${ui.app}` : `${ui.app} <span class="top__docs">${ui.docs}</span>`}</a>
  <label class="top__search"><input type="search" placeholder="${ui.search}" aria-label="${ui.search}" data-search autocomplete="off"><div class="top__results" data-results hidden></div></label>
  <a class="top__lang" href="${other}" hreflang="${ui.switchHref}">${ui.switchTo}</a>
  <button class="top__theme" type="button" title="${ui.theme}" aria-label="${ui.theme}" data-theme>◐</button>
  <a class="top__repo" href="${REPO}" target="_blank" rel="noreferrer">${ui.repo}</a>
</header>
<div class="layout">
  <nav class="nav" data-nav><a class="nav__link nav__home${current ? "" : " is-current"}" href="${base}${lang}/">${ui.home}</a>${nav}</nav>
  <main class="main">
    ${untranslated ? `<div class="notice">${untranslated}</div>` : ""}
    <article class="doc">${body}</article>
    ${editHref ? `<p class="edit"><a href="${editHref}" target="_blank" rel="noreferrer">${ui.edit}</a></p>` : ""}
    ${pager}
    <footer class="foot">${ui.foot}</footer>
  </main>
  ${tocHtml}
</div>
<script>window.__docs = { lang: ${JSON.stringify(lang)}, base: ${JSON.stringify(base)}, noResults: ${JSON.stringify(ui.noResults)} };</script>
<script src="${base}docs.js" defer></script>
</body>
</html>
`;
}

function homeBody(lang, summaries) {
  const ui = UI[lang];
  const cards = SECTIONS.map(
    (s) => `<section class="home__section"><h2>${esc(s.title[lang])}</h2><div class="cards">${s.pages
      .map((p) => `<a class="card" href="${p.slug}/"><span class="card__title">${esc(p.title[lang])}</span><span class="card__sub">${esc(summaries[lang][p.slug] ?? "")}</span></a>`)
      .join("")}</div></section>`,
  ).join("");
  const intro =
    lang === "ar"
      ? `<h1>دليل أسطرلاب</h1><p class="strap">ملاحظاتك، على الخريطة.</p><p class="lede">${ui.tagline}</p><p class="was"><b>كان اسمه ڤيلوم.</b> كل ما كُتب للاسم القديم ما زال يعمل: مفاتيح البيئة <code>VELLUM_*</code>، وروابط <code>vellum://</code>، ومجلد <code>~/.config/vellum</code>، وملف تعريف الجلسة، و<code>\\usepackage{vellum}</code>، وتفضيلات المتصفح المحفوظة. الأسماء الجديدة هي <code>ASTROLABE_*</code> و<code>astrolabe://</code> و<code>astrolabe.sty</code>.</p>`
      : `<h1>The Astrolabe manual</h1><p class="strap">Your notes, charted.</p><p class="lede">${ui.tagline}</p><p class="was"><b>Astrolabe was Vellum.</b> Everything written for the old name keeps working: <code>VELLUM_*</code> environment keys, <code>vellum://</code> links, <code>~/.config/vellum</code>, the session cookie, <code>\\usepackage{vellum}</code>, and your browser's stored preferences. The new names are <code>ASTROLABE_*</code>, <code>astrolabe://</code> and <code>astrolabe.sty</code>.</p>`;
  return intro + cards;
}

function write(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

const summaries = { en: {}, ar: {} };
const search = { en: [], ar: [] };
let built = 0;
for (const lang of ["en", "ar"]) {
  for (let i = 0; i < PAGES.length; i++) {
    const page = PAGES[i];
    const src = lang === "en" ? join(DOCS, page.file) : join(DOCS, "ar", page.file);
    const translated = lang === "en" || existsSync(src);
    // The GitHub-facing navigation line ("← Back to the README · All docs")
    // is the site's own chrome here; drop it.
    const markdown = readFileSync(translated ? src : join(DOCS, page.file), "utf8").replace(/^←.*\n/m, "").replace(/^→.*\n/m, "");
    const { html, headings } = render(markdown, lang, page);
    summaries[lang][page.slug] = translated ? summaryOf(markdown) : summaries.en[page.slug] ?? summaryOf(markdown);
    const editHref = `${REPO}/edit/main/docs/${lang === "en" ? "" : "ar/"}${page.file}`;
    const out = shell({
      lang,
      title: page.title[lang],
      body: html,
      toc: headings,
      current: page.slug,
      prev: PAGES[i - 1],
      next: PAGES[i + 1],
      editHref,
      summary: summaries[lang][page.slug],
      untranslated: translated ? "" : UI[lang].untranslated,
      depth: 2,
    });
    write(join(OUT, lang, page.slug, "index.html"), out);
    // The search index: the page, then every heading with the words under it.
    const sections = html.split(/(?=<h[23] id=")/);
    for (const chunk of sections) {
      const m = /^<h([23]) id="([^"]+)">(?:<a class="anchor" href="#[^"]+">)?(.*?)(?:<\/a>)?<\/h\1>/.exec(chunk);
      const text = plainText(chunk).slice(0, 400);
      search[lang].push({
        page: page.title[lang],
        url: `${page.slug}/${m ? `#${m[2]}` : ""}`,
        heading: m ? plainText(m[3]) : "",
        text,
      });
    }
    built++;
  }
  write(join(OUT, lang, "index.html"), shell({ lang, title: UI[lang].home, body: homeBody(lang, summaries), toc: [], current: null, prev: null, next: null, editHref: null, summary: UI[lang].tagline, untranslated: "", depth: 1 }));
  write(join(OUT, `search-${lang}.json`), JSON.stringify(search[lang]));
}
write(join(OUT, "index.html"), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=en/"><a href="en/">Astrolabe documentation</a>`);
console.log(`build-docs: ${built} pages → docs/site (en, ar)`);
