// AN EPUB, OPENED WITHOUT BEING UNPACKED.
//
// The owner's sentence for this feature was "the arabic prints suck super
// bad… can you maybe support epub through reader maybe?" — and the whole
// design follows from what is actually wrong with the alternative. Arabic
// poetry converted to PDF is a picture of type: the shaping was decided by
// whatever tool made the file, the line breaks are frozen at one measure, and
// a reader who wants bigger text gets a bigger picture. The browser already
// knows how to shape and justify Arabic, and this product already ships Noto
// Naskh Arabic and a reading typography; an EPUB is the format that lets both
// of them do their work. So the reader's job here is to get the book's own
// markup out of the zip, make it safe, and then GET OUT OF THE WAY.
//
// THREE RULES THIS MODULE KEEPS.
//
// 1. NOTHING IS UNPACKED TO DISK, EVER. Not to a temp directory, not to
//    ASTROLABE_DATA, not beside the book. An EPUB in an unpublished folder is
//    the normal case — it is somebody's library — and a cache directory full
//    of extracted chapters is a second copy of the owner's books living
//    outside the vault, with its own eviction bug and its own permissions to
//    get wrong. server/zip.ts reads one entry at a time through a file handle
//    (two positional reads per item), which is fast enough that there is
//    nothing for a disk cache to buy.
//
// 2. THE BOOK'S MARKUP NEVER REACHES THE BROWSER AS THE PUBLISHER WROTE IT.
//    An EPUB is an arbitrary XHTML document from the internet, and this app
//    renders it inside its OWN origin — where the session cookie is. So the
//    chapter is not filtered, it is REBUILT: the parse tree is walked and a
//    new document is emitted from an allowlist of elements and attributes.
//    Anything not on the list does not survive to be reasoned about. Scripts,
//    forms, iframes, event handlers, external URLs and `style` attributes are
//    not "removed" — they are simply never written out.
//
// 3. THE GATE IS /api/file's GATE. A book is a vault file, and who may read
//    one is a question this product already answers in exactly one place
//    (`isAllowedAttachment` + `isPublishLimited`). server/epubRoutes.ts asks
//    it in the same words for every route here. This module widens nothing.
//
// WHAT IS CACHED: the PARSE, and only the parse. `{ metadata, spine, toc }`
// for a book, keyed by path-size-mtime, because a 300-chapter book's package
// document is the one genuinely repetitive read in a sitting. The chapters
// themselves are not cached: they are one inflate away, and a cache of
// chapter bodies is a cache of somebody's library in a process that did not
// ask to hold one.

import { open } from "node:fs/promises";
import { statSync } from "node:fs";
import {
  cleanEpubHref,
  resolveEpubHref,
  splitHref,
  type EpubPlace,
} from "../shared/epubAnchor.ts";
import { sanitizeEpubCss } from "../shared/epubCss.ts";
import { foldQuery } from "../shared/fold.ts";
import type { EpubHit, EpubManifest, EpubSpineItem, EpubTocEntry } from "../shared/types.ts";
import { childrenNamed, find, findAll, isElement, parseXml, textOf, type XmlElement } from "./epubXml.ts";
import { normalizeRel, safeAbs, VaultError } from "./vault.ts";
import { readZipDirectory, readZipEntryAt, ZipError, type ZipEntry } from "./zip.ts";

export function isEpubPath(rel: string): boolean {
  return /\.epub$/i.test(rel);
}

/** How many spine items one book may have. A real book is a few hundred; a
 *  file with fifty thousand is a generator's output and the manifest route
 *  would be megabytes of JSON. */
const SPINE_MAX = 5000;

/** How many contents entries travel with a manifest, across all depths. */
const TOC_MAX = 5000;

/** How deep the contents nest. Three is the deepest anybody sets in type;
 *  beyond it a `<ol>` inside a `<li>` inside a `<li>` is a cycle in a file
 *  somebody generated. */
const TOC_DEPTH_MAX = 6;

/** The biggest single item this will inflate into memory. A chapter is tens
 *  of kilobytes and a plate is a few megabytes; 64 MB is far past both, and
 *  it is the wall that stops a zip bomb — an entry that claims to inflate to
 *  four gigabytes is refused by its own declared size before a byte is read. */
const ITEM_BYTES_MAX = 64 * 1024 * 1024;

/** How many search hits one book returns. The in-book search is a way back to
 *  a passage, not a concordance — the PDF reader caps at 500 for the same
 *  reason (client/books/BookReader.tsx::SEARCH_MAX). */
