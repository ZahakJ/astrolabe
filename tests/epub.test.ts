// THE EPUB READER, tested where it is testable: the identity of a place in a
// reflowing text, the walk of a package document, the sanitizer, the two
// stylesheet passes, and the in-book search.
//
// THE FIXTURES ARE BUILT HERE, not committed. An EPUB is a zip of XML, and a
// zip of XML is a thing this repo can already write (shared/zip.ts, the
// export's own writer) — so the books below are assembled in memory from a
// handful of strings and written to a temp vault. Nothing binary lands in the
// tree, the fixtures are readable as source, and a test that needs a
// right-to-left book with a `<script>` in chapter two can simply say so.
//
// What is NOT faked: the reader's rendering half needs a browser and is
// verified in one. A test that asserted "the chapter was inserted" would
// prove nothing about whether a book appeared.

import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { cleanEpubHref, citationQuery, formatEpubAnchor, parseEpubAnchor, resolveEpubHref, splitHref } from "../shared/epubAnchor.ts";
import { sanitizeEpubCss, scopeEpubCss } from "../shared/epubCss.ts";
import { zipSync } from "../shared/zip.ts";
import { cleanBookState, DEFAULT_BOOK_STATE } from "../shared/bookAnchor.ts";
import { chapterText, epubItem, epubManifest, epubProgress, isEpubPath, searchEpub } from "../server/epub.ts";
import { find, findAll, parseXml, textOf } from "../server/epubXml.ts";
import { bookKey, isBookPath, isPdfPath, listBooks } from "../server/books.ts";
import { initSite } from "../server/site.ts";
import { initVault, VaultError } from "../server/vault.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

const enc = new TextEncoder();

// ── Building a book ─────────────────────────────────────────────────────────

interface BookSpec {
  language: string;
  /** The spine's `page-progression-direction`, or "" for none. */
  progression?: string;
  title: string;
  author: string;
  chapters: Array<{ name: string; body: string }>;
  /** EPUB 3 nav document, EPUB 2 NCX, or neither. */
  contents: "nav" | "ncx" | "none";
  css?: string;
  cover?: boolean;
}

/** An EPUB as bytes: the mimetype entry, the container, a package document, a
 *  stylesheet, the chapters and whichever contents document was asked for. */
