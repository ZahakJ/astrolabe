// THE PUBLISHER'S STYLESHEET, MADE SAFE AND MADE LOCAL.
//
// An EPUB carries its own CSS, and a reader that ignores it loses the book's
// verse indents, its drop caps, its poetry line breaks and its tables. A
// reader that applies it naively loses everything else: the publisher's
// `body { background: #fff; color: #000 }` paints white paper in the middle of
// a dark theme, their `p { font-family: "Minion Pro" }` un-does the whole
// reason this feature was asked for, and their `#header { position: fixed }`
// pins a chapter heading over the app's own chrome. Both halves of this file
// exist so that neither happens.
//
// TWO FUNCTIONS, TWO SIDES OF THE WIRE.
//
//   · `sanitizeEpubCss` runs on the SERVER, on the way out of the zip: it
//     removes the at-rules that fetch things, rewrites `url()` onto the item
//     route, and drops the declarations that fight the reading room.
//   · `scopeEpubCss` runs in the CLIENT, on the way into the document: it
//     prefixes every selector with the reader's root, so nothing the
//     publisher wrote can select anything outside the book.
//
// WHY PREFIXING AND NOT A SHADOW ROOT — the decision, recorded here because it
// is the one somebody will want to revisit. A shadow root would scope the CSS
// for free, and it would cost four things this reader needs: the app's theme
// tokens stop inheriting (they would have to be re-piped through every
// boundary, and `--font-serif` is the whole point), a Selection cannot be read
// across the boundary in the ordinary way (and "Copy citation" is a selection),
// `dir` inheritance from the reader's root stops (an RTL book is the case this
// was built for), and the browser's own find-in-page does not see into it. The
// prefix does none of that, it is a pure function of a string, and a pure
// function of a string can be tested — which is why tests/epub.test.ts can
// assert the property directly instead of a browser having to.
//
// Neither half is a CSS parser in the grammar's sense. It is a block walker:
// balanced braces, quotes and comments honoured, everything else left exactly
// as the publisher wrote it. That is the right altitude — the aim is to bound
// what a stylesheet can REACH, not to re-implement the cascade.

/** Declarations dropped wherever they appear, and why each one:
 *
 *  · `font-family` — the ask. Arabic in a browser is shaped by the browser,
 *    and this product ships Noto Naskh Arabic for exactly that; a publisher's
 *    embedded face is what the owner was escaping when they asked for EPUB.
 *  · `color`, `background*` — the theme. A book that sets ink and paper is a
 *    book that is unreadable in half the rooms in tokens.css, and "the text
 *    went invisible when I switched theme" is not a bug anyone can diagnose.
 *  · `position`, `z-index`, and the physical offsets that only mean anything
 *    with `position` — a chapter must not paint over the app.
 *  · `float` is NOT here: a figure floated beside its paragraph is the
 *    publisher's typography working correctly, and it cannot escape the
 *    column.
 */
const DROPPED_PROPERTIES =
  /^(font|font-family|color|background|background-color|background-image|background-repeat|background-position|background-attachment|position|z-index|top|bottom|left|right|inset|inset-block|inset-inline|cursor|pointer-events|behavior|-ms-behavior|-webkit-text-fill-color)$/;

/** At-rules whose whole block is dropped. `@import` fetches a stylesheet we
 *  have not sanitized (and, from the publisher's own relative URL, one we
 *  would have to resolve inside the zip); `@font-face` is pointless once
 *  `font-family` is gone, and it is the one at-rule that fetches bytes. */
const DROPPED_AT_RULES = /^@(import|font-face|namespace|charset|page)\b/i;

/** At-rules that WRAP other rules, and are therefore walked into rather than
 *  kept verbatim: their contents need the same treatment. */
const NESTING_AT_RULES = /^@(media|supports|layer|container)\b/i;

/** Selectors a publisher writes for the document root. Inside a scoped
 *  reader these mean "the chapter", so they become the prefix itself rather
 *  than a descendant of it — otherwise `body { text-align: justify }` would
 *  select nothing and the book would lose its justification. */
const ROOT_SELECTORS = /^(html|body|:root|html\s*>\s*body|html\s+body)$/i;

