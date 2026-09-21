// Linguistic twins: one note with two faces.
//
// The owner writes the same post twice — once in English, once in Arabic —
// and wants the pair to behave like ONE note that can be turned over, not
// like two files that happen to be about the same thing. On disk they must
// stay two files ("we preserve everything globally as a md"); in the editor
// and on the public site they are two faces of one idea.
//
// A TWIN IS A FACE, NOT A TRANSLATION. Language is the common case, not the
// definition: a long version and a short one, a formal draft and a plain one,
// both in English, are the same relation and get the same machinery. What
// differs is only what the PUBLIC SITE does with the pair — the ع/EN switch,
// `hreflang`, the one-face-per-reader lists and the link-time swap are all
// answers to the question "which language is this reader reading in", so they
// apply only when the two faces' languages actually differ. Two English
// faces are two posts, both listed if both are published (they are two files;
// that is honest), each naming the other on its article page.
//
// A face may carry a NAME of its own — frontmatter `face: short` — which is
// what makes a same-language pair speakable. When neither side names itself,
// the pill falls back to the two languages, and when those are the same too,
// to the two titles.
//
// THE NOTE IS THE STATE. The whole relation is one frontmatter line on either
// file:
//
//     twin: [[مقالة]]
//
// and nothing else — no manifest, no sidecar, no id. One declaration is
// enough: the indexer makes the relation symmetric (server/indexer.ts
// twinOf), so the second file can stay untouched until its author feels like
// editing it. If BOTH declare and they disagree, each note's own line wins
// for that note and the status bar says the pair is inconsistent — the honest
// answer, because there is no third place that could arbitrate.
//
// This module is the pure half: what a declaration means, when a face is
// stale, and the link-time swap the public site applies. No filesystem, no
// index, no DOM — so tests/twins.test.ts can pin every rule without a vault.

/** The frontmatter key. One spelling, because a second one would be a second
 *  contract to keep (`aliases:`/`alias:` earned its pair by arriving from
 *  Obsidian vaults; this key has no history to honour). */
export const TWIN_KEY = "twin";

/** How far behind a twin may fall before the pill carries its dot.
 *
 *  A minute, not a second: saving both faces of a post in one sitting writes
 *  them seconds apart, and a hint that lights every time you touch a note is
 *  a hint nobody reads. A minute is also short enough that "I rewrote the
 *  English this morning" is still visible this afternoon. */
export const TWIN_STALE_MS = 60_000;

/** The twin a note DECLARES, as a link target — `[[Other Note]]` unwrapped,
 *  or a bare path, or null when the note declares none.
 *
 *  A wikilink is the spelling to reach for (it is the one the rest of the
 *  vault uses, it renames with the file, and `[[` completion offers it), but
 *  a bare `twin: posts/مقالة.md` is accepted too: an author who has just
 *  copied a path out of the tree should not have to learn a second syntax to
 *  use it. Both go through the ordinary link resolver afterwards, so an
 *  alias, a basename and a full path all work exactly as they do anywhere
 *  else.
 *
 *  A LIST takes its first item. YAML gives an author three ways to spell one
 *  value and one of them is `twin:\n  - [[X]]`; a note may have at most one
 *  twin, so the rest is dropped rather than silently turning the key into a
 *  second alias table. */
export function parseTwinRef(fm: Record<string, unknown>): string | null {
  const raw = firstScalar(fm[TWIN_KEY]);
  return raw === null ? null : cleanTwinRef(raw);
}

/** The first plain name inside whatever YAML made of the value.
 *
 *  `twin: [[Other Note]]` — the spelling this feature documents and the one
 *  every vault already writes for a wikilink — is, to YAML, a flow sequence
 *  inside a flow sequence: `[["Other Note"]]`. Reading only the outer array
 *  would find another array and give up, so the descent is the whole point of
 *  this function rather than an indulgence. `twin: "[[Other Note]]"` (quoted)
 *  arrives as a plain string and takes the first branch.
 *
 *  A name containing a COMMA has to be quoted — `[[Smith, John]]` is two flow
 *  items to YAML and nothing here can tell that from a two-item list. Same
 *  rule, same reason, as `aliases:` (server/noteFrontmatter.ts). */
function firstScalar(value: unknown, depth = 0): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  // Two levels is `[[X]]`; a third would be an author nesting for no reason.
  if (Array.isArray(value) && depth < 3) {
    for (const item of value) {
      const found = firstScalar(item, depth + 1);
      if (found !== null) return found;
    }
  }
  return null;
}