export const EPUB_HITS_MAX = 500;

/** Characters of context either side of a search hit. */
const SNIPPET_PAD = 60;

/** How many books' parses are held. A shelf is unbounded and a parse is a
 *  few kilobytes of metadata; thirty-two is more books than anyone has open
 *  in a sitting, and the oldest goes when the thirty-third arrives. */
const PARSE_CACHE_MAX = 32;

/** path:size:mtime → the parse. Insertion-ordered, which is all the eviction
 *  order this needs: a Map iterates oldest-first, so the first key is the one
 *  that goes. */
const parsed = new Map<string, EpubBook>();

interface EpubBook {
  title: string;
  author: string;
  language: string;
  direction: "ltr" | "rtl";
  spine: EpubSpineItem[];
  toc: EpubTocEntry[];
  coverHref: string | null;
  /** href inside the archive → the media type the OPF manifest declares. */
  types: Map<string, string>;
}

// ── Opening ─────────────────────────────────────────────────────────────────

interface OpenArchive {
  entries: Map<string, ZipEntry>;
  size: number;
  read(name: string): Promise<Uint8Array>;
  close(): Promise<void>;
}

/** The vault file, stat'ed and containment-checked, with the same 404 the
 *  rest of the product gives for a path that is not a readable file. */
function bookFile(rel: string): { abs: string; rel: string; size: number; mtimeMs: number } {
  const relPath = normalizeRel(rel);
  if (!isEpubPath(relPath)) throw new VaultError(400, `Not an EPUB: ${relPath}`);
  const abs = safeAbs(relPath);
  try {
    const stat = statSync(abs);
    if (!stat.isFile()) throw new VaultError(404, `File not found: ${relPath}`);
    return { abs, rel: relPath, size: stat.size, mtimeMs: stat.mtimeMs };
  } catch (err) {
    if (err instanceof VaultError) throw err;
    throw new VaultError(404, `File not found: ${relPath}`);
  }
}

/** Open the archive for the length of one request. The handle is closed on
 *  every path, including the thrown one — a reader that leaks a descriptor per
 *  chapter runs a vault out of file handles in an afternoon. */
async function openArchive(abs: string, size: number): Promise<OpenArchive> {
  const handle = await open(abs, "r");
  try {
    const zip = await readZipDirectory(handle, size);
    return {
      entries: zip.entries,
      size,
      read: async (name: string): Promise<Uint8Array> => {
        const entry = zip.entries.get(name);
        if (!entry) throw new VaultError(404, `Not in this book: ${name}`);
        if (entry.size > ITEM_BYTES_MAX) throw new VaultError(413, `That part of the book is too large to read`);
        return readZipEntryAt(handle, entry, size);
      },
      close: () => handle.close(),
    };
  } catch (err) {
    await handle.close();
    throw err;
  }
}

const decoder = new TextDecoder("utf-8");

async function readText(archive: OpenArchive, name: string): Promise<string> {
  return decoder.decode(await archive.read(name));
}

/** Run `fn` against an open archive, then close it. */
async function withArchive<T>(rel: string, fn: (archive: OpenArchive, file: { rel: string }) => Promise<T>): Promise<T> {
  const file = bookFile(rel);
  let archive: OpenArchive;
  try {
    archive = await openArchive(file.abs, file.size);
  } catch (err) {
    if (err instanceof ZipError) throw new VaultError(415, `Not a readable EPUB: ${err.message}`);
    throw err;
  }
  try {
    return await fn(archive, file);
  } catch (err) {
    if (err instanceof ZipError) throw new VaultError(415, `Not a readable EPUB: ${err.message}`);
    throw err;
  } finally {
    await archive.close();
  }
}

// ── The package document ────────────────────────────────────────────────────

/** The parsed book: metadata, spine and contents. Cached by path-size-mtime,
 *  so re-saving the file in Calibre is picked up without a restart. */
export async function epubBook(rel: string): Promise<EpubBook> {
  const file = bookFile(rel);
  const cacheKey = `${file.rel}:${file.size}:${file.mtimeMs}`;
  const hit = parsed.get(cacheKey);
  if (hit !== undefined) {
    // Touch it, so the eviction below drops the least recently OPENED book
    // rather than the one that happened to be parsed first.
    parsed.delete(cacheKey);
    parsed.set(cacheKey, hit);
    return hit;
  }
  const book = await withArchive(rel, (archive) => readBook(archive));
  parsed.set(cacheKey, book);
  while (parsed.size > PARSE_CACHE_MAX) {
    const oldest = parsed.keys().next();
    if (oldest.done) break;
    parsed.delete(oldest.value);
  }
  return book;
}

