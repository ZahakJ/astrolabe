// THE JSX COPY SCAN, ON THE SYNTAX TREE — check-i18n's "bare English" half.
//
// The scan this replaced read .tsx files a LINE at a time with two regexes
// (`>text<` and `title="…"`) and a two-word floor, and so it could not see:
//   · a single word ("Save", "Close") — the floor was there because the regex
//     could not tell a word of copy from an option value or a class name;
//   · an attribute EXPRESSION (`title={open ? "Hide" : "Show"}`) or a template
//     literal (`aria-label={`Open ${name}`}`);
//   · JSX text split across lines (`<p>\n  Nothing here\n</p>`), because no
//     line held both brackets;
//   · `aria-description`, `aria-valuetext` and the other copy-bearing
//     attributes it did not list;
//   · a string child in braces (`{"Loading…"}`).
// The TypeScript parser sees all of them for what they are. What counts as a
// finding is a string in a VALUE position — JSX text, a copy attribute's
// value, a braced child — followed through conditionals, `||` / `??` and
// parentheses, and nowhere else: an argument to t() (or to any call), a
// comparison operand and an object key are not copy.
//
// scripts/check-i18n.mjs runs this over client/ and electron/;
// tests/i18nScan.test.ts proves it on a fixture the old scan passed.

import ts from "typescript";

/** Attributes whose value a reader sees or hears. */
export const COPY_ATTRS = new Set([
  "placeholder",
  "title",
  "alt",
  "label",
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "aria-roledescription",
  "aria-placeholder",
]);

/** Words that are the same in every language this product speaks: names of
 *  things, formats and keys. A literal made of nothing else is not copy. */
export const PROPER = new Set([
  "Astrolabe", "GitHub", "Git", "Ollama", "Anthropic", "Claude", "Obsidian", "Anki", "Notion", "Evernote",
  "LaTeX", "TeX", "KaTeX", "Markdown", "PDF", "EPUB", "RSS", "SVG", "PNG", "JPEG", "CSV", "JSON", "HTML", "CSS", "URL", "API",
  "Whisper", "Excalidraw", "Mermaid", "Zotero", "BibTeX", "Hijri", "SM", "OK", "vs", "EN", "AR",
  "px", "em", "rem", "ms", "KB", "MB", "GB", "kB",
  "Ctrl", "Cmd", "Alt", "Shift", "Esc", "Enter", "Tab", "Space", "Backspace", "Delete", "Home", "End", "PgUp", "PgDn", "Up", "Down", "Left", "Right",
]);

/** The words in a piece of text that would need translating. */
export function copyWords(text) {
  return (
    text
      .replace(/\$\{[^}]*\}/g, " ") // a template's holes
      .replace(/\b[\w-]+[./:@][\w./:@-]+\b/g, " ") // settings.json, ar-u-nu-latn, /favicon.ico, user@host
      .match(/[A-Za-z]{2,}/g) ?? []
  ).filter((w) => !PROPER.has(w));
}

const CODEISH = /[={}<>]|&&|\|\||=>|\(\)|^[a-z]+[A-Z]\w*$|^[a-z0-9-]+$|^[a-z]+:\/\/\S*$/;

/** A literal the author has marked, on its line or in the three above it,
 *  with the words "not copy" — a honeypot field only bots read, a folder's
 *  literal default name. The exception is spelled out where it is used. */
const NOT_COPY = /not copy/i;

/** Is this literal's text copy? */
function isCopy(text) {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  // A lowercase token with no space (`dashboard`, `note-row`, `is-open`) is an
  // identifier — an option value, a class, a key — not a sentence. A single
  // CAPITALISED word ("Save") is copy.
  if (CODEISH.test(t)) return false;
  return copyWords(t).length > 0;
}

/** Every literal in a value position under `expr`: through `a ? b : c`,
 *  `a || b`, `a ?? b`, parentheses and `as`; never into a call, a comparison
 *  or an index. */
function valueLiterals(expr, out = []) {
  if (!expr) return out;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) out.push({ node: expr, text: expr.text });
  else if (ts.isTemplateExpression(expr)) {
    // A hole is "…": its braces must not read as code to the copy test.
    out.push({ node: expr, text: [expr.head.text, ...expr.templateSpans.map((s) => "…" + s.literal.text)].join("") });
  } else if (ts.isConditionalExpression(expr)) {
    valueLiterals(expr.whenTrue, out);
    valueLiterals(expr.whenFalse, out);
  } else if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      valueLiterals(expr.left, out);
      valueLiterals(expr.right, out);
    } else if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
      valueLiterals(expr.right, out);
    }
  } else if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression?.(expr)) {
    valueLiterals(expr.expression, out);
  }
  return out;
}

