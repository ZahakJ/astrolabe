// The index's read side: search, queries, cards and decks, the graph,
// backlinks, tags and properties, snippets. Moved out of server/indexer.ts,
// which keeps the store these read.

import type { Backlink, CardMeta, GraphData, GraphEdge, Mention, OnThisDayHit, PropCount, QueryHit, SearchHit, SearchMatch, TagCount, TaskMeta, TimelineNote } from "../../shared/types.ts";
import { DAILY_FORMAT_DEFAULT } from "../../shared/periodic.ts";
import { DEFAULT_NEW_PER_DAY, DEFAULT_STEPS, EVERYTHING_ELSE, deckCardsOf, type Deck, type DeckCard, type DeckMeta } from "../../shared/decks.ts";
import { capturedLines, dayOfNote, publishedDayOf, voiceMarks, type DailyRule } from "../../shared/noteDays.ts";
import { closesFence, fenceOpener, type Fence } from "../../shared/fences.ts";
import { isNoteVisibleToVisitor, languageHidden, type FilterLang } from "./language.ts";
import { byAlias, byName, makeSnippet, mini, notes, publishedSet, type NoteRecord } from "../indexer.ts";
import { parseSearchQuery, searchScope, type ParsedQuery, type QueryFilter } from "../../shared/searchQuery.ts";
import { cleanLabelEntry, tagKey, type TagLabelMap } from "../../shared/tagLabels.ts";
import { cleanContextLine, contextProse, expandedContext, stripMarkdown } from "../../shared/prose.ts";
import { dailyFolder, getSettings } from "../settings.ts";
import { excludedTags } from "../site.ts";
import { findAnyMatches, findMatches, foldQuery, foldTerm } from "../../shared/fold.ts";
import { isDue } from "../../shared/srs.ts";
import { linkCandidates, resolveLink, resolveXref, twinOf } from "./resolve.ts";
import { markHtml, windowAround } from "../../shared/snippet.ts";
import { noteTitleOf, stripNoteExt } from "../../shared/noteFormat.ts";
import path from "node:path";
import { postBasics } from "./posts.ts";
import { stripBidiControls } from "../../shared/bidi.ts";
import { templateMatcher } from "./folders.ts";

/** How a caller lets the operator layer speak the reader's own vocabulary.
 *  `tag:برمجيات` has to reach `#software` for the same reason `/topic/برمجيات`
 *  does — a reader copies the word off the chip in front of them — and the
 *  labels live in `server/tagLabels.ts`, which imports THIS module. So the
 *  resolver is handed in rather than imported, and the cycle never forms. */
export interface SearchOptions {
  canonicalTag?: (value: string) => string | null;
  /** The free-TEXT half of the same favour: `expandTagQuery` appends a
   *  canonical tag whenever the words hold one of its localised labels. It is
   *  applied after the operators are peeled off, never before — run over the
   *  raw string it reads `tag:برمجيات` as prose and appends `software` as a
   *  loose term, widening the very query the operator was narrowing. */
  expandTerms?: (text: string) => string;
}

/** Turn the parsed operators into one predicate over records.
 *
 *  Everything expensive happens HERE, once per query, not once per note: a
 *  `linkto:` filter resolves its target and materialises the candidate set
 *  from the reverse index before the walk starts, so a link operator over a
 *  three-thousand-note vault is a set membership test rather than forty
 *  thousand `resolveLink` calls. A filter naming a note that does not exist
 *  compiles to "match nothing", which is the honest answer — `linkto:Ghost` is
 *  a question with no results, not a question to ignore. */
function compileFilters(
  filters: readonly QueryFilter[],
  publishedOnly: boolean,
  lang: FilterLang,
  opts: SearchOptions,
): ((record: NoteRecord) => boolean) | null {
  if (filters.length === 0) return null;
  const tests: ((record: NoteRecord) => boolean)[] = [];
  for (const filter of filters) {
    let test: (record: NoteRecord) => boolean;
    switch (filter.kind) {
      case "tag": {
        // Nested tags are a tree: `tag:zettel` means the topic and everything
        // filed under it, exactly as the sidebar's own tag filter reads it.
        const want = opts.canonicalTag?.(filter.value) ?? filter.value;
        const prefix = `${want}/`;
        test = (r) => r.tags.some((tag) => tag === want || tag.startsWith(prefix));
        break;
      }
      case "path":
        // Substring, not prefix: `path:recipes` finds `Cooking/Recipes/Dal.md`
        // as readily as `Recipes/Dal.md`, and a reader who wants the anchor
        // types the leading folder.
        test = (r) => r.path.toLowerCase().includes(filter.value);
        break;
      case "is":
        test = filter.value === "published" ? (r) => r.published : (r) => r.page;
        break;
      case "before":
        test = (r) => r.dateMs < filter.ms;
        break;
      case "after":
        // Inclusive from the start of the named day, while `before` is
        // exclusive of it — so `after:2024 before:2025` is exactly 2024.
        test = (r) => r.dateMs >= filter.ms;
        break;
      case "linkto": {
        const target = resolveLink(filter.value, publishedOnly, lang);
        if (target === null) {
          test = () => false;
          break;
        }
        const sources = new Set(
          linkCandidates(target).filter((candidate) => {
            const record = notes.get(candidate);
            return (
              record !== undefined &&
              record.links.some((l) => resolveLink(l.target, publishedOnly, lang) === target)
            );
          }),
        );
        test = (r) => sources.has(r.path);
        break;
      }
      case "prop": {
        // Presence when no value was given; else the folded value, whole or
        // as one item of a list ("reading" matches `status: reading` and
        // `tags-like: done, reading`). Folded like search terms, so Arabic
        // letter forms and diacritics do not decide a match.
        const key = filter.key ?? "";
        const want = foldTerm(filter.value);
        test = (r) => {
          const have = r.props[key];
          if (have === undefined) return false;
          if (want === "") return true;
          return have.split(/,\s*/).some((part) => foldTerm(part.toLowerCase()) === want) || foldTerm(have.toLowerCase()) === want;
        };
        break;
      }
      case "linkfrom": {
        const source = resolveLink(filter.value, publishedOnly, lang);
        const record = source === null ? undefined : notes.get(source);
        const targets = new Set<string>();
        for (const link of record?.links ?? []) {
          const to = resolveLink(link.target, publishedOnly, lang);
          if (to !== null) targets.add(to);
        }
        test = (r) => targets.has(r.path);
        break;
      }
      case "in":
        // Not a predicate over a note: `in:` picks WHICH index answers, and
        // search() has already read it (searchScope) and returned nothing
        // when notes were excluded. Down here every note passes — which is
        // also what makes a lone `in:notes` a real query that lists the
        // vault newest first, like a lone `tag:` does.
        test = () => true;
        // Negation was folded into the scope above; `-in:books` is "notes",
        // not "every note that is not in books" (all of them, twice over).
        tests.push(test);
        continue;
    }
    tests.push(filter.negated ? (r) => !test(r) : test);
  }
  return (record) => tests.every((t) => t(record));
}

