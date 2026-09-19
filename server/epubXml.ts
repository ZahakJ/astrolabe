// A SMALL XML READER, for the four documents an EPUB is made of.
//
// An EPUB is a zip of XML: `META-INF/container.xml` names the package
// document, the package document (`.opf`) names the metadata, the manifest
// and the spine, `nav.xhtml` or `toc.ncx` names the contents, and every
// chapter is XHTML. Four shapes, all of them well-formed XML by the
// specification, none of them large.
//
// WHY NOT A DEPENDENCY. `package.json` carries no XML parser and no zip
// library, and adding either for this would be adding a supply chain to a
// self-hosted reading room in order to read a file format that is a zip of
// XML. The zip half was already here (server/zip.ts, written for the Anki
// importer); this is the other half, and it is a hundred lines because the
// job is genuinely small: elements, attributes, text, comments, CDATA,
// processing instructions and a doctype to skip over.
//
// WHAT IT IS NOT: an HTML parser. It does not infer omitted end tags, it does
// not know that `<p>` closes `<p>`, and it does not build a table's implied
// sections. It does not have to — EPUB content is XHTML, which closes
// everything — but it is forgiving in the one way that matters for files made
// by real tools: an end tag with no open element is skipped rather than
// thrown at, and an open element still on the stack at the end of the document
// is closed. A book that a converter left slightly ragged is still a book, and
// refusing to open it would be refusing for a reason the reader cannot act on.
//
// THE OUTPUT IS DATA, NOT A DOM. No parent pointers, no live collections,
// nothing to mutate: the sanitizer (server/epub.ts) walks it once and builds a
// string. Attribute names are lower-cased and their namespace prefix is kept
// (`xml:lang`, `epub:type`), because the specification's own selectors use it.

export interface XmlElement {
  /** Lower-cased, prefix stripped (`dc:title` → `title`). */
  name: string;
  /** The prefix as written, lower-cased, or "" — `dc`, `epub`, `opf`. */
  prefix: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

export type XmlNode = XmlElement | { text: string };

export function isElement(node: XmlNode): node is XmlElement {
  return (node as XmlElement).name !== undefined;
}

/** The five XML entities plus the handful of HTML ones that turn up in books
 *  written by hand. Everything else numeric is decoded by code point; an
 *  entity this table does not know is left as it was written, which renders as
 *  itself rather than as nothing. */
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  laquo: "«",
  raquo: "»",
  shy: "­",
  zwnj: "‌",
  zwj: "‍",
};

export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text;
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      // A lone surrogate or an out-of-range code point is not a character;
      // `String.fromCodePoint` throws on it, and a chapter must not fail to
      // open because one entity in it is nonsense.
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
      return String.fromCodePoint(code);
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Elements whose content is text even when it looks like markup. XHTML says
 *  so for these two, and a `<style>` body full of `>` would otherwise be
 *  parsed as a tree of nothing. */
const RAW_TEXT = new Set(["script", "style"]);

/**
 * Parse an XML (or XHTML) document into one root element.
 *
 * Returns null when there is no element in it at all — an empty file, or a
 * file that is not markup. Never throws: every malformed shape has a defined
 * outcome above, because the input is a file somebody else's converter wrote.
 */
export function parseXml(source: string): XmlElement | null {
  const root: XmlElement = { name: "#document", prefix: "", attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  const top = (): XmlElement => stack[stack.length - 1];
  let at = 0;

  const pushText = (raw: string): void => {
    if (raw === "") return;
    top().children.push({ text: decodeEntities(raw) });
  };

  while (at < source.length) {
    const lt = source.indexOf("<", at);
    if (lt === -1) {
      pushText(source.slice(at));
      break;
    }
    pushText(source.slice(at, lt));

    if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt + 4);
      at = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", lt)) {
      const end = source.indexOf("]]>", lt + 9);
      const body = source.slice(lt + 9, end === -1 ? source.length : end);
      if (body !== "") top().children.push({ text: body });
      at = end === -1 ? source.length : end + 3;
      continue;
    }
    if (source.startsWith("<?", lt)) {
      const end = source.indexOf("?>", lt + 2);
      at = end === -1 ? source.length : end + 2;
      continue;
    }
    if (source.startsWith("<!", lt)) {
      // A doctype, possibly with an internal subset in square brackets.
      let i = lt + 2;
      let depth = 0;
      for (; i < source.length; i++) {
        const ch = source[i];
        if (ch === "[") depth += 1;
        else if (ch === "]") depth -= 1;
        else if (ch === ">" && depth <= 0) break;
      }
      at = Math.min(source.length, i + 1);
      continue;
    }
    if (source.startsWith("</", lt)) {
      const end = source.indexOf(">", lt + 2);
      const rawName = source.slice(lt + 2, end === -1 ? source.length : end).trim().toLowerCase();
      const name = rawName.includes(":") ? rawName.slice(rawName.indexOf(":") + 1) : rawName;
      // Close the nearest matching open element, skipping any that a ragged
      // document left unclosed. An end tag matching nothing is ignored.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
      at = end === -1 ? source.length : end + 1;
      continue;
    }

    const tag = readTag(source, lt);
    if (tag === null) {
      pushText("<");
      at = lt + 1;
      continue;
    }
    const element: XmlElement = { name: tag.name, prefix: tag.prefix, attrs: tag.attrs, children: [] };
    top().children.push(element);
    at = tag.end;
    if (tag.selfClosing) continue;
    if (RAW_TEXT.has(element.name)) {
      const close = source.toLowerCase().indexOf(`</${element.name}`, at);
      const body = source.slice(at, close === -1 ? source.length : close);
      if (body !== "") element.children.push({ text: body });
      if (close === -1) {
        at = source.length;
      } else {
        const gt = source.indexOf(">", close);
        at = gt === -1 ? source.length : gt + 1;
      }
      continue;
    }
    stack.push(element);
  }

  return root.children.find(isElement) ?? null;
}

