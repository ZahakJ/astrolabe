// HTML → MARKDOWN, conservatively, with no dependency.
//
// The web clipper (server/clip.ts) hands a page — or the fragment the reader
// selected — to this file and writes what comes back into the vault. The
// server has no build step and takes no new packages, so the converter is its
// own: a small tokenizer, a tree, and a renderer that knows the dozen tags a
// readable article is made of. Everything it does not know is treated as
// text in a box (a `<div>` is a paragraph break, a `<span>` is nothing), and
// everything that is not content — scripts, styles, forms, media players,
// the whole `<head>` — is dropped rather than guessed at.
//
// CONSERVATIVE is the design. A clip is the reader's copy of somebody else's
// page, filed as a note they will edit; a converter that reaches for every
// Markdown extension writes a note that is harder to edit than the prose was.
// So: headings, paragraphs, lists (nested), links, images by URL, block
// quotes, code (inline and fenced), bold, italic, rules, and the simplest
// tables. Nothing else earns a mark.

export interface ElementNode {
  type: "el";
  name: string;
  attrs: Record<string, string>;
  children: Node[];
}
export interface TextNode {
  type: "text";
  text: string;
}
export type Node = ElementNode | TextNode;

/** Content-free by construction: nothing under these is prose. `<head>` is
 *  here so a whole document renders as its body alone (the title is asked
 *  for separately by `htmlTitle`). */
const DROP = new Set([
  "script", "style", "noscript", "template", "svg", "math", "iframe", "object", "embed",
  "canvas", "video", "audio", "picture", "source", "track", "map", "head", "title", "meta",
  "link", "base", "button", "input", "select", "textarea", "option", "datalist", "dialog",
]);

/** The tags whose raw text runs to their closing tag with no markup inside:
 *  a `<` in a script is a `<`, not a tag. */
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);

/** How deep the tree may go. A real page is a few dozen elements deep; a
 *  crafted one can open fifty thousand `<div>`s and never close them, and
 *  every walker in this file recurses, so past this depth an open tag is
 *  still recorded as its parent's child but no longer pushed — its own
 *  children become its siblings. The words survive; the nesting, which
 *  nobody can read at that depth anyway, does not. */
const MAX_DEPTH = 256;

/** Elements that never take children. */
const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
  "track", "wbr",
]);

/** A block element ends the line before it and the line after it. */
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "details", "dd", "div", "dl", "dt", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr",
  "li", "main", "nav", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot",
  "th", "thead", "tr", "ul", "body", "html", "center",
]);

/** Which open tags an incoming tag implicitly closes — the handful of
 *  optional-end-tag rules real pages lean on. `<p>` after an unclosed `<p>`,
 *  `<li>` after `<li>`, a heading after an open `<p>`. */
const CLOSES: Record<string, Set<string>> = {
  p: new Set(["p"]),
  li: new Set(["li"]),
  dt: new Set(["dt", "dd"]),
  dd: new Set(["dt", "dd"]),
  tr: new Set(["tr", "td", "th"]),
  td: new Set(["td", "th"]),
  th: new Set(["td", "th"]),
  option: new Set(["option"]),
};
for (const tag of ["h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "pre", "blockquote", "div", "table", "hr"]) {
  CLOSES[tag] = new Set(["p"]);
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", ensp: "\u2002", emsp: "\u2003",
  thinsp: "\u2009", mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", copy: "\u00a9", reg: "\u00ae",
  trade: "\u2122", laquo: "\u00ab", raquo: "\u00bb", ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018",
  rsquo: "\u2019", sbquo: "\u201a", bdquo: "\u201e", times: "\u00d7", middot: "\u00b7", bull: "\u2022",
  deg: "\u00b0", euro: "\u20ac", pound: "\u00a3", yen: "\u00a5", cent: "\u00a2", sect: "\u00a7",
  para: "\u00b6", shy: "", zwj: "\u200d", zwnj: "\u200c", larr: "\u2190", rarr: "\u2192",
  uarr: "\u2191", darr: "\u2193", harr: "\u2194", iexcl: "\u00a1", iquest: "\u00bf",
};

/** `&amp;` → `&`, numeric forms included. Unknown names are left as typed:
 *  a reader can see `&foo;` and fix it, and they cannot see a swallowed one. */
export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

// ── The tokenizer and the tree ──────────────────────────────────────────────

const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of raw.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase();
    if (name in attrs) continue;
    attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attrs;
}