async function readBook(archive: OpenArchive): Promise<EpubBook> {
  const opfPath = await packagePath(archive);
  const pkg = parseXml(await readText(archive, opfPath));
  if (pkg === null || pkg.name !== "package") throw new VaultError(415, "This EPUB has no package document");

  const metadata = find(pkg, "metadata");
  const dc = (name: string): string =>
    metadata === null ? "" : (findAll(metadata, name).map(textOf).find((v) => v !== "") ?? "");

  // The manifest: every file in the book, by id, with its declared type.
  const manifestEl = find(pkg, "manifest");
  const byId = new Map<string, { href: string; type: string; properties: string }>();
  const types = new Map<string, string>();
  for (const item of manifestEl === null ? [] : childrenNamed(manifestEl, "item")) {
    const href = resolveEpubHref(opfPath, decodeHref(item.attrs.href ?? ""));
    if (href === "") continue;
    const type = (item.attrs["media-type"] ?? "").trim().toLowerCase();
    const properties = (item.attrs.properties ?? "").toLowerCase();
    if (item.attrs.id) byId.set(item.attrs.id, { href, type, properties });
    types.set(href, type);
  }

  // The spine: the order the book is read in.
  const spineEl = find(pkg, "spine");
  const spine: EpubSpineItem[] = [];
  for (const ref of spineEl === null ? [] : childrenNamed(spineEl, "itemref")) {
    if ((ref.attrs.linear ?? "").toLowerCase() === "no") continue;
    const item = byId.get(ref.attrs.idref ?? "");
    if (!item) continue;
    if (!/xhtml|html|xml/.test(item.type)) continue;
    spine.push({ id: ref.attrs.idref ?? item.href, href: item.href, title: "" });
    if (spine.length >= SPINE_MAX) break;
  }
  if (spine.length === 0) throw new VaultError(415, "This EPUB has no readable chapters");

  const language = (dc("language") || "").trim();
  const direction = directionOf((spineEl?.attrs["page-progression-direction"] ?? "").toLowerCase(), language);

  // The contents: the navigation document first (EPUB 3), the NCX second
  // (EPUB 2). Both are common in the wild and a great many books ship both.
  let toc: EpubTocEntry[] = [];
  const navItem = [...byId.values()].find((i) => i.properties.split(/\s+/).includes("nav"));
  if (navItem) toc = await readNav(archive, navItem.href).catch(() => []);
  if (toc.length === 0) {
    const ncxId = spineEl?.attrs.toc ?? "";
    const ncx = byId.get(ncxId) ?? [...byId.values()].find((i) => i.type.includes("ncx"));
    if (ncx) toc = await readNcx(archive, ncx.href).catch(() => []);
  }

  // A chapter's title for the outline and for the top bar, taken from the
  // contents where the contents name it. A spine item with no entry in the
  // contents keeps "", and the reader prints the book's title instead of
  // inventing one from a filename.
  const labels = new Map<string, string>();
  const collect = (rows: EpubTocEntry[]): void => {
    for (const row of rows) {
      if (!labels.has(row.href)) labels.set(row.href, row.label);
      collect(row.children);
    }
  };
  collect(toc);
  for (const item of spine) item.title = labels.get(item.href) ?? "";

  return {
    title: dc("title"),
    author: dc("creator"),
    language,
    direction,
    spine,
    toc,
    coverHref: coverOf(byId, metadata, spine),
    types,
  };
}

/** `META-INF/container.xml` names the package document. A book without one is
 *  not an EPUB, whatever its extension says. */
async function packagePath(archive: OpenArchive): Promise<string> {
  const container = parseXml(await readText(archive, "META-INF/container.xml").catch(() => ""));
  const rootfile = container === null ? null : find(container, "rootfile");
  const full = cleanEpubHref(decodeHref(rootfile?.attrs["full-path"] ?? ""));
  if (full !== "" && archive.entries.has(full)) return full;
  // A container that is missing or unreadable, against a zip that plainly has
  // a package document in it: read the book rather than refuse it. Converters
  // do get this wrong, and the reader can act on "no chapters" far better
  // than on "no container.xml".
  const guess = [...archive.entries.keys()].find((name) => name.toLowerCase().endsWith(".opf"));
  if (guess) return guess;
  throw new VaultError(415, "This file is not an EPUB");
}

/** An href inside a package document is URL-escaped (`ch%201.xhtml`), and the
 *  zip entry it names is not. */
