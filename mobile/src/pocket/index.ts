/**
 * THE POCKET VAULT'S INDEX — the phone's answer to server/indexer.ts.
 *
 * It holds one record per note in memory and answers the questions the web
 * client asks the server: the tree, search, backlinks, the graph, tags, props,
 * link resolution, anchors, the shelves. It computes NONE of that itself: every
 * line of parsing, folding, scanning and stripping comes from `shared/`, which
 * is where the server's own copies now live (shared/noteParse.ts,
 * shared/prose.ts, shared/snippet.ts, and the scanners that were already
 * there). A second implementation of "what does this note say" is a vault that
 * disagrees with itself about its own contents depending on which machine is
 * reading it, and that is the failure this file exists to not be.
 *
 * What is deliberately NOT here: the visitor/published scoping the server
 * spends a third of its index on. A pocket vault has exactly one reader, the
 * owner, holding the repository. `publishedOnly` is false everywhere and there
 * is no language filter, because there is no public site to curate.
 */

import MiniSearch from "minisearch";
import type {
  AliasEntry,
  Backlink,
  GraphData,
  GraphEdge,
  NearbyHit,
  PropCount,
  QueryHit,
  SearchHit,
  SearchMatch,
  TagCount,
  TaskMeta,
  TreeNode,
  TrackerMeta,
  RoutineMeta,
} from "../../../shared/types.ts";
import { noteAnchors, type NoteAnchor } from "../../../shared/anchors.ts";
import { stripBidiControls } from "../../../shared/bidi.ts";
import { DEFAULT_NEW_PER_DAY, DEFAULT_STEPS, EVERYTHING_ELSE, deckCardsOf, deckOf, type Deck, type DeckCard, type DeckMeta } from "../../../shared/decks.ts";
import { scanCards, type Card } from "../../../shared/cards.ts";
import { findAnyMatches, foldQuery, foldTerm } from "../../../shared/fold.ts";
import { idStampMs } from "../../../shared/idStamp.ts";
import {
  bannerOf,
  linkKeys,
  parseAliases,
  parseAssets,
  parseFmDate,
  parseLinks,
  parseTags,
  pickShortest,
  scalarProps,
  splitFrontmatter,
  type ParsedLink,
} from "../../../shared/noteParse.ts";
import { isNotePath, isTexPath, noteCandidates, noteTitleOf, stripNoteExt } from "../../../shared/noteFormat.ts";
import { parseTex, texFrontmatterText, texProse } from "../../../shared/tex.ts";
import { cleanContextLine, expandedContext, contextProse, stripMarkdown } from "../../../shared/prose.ts";
import { scanRoutines, type RoutineBlock } from "../../../shared/routine.ts";
import { parseSearchQuery, searchScope, type QueryFilter } from "../../../shared/searchQuery.ts";
import { isDue } from "../../../shared/srs.ts";
import { escapeHtml, markHtml, snippetOf, windowAround } from "../../../shared/snippet.ts";
import { scanTasks, type Task } from "../../../shared/tasks.ts";
import { scanTrackers, type Tracker } from "../../../shared/tracker.ts";
import { attachmentKindOf, extensionOf, type AttachmentMode } from "../../../shared/attachments.ts";
import { sortTree } from "../../../shared/tree.ts";
import { readFrontmatter } from "./frontmatter.ts";

/** One note, parsed. The server's `NoteRecord` minus the fields only a public
 *  site needs (published census, language, blog excerpt caches). */
export interface PocketNote {
  path: string;
  title: string;
  content: string;
  body: string;
  frontmatter: string;
  bodyStartLine: number;
  mtimeMs: number;
  fm: Record<string, unknown>;
  links: ParsedLink[];
  assets: string[];
  tags: string[];
  props: Record<string, string>;
  aliases: string[];
  anchors: NoteAnchor[];
  dateMs: number;
  banner: string | null;
  tasks: Task[];
  cards: Card[];
  deck: Deck | null;
  trackers: Tracker[];
  routines: RoutineBlock[];
  /** A `.tex` note's words (shared/tex.ts texProse), what the server's index
   *  files it under; null for markdown, whose body is its words. */
  prose: string | null;
  /** Lazily prose-stripped body — the snippet source, computed once. */
  flat: string | null;
}