/** Parse `html` into a tree under one synthetic root. Tolerant the way a
 *  browser is: unclosed tags close at their parent's end, stray closing tags
 *  are ignored, and comments, doctypes and processing instructions vanish. */
export function parseHtml(html: string): ElementNode {
  const root: ElementNode = { type: "el", name: "#root", attrs: {}, children: [] };
  const stack: ElementNode[] = [root];
  const top = (): ElementNode => stack[stack.length - 1];
  const text = (t: string): void => {
    if (t.length === 0) return;
    top().children.push({ type: "text", text: t });
  };
  let i = 0;
  const n = html.length;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      text(html.slice(i));
      break;
    }
    if (lt > i) text(html.slice(i, lt));
    // Comments, doctype, CDATA: skip to their own terminator.
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt + 2);
      i = end === -1 ? n : end + 1;
      continue;
    }
    const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>`]+))?)*)\s*(\/?)>/.exec(html.slice(lt, lt + 4096));
    if (!tag) {
      // A lone `<` in prose ("a < b"): text, not a tag.
      text("<");
      i = lt + 1;
      continue;
    }
    const closing = tag[1] === "/";
    const name = tag[2].toLowerCase();
    const selfClosed = tag[4] === "/";
    i = lt + tag[0].length;
    if (closing) {
      // Pop to the matching open element, if one is open; else ignore.
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      continue;
    }
    // Optional end tags: `<p>` closes an open `<p>`, `<li>` an open `<li>`.
    const closes = CLOSES[name];
    if (closes) {
      // Pop to the OUTERMOST of a run of closable elements: a `<tr>` after an
      // unclosed `<td>` closes the cell AND the row above it, else the new
      // row nests inside the old one and the table walker never sees it.
      let found = -1;
      for (let k = stack.length - 1; k > 0; k--) {
        if (closes.has(stack[k].name)) {
          found = k;
          continue;
        }
        // Only look through inline wrappers: a `<p>` inside a `<blockquote>`
        // inside a `<p>` is the browser's problem, not this one's.
        if (BLOCK.has(stack[k].name)) break;
      }
      if (found !== -1) stack.length = found;
    }
    const el: ElementNode = { type: "el", name, attrs: parseAttrs(tag[3] ?? ""), children: [] };
    top().children.push(el);
    if (RAW_TEXT.has(name)) {
      // Raw text runs to the closing tag, whatever it contains.
      const close = new RegExp(`</${name}\\s*>`, "i");
      const rest = html.slice(i);
      const m = close.exec(rest);
      const rawEnd = m ? m.index : rest.length;
      el.children.push({ type: "text", text: rest.slice(0, rawEnd) });
      i += m ? rawEnd + m[0].length : rawEnd;
      continue;
    }
    if (VOID.has(name) || selfClosed || stack.length >= MAX_DEPTH) continue;
    stack.push(el);
  }
  return root;
}

// ── Asking the document questions ───────────────────────────────────────────

function findFirst(node: Node, name: string): ElementNode | null {
  if (node.type !== "el") return null;
  if (node.name === name) return node;
  for (const child of node.children) {
    const hit = findFirst(child, name);
    if (hit) return hit;
  }
  return null;
}

function textOf(node: Node): string {
  if (node.type === "text") return node.text;
  return node.children.map(textOf).join("");
}

/** The document's `<title>`, decoded and collapsed, or null. */
export function htmlTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
  if (!m) return null;
  const title = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
  return title === "" ? null : title;
}

/** The `<base href>` of a document, when it declares one. */
function baseHref(root: ElementNode): string | null {
  const base = findFirst(root, "base");
  return base?.attrs.href ?? null;
}

// ── Rendering ───────────────────────────────────────────────────────────────

interface RenderContext {
  base: string | null;
  /** Inside `<pre>`: whitespace is the content. */
  pre: boolean;
}

/** `href` made absolute against the page it came from. Anything that is not
 *  http(s) after resolution — `javascript:`, `data:` — is dropped: the clip is
 *  a note, and a note's link must be somewhere a reader can go. */
function absolute(href: string, base: string | null): string | null {
  const trimmed = href.trim();
  if (trimmed === "") return null;
  try {
    const url = base ? new URL(trimmed, base) : new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Markdown's own marks, escaped in prose so a page that says `2 * 3` or
 *  `[citation]` does not become italic or a link. Conservative on purpose:
 *  underscores inside a word are left alone (CommonMark does not open
 *  emphasis there, and `snake_case` names are common in the pages worth
 *  clipping). */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([*`[\]<])/g, "\\$1")
    .replace(/(^|\s)_/g, "$1\\_")
    .replace(/_(?=\s|$)/g, "\\_");
}

