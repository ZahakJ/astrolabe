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
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const root = new URL("../", import.meta.url).pathname;
const DOCS = join(root, "docs");
const OUT = join(DOCS, "site");
const REPO = "https://github.com/ZahakJ/astrolabe";

/** The navigation: sections and pages, in reading order, named in both
 *  languages. `file` is the Markdown source under docs/ and docs/ar/.
 *  Exported for scripts/check-docs.mjs, which holds every page to having
 *  both languages and every link to landing somewhere. */
export const SECTIONS = [
  {
    id: "start",
    title: { en: "Getting started", ar: "البداية" },
    pages: [
      { slug: "configuration", file: "configuration.md", title: { en: "Configuration", ar: "الإعداد" } },
      { slug: "publishing", file: "publishing.md", title: { en: "Publishing & access", ar: "النشر والوصول" } },
      { slug: "backup-and-sync", file: "backup-and-sync.md", title: { en: "Backup & sync", ar: "النسخ الاحتياطي والمزامنة" } },
      { slug: "offline", file: "offline.md", title: { en: "Offline reading", ar: "القراءة دون اتصال" } },
      { slug: "capture", file: "capture.md", title: { en: "Capture", ar: "الالتقاط" } },
      { slug: "export", file: "export.md", title: { en: "Export", ar: "التصدير" } },
      { slug: "desktop", file: "desktop.md", title: { en: "The desktop app", ar: "تطبيق سطح المكتب" } },
      { slug: "mobile", file: "mobile.md", title: { en: "The Android app", ar: "تطبيق أندرويد" } },
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
      { slug: "sigils", file: "sigils.md", title: { en: "Sigils", ar: "السِّجِلّ" } },
      { slug: "calendar", file: "calendar.md", title: { en: "The Calendar", ar: "التقويم" } },
      { slug: "orbits", file: "orbits.md", title: { en: "Orbits", ar: "المدارات" } },
      { slug: "drawing", file: "drawing.md", title: { en: "Drawings", ar: "الرسومات" } },
      { slug: "books", file: "books.md", title: { en: "The book reader", ar: "قارئ الكتب" } },
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
      { slug: "japanese", file: "japanese.md", title: { en: "Japanese & furigana", ar: "اليابانية والفوريغانا" } },
    ],
  },
  {
    id: "more",
    title: { en: "Deeper", ar: "أعمق" },
    pages: [{ slug: "development", file: "development.md", title: { en: "Development", ar: "التطوير" } }],
  },
];
// EVERY PAGE SHIPS IN BOTH LANGUAGES. A page without docs/ar/<file> used to
// render English under a "not translated yet" notice, which the owner does
// not want to ship ("remember to also update docs with all these features"
// — and the Arabic edition is half of the docs). The builder now refuses:
// the missing files are named and the exit code fails the build.
const missingArabic = [];
export const PAGES = SECTIONS.flatMap((s) => s.pages.map((p) => ({ ...p, section: s })));

// A page that changed its name keeps answering at the old one: a stub at
// the old slug that refreshes to the new. The what's-new decks of earlier
// releases link the manual by slug (`docs: "routines"` on the 3.11–3.14
// slides, `docs: "flashcards"` on 3.13's) and those links are history, not
// something to rewrite. Two lineages meet here: the daily routine was
// "routines" (3.11–3.14) and "orbits" (3.15) and is "sigils" now; the
// spaced-repetition page was "flashcards" (the Review page) and is "orbits"
// now — so a 3.15 link to "orbits" lands on the study page, which is the
// one thing a redirect table cannot undo, and the 3.15 slide says so.
// lineage: "routines" and "flashcards" are redirect sources only.
export const MOVED = { routines: "sigils", flashcards: "orbits" };

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
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);

/** A heading's id, THE WAY GITHUB MAKES IT. The sources are what a reader
 *  opens on GitHub, every page has "Edit this page on GitHub", and a link
 *  written as `editor.md#note-direction--alignment` has to land in both
 *  places — so the site does not have a slug rule of its own. GitHub's rule
 *  (html-pipeline): lowercase the rendered text, drop every character that
 *  is not a letter, a mark, a digit, a connector, a hyphen or a space, then
 *  turn spaces into hyphens. Punctuation is DROPPED, not hyphenated, which
 *  is why "&" leaves two hyphens and "astrolabe.sty" leaves none; Arabic
 *  letters and their harakat stay, so an Arabic heading gets an Arabic id.
 *  A repeated id gets `-1`, `-2`, … as GitHub numbers them. */