/** One attachment: anything in the vault that is not a note. */
export interface PocketAsset {
  path: string;
  size: number;
  mtimeMs: number;
}

const MAX_SNIPPET_SOURCE_CHARS = 128 * 1024;
const SEARCH_LIMIT = 50;
const PROP_VALUES_MAX = 20;

export class PocketIndex {
  readonly notes = new Map<string, PocketNote>();
  readonly assets = new Map<string, PocketAsset>();

  /** lowercased basename (no extension) → the notes that answer to it. */
  private readonly byName = new Map<string, Set<string>>();
  private readonly byPathLower = new Map<string, string>();
  private readonly byAlias = new Map<string, Set<string>>();
  private readonly assetsByName = new Map<string, Set<string>>();
  /** the reverse link index: one key per spelling a link may arrive as. */
  private readonly linkSources = new Map<string, Set<string>>();

  private mini = new MiniSearch<{ path: string; title: string; body: string; tags: string; aliases: string }>({
    idField: "path",
    fields: ["title", "body", "tags", "aliases"],
    searchOptions: { prefix: true, fuzzy: 0.2, boost: { title: 6, aliases: 4, tags: 2 } },
    // shared/fold.ts, the same fold the server files and asks under — a
    // pointed Arabic note and a plain Arabic query are one key.
    processTerm: (term) => foldTerm(term) || null,
    autoVacuum: false,
  });

  // ── writing ───────────────────────────────────────────────────────────────

  put(path: string, content: string, mtimeMs: number): PocketNote {
    this.remove(path);
    const parts = isTexPath(path) ? texParts(content) : { ...splitFrontmatter(content), tagSource: null as string | null, prose: null as string | null };
    // A `.tex` note keeps its frontmatter in a comment block (and in
    // `\astrolabe{}` pairs): the same text the server's reader parses
    // (shared/tex.ts texFrontmatterText), read by the pocket's YAML reader.
    const fm = isTexPath(path) ? readFrontmatter(`---\n${parts.frontmatter}\n---\n`) : readFrontmatter(content);
    const title = stripBidiControls(noteTitleOf(path));
    const record: PocketNote = {
      path,
      title,
      content,
      body: parts.body,
      frontmatter: parts.frontmatter,
      bodyStartLine: parts.bodyStartLine,
      mtimeMs,
      fm,
      links: isTexPath(path) ? texLinks(content) : parseLinks(parts.body),
      assets: parseAssets(parts.body, path),
      // A `.tex` note's tags are its frontmatter's only, as on the server: a
      // `#` in LaTeX is a macro parameter, not a tag.
      tags: parseTags(parts.tagSource ?? parts.body, parts.frontmatter),
      props: scalarProps(fm),
      aliases: parseAliases(fm),
      anchors: noteAnchors(path, content),
      // The server's ladder, rung by rung: an unreadable `date:` falls to `created:`.
      dateMs: parseFmDate(fm.date) ?? parseFmDate(fm.created) ?? parseFmDate(fm.published) ?? idStampMs(fm.id) ?? mtimeMs,
      banner: bannerOf(fm),
      tasks: scanTasks(content),
      cards: scanCards(content),
      deck: deckOf(content, path, title),
      trackers: scanTrackers(parts.body),
      routines: scanRoutines(parts.body),
      prose: parts.prose,
      flat: null,
    };
    this.notes.set(path, record);
    this.byPathLower.set(path.toLowerCase(), path);
    add(this.byName, title.toLowerCase(), path);
    for (const alias of record.aliases) add(this.byAlias, alias.toLowerCase(), path);
    for (const link of record.links) {
      const { key, asPath } = linkKeys(link.target);
      add(this.linkSources, key, path);
      if (asPath !== key) add(this.linkSources, asPath, path);
    }
    this.mini.add({
      path,
      title,
      // A `.tex` note is indexed on its PROSE, as on the server: the raw source
      // would match "begin" and "usepackage" and a `% [[link]]` comment.
      body: record.prose ?? record.body,
      tags: record.tags.join(" "),
      aliases: record.aliases.join(" "),
    });
    return record;
  }

