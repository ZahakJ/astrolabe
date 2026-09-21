// Reading a note's TEXT — the pure half of the indexer.
//
// Every function here used to live in server/indexer.ts, where it was pure
// already and unreachable by anything else. It moved because a second reader of
// the vault now exists: the pocket server (mobile/src/pocket/), which runs the
// vault inside a phone's WebView with no Node under it. A reverse index keyed
// even slightly differently from the resolver is a backlinks panel that quietly
// loses rows — and two implementations of "what does `[[Folder/Note]]` name"
// is that failure with a second codebase to hide in. So there is one.
//
// The rule for this file: no `node:*`, no `gray-matter`, no settings, no I/O.
// It takes text and answers with facts about the text. `server/indexer.ts`
// imports every one of these; so does `mobile/src/pocket/noteIndex.ts`.

import { stripNoteExt } from "./noteFormat.ts";
import { uncomment } from "./yaml.ts";

/** One `[[wikilink]]` found in a body, with the line it sat on. */
export interface ParsedLink {
  target: string;
  line: string;
  lineIdx: number;
}

/** Matches [[Name]], [[Name#heading]], [[Name|alias]], [[Name#heading|alias]]. */
export function wikilinkRegex(): RegExp {
  return /\[\[([^[\]|#]+)(#[^[\]|]*)?(\|[^[\]]*)?\]\]/g;
}

/** The `---` block off the top, and the count of lines it occupied. */
export function splitFrontmatter(content: string): { body: string; frontmatter: string; bodyStartLine: number } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) return { body: content, frontmatter: "", bodyStartLine: 0 };
  // Count what was CUT, not what remains: line N of `body` is line
  // N + bodyStartLine of the file the editor opens.
  const cut = match[0].match(/\n/g)?.length ?? 0;
  return { body: content.slice(match[0].length), frontmatter: match[1] ?? "", bodyStartLine: cut };
}

export function parseLinks(body: string): ParsedLink[] {
  const links: ParsedLink[] = [];
  const lines = body.split("\n");
  const re = wikilinkRegex();
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trimEnd();
    for (let m = re.exec(line); m !== null; m = re.exec(line)) {
      const target = (m[1] ?? "").trim();
      if (target) links.push({ target, line: line.trim(), lineIdx: i });
    }
    re.lastIndex = 0;
  }
  return links;
}

// `![alt](dest)` — the SAME shape the renderers match (client/reading/render.ts
// and client/editor/livePreview.ts): the destination runs to the first
// whitespace or `)`, with an optional quoted title after it. Keeping the three
// regexes the same shape is the point — the allowlist must cover exactly what
// the page will ask for, no more.
const MD_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/g;

/** Vault-relative destinations of standard-markdown images in `body`, resolved
 *  against the note's own folder — the twin of the client's
 *  `resolveRelative()` (client/editor/embeds.ts), which turns exactly these
 *  strings into `/api/file?path=…`. External schemes are skipped, `.`/`..`
 *  segments are folded, and a path that climbs above the vault root is
 *  dropped rather than clamped. */
export function parseAssets(body: string, relPath: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const base = relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")).split("/") : [];
  MD_IMAGE_RE.lastIndex = 0;
  for (let m = MD_IMAGE_RE.exec(body); m !== null; m = MD_IMAGE_RE.exec(body)) {
    const raw = m[1] ?? "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//") || raw.startsWith("#")) continue;
    let clean = raw.replace(/^<|>$/g, "").replace(/[?#].*$/, "");
    try {
      clean = decodeURIComponent(clean);
    } catch {
      // A stray '%' is not an encoding — take the destination literally.
    }
    clean = clean.replace(/\\/g, "/");
    if (!clean) continue;
    // A leading '/' means the vault root, exactly as resolveRelative() reads it.
    const parts = clean.startsWith("/") ? [] : [...base];
    let escaped = false;
    for (const seg of clean.replace(/^\/+/, "").split("/")) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") {
        if (parts.length === 0) {
          escaped = true;
          break;
        }
        parts.pop();
      } else parts.push(seg);
    }
    if (escaped || parts.length === 0) continue;
    const rel = parts.join("/");
    if (!seen.has(rel)) {
      seen.add(rel);
      out.push(rel);
    }
  }
  return out;
}

/** Frontmatter date value → epoch ms, or null when absent/unparseable.
 *  gray-matter's YAML parser hands back Date objects for bare dates and
 *  strings for quoted ones — both are honored. */