function makeEpub(spec: BookSpec): Uint8Array {
  const items = spec.chapters.map((c, i) => ({ id: `ch${i + 1}`, href: `OEBPS/${c.name}` }));
  const manifestItems = [
    ...items.map((it) => `<item id="${it.id}" href="${it.href.slice("OEBPS/".length)}" media-type="application/xhtml+xml"/>`),
    `<item id="style" href="book.css" media-type="text/css"/>`,
    ...(spec.cover ? [`<item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>`] : []),
    ...(spec.contents === "nav" ? [`<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`] : []),
    ...(spec.contents === "ncx" ? [`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`] : []),
  ];
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${spec.title}</dc:title>
    <dc:creator>${spec.author}</dc:creator>
    <dc:language>${spec.language}</dc:language>
    ${spec.cover ? '<meta name="cover" content="cover"/>' : ""}
  </metadata>
  <manifest>${manifestItems.join("")}</manifest>
  <spine${spec.contents === "ncx" ? ' toc="ncx"' : ""}${spec.progression ? ` page-progression-direction="${spec.progression}"` : ""}>
    ${items.map((it) => `<itemref idref="${it.id}"/>`).join("")}
  </spine>
</package>`;

  const nav = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body><nav epub:type="toc"><ol>
${items.map((it, i) => `<li><a href="${it.href.slice("OEBPS/".length)}#top">Chapter ${i + 1}</a>${i === 0 ? '<ol><li><a href="ch1.xhtml#deep">A section</a></li></ol>' : ""}</li>`).join("\n")}
</ol></nav></body></html>`;

  const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap>
${items
  .map(
    (it, i) =>
      `<navPoint id="n${i}"><navLabel><text>Chapter ${i + 1}</text></navLabel><content src="${it.href.slice("OEBPS/".length)}"/></navPoint>`,
  )
  .join("\n")}
</navMap></ncx>`;

  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: "mimetype", data: enc.encode("application/epub+zip") },
    {
      name: "META-INF/container.xml",
      data: enc.encode(
        `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
      ),
    },
    { name: "OEBPS/content.opf", data: enc.encode(opf) },
    { name: "OEBPS/book.css", data: enc.encode(spec.css ?? "p { text-indent: 1.2em }") },
    ...spec.chapters.map((c) => ({ name: `OEBPS/${c.name}`, data: enc.encode(c.body) })),
  ];
  if (spec.cover) files.push({ name: "OEBPS/cover.png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]) });
  if (spec.contents === "nav") files.push({ name: "OEBPS/nav.xhtml", data: enc.encode(nav) });
  if (spec.contents === "ncx") files.push({ name: "OEBPS/toc.ncx", data: enc.encode(ncx) });
  return zipSync(files);
}

function chapter(body: string, lang = "en"): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title><link rel="stylesheet" href="book.css"/></head>
<body lang="${lang}">${body}</body></html>`;
}

// ── The XML reader ──────────────────────────────────────────────────────────

describe("the XML reader", () => {
  it("reads elements, attributes and text", () => {
    const doc = parseXml(`<a x="1" y='two'><b>hello</b></a>`);
    assert.equal(doc?.name, "a");
    assert.deepEqual(doc?.attrs, { x: "1", y: "two" });
    assert.equal(textOf(doc!), "hello");
  });

  it("strips the namespace prefix but keeps it on attributes", () => {
    const doc = parseXml(`<opf:package><dc:title xml:lang="ar">كتاب</dc:title></opf:package>`);
    const title = find(doc!, "title");
    assert.equal(title?.prefix, "dc");
    assert.equal(title?.attrs["xml:lang"], "ar");
    assert.equal(textOf(title!), "كتاب");
  });

  it("decodes the entities a book actually carries", () => {
    const doc = parseXml(`<p>a &amp; b &#8212; c &mdash; d &#x627;</p>`);
    assert.equal(textOf(doc!), "a & b — c — d ا");
  });

  it("leaves an entity it does not know exactly as written", () => {
    assert.equal(textOf(parseXml(`<p>&notanentity;</p>`)!), "&notanentity;");
  });

  it("takes CDATA as text, markup and all", () => {
    const doc = parseXml(`<p><![CDATA[<b>not a tag</b>]]></p>`);
    assert.equal(textOf(doc!), "<b>not a tag</b>");
  });

  it("skips the doctype, including an internal subset with a > in it", () => {
    const doc = parseXml(`<!DOCTYPE html [ <!ENTITY x "a>b"> ]><html><body>ok</body></html>`);
    assert.equal(doc?.name, "html");
    assert.equal(textOf(doc!), "ok");
  });

  it("closes what a ragged converter left open rather than refusing the book", () => {
    const doc = parseXml(`<body><p>one<p>two</body>`);
    assert.equal(findAll(doc!, "p").length, 2);
    assert.match(textOf(doc!), /one/);
    assert.match(textOf(doc!), /two/);
  });

  it("ignores an end tag that closes nothing", () => {
    const doc = parseXml(`<body></em><p>ok</p></body>`);
    assert.equal(textOf(doc!), "ok");
  });

  it("takes a <style> body as raw text", () => {
    const doc = parseXml(`<html><head><style>p > b { color: red }</style></head><body>x</body></html>`);
    const style = find(doc!, "style");
    assert.equal(style?.children.length, 1);
    assert.match(textOf(style!), /p > b/);
  });

  it("returns null for something that is not markup at all", () => {
    assert.equal(parseXml("just words"), null);
    assert.equal(parseXml(""), null);
  });
});

// ── Where in a book ─────────────────────────────────────────────────────────