  putAsset(path: string, size: number, mtimeMs: number): void {
    this.assets.set(path, { path, size, mtimeMs });
    add(this.assetsByName, baseName(path).toLowerCase(), path);
  }

  remove(path: string): void {
    const record = this.notes.get(path);
    if (record) {
      this.notes.delete(path);
      this.byPathLower.delete(path.toLowerCase());
      drop(this.byName, record.title.toLowerCase(), path);
      for (const alias of record.aliases) drop(this.byAlias, alias.toLowerCase(), path);
      for (const link of record.links) {
        const { key, asPath } = linkKeys(link.target);
        drop(this.linkSources, key, path);
        if (asPath !== key) drop(this.linkSources, asPath, path);
      }
      try {
        this.mini.discard(path);
      } catch {
        // minisearch throws when the id is not there; removing a note twice is
        // an ordinary race between a delete and a pull, not a fault.
      }
      return;
    }
    const asset = this.assets.get(path);
    if (asset) {
      this.assets.delete(path);
      drop(this.assetsByName, baseName(path).toLowerCase(), path);
    }
  }

  // ── the tree ──────────────────────────────────────────────────────────────

  tree(): TreeNode {
    const root: TreeNode = { name: "", path: "", type: "folder", children: [] };
    const folders = new Map<string, TreeNode>([["", root]]);

    const folderFor = (dir: string): TreeNode => {
      const existing = folders.get(dir);
      if (existing) return existing;
      const slash = dir.lastIndexOf("/");
      const parent = folderFor(slash === -1 ? "" : dir.slice(0, slash));
      const node: TreeNode = { name: slash === -1 ? dir : dir.slice(slash + 1), path: dir, type: "folder", children: [] };
      parent.children?.push(node);
      folders.set(dir, node);
      return node;
    };

    for (const path of [...this.notes.keys()].sort()) {
      const slash = path.lastIndexOf("/");
      folderFor(slash === -1 ? "" : path.slice(0, slash)).children?.push({
        name: slash === -1 ? path : path.slice(slash + 1),
        path,
        type: "file",
      });
    }
    for (const asset of [...this.assets.values()].sort((a, b) => a.path.localeCompare(b.path))) {
      const slash = asset.path.lastIndexOf("/");
      folderFor(slash === -1 ? "" : asset.path.slice(0, slash)).children?.push({
        name: slash === -1 ? asset.path : asset.path.slice(slash + 1),
        path: asset.path,
        type: "file",
        attachment: {
          kind: attachmentKindOf(asset.path),
          ext: extensionOf(asset.path).replace(/^\./, ""),
          size: asset.size,
        },
      });
    }
    sortTree(root);
    return root;
  }

  // ── resolution ────────────────────────────────────────────────────────────

  /** A wikilink target → a note path, by the server's rule: exact vault path
   *  first (with or without an extension), then basename, then alias, shortest
   *  path winning. shared/noteParse.ts::linkKeys is the key both sides file
   *  and look up under. */
  resolve(name: string): string | null {
    const { key, asPath } = linkKeys(name);
    if (!key) return null;
    for (const candidate of noteCandidates(asPath)) {
      const hit = this.byPathLower.get(candidate.toLowerCase());
      if (hit) return hit;
    }
    const byName = this.byName.get(baseName(key));
    if (byName && byName.size > 0) return pickShortest(byName);
    const byAlias = this.byAlias.get(key);
    if (byAlias && byAlias.size > 0) return pickShortest(byAlias);
    return null;
  }