function decodeHref(value: string): string {
  try {
    return decodeURIComponent(value.trim());
  } catch {
    return value.trim();
  }
}

/**
 * Which way the book is bound.
 *
 * The spine's `page-progression-direction` is the book saying so itself and
 * outranks everything. Failing that the LANGUAGE answers — and for an EPUB
 * that is a real answer, unlike a PDF where client/books/direction.ts has to
 * guess from the codepoints because the format carries no direction at all.
 */
function directionOf(progression: string, language: string): "ltr" | "rtl" {
  if (progression === "rtl") return "rtl";
  if (progression === "ltr") return "ltr";
  const tag = language.toLowerCase();
  // The right-to-left scripts, by language subtag: Arabic, Hebrew, Persian,
  // Urdu, Pashto, Sindhi, Kurdish (Sorani), Divehi, Syriac, N'Ko, Yiddish.
  return /^(ar|he|fa|ur|ps|sd|ckb|dv|syr|nqo|yi|arc|sam)\b/.test(tag) ? "rtl" : "ltr";
}

/** The cover image's href: the EPUB 3 `properties="cover-image"`, the EPUB 2
 *  `<meta name="cover" content="<id>">`, or an id that simply says "cover". */
function coverOf(
  byId: Map<string, { href: string; type: string; properties: string }>,
  metadata: XmlElement | null,
  spine: EpubSpineItem[],
): string | null {
  for (const item of byId.values()) {
    if (item.properties.split(/\s+/).includes("cover-image")) return item.href;
  }
  if (metadata) {
    for (const meta of findAll(metadata, "meta")) {
      if ((meta.attrs.name ?? "").toLowerCase() !== "cover") continue;
      const item = byId.get(meta.attrs.content ?? "");
      if (item && item.type.startsWith("image/")) return item.href;
    }
  }
  for (const [id, item] of byId) {
    if (item.type.startsWith("image/") && /cover/i.test(id)) return item.href;
  }
  // No declared cover: the first chapter is the cover page in a great many
  // books, and the reader draws its own plate when this is null.
  void spine;
  return null;
}

// ── The contents ────────────────────────────────────────────────────────────

/** EPUB 3: `nav.xhtml`, a `<nav epub:type="toc">` around a nested `<ol>`. */
async function readNav(archive: OpenArchive, href: string): Promise<EpubTocEntry[]> {
  const doc = parseXml(await readText(archive, href));
  if (doc === null) return [];
  const navs = findAll(doc, "nav");
  const toc =
    navs.find((n) => (n.attrs["epub:type"] ?? n.attrs.type ?? "").toLowerCase().split(/\s+/).includes("toc")) ??
    navs[0] ??
    null;
  if (toc === null) return [];
  let budget = TOC_MAX;
  const list = (ol: XmlElement, depth: number): EpubTocEntry[] => {
    if (depth > TOC_DEPTH_MAX) return [];
    const rows: EpubTocEntry[] = [];
    for (const li of childrenNamed(ol, "li")) {
      if (budget <= 0) break;
      const anchor = li.children.find((c): c is XmlElement => isElement(c) && (c.name === "a" || c.name === "span"));
      const label = anchor ? textOf(anchor) : "";
      const target = resolveEpubHref(href, decodeHref(anchor?.attrs.href ?? ""));
      const nested = childrenNamed(li, "ol");
      budget -= 1;
      rows.push({
        label: label === "" ? "—" : label,
        href: target,
        fragment: splitHref(decodeHref(anchor?.attrs.href ?? "")).fragment,
        children: nested.length > 0 ? list(nested[0], depth + 1) : [],
      });
    }
    return rows;
  };
  const ol = childrenNamed(toc, "ol")[0] ?? find(toc, "ol");
  return ol === null ? [] : list(ol, 0);
}

/** EPUB 2: `toc.ncx`, a `<navMap>` of nested `<navPoint>`s. */
async function readNcx(archive: OpenArchive, href: string): Promise<EpubTocEntry[]> {
  const doc = parseXml(await readText(archive, href));
  const map = doc === null ? null : find(doc, "navmap");
  if (map === null) return [];
  let budget = TOC_MAX;
  const points = (parent: XmlElement, depth: number): EpubTocEntry[] => {
    if (depth > TOC_DEPTH_MAX) return [];
    const rows: EpubTocEntry[] = [];
    for (const point of childrenNamed(parent, "navpoint")) {
      if (budget <= 0) break;
      const label = childrenNamed(point, "navlabel")[0];
      const content = childrenNamed(point, "content")[0];
      const src = decodeHref(content?.attrs.src ?? "");
      budget -= 1;
      rows.push({
        label: label ? textOf(label) || "—" : "—",
        href: resolveEpubHref(href, src),
        fragment: splitHref(src).fragment,
        children: points(point, depth + 1),
      });
    }
    return rows;
  };
  return points(map, 0);
}

