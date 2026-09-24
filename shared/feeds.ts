// FEEDS — the reading list a note keeps, and the note a kept article becomes
// (docs/feeds.md).
//
// INBOUND, NOT OUTBOUND. The blog publishes its own RSS (server/blog.ts,
// `/rss.xml`) — that is the site speaking. This is the other direction: the
// owner's list of other people's feeds, fetched by the server on the owner's
// say-so, read in the Feeds surface, and the articles worth keeping written
// into the vault as notes. The two never share a word in the copy.
//
// THE LIST IS A NOTE. `Feeds.md` (the path is a Vault setting) carries a
// ```feeds fence, and the fence is the whole configuration: a note syncs,
// versions and diffs like every other note, and a list of addresses is exactly
// the kind of thing a reader wants to annotate around ("the good one, but
// slow"). Nothing about the list lives in settings.json.
//
//     ```feeds
//     #reading                       ← before any feed: applies to every feed
//     https://example.org/feed.xml → Reading/Essays
//     #essays #longform              ← applies to the feed above it
//     https://other.example/rss
//     ```
//
// One address per line, optionally `→ Folder` (or `->`) for where a kept
// article of that feed is filed (`Reading` when absent); a line of `#tag`s
// adds tags to the feed above it, or — before the first address — to every
// feed in the block. `//` starts a comment line. The first mention of an
// address wins; a second is reported, not merged.
//
// PURE, like shared/capture.ts: the server (server/feeds.ts), the client's
// surface and tests/feeds.test.ts read the same bytes-in, bytes-out contract.

import { folderError, normalizeFolder } from "./attachments.ts";
import { yamlQuote } from "./capture.ts";
import { fenceOpener, closesFence } from "./fences.ts";

/** The fence word. */
export const FEEDS_FENCE = "feeds";

/** Where the list lives when the Vault setting names nowhere else. */
export const FEEDS_NOTE_DEFAULT = "Feeds.md";

/** Where a kept article is filed when its feed names no folder. */
export const READING_FOLDER = "Reading";

/** How often the feeds are asked when git sync is off, in minutes. With sync
 *  on they ride its cadence (`gitSync.intervalMinutes`): one schedule for
 *  everything this instance does over the network. */
export const FEEDS_DEFAULT_MINUTES = 60;

/** How many feeds one list may name. A reading room, not an aggregator. */
export const FEEDS_MAX = 200;

/** One feed as the list names it. */
export interface FeedSpec {
  url: string;
  /** Vault-relative folder a kept article lands in. */
  folder: string;
  /** Tags applied to every keep, without the `#`. */
  tags: string[];
  /** 1-based line in the note, for the problems list. */
  line: number;
}

export type FeedProblemReason = "notAnAddress" | "duplicate" | "badFolder" | "tooMany" | "tagBeforeNothing";

export interface FeedProblem {
  line: number;
  reason: FeedProblemReason;
  text: string;
}

export interface FeedList {
  feeds: FeedSpec[];
  problems: FeedProblem[];
}

const TAG_RE = /#([\p{L}\p{N}_/-]+)/gu;
const ARROW_RE = /\s*(?:→|->)\s*/;

function tagsOf(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("#")) return null;
  // A tag line is tags and nothing else: `#a #b`. Anything left over is not
  // a tag line (and a `# Heading` is not one either: a space after the mark).
  const rest = trimmed.replace(TAG_RE, "").trim();
  if (rest !== "") return null;
  return [...trimmed.matchAll(TAG_RE)].map((m) => m[1]);
}

function httpUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

function addTags(into: string[], more: readonly string[]): void {
  for (const tag of more) if (!into.some((t) => t.toLowerCase() === tag.toLowerCase())) into.push(tag);
}

/** Every ```feeds block in `md`, read into one list. Never throws: a line it
 *  cannot read is a problem with a line number, and the rest still counts. */
export function parseFeedList(md: string): FeedList {
  const feeds: FeedSpec[] = [];
  const problems: FeedProblem[] = [];
  const seen = new Set<string>();
  const lines = md.split(/\r?\n/);
  let open: ReturnType<typeof fenceOpener> = null;
  let ours = false;
  // Tags that apply to every feed of the block being read, and the feed a
  // tag line attaches to.
  let blockTags: string[] = [];
  let blockFeeds: FeedSpec[] = [];
  let last: FeedSpec | null = null;
  const closeBlock = (): void => {
    for (const f of blockFeeds) {
      const merged = [...blockTags];
      addTags(merged, f.tags);
      f.tags = merged;
    }
    blockTags = [];
    blockFeeds = [];
    last = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (open === null) {
      const fence = fenceOpener(line);
      if (fence) {
        open = fence;
        const info = line.trim().slice(fence.len).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
        ours = info === FEEDS_FENCE;
      }
      continue;
    }
    if (closesFence(line, open)) {
      if (ours) closeBlock();
      open = null;
      ours = false;
      continue;
    }
    if (!ours) continue;
    const text = line.trim();
    if (text === "" || text.startsWith("//")) continue;
    const tags = tagsOf(text);
    if (tags !== null) {
      if (last === null) {
        if (blockFeeds.length === 0) addTags(blockTags, tags);
        else problems.push({ line: i + 1, reason: "tagBeforeNothing", text });
      } else addTags((last as FeedSpec).tags, tags);
      continue;
    }
    const [head, ...tail] = text.split(ARROW_RE);
    const url = httpUrl(head.trim());
    if (url === null) {
      problems.push({ line: i + 1, reason: "notAnAddress", text });
      continue;
    }
    if (seen.has(url)) {
      problems.push({ line: i + 1, reason: "duplicate", text });
      last = null;
      continue;
    }
    if (feeds.length >= FEEDS_MAX) {
      problems.push({ line: i + 1, reason: "tooMany", text });
      continue;
    }
    let folder = READING_FOLDER;
    const named = tail.join(" ").trim();
    if (named !== "") {
      if (folderError(named) !== null || normalizeFolder(named) === "") problems.push({ line: i + 1, reason: "badFolder", text });
      else folder = normalizeFolder(named);
    }
    seen.add(url);
    const spec: FeedSpec = { url, folder, tags: [], line: i + 1 };
    feeds.push(spec);
    blockFeeds.push(spec);
    last = spec;
  }
  // An unclosed fence runs to the end of the note, as CommonMark says.
  if (open !== null && ours) closeBlock();
  return { feeds, problems };
}