  /** An `![[embed]]` or a markdown image destination → a vault path. Notes
   *  resolve as links do; everything else is matched against the attachments. */
  resolveAsset(name: string): string | null {
    const clean = name.split("#")[0]?.trim() ?? "";
    if (!clean) return null;
    if (this.assets.has(clean)) return clean;
    const byPath = [...this.assets.keys()].find((p) => p.toLowerCase() === clean.toLowerCase());
    if (byPath) return byPath;
    const byName = this.assetsByName.get(baseName(clean).toLowerCase());
    if (byName && byName.size > 0) return pickShortest(byName);
    return null;
  }

  aliasEntries(): AliasEntry[] {
    const out: AliasEntry[] = [];
    for (const record of this.notes.values()) {
      for (const alias of record.aliases) out.push({ alias, path: record.path, title: record.title });
    }
    return out.sort((a, b) => a.alias.localeCompare(b.alias));
  }

  // ── search ────────────────────────────────────────────────────────────────

  private flat(record: PocketNote): string {
    if (record.flat === null) {
      record.flat = (record.prose ?? stripMarkdown(record.body.slice(0, MAX_SNIPPET_SOURCE_CHARS))).replace(/\s+/g, " ").trim();
    }
    return record.flat;
  }

  /** The filter half of a query (`tag:`, `path:`, `linkto:`, `prop:`…) as one
   *  predicate. Operators the pocket cannot answer (`in:books`) narrow to
   *  nothing rather than being ignored — a question with no results is honest,
   *  a question quietly dropped is not. */
  private compile(filters: readonly QueryFilter[]): ((record: PocketNote) => boolean) | null {
    if (searchScope(filters) === "none" || searchScope(filters) === "books") return null;
    const tests: ((record: PocketNote) => boolean)[] = [];
    for (const filter of filters) {
      const value = filter.value.toLowerCase();
      let test: (record: PocketNote) => boolean;
      switch (filter.kind) {
        case "tag":
          test = (r) => r.tags.some((t) => t === value || t.startsWith(`${value}/`));
          break;
        case "path":
          test = (r) => r.path.toLowerCase().includes(value);
          break;
        case "prop": {
          const key = (filter.key ?? "").toLowerCase();
          test = (r) => (value ? (r.props[key] ?? "").toLowerCase().includes(value) : key in r.props);
          break;
        }
        case "before":
          test = (r) => r.dateMs < filter.ms;
          break;
        case "after":
          test = (r) => r.dateMs > filter.ms;
          break;
        case "linkto": {
          const target = this.resolve(filter.value);
          const sources = target ? new Set(this.notesLinkingTo(target)) : new Set<string>();
          test = (r) => sources.has(r.path);
          break;
        }
        case "linkfrom": {
          const source = this.resolve(filter.value);
          const record = source ? this.notes.get(source) : null;
          const targets = new Set(
            (record?.links ?? []).map((l) => this.resolve(l.target)).filter((p): p is string => p !== null),
          );
          test = (r) => targets.has(r.path);
          break;
        }
        case "is":
          test = (r) => (value === "task" ? r.tasks.length > 0 : value === "deck" ? r.deck !== null : true);
          break;
        default:
          test = () => true;
      }
      tests.push(filter.negated ? (r) => !test(r) : test);
    }
    return (record) => tests.every((t) => t(record));
  }

