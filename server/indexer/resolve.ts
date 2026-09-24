// Name resolution over the index: wikilinks, aliases, twins, embeds, anchors
// and cross-references, images and banners. Moved out of server/indexer.ts,
// which keeps the store these read.

import type { AliasEntry, TwinFaceRef, TwinPair } from "../../shared/types.ts";
import { isNoteVisibleToVisitor, type FilterLang } from "./language.ts";
import type { NoteAnchor } from "../../shared/anchors.ts";
import { attachmentPaths, attachmentsByName, attachmentsByPathLower, byAlias, byCitekey, byLabel, byName, byPathLower, labelAnchors, linkSources, notes, publishedSet, xrefSources, type NoteRecord } from "../indexer.ts";
import { faceLang, facesDiffer, readerFace, twinSwapKey, type TwinSides } from "../../shared/twins.ts";
import { allowedAttachments } from "./publish.ts";
import { linkKeys, pickShortest } from "../../shared/noteParse.ts";
import { noteCandidates, noteTitleOf, stripNoteExt } from "../../shared/noteFormat.ts";
import path from "node:path";
import { stripBidiControls } from "../../shared/bidi.ts";

// The parsing that used to sit here is shared/noteParse.ts, imported above:
// the phone's pocket server reads the same vault and had to read it the same
// way.

// ------------------------------------------------------------------- queries

/** Restrict a candidate set to those `keep` accepts; null when none survive. */
function filterCandidates(
  candidates: Set<string>,
  keep: (relPath: string) => boolean,
): Set<string> | null {
  const kept = new Set([...candidates].filter(keep));
  return kept.size === 0 ? null : kept;
}

/** Resolve a wikilink target to a note path: case-insensitive basename, shortest
 *  path wins. `publishedOnly` resolves within the collection the VISITOR can
 *  discover — published AND not curated away by the languageFilter.
 *
 *  The languageFilter half is not optional here. GET /api/resolve hands this
 *  function's answer to anonymous callers, and it takes only a guessable
 *  TITLE: gating on publication alone made it a title→path existence oracle
 *  for exactly the notes the filter hides ("Eppur si muove" → its full vault
 *  path, while a nonexistent name answered null). That is the leak CONTRACTS
 *  says the filter must never produce, and it is a strictly bigger surface
 *  than the by-design /api/note allowance, which requires the exact path the
 *  caller is trying to learn. Direct access by full path stays allowed — this
 *  changes discovery, not reads. */
export function resolveLink(
  name: string,
  publishedOnly: boolean,
  lang: FilterLang,
): string | null {
  const { key, asPath } = linkKeys(name);
  // Path-form targets: exact vault-relative match first (with or without an
  // extension, case-insensitive), mirroring the client resolver. Candidate
  // ORDER is the tie-break: `.md` first, so a vault that grows a `Fourier.tex`
  // beside its `Fourier.md` does not silently re-point every existing link.
  let pathHit: string | undefined;
  for (const candidate of noteCandidates(asPath)) {
    pathHit = byPathLower.get(candidate);
    if (pathHit) break;
  }
  pathHit ??= byPathLower.get(asPath);
  if (pathHit && (!publishedOnly || isNoteVisibleToVisitor(pathHit, lang))) return pathHit;
  // Real basenames, THEN aliases — one rung apart and never mixed. A file
  // actually named `ML.md` must not lose its own name to a `aliases: [ML]` some
  // other note declares, whichever of the two sits at the shorter path.
  //
  // A rung the visitor filter empties falls through to the next one rather than
  // answering null: the visitor's collection is a smaller vault, and inside it
  // no note is named `ML` at all, so the aliased one is the honest answer. It
  // leaks nothing either way — both branches are computed from notes the caller
  // may already discover.
  for (const table of [byName, byAlias]) {
    let candidates = table.get(key);
    if (!candidates || candidates.size === 0) continue;
    if (publishedOnly) {
      const kept = filterCandidates(candidates, (p) => isNoteVisibleToVisitor(p, lang));
      if (!kept) continue;
      candidates = kept;
    }
    // Two notes claiming one alias tie the SAME way two notes sharing a
    // basename do — fewest segments, then shortest string, then alpha. One
    // resolution rule for names, whoever wrote them down.
    return pickShortest(candidates);
  }
  return null;
}