describe("an EPUB place", () => {
  it("cleans an href to a zip name and refuses one that climbs out", () => {
    assert.equal(cleanEpubHref("/OEBPS/ch1.xhtml"), "OEBPS/ch1.xhtml");
    assert.equal(cleanEpubHref("OEBPS/./ch1.xhtml"), "OEBPS/ch1.xhtml");
    assert.equal(cleanEpubHref("OEBPS/../images/a.png"), "images/a.png");
    assert.equal(cleanEpubHref("../../etc/passwd"), "");
    assert.equal(cleanEpubHref("..%2f..%2fetc"), "..%2f..%2fetc".replace(/^/, "")); // percent-encoding is the route's job, not this one's
    assert.equal(cleanEpubHref("a\0b"), "");
    assert.equal(cleanEpubHref(`${"x".repeat(600)}.xhtml`), "");
  });

  it("drops the fragment from a place but keeps it where both halves are wanted", () => {
    assert.equal(cleanEpubHref("OEBPS/ch1.xhtml#sec3"), "OEBPS/ch1.xhtml");
    assert.deepEqual(splitHref("OEBPS/ch1.xhtml#sec3"), { href: "OEBPS/ch1.xhtml", fragment: "sec3" });
    // An id that is not an XML NAME is dropped rather than put in a selector.
    assert.equal(splitHref("ch1.xhtml#a b").fragment, "");
  });

  it("resolves a chapter's own relative URLs against it", () => {
    assert.equal(resolveEpubHref("OEBPS/text/ch1.xhtml", "../images/plate.png"), "OEBPS/images/plate.png");
    assert.equal(resolveEpubHref("OEBPS/ch1.xhtml", "ch2.xhtml"), "OEBPS/ch2.xhtml");
    assert.equal(resolveEpubHref("OEBPS/ch1.xhtml", "/cover.png"), "cover.png");
  });

  it("round-trips through the URL hash", () => {
    const anchor = { href: "OEBPS/ch07.xhtml", fraction: 0.42, query: null };
    const hash = formatEpubAnchor(anchor);
    assert.equal(hash, "ch=OEBPS/ch07.xhtml&at=0.42");
    assert.deepEqual(parseEpubAnchor(hash), anchor);
    assert.deepEqual(parseEpubAnchor(`#${hash}`), anchor);
  });

  it("carries a quotation instead of a fraction for a citation", () => {
    const hash = formatEpubAnchor({ href: "OEBPS/ch1.xhtml", fraction: null, query: "هذه محاولة أخرى" });
    const back = parseEpubAnchor(hash);
    assert.equal(back?.query, "هذه محاولة أخرى");
    assert.equal(back?.fraction, null);
  });

  it("is null for an ordinary heading, so a wikilink to one stays one", () => {
    assert.equal(parseEpubAnchor("Chapter one"), null);
    assert.equal(parseEpubAnchor("page=42"), null);
    assert.equal(parseEpubAnchor(""), null);
  });

  it("cuts a citation's words at a word boundary", () => {
    const long = "word ".repeat(80);
    const cut = citationQuery(long);
    assert.ok(cut.length <= 120);
    assert.doesNotMatch(cut, /wor$/);
  });

  it("is merged into the book's state beside the page, and cleaned there", () => {
    const next = cleanBookState({ chapter: "../../etc/passwd", page: 3, offset: 0.5 }, DEFAULT_BOOK_STATE);
    assert.equal(next.chapter, "");
    const good = cleanBookState({ chapter: "OEBPS/ch3.xhtml", page: 3 }, DEFAULT_BOOK_STATE);
    assert.equal(good.chapter, "OEBPS/ch3.xhtml");
    // A PDF's state is untouched by any of it.
    assert.equal(cleanBookState({ page: 5 }, DEFAULT_BOOK_STATE).chapter, "");
  });
});

// ── The stylesheet ──────────────────────────────────────────────────────────

const noUrls = (): string | null => null;
const someUrl = (href: string): string | null => (href === "" ? null : `/api/item?href=${href}`);