/** A paragraph's lines, with the marks that only bite at a line's START
 *  escaped there and nowhere else: a sentence beginning `> ` would quote, one
 *  beginning `# ` would head, one beginning `1. ` would number. Mid-line
 *  they are just characters, and a `\>` in the middle of prose is noise. */
function paragraph(text: string): string {
  return tidy(text)
    .split("\n")
    .map((line) =>
      line
        .replace(/^(\s*)(#{1,6}(?=\s|$)|>|[-+](?=\s))/, "$1\\$2")
        .replace(/^(\s*\d{1,9})([.)](?=\s))/, "$1\\$2"),
    )
    .join("\n");
}

/** An inline run made presentable: doubled spaces from adjacent inline
 *  elements become one, and the only newlines — the ones `<br>` made — keep
 *  their two-space hard break and lose any other trailing space. */
function tidy(text: string): string {
  return text
    .replace(/ {2,}(?!\n)/g, " ")
    .replace(/[ \t]+\n/g, "  \n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

/** Whitespace in HTML prose is a single space, however it was typed. */
function collapse(text: string): string {
  return text.replace(/[ \t\r\n\f]+/g, " ");
}

/** Render `node`'s children as ONE inline run: no block breaks, every
 *  newline a space. Headings, list items and table cells read this. */
function inline(nodes: Node[], ctx: RenderContext): string {
  let out = "";
  for (const node of nodes) out += inlineNode(node, ctx);
  return out;
}

function inlineNode(node: Node, ctx: RenderContext): string {
  if (node.type === "text") {
    const decoded = decodeEntities(node.text);
    return ctx.pre ? decoded : escapeText(collapse(decoded));
  }
  const { name, attrs } = node;
  if (DROP.has(name)) return "";
  switch (name) {
    case "br":
      return ctx.pre ? "\n" : "  \n";
    case "img": {
      const src = attrs.src ? absolute(attrs.src, ctx.base) : null;
      if (!src) return "";
      const alt = collapse(decodeEntities(attrs.alt ?? "")).trim().replace(/[[\]]/g, "");
      return `![${alt}](${src})`;
    }
    case "a": {
      const text = inline(node.children, ctx).trim();
      const href = attrs.href ? absolute(attrs.href, ctx.base) : null;
      if (!href) return text;
      // An anchor with no words (an icon, an image) still deserves its
      // destination; an image inside a link is the picture linking out.
      const label = text === "" ? href : text;
      return `[${label}](${href.replace(/[()]/g, encodeURIComponent)})`;
    }
    case "strong":
    case "b": {
      const text = inline(node.children, ctx);
      return wrap(text, "**");
    }
    case "em":
    case "i":
    case "cite":
    case "var":
    case "dfn": {
      const text = inline(node.children, ctx);
      return wrap(text, "*");
    }
    case "code":
    case "kbd":
    case "samp":
    case "tt": {
      if (ctx.pre) return inline(node.children, ctx);
      const raw = collapse(decodeEntities(textOf(node))).trim();
      if (raw === "") return "";
      // A backtick inside the code needs a longer fence around it.
      const longest = Math.max(0, ...[...raw.matchAll(/`+/g)].map((m) => m[0].length));
      const fence = "`".repeat(longest + 1);
      const pad = longest > 0 || raw.startsWith("`") || raw.endsWith("`") ? " " : "";
      return `${fence}${pad}${raw}${pad}${fence}`;
    }
    case "s":
    case "del":
    case "strike": {
      const text = inline(node.children, ctx);
      return wrap(text, "~~");
    }
    case "wbr":
      return "";
    default:
      // Every other inline element — span, u, mark, sub, sup, abbr, time,
      // label, small, q, font — is its text. A block element met inline
      // (a div inside a heading) is its text too, with the boundary a space.
      return BLOCK.has(name) ? ` ${inline(node.children, ctx).trim()} ` : inline(node.children, ctx);
  }
}

/** `**text**` with the spaces the page put around the words kept OUTSIDE the
 *  marks: `<b> bold </b>` is ` **bold** `, because `** bold **` is not bold. */
function wrap(text: string, mark: string): string {
  const lead = /^\s*/.exec(text)?.[0] ?? "";
  const trail = /\s*$/.exec(text)?.[0] ?? "";
  const core = text.slice(lead.length, text.length - trail.length);
  if (core === "") return text;
  return `${lead}${mark}${core}${mark}${trail}`;
}

/** Render `nodes` as a sequence of BLOCKS, each a string with no leading or
 *  trailing blank line; the caller joins them with blank lines. Inline runs
 *  between blocks are gathered into implicit paragraphs, which is how a
 *  `<div>text<p>more</p></div>` and a bare `<body>` full of text both render. */
function blocks(nodes: Node[], ctx: RenderContext): string[] {
  const out: string[] = [];
  let run: Node[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    const text = paragraph(inline(run, ctx));
    run = [];
    if (text !== "") out.push(text);
  };
  for (const node of nodes) {
    if (node.type === "text" || !BLOCK.has(node.name) || DROP.has(node.name)) {
      if (node.type === "el" && DROP.has(node.name)) continue;
      run.push(node);
      continue;
    }
    flush();
    out.push(...blockNode(node, ctx));
  }
  flush();
  return out;
}

function blockNode(node: ElementNode, ctx: RenderContext): string[] {
  const { name } = node;
  switch (name) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const text = inline(node.children, ctx).replace(/\s*\n\s*/g, " ").trim();
      if (text === "") return [];
      return [`${"#".repeat(Number(name[1]))} ${text}`];
    }
    case "p": {
      const text = paragraph(inline(node.children, ctx));
      return text === "" ? [] : [text];
    }
    case "hr":
      return ["---"];
    case "blockquote": {
      const inner = blocks(node.children, ctx).join("\n\n");
      if (inner === "") return [];
      return [inner.split("\n").map((line) => (line === "" ? ">" : `> ${line}`)).join("\n")];
    }
    case "pre":
      return [fenced(node, ctx)];
    case "ul":
    case "ol":
      return [list(node, ctx, 0)];
    case "li":
      // A stray <li> outside a list: render it as a one-item list.
      return [list({ type: "el", name: "ul", attrs: {}, children: [node] }, ctx, 0)];
    case "table":
      return table(node, ctx);
    case "dt": {
      const text = inline(node.children, ctx).trim();
      return text === "" ? [] : [`**${text}**`];
    }
    case "dd": {
      const inner = blocks(node.children, ctx).join("\n\n");
      return inner === "" ? [] : [inner.split("\n").map((l) => (l === "" ? "" : `    ${l}`)).join("\n")];
    }
    case "figure": {
      // The picture, then its caption in italics beneath — the Markdown
      // shape of a figure a reader would draw by hand.
      const caption = findFirst(node, "figcaption");
      const rest = blocks(node.children.filter((c) => c !== caption), ctx);
      if (caption) {
        const text = inline(caption.children, ctx).trim();
        if (text !== "") rest.push(`*${text}*`);
      }
      return rest;
    }
    case "figcaption": {
      const text = inline(node.children, ctx).trim();
      return text === "" ? [] : [`*${text}*`];
    }
    default:
      // div, section, article, main, header, footer, aside, nav, details,
      // summary, form, fieldset, address, center, body, html, tr/td met
      // outside a table: a box of blocks.
      return blocks(node.children, ctx);
  }
}

/** A `<pre>` as a fenced block. The language comes from the conventional
 *  `language-x` / `lang-x` class on the `<pre>` or its `<code>`. */
function fenced(node: ElementNode, ctx: RenderContext): string {
  const code = findFirst(node, "code");
  const classes = `${node.attrs.class ?? ""} ${code?.attrs.class ?? ""}`;
  const lang = /(?:^|\s)(?:language|lang)-([\w+#.-]+)/.exec(classes)?.[1] ?? "";
  const raw = inline(node.children, { ...ctx, pre: true }).replace(/^\n+|\n+$/g, "");
  const longest = Math.max(2, ...[...raw.matchAll(/`{3,}/g)].map((m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}${lang}\n${raw}\n${fence}`;
}

/** A list at `depth`: `- ` or `1. ` items, nested lists indented under the
 *  item they belong to. Loose items (paragraphs inside) keep their blank
 *  lines; tight ones do not. */
function list(node: ElementNode, ctx: RenderContext, depth: number): string {
  const ordered = node.name === "ol";
  const start = Number.parseInt(node.attrs.start ?? "1", 10);
  let index = Number.isFinite(start) ? start : 1;
  const lines: string[] = [];
  const indent = "  ".repeat(depth);
  for (const child of node.children) {
    if (child.type !== "el") continue;
    if (child.name !== "li") {
      // A list nested directly in a list (no <li>): indent it under the last item.
      if (child.name === "ul" || child.name === "ol") lines.push(list(child, ctx, depth + 1));
      continue;
    }
    const marker = ordered ? `${index++}.` : "-";
    const nested: ElementNode[] = [];
    const own: Node[] = [];
    for (const c of child.children) {
      if (c.type === "el" && (c.name === "ul" || c.name === "ol")) nested.push(c);
      else own.push(c);
    }
    const body = blocks(own, ctx).join("\n\n");
    const hang = " ".repeat(marker.length + 1);
    const first = body.split("\n");
    const head = `${indent}${marker} ${first[0] ?? ""}`.replace(/\s+$/, "");
    const tail = first.slice(1).map((l) => (l === "" ? "" : `${indent}${hang}${l}`));
    lines.push([head, ...tail].join("\n"));
    for (const sub of nested) lines.push(list(sub, ctx, depth + 1));
  }
  return lines.join("\n");
}

/** The simplest table: every row's cells on one line, `|`-separated, a header
 *  rule after the first row. A table with rowspans or nested tables is beyond
 *  a conservative converter, and is rendered row by row all the same — the
 *  words survive, the geometry does not. */
function table(node: ElementNode, ctx: RenderContext): string[] {
  const rows: string[][] = [];
  const walk = (n: Node): void => {
    if (n.type !== "el") return;
    if (n.name === "tr") {
      const cells: string[] = [];
      for (const c of n.children) {
        if (c.type === "el" && (c.name === "td" || c.name === "th")) {
          cells.push(inline(c.children, ctx).replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|").trim());
        }
      }
      rows.push(cells);
      return;
    }
    for (const c of n.children) walk(c);
  };
  walk(node);
  const kept = rows.filter((r) => r.length > 0);
  if (kept.length === 0) return [];
  const width = Math.max(...kept.map((r) => r.length));
  const line = (cells: string[]): string =>
    `| ${[...cells, ...Array<string>(width - cells.length).fill("")].join(" | ")} |`;
  const out = [line(kept[0]), `| ${Array<string>(width).fill("---").join(" | ")} |`];
  for (const row of kept.slice(1)) out.push(line(row));
  return [out.join("\n")];
}

export interface HtmlToMarkdownOptions {
  /** The page's own address: relative links and image sources are resolved
   *  against it (a `<base href>` in the document wins over it). */
  baseUrl?: string | null;
}

/** The main body of a whole document, when it names one: `<article>`, then
 *  `<main>`, then `<body>`; a fragment (no body) is itself. The clipper
 *  reads this so a page's navigation, sidebars and footer stay on the page. */
export function contentRoot(root: ElementNode): ElementNode {
  const body = findFirst(root, "body");
  if (!body) return root;
  return findFirst(body, "article") ?? findFirst(body, "main") ?? body;
}

/** `html` as Markdown. A whole document is reduced to its content root; a
 *  fragment renders as it is. Never throws: the worst input is prose with
 *  no marks in it. */
export function htmlToMarkdown(html: string, opts: HtmlToMarkdownOptions = {}): string {
  const root = parseHtml(html);
  const ctx: RenderContext = { base: baseHref(root) ?? opts.baseUrl ?? null, pre: false };
  const body = contentRoot(root);
  // Trailing whitespace is trimmed at the DOCUMENT's end only: inside it a
  // line ending in two spaces is a hard break the converter meant.
  return blocks(body.children, ctx)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "");
}
