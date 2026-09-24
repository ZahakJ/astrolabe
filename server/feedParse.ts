// READING A FEED: RSS 2.0, Atom and JSON Feed, into one shape
// (docs/feeds.md).
//
// Three formats, one question each asks of a document: what is this feed
// called, where is its site, and what are its items — each with an id that
// stays the same between fetches, an address, a title, a date, and whatever
// of the article the feed chose to carry. The XML two are read by the small
// reader the EPUB importer brought (server/epubXml.ts: no dependency, forgiving
// of a ragged document); the JSON one is JSON.
//
// THE ID. A feed item is keyed by (feed, guid) in the store, and a guid that
// changes between fetches is an item that comes back unread every hour. So:
// the feed's own id (`<guid>`, `<id>`, `id`) when it gives one, else the link,
// else a hash of the title and date — in that order, because that is the
// order of how stable they are in the wild.
//
// THE HTML PAGE. An owner pastes a blog's front page more often than its feed.
// `discoverFeeds` reads the page's `<link rel="alternate">` tags the way a
// browser's feed button does, and the poller follows the first one once.

import { createHash } from "node:crypto";
import { parseHtml, type ElementNode, type Node } from "../shared/htmlToMarkdown.ts";
import { childrenNamed, isElement, parseXml, type XmlElement, type XmlNode } from "./epubXml.ts";

export interface ParsedItem {
  guid: string;
  url: string | null;
  title: string;
  author: string | null;
  /** ms since the epoch, or null when undated. */
  published: number | null;
  /** The article as the feed carried it: HTML, possibly a teaser. */
  content: string | null;
  /** A summary, when the feed carried one apart from the content. */
  summary: string | null;
}

export interface ParsedFeed {
  kind: "rss" | "atom" | "json";
  title: string | null;
  site: string | null;
  items: ParsedItem[];
}

/** Items read from one document, at most. A feed that dumps its whole archive
 *  into one file is read from the top — the newest. */
export const ITEMS_PER_FEED = 100;

function hashId(...parts: Array<string | null>): string {
  return `h:${createHash("sha256").update(parts.map((p) => p ?? "").join("\u0000")).digest("hex").slice(0, 32)}`;
}

/** An address resolved against the feed's own, http(s) only. */
function resolve(value: string | null | undefined, base: string): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** A date in any of the shapes feeds write: RFC 822 (RSS), RFC 3339 (Atom,
 *  JSON Feed), and the variants of both that real generators emit. */
export function parseFeedDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = value.trim();
  if (text === "") return null;
  const ms = Date.parse(text);
  if (Number.isFinite(ms)) return ms;
  // "Tue, 10 Jun 2003 04:00:00 EST"-style zones Date.parse does not know,
  // and a day name in another language: drop the day, keep the rest.
  const rest = text.replace(/^[^,]*,\s*/, "").replace(/\s+[A-Z]{3,4}$/, " GMT");
  const retry = Date.parse(rest);
  return Number.isFinite(retry) ? retry : null;
}

/** Text of an element with whitespace kept (a `<pre>` in a feed's HTML is
 *  whitespace). */
function rawText(el: XmlElement | null | undefined): string {
  if (!el) return "";
  let out = "";
  const walk = (node: XmlElement): void => {
    for (const child of node.children) {
      if (isElement(child)) walk(child);
      else out += child.text;
    }
  };
  walk(el);
  return out;
}

function plain(el: XmlElement | null | undefined): string {
  return rawText(el).replace(/\s+/g, " ").trim();
}

function child(el: XmlElement, name: string, prefix?: string): XmlElement | null {
  for (const c of el.children) {
    if (!isElement(c) || c.name !== name) continue;
    if (prefix !== undefined && c.prefix !== prefix) continue;
    return c;
  }
  return null;
}