  search(query: string): SearchHit[] {
    const parsed = parseSearchQuery(query);
    const keep = this.compile(parsed.filters);
    if (keep === null) return [];
    const bare = parsed.text.trim();
    const terms = bare ? [bare, ...foldQuery(bare).split(" ").filter(Boolean)] : [];

    let rows: { record: PocketNote; score: number }[];
    if (!bare) {
      // The server's order for a filter-only query: newest by the note's own
      // date, then by path (indexer.ts filteredNotes).
      rows = [...this.notes.values()]
        .filter(keep)
        .sort((a, b) => b.dateMs - a.dateMs || a.path.localeCompare(b.path))
        .slice(0, SEARCH_LIMIT)
        .map((record) => ({ record, score: 0 }));
    } else {
      const folded = foldQuery(bare);
      rows = [];
      for (const hit of this.mini.search(folded)) {
        const record = this.notes.get(String(hit.id));
        if (!record || !keep(record)) continue;
        rows.push({ record, score: hit.score });
      }
      // The server's tier re-rank: an exact title, then a title that starts
      // with the query, then everything else — so typing a note's name puts
      // that note at the top even when a long note mentions the words more.
      const tierOf = (record: PocketNote): number => {
        const title = foldQuery(record.title);
        if (title === folded) return 0;
        return title.startsWith(folded) ? 1 : 2;
      };
      rows.sort((a, b) => tierOf(a.record) - tierOf(b.record) || b.score - a.score);
      rows = rows.slice(0, SEARCH_LIMIT);
    }

    return rows.map(({ record, score }) => {
      const alias = record.aliases.find((a) => terms.length > 0 && findAnyMatches(a, terms, 1).length > 0);
      const hit: SearchHit = {
        path: record.path,
        title: record.title,
        snippet: terms.length > 0 ? snippetOf(this.flat(record), terms) : snippetOf(this.flat(record), []),
        score,
      };
      if (alias && findAnyMatches(record.title, terms, 1).length === 0) hit.alias = alias;
      return hit;
    });
  }

  searchMatches(path: string, query: string): SearchMatch[] {
    const record = this.notes.get(path);
    if (!record) return [];
    const parsed = parseSearchQuery(query);
    const bare = parsed.text.trim();
    if (!bare) return [];
    const terms = [bare, ...foldQuery(bare).split(" ").filter(Boolean)];
    const out: SearchMatch[] = [];
    const lines = record.content.split("\n");
    for (let i = 0; i < lines.length && out.length < 200; i++) {
      const raw = lines[i] ?? "";
      if (findAnyMatches(raw, terms, 1).length === 0) continue;
      const context = cleanContextLine(raw, terms);
      if (!context) continue;
      const at = findAnyMatches(context, terms, 1)[0];
      const windowed = at ? windowAround(context, at.start, at.end - at.start, 80) : context;
      out.push({ line: i + 1, text: markHtml(escapeHtml(windowed), terms) });
    }
    return out;
  }

  queryNotes(
    query: string,
    sort: { key: "date" | "modified" | "title" | "path" | "relevance"; dir: "asc" | "desc" },
    limit: number,
  ): QueryHit[] {
    const parsed = parseSearchQuery(query);
    const keep = this.compile(parsed.filters);
    if (keep === null) return [];
    const bare = parsed.text.trim();
    let records = [...this.notes.values()].filter(keep);
    if (bare) {
      const allowed = new Set(this.search(query).map((h) => h.path));
      records = records.filter((r) => allowed.has(r.path));
    }
    const sign = sort.dir === "asc" ? 1 : -1;
    records.sort((a, b) => {
      switch (sort.key) {
        case "modified":
          return sign * (a.mtimeMs - b.mtimeMs);
        case "title":
          return sign * a.title.localeCompare(b.title);
        case "path":
          return sign * a.path.localeCompare(b.path);
        default:
          return sign * (a.dateMs - b.dateMs);
      }
    });
    return records.slice(0, limit).map((record) => ({
      path: record.path,
      title: record.title,
      dateMs: record.dateMs,
      mtimeMs: record.mtimeMs,
      tags: record.tags,
      props: record.props,
      excerpt: this.flat(record).slice(0, 200),
    }));
  }

  queryPaths(query: string): string[] {
    const parsed = parseSearchQuery(query);
    const keep = this.compile(parsed.filters);
    if (keep === null) return [];
    const bare = parsed.text.trim();
    const base = [...this.notes.values()].filter(keep).map((r) => r.path);
    if (!bare) return base;
    const allowed = new Set(this.search(query).map((h) => h.path));
    return base.filter((p) => allowed.has(p));
  }

  // ── links ─────────────────────────────────────────────────────────────────