// ── The manifest route's answer ─────────────────────────────────────────────

/** `itemUrl` turns an href inside the archive into a URL this server serves,
 *  so the cover arrives ready for an `<img src>` and the shelf needs to know
 *  nothing about how a book is addressed. */
export async function epubManifest(rel: string, itemUrl: (href: string) => string): Promise<EpubManifest> {
  const book = await epubBook(rel);
  return {
    path: normalizeRel(rel),
    title: book.title,
    author: book.author,
    language: book.language,
    direction: book.direction,
    spine: book.spine,
    toc: book.toc,
    cover: book.coverHref === null ? null : itemUrl(book.coverHref),
  };
}

// ── The sanitizer ───────────────────────────────────────────────────────────
//
// An allowlist, and an emitter. Everything not named here is not written out;
// see rule 2 at the top of this file for why it is built this way round.

/** Elements kept, with their children. The list is "what a book is made of":
 *  structure, headings, paragraphs, lists, tables, quotations, ruby, the
 *  inline semantics, figures and images. */
const KEEP = new Set([
  "html", "body", "div", "section", "article", "aside", "nav", "header", "footer", "main", "figure", "figcaption",
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "blockquote", "pre", "hr", "br", "wbr",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "a", "span", "em", "strong", "i", "b", "u", "s", "small", "sub", "sup", "code", "kbd", "samp", "var",
  "abbr", "cite", "q", "dfn", "time", "mark", "del", "ins", "bdi", "bdo", "ruby", "rt", "rp", "rb", "rtc",
  "img", "svg", "image", "picture", "source",
]);

/** Elements dropped WITH everything inside them. A `<script>`'s text is not
 *  prose and a `<form>`'s children are controls; keeping either one's content
 *  would put a page of JavaScript into the middle of a chapter. */
const DROP_SUBTREE = new Set([
  "script", "noscript", "form", "input", "button", "select", "option", "textarea", "label", "fieldset", "legend",
  "iframe", "object", "embed", "applet", "audio", "video", "track", "canvas", "template", "map", "area",
  "head", "title", "meta", "base", "link", "style",
]);

/** Attributes kept on every element. `id` is not decoration: a contents entry
 *  points at `chapter.xhtml#sec3`, and without ids half the outline lands at
 *  the top of the chapter. `class` is kept because the publisher's own
 *  stylesheet selects on it, and that stylesheet is scoped
 *  (shared/epubCss.ts). `style` is NOT kept — see the note there. */
const GLOBAL_ATTRS = new Set(["id", "class", "dir", "lang", "title", "role"]);

/** Attributes kept on particular elements. `src`/`href` are handled
 *  separately, because they are rewritten rather than copied. */