interface Block {
  /** The text before the `{` — a selector list, or an at-rule's prelude. */
  prelude: string;
  /** The text between the braces, or null for a statement like `@charset "x";`. */
  body: string | null;
}

/** Split a stylesheet into top-level blocks and statements, honouring
 *  strings, comments and nested braces. Anything that is not either is
 *  discarded — a stray `}` is not a rule. */
function blocksOf(css: string): Block[] {
  const out: Block[] = [];
  let prelude = "";
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = endOfString(css, i);
      prelude += css.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "{") {
      const end = endOfBlock(css, i);
      out.push({ prelude: prelude.trim(), body: css.slice(i + 1, end - 1) });
      prelude = "";
      i = end;
      continue;
    }
    if (ch === ";") {
      if (prelude.trim() !== "") out.push({ prelude: prelude.trim(), body: null });
      prelude = "";
      i += 1;
      continue;
    }
    if (ch === "}") {
      prelude = "";
      i += 1;
      continue;
    }
    prelude += ch;
    i += 1;
  }
  if (prelude.trim() !== "") out.push({ prelude: prelude.trim(), body: null });
  return out;
}

/** Index just past the closing quote of the string starting at `at`. */
function endOfString(css: string, at: number): number {
  const quote = css[at];
  let i = at + 1;
  while (i < css.length) {
    if (css[i] === "\\") i += 2;
    else if (css[i] === quote) return i + 1;
    else i += 1;
  }
  return css.length;
}

/** Index just past the `}` that closes the `{` at `at`. */
function endOfBlock(css: string, at: number): number {
  let depth = 0;
  let i = at;
  while (i < css.length) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = endOfString(css, i);
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return css.length;
}

/** Split a selector list (or any comma list) at TOP level — a comma inside
 *  `:is(a, b)` or inside a string does not separate two selectors. */
