// THE IMPORT WIZARD'S PURE HALF (docs/import.md): names, collisions,
// frontmatter and links — everything about turning another app's export into
// this vault's notes that is arithmetic on strings, so tests/import.test.ts
// can pin it without a vault and the server (server/import/*) and the client
// (the preview's words) read one rule.

/** The three sources the wizard knows. */
export type ImportSourceKind = "notion" | "evernote" | "obsidian";
export const IMPORT_SOURCES: readonly ImportSourceKind[] = ["notion", "evernote", "obsidian"];

export function isImportSource(v: unknown): v is ImportSourceKind {
  return typeof v === "string" && (IMPORT_SOURCES as readonly string[]).includes(v);
}

/** Where an import lands when the reader names no folder. */
export const IMPORT_FOLDER_DEFAULT = "Imported";

// ── Names ───────────────────────────────────────────────────────────────────

/** Notion suffixes every page, database and folder with its 32-hex id
 *  ("Reading list 1a2b…"), and a vault of names like that is unreadable.
 *  The id goes; a collision it was keeping apart is resolved later, out
 *  loud, by `resolveTargets`. */
export function stripNotionId(name: string): string {
  return name.replace(/\s+[0-9a-f]{32}(?=(\.[A-Za-z0-9]+)?$)/i, "").replace(/\s+[0-9a-f]{32}$/i, "");
}

/** A note or folder name the vault can hold: the filesystem's forbidden set
 *  plus `[ ] #` (no `[[wikilink]]` could spell them) and `^ |`, controls gone,
 *  dots and spaces off both ends, capped. Empty comes back as `fallback`. */
export function cleanName(name: string, fallback = "Untitled"): string {
  const out = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\\/:*?"<>|[\]#^]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .slice(0, 120)
    .replace(/[.\s]+$/g, "");
  return out === "" ? fallback : out;
}

/** A folder path of cleaned segments. */
export function cleanDir(dir: string, strip: (s: string) => string = (s) => s): string {
  return dir
    .split("/")
    .filter((s) => s !== "" && s !== "." && s !== "..")
    .map((s) => cleanName(strip(s), "Folder"))
    .join("/");
}

export interface Collision {
  /** What the export called it (its path inside the export). */
  source: string;
  /** Where it would have gone. */
  wanted: string;
  /** Where it goes. */
  target: string;
  /** Already in the vault, or twice in the export. */
  reason: "exists" | "duplicate";
}

/** Give every wanted path a free one: the first claim on a path keeps it,
 *  a later one — or one the vault already has — becomes `Name 2.md`,
 *  `Name 3.md`… Case-insensitive, because a vault on macOS or Windows is.
 *  Nothing is ever overwritten. */
export function resolveTargets(wanted: ReadonlyArray<{ source: string; path: string }>, exists: (path: string) => boolean): { targets: Map<string, string>; collisions: Collision[] } {
  const taken = new Set<string>();
  const targets = new Map<string, string>();
  const collisions: Collision[] = [];
  for (const { source, path } of wanted) {
    const dot = path.lastIndexOf(".");
    const slash = path.lastIndexOf("/");
    const stem = dot > slash ? path.slice(0, dot) : path;
    const ext = dot > slash ? path.slice(dot) : "";
    let candidate = path;
    let reason: Collision["reason"] | null = null;
    for (let n = 2; ; n++) {
      const key = candidate.toLowerCase();
      if (taken.has(key)) reason ??= "duplicate";
      else if (exists(candidate)) reason ??= "exists";
      else break;
      candidate = `${stem} ${n}${ext}`;
      if (n > 999) throw new Error(`no free name for ${path}`);
    }
    taken.add(candidate.toLowerCase());
    targets.set(source, candidate);
    if (reason !== null) collisions.push({ source, wanted: path, target: candidate, reason });
  }
  return { targets, collisions };
}

// ── Frontmatter ─────────────────────────────────────────────────────────────

export type FrontValue = string | string[] | number | boolean;

function yamlScalar(v: string): string {
  if (v === "") return '""';
  // Plain when it cannot be read as anything but a string.
  if (/^[\p{L}\p{N}][\p{L}\p{N} _./-]*$/u.test(v) && !/^(true|false|null|yes|no|on|off|~)$/i.test(v) && !/^[0-9.+-]+$/.test(v) && !/\s$/.test(v)) return v;
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
}