const ELEMENT_ATTRS: Record<string, Set<string>> = {
  img: new Set(["alt", "width", "height"]),
  image: new Set(["width", "height", "x", "y", "preserveaspectratio"]),
  svg: new Set(["viewbox", "width", "height", "preserveaspectratio"]),
  td: new Set(["colspan", "rowspan", "headers"]),
  th: new Set(["colspan", "rowspan", "headers", "scope", "abbr"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
  ol: new Set(["start", "reversed", "type"]),
  li: new Set(["value"]),
  time: new Set(["datetime"]),
  bdo: new Set(["dir"]),
  q: new Set([]),
  blockquote: new Set([]),
};

/** Elements written as `<x />` because they have no content. */
const VOID = new Set(["br", "wbr", "hr", "img", "col", "source"]);

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}

export interface SanitizeContext {
  /** The chapter's own href, for resolving its relative URLs. */
  base: string;
  /** Turn an archive href into a URL this server will serve, or null. */
  url(href: string): string | null;
  /** The text of one of the book's stylesheets, already sanitized. */
  css(href: string): Promise<string | null> | string | null;
}

/**
 * One chapter, rebuilt from an allowlist.
 *
 * Returns the BODY's markup — no `<html>`, no `<head>` — plus the stylesheets
 * it asked for, already sanitized and concatenated. The two travel together
 * because a chapter and its CSS are one thing to look at and two requests is
 * one round trip too many on a phone; `/api/books/epub/item` still serves a
 * stylesheet on its own, with `text/css`, for anything that wants one.
 *
 * INTERNAL LINKS DO NOT BECOME `href`s. An `<a>` that points inside the book
 * is emitted as `data-href`/`data-fragment` with `role="link"` and a
 * `tabindex`, and the reader listens for it: a real `href` in a single-page
 * app is a navigation away from the app, and a real `href="#sec3"` is a jump
 * the reader's own scroll bookkeeping never sees. An `<a>` that points OUT of
 * the book keeps its words and loses its link entirely — a book must not be
 * able to make this origin issue a request to anywhere.
 */
export async function sanitizeChapter(source: string, ctx: SanitizeContext): Promise<{ html: string; css: string }> {
  const doc = parseXml(source);
  const sheets: string[] = [];
  if (doc === null) return { html: "", css: "" };

  // The stylesheets the chapter links, and its own inline `<style>` blocks,
  // in document order — the order is the cascade.
  const wanted: Array<{ kind: "link"; href: string } | { kind: "inline"; text: string }> = [];
  const head = find(doc, "head");
  const scanHead = (el: XmlElement): void => {
    for (const child of el.children) {
      if (!isElement(child)) continue;
      if (child.name === "link" && (child.attrs.rel ?? "").toLowerCase().includes("stylesheet")) {
        const href = resolveEpubHref(ctx.base, decodeHref(child.attrs.href ?? ""));
        if (href !== "") wanted.push({ kind: "link", href });
      } else if (child.name === "style") {
        wanted.push({ kind: "inline", text: child.children.map((c) => (isElement(c) ? "" : c.text)).join("") });
      }
      scanHead(child);
    }
  };
  scanHead(head ?? doc);
  for (const sheet of wanted) {
    if (sheet.kind === "inline") {
      sheets.push(sanitizeEpubCss(sheet.text, ctx.base, (href, base) => ctx.url(resolveEpubHref(base, decodeHref(href)))));
    } else {
      const text = await ctx.css(sheet.href);
      if (text !== null) sheets.push(text);
    }
  }

  const body = find(doc, "body") ?? doc;
  const out: string[] = [];
  emit(body, out, ctx, 0);
  return { html: out.join(""), css: sheets.join("\n") };
}

/** How deep the emitter will go. A generated file can nest `<div>` ten
 *  thousand times, and a recursive walk of it is a stack overflow that takes
 *  the server down — the whole point of treating this markup as hostile. */
const DEPTH_MAX = 100;

function emit(el: XmlElement, out: string[], ctx: SanitizeContext, depth: number): void {
  for (const child of el.children) {
    if (!isElement(child)) {
      out.push(escapeText(child.text));
      continue;
    }
    if (DROP_SUBTREE.has(child.name)) continue;
    if (depth >= DEPTH_MAX) continue;
    if (!KEEP.has(child.name)) {
      // An element nobody listed, but whose CONTENT is still the book's words
      // — a `<center>`, a namespaced `<epub:switch>`, something a converter
      // invented. The words survive, the box does not.
      emit(child, out, ctx, depth + 1);
      continue;
    }
    const attrs = attributesOf(child, ctx);
    if (VOID.has(child.name)) {
      out.push(`<${child.name}${attrs} />`);
      continue;
    }
    out.push(`<${child.name}${attrs}>`);
    emit(child, out, ctx, depth + 1);
    out.push(`</${child.name}>`);
  }
}

function attributesOf(el: XmlElement, ctx: SanitizeContext): string {
  const parts: string[] = [];
  const allowed = ELEMENT_ATTRS[el.name];
  for (const [rawName, value] of Object.entries(el.attrs)) {
    // `xml:lang` is what an XHTML book actually writes; it means `lang`.
    const name = rawName === "xml:lang" ? "lang" : rawName;
    if (name.startsWith("on")) continue; // never, under any circumstances
    if (!GLOBAL_ATTRS.has(name) && !(allowed && allowed.has(name))) continue;
    if (value.length > 2000) continue;
    parts.push(`${name === "preserveaspectratio" ? "preserveAspectRatio" : name === "viewbox" ? "viewBox" : name}="${escapeAttr(value)}"`);
  }
  if (el.name === "a") {
    const raw = decodeHref(el.attrs.href ?? "");
    const isExternal = /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//");
    if (raw.startsWith("#")) {
      parts.push(`data-href="${escapeAttr(ctx.base)}"`, `data-fragment="${escapeAttr(splitHref(raw).fragment)}"`);
      parts.push('role="link"', 'tabindex="0"');
    } else if (!isExternal && raw !== "") {
      const target = resolveEpubHref(ctx.base, raw);
      if (target !== "") {
        parts.push(`data-href="${escapeAttr(target)}"`, `data-fragment="${escapeAttr(splitHref(raw).fragment)}"`);
        parts.push('role="link"', 'tabindex="0"');
      }
    }
    // An external link keeps its words and nothing else: see the note above.
  }
  if (el.name === "img" || el.name === "image" || el.name === "source") {
    const raw = decodeHref(el.attrs.src ?? el.attrs["xlink:href"] ?? el.attrs.href ?? el.attrs.srcset ?? "");
    if (/^data:image\//i.test(raw)) {
      parts.push(`src="${escapeAttr(raw.slice(0, 2_000_000))}"`);
    } else {
      const url = raw === "" ? null : ctx.url(resolveEpubHref(ctx.base, raw));
      if (url !== null) parts.push(`src="${escapeAttr(url)}"`);
    }
    if (el.name === "img" && el.attrs.alt === undefined) parts.push('alt=""');
    // An `<image>` inside an `<svg>` is addressed by `href`, not `src`.
    if (el.name === "image") {
      const last = parts.findIndex((p) => p.startsWith("src="));
      if (last >= 0) parts[last] = parts[last].replace(/^src=/, "href=");
    }
  }
  return parts.length === 0 ? "" : ` ${parts.join(" ")}`;
}

// ── What the routes call ────────────────────────────────────────────────────

/** Is this href one of the book's own files? A request for anything else is
 *  a request for a name that is not in the archive, and gets the 404 it
 *  deserves — `cleanEpubHref` has already made climbing out impossible. */
function itemEntry(archive: OpenArchive, href: string): string | null {
  const name = cleanEpubHref(href);
  if (name === "" || !archive.entries.has(name)) return null;
  return name;
}

export interface EpubItem {
  kind: "chapter" | "asset";
  contentType: string;
  /** Set for `kind: "chapter"` — the rebuilt markup and its stylesheet. */
  html?: string;
  css?: string;
  /** Set for `kind: "asset"`. */
  bytes?: Uint8Array;
  /** The bytes' identity, for an ETag: the zip's own CRC and size. */
  etag: string;
}

const EXT_TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
};