/** The ```query fence's answer: every note the operators keep (and, when
 *  words were given, that minisearch finds), sorted as asked, capped as
 *  asked — a report, not a sidebar glance, so no fifty-row ceiling. Scoped
 *  exactly like search(): a visitor's fence on a published note lists
 *  published notes only. */
/** Notes that NAME `targetPath` — its title or an alias, as prose — without
 *  linking it: the backlinks panel's "unlinked mentions". Whole words only
 *  (a letter on either side disqualifies), never inside a `[[link]]`, inline
 *  code or a fence, never the note itself or a template; folded like search,
 *  so a pointed Arabic title finds its plain spelling. Capped so a title
 *  that is also an everyday word does not list the vault. */
export function mentions(targetPath: string, limit = 60): Mention[] {
  const target = notes.get(targetPath);
  if (!target) return [];
  const needles = [target.title, ...target.aliases].map((n) => n.trim()).filter((n) => n.length >= 2);
  if (needles.length === 0) return [];
  const isTemplate = templateMatcher();
  const out: Mention[] = [];
  const wordish = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}_]/u.test(ch);
  // CANDIDATES FIRST. The line walk below folds every character it looks
  // at; over a large vault, on every panel open, that was a full-vault scan
  // on the event loop. minisearch already holds every folded word, so the
  // notes that carry ALL of a needle's words are asked for first and only
  // they are walked — the same trick `linkto:` plays with the reverse index.
  const candidates = new Set<string>();
  for (const needle of needles) {
    for (const hit of mini.search(needle, { combineWith: "AND", prefix: false, fuzzy: false })) candidates.add(hit.id as string);
  }
  for (const path of candidates) {
    const record = notes.get(path);
    if (!record) continue;
    if (record.path === targetPath || isTemplate(record.path)) continue;
    // A note that already links the target may still mention it in prose
    // elsewhere; only the mentions INSIDE links are skipped, below.
    const lines = record.body.split("\n");
    let fence: Fence | null = null;
    for (let i = 0; i < lines.length && out.length < limit; i++) {
      const line = lines[i];
      if (fence) {
        if (closesFence(line, fence)) fence = null;
        continue;
      }
      const opened = fenceOpener(line);
      if (opened) {
        fence = opened;
        continue;
      }
      // Spans no mention may sit in: wikilinks, markdown links' targets, code.
      const dead: { from: number; to: number }[] = [];
      for (const m of line.matchAll(/!?\[\[[^\]]*\]\]|`[^`]*`|\]\([^)]*\)/g)) dead.push({ from: m.index ?? 0, to: (m.index ?? 0) + m[0].length });
      let hitThisLine = false;
      for (const needle of needles) {
        if (hitThisLine) break;
        for (const match of findMatches(line, needle, 8)) {
          if (dead.some((d) => match.start < d.to && match.end > d.from)) continue;
          if (wordish(line[match.start - 1]) || wordish(line[match.end])) continue;
          out.push({
            path: record.path,
            title: record.title,
            line: fileLine(record, i),
            context: cleanContextLine(line),
            phrase: line.slice(match.start, match.end),
            start: match.start,
            end: match.end,
          });
          hitThisLine = true;
          break;
        }
      }
    }
    if (out.length >= limit) break;
  }
  return out;
}

/** True when the vault holds a note at `path` — the mention route's guard. */
export function hasNote(path: string): boolean {
  return notes.has(path);
}

/** The link the mention route writes: the title when the basename is unique
 *  in the vault, else the path without its extension, so the link resolves
 *  to THIS note and not to a namesake. */
export function linkSpellingFor(targetPath: string): string {
  const record = notes.get(targetPath);
  if (!record) return targetPath.replace(/\.(md|tex|latex)$/i, "");
  const candidates = byName.get(record.title.toLowerCase());
  if (candidates && candidates.size > 1) return targetPath.replace(/\.(md|tex|latex)$/i, "");
  return record.title;
}

/** Every task in the vault, open and done, newest-touched note first. The
 *  fence and the page filter; templates are skipped as everywhere. */
export function tasks(): TaskMeta[] {
  const out: TaskMeta[] = [];
  const isTemplate = templateMatcher();
  for (const record of notes.values()) {
    if (record.tasks.length === 0 || isTemplate(record.path)) continue;
    for (const task of record.tasks) out.push({ path: record.path, title: record.title, tags: record.tags, task });
  }
  return out;
}

/** Every flashcard in the vault OUTSIDE a deck note, in note
 *  order, newest-touched note first; templates skipped as everywhere. The
 *  implicit "Everything else" deck and the Orbits shelf's alias
 *  read this; a deck's stars are its own (deckCards). */
export function cards(): CardMeta[] {
  const out: CardMeta[] = [];
  const isTemplate = templateMatcher();
  const list = [...notes.values()].sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path));
  for (const record of list) {
    if (record.cards.length === 0 || record.deck !== null || isTemplate(record.path)) continue;
    for (const card of record.cards) out.push({ path: record.path, title: record.title, card });
  }
  return out;
}

/** The top folder a note files under, for the implicit deck's
 *  sections; a note at the root is its own section, by title. */
function topFolderOf(record: NoteRecord): string {
  const slash = record.path.indexOf("/");
  return slash === -1 ? record.title : record.path.slice(0, slash);
}

/** The stars of the implicit "Everything else" deck: every card
 *  outside a deck note, read as a basic deck, each star's section
 *  its note's top folder so the shelf can study one folder. Path order, so
 *  a session walks the vault the way the tree shows it. */
function everythingElseCards(): DeckCard[] {
  const out: DeckCard[] = [];
  const isTemplate = templateMatcher();
  const list = [...notes.values()].filter((r) => r.cards.length > 0 && r.deck === null && !isTemplate(r.path)).sort((a, b) => a.path.localeCompare(b.path));
  for (const record of list) {
    const section = topFolderOf(record);
    for (const star of deckCardsOf(record.cards, record.path, "basic")) out.push({ ...star, section });
  }
  return out;
}

/** The deck records, title order, templates skipped. */
function deckRecords(): NoteRecord[] {
  const isTemplate = templateMatcher();
  return [...notes.values()].filter((r) => r.deck !== null && !isTemplate(r.path)).sort((a, b) => a.title.localeCompare(b.title) || a.path.localeCompare(b.path));
}

function metaOf(c: Deck, stars: DeckCard[], implicit: boolean, today: string): DeckMeta {
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
  return { path: c.path, title: c.title, icon: c.icon, kind: c.kind, tags: c.tags, newPerDay: c.newPerDay, steps: c.steps, implicit, counts: { total: stars.length, new: fresh, due }, sections: [...sections.values()] };
}

/** Every deck on the shelf with its counts for `today`, and the
 *  implicit "Everything else" last — present even when empty, so the shelf
 *  has somewhere to point a reader whose vault holds cards but no fence. */
export function decks(today: string): DeckMeta[] {
  const out = deckRecords().map((r) => metaOf(r.deck!, r.deck!.cards, false, today));
  const rest = everythingElseCards();
  out.push(metaOf({ path: EVERYTHING_ELSE, title: "", icon: null, kind: "basic", newPerDay: DEFAULT_NEW_PER_DAY, steps: DEFAULT_STEPS, tags: [], sections: [], cards: rest }, rest, true, today));
  return out;
}

/** The stars of one deck (or of "Everything else") in document
 *  order, optionally one section's. Null when no such deck. */
export function deckCards(notePath: string, section: string | null): DeckCard[] | null {
  let stars: DeckCard[];
  if (notePath === EVERYTHING_ELSE) stars = everythingElseCards();
  else {
    const record = notes.get(notePath);
    if (!record || record.deck === null) return null;
    stars = record.deck.cards;
  }
  return section === null ? stars : stars.filter((s) => s.section === section);
}

/** The archive on this month-day: notes dated to it in earlier years, and
 *  trackers finished on it. Templates skipped; newest year first. */
export function onThisDay(iso: string): OnThisDayHit[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return [];
  const year = Number(m[1]);
  const monthDay = `${m[2]}-${m[3]}`;
  const isTemplate = templateMatcher();
  const rule = dailyRule();
  const out: OnThisDayHit[] = [];
  for (const record of notes.values()) {
    if (isTemplate(record.path)) continue;
    // A daily note is its own day's; a frontmatter `date: 2024-09-13` is a
    // calendar day and names itself; a created instant (the ledger,
    // server/created.ts) is a local moment and is read in local time — the
    // UTC getters put a UTC+3 midnight note on the previous day.
    // shared/noteDays.ts holds the rule for every reader.
    const day = dayOfNote(record.path, record.props, record.dateMs, rule);
    if (day !== null && day.slice(5) === monthDay && Number(day.slice(0, 4)) < year) {
      out.push({ path: record.path, title: record.title, year: Number(day.slice(0, 4)), kind: "written", what: record.title, excerpt: postBasics(record).excerpt });
    }
    for (const tracker of record.trackers) {
      if (!tracker.finished) continue;
      const f = /^(\d{4})-(\d{2}-\d{2})/.exec(tracker.finished);
      if (f && f[2] === monthDay && Number(f[1]) < year) {
        out.push({ path: record.path, title: record.title, year: Number(f[1]), kind: "finished", what: tracker.title, excerpt: "" });
      }
    }
  }
  return out.sort((a, b) => b.year - a.year || a.path.localeCompare(b.path)).slice(0, 40);
}

/** The instance's daily-note rule, read once per walk. */
function dailyRule(): DailyRule {
  return { folder: dailyFolder(), format: getSettings().dailyFormat ?? DAILY_FORMAT_DEFAULT };
}

/** Every note with its day and what the Timeline reads off it — the note
 *  half of shared/dayAgenda.ts's sources (`GET /api/timeline`). Templates
 *  skipped as everywhere. The excerpt and the words are the post list's own
 *  (`postBasics`), cached on the record, so a second call costs a walk. */
export function timelineNotes(): TimelineNote[] {
  const isTemplate = templateMatcher();
  const rule = dailyRule();
  const out: TimelineNote[] = [];
  for (const record of notes.values()) {
    if (isTemplate(record.path)) continue;
    const basics = postBasics(record);
    out.push({
      path: record.path,
      title: record.title,
      day: dayOfNote(record.path, record.props, record.dateMs, rule),
      publishedDay: record.published ? publishedDayOf(record.props) : null,
      published: record.published,
      excerpt: basics.excerpt,
      tags: record.tags,
      words: basics.words,
      captured: capturedLines(record.path, record.body),
      voice: voiceMarks(record.path, record.body),
    });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Every visible record a parsed query names — operators compiled against the
 *  record tables, words asked of minisearch, in minisearch's order when there
 *  are words and the index's order when there are none. The selection half of
 *  a ```query fence, shared with the paths-only door below so the two cannot
 *  disagree about what a query means. */
function queryRecords(parsed: ParsedQuery, publishedOnly: boolean, lang: FilterLang, opts: SearchOptions): NoteRecord[] {
  const keep = compileFilters(parsed.filters, publishedOnly, lang, opts);
  const bare = parsed.text.trim();
  const visible = (record: NoteRecord): boolean => !(publishedOnly && (!record.published || languageHidden(record, lang)));
  const records: NoteRecord[] = [];
  if (bare === "") {
    for (const record of notes.values()) if (visible(record) && (keep === null || keep(record))) records.push(record);
  } else {
    const q = opts.expandTerms?.(bare) ?? bare;
    for (const hit of mini.search(q)) {
      const record = notes.get(hit.id as string);
      if (!record || !visible(record)) continue;
      if (keep !== null && !keep(record)) continue;
      records.push(record);
    }
  }
  return records;
}

/** The paths a query names, uncapped — what the graph colours a group by. An
 *  empty query names nothing: a group with no query yet must not paint the
 *  whole vault its colour. */
export function queryPaths(query: string, publishedOnly: boolean, lang: FilterLang, opts: SearchOptions = {}): string[] {
  const parsed = parseSearchQuery(query);
  if (parsed.text.trim() === "" && parsed.filters.length === 0) return [];
  return queryRecords(parsed, publishedOnly, lang, opts).map((record) => record.path);
}

export function queryNotes(
  query: string,
  publishedOnly: boolean,
  lang: FilterLang,
  sort: { key: "date" | "modified" | "title" | "path" | "relevance"; dir: "asc" | "desc" },
  limit: number,
  opts: SearchOptions = {},
): QueryHit[] {
  const parsed = parseSearchQuery(query);
  const bare = parsed.text.trim();
  const records = queryRecords(parsed, publishedOnly, lang, opts);
  const dir = sort.dir === "asc" ? 1 : -1;
  if (sort.key !== "relevance" || bare === "") {
    const key = sort.key === "relevance" ? "date" : sort.key;
    records.sort((a, b) => {
      let d = 0;
      if (key === "date") d = a.dateMs - b.dateMs;
      else if (key === "modified") d = a.mtimeMs - b.mtimeMs;
      else if (key === "title") d = a.title.localeCompare(b.title);
      else d = a.path.localeCompare(b.path);
      return d * dir || a.path.localeCompare(b.path);
    });
  }
  return records.slice(0, Math.max(1, Math.min(500, limit))).map((record) => ({
    path: record.path,
    title: record.title,
    dateMs: record.dateMs,
    mtimeMs: record.mtimeMs,
    tags: record.tags,
    props: record.props,
    excerpt: makeSnippet(record, []).replace(/<[^>]+>/g, ""),
  }));
}

export function search(
  query: string,
  publishedOnly: boolean,
  lang: FilterLang,
  opts: SearchOptions = {},
): SearchHit[] {
  // OPERATORS FIRST, words second (server/searchQuery.ts). What is left after
  // the operators are peeled off is what minisearch is asked — and when
  // NOTHING is left, the filters alone are the query: `tag:recipes` on its own
  // must list every recipe, which is the most obvious thing anybody will type
  // and the one shape a term index cannot answer.
  const parsed = parseSearchQuery(query);
  // `in:books` (or `-in:notes`) is a question for the page store
  // (server/pdfText.ts), and the route asks it beside this one; the note index
  // answers such a query with nothing rather than with every note that is
  // "not a book".
  const scope = searchScope(parsed.filters);
  if (scope === "books" || scope === "none") return [];
  const keep = compileFilters(parsed.filters, publishedOnly, lang, opts);
  const bare = parsed.text.trim();
  if (!bare) return keep === null ? [] : filteredNotes(keep, publishedOnly, lang);
  const q = (opts.expandTerms?.(bare) ?? bare).trim();
  // The EXPANDED string is what minisearch is asked; the string the reader
  // actually typed is what the exact-name tiers below are measured against. An
  // appended canonical tag is a widening for the term index and a lie to
  // "is this note titled exactly what I typed".
  const qLower = bare.toLowerCase();

  // Rank tiers on top of minisearch's relevance score: a note TITLED what you
  // typed always beats a note that merely mentions it, and a title that starts
  // with the query beats a content-only match. Within a tier, minisearch's
  // order (score) is kept.
  //
  // The comparison is FOLDED, like the index it is re-ranking. A note titled
  // «الْمُقَدِّمَة» is now found by a query for «المقدمة» — and would then have
  // been sorted into the "merely mentions it" tier, under every note whose
  // unpointed title matched literally, which is the same bug one rung up.
  const qFold = foldTerm(qLower);
  const tierOf = (title: string): number => {
    const t = foldTerm(title.toLowerCase());
    if (t === qFold) return 0;
    if (t.startsWith(qFold)) return 1;
    return 2;
  };

  // Visitor scoping: published notes only, minus language-filtered ones
  // (the filter must not leak filtered-out note existence through search).
  const visitorHidden = (p: string): boolean => {
    if (!publishedSet.has(p)) return true;
    const record = notes.get(p);
    return record !== undefined && languageHidden(record, lang);
  };
  let results = mini.search(q);
  if (publishedOnly) results = results.filter((r) => !visitorHidden(String(r.id)));
  if (keep !== null) {
    results = results.filter((r) => {
      const record = notes.get(String(r.id));
      return record !== undefined && keep(record);
    });
  }
  const seen = new Set(results.map((r) => String(r.id)));
  const ranked = results
    .map((result, order) => {
      const id = String(result.id);
      const record = notes.get(id);
      const title = record?.title ?? noteTitleOf(id);
      return { result, record, id, title, tier: tierOf(title), order };
    })
    .sort((a, b) => a.tier - b.tier || a.order - b.order);

  const hits: SearchHit[] = ranked.slice(0, 50).map(({ result, record, id, title }) => ({
    path: id,
    title,
    snippet: record ? makeSnippet(record, Object.keys(result.match)) : "",
    score: result.score,
    ...(record ? aliasReason(record, result.match, qLower) : {}),
  }));

  // Exact-name short-circuit: if a note titled exactly `q` exists but
  // minisearch left it out (tokenizer/fuzzy quirks), force it in at #1.
  //
  // The alias table gets the same treatment one rung down, and needs it more:
  // an alias is routinely a word the note's own text never contains — "ML" on a
  // note that only ever writes "machine learning" — so there is no body match
  // for minisearch to rank, and the note the reader is searching FOR by the
  // name they gave it would come back below notes that merely mention it.
  const forcedFrom = (table: Map<string, Set<string>>): string[] =>
    [...(table.get(qLower) ?? [])]
      .filter((p) => {
        if (seen.has(p) || (publishedOnly && visitorHidden(p))) return false;
        // The short-circuit is a RANK boost, never a bypass: a note forced to
        // the top past an operator the reader typed would be the filter
        // failing in the one row they are most likely to click.
        const record = notes.get(p);
        return keep === null || (record !== undefined && keep(record));
      })
      .sort((a, b) => a.localeCompare(b));
  const exactPaths = forcedFrom(byName);
  const aliasPaths = forcedFrom(byAlias).filter((p) => !exactPaths.includes(p));
  if (exactPaths.length > 0 || aliasPaths.length > 0) {
    const topScore = (hits[0]?.score ?? 0) + 1;
    const force = (paths: string[], score: number, fromAliasTable: boolean): SearchHit[] =>
      paths.flatMap<SearchHit>((p) => {
        const record = notes.get(p);
        if (!record) return [];
        const alias = fromAliasTable
          ? record.aliases.find((a) => a.toLowerCase() === qLower)
          : undefined;
        return [{
          path: p,
          title: record.title,
          snippet: makeSnippet(record, [bare]),
          score,
          ...(alias === undefined ? {} : { alias: stripBidiControls(alias) }),
        }];
      });
    // Named exactly beats aliased exactly, for the same reason resolveLink
    // ranks them that way: a filename is the note's own name.
    hits.unshift(...force(exactPaths, topScore + 1, false), ...force(aliasPaths, topScore, true));
    hits.length = Math.min(hits.length, 50);
  }
  return hits;
}

/** THE CANDIDATE SET FOR A VAULT-WIDE REPLACE: every note whose body holds the
 *  needle, narrowed by whatever operators the reader typed into the same box.
 *
 *  Deliberately NOT `search()`. That one ranks, fuzzes, folds and caps at
 *  fifty — every one of which is right for a reader looking at a list and
 *  wrong for a rewrite, where "the top fifty of what might be four hundred" is
 *  the worst possible answer. This walks the whole index, applies the filters
 *  exactly, and tests the needle exactly (server/searchReplace.ts owns the
 *  test, so it is the same matcher the preview and the write will use).
 *
 *  Admin-only by construction: the route is, and nothing here takes a visitor
 *  scope, because there is no such thing as a visitor's replace. */
export function replaceCandidates(
  query: string,
  bodyHolds: (body: string) => boolean,
  opts: SearchOptions = {},
): string[] {
  const parsed = parseSearchQuery(query);
  const keep = compileFilters(parsed.filters, false, null, opts);
  const out: string[] = [];
  for (const record of notes.values()) {
    if (keep !== null && !keep(record)) continue;
    if (!bodyHolds(record.body)) continue;
    out.push(record.path);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** A query made ENTIRELY of operators — `tag:recipes`, `is:published
 *  after:2024`, `linkto:"Machine Learning"`.
 *
 *  There are no terms to rank, so the order is the vault's own: most recently
 *  written first, which is what every other list of notes in this product
 *  agrees on. The snippet is the note's opening rather than a match window,
 *  because nothing was matched — quoting a line back and marking nothing in it
 *  would suggest the words are in there somewhere. Same cap as a term search:
 *  fifty rows is a sidebar, not a report. */
function filteredNotes(
  keep: (record: NoteRecord) => boolean,
  publishedOnly: boolean,
  lang: FilterLang,
): SearchHit[] {
  const out: { record: NoteRecord }[] = [];
  for (const record of notes.values()) {
    if (publishedOnly && (!record.published || languageHidden(record, lang))) continue;
    if (!keep(record)) continue;
    out.push({ record });
  }
  out.sort(
    (a, b) => b.record.dateMs - a.record.dateMs || a.record.path.localeCompare(b.record.path),
  );
  return out.slice(0, 50).map(({ record }, i) => ({
    path: record.path,
    title: record.title,
    snippet: makeSnippet(record, []),
    // Descending, so a client that sorts by score keeps the order chosen here.
    score: out.length - i,
  }));
}

/** WHY this hit appeared, when the answer is "one of its other names".
 *
 *  Obsidian resolves and searches aliases silently: two notes claiming `ML` and
 *  the reader is never told which one they are looking at, or that an alias was
 *  involved at all. Naming the alias in the result row is the cheap half of
 *  that fix (the deterministic tie rule is the other half).
 *
 *  Nothing is said when the TITLE matched too — the reader can already see why
 *  that row is there, and a redundant caption on every result is noise. */
function aliasReason(
  record: NoteRecord,
  match: Record<string, string[]>,
  qLower: string,
): { alias?: string } {
  if (record.aliases.length === 0) return {};
  if (Object.values(match).some((fields) => fields.includes("title"))) return {};
  const terms = Object.entries(match)
    .filter(([, fields]) => fields.includes("aliases"))
    .map(([term]) => term);
  if (terms.length === 0) return {};
  const hit =
    record.aliases.find((a) => a.toLowerCase() === qLower) ??
    record.aliases.find((a) => terms.some((term) => a.toLowerCase().includes(term)));
  return hit === undefined ? {} : { alias: stripBidiControls(hit) };
}

/** THE PAIR IS ONE NODE (visitor graphs only).
 *
 *  A twin pair is two files and one idea, and a graph is a picture of ideas:
 *  drawn as two nodes it is a lie a reader can see — the same essay twice,
 *  each half carrying half the arrows, joined to nothing. So on the PUBLIC
 *  graph the pair collapses onto one node, labelled by the face in the
 *  reader's own language, and every edge either face drew lands on it.
 *
 *  Not in the editor. There the graph is a picture of FILES — you open them,
 *  rename them, delete them from it — and a node that opened a file you were
 *  not looking at would be the same lie the other way round. The editor says
 *  the pair out loud instead, in the tab, the tree and the status bar.
 *
 *  Which face represents the pair: the reader's language when one of them is
 *  in it, else the shorter path — deterministic either way, because a graph
 *  whose node ids moved between two requests is a graph that re-lays itself
 *  out while you are looking at it. */
function graphFace(relPath: string, publishedOnly: boolean, lang: FilterLang): string {
  if (!publishedOnly) return relPath;
  const link = twinOf(relPath);
  if (link === null) return relPath;
  const other = notes.get(link.path);
  if (other === undefined || !publishedSet.has(other.path) || languageHidden(other, lang)) return relPath;
  const me = notes.get(relPath);
  if (me === undefined) return relPath;
  if (lang !== null) {
    const wantArabic = lang === "ar";
    if (me.arabic === wantArabic) return relPath;
    if (other.arabic === wantArabic) return other.path;
  }
  return relPath.length <= other.path.length && relPath.localeCompare(other.path) <= 0
    ? relPath
    : other.path;
}

export function graph(publishedOnly: boolean, lang: FilterLang): GraphData {
  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];
  const degree = new Map<string, number>();
  // Visitor graphs honor the languageFilter on both endpoints — a filtered
  // note must appear neither as a node nor via an edge.
  const hidden = (record: NoteRecord): boolean => publishedOnly && languageHidden(record, lang);
  const face = (p: string): string => graphFace(p, publishedOnly, lang);
  for (const record of notes.values()) {
    if (publishedOnly && !record.published) continue;
    if (hidden(record)) continue;
    const from = face(record.path);
    const connect = (rawTarget: string | null): void => {
      if (!rawTarget) return;
      const targetRecord = notes.get(rawTarget);
      if (targetRecord !== undefined && hidden(targetRecord)) return;
      const target = face(rawTarget);
      if (target === from) return; // a link BETWEEN the two faces is one node's loop
      const key = `${from}\0${target}`;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push({ source: from, target });
      degree.set(from, (degree.get(from) ?? 0) + 1);
      degree.set(target, (degree.get(target) ?? 0) + 1);
    };
    for (const link of record.links) connect(resolveLink(link.target, publishedOnly, lang));
    // …and LaTeX's own vocabulary. THIS is what makes an existing project,
    // dropped into a vault unmodified, light up the graph: a `\cite` whose key
    // some note carries and a `\ref` whose label some note defines are edges,
    // and nothing in either document had to be rewritten to say so.
    for (const xref of record.xrefs) connect(resolveXref(xref, publishedOnly, lang));
  }
  // One node per FACE the reader sees: the other half of a merged pair is
  // folded away here, and its tags travel with it (the pair is one idea, so
  // the topics of either face are the idea's topics).
  const merged = new Map<string, string[]>(); // representative -> tags
  for (const record of notes.values()) {
    if (publishedOnly && !record.published) continue;
    if (hidden(record)) continue;
    const id = face(record.path);
    const tags = publishedOnly
      ? record.tags.filter((t) => !excludedTags().has(t.toLowerCase()))
      : record.tags;
    const held = merged.get(id);
    if (held === undefined) merged.set(id, [...tags]);
    else for (const tag of tags) if (!held.includes(tag)) held.push(tag);
  }
  const nodes = [...merged].map(([id, tags]) => ({
    id,
    title: notes.get(id)?.title ?? noteTitleOf(id),
    links: degree.get(id) ?? 0,
    // Visitors group the sidebar by these tags — honor EXCLUDE_TAGS so
    // workflow/status tags never become published topic headings.
    tags,
  }));
  return { nodes, edges };
}

/** WHO POINTS AT THIS NOTE — and at its other face.
 *
 *  A twin pair is one idea, so a link to either face is a link to the idea.
 *  Split across two panels, the Arabic face of a post that four people linked
 *  in English shows an empty box and reads as unlinked — which is exactly
 *  backwards, because it is the SAME PIECE. So the panel of either face shows
 *  both, deduplicated, with the two faces themselves excluded (a link from
 *  one face to the other is not a backlink, it is the pair).
 *
 *  Scoped like everything else: a visitor still sees only the sources their
 *  own language and the publish flag allow, so the union gives an Arabic
 *  reader nothing they were not already entitled to. */
export function backlinks(targetPath: string, publishedOnly: boolean, lang: FilterLang): Backlink[] {
  const mine = backlinksOne(targetPath, publishedOnly, lang);
  const link = twinOf(targetPath);
  if (link === null) return mine;
  const theirs = backlinksOne(link.path, publishedOnly, lang);
  if (theirs.length === 0) return mine;
  const seen = new Set(mine.map((hit) => `${hit.path}\0${hit.line}`));
  const out = [...mine];
  for (const hit of theirs) {
    if (hit.path === targetPath || hit.path === link.path) continue;
    const key = `${hit.path}\0${hit.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function backlinksOne(targetPath: string, publishedOnly: boolean, lang: FilterLang): Backlink[] {
  const hits: Backlink[] = [];
  // The TARGET has to pass the visitor filter too, not just the sources: a
  // language-hidden note that answered with backlinks confirmed to an
  // anonymous caller that it exists and is published. (resolveLink() now
  // refuses to resolve to it as well, so this is belt and braces — but it is
  // the check the reader of this function expects to find.)
  if (publishedOnly && !isNoteVisibleToVisitor(targetPath, lang)) return hits;
  const seen = new Set<string>();
  // The reverse index decides WHO to look at; resolveLink() below still decides
  // whether each link actually lands here. On the 1,388-note fixture this turns
  // 40,000 resolutions per panel open into a few dozen.
  for (const candidate of linkCandidates(targetPath)) {
    const record = notes.get(candidate);
    if (record === undefined) continue;
    if (publishedOnly && (!record.published || languageHidden(record, lang))) continue;
    let bodyLines: string[] | null = null; // split lazily, once per record
    for (const link of record.links) {
      if (resolveLink(link.target, publishedOnly, lang) !== targetPath) continue;
      const key = `${record.path}\0${link.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Strip block prefixes + inline marks but keep [[wikilinks]] — the
      // client renders those as gold spans. Long lines are cut to a
      // word-boundary window centered on the link; "…" marks only real
      // elisions (a cut, or a line that starts mid-sentence).
      // A `.tex` link arrives with its context already extracted as PROSE
      // (shared/tex.ts hands over the paragraph's text, never its source), so
      // the markdown line cleaner — which strips `#`, `>` and table pipes —
      // has nothing to do and the widening below would read raw TeX lines.
      // The needle is the link itself: inside a table row, the cell holding
      // this link is the cell the card is about (see cleanContextLine).
      const needle = [`[[${link.target.toLowerCase()}`];
      let context = record.prose !== null ? link.line : cleanContextLine(link.line, needle);
      // A line that is little more than the link itself ("- [[History]]")
      // makes a useless card — widen to the surrounding lines so the card
      // reads like Obsidian's backlink context.
      // A short line widens into its neighbours so "- [[History]]" reads as a
      // sentence. A TABLE CELL never does: its neighbours are the next row and
      // the header, and gluing those on is the cell-join of F44 wearing the
      // other coat — "Reading table Title worth a reread, see [[Target]]
      // Piranesi". The cell is already the chosen unit.
      const inTable = /^\s*\|/.test(link.line);
      if (record.prose === null && !inTable && contextProse(context).length < 16) {
        bodyLines ??= record.body.split("\n");
        context = expandedContext(bodyLines, link.lineIdx, needle);
      }
      if (context.length > BACKLINK_CONTEXT_MAX) {
        // Center the window on THIS link when it can be found, else on the
        // first wikilink in the context.
        const at = context.toLowerCase().indexOf(`[[${link.target.toLowerCase()}`);
        const first = at === -1 ? /\[\[[^[\]]*\]\]/.exec(context) : null;
        context = windowAround(
          context,
          at !== -1 ? at : (first?.index ?? 0),
          at !== -1 ? link.target.length + 4 : (first?.[0].length ?? 0),
          BACKLINK_CONTEXT_RADIUS,
        );
        // Never leave a sliced half-wikilink at either edge.
        context = context
          .replace(/^…?[^[\]]*\]\]\s*/, "…")
          .replace(/\s*\[\[(?:(?!\]\]).)*$/, "…");
      }
      // Consistent ellipsis: mark a mid-sentence start and a mid-sentence
      // end (hard-wrapped source lines) the same way real cuts are marked.
      if (!context.startsWith("…") && /^\p{Ll}/u.test(context)) {
        context = `…${context}`;
      }
      if (!context.endsWith("…") && !/[.!?…]["')\]]*$/.test(context)) {
        context = `${context}…`;
      }
      hits.push({
        path: record.path,
        title: record.title,
        context,
        line: fileLine(record, link.lineIdx),
      });
    }
    // A `\cite` or a cross-note `\ref` is a backlink like any other — the
    // panel is where a note learns who leans on it, and a paper that cites this
    // note by its citekey leans on it exactly as a `[[wikilink]]` does.
    for (const xref of record.xrefs) {
      if (resolveXref(xref, publishedOnly, lang) !== targetPath) continue;
      const key = `${record.path}\0${xref.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        path: record.path,
        title: record.title,
        context: xref.line,
        line: fileLine(record, xref.lineIdx),
      });
    }
  }
  return hits.sort((a, b) => a.path.localeCompare(b.path));
}

/** A body-relative `lineIdx` as the 1-based line of the FULL file — the only
 *  coordinate the editor (and the wire, by contract) counts in. Parsing runs
 *  on `body`, which lost the frontmatter block, and shipping the body-relative
 *  number was exactly the bug this exists to prevent: every landing would sit
 *  N lines above the mention, where N is the size of the properties block. */
function fileLine(record: NoteRecord, lineIdx: number): number {
  return record.bodyStartLine + lineIdx + 1;
}

/** How many matched lines /api/search/matches will list for one note. A
 *  search hit needs "where, exactly" — not a concordance. Past a hundred the
 *  reader is no longer picking a line, they are re-reading the note, and the
 *  note itself is one click away. */
const SEARCH_MATCHES_MAX = 100;

/** Only this much of one line is quoted (window centered on the first match
 *  beyond it) — a match inside a 4,000-character hard-wrapped paragraph must
 *  not ship the paragraph. */
const SEARCH_MATCH_LINE_MAX = 200;

/** Every line of one note that a search query matches — the expansion under a
 *  search hit, so a click can land on the line rather than on the note.
 *
 *  Substring semantics, per whitespace-separated term, case-insensitive, any
 *  term counts. Deliberately NOT minisearch: the index answers "which notes"
 *  with fuzzy/prefix scoring, but a reader expanding a hit is asking "where
 *  does it SAY that", and a line quoted back for a word it does not contain
 *  reads as a bug. A hit earned purely by fuzzy spelling (or by title/alias)
 *  can therefore answer with an empty list — the client says "no matches"
 *  and the whole-note click still works, which is honest: the note matched,
 *  no line did.
 *
 *  Lines are matched and quoted through the same cleaner the backlink context
 *  uses, so what the row shows is what the panel beside it shows for the same
 *  line — prose, with [[wikilinks]] kept for the client's gold spans. Text is
 *  escaped with matches in literal <mark>…</mark>, exactly like
 *  SearchHit.snippet. */
/** The words a free-text query is actually looking FOR, as the line scanner
 *  and the vault-wide replace both need them: whitespace-separated, a leading
 *  `#` dropped (a reader clicking a tag pill searches for the word, not for the
 *  punctuation), and anything that folds away to nothing thrown out — an
 *  all-harakat "term" would match at every position in the note. */
export function searchTerms(query: string, expand?: (text: string) => string): string[] {
  // The operators are NOT words. `tag:recipes dal` looks for "dal" in the
  // lines of a note the tag already chose; hunting for the literal string
  // "tag:recipes" would quote back nothing and the expansion under every hit
  // would read as broken. `expand` is applied to what is left, for the same
  // reason and in the same order as in `search()`.
  const bare = parseSearchQuery(query).text;
  return [...new Set(
    (expand?.(bare) ?? bare)
      .split(/\s+/)
      .map((t) => t.replace(/^#/, ""))
      .filter((t) => foldQuery(t) !== ""),
  )];
}

export function searchMatches(
  relPath: string,
  query: string,
  publishedOnly: boolean,
  lang: FilterLang,
  opts: SearchOptions = {},
): SearchMatch[] {
  // The same refusal shape backlinks() makes for its target: a visitor asking
  // about a note the filter hides must get the same "nothing" a missing note
  // gets, never a confirmation that lines exist.
  if (publishedOnly && !isNoteVisibleToVisitor(relPath, lang)) return [];
  const record = notes.get(relPath);
  if (!record) return [];
  const terms = searchTerms(query, opts.expandTerms);
  if (terms.length === 0) return [];
  const out: SearchMatch[] = [];
  const lines = record.body.split("\n");
  for (let i = 0; i < lines.length && out.length < SEARCH_MATCHES_MAX; i++) {
    // `.tex` lines are quoted raw (same reasoning as backlink context: the
    // markdown cleaner would mangle them, and the editor shows this source).
    // The search terms are the needle: in a table row, show the cell that
    // actually matched rather than a join of the whole row (cleanContextLine).
    const text = record.prose !== null ? lines[i].trim() : cleanContextLine(lines[i], terms);
    if (text === "") continue;
    const first = findAnyMatches(text, terms, 1)[0];
    if (first === undefined) continue;
    const windowed =
      text.length > SEARCH_MATCH_LINE_MAX
        ? windowAround(text, first.start, first.end - first.start, Math.floor(SEARCH_MATCH_LINE_MAX / 2))
        : text;
    out.push({ line: fileLine(record, i), text: markHtml(windowed, terms) });
  }
  return out;
}

export function tags(publishedOnly: boolean, lang: FilterLang): TagCount[] {
  const counts = new Map<string, number>();
  const hidden = publishedOnly ? excludedTags() : null;
  for (const record of notes.values()) {
    if (publishedOnly && !record.published) continue;
    // A topic carried ONLY by language-filtered notes must not appear at all:
    // a visible pill with a count is exactly the existence leak the filter
    // has to avoid, and its topic page would come back empty anyway.
    if (publishedOnly && languageHidden(record, lang)) continue;
    for (const tag of record.tags) {
      if (hidden?.has(tag.toLowerCase())) continue; // EXCLUDE_TAGS: visitor pills
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** How many distinct values a key lists in the properties shelf. Twenty is
 *  the shelf's own cap, applied here so the wire never carries a `title:`
 *  key's thousand one-off values. */
const PROP_VALUES_MAX = 20;

/** Keys the properties shelf does NOT list, because each has a shelf or a
 *  surface of its own and listing it twice would be the same list with a
 *  different heading: the tags shelf sits just above this one. */
const PROP_KEYS_HIDDEN = new Set(["tags", "tag"]);

/** Every frontmatter key the index knows, with a count and its top values —
 *  the properties shelf (client/components/PropsShelf.tsx). Same scope
 *  ladder as tags(): a visitor sees the keys of published notes only, and a
 *  language-filtered note contributes nothing. Values are counted per LIST
 *  ITEM, split on the ", " scalarProps joined them with, so a click on a
 *  value builds the `prop:key=value` that finds exactly the notes it
 *  counted. */
export function props(publishedOnly: boolean, lang: FilterLang): PropCount[] {
  // Values are keyed by the folded, lowercased form the `prop:` filter
  // compares by, so "Reading" and "reading" are one value; the spelling
  // shown is the first one seen.
  const keys = new Map<string, { count: number; values: Map<string, { shown: string; count: number }> }>();
  for (const record of notes.values()) {
    if (publishedOnly && !record.published) continue;
    if (publishedOnly && languageHidden(record, lang)) continue;
    for (const [key, value] of Object.entries(record.props)) {
      if (PROP_KEYS_HIDDEN.has(key)) continue;
      let entry = keys.get(key);
      if (!entry) keys.set(key, (entry = { count: 0, values: new Map() }));
      entry.count++;
      const seen = new Set<string>();
      for (const part of value.split(/,\s*/)) {
        const item = part.trim();
        if (item === "") continue;
        const fold = foldTerm(item.toLowerCase());
        if (fold === "" || seen.has(fold)) continue;
        seen.add(fold);
        const slot = entry.values.get(fold);
        if (slot) slot.count++;
        else entry.values.set(fold, { shown: item, count: 1 });
      }
    }
  }
  return [...keys]
    .map(([key, { count, values }]) => ({
      key,
      count,
      values: [...values.values()]
        .map(({ shown, count: n }) => ({ value: shown, count: n }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
        .slice(0, PROP_VALUES_MAX),
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

// -------------------------------------------------------- tag page labels

/** Frontmatter `labels:` → a cleaned `{ lang: label }` map, or null when the
 *  note carries none (which is every note but the tag pages). */
export function labelsOfFm(fm: Record<string, unknown>): Record<string, string> | null {
  if (fm.labels === undefined || fm.labels === null) return null;
  const entry = cleanLabelEntry(fm.labels);
  return Object.keys(entry).length > 0 ? entry : null;
}

/** The display labels the VAULT itself declares: every note under `folder`
 *  that carries a frontmatter `labels:` map, keyed by the tag its path names.
 *
 *  The path IS the tag, nested tags included — `tags/lang/arabic.md` names
 *  `lang/arabic` — so a tag page needs no `tag:` key to say what it is about
 *  and cannot disagree with its own filename. This is source (a) of the
 *  resolution order in `shared/tagLabels.ts`, and it is first because a label
 *  written here travels with the vault: clone it, sync it, open it in
 *  Obsidian, and the naming is still there. */
export function tagPageLabels(folder: string): TagLabelMap {
  const out: TagLabelMap = {};
  const root = folder.replace(/^\/+|\/+$/g, "");
  if (root === "") return out;
  const prefix = `${root.toLowerCase()}/`;
  for (const record of notes.values()) {
    if (record.labels === null) continue;
    const lower = record.path.toLowerCase();
    if (!lower.startsWith(prefix)) continue;
    const tag = tagKey(stripNoteExt(record.path.slice(prefix.length)));
    if (tag === "") continue;
    out[tag] = { ...(out[tag] ?? {}), ...record.labels };
  }
  return out;
}

// ------------------------------------------------------------------ snippets

const BACKLINK_CONTEXT_MAX = 180;
const BACKLINK_CONTEXT_RADIUS = 85;

/** Snippet work is capped: only this much of a note's body is ever stripped
 *  to prose. A match past the cap still lists the note — its snippet just
 *  windows the head of the document instead of the exact hit. */
const MAX_SNIPPET_SOURCE_CHARS = 128 * 1024;

/** Prose-stripped, whitespace-collapsed body — computed once per record and
 *  cached (records are replaced on reindex), input capped so a single huge
 *  note can't stall a search response. */
export function flatBody(record: NoteRecord): string {
  if (record.flat === null) {
    // A `.tex` note arrives with its prose already extracted (the parse is
    // whole-document, so slicing the SOURCE would cut a snippet mid-macro).
    record.flat =
      record.prose !== null
        ? record.prose.slice(0, MAX_SNIPPET_SOURCE_CHARS).replace(/\s+/g, " ").trim()
        : stripMarkdown(record.body.slice(0, MAX_SNIPPET_SOURCE_CHARS)).replace(/\s+/g, " ").trim();
  }
  return record.flat;
}