export const slugify = (text) =>
  decodeEntities(text.replace(/<[^>]+>/g, ""))
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{Nd}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");

/** Every heading of a Markdown source with the id the site (and GitHub)
 *  gives it, in order: `[{ depth, id, text }]`. The one function both the
 *  builder and the gate use, so a link the gate blesses is a link the site
 *  resolves. */
export function headingIds(markdown) {
  const seen = new Map();
  const out = [];
  marked.use({ gfm: true });
  for (const token of marked.lexer(markdown)) {
    if (token.type !== "heading") continue;
    const html = marked.parser([{ type: "paragraph", tokens: token.tokens, raw: token.raw, text: token.text }]);
    const text = decodeEntities(html.replace(/<[^>]+>/g, "")).trim();
    let id = slugify(text);
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    if (n > 0) id = `${id}-${n}`;
    out.push({ depth: token.depth, id, text });
  }
  return out;
}

/** Where a Markdown link points once the page lives at /site/<lang>/<slug>/.
 *  `from` is the source's directory, repo-relative (`docs` or `docs/ar`):
 *  a link is resolved against it first, so `../README.md` means the manual's
 *  index from an Arabic page and the repo's README from an English one, as it
 *  does on GitHub. */
function rewriteHref(href, lang, page, from = lang === "ar" ? "docs/ar" : "docs") {
  if (/^(https?:|mailto:|#)/.test(href)) return href;
  const [path, hash] = href.split("#");
  const anchor = hash ? `#${hash}` : "";
  if (path === "") return anchor;
  const target = posix.normalize(posix.join(from, path));
  if (target === "docs/README.md") return `../${anchor}`;
  if (target === "README.md") return `${REPO}#readme`;
  const docPage = /^docs\/(ar\/)?([a-z0-9-]+\.md)$/.exec(target);
  if (docPage) {
    const found = PAGES.find((p) => p.file === docPage[2]);
    const targetLang = docPage[1] ? "ar" : "en";
    if (found) return `${targetLang === lang ? "../" : `../../${targetLang}/`}${found.slug}/${anchor}`;
    return `${REPO}/blob/main/${target}${anchor}`;
  }
  if (target.startsWith("docs/screenshots/")) return `../../../${target.slice(5)}`;
  if (/\.md$/.test(target) || !target.startsWith("docs/")) return `${REPO}/blob/main/${target}${anchor}`;
  return href;
}

function render(markdown, lang, page) {
  const headings = [];
  const ids = headingIds(markdown);
  let at = 0;
  const renderer = {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const id = ids[at++]?.id ?? slugify(text);
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
      ? `<h1>دليل أسطرلاب</h1><p class="strap">ملاحظاتك، على الخريطة.</p><p class="lede">${ui.tagline}</p>`
      : `<h1>The Astrolabe manual</h1><p class="strap">Your notes, charted.</p><p class="lede">${ui.tagline}</p>`;
  return intro + cards;
}

function write(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export function build() {
const summaries = { en: {}, ar: {} };
const search = { en: [], ar: [] };
let built = 0;
for (const lang of ["en", "ar"]) {
  for (let i = 0; i < PAGES.length; i++) {
    const page = PAGES[i];
    const src = lang === "en" ? join(DOCS, page.file) : join(DOCS, "ar", page.file);
    const translated = lang === "en" || existsSync(src);
    if (!translated) missingArabic.push(page.file);
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
  for (const [from, to] of Object.entries(MOVED)) {
    write(join(OUT, lang, from, "index.html"), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=../${to}/"><a href="../${to}/">${to}</a>`);
  }
  write(join(OUT, lang, "index.html"), shell({ lang, title: UI[lang].home, body: homeBody(lang, summaries), toc: [], current: null, prev: null, next: null, editHref: null, summary: UI[lang].tagline, untranslated: "", depth: 1 }));
  write(join(OUT, `search-${lang}.json`), JSON.stringify(search[lang]));
}
write(join(OUT, "index.html"), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=en/"><a href="en/">Astrolabe documentation</a>`);
console.log(`build-docs: ${built} pages → docs/site (en, ar)`);
if (missingArabic.length > 0) {
  console.error(`build-docs: ${missingArabic.length} page(s) have no Arabic source — write docs/ar/<file> for: ${missingArabic.join(", ")}`);
  process.exit(1);
}
}

// Build only when run as a script. scripts/check-docs.mjs and its test twin
// import the page table and the slug rule from here, and an import that
// rewrote docs/site would be a gate with a side effect.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) build();