/** Types this route will serve as bytes. An EPUB may contain anything; what
 *  a chapter can DRAW is pictures, stylesheets and fonts, and serving the
 *  rest would be serving arbitrary files out of the owner's vault under this
 *  origin — with an `image/svg+xml` among them, which is why every asset
 *  answer carries `Content-Security-Policy: sandbox` in the route. */
function assetType(href: string): string | null {
  const ext = href.slice(href.lastIndexOf(".") + 1).toLowerCase();
  return EXT_TYPES[ext] ?? null;
}

/** The item route's whole answer: a rebuilt chapter, or an asset's bytes. */
export async function epubItem(rel: string, href: string, itemUrl: (href: string) => string): Promise<EpubItem> {
  const book = await epubBook(rel);
  return withArchive(rel, async (archive) => {
    const name = itemEntry(archive, href);
    if (name === null) throw new VaultError(404, "Not in this book");
    const entry = archive.entries.get(name)!;
    const etag = `"${entry.crc.toString(16)}-${entry.size.toString(16)}"`;
    const declared = book.types.get(name) ?? "";

    if (/xhtml|\bhtml\b/.test(declared) || /\.x?html?$/i.test(name)) {
      const { html, css } = await sanitizeChapter(await readText(archive, name), {
        base: name,
        url: (target) => (itemEntry(archive, target) === null ? null : itemUrl(target)),
        css: async (sheet) => {
          const sheetName = itemEntry(archive, sheet);
          if (sheetName === null) return null;
          return sanitizeEpubCss(await readText(archive, sheetName), sheetName, (u, base) => {
            const target = resolveEpubHref(base, decodeHref(u));
            return itemEntry(archive, target) === null ? null : itemUrl(target);
          });
        },
      });
      return { kind: "chapter", contentType: "text/html; charset=utf-8", html, css, etag };
    }

    if (/\.css$/i.test(name) || declared === "text/css") {
      const css = sanitizeEpubCss(await readText(archive, name), name, (u, base) => {
        const target = resolveEpubHref(base, decodeHref(u));
        return itemEntry(archive, target) === null ? null : itemUrl(target);
      });
      return { kind: "asset", contentType: "text/css; charset=utf-8", bytes: new TextEncoder().encode(css), etag };
    }

    const type = assetType(name) ?? (declared.startsWith("image/") ? declared : null);
    if (type === null) throw new VaultError(415, "That part of the book is not something the reader serves");
    return { kind: "asset", contentType: type, bytes: await archive.read(name), etag };
  });
}