  /** The reverse index's superset for one target, then verified by resolving
   *  each candidate's link — the server's two-step, so a basename shared by
   *  two notes never reports a backlink into the wrong one. */
  notesLinkingTo(target: string): string[] {
    const keys = new Set<string>([
      stripNoteExt(target).toLowerCase(),
      baseName(stripNoteExt(target)).toLowerCase(),
    ]);
    const record = this.notes.get(target);
    if (record) keys.add(record.title.toLowerCase());
    for (const alias of record?.aliases ?? []) keys.add(alias.toLowerCase());
    const out = new Set<string>();
    for (const key of keys) for (const source of this.linkSources.get(key) ?? []) out.add(source);
    return [...out].filter((source) => {
      const from = this.notes.get(source);
      return (from?.links ?? []).some((link) => this.resolve(link.target) === target);
    });
  }

  backlinks(target: string): Backlink[] {
    const out: Backlink[] = [];
    for (const source of this.notesLinkingTo(target)) {
      const record = this.notes.get(source);
      if (!record) continue;
      const lines = record.content.split("\n");
      for (const link of record.links) {
        if (this.resolve(link.target) !== target) continue;
        const idx = link.lineIdx + record.bodyStartLine;
        const bare = cleanContextLine(lines[idx] ?? "", [link.target]);
        const context = contextProse(bare).length >= 12 ? bare : expandedContext(lines, idx, [link.target]);
        out.push({ path: record.path, title: record.title, context, line: idx + 1 });
      }
    }
    return out;
  }