/** Every note that MIGHT point at `targetPath` — a superset the caller
 *  verifies, and the whole of the reverse index's promise.
 *
 *  It is a superset by exactly one rule and no more: resolveLink() consults the
 *  path table, then byName, then byAlias, so a key that answers with this note
 *  is its path, its path minus the note extension, its basename, or one of its
 *  aliases; resolveXref() consults byCitekey and byLabel, so an xref key that
 *  answers with it is one of its citekeys or one of its labels. Anything filed
 *  under any other key CANNOT resolve here, whatever the audience or language
 *  scope — those filters only ever remove candidates, never add one — so
 *  skipping the rest of the vault skips nothing a reader would have seen.
 *
 *  Sorted, so callers that sort by path afterwards keep their old tie-break
 *  (hits from one note stay in that note's own link order). */
export function linkCandidates(targetPath: string): string[] {
  const record = notes.get(targetPath);
  const out = new Set<string>();
  const pull = (map: Map<string, Set<string>>, key: string): void => {
    const set = map.get(key);
    if (!set) return;
    for (const source of set) if (source !== targetPath) out.add(source);
  };
  const lower = targetPath.toLowerCase();
  pull(linkSources, lower); // [[Folder/Note.md]]
  pull(linkSources, stripNoteExt(lower)); // [[Folder/Note]]
  pull(linkSources, noteTitleOf(targetPath).toLowerCase()); // [[Note]]
  if (record !== undefined) {
    for (const alias of record.aliases) pull(linkSources, alias.toLowerCase());
    for (const key of record.citekeys) pull(xrefSources, key.toLowerCase());
    for (const anchor of labelAnchors(record)) pull(xrefSources, anchor.id.toLowerCase());
  }
  return [...out].sort();
}

/** Every alias in the vault, as `{ alias, path, title }`, sorted by alias —
 *  what `[[` autocomplete offers beside the note titles it reads from the tree,
 *  which is the one name table the client has no other way to see.
 *
 *  Visitor-scoped like every other discovery surface: an alias must never make
 *  a note reachable that resolveLink itself would refuse to answer with. */
export function aliasEntries(publishedOnly: boolean, lang: FilterLang): AliasEntry[] {
  const out: AliasEntry[] = [];
  for (const record of notes.values()) {
    if (publishedOnly && !isNoteVisibleToVisitor(record.path, lang)) continue;
    for (const alias of record.aliases) {
      // Sanitized for DISPLAY, exactly as the title is: this string is drawn in
      // a completion list, and an embedded RLO there reorders the row.
      out.push({ alias: stripBidiControls(alias), path: record.path, title: record.title });
    }
  }
  // Within one alias, claimants in RESOLUTION order — pickShortest's own rule,
  // fewest segments then shortest then alphabetical — so the first row for any
  // alias is the note `[[alias]]` will actually reach. The `[[` completion
  // relies on this to keep one honest row per alias: sorted by plain path, the
  // row it kept could NAME the loser while inserting a link that lands on the
  // winner.
  return out.sort(
    (a, b) =>
      a.alias.localeCompare(b.alias) ||
      a.path.split("/").length - b.path.split("/").length ||
      a.path.length - b.path.length ||
      a.path.localeCompare(b.path),
  );
}

// ------------------------------------------------------------------ twins
//
// TWO FILES, ONE IDEA (shared/twins.ts states the whole model). A note
// declares its other face with one frontmatter line — `twin: [[Other]]` — and
// the index does three things with it that no single file could do for
// itself: it RESOLVES the declaration like any other link, it makes the
// relation SYMMETRIC so one line is enough, and it notices when the two
// declarations disagree.
//
// Derived and memoized beside the other index-shaped answers: building it
// walks every record once, and every surface that draws a twin (the pill, the
// tab mark, the tree mark, the graph merge, the backlinks union, the article
// head) asks for it on every request.