/** `[[Note|shown]]#Heading` → `Note`. The anchor and the pipe alias are
 *  dropped here rather than at resolution time: a twin is a WHOLE note, and
 *  `twin: [[Other#Introduction]]` names one all the same. */
export function cleanTwinRef(raw: string): string | null {
  let text = raw.trim();
  const wiki = /^!?\[\[([^\]]+)\]\]$/.exec(text);
  if (wiki) text = wiki[1];
  text = text.split("|")[0].split("#")[0].trim();
  // Quotes an author (or a YAML dumper) wrapped the value in.
  text = text.replace(/^["'](.*)["']$/s, "$1").trim();
  return text === "" ? null : text;
}

/** The frontmatter LINE that declares `target` as this note's twin — written
 *  as a wikilink, which is the form the rest of the vault reads and the form
 *  a rename rewrites. */
export function twinLine(target: string): string {
  return `${TWIN_KEY}: "[[${target.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}]]"`;
}

/** Has the twin fallen behind? `mineMs` and `theirsMs` are file mtimes.
 *
 *  A comparison, never a diff: this product does not read the two texts and
 *  guess whether one says something the other does not. It says "the Arabic
 *  side has not been touched since Tuesday" and stops there, which is a fact
 *  the filesystem already knows and the author can act on. */
export function twinIsStale(mineMs: number, theirsMs: number): boolean {
  return mineMs - theirsMs > TWIN_STALE_MS;
}

/** What one face is, for the link-time swap below. `arabic` is the indexer's
 *  own per-note detection: true for Arabic-majority prose, false for anything
 *  else, null when the note holds no prose letters at all and therefore
 *  belongs to no language. */
export interface TwinFace {
  path: string;
  arabic: boolean | null;
  /** May a reader in THIS scope actually reach it (published, and not curated
   *  away by the language filter)? A swap onto a face the reader may not see
   *  would be a link into a 404. */
  reachable: boolean;
}

/** One note as the swap sees it: itself, and the other face when it has one. */
export interface TwinSides {
  self: TwinFace;
  twin: TwinFace | null;
}

/** THE LINK-TIME SWAP.
 *
 *  `[[Quantum Computers]]` written inside the Arabic face of a post names an
 *  English note. On the public site, under languageFilter "follow", an Arabic
 *  reader following that link would land in a language they did not choose —
 *  while the Arabic face of the very same idea sits one file away. So the
 *  link is swapped at RENDER time to the face in the reader's language, when
 *  one exists and they can reach it.
 *
 *  Three rules and no more:
 *
 *   1. No reader language (`reader === null`, i.e. the filter is off or this
 *      is an admin surface) → no swap. Nothing to follow.
 *   2. The note the author linked is ALREADY in the reader's language → no
 *      swap, obviously; and a note that belongs to no language (`arabic ===
 *      null` — a picture, a table of numbers) counts as already right, because
 *      swapping it would be a guess.
 *   3. Otherwise, if the twin is in the reader's language and reachable, the
 *      twin wins. Otherwise the author's own target stands.
 *
 *  NEVER IN THE EDITOR. The author linked what they linked; a wikilink that
 *  landed somewhere else while they were writing would make the vault
 *  unwritable. Rule 1 is what enforces that — every admin surface resolves
 *  with a null language scope. */
export function readerFace(sides: TwinSides | null, reader: "ar" | "en" | null): string | null {
  if (sides === null) return null;
  if (reader === null) return sides.self.path;
  if (matchesReader(sides.self.arabic, reader)) return sides.self.path;
  const twin = sides.twin;
  if (twin !== null && twin.reachable && matchesReader(twin.arabic, reader)) return twin.path;
  return sides.self.path;
}

/** The key a wikilink target reduces to for the swap table — the same
 *  reduction the resolver itself makes (anchor and pipe alias off, note
 *  extension off, lowercased), so a table built on the server and consulted
 *  on the client cannot drift apart on spelling.
 *
 *  Path form is kept as a path (`[[posts/Note]]`), because that is a link key
 *  in its own right; both the path and the bare basename are filed by the
 *  builder, so either spelling finds the same face. */
export function twinSwapKey(target: string): string {
  const head = target.split(/[#|]/)[0].trim().toLowerCase();
  return head.replace(/\.(md|markdown|tex|latex|excalidraw)$/i, "").replace(/^\.?\/+/, "");
}

/** Is a face's own language the one this reader is reading in? A note with no
 *  prose letters (`null`) is in every language and in none — it is never
 *  swapped away from, and never swapped to. */
function matchesReader(arabic: boolean | null, reader: "ar" | "en"): boolean {
  if (arabic === null) return true;
  return arabic === (reader === "ar");
}

/** The BCP-47 tag a face's `hreflang` carries. Only two, because only two are
 *  what the language filter itself knows. A face with no prose letters is
 *  tagged with the instance's own side of the pair by the caller; here, the
 *  honest answer for "no language" is null and the caller decides. */
export function faceLang(arabic: boolean | null): "ar" | "en" | null {
  return arabic === null ? null : arabic ? "ar" : "en";
}

/** Do the two faces of a pair sit in DIFFERENT languages? Everything the
 *  public site does about twins hangs off this one question, and a face with
 *  no prose letters answers it "no": a note that belongs to no language
 *  cannot be the other language's edition of anything. */
export function facesDiffer(a: "ar" | "en" | null, b: "ar" | "en" | null): boolean {
  return a !== null && b !== null && a !== b;
}

/** The frontmatter key one face names itself with. */
export const FACE_KEY = "face";

/** A face's own short label — frontmatter `face: short`. Null when unset,
 *  which is the ordinary bilingual pair (its two languages say enough). */
export function parseFace(fm: Record<string, unknown>): string | null {
  const raw = fm[FACE_KEY];
  const text = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
  // One line, and short: this is drawn inside a status-bar pill and a tab.
  return text === "" ? null : text.split("\n")[0].slice(0, FACE_LABEL_MAX);
}

/** How much of a face label — or of a title standing in for one — a pill may
 *  carry before the bar stops being a bar. */
export const FACE_LABEL_MAX = 24;

/** WHAT THE PILL SAYS, for one side of a pair.
 *
 *  Three rungs, in this order, and the pair picks ONE rung for both sides so
 *  the two halves of `A ⇄ B` are always the same kind of thing:
 *
 *   1. the faces' own `face:` labels, when either side names itself;
 *   2. else the two languages, when they differ (`EN` and `ع`);
 *   3. else the two titles, shortened.
 *
 *  `langsDiffer` is `facesDiffer(...)` computed once for the pair; `named` is
 *  "either side carries a face label". Both are passed in rather than
 *  recomputed per side, because a rung chosen per side is how `EN ⇄ short`
 *  happens. */
export function twinFaceLabel(
  face: string | null,
  lang: "ar" | "en" | null,
  title: string,
  opts: { named: boolean; langsDiffer: boolean },
): string {
  if (opts.named) return face ?? (opts.langsDiffer ? langMark(lang) : shortFace(title));
  if (opts.langsDiffer) return langMark(lang);
  return shortFace(title);
}

/** The two-letter face a language wears in chrome. Not translated: `ع` and
 *  `EN` are what the visitor's own switch already draws, and a reader looking
 *  for the Arabic side is looking for that glyph. */
export function langMark(lang: "ar" | "en" | null): string {
  return lang === "ar" ? "ع" : "EN";
}

/** A title cut down to pill size, at a word boundary when there is one. */
export function shortFace(title: string): string {
  const text = title.trim();
  if (text.length <= FACE_LABEL_MAX) return text;
  const cut = text.slice(0, FACE_LABEL_MAX);
  const space = cut.lastIndexOf(" ");
  return `${space > FACE_LABEL_MAX / 2 ? cut.slice(0, space) : cut}…`;
}

/** The default name the "Create twin…" prompt offers.
 *
 *  A twin is USUALLY the other language, so the default is the note's own
 *  name with the other language's suffix — and the owner may type anything
 *  over it, which is how a same-language face ("Elden Ring, the long one") or
 *  a real Arabic title gets made. Nothing downstream ever parses this back:
 *  the relation is the `twin:` line, never the filename.
 *
 *  `mine` is the source note's title (its basename, no extension). */
export function defaultTwinName(mine: string, otherLang: "ar" | "en"): string {
  const suffix = otherLang === "ar" ? " — ar" : " — en";
  // A name that already carries the suffix (the owner making the twin of a
  // twin) does not get a second one.
  return mine.endsWith(suffix) ? mine : `${mine}${suffix}`;
}