/** Findings for one .tsx source: `{ line, kind, text }`. */
export function scanTsx(source, fileName = "x.tsx") {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const lines = source.split("\n");
  const marked = (line) => lines.slice(Math.max(0, line - 4), line).some((l) => NOT_COPY.test(l));
  const insideKbd = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isJsxElement(p)) {
        const tag = p.openingElement.tagName.getText(sf);
        if (tag === "kbd" || tag === "code" || tag === "pre" || tag === "style" || tag === "script") return true;
      }
    }
    return false;
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, " ").trim();
      if (text && !insideKbd(node) && isCopy(text)) found.push({ line: lineOf(node), kind: "text", text });
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf);
      if (COPY_ATTRS.has(name) && node.initializer) {
        const init = node.initializer;
        const lits = ts.isStringLiteral(init) ? [{ node: init, text: init.text }] : ts.isJsxExpression(init) ? valueLiterals(init.expression) : [];
        for (const lit of lits) if (isCopy(lit.text)) found.push({ line: lineOf(lit.node), kind: name, text: lit.text.trim() });
      }
      // Fall through: JSX nested in an attribute (`icon={<b>…</b>}`) is read too.
    } else if (ts.isJsxExpression(node) && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      if (!insideKbd(node)) {
        for (const lit of valueLiterals(node.expression)) if (isCopy(lit.text)) found.push({ line: lineOf(lit.node), kind: "child", text: lit.text.trim() });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found.filter((f) => !marked(f.line));
}

// ── Imperative DOM (.ts and .tsx) ────────────────────────────────────────────
// The chrome built with createElement writes its copy through a handful of
// sinks. A literal landing in one is copy by definition. On the syntax tree a
// sink's statement may span lines, and `el.title = open ? "Hide" : "Show"` is
// followed into both arms — the two survivors the line scan was written for
// were exactly that ternary.

/** Properties a DOM node shows or speaks. */
export const DOM_PROPS = new Set([
  "textContent", "innerText", "title", "alt", "placeholder",
  "ariaLabel", "ariaDescription", "ariaValueText", "ariaRoleDescription", "ariaPlaceholder",
]);
const DOM_ATTRS = new Set(["title", "aria-label", "placeholder", "alt", "aria-description", "aria-valuetext", "aria-roledescription", "aria-placeholder"]);

/** Findings for one .ts/.tsx source. `shell: true` adds the Android shell's
 *  own conventions (mobile/src): props passed to `el(tag, { textContent })`,
 *  string children of `el(…)`, and the `error:` of a JSON body a service
 *  worker or the pocket answers with. */
export function scanDom(source, fileName = "x.ts", { shell = false } = {}) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const found = [];
  const lines = source.split("\n");
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const marked = (line) => lines.slice(Math.max(0, line - 4), line).some((l) => NOT_COPY.test(l));
  const take = (expr, sink) => {
    for (const lit of valueLiterals(expr)) if (isCopy(lit.text)) found.push({ line: lineOf(lit.node), kind: sink, text: lit.text.trim() });
  };
  const propName = (n) => (n && (ts.isIdentifier(n) || ts.isStringLiteral(n)) ? n.text : null);
  const visit = (node) => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(node.left)) {
      if (DOM_PROPS.has(node.left.name.text)) take(node.right, node.left.name.text);
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "setAttribute") {
      const [name, value] = node.arguments;
      if (name && ts.isStringLiteral(name) && DOM_ATTRS.has(name.text)) take(value, name.text);
    } else if (shell && ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.parent)) {
      const name = propName(node.name);
      if (name !== null && (DOM_PROPS.has(name) || name === "error")) take(node.initializer, name);
    } else if (shell && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "el") {
      for (const child of node.arguments.slice(2)) take(child, "el child");
    } else if (
      shell &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "fail" &&
      node.arguments[0] &&
      ts.isNumericLiteral(node.arguments[0]) &&
      node.arguments[0].text === "501"
    ) {
      // The pocket's refusals (pocket/server.ts): a 501 is read by the
      // reader, so its reason is a dictionary key spoken in their language.
      take(node.arguments[1], "501 reason");
    } else if (shell && ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "PocketVaultError") {
      for (const arg of node.arguments ?? []) take(arg, "vault refusal");
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found.filter((f) => !marked(f.line));
}

// ── The shell's own dictionary (mobile/src/i18n.ts) ─────────────────────────
// The Android shell speaks before the client loads — the connect screen, the
// capture sheet, the pocket's sync line — from its own two-column table,
// `const en = {…}` and `const ar: Copy = {…}`. The type system holds the KEYS
// to parity; nothing held the VALUES. This reads both objects so the gate can
// report a value that is missing, an Arabic value with no Arabic in it, and a
// function whose two languages interpolate different things.

/** `{ en: Map<key, {text, holes}>, ar: … }` from the shell's dictionary. */
export function readShellDictionary(source) {
  const sf = ts.createSourceFile("i18n.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const out = { en: new Map(), ar: new Map() };
  const literal = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n);
  const textOf = (expr) => {
    if (!expr) return null;
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return { text: expr.text, holes: [] };
    if (ts.isTemplateExpression(expr)) {
      return {
        text: [expr.head.text, ...expr.templateSpans.map((s) => " " + s.literal.text)].join(""),
        holes: expr.templateSpans.map((s) => s.expression.getText(sf)).sort(),
      };
    }
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
      // Every literal in the body, a branching one (`n === 1 ? "…" : "…"`)
      // included. The HOLES are the parameters the text interpolates — by
      // name, so English's `${n === 1 ? "" : "s"}` and Arabic's plain `${n}`
      // both say "n".
      const params = expr.parameters.map((p) => p.name.getText(sf));
      const parts = [];
      const walk = (n) => {
        if (literal(n)) parts.push(textOf(n));
        else ts.forEachChild(n, walk);
      };
      walk(expr.body);
      const used = parts.flatMap((p) => p.holes).join(" ");
      return {
        text: parts.map((p) => p.text).join(" "),
        holes: params.filter((name) => new RegExp(`\\b${name}\\b`).test(used)).sort(),
      };
    }
    return null;
  };
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || (d.name.text !== "en" && d.name.text !== "ar")) continue;
      if (!d.initializer || !ts.isObjectLiteralExpression(d.initializer)) continue;
      for (const p of d.initializer.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        out[d.name.text].set(p.name.getText(sf), textOf(p.initializer));
      }
    }
  }
  return out;
}