/** One note's resolved other face. */
export interface TwinLink {
  path: string;
  /** Both notes declare a twin and the declarations disagree — or more than
   *  one note claims this one. The pair still works (each note keeps the twin
   *  ITS OWN line names); the chrome says so. */
  inconsistent: boolean;
}

let twinsCache: Map<string, TwinLink> | null = null;

/** Drop the twin table (invalidateDerived owns the call). */
export function dropTwinsMemo(): void {
  twinsCache = null;
}

/** The whole vault's twin table, built once per index change.
 *
 *  TWO PASSES, and the order is the rule:
 *
 *   1. Every DECLARATION, resolved. A declaration resolves with the visitor
 *      filter OFF — a twin is, in the common case, the note the reader's own
 *      language filter is hiding, so resolving it through that filter would
 *      make the relation invisible exactly when it matters. Publication is
 *      gated later, by whoever is asking.
 *   2. Every note without a declaration of its own takes the one pointed AT
 *      it. That is what makes a single line enough: the author writes `twin:`
 *      on the English post and the Arabic one knows.
 *
 *  A note's own line always wins for that note (pass 1 is never overwritten),
 *  because there is no third place that could arbitrate between two files
 *  that disagree — and a rule that silently preferred one file over the other
 *  would make the vault's state unreadable from the vault. `inconsistent` is
 *  how the disagreement reaches the reader instead.
 *
 *  AT MOST ONE TWIN. When several notes point at the same one, the shortest
 *  path wins (pickShortest's rule, the same tie-break every other name in the
 *  index is settled by) and the pair is marked inconsistent. */
function twins(): Map<string, TwinLink> {
  if (twinsCache !== null) return twinsCache;
  const declared = new Map<string, string>(); // note -> the note its own line names
  for (const record of notes.values()) {
    if (record.twinRef === null) continue;
    const target = resolveLink(record.twinRef, false, null);
    // A declaration naming nothing, or naming the note itself, is not a pair.
    if (target === null || target === record.path) continue;
    declared.set(record.path, target);
  }
  const claims = new Map<string, string[]>(); // note -> everyone pointing at it
  for (const [from, to] of declared) {
    let list = claims.get(to);
    if (list === undefined) claims.set(to, (list = []));
    list.push(from);
  }
  const out = new Map<string, TwinLink>();
  for (const record of notes.values()) {
    const mine = declared.get(record.path);
    const pointing = (claims.get(record.path) ?? []).filter((p) => p !== mine);
    if (mine !== undefined) {
      const theirs = declared.get(mine);
      // They declare someone else, or someone ELSE claims me: either way the
      // vault is saying two things at once.
      const inconsistent = (theirs !== undefined && theirs !== record.path) || pointing.length > 0;
      out.set(record.path, { path: mine, inconsistent });
      continue;
    }
    if (pointing.length === 0) continue;
    const sorted = [...pointing].sort(
      (a, b) => a.split("/").length - b.split("/").length || a.length - b.length || a.localeCompare(b),
    );
    out.set(record.path, { path: sorted[0], inconsistent: sorted.length > 1 });
  }
  twinsCache = out;
  return out;
}

/** This note's other face, or null. Unfiltered: the caller decides what the
 *  audience may see. */
export function twinOf(relPath: string): TwinLink | null {
  return twins().get(relPath) ?? null;
}

/** The pair, from one note's side, as the LINK-TIME SWAP sees it
 *  (shared/twins.ts readerFace). `publishedOnly` scopes reachability the way
 *  every other visitor surface does. */
function twinSides(relPath: string, publishedOnly: boolean, lang: FilterLang): TwinSides | null {
  const record = notes.get(relPath);
  if (record === undefined) return null;
  const link = twinOf(relPath);
  const other = link === null ? undefined : notes.get(link.path);
  return {
    self: { path: record.path, arabic: record.arabic, reachable: true },
    twin:
      other === undefined
        ? null
        : {
            path: other.path,
            arabic: other.arabic,
            reachable: !publishedOnly || isNoteVisibleToVisitor(other.path, lang),
          },
  };
}