  graph(): GraphData {
    const nodes = [...this.notes.values()].map((record) => ({
      id: record.path,
      title: record.title,
      links: 0,
      tags: record.tags,
    }));
    const index = new Map(nodes.map((n) => [n.id, n]));
    const edges: GraphEdge[] = [];
    const seen = new Set<string>();
    for (const record of this.notes.values()) {
      for (const link of record.links) {
        const target = this.resolve(link.target);
        if (!target || target === record.path) continue;
        const key = `${record.path}\u0000${target}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ source: record.path, target });
        const from = index.get(record.path);
        const to = index.get(target);
        if (from) from.links++;
        if (to) to.links++;
      }
    }
    return { nodes, edges };
  }

  graphAround(path: string): GraphData {
    const whole = this.graph();
    const near = new Set<string>([path]);
    for (const edge of whole.edges) {
      if (edge.source === path) near.add(edge.target);
      if (edge.target === path) near.add(edge.source);
    }
    return {
      nodes: whole.nodes.filter((n) => near.has(n.id)),
      edges: whole.edges.filter((e) => near.has(e.source) && near.has(e.target)),
    };
  }

  /** Notes that share the most tags and terms with this one — the "nearby"
   *  rail. Tag overlap first, because a shared tag is a statement and a shared
   *  word is a coincidence. */
  nearby(path: string, limit = 8): NearbyHit[] {
    const record = this.notes.get(path);
    if (!record) return [];
    const mine = new Set(record.tags);
    const out: NearbyHit[] = [];
    for (const other of this.notes.values()) {
      if (other.path === path) continue;
      const shared = other.tags.filter((t) => mine.has(t));
      if (shared.length === 0) continue;
      out.push({ path: other.path, title: other.title, score: shared.length, terms: shared });
    }
    return out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
  }

  // ── shelves ───────────────────────────────────────────────────────────────

  tags(): TagCount[] {
    const counts = new Map<string, number>();
    for (const record of this.notes.values()) {
      for (const tag of record.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  props(): PropCount[] {
    const keys = new Map<string, Map<string, number>>();
    for (const record of this.notes.values()) {
      for (const [key, value] of Object.entries(record.props)) {
        if (key === "tags" || key === "tag") continue;
        const values = keys.get(key) ?? new Map<string, number>();
        values.set(value, (values.get(value) ?? 0) + 1);
        keys.set(key, values);
      }
    }
    return [...keys]
      .map(([key, values]) => ({
        key,
        count: [...values.values()].reduce((a, b) => a + b, 0),
        values: [...values]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
          .slice(0, PROP_VALUES_MAX),
      }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  }

  tasks(): TaskMeta[] {
    const out: TaskMeta[] = [];
    for (const record of this.notes.values()) {
      for (const task of record.tasks) out.push({ path: record.path, title: record.title, tags: record.tags, task });
    }
    return out;
  }

  /** What lives under a tracker's `folder:` — the card's door into the work's
   *  own notes. The server's `folderFacts`, minus the visitor scrubbing a
   *  one-reader vault has no use for. */
  private folderFacts(folder: string | null): Pick<TrackerMeta, "folder" | "folderNotes" | "folderNote" | "folderRecent"> {
    if (folder === null) return { folder: null, folderNotes: 0, folderNote: null, folderRecent: [] };
    const prefix = `${folder}/`;
    const base = folder.split("/").pop() ?? folder;
    let count = 0;
    let own: string | null = null;
    const recent: { path: string; title: string; mtimeMs: number }[] = [];
    for (const [p, record] of this.notes) {
      if (!p.startsWith(prefix)) continue;
      count++;
      if (p === `${prefix}${base}.md` || (own === null && p === `${prefix}index.md`)) own = p;
      recent.push({ path: p, title: record.title, mtimeMs: record.mtimeMs });
    }
    recent.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return { folder, folderNotes: count, folderNote: own, folderRecent: recent.slice(0, 1) };
  }

  trackers(): TrackerMeta[] {
    const out: TrackerMeta[] = [];
    for (const record of this.notes.values()) {
      let index = 0;
      for (const tracker of record.trackers) {
        out.push({
          path: record.path,
          index: index++,
          started: tracker.started,
          finished: tracker.finished,
          season: tracker.season,
          notes: tracker.notes,
          ...this.folderFacts(tracker.folder),
          step: tracker.step,
          pace: tracker.pace,
          due: tracker.due,
          file: tracker.file,
          sessions: tracker.sessions,
          title: tracker.title,
          noteTitle: record.title,
          kind: tracker.kind,
          icon: tracker.icon,
          percent: tracker.percent,
          done: tracker.done,
          total: tracker.total,
          unit: tracker.unit,
          status: tracker.status,
          rating: tracker.rating,
          cover: tracker.cover === null ? null : this.resolveAsset(tracker.cover),
          updatedMs: record.mtimeMs,
        });
      }
    }
    return out.sort(
      (a, b) => b.updatedMs - a.updatedMs || a.path.localeCompare(b.path) || a.title.localeCompare(b.title),
    );
  }

  routines(): RoutineMeta[] {
    const out: RoutineMeta[] = [];
    for (const record of this.notes.values()) {
      for (const block of record.routines) {
        out.push({
          path: record.path,
          index: block.index,
          noteTitle: record.title,
          plan: block.plan,
          entries: block.entries,
          // A pocket vault has no configured templates folder to consult, so
          // nothing is marked a template. Saying "not a template" of every row
          // is the honest shape of "this instance has no templates folder".
          template: false,
          updatedMs: record.mtimeMs,
        });
      }
    }
    return out.sort((a, b) => b.updatedMs - a.updatedMs || a.path.localeCompare(b.path) || a.index - b.index);
  }

  /** Every star outside a deck note, filed under its note's top folder — the
   *  implicit deck, built exactly as the server builds it. */
  private everythingElseCards(): DeckCard[] {
    const out: DeckCard[] = [];
    const list = [...this.notes.values()]
      .filter((r) => r.cards.length > 0 && r.deck === null)
      .sort((a, b) => a.path.localeCompare(b.path));
    for (const record of list) {
      const section = record.path.includes("/") ? (record.path.split("/")[0] ?? null) : null;
      for (const star of deckCardsOf(record.cards, record.path, "basic")) out.push({ ...star, section });
    }
    return out;
  }

  /** The decks, counted for `today`, with the implicit "everything else" deck
   *  last — present even when empty, so the shelf always has somewhere to
   *  point a reader whose vault holds cards but no fence. */
  decks(today: string): DeckMeta[] {
    const out = [...this.notes.values()]
      .filter((r) => r.deck !== null)
      .sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path))
      .map((r) => deckMeta(r.deck as Deck, (r.deck as Deck).cards, false, today));
    const rest = this.everythingElseCards();
    out.push(
      deckMeta(
        {
          path: EVERYTHING_ELSE,
          title: "",
          icon: null,
          kind: "basic",
          newPerDay: DEFAULT_NEW_PER_DAY,
          steps: DEFAULT_STEPS,
          tags: [],
          sections: [],
          cards: rest,
        },
        rest,
        true,
        today,
      ),
    );
    return out;
  }

  deckCards(path: string, section: string | null): DeckCard[] | null {
    let stars: DeckCard[];
    if (path === EVERYTHING_ELSE) stars = this.everythingElseCards();
    else {
      const record = this.notes.get(path);
      if (!record || record.deck === null) return null;
      stars = record.deck.cards;
    }
    return section === null ? stars : stars.filter((star) => star.section === section);
  }
}

// ── LaTeX notes ─────────────────────────────────────────────────────────────

/** A `.tex` note's parts in the markdown reader's shape: the body is the whole
 *  file (its lines are already absolute), the frontmatter is the comment block
 *  plus `\astrolabe{}` pairs, and nothing in the body is a tag. */
function texParts(content: string): { body: string; frontmatter: string; bodyStartLine: number; tagSource: string | null; prose: string | null } {
  const doc = parseTex(content);
  return { body: content, frontmatter: texFrontmatterText(doc), bodyStartLine: 0, tagSource: "", prose: texProse(doc) };
}

/** A `.tex` note's wikilinks — `\note{…}` and the `% [[…]]` comment form —
 *  as the server's reader files them (server/texNote.ts). `\input` edges are
 *  the server's alone: they resolve local-first against the filesystem. */
function texLinks(content: string): ParsedLink[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const out: ParsedLink[] = [];
  const seen = new Set<string>();
  for (const link of parseTex(content).links) {
    if (link.kind !== "note" && link.kind !== "comment") continue;
    const target = (link.anchor ? `${link.target}#${link.anchor}` : link.target).trim();
    if (!target || seen.has(`${target}\u0000${link.line}`)) continue;
    seen.add(`${target}\u0000${link.line}`);
    out.push({ target, line: link.context || (lines[link.line - 1] ?? "").trim(), lineIdx: Math.max(0, link.line - 1) });
  }
  return out;
}

// ── small shared helpers ────────────────────────────────────────────────────

function add(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}

function drop(map: Map<string, Set<string>>, key: string, value: string): void {
  const set = map.get(key);
  if (!set) return;
  set.delete(value);
  if (set.size === 0) map.delete(key);
}

export function baseName(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

function deckMeta(deck: Deck, stars: DeckCard[], implicit: boolean, today: string): DeckMeta {
  const sections = new Map<string, { name: string; total: number; due: number }>();
  let fresh = 0;
  let due = 0;
  for (const star of stars) {
    if (star.schedule === null) fresh++;
    else if (isDue(star.schedule, today)) due++;
    if (star.section !== null) {
      const row = sections.get(star.section) ?? { name: star.section, total: 0, due: 0 };
      row.total++;
      if (star.schedule !== null && isDue(star.schedule, today)) row.due++;
      sections.set(star.section, row);
    }
  }
  return {
    path: deck.path,
    title: deck.title,
    icon: deck.icon,
    kind: deck.kind,
    tags: deck.tags,
    newPerDay: deck.newPerDay,
    steps: deck.steps,
    implicit,
    counts: { total: stars.length, new: fresh, due },
    sections: [...sections.values()],
  };
}

/** Is this vault path a note (as opposed to an attachment)? The one rule,
 *  from shared/noteFormat.ts. */
export function isNote(path: string): boolean {
  return isNotePath(path);
}

export type { AttachmentMode };