/** How often, in minutes, the feeds are asked: git sync's cadence when sync
 *  runs on a timer, else the hour. */
export function feedsCadenceMinutes(sync: { enabled: boolean; remote: string | null; intervalMinutes: number }): number {
  if (sync.enabled && sync.remote !== null && sync.intervalMinutes > 0) return sync.intervalMinutes;
  return FEEDS_DEFAULT_MINUTES;
}

// ── The kept article ────────────────────────────────────────────────────────

export interface KeptInput {
  title: string;
  /** The article's own address. */
  url: string | null;
  /** The feed's title (its address when it has none). */
  feed: string;
  /** `YYYY-MM-DD`, when the feed dated the item. */
  published: string | null;
  /** `YYYY-MM-DD`, the reader's day. */
  kept: string;
  tags: readonly string[];
  /** The article, already Markdown. */
  body: string;
}

/** A tag as a flow-sequence item: bare when it is a plain word, quoted when
 *  YAML could read it as something else. */
function yamlTag(tag: string): string {
  return /^[\p{L}\p{N}_][\p{L}\p{N}_/-]*$/u.test(tag) && !/^(true|false|null|yes|no|on|off|~)$/i.test(tag) && !/^[0-9]/.test(tag)
    ? tag
    : yamlQuote(tag);
}

/** The note a kept article becomes: the clip's shape (shared/capture.ts
 *  `clipNote`) with the feed's facts in the frontmatter — where it came from,
 *  which feed carried it, when it was published and when it was kept. No
 *  `publish:` key: a kept article is the reader's copy of somebody else's
 *  writing, private until the owner publishes it by hand. */
export function keptNote(input: KeptInput): string {
  const front = ["---"];
  if (input.url) front.push(`source: ${yamlQuote(input.url)}`);
  front.push(`feed: ${yamlQuote(input.feed)}`);
  if (input.published) front.push(`published: ${input.published}`);
  front.push(`kept: ${input.kept}`);
  if (input.tags.length > 0) front.push(`tags: [${input.tags.map(yamlTag).join(", ")}]`);
  front.push("---", "");
  const title = input.title.replace(/\s+/g, " ").trim();
  let body = input.body.replace(/^\s+|\s+$/g, "");
  const firstLine = body.split("\n", 1)[0] ?? "";
  if (/^# /.test(firstLine) && firstLine.slice(2).trim().toLowerCase() === title.toLowerCase()) {
    body = body.slice(firstLine.length).replace(/^\s+/, "");
  }
  return `${front.join("\n")}\n# ${title}\n${body === "" ? "" : `\n${body}\n`}`;
}

/** `YYYY-MM-DD` of a timestamp in the server's own zone, or null. */
export function isoDay(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ── The wire ────────────────────────────────────────────────────────────────

/** One feed as GET /api/feeds reports it. */
export interface FeedSummary {
  url: string;
  title: string;
  /** The site the feed describes, when it says. */
  site: string | null;
  folder: string;
  tags: string[];
  unread: number;
  /** When the server last asked, ms; null before the first ask. */
  checked: number | null;
  /** Why the last ask failed, in the server's words; null when it did not. */
  error: string | null;
}

/** One item in the list. */
export interface FeedItemSummary {
  feed: string;
  guid: string;
  title: string;
  url: string | null;
  author: string | null;
  /** ms, or null when the feed gave no date. */
  published: number | null;
  read: boolean;
  /** The vault path it was kept as, once kept. */
  kept: string | null;
  /** The first words of it, plain text. */
  excerpt: string;
}

/** One item opened in the reader. */
export interface FeedItemFull extends FeedItemSummary {
  /** Sanitised HTML (shared/feedHtml.ts) — safe to render as it is. */
  html: string;
  /** The feed carried a summary only; Keep will fetch the page. */
  summaryOnly: boolean;
}

export interface FeedsState {
  /** Settings → Vault → Feeds: whether the server may ask at all. */
  fetch: boolean;
  /** The note the list lives in. */
  note: string;
  /** The note exists. */
  noteExists: boolean;
  cadenceMinutes: number;
  /** When the last round finished, ms. */
  lastRound: number | null;
  /** A round is running now. */
  busy: boolean;
  feeds: FeedSummary[];
  items: FeedItemSummary[];
  problems: FeedProblem[];
}

/** Unread items newest first, grouped by feed in the list's own order. */
export function groupItems(feeds: readonly FeedSummary[], items: readonly FeedItemSummary[]): Array<{ feed: FeedSummary; items: FeedItemSummary[] }> {
  const by = new Map<string, FeedItemSummary[]>();
  for (const item of items) {
    const list = by.get(item.feed);
    if (list) list.push(item);
    else by.set(item.feed, [item]);
  }
  const out: Array<{ feed: FeedSummary; items: FeedItemSummary[] }> = [];
  for (const feed of feeds) {
    const list = by.get(feed.url);
    if (!list || list.length === 0) continue;
    list.sort((a, b) => (b.published ?? 0) - (a.published ?? 0) || a.title.localeCompare(b.title));
    out.push({ feed, items: list });
  }
  return out;
}