describe("the publisher's stylesheet, sanitized", () => {
  it("drops the at-rules that fetch", () => {
    const out = sanitizeEpubCss(`@import url("other.css"); @font-face { font-family: X; src: url(x.woff2) } p { margin: 1em }`, "OEBPS/book.css", someUrl);
    assert.doesNotMatch(out, /@import/);
    assert.doesNotMatch(out, /@font-face/);
    assert.match(out, /margin: 1em/);
  });

  it("drops what would fight the reading room and keeps the typography", () => {
    const out = sanitizeEpubCss(
      `p { font-family: "Minion Pro"; color: #000; background: #fff; text-indent: 1.2em; text-align: justify }`,
      "OEBPS/book.css",
      someUrl,
    );
    assert.doesNotMatch(out, /font-family/);
    assert.doesNotMatch(out, /color/);
    assert.doesNotMatch(out, /background/);
    assert.match(out, /text-indent: 1\.2em/);
    assert.match(out, /text-align: justify/);
  });

  it("will not let a chapter paint over the application", () => {
    const out = sanitizeEpubCss(`#hdr { position: fixed; top: 0; z-index: 9999; padding: 4px }`, "OEBPS/book.css", someUrl);
    assert.doesNotMatch(out, /position/);
    assert.doesNotMatch(out, /z-index/);
    assert.doesNotMatch(out, /top:/);
    assert.match(out, /padding: 4px/);
  });

  it("refuses a declaration that runs, whatever it is spelled as", () => {
    const out = sanitizeEpubCss(
      `a { width: expression(alert(1)) } b { list-style-image: url("javascript:alert(1)") } c { behavior: url(x.htc) }`,
      "OEBPS/book.css",
      someUrl,
    );
    assert.doesNotMatch(out, /expression/);
    assert.doesNotMatch(out, /javascript/);
    assert.doesNotMatch(out, /behavior/);
  });

  it("rewrites a URL it will serve and drops a declaration whose URL it will not", () => {
    const kept = sanitizeEpubCss(`li { list-style-image: url("bullet.png") }`, "OEBPS/book.css", (h, base) => someUrl(resolveEpubHref(base, h)));
    assert.match(kept, /url\("\/api\/item\?href=OEBPS\/bullet\.png"\)/);
    const dropped = sanitizeEpubCss(`li { list-style-image: url("https://example.com/b.png") }`, "OEBPS/book.css", noUrls);
    assert.doesNotMatch(dropped, /list-style-image/);
    // A data: image is already inline and reaches nothing.
    const inline = sanitizeEpubCss(`li { list-style-image: url("data:image/png;base64,AAA") }`, "OEBPS/book.css", noUrls);
    assert.match(inline, /data:image\/png/);
  });

  it("walks into the at-rules that wrap other rules", () => {
    const out = sanitizeEpubCss(`@media screen { p { color: red; margin: 0 } }`, "OEBPS/book.css", someUrl);
    assert.match(out, /@media screen/);
    assert.match(out, /margin: 0/);
    assert.doesNotMatch(out, /color/);
  });

  it("leaves a string containing a brace alone", () => {
    const out = sanitizeEpubCss(`p::after { content: "}" ; margin: 0 }`, "OEBPS/book.css", someUrl);
    assert.match(out, /margin: 0/);
  });
});