/** THE LINK-TIME SWAP TABLE, for one reader.
 *
 *  A wikilink is resolved in the CLIENT, against the tree it was served — and
 *  a visitor's tree is language-scoped, so `[[Quantum Computers]]` written
 *  inside an Arabic post resolves to nothing at all for an Arabic reader
 *  while the Arabic face of that very note sits one file away. This table is
 *  the missing half: link key → the path of the face this reader can read.
 *
 *  EMPTY FOR AN ADMIN, by construction — `lang` is null on every admin
 *  surface and the swap stands down. The author linked what they linked.
 *
 *  Keyed under both spellings the resolver accepts (the path and the bare
 *  basename), because either could be what the author typed. */
export function twinSwapTable(lang: FilterLang): Record<string, string> {
  const out: Record<string, string> = {};
  if (lang === null) return out;
  for (const [from, link] of twins()) {
    const sides = twinSides(from, true, lang);
    const face = readerFace(sides, lang);
    if (face === null || face === from) continue;
    // Only worth a row when the link would otherwise land nowhere: the face
    // the author named is hidden from this reader, the other one is not.
    if (isNoteVisibleToVisitor(from, lang)) continue;
    void link;
    const record = notes.get(from);
    if (record === undefined) continue;
    out[twinSwapKey(from)] = face;
    out[twinSwapKey(path.posix.basename(from))] = face;
    for (const alias of record.aliases) out[twinSwapKey(alias)] = face;
  }
  return out;
}

/** The wire rows for `GET /api/twins` — one per twinned note, both
 *  directions, so every surface that draws a mark is a lookup. Admin-only;
 *  the visitor's half of that route is the swap table above. */