// ── Search ──────────────────────────────────────────────────────────────────

/** The words of a chapter, with the markup gone. Block elements become a
 *  space so that "…end of paragraph" and "Next heading" do not run together
 *  into a word that is in neither. */
export function chapterText(html: string): string {
  return html
    .replace(/<(p|div|h[1-6]|li|tr|br|section|blockquote|figure|figcaption|td|th)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find a phrase in a book.
 *
 * Server-side, because the alternative is shipping every chapter of a
 * 300-chapter book to the browser to search it — which is the whole book, on
 * every search. The MATCHING is `shared/fold.ts::foldQuery`, the same fold
 * the PDF reader's `/` uses and the same one the vault's own index uses:
 * somebody typing «المقدمة» has to find a page printing «الْمُقَدِّمَة», and
 * this product has exactly one implementation of that rule.
 *
 * The offset in a hit is into the chapter's TEXT, not its markup — the reader
 * walks the rendered chapter's text nodes to the same offset, which is the
 * only kind of offset that can be turned back into a range in a DOM the
 * server never saw.
 */
export async function searchEpub(rel: string, query: string, limit = EPUB_HITS_MAX): Promise<EpubHit[]> {
  const needle = foldQuery(query);
  if (needle === "") return [];
  const book = await epubBook(rel);
  const hits: EpubHit[] = [];
  await withArchive(rel, async (archive) => {
    for (const item of book.spine) {
      if (hits.length >= limit) break;
      const name = itemEntry(archive, item.href);
      if (name === null) continue;
      let text: string;
      try {
        const { html } = await sanitizeChapter(await readText(archive, name), {
          base: name,
          url: () => null,
          css: () => null,
        });
        text = chapterText(html);
      } catch {
        continue; // one unreadable chapter does not fail a search
      }
      for (const at of foldedMatches(text, needle, limit - hits.length)) {
        hits.push({
          href: item.href,
          title: item.title,
          offset: at.start,
          snippet: snippetAround(text, at.start, at.end),
        });
      }
    }
  });
  return hits;
}

/**
 * Every place `needle` (already folded) occurs in `text`, as offsets into
 * `text` ITSELF.
 *
 * The fold is per character and it can DROP characters — a harakat, a tatweel,
 * a zero-width joiner all fold to nothing — so an offset into the folded
 * string is not an offset into the chapter, and the reader would flash the
 * wrong words. The map back is therefore built explicitly, once per chapter:
 * a folded haystack and, beside it, the index in the original that each folded
 * character came from.
 */
function foldedMatches(text: string, needle: string, limit: number): Array<{ start: number; end: number }> {
  const folded: string[] = [];
  const at: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const piece = foldQuery(text[i]);
    for (let k = 0; k < piece.length; k++) {
      folded.push(piece[k]);
      at.push(i);
    }
  }
  const hay = folded.join("");
  const out: Array<{ start: number; end: number }> = [];
  let from = 0;
  while (out.length < limit) {
    const found = hay.indexOf(needle, from);
    if (found === -1) break;
    const start = at[found];
    const end = (at[found + needle.length - 1] ?? at[at.length - 1] ?? start) + 1;
    out.push({ start, end });
    from = found + Math.max(1, needle.length);
  }
  return out;
}

function snippetAround(text: string, start: number, end: number): string {
  const from = Math.max(0, start - SNIPPET_PAD);
  const to = Math.min(text.length, end + SNIPPET_PAD);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

// ── Progress ────────────────────────────────────────────────────────────────

/**
 * How far into the book a place is, 0..1.
 *
 * Chapters, not words: `(index + fraction) / count`. A book's chapters are
 * not equal in length and this number is therefore not a word count — it is
 * the same promise the PDF reader's page bar makes (`progressOf`), which is
 * also "how far along the units the book is divided into". Anything truer
 * would mean reading every chapter to weigh it, on every shelf listing.
 */
export function epubProgress(place: EpubPlace, spine: readonly EpubSpineItem[]): number {
  if (spine.length === 0) return 0;
  const index = spine.findIndex((item) => item.href === place.href);
  if (index === -1) return 0;
  return Math.min(1, Math.max(0, (index + Math.min(1, Math.max(0, place.fraction))) / spine.length));
}
