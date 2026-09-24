// A FEED ITEM'S HTML, MADE SAFE TO SHOW (docs/feeds.md).
//
// A feed is somebody else's HTML, and the Feeds surface renders it inside
// the owner's session — the one browser tab in the world that can publish,
// delete and rewrite this vault. So nothing in it runs: this walks the tree
// shared/htmlToMarkdown.ts already builds (`parseHtml`, the clipper's own
// tokenizer — one idea of what a page is, not two) and prints back an
// ALLOWLIST. Every tag not on the list is unwrapped (its words kept, the tag
// gone) or, for the content-free ones the converter already drops (script,
// style, iframe, forms, media players), removed with everything inside it.
// Every attribute not on a tag's own list is dropped; a link or an image
// keeps an address only when it resolves to http(s) against the item; a link
// opens in a new tab with no referrer and no opener; an image loads lazily,
// sends no referrer, and is never an SVG (an SVG is a document with scripts).
// Text is escaped on the way out. The result is a string a component can
// hand to `dangerouslySetInnerHTML` without a second thought — which is the
// whole point of doing it on the server, once, before the wire.

import { decodeEntities, parseHtml, type ElementNode, type Node } from "./htmlToMarkdown.ts";

/** Tags that survive, with the attributes each may keep. */
const KEEP: Record<string, readonly string[]> = {
  p: [], br: [], hr: [],
  h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
  ul: [], ol: ["start"], li: [],
  blockquote: [], pre: [], code: [],
  em: [], i: [], strong: [], b: [], u: [], s: [], del: [], ins: [], mark: [], small: [], sub: [], sup: [], abbr: ["title"], q: [], cite: [],
  a: ["href", "title"],
  img: ["src", "alt", "title", "width", "height"],
  figure: [], figcaption: [],
  table: [], thead: [], tbody: [], tfoot: [], tr: [], th: ["colspan", "rowspan"], td: ["colspan", "rowspan"], caption: [],
  dl: [], dt: [], dd: [],
  div: [], span: [], section: [], article: [], aside: [], header: [], footer: [], main: [], details: [], summary: [],
};

/** Removed WITH their contents: nothing under these is prose, and some of
 *  them are the dangerous part. */
const DROP = new Set([
  "script", "style", "noscript", "template", "svg", "math", "iframe", "frame", "frameset", "object", "embed",
  "canvas", "video", "audio", "source", "track", "map", "head", "title", "meta", "link", "base",
  "button", "input", "select", "textarea", "option", "datalist", "dialog", "form", "applet", "portal",
]);

const VOID = new Set(["br", "hr", "img"]);

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return escapeText(text).replace(/"/g, "&quot;");
}

/** `value` made absolute against `base`, http(s) only. */
export function safeUrl(value: string, base: string | null): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  try {
    const url = base ? new URL(trimmed, base) : new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function attrsOf(el: ElementNode, base: string | null): string | null {
  const allowed = KEEP[el.name];
  const out: string[] = [];
  for (const name of allowed) {
    const raw = el.attrs[name];
    if (raw === undefined) continue;
    if (name === "href" || name === "src") {
      const url = safeUrl(raw, base);
      if (url === null) continue;
      // An SVG image is a document: it can carry script, and it is the one
      // image format this allowlist will not vouch for.
      if (name === "src" && /\.svgz?(?:[?#]|$)/i.test(new URL(url).pathname)) return null;
      out.push(`${name}="${escapeAttr(url)}"`);
      continue;
    }
    if ((name === "width" || name === "height" || name === "start" || name === "colspan" || name === "rowspan") && !/^\d{1,5}$/.test(raw.trim())) continue;
    out.push(`${name}="${escapeAttr(raw.replace(/\s+/g, " ").trim())}"`);
  }
  if (el.name === "a") {
    if (!out.some((a) => a.startsWith("href="))) return "";
    out.push('target="_blank"', 'rel="noopener noreferrer nofollow"');
  }
  if (el.name === "img") {
    if (!out.some((a) => a.startsWith("src="))) return null;
    out.push('loading="lazy"', 'decoding="async"', 'referrerpolicy="no-referrer"');
  }
  return out.length === 0 ? "" : ` ${out.join(" ")}`;
}

function render(node: Node, base: string | null, depth: number): string {
  if (node.type === "text") return escapeText(decodeEntities(node.text));
  if (DROP.has(node.name)) return "";
  const inner = depth > 200 ? "" : node.children.map((c) => render(c, base, depth + 1)).join("");
  if (!(node.name in KEEP)) return inner;
  const attrs = attrsOf(node, base);
  if (attrs === null) return "";
  // A link that lost its address is its words.
  if (node.name === "a" && attrs === "") return inner;
  if (VOID.has(node.name)) return `<${node.name}${attrs}>`;
  return `<${node.name}${attrs}>${inner}</${node.name}>`;
}

/** `html` as safe HTML, links and images resolved against `baseUrl`. */
export function sanitizeFeedHtml(html: string, baseUrl: string | null): string {
  const root = parseHtml(html);
  return root.children.map((c) => render(c, baseUrl, 0)).join("").trim();
}

/** The first words of `html`, as plain text, for a list row. */
export function htmlExcerpt(html: string, max = 220): string {
  const root = parseHtml(html);
  const words: string[] = [];
  const walk = (node: Node): void => {
    if (node.type === "text") {
      words.push(decodeEntities(node.text));
      return;
    }
    if (DROP.has(node.name)) return;
    for (const c of node.children) walk(c);
    if (node.name === "p" || node.name === "br" || node.name === "li" || /^h[1-6]$/.test(node.name)) words.push(" ");
  };
  walk(root);
  const text = words.join("").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/** How many letters of prose `html` carries — the test for "the feed
 *  carried the article" versus "the feed carried a teaser". */
export function proseLength(html: string): number {
  return htmlExcerpt(html, Number.MAX_SAFE_INTEGER).length;
}
