// WEBMENTIONS, THE PURE HALF (docs/webmentions.md).
//
// Everything about a mention that can be answered from text alone lives
// here, with no network and no store, so the tests can ask it directly:
//
//   · whether a source page links to a target (the one thing a receiver MUST
//     verify before it files anything — W3C Webmention §3.2.2);
//   · what the page says about itself, read as microformats2: the first
//     h-entry's author (an h-card, or words), name, url, photo, a plain-text
//     summary of its content, and whether it is a like, a repost or a reply
//     OF THIS TARGET (`u-like-of`, `u-repost-of`, `u-in-reply-to` — the
//     post-type-discovery order) or a mere mention;
//   · where a site says its endpoint is (a `Link:` header first, then the
//     first `<link>` or `<a>` with `rel=webmention` in the document, relative
//     addresses resolved against the page — §3.1.2);
//   · which of a note's links go to OTHER sites, read the way the reading
//     view renders them (client/reading/render.ts): `[text](https://…)`,
//     `<https://…>`, a bare `https://…` in prose, and a raw `<a href>`. Never
//     a wikilink (those are the vault's), never an image (`![…](…)` renders
//     as a picture, not a link), and never anything inside code.
//
// The HTML is read with the clipper's own tolerant parser
// (shared/htmlToMarkdown.ts::parseHtml) — no dependency, and a ragged page
// is read the way a browser would read it.

import { decodeEntities, parseHtml, type ElementNode, type Node } from "./htmlToMarkdown.ts";

/** What a mention says it is. */
export type MentionType = "like" | "repost" | "reply" | "mention";
export const MENTION_TYPES: readonly MentionType[] = ["like", "repost", "reply", "mention"];

/** Where an entry in the comments store came from. `comment` is a visitor's
 *  form; the other two are the channels this feature adds. */
export type InteractionKind = "comment" | "webmention" | "activitypub";

export interface MentionAuthor {
  name: string;
  url: string | null;
  photo: string | null;
}

export interface ParsedMention {
  type: MentionType;
  author: MentionAuthor | null;
  /** The entry's own name, when it has one distinct from its content. */
  name: string | null;
  /** The entry's permalink (u-url), else the source. */
  url: string;
  /** A photo the entry carries (u-photo), absolute. */
  photo: string | null;
  /** The content as plain text, collapsed and capped. */
  summary: string;
  /** dt-published as ms, when it parses. */
  published: number | null;
}

/** The longest summary kept: the comments store's own body cap. */
export const MENTION_SUMMARY_MAX = 2000;

// ── URLs ────────────────────────────────────────────────────────────────────

/** A URL in the one spelling two URLs are compared in: absolute, fragment
 *  dropped, host lowercased (URL does that), a lone trailing slash on the
 *  path dropped. Null for anything that is not http(s). */
export function normalizeUrl(raw: string, base?: string): string | null {
  try {
    const url = base ? new URL(raw.trim(), base) : new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    let href = url.href;
    if (url.pathname.length > 1 && href.endsWith("/") && url.search === "") href = href.slice(0, -1);
    else if (url.pathname === "/" && url.search === "") href = href.replace(/\/$/, "");
    return href;
  } catch {
    return null;
  }
}

/** Do these two addresses name the same page? Percent-encoding is compared
 *  decoded, because one site writes `/مقالة` and another `/%D9%85…`. */
export function sameUrl(a: string, b: string): boolean {
  const x = normalizeUrl(a);
  const y = normalizeUrl(b);
  if (x === null || y === null) return false;
  if (x === y) return true;
  try {
    return decodeURI(x) === decodeURI(y);
  } catch {
    return false;
  }
}

// ── Walking the tree ────────────────────────────────────────────────────────

function classesOf(el: ElementNode): string[] {
  return (el.attrs.class ?? "").split(/\s+/).filter((c) => c !== "");
}

function isRoot(el: ElementNode): boolean {
  return classesOf(el).some((c) => /^h-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c));
}