/** An Atom `type="xhtml"` content is markup, not text: printed back as HTML. */
function serialize(nodes: XmlNode[]): string {
  const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let out = "";
  for (const node of nodes) {
    if (!isElement(node)) {
      out += esc(node.text);
      continue;
    }
    const attrs = Object.entries(node.attrs)
      .filter(([k]) => !k.startsWith("xmlns"))
      .map(([k, v]) => ` ${k}="${esc(v).replace(/"/g, "&quot;")}"`)
      .join("");
    out += `<${node.name}${attrs}>${serialize(node.children)}</${node.name}>`;
  }
  return out;
}

/** Atom's text constructs: `text` is text, `html` is escaped HTML, `xhtml` is
 *  a div of markup. Returned as HTML. */
function atomHtml(el: XmlElement | null): string | null {
  if (!el) return null;
  const type = (el.attrs.type ?? "text").toLowerCase();
  if (type === "xhtml") {
    const div = el.children.find((c): c is XmlElement => isElement(c) && c.name === "div");
    return serialize(div ? div.children : el.children).trim() || null;
  }
  const text = rawText(el).trim();
  if (text === "") return null;
  if (type === "html" || type === "text/html") return text;
  return `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n{2,}/g, "</p><p>")}</p>`;
}

function readRss(root: XmlElement, base: string): ParsedFeed {
  // RSS 2.0 puts items in <channel>; RSS 1.0 (RDF) puts them beside it.
  const channel = child(root, "channel") ?? root;
  const itemEls = [...childrenNamed(channel, "item"), ...(channel === root ? [] : childrenNamed(root, "item"))];
  const items: ParsedItem[] = [];
  for (const el of itemEls.slice(0, ITEMS_PER_FEED)) {
    // `<link>` in RSS; an `<atom:link>` beside it is the feed's own self-link.
    const linkEl = el.children.find((c): c is XmlElement => isElement(c) && c.name === "link" && c.prefix === "");
    const url = resolve(plain(linkEl) || null, base);
    const guidEl = child(el, "guid");
    const guidText = plain(guidEl);
    const permalink = guidEl && (guidEl.attrs.ispermalink ?? "true").toLowerCase() !== "false" ? resolve(guidText, base) : null;
    const title = plain(child(el, "title"));
    const published = parseFeedDate(plain(child(el, "pubdate")) || plain(child(el, "date", "dc")) || null);
    const encoded = rawText(child(el, "encoded", "content")).trim() || null;
    const description = rawText(child(el, "description")).trim() || null;
    const author = plain(child(el, "creator", "dc")) || plain(child(el, "author")) || null;
    const link = url ?? permalink;
    items.push({
      guid: guidText || link || hashId(title, String(published), description),
      url: link,
      title: title || (description ? description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : "") || link || "",
      author,
      published,
      content: encoded ?? description,
      summary: encoded ? description : null,
    });
  }
  const siteLink = channel.children.find((c): c is XmlElement => isElement(c) && c.name === "link" && c.prefix === "");
  return { kind: "rss", title: plain(child(channel, "title")) || null, site: resolve(plain(siteLink) || null, base), items };
}

function atomLink(el: XmlElement, base: string, rel = "alternate"): string | null {
  for (const c of el.children) {
    if (!isElement(c) || c.name !== "link") continue;
    const r = (c.attrs.rel ?? "alternate").toLowerCase();
    if (r !== rel) continue;
    if (rel === "alternate" && c.attrs.type && !/html/i.test(c.attrs.type)) continue;
    const href = resolve(c.attrs.href, base);
    if (href) return href;
  }
  return null;
}