export function parseFmDate(value: unknown): number | null {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "string" && value.trim()) {
    const ms = Date.parse(value.trim());
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

export function parseTags(body: string, frontmatter: string): string[] {
  const tags = new Set<string>();
  // Inline #tags: '#' preceded by start/whitespace/'(' and followed by a word char.
  const inline = /(?:^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_/-]*)/gu;
  for (let m = inline.exec(body); m !== null; m = inline.exec(body)) {
    tags.add((m[1] ?? "").toLowerCase());
  }
  // Frontmatter `tags:` — inline scalar, [a, b] flow list, or block list.
  const fmMatch = /^tags:[ \t]*(.*)$/m.exec(frontmatter);
  if (fmMatch) {
    // A trailing `# comment` is the author's aside, not part of the tag. The
    // scan is quote-aware (shared/yaml.ts) because `tags: ["a # b"]` names one
    // tag with a hash in it — the same verdict the frontmatter writer and the
    // properties card now reach, so a note cannot be filed under a tag reading
    // "alpha # why this one" that nothing else in the product agrees exists.
    const inlineValue = uncomment((fmMatch[1] ?? "").trim());
    let values: string[] = [];
    if (inlineValue.startsWith("[")) {
      values = inlineValue.replace(/^\[|\]$/g, "").split(",");
    } else if (inlineValue) {
      values = inlineValue.split(",");
    } else {
      const rest = frontmatter.slice(fmMatch.index + fmMatch[0].length);
      for (const line of rest.split("\n")) {
        const item = /^[ \t]*-[ \t]+(.+)$/.exec(line);
        if (item) values.push(uncomment((item[1] ?? "").trim()));
        else if (line.trim()) break;
      }
    }
    for (const value of values) {
      const tag = value.trim().replace(/^["'#]+|["']+$/g, "").toLowerCase();
      if (tag) tags.add(tag);
    }
  }
  return [...tags].sort();
}

/** Frontmatter as a flat string map: strings, numbers, booleans and dates
 *  as written; a list of scalars joined with ", "; anything nested dropped.
 *  Keys are lowercased so `prop:Status=x` and `prop:status=x` agree. */
export function scalarProps(fm: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fm)) {
    const k = key.trim().toLowerCase();
    if (k === "") continue;
    const scalar = (v: unknown): string | null =>
      typeof v === "string" ? v.trim() : typeof v === "number" || typeof v === "boolean" ? String(v) : v instanceof Date ? v.toISOString().slice(0, 10) : null;
    if (Array.isArray(value)) {
      const items = value.map(scalar).filter((x): x is string => x !== null && x !== "");
      if (items.length > 0) out[k] = items.join(", ");
      continue;
    }
    const s = scalar(value);
    if (s !== null && s !== "") out[k] = s.slice(0, 400);
  }
  return out;
}

/** `path.posix.normalize` for a vault-relative path, without `node:path`:
 *  fold `.` and `..`, collapse repeated slashes. A path that climbs past the
 *  root keeps its leading `..` exactly as posix.normalize does, so a target
 *  that escapes the vault matches nothing rather than matching the root. */
export function normalizeVaultPath(value: string): string {
  const absolute = value.startsWith("/");
  const parts: string[] = [];
  for (const seg of value.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      const last = parts[parts.length - 1];
      if (parts.length > 0 && last !== "..") parts.pop();
      else if (!absolute) parts.push("..");
      continue;
    }
    parts.push(seg);
  }
  const joined = parts.join("/");
  if (absolute) return `/${joined}`;
  return joined === "" ? "." : joined;
}

/** THE ONE KEY A LINK IS FILED AND LOOKED UP UNDER: the target with any
 *  anchor, alias and note extension removed and lowercased, plus the same
 *  normalized as a vault-relative path.
 *
 *  Extracted so resolveLink() and the reverse index cannot drift. A reverse
 *  index keyed even slightly differently from the resolver is a backlinks panel
 *  that quietly loses rows, which is the worst shape a perf fix can take: it
 *  looks right and it is wrong. */
export function linkKeys(target: string): { key: string; asPath: string } {
  // The extension comes off whatever it is: `[[Paper.tex]]` and `[[Paper]]`
  // name the same note, exactly as `[[Note.md]]` and `[[Note]]` always did.
  const key = stripNoteExt((target.split(/[#|]/)[0] ?? "").trim().toLowerCase());
  // Path-form targets ([[Folder/Note]]) are matched against the vault-relative
  // path table, so `./Folder/Note` and `Folder/Note` have to arrive as one
  // string.
  const asPath = normalizeVaultPath(key.replace(/\\/g, "/")).replace(/^\.?\/+/, "");
  return { key, asPath };
}

/** Shortest-path winner among duplicate basenames: fewest segments, then
 *  shortest string, then alpha — same rule for notes and attachments. */
export function pickShortest(candidates: Set<string> | readonly string[]): string {
  return ([...candidates].sort((a, b) => {
    const depth = a.split("/").length - b.split("/").length;
    if (depth !== 0) return depth;
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  })[0]) as string;
}
