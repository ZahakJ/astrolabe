/**
 * FRONTMATTER, READ WITHOUT A YAML LIBRARY.
 *
 * The server parses frontmatter with `gray-matter`, which is js-yaml plus a
 * Buffer shim: about 90 kB gzipped, and it is the only reason a Node polyfill
 * would have had to reach a phone. What the vault actually keeps in that block
 * is scalars, flow lists, block lists and — in two places — one level of
 * nesting (`labels:`), which is the subset this reads.
 *
 * It is deliberately NOT a YAML parser and never claims to be: anything it
 * cannot read it drops, exactly as `readFrontmatter` does on a syntax error.
 * A frontmatter key the pocket cannot see is a property that does not show on
 * the card; a frontmatter key it GUESSES at is a note filed under a tag nobody
 * typed, and that one is worse.
 *
 * The same coercions gray-matter's YAML performs, because the index downstream
 * tests for them: `true`/`false` are booleans, a bare `YYYY-MM-DD` is a Date
 * (shared/noteParse.ts::parseFmDate reads both), numbers are numbers.
 */

import { splitFrontmatter } from "../../../shared/noteParse.ts";
import { uncomment } from "../../../shared/yaml.ts";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

/** One scalar, coerced the way js-yaml would coerce it. */
export function readScalar(raw: string): unknown {
  const text = raw.trim();
  if (text === "") return "";
  const quote = text[0];
  if ((quote === '"' || quote === "'") && text.length > 1 && text.endsWith(quote)) {
    const inner = text.slice(1, -1);
    return quote === '"' ? inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\") : inner.replace(/''/g, "'");
  }
  if (text === "true" || text === "True") return true;
  if (text === "false" || text === "False") return false;
  if (text === "null" || text === "~") return null;
  if (/^-?\d+$/.test(text)) return Number(text);
  if (/^-?\d*\.\d+$/.test(text)) return Number(text);
  if (DATE_ONLY.test(text) || TIMESTAMP.test(text)) {
    const at = new Date(DATE_ONLY.test(text) ? `${text}T00:00:00.000Z` : text.replace(" ", "T"));
    if (!Number.isNaN(at.getTime())) return at;
  }
  return text;
}

function splitFlow(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let at = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote !== null) {
      if (ch === "\\" && quote === '"') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "[" || ch === "{") depth++;
    else if (ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      out.push(inner.slice(at, i));
      at = i + 1;
    }
  }
  out.push(inner.slice(at));
  return out.map((s) => s.trim()).filter((s) => s !== "");
}

const KEY_LINE = /^([ \t]*)([A-Za-z0-9_][\w .:/-]*?):(?:[ \t]+(.*))?$/;
const ITEM_LINE = /^([ \t]*)-[ \t]+(.*)$/;

/**
 * The `---` block as a flat object.
 *
 * Tolerant by contract: an unreadable line is skipped and the rest of the
 * block still reads, which is what `readFrontmatter`'s try/catch amounts to on
 * the server, only finer-grained.
 */
export function readFrontmatter(source: string): Record<string, unknown> {
  const { frontmatter } = splitFrontmatter(source);
  if (!frontmatter.trim()) return {};
  const out: Record<string, unknown> = {};
  const lines = frontmatter.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const key = KEY_LINE.exec(line);
    if (!key || (key[1] ?? "") !== "") continue; // only top-level keys start a value
    const name = (key[2] ?? "").trim();
    const inline = uncomment(key[3] ?? "").trim();

    if (inline.startsWith("[")) {
      out[name] = splitFlow(inline.replace(/^\[/, "").replace(/\]$/, "")).map(readScalar);
      continue;
    }
    if (inline !== "" && !inline.startsWith("|") && !inline.startsWith(">")) {
      out[name] = readScalar(inline);
      continue;
    }

    // A block scalar (`|`, `>`) or a key with nothing after it: read the
    // indented run underneath and decide from its first line what it is.
    const block: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const next = lines[j] ?? "";
      if (next.trim() === "") {
        block.push(next);
        continue;
      }
      if (!/^[ \t]/.test(next)) break;
      block.push(next);
    }
    const body = block.filter((l) => l.trim() !== "");
    i = j - 1;

    if (inline.startsWith("|") || inline.startsWith(">")) {
      const indent = /^([ \t]*)/.exec(body[0] ?? "")?.[1]?.length ?? 0;
      const text = body.map((l) => l.slice(indent)).join(inline.startsWith(">") ? " " : "\n");
      out[name] = text;
      continue;
    }
    if (body.length === 0) {
      out[name] = "";
      continue;
    }
    if (ITEM_LINE.test(body[0] ?? "")) {
      const items: unknown[] = [];
      for (const l of body) {
        const item = ITEM_LINE.exec(l);
        if (item) items.push(readScalar(uncomment(item[2] ?? "")));
      }
      out[name] = items;
      continue;
    }
    // One level of nesting, which is what `labels:` is and all that anything
    // downstream reads.
    const nested: Record<string, unknown> = {};
    for (const l of body) {
      const pair = KEY_LINE.exec(l);
      if (pair) nested[(pair[2] ?? "").trim()] = readScalar(uncomment(pair[3] ?? ""));
    }
    out[name] = nested;
  }
  return out;
}