function textOf(node: Node): string {
  if (node.type === "text") return decodeEntities(node.text);
  if (node.name === "script" || node.name === "style" || node.name === "template") return "";
  if (node.name === "img") return node.attrs.alt ?? "";
  return node.children.map(textOf).join("");
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function walk(node: Node, visit: (el: ElementNode) => boolean | void): void {
  if (node.type !== "el") return;
  if (visit(node) === false) return;
  for (const child of node.children) walk(child, visit);
}

function findRoots(node: Node, cls: string): ElementNode[] {
  const out: ElementNode[] = [];
  walk(node, (el) => {
    if (classesOf(el).includes(cls)) {
      out.push(el);
      return false; // a nested h-entry belongs to this one
    }
  });
  return out;
}

/** mf2 `u-*` value: the element's address attribute, else its words. */
function uValue(el: ElementNode, base: string): string | null {
  const attr =
    el.name === "a" || el.name === "area" || el.name === "link"
      ? el.attrs.href
      : el.name === "img" || el.name === "audio" || el.name === "video" || el.name === "source" || el.name === "iframe"
        ? el.attrs.src
        : el.name === "object"
          ? el.attrs.data
          : el.name === "data" || el.name === "input"
            ? el.attrs.value
            : undefined;
  const raw = attr ?? collapse(textOf(el));
  if (raw === "") return null;
  return normalizeUrl(raw, base);
}

interface PropValue {
  /** The plain value (text or url). */
  value: string | null;
  /** When the property element is itself a microformat (p-author h-card). */
  nested: ElementNode | null;
}

/** Every property of `root` with this prefix+name: the elements below the
 *  root, not descending into nested roots except to read them as values. */
function props(root: ElementNode, prefix: "p" | "u" | "dt" | "e", name: string, base: string): PropValue[] {
  const want = `${prefix}-${name}`;
  const out: PropValue[] = [];
  const visit = (node: Node): void => {
    if (node.type !== "el") return;
    const cls = classesOf(node);
    if (cls.includes(want)) {
      const nested = isRoot(node) ? node : null;
      let value: string | null;
      if (prefix === "u") value = nested ? (nestedUrl(node, base) ?? uValue(node, base)) : uValue(node, base);
      else if (prefix === "dt") value = node.attrs.datetime ?? collapse(textOf(node));
      else if (prefix === "p" && node.name === "img") value = node.attrs.alt ?? null;
      else if (prefix === "p" && (node.name === "abbr" || node.name === "link") && node.attrs.title) value = node.attrs.title;
      else if (prefix === "p" && (node.name === "data" || node.name === "input") && node.attrs.value) value = node.attrs.value;
      else value = collapse(textOf(node));
      out.push({ value: value === "" ? null : value, nested });
    }
    // A nested microformat is its own world: its properties are not ours.
    if (isRoot(node) && node !== root) return;
    for (const child of node.children) visit(child);
  };
  for (const child of root.children) visit(child);
  return out;
}

/** The url of a nested h-cite / h-entry used as a property value. */
function nestedUrl(el: ElementNode, base: string): string | null {
  const u = props(el, "u", "url", base)[0]?.value;
  if (u) return u;
  if (el.name === "a" && el.attrs.href) return normalizeUrl(el.attrs.href, base);
  return null;
}

function hcard(el: ElementNode, base: string): MentionAuthor {
  const name = props(el, "p", "name", base)[0]?.value ?? (collapse(textOf(el)) || null);
  const url = props(el, "u", "url", base)[0]?.value ?? (el.name === "a" && el.attrs.href ? normalizeUrl(el.attrs.href, base) : null);
  const photo =
    props(el, "u", "photo", base)[0]?.value ??
    (el.name === "img" && el.attrs.src ? normalizeUrl(el.attrs.src, base) : null) ??
    // The implied photo: a lone <img> child of the card.
    (() => {
      const img = el.children.find((c): c is ElementNode => c.type === "el" && c.name === "img");
      return img?.attrs.src ? normalizeUrl(img.attrs.src, base) : null;
    })();
  return { name: name ?? url ?? "", url, photo };
}

function titleOf(root: ElementNode): string | null {
  let title: string | null = null;
  walk(root, (el) => {
    if (title !== null) return false;
    if (el.name === "title") {
      title = collapse(textOf(el)) || null;
      return false;
    }
  });
  return title;
}

function capped(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// ── The receiver's questions ────────────────────────────────────────────────

/** Does `html` (fetched from `sourceUrl`) link to any of `targets`? An
 *  `<a href>`, an `<img src>` and the rest of the linking attributes count
 *  (the spec's "a link"); words that merely spell the address do not. */
export function linksTo(html: string, sourceUrl: string, targets: readonly string[]): boolean {
  const root = parseHtml(html);
  let found = false;
  walk(root, (el) => {
    if (found) return false;
    for (const attr of ["href", "src", "data", "cite"]) {
      const raw = el.attrs[attr];
      if (raw === undefined) continue;
      const url = normalizeUrl(raw, sourceUrl);
      if (url !== null && targets.some((t) => sameUrl(url, t))) {
        found = true;
        return false;
      }
    }
  });
  return found;
}

/** The first h-entry of `html` read as a mention of `target` — or, when the
 *  page carries no h-entry, the page's title as a plain mention. */
export function parseMention(html: string, sourceUrl: string, target: string): ParsedMention {
  const root = parseHtml(html);
  const entry = findRoots(root, "h-entry")[0] ?? null;
  const source = normalizeUrl(sourceUrl) ?? sourceUrl;
  if (entry === null) {
    return { type: "mention", author: null, name: titleOf(root), url: source, photo: null, summary: "", published: null };
  }
  const base = sourceUrl;
  const refersToTarget = (name: string): boolean =>
    props(entry, "u", name, base).some((p) => p.value !== null && sameUrl(p.value, target));
  // Post-type discovery's order: a repost, then a like, then a reply.
  const type: MentionType = refersToTarget("repost-of")
    ? "repost"
    : refersToTarget("like-of")
      ? "like"
      : refersToTarget("in-reply-to")
        ? "reply"
        : "mention";

  const authorProp = props(entry, "p", "author", base)[0] ?? props(entry, "u", "author", base)[0] ?? null;
  let author: MentionAuthor | null = null;
  if (authorProp?.nested) author = hcard(authorProp.nested, base);
  else if (authorProp?.value) {
    const asUrl = /^https?:\/\//i.test(authorProp.value) ? normalizeUrl(authorProp.value) : null;
    author = { name: authorProp.value, url: asUrl, photo: null };
  } else {
    // The page's own representative h-card, when the entry names none.
    const card = findRoots(root, "h-card")[0];
    if (card) author = hcard(card, base);
  }

  const content = props(entry, "e", "content", base)[0]?.value ?? props(entry, "p", "content", base)[0]?.value ?? null;
  const summaryProp = props(entry, "p", "summary", base)[0]?.value ?? null;
  const nameProp = props(entry, "p", "name", base)[0]?.value ?? null;
  const text = content ?? summaryProp ?? "";
  // mf2's implied name is the entry's whole text; a name equal to (the start
  // of) the content is not a title and is not repeated.
  const name = nameProp !== null && text !== "" && collapse(text).startsWith(nameProp.slice(0, 40)) ? null : nameProp;
  const url = props(entry, "u", "url", base)[0]?.value ?? source;
  const photo = props(entry, "u", "photo", base)[0]?.value ?? null;
  const publishedRaw = props(entry, "dt", "published", base)[0]?.value ?? null;
  const publishedMs = publishedRaw ? Date.parse(publishedRaw) : Number.NaN;
  return {
    type,
    author,
    name,
    url,
    photo,
    summary: capped(collapse(text), MENTION_SUMMARY_MAX),
    published: Number.isFinite(publishedMs) ? publishedMs : null,
  };
}

// ── The sender's questions ──────────────────────────────────────────────────

/** The webmention endpoint a page advertises: the `Link:` header first, then
 *  the first `<link>` or `<a>` in document order whose rel includes
 *  `webmention`. Relative addresses resolve against the page (an empty href
 *  is the page itself, §3.1.2). Null when there is none. */
export function discoverEndpoint(linkHeader: string | null | undefined, html: string, pageUrl: string): string | null {
  if (linkHeader) {
    for (const part of splitLinkHeader(linkHeader)) {
      const m = /^\s*<([^>]*)>(.*)$/.exec(part);
      if (!m) continue;
      const rel = /;\s*rel\s*=\s*(?:"([^"]*)"|([^\s;,]+))/i.exec(m[2]);
      const rels = (rel?.[1] ?? rel?.[2] ?? "").toLowerCase().split(/\s+/);
      if (rels.includes("webmention")) return resolveEndpoint(m[1], pageUrl);
    }
  }
  if (!/webmention/i.test(html)) return null;
  let found: string | null = null;
  walk(parseHtml(html), (el) => {
    if (found !== null) return false;
    if ((el.name === "link" || el.name === "a") && el.attrs.href !== undefined) {
      const rels = (el.attrs.rel ?? "").toLowerCase().split(/\s+/);
      if (rels.includes("webmention")) {
        found = resolveEndpoint(el.attrs.href, pageUrl);
        return false;
      }
    }
  });
  return found;
}

function resolveEndpoint(href: string, pageUrl: string): string | null {
  try {
    const url = new URL(href, pageUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

/** A Link header's comma-separated parts, commas inside `<…>` or quotes kept. */
function splitLinkHeader(header: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inAngle = false;
  let inQuote = false;
  for (const ch of header) {
    if (ch === "<" && !inQuote) inAngle = true;
    else if (ch === ">" && !inQuote) inAngle = false;
    else if (ch === '"' && !inAngle) inQuote = !inQuote;
    if (ch === "," && !inAngle && !inQuote) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim() !== "") out.push(cur);
  return out;
}

/** The note's links to other pages, in the order they appear, each once —
 *  exactly the links the reading view renders as `s-rv-ext` anchors plus a
 *  raw `<a href>`, from Markdown `source` (frontmatter, fenced and inline code
 *  skipped). Only http(s); the caller drops its own site's addresses. */
export function outboundLinks(source: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string): void => {
    const url = normalizeUrl(decodeEntities(raw));
    if (url === null || seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  // Frontmatter: a leading `---` block.
  if (lines[0]?.trim() === "---") {
    const close = lines.findIndex((l, k) => k > 0 && (l.trim() === "---" || l.trim() === "..."));
    if (close > 0) i = close + 1;
  }
  let fence: string | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const opener = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence !== null) {
      if (opener && opener[1][0] === fence[0] && opener[1].length >= fence.length && line.trim() === opener[1]) fence = null;
      continue;
    }
    if (opener) {
      fence = opener[1];
      continue;
    }
    let s = line.replace(/`+[^`]*`+/g, " ");
    // Images first, as the renderer does: a picture is not a link.
    s = s.replace(/!\[[^\]]*\]\([^)\s]+(?:\s+"[^)]*")?\)/g, " ");
    // Wikilinks are the vault's.
    s = s.replace(/\[\[[^[\]]+?\]\]/g, " ");
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_m, _t: string, url: string) => {
      add(url);
      return " ";
    });
    s = s.replace(/<(https?:\/\/[^\s>]+)>/g, (_m, url: string) => {
      add(url);
      return " ";
    });
    s = s.replace(/<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi, (_m, a?: string, b?: string) => {
      const url = a ?? b ?? "";
      if (/^https?:/i.test(url)) add(url);
      return " ";
    });
    for (const m of s.matchAll(/(^|[\s(])(https?:\/\/[^\s<>()\x00"']+)/g)) {
      add(m[2].replace(/[.,;:!?]+$/, ""));
    }
  }
  return out;
}