export function twinPairs(): TwinPair[] {
  const out: TwinPair[] = [];
  for (const [from, link] of twins()) {
    const me = notes.get(from);
    const other = notes.get(link.path);
    if (me === undefined || other === undefined) continue;
    out.push({
      path: me.path,
      mtimeMs: me.mtimeMs,
      face: me.face,
      lang: faceLang(me.arabic),
      twin: other.path,
      twinTitle: other.title,
      twinFace: other.face,
      twinLang: faceLang(other.arabic),
      twinMtimeMs: other.mtimeMs,
      inconsistent: link.inconsistent,
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** The other face of a POST, for the public site: the switch that takes a
 *  reader to their own language, the `hreflang` pair, and the "another face
 *  of this note" line a same-language pair gets instead.
 *
 *  Published-gated and NOT language-gated, deliberately: the whole value of
 *  the field is that it names the face the reader is not being shown. */
export function twinFaceOf(relPath: string): TwinFaceRef | null {
  const link = twinOf(relPath);
  if (link === null || !publishedSet.has(link.path)) return null;
  const other = notes.get(link.path);
  if (other === undefined) return null;
  const me = notes.get(relPath);
  return {
    path: other.path,
    title: other.title,
    face: other.face,
    lang: faceLang(other.arabic),
    differs: me !== undefined && facesDiffer(faceLang(me.arabic), faceLang(other.arabic)),
  };
}

/** Resolve a link/embed target to a note OR attachment path. Notes win
 *  (attachment basenames carry an extension, so collisions are rare).
 *  `publishedOnly` sees only visitor-visible notes (resolveLink applies the
 *  languageFilter) + allowlisted attachments. Attachments are deliberately NOT
 *  language-filtered: an attachment belongs to no language, and a hidden
 *  note's images must keep loading on its own still-working permalink. */
export function resolveEmbed(name: string, publishedOnly: boolean, lang: FilterLang): string | null {
  const asNote = resolveLink(name, publishedOnly, lang);
  if (asNote) return asNote;
  const key = name.split(/[#|]/)[0].trim().toLowerCase();
  if (!key) return null;
  // A PATH-FORM target names its file exactly: `![[attachments/Voice/2026-09-23
  // 1402.webm]]`, which is what a voice note writes (shared/voice.ts) and what
  // Obsidian writes under "absolute path in vault". The index below is keyed
  // by BASENAME, so a target with a folder in it matched nothing — the embed
  // drew the broken ⌀ and the file read as unreferenced to the unused-
  // attachments sweep. The exact path first, then the basename ladder.
  if (key.includes("/")) {
    const exact = attachmentHit(key.replace(/^\/+/, ""));
    if (exact && (!publishedOnly || allowedAttachments().has(exact))) return exact;
  }
  let candidates = attachmentsByName.get(key);
  if (!candidates || candidates.size === 0) return null;
  if (publishedOnly) {
    const allowed = allowedAttachments();
    const kept = filterCandidates(candidates, (p) => allowed.has(p));
    if (!kept) return null;
    candidates = kept;
  }
  return pickShortest(candidates);
}

// ------------------------------------------------- anchors & cross-references

/** The anchor table for an indexed note — headings, `\label`s, sections,
 *  equations, figures, tables — sorted by source line. Empty for an unknown
 *  path AND for an oversized one (its body was never read), which is why every
 *  caller treats an empty table as "no anchor matched" rather than an error. */
export function noteAnchors(relPath: string): NoteAnchor[] {
  return notes.get(relPath)?.anchors ?? [];
}

/** Where one LaTeX cross-reference points, or null. A `\cite` answers the note
 *  carrying the key; a `\ref` answers the note defining the label. Both are
 *  vault-wide lookups reached only AFTER the document's own definitions have
 *  been checked — the local-first rule lives in server/texNote.ts, which never
 *  records a `\ref` whose label is defined in the same file. */
export function resolveXref(
  xref: NoteRecord["xrefs"][number],
  publishedOnly: boolean,
  lang: FilterLang,
): string | null {
  if (xref.kind === "cite") return resolveCitekey(xref.key, publishedOnly, lang);
  return resolveLabel(xref.key, publishedOnly, lang)?.path ?? null;
}

/** The note a `\label{…}` lives in, for a `\ref` that found no local match.
 *
 *  LOCAL-FIRST is the caller's job and is not optional: a `\ref` that matches
 *  a label in its own document must never look here, or importing a project
 *  into a vault could change what its own cross-references point at — which is
 *  precisely the promise that makes dropping a LaTeX project into Astrolabe safe.
 *
 *  `publishedOnly` scopes to what a visitor may discover, exactly as
 *  resolveLink does: an anonymous caller must not learn that a private note
 *  defines `sec:acquisition`. */
export function resolveLabel(
  label: string,
  publishedOnly: boolean,
  lang: FilterLang,
): { path: string; anchor: NoteAnchor } | null {
  const key = label.trim().toLowerCase();
  if (!key) return null;
  let candidates = byLabel.get(key);
  if (!candidates || candidates.size === 0) return null;
  if (publishedOnly) {
    const kept = filterCandidates(candidates, (p) => isNoteVisibleToVisitor(p, lang));
    if (!kept) return null;
    candidates = kept;
  }
  const notePath = pickShortest(candidates);
  const anchor = notes.get(notePath)?.anchors.find((a) => a.id.toLowerCase() === key);
  return anchor ? { path: notePath, anchor } : null;
}

/** The note that CARRIES a citation key — a `\bibitem{knuth1997}` or a
 *  frontmatter `citekey: knuth1997`. Null leaves the `\cite` alone as an
 *  ordinary bibliography reference, which is the honest default: most keys in
 *  a real paper name a book, not a note. */
export function resolveCitekey(key: string, publishedOnly: boolean, lang: FilterLang): string | null {
  const want = key.trim().toLowerCase();
  if (!want) return null;
  let candidates = byCitekey.get(want);
  if (!candidates || candidates.size === 0) return null;
  if (publishedOnly) {
    const kept = filterCandidates(candidates, (p) => isNoteVisibleToVisitor(p, lang));
    if (!kept) return null;
    candidates = kept;
  }
  return pickShortest(candidates);
}

// ------------------------------------------------------------------- banners

/** THE image-reference ladder — one function, four rungs, and every banner
 *  surface in the product climbs it (note frontmatter, the blog hero and its
 *  thumbnails, og:image, the dashboard hero, the logo and favicon settings,
 *  and GET /api/banner for the client's own render paths).
 *
 *  In order: an `https://` URL passes through (http:/data:/anything else is
 *  refused — a mixed-content <img> is worse than the generated fallback); an
 *  exact vault-relative path; that path RELATIVE TO THE REFERRING NOTE'S OWN
 *  FOLDER, which is where an Obsidian user keeps a note's images; then the
 *  basename, resolved exactly as `![[embed]]` resolves it (case-insensitive,
 *  shortest path wins).
 *
 *  The third and fourth rungs are the bug this exists for. `banner: cover.png`
 *  is what every Obsidian user writes, wikilinks and embeds have always
 *  resolved a bare name from anywhere in the vault, and the banner alone
 *  demanded the file sit at the vault ROOT — so the one link form with no
 *  autocomplete behind it was also the one with the strictest rule, and it
 *  failed by rendering nothing.
 *
 *  `fromDir` is the referring note's folder ("" for the vault root, undefined
 *  when the reference belongs to no note — a settings value). */
export function resolveImageRef(value: string, fromDir?: string): string | null {
  const raw = value.trim();
  if (raw === "") return null;
  if (/^https:\/\//i.test(raw)) return raw;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null; // http:, data:, javascript:…
  const rel = normalizeRefPath(raw);
  if (rel === "") return null;
  // 1. exact vault-relative path (case-insensitively — see attachmentsByPathLower)
  const exact = attachmentHit(rel);
  if (exact) return exact;
  // 2. relative to the note's own folder ("cover.png" beside the note,
  //    "img/cover.png" under it, "../shared/cover.png" beside its parent)
  if (fromDir !== undefined && fromDir !== "") {
    const joined = normalizeRefPath(`${fromDir}/${rel}`);
    if (joined !== "") {
      const near = attachmentHit(joined);
      if (near) return near;
    }
  }
  // 3. basename, through the resolver embeds use
  const byName = resolveEmbed(path.posix.basename(rel), false, null);
  return byName !== null && attachmentPaths.has(byName) ? byName : null;
}

/** A reference path in vault-relative form: backslashes folded, `.`/`..`
 *  segments applied, leading and trailing slashes dropped. A `..` that walks
 *  above the vault root leaves nothing to resolve, and says so with "". */
function normalizeRefPath(value: string): string {
  const parts: string[] = [];
  for (const seg of value.replace(/\\/g, "/").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return "";
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join("/");
}

/** An indexed attachment at this exact path, case-insensitively. */
function attachmentHit(rel: string): string | null {
  if (attachmentPaths.has(rel)) return rel;
  return attachmentsByPathLower.get(rel.toLowerCase()) ?? null;
}

/** The folder a note lives in ("" at the vault root). */
export function folderOf(relPath: string): string {
  const cut = relPath.lastIndexOf("/");
  return cut === -1 ? "" : relPath.slice(0, cut);
}

/** A note's `banner:` value resolved against the ladder above, with the note's
 *  own folder as the relative base. null when unset/unresolvable. */
export function resolveBanner(record: NoteRecord): string | null {
  if (!record.banner) return null;
  return resolveImageRef(record.banner, folderOf(record.path));
}

/** GET /api/banner: the same ladder, for a value the CLIENT holds (frontmatter
 *  it has just parsed, a settings value it is about to paint). `notePath` is
 *  the note the value came from, when it came from one.
 *
 *  `publishedOnly` is the visitor scope, and it is the same gate /api/file
 *  applies: a visitor may learn where a banner resolved only when the file is
 *  one they are allowed to fetch. Otherwise the answer is null, which every
 *  caller renders as "no banner" — never as a path that would 404. */
export function resolveBannerRef(
  value: string,
  notePath: string | null,
  publishedOnly: boolean,
  visitorMayFetch: (relPath: string) => boolean,
): string | null {
  const hit = resolveImageRef(value, notePath === null ? undefined : folderOf(notePath));
  if (hit === null || /^https:\/\//i.test(hit)) return hit;
  if (publishedOnly && !visitorMayFetch(hit)) return null;
  return hit;
}

/** A published note's banner as the client uses it (https URL or allowlisted
 *  attachment path), or null. Exported for the blog head injection (og:image). */
export function publishedBanner(relPath: string): string | null {
  if (!publishedSet.has(relPath)) return null;
  const record = notes.get(relPath);
  return record ? resolveBanner(record) : null;
}