function splitTopLevel(text: string, separator: string): string[] {
  const out: string[] = [];
  let current = "";
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const end = endOfString(text, i);
      current += text.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    if (ch === separator && depth <= 0) {
      out.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  out.push(current);
  return out;
}

// ── The server's half ───────────────────────────────────────────────────────

/**
 * A publisher's stylesheet with everything it could reach out of removed.
 *
 * `resolve` turns a URL written inside the book (relative to `base`, the
 * stylesheet's own href in the archive) into a URL this server will serve, or
 * null for one it will not — an absolute `http:` URL, a `javascript:` URL, or
 * a path that climbs out of the archive. A declaration whose only value was a
 * URL we refused is dropped whole, because `list-style-image: ` is not CSS.
 */
export function sanitizeEpubCss(css: string, base: string, resolve: (href: string, base: string) => string | null): string {
  const out: string[] = [];
  for (const block of blocksOf(css)) {
    if (DROPPED_AT_RULES.test(block.prelude)) continue;
    if (block.body === null) {
      // A statement at-rule that is not dropped above (there are none today)
      // and a stray declaration outside any rule: neither is a rule, both go.
      continue;
    }
    if (NESTING_AT_RULES.test(block.prelude)) {
      const inner = sanitizeEpubCss(block.body, base, resolve);
      if (inner.trim() !== "") out.push(`${block.prelude} {\n${inner}\n}`);
      continue;
    }
    if (block.prelude.startsWith("@")) {
      // `@keyframes` and friends: the body is a set of blocks whose preludes
      // are percentages, not selectors. Declarations still get filtered.
      const inner = blocksOf(block.body)
        .filter((b) => b.body !== null)
        .map((b) => `${b.prelude} { ${declarations(b.body as string, base, resolve)} }`)
        .join("\n");
      if (inner.trim() !== "") out.push(`${block.prelude} {\n${inner}\n}`);
      continue;
    }
    const decls = declarations(block.body, base, resolve);
    if (decls.trim() === "") continue;
    out.push(`${block.prelude} { ${decls} }`);
  }
  return out.join("\n");
}

function declarations(body: string, base: string, resolve: (href: string, base: string) => string | null): string {
  const kept: string[] = [];
  for (const raw of splitTopLevel(body, ";")) {
    const decl = raw.trim();
    if (decl === "") continue;
    const colon = decl.indexOf(":");
    if (colon <= 0) continue;
    const property = decl.slice(0, colon).trim().toLowerCase();
    if (property === "" || property.startsWith("--")) continue; // custom properties are the app's language, not the book's
    if (DROPPED_PROPERTIES.test(property)) continue;
    const value = decl.slice(colon + 1).trim();
    // `expression()` is IE's script-in-CSS and `javascript:` is a URL scheme
    // that runs; neither has any business in a book, and both are one test.
    if (/expression\s*\(|javascript\s*:|behavior\s*:|@import/i.test(value)) continue;
    const rewritten = rewriteUrls(value, base, resolve);
    if (rewritten === null) continue;
    kept.push(`${property}: ${rewritten}`);
  }
  return kept.join("; ");
}

/** Every `url(...)` in a value put through `resolve`. Null when one of them
 *  was refused — the declaration goes rather than being served broken. */
function rewriteUrls(value: string, base: string, resolve: (href: string, base: string) => string | null): string | null {
  if (!/url\s*\(/i.test(value)) return value;
  let refused = false;
  const out = value.replace(/url\s*\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi, (_whole, dq, sq, bare) => {
    const href = (dq ?? sq ?? bare ?? "").trim();
    // A data: URL is already inline and reaches nothing; images are the only
    // thing a book uses one for, and refusing them would break drop caps.
    if (/^data:image\//i.test(href)) return `url("${href}")`;
    const url = resolve(href, base);
    if (url === null) {
      refused = true;
      return "";
    }
    return `url("${url}")`;
  });
  return refused ? null : out;
}

// ── The client's half ───────────────────────────────────────────────────────

/**
 * Every selector in a sanitized stylesheet prefixed with `prefix`, so the
 * whole sheet can only ever select inside the reader.
 *
 * `html`, `body` and `:root` become the prefix itself: inside a scoped reader
 * those three mean "the chapter", and leaving them as descendants would lose
 * every page-level rule a publisher wrote (justification, hyphenation, the
 * measure). A selector this cannot make sense of is dropped rather than
 * emitted unprefixed — an unscoped selector is exactly the failure this
 * function exists to prevent, and a book losing one rule is a smaller loss
 * than the app losing its own stylesheet.
 */
export function scopeEpubCss(css: string, prefix: string): string {
  const out: string[] = [];
  for (const block of blocksOf(css)) {
    if (block.body === null) continue;
    if (NESTING_AT_RULES.test(block.prelude)) {
      const inner = scopeEpubCss(block.body, prefix);
      if (inner.trim() !== "") out.push(`${block.prelude} {\n${inner}\n}`);
      continue;
    }
    if (block.prelude.startsWith("@")) {
      // `@keyframes`: its inner preludes are stops, not selectors.
      out.push(`${block.prelude} {${block.body}}`);
      continue;
    }
    const selectors = splitTopLevel(block.prelude, ",")
      .map((s) => scopeSelector(s.trim(), prefix))
      .filter((s): s is string => s !== null);
    if (selectors.length === 0) continue;
    out.push(`${selectors.join(", ")} {${block.body}}`);
  }
  return out.join("\n");
}

function scopeSelector(selector: string, prefix: string): string | null {
  if (selector === "") return null;
  // A selector that already reaches outside the reader is not made safe by a
  // prefix — `:root` handled above is the whole of what we translate.
  if (ROOT_SELECTORS.test(selector)) return prefix;
  if (/^(html|body)\b/i.test(selector)) {
    // `body p`, `body > div`, `body::before` — the root part becomes the
    // prefix and whatever hangs off it hangs off the chapter box instead.
    return `${prefix}${selector.replace(/^(html|body)/i, "")}`;
  }
  // EVERYTHING ELSE IS A DESCENDANT, including a selector that starts with a
  // colon. `:is(h1, h2)`, `:first-child` and `::selection` all mean "some
  // element in the document", and gluing them to the prefix would mean "the
  // chapter box itself, if it happens to be one" — which is almost never what
  // the publisher wrote and silently loses the rule.
  return `${prefix} ${selector}`;
}