function readAtom(root: XmlElement, base: string): ParsedFeed {
  const items: ParsedItem[] = [];
  const feedBase = resolve(root.attrs["xml:base"], base) ?? base;
  for (const el of childrenNamed(root, "entry").slice(0, ITEMS_PER_FEED)) {
    const entryBase = resolve(el.attrs["xml:base"], feedBase) ?? feedBase;
    const url = atomLink(el, entryBase);
    const id = plain(child(el, "id"));
    const title = plain(child(el, "title"));
    const published = parseFeedDate(plain(child(el, "published")) || plain(child(el, "updated")) || null);
    const content = atomHtml(child(el, "content"));
    const summary = atomHtml(child(el, "summary"));
    const authorEl = child(el, "author") ?? child(root, "author");
    const author = authorEl ? plain(child(authorEl, "name")) || null : null;
    items.push({
      guid: id || url || hashId(title, String(published), summary),
      url,
      title: title || url || "",
      author,
      published,
      content: content ?? summary,
      summary: content ? summary : null,
    });
  }
  return { kind: "atom", title: plain(child(root, "title")) || null, site: atomLink(root, feedBase), items };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function readJson(doc: Record<string, unknown>, base: string): ParsedFeed {
  const list = Array.isArray(doc.items) ? doc.items : [];
  const items: ParsedItem[] = [];
  for (const raw of list.slice(0, ITEMS_PER_FEED)) {
    if (typeof raw !== "object" || raw === null) continue;
    const it = raw as Record<string, unknown>;
    const url = resolve(str(it.url) ?? str(it.external_url), base);
    const title = str(it.title)?.trim() ?? "";
    const html = str(it.content_html);
    const text = str(it.content_text);
    const summary = str(it.summary);
    const content = html ?? (text ? `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n{2,}/g, "</p><p>")}</p>` : null);
    const authors = Array.isArray(it.authors) ? it.authors : it.author ? [it.author] : [];
    const first = authors[0] as Record<string, unknown> | undefined;
    const published = parseFeedDate(str(it.date_published) ?? str(it.date_modified));
    const id = it.id === undefined || it.id === null ? null : String(it.id);
    items.push({
      guid: id ?? url ?? hashId(title, String(published), summary),
      url,
      title: title || (summary ?? "").slice(0, 80) || url || "",
      author: first && typeof first === "object" ? str(first.name) : null,
      published,
      content: content ?? (summary ? `<p>${summary.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>` : null),
      summary: content ? summary : null,
    });
  }
  return { kind: "json", title: str(doc.title), site: resolve(str(doc.home_page_url), base), items };
}

/** Read a fetched document as a feed, or null when it is not one (an HTML
 *  page is not a feed — `discoverFeeds` is what reads that). */
export function parseFeed(body: string, contentType: string, baseUrl: string): ParsedFeed | null {
  const text = body.replace(/^﻿/, "");
  const head = text.trimStart().slice(0, 1);
  if (/json/i.test(contentType) || head === "{") {
    try {
      const doc = JSON.parse(text) as unknown;
      if (typeof doc === "object" && doc !== null && typeof (doc as Record<string, unknown>).version === "string" && /jsonfeed\.org/.test(String((doc as Record<string, unknown>).version))) {
        return readJson(doc as Record<string, unknown>, baseUrl);
      }
    } catch {
      /* not JSON after all */
    }
    return null;
  }
  const root = parseXml(text);
  if (!root) return null;
  if (root.name === "rss" || root.name === "rdf") return readRss(root, baseUrl);
  if (root.name === "feed") return readAtom(root, baseUrl);
  return null;
}

const FEED_TYPES = /^application\/(rss\+xml|atom\+xml|feed\+json|json|xml)$|^text\/xml$/i;

/** The feed addresses an HTML page advertises, best first: its
 *  `<link rel="alternate" type="application/rss+xml|atom+xml|feed+json">`. */
export function discoverFeeds(html: string, pageUrl: string): string[] {
  const root = parseHtml(html);
  const out: string[] = [];
  const walk = (node: Node): void => {
    if (node.type !== "el") return;
    const el = node as ElementNode;
    if ((el.name === "link" || el.name === "a") && /\balternate\b/i.test(el.attrs.rel ?? "") && FEED_TYPES.test((el.attrs.type ?? "").trim())) {
      const href = resolve(el.attrs.href, pageUrl);
      if (href && !out.includes(href)) out.push(href);
    }
    for (const c of el.children) walk(c);
  };
  walk(root);
  return out;
}