interface Tag {
  name: string;
  prefix: string;
  attrs: Record<string, string>;
  selfClosing: boolean;
  /** Index just past the closing `>`. */
  end: number;
}

function readTag(source: string, lt: number): Tag | null {
  const nameMatch = /^<([A-Za-z_][\w.:-]*)/.exec(source.slice(lt, lt + 200));
  if (!nameMatch) return null;
  const raw = nameMatch[1].toLowerCase();
  const colon = raw.indexOf(":");
  const name = colon === -1 ? raw : raw.slice(colon + 1);
  const prefix = colon === -1 ? "" : raw.slice(0, colon);
  const attrs: Record<string, string> = {};
  let at = lt + nameMatch[0].length;
  let selfClosing = false;

  for (;;) {
    while (at < source.length && /\s/.test(source[at])) at += 1;
    if (at >= source.length) return { name, prefix, attrs, selfClosing, end: source.length };
    if (source[at] === ">") return { name, prefix, attrs, selfClosing, end: at + 1 };
    if (source[at] === "/" && source[at + 1] === ">") {
      selfClosing = true;
      return { name, prefix, attrs, selfClosing, end: at + 2 };
    }
    const attrMatch = /^([^\s=/>]+)\s*(=\s*)?/.exec(source.slice(at));
    if (!attrMatch) {
      at += 1;
      continue;
    }
    const attrName = attrMatch[1].toLowerCase();
    at += attrMatch[0].length;
    let value = "";
    if (attrMatch[2]) {
      const quote = source[at];
      if (quote === '"' || quote === "'") {
        const end = source.indexOf(quote, at + 1);
        value = source.slice(at + 1, end === -1 ? source.length : end);
        at = end === -1 ? source.length : end + 1;
      } else {
        const end = /[\s>]/.exec(source.slice(at));
        const stop = end ? at + end.index : source.length;
        value = source.slice(at, stop);
        at = stop;
      }
    }
    // An attribute written twice keeps the FIRST, which is what every XML
    // reader does and what a writer that emitted both meant by the first one.
    if (!(attrName in attrs)) attrs[attrName] = decodeEntities(value);
  }
}

// ── Walking ─────────────────────────────────────────────────────────────────

/** Every element under `node` with this local name, in document order. */
export function findAll(node: XmlElement, name: string): XmlElement[] {
  const out: XmlElement[] = [];
  const walk = (el: XmlElement): void => {
    for (const child of el.children) {
      if (!isElement(child)) continue;
      if (child.name === name) out.push(child);
      walk(child);
    }
  };
  walk(node);
  return out;
}

/** The first element under `node` with this local name, or null. */
export function find(node: XmlElement, name: string): XmlElement | null {
  if (node.name === name) return node;
  for (const child of node.children) {
    if (!isElement(child)) continue;
    const hit = find(child, name);
    if (hit) return hit;
  }
  return null;
}

/** The direct children of `node` with this local name. */
export function childrenNamed(node: XmlElement, name: string): XmlElement[] {
  return node.children.filter((c): c is XmlElement => isElement(c) && c.name === name);
}

/** All the text under an element, with whitespace collapsed — what a
 *  `<navLabel><text>` or a `<dc:title>` says. */
export function textOf(node: XmlElement): string {
  let out = "";
  const walk = (el: XmlElement): void => {
    for (const child of el.children) {
      if (isElement(child)) walk(child);
      else out += child.text;
    }
  };
  walk(node);
  return out.replace(/\s+/g, " ").trim();
}