/** A property name as a YAML key: Notion's "Date Created" is `Date Created`
 *  (quoted where it must be), never renamed — the reader's words are theirs. */
function yamlKey(k: string): string {
  return /^[\p{L}\p{N}_][\p{L}\p{N}_ -]*$/u.test(k) && !/\s$/.test(k) ? k : yamlScalar(k);
}

/** A frontmatter block for `fields`, in their order. Lists are flow
 *  sequences; dates (`YYYY-MM-DD`) stay bare so every reader of the vault
 *  sees a date. */
export function frontmatterBlock(fields: ReadonlyArray<[string, FrontValue]>): string {
  if (fields.length === 0) return "";
  const lines = ["---"];
  for (const [k, v] of fields) {
    let value: string;
    if (Array.isArray(v)) value = `[${v.map(yamlScalar).join(", ")}]`;
    else if (typeof v === "number" || typeof v === "boolean") value = String(v);
    else if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) value = v;
    else value = yamlScalar(v);
    lines.push(`${yamlKey(k)}: ${value}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

/** A tag as this vault writes one: no `#`, spaces to hyphens. */
export function cleanTag(tag: string): string {
  return tag.trim().replace(/^#+/, "").replace(/\s+/g, "-").replace(/[,[\]{}]/g, "");
}

/** Notion writes a database row's properties as lines under the title —
 *  `Status: Reading`, `Tags: essays, history` — before the page's own words.
 *  Those lines, as fields; the title; and the body without either. A page
 *  with no such block gives none. */
export function notionProperties(md: string): { title: string | null; fields: Array<[string, FrontValue]>; body: string } {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  let title: string | null = null;
  if (i < lines.length && /^# /.test(lines[i])) {
    title = lines[i].slice(2).trim();
    i++;
  }
  let j = i;
  while (j < lines.length && lines[j].trim() === "") j++;
  const fields: Array<[string, FrontValue]> = [];
  let k = j;
  for (; k < lines.length; k++) {
    const m = /^([^:\n]{1,48}?):\s(.*)$/.exec(lines[k]);
    if (!m || /^[#>*\-|`]/.test(lines[k]) || /\]\(/.test(m[1])) break;
    const key = m[1].trim();
    const raw = m[2].trim();
    fields.push([key, notionValue(key, raw)]);
  }
  // A property block is followed by a blank line or the end; anything else
  // was a sentence with a colon in it, and the page keeps it.
  if (fields.length === 0 || (k < lines.length && lines[k].trim() !== "")) return { title, fields: [], body: lines.slice(i).join("\n").replace(/^\n+/, "") };
  return { title, fields, body: lines.slice(k).join("\n").replace(/^\n+/, "") };
}

const MONTHS: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

/** "September 20, 2026" or "September 20, 2026 8:30 AM" → `2026-09-20`. */
export function notionDate(raw: string): string | null {
  const m = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})(?:\s|$)/.exec(raw.trim());
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function notionValue(key: string, raw: string): FrontValue {
  const date = notionDate(raw);
  if (date !== null) return date;
  if (/^(tags?|categories|topics)$/i.test(key)) return raw.split(",").map(cleanTag).filter(Boolean);
  if (raw === "Yes" || raw === "No") return raw === "Yes";
  return raw;
}

/** The fields' key names normalised to this vault's: a `Tags`/`tag` list is
 *  `tags`, `Created`/`Date Created` is `created`. Everything else keeps its
 *  name. */
export function normaliseFields(fields: ReadonlyArray<[string, FrontValue]>): Array<[string, FrontValue]> {
  const out: Array<[string, FrontValue]> = [];
  const seen = new Set<string>();
  for (const [k, v] of fields) {
    let key = k;
    let value = v;
    if (/^(tags?|categories)$/i.test(k)) {
      key = "tags";
      value = (Array.isArray(v) ? v : String(v).split(",")).map(cleanTag).filter(Boolean);
    } else if (/^(created|date created|created time|created at)$/i.test(k)) key = "created";
    else if (/^(aliases|alias)$/i.test(k)) key = "aliases";
    // A `publish:` key from elsewhere (Obsidian Publish writes one) must not
    // publish anything here: an import is private until the owner says.
    else if (/^publish$/i.test(k)) continue;
    const lower = key.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push([key, value]);
  }
  return out;
}

// ── Links ───────────────────────────────────────────────────────────────────

/** Decode a markdown link destination (Notion percent-encodes every one). */
export function decodeDest(dest: string): string {
  let d = dest.trim();
  if (d.startsWith("<") && d.endsWith(">")) d = d.slice(1, -1);
  try {
    return decodeURIComponent(d);
  } catch {
    return d;
  }
}

/** `rel` resolved against the folder `dir` (both export-relative). */
export function joinRel(dir: string, rel: string): string | null {
  // A rooted destination ("/a/b.md") is from the export's root.
  const parts = rel.startsWith("/") || dir === "" ? [] : dir.split("/");
  for (const seg of rel.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

const MD_LINK_RE = /(!?)\[([^\]\n]*)\]\(((?:<[^>\n]*>)|(?:[^)\s]+))(\s+"[^"]*")?\)/g;

/** Rewrite a note's markdown links that point at OTHER NOTES OF THE IMPORT
 *  into wikilinks by the target's final name — `[see](Sub%20Page%20abc.md)`
 *  becomes `[[Sub Page|see]]` — and leave every other destination (the web,
 *  attachments, which server/moveLinks.ts re-resolves) alone. `noteAt` maps
 *  an export-relative path to its final vault path, or null. Returns the text
 *  and how many links it rewrote. */
export function linksToWikilinks(md: string, dir: string, noteAt: (exportPath: string) => string | null): { text: string; count: number } {
  let count = 0;
  const text = md.replace(MD_LINK_RE, (whole, bang: string, label: string, dest: string) => {
    if (bang === "!") return whole;
    const raw = decodeDest(dest);
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("#") || raw.startsWith("//")) return whole;
    const [pathPart, anchor = ""] = raw.split("#");
    const at = joinRel(dir, pathPart);
    if (at === null) return whole;
    const target = noteAt(at);
    if (target === null) return whole;
    count++;
    const name = target.slice(target.lastIndexOf("/") + 1).replace(/\.md$/i, "");
    const heading = anchor ? `#${anchor}` : "";
    const shown = label.trim();
    return shown === "" || shown === name ? `[[${name}${heading}]]` : `[[${name}${heading}|${shown.replace(/[[\]|]/g, " ")}]]`;
  });
  return { text, count };
}

/** Rename `![[old]]` / `[[old]]` embeds of attachments that took a new name
 *  on the way in. Returns the text and how many it rewrote. */
export function renameEmbeds(md: string, renamed: ReadonlyMap<string, string>): { text: string; count: number } {
  if (renamed.size === 0) return { text: md, count: 0 };
  let count = 0;
  const text = md.replace(/(!?)\[\[([^\]|#^\n]+)((?:[#^][^\]|\n]*)?(?:\|[^\]\n]*)?)\]\]/g, (whole, bang: string, target: string, rest: string) => {
    const key = target.trim();
    const base = key.slice(key.lastIndexOf("/") + 1);
    const to = renamed.get(key) ?? renamed.get(base);
    if (to === undefined || to === key) return whole;
    count++;
    return `${bang}[[${to}${rest}]]`;
  });
  return { text, count };
}

// ── The wire ────────────────────────────────────────────────────────────────

export interface ImportPreview {
  planId: string;
  source: ImportSourceKind;
  folder: string;
  notes: number;
  attachments: number;
  /** Links rewritten: notes into wikilinks, embeds renamed, destinations
   *  re-resolved for the attachments' new home. */
  links: number;
  collisions: Collision[];
  /** Frontmatter written or kept, by kind: properties turned into keys,
   *  tags, created dates, aliases, and `publish:` flags taken off. */
  frontmatter: { properties: number; tags: number; created: number; aliases: number; publishCleared: number };
  /** The first few notes, where they land. */
  sample: string[];
  /** Where the attachments go. */
  attachmentsFolder: string;
  /** Files the import leaves out, with why. */
  skipped: Array<{ path: string; reason: "unsupported" | "empty" | "unreadable" | "system" }>;
  /** When the plan is forgotten, ms. */
  expires: number;
}

/** One line of the commit's streamed answer. */
export type ImportProgress =
  | { type: "progress"; done: number; total: number; path: string }
  | { type: "done"; undoId: string; notes: string[]; attachments: string[] }
  | { type: "error"; error: string };

export interface ImportUndoResult {
  removed: string[];
  /** Files edited since the import: left where they are. */
  kept: string[];
}