describe("the publisher's stylesheet, scoped", () => {
  const P = ".s-epub__chapter";

  it("confines every selector to the reader", () => {
    const out = scopeEpubCss(`p { margin: 0 }\n.verse em { font-style: italic }`, P);
    assert.match(out, /\.s-epub__chapter p \{/);
    assert.match(out, /\.s-epub__chapter \.verse em \{/);
  });

  it("turns the document root into the chapter, so page rules survive", () => {
    for (const root of ["html", "body", ":root", "html > body"]) {
      assert.match(scopeEpubCss(`${root} { text-align: justify }`, P), /^\.s-epub__chapter \{/m);
    }
    assert.match(scopeEpubCss(`body p { margin: 0 }`, P), /\.s-epub__chapter p \{/);
  });

  it("prefixes every selector of a list, not just the first", () => {
    const out = scopeEpubCss(`h1, h2, .title { margin: 0 }`, P);
    assert.equal(out.match(/\.s-epub__chapter/g)?.length, 3);
    // A comma inside :is() does not start a new selector.
    assert.match(scopeEpubCss(`:is(h1, h2) { margin: 0 }`, P), /^\.s-epub__chapter :is\(h1, h2\)/m);
  });

  it("scopes inside a media query too", () => {
    const out = scopeEpubCss(`@media print { p { margin: 0 } }`, P);
    assert.match(out, /@media print \{\n\.s-epub__chapter p/);
  });

  it("leaves a keyframe's stops alone — they are not selectors", () => {
    const out = scopeEpubCss(`@keyframes fade { from { opacity: 0 } to { opacity: 1 } }`, P);
    assert.match(out, /@keyframes fade/);
    assert.doesNotMatch(out, /s-epub__chapter from/);
  });

  it("emits nothing it could not confine", () => {
    // Every rule that comes out is prefixed; there is no path that writes a
    // bare selector, which is the property the whole function exists for.
    const out = scopeEpubCss(`p { margin: 0 }\n* { box-sizing: border-box }`, P);
    for (const line of out.split("\n")) {
      if (line.includes("{") && !line.startsWith("@")) assert.ok(line.startsWith(P), `unscoped: ${line}`);
    }
  });
});

// ── A book on disk ──────────────────────────────────────────────────────────

const data = makeDir();
const vault = makeVault({
  "Notes.md": "# hi\n",
  "Books/Muqaddimah.pdf": `%PDF-1.7\n${"a".repeat(400)}\ntrailer<</ID[<AAAA><BBBB>]>>\n%%EOF\n`,
});

const ENGLISH = makeEpub({
  language: "en",
  title: "A Short Book",
  author: "Someone",
  contents: "nav",
  cover: true,
  chapters: [
    {
      name: "ch1.xhtml",
      body: chapter(
        `<h1 id="top">One</h1><p class="first" id="deep">The opening paragraph.</p>` +
          `<script>alert(1)</script>` +
          `<p onclick="alert(2)" style="position:fixed">Still prose.</p>` +
          `<form><input name="x"/><button>Go</button></form>` +
          `<iframe src="https://example.com/"></iframe>` +
          `<p><a href="https://example.com/">outward</a> and <a href="ch2.xhtml#two">inward</a></p>` +
          `<figure><img src="images/plate.png" alt="A plate"/></figure>` +
          `<center>kept words</center>`,
      ),
    },
    { name: "ch2.xhtml", body: chapter(`<h1 id="two">Two</h1><p>The second chapter says nightingale.</p>`) },
    { name: "ch3.xhtml", body: chapter(`<h1>Three</h1><p>And a third.</p>`) },
  ],
});

const ARABIC = makeEpub({
  language: "ar",
  title: "ديوان",
  author: "أدونيس",
  contents: "ncx",
  chapters: [
    { name: "ch1.xhtml", body: chapter(`<h1>مقدّمة</h1><p>هذه محاولة أخرى لبناء سياق مشترك.</p>`, "ar") },
    { name: "ch2.xhtml", body: chapter(`<p>الْمُقَدِّمَة تعود هنا مرة أخرى.</p>`, "ar") },
  ],
});

const RTL_BY_SPINE = makeEpub({
  language: "en",
  progression: "rtl",
  title: "Bound the other way",
  author: "—",
  contents: "none",
  chapters: [{ name: "ch1.xhtml", body: chapter(`<p>one</p>`) }],
});

before(() => {
  initSite({ ASTROLABE_DATA: data });
  initVault(vault);
  writeFileSync(path.join(vault, "Books", "Short.epub"), ENGLISH);
  writeFileSync(path.join(vault, "Books", "Diwan.epub"), ARABIC);
  writeFileSync(path.join(vault, "Books", "Rtl.epub"), RTL_BY_SPINE);
  writeFileSync(path.join(vault, "Books", "NotABook.epub"), "this is not a zip at all");
});

after(() => {
  removeVault(vault);
  removeVault(data);
});

const url = (href: string): string => `/item?href=${href}`;

describe("the shelf holds both formats", () => {
  it("knows a book from a PDF", () => {
    assert.ok(isBookPath("Books/A.pdf"));
    assert.ok(isBookPath("Books/A.epub"));
    assert.ok(isBookPath("Books/A.EPUB"));
    assert.ok(!isBookPath("Books/A.txt"));
    // The narrow question is still askable, for the callers that are about
    // the FORMAT (a text layer is a pdf.js fact).
    assert.ok(isPdfPath("A.pdf"));
    assert.ok(!isPdfPath("A.epub"));
    assert.ok(isEpubPath("A.epub"));
  });

  it("lists EPUBs beside PDFs, each with a key of its own", async () => {
    const { books } = await listBooks();
    const names = books.map((b) => b.path).sort();
    assert.deepEqual(names, ["Books/Diwan.epub", "Books/Muqaddimah.pdf", "Books/NotABook.epub", "Books/Rtl.epub", "Books/Short.epub"]);
    assert.equal(new Set(books.map((b) => b.key)).size, books.length);
  });

  it("keys an EPUB in its own space, so no PDF's position can collide with one", async () => {
    // Same bytes, two extensions: the keys must differ, because the format is
    // hashed in front of the sample.
    const bytes = `%PDF-1.7\n${"z".repeat(400)}\n%%EOF\n`;
    writeFileSync(path.join(vault, "Books", "Twin.pdf"), bytes);
    writeFileSync(path.join(vault, "Books", "Twin.epub"), bytes);
    assert.notEqual(await bookKey("Books/Twin.pdf"), await bookKey("Books/Twin.epub"));
  });
});

describe("the package document", () => {
  it("reads the metadata, the spine and the nav contents", async () => {
    const m = await epubManifest("Books/Short.epub", url);
    assert.equal(m.title, "A Short Book");
    assert.equal(m.author, "Someone");
    assert.equal(m.language, "en");
    assert.equal(m.direction, "ltr");
    assert.deepEqual(m.spine.map((s) => s.href), ["OEBPS/ch1.xhtml", "OEBPS/ch2.xhtml", "OEBPS/ch3.xhtml"]);
    assert.equal(m.cover, "/item?href=OEBPS/cover.png");
    assert.equal(m.toc.length, 3);
    assert.equal(m.toc[0].label, "Chapter 1");
    assert.equal(m.toc[0].href, "OEBPS/ch1.xhtml");
    assert.equal(m.toc[0].fragment, "top");
    assert.equal(m.toc[0].children[0].fragment, "deep");
  });

  it("names each spine item from the contents, so the outline reads as the book does", async () => {
    const m = await epubManifest("Books/Short.epub", url);
    assert.deepEqual(m.spine.map((s) => s.title), ["Chapter 1", "Chapter 2", "Chapter 3"]);
  });

  it("falls back to the NCX when there is no nav document", async () => {
    const m = await epubManifest("Books/Diwan.epub", url);
    assert.equal(m.toc.length, 2);
    assert.equal(m.toc[0].label, "Chapter 1");
    assert.equal(m.toc[0].href, "OEBPS/ch1.xhtml");
  });

  it("takes the binding from the spine first and the language second", async () => {
    assert.equal((await epubManifest("Books/Diwan.epub", url)).direction, "rtl");
    assert.equal((await epubManifest("Books/Rtl.epub", url)).direction, "rtl");
    assert.equal((await epubManifest("Books/Short.epub", url)).direction, "ltr");
  });

  it("refuses a file that is not an EPUB, rather than reading garbage", async () => {
    await assert.rejects(() => epubManifest("Books/NotABook.epub", url), (e: unknown) => e instanceof VaultError);
    await assert.rejects(() => epubManifest("Books/Muqaddimah.pdf", url), (e: unknown) => e instanceof VaultError);
    await assert.rejects(() => epubManifest("Books/Nothing.epub", url), (e: unknown) => e instanceof VaultError);
  });

  it("counts progress in chapters, which is the only unit it has", async () => {
    const { spine } = await epubManifest("Books/Short.epub", url);
    assert.equal(epubProgress({ href: "OEBPS/ch1.xhtml", fraction: 0 }, spine), 0);
    assert.equal(epubProgress({ href: "OEBPS/ch2.xhtml", fraction: 0 }, spine), 1 / 3);
    assert.equal(epubProgress({ href: "OEBPS/ch3.xhtml", fraction: 1 }, spine), 1);
    assert.equal(epubProgress({ href: "nowhere.xhtml", fraction: 0.5 }, spine), 0);
  });
});

describe("a chapter, rebuilt", () => {
  it("never writes out a script, a form or a frame", async () => {
    const item = await epubItem("Books/Short.epub", "OEBPS/ch1.xhtml", url);
    const html = item.html ?? "";
    assert.equal(item.kind, "chapter");
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /alert\(1\)/);
    assert.doesNotMatch(html, /<form|<input|<button/i);
    assert.doesNotMatch(html, /<iframe/i);
    assert.doesNotMatch(html, /onclick/i);
    assert.doesNotMatch(html, /style=/i);
  });

  it("keeps the words of a box it did not recognise", async () => {
    const { html } = await epubItem("Books/Short.epub", "OEBPS/ch1.xhtml", url);
    assert.match(html ?? "", /kept words/);
    assert.doesNotMatch(html ?? "", /<center/i);
  });

  it("keeps lang, dir, class and id — the outline lands on an id", async () => {
    const { html } = await epubItem("Books/Short.epub", "OEBPS/ch1.xhtml", url);
    assert.match(html ?? "", /id="top"/);
    assert.match(html ?? "", /class="first"/);
    const ar = await epubItem("Books/Diwan.epub", "OEBPS/ch1.xhtml", url);
    assert.match(ar.html ?? "", /مقدّمة/);
  });

  it("gives an internal link a data-href and an external one nothing at all", async () => {
    const { html } = await epubItem("Books/Short.epub", "OEBPS/ch1.xhtml", url);
    assert.match(html ?? "", /data-href="OEBPS\/ch2\.xhtml" data-fragment="two"/);
    assert.match(html ?? "", /outward/); // the words survive
    assert.doesNotMatch(html ?? "", /example\.com/);
    assert.doesNotMatch(html ?? "", /href="http/);
  });

  it("points a picture at the item route, and drops one the book does not contain", async () => {
    const { html } = await epubItem("Books/Short.epub", "OEBPS/ch1.xhtml", url);
    // images/plate.png is not in this fixture, so the src is refused rather
    // than served broken; the alt text and the figure survive.
    assert.doesNotMatch(html ?? "", /src=/);
    assert.match(html ?? "", /alt="A plate"/);
  });

  it("carries the chapter's own stylesheet, sanitized, beside it", async () => {
    const item = await epubItem("Books/Short.epub", "OEBPS/ch1.xhtml", url);
    assert.match(item.css ?? "", /text-indent/);
  });

  it("serves the book's own files with their real types", async () => {
    const css = await epubItem("Books/Short.epub", "OEBPS/book.css", url);
    assert.equal(css.kind, "asset");
    assert.match(css.contentType, /text\/css/);
    const cover = await epubItem("Books/Short.epub", "OEBPS/cover.png", url);
    assert.equal(cover.contentType, "image/png");
    assert.equal(cover.bytes?.[0], 0x89);
  });

  it("will not serve a name that is not in the archive, however it is spelled", async () => {
    for (const href of ["../../etc/passwd", "/etc/passwd", "OEBPS/../../secret", "OEBPS/missing.xhtml", ""]) {
      await assert.rejects(() => epubItem("Books/Short.epub", href, url), (e: unknown) => e instanceof VaultError);
    }
  });

  it("will not serve a file of a kind a chapter cannot draw", async () => {
    await assert.rejects(
      () => epubItem("Books/Short.epub", "mimetype", url),
      (e: unknown) => e instanceof VaultError && e.status === 415,
    );
  });

  it("flattens to the text the search and the reader both count in", () => {
    assert.equal(chapterText(`<h1>One</h1><p>Two words</p>`), "One Two words");
    assert.equal(chapterText(`<p>a</p><p>b</p>`), "a b");
    assert.equal(chapterText(`<p>&amp; &lt;b&gt;</p>`), "& <b>");
  });
});

describe("finding a phrase in a book", () => {
  it("finds it, names the chapter and says where in its text", async () => {
    const hits = await searchEpub("Books/Short.epub", "nightingale");
    assert.equal(hits.length, 1);
    assert.equal(hits[0].href, "OEBPS/ch2.xhtml");
    assert.equal(hits[0].title, "Chapter 2");
    assert.match(hits[0].snippet, /nightingale/);
    const text = chapterText((await epubItem("Books/Short.epub", "OEBPS/ch2.xhtml", url)).html ?? "");
    assert.equal(text.slice(hits[0].offset, hits[0].offset + "nightingale".length), "nightingale");
  });

  it("finds pointed Arabic from an unpointed query, and the other way", async () => {
    const bare = await searchEpub("Books/Diwan.epub", "المقدمة");
    assert.ok(bare.length >= 1, "unpointed query must find the pointed word");
    assert.equal(bare[0].href, "OEBPS/ch2.xhtml");
    const pointed = await searchEpub("Books/Diwan.epub", "الْمُقَدِّمَة");
    assert.ok(pointed.length >= 1);
  });

  it("reports an offset into the chapter's own text even where the fold dropped characters", async () => {
    const hits = await searchEpub("Books/Diwan.epub", "المقدمة");
    const text = chapterText((await epubItem("Books/Diwan.epub", "OEBPS/ch2.xhtml", url)).html ?? "");
    // The offset lands on the word itself — the harakat the fold removed are
    // inside it, so a naive offset would land a few characters early.
    assert.ok(text.slice(hits[0].offset).startsWith("الْمُقَدِّمَة"), text.slice(hits[0].offset, hits[0].offset + 20));
  });

  it("answers nothing for an empty query rather than everything", async () => {
    assert.deepEqual(await searchEpub("Books/Short.epub", "   "), []);
  });

  it("finds every occurrence, in reading order", async () => {
    const hits = await searchEpub("Books/Short.epub", "the");
    assert.ok(hits.length >= 2);
    const order = hits.map((h) => h.href);
    assert.deepEqual([...order].sort(), order.slice().sort());
    assert.ok(hits.every((h, i) => i === 0 || hits[i - 1].offset !== h.offset || hits[i - 1].href !== h.href));
  });
});
