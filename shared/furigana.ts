// Furigana — the small kana printed over a kanji to say how it is read.
//
// THE SYNTAX IS BORROWED, NOT INVENTED. A note that carries `{漢字|かんじ}`
// is readable by the Obsidian "Markdown Furigana" plugin exactly as it is,
// and a vault that already used that plugin renders here untouched: the
// whole reason to pick a syntax is that the note stays a plain text file
// that more than one program can read. Two shapes, both the plugin's:
//
//   {漢字|かんじ}     one reading for the whole base
//   {漢字|かん|じ}    one reading per KANJI, in order — kana inside the base
//                    are skipped (`{食べ物|た|もの}`: べ takes nothing)
//
// The raw `<ruby>` HTML a reader may already have written keeps working
// beside this (client/reading/rawHtml.ts allows ruby/rt/rp); this file is
// only about the brace form. Everything here is pure and shared by the three
// surfaces that draw it — the reading view, the editor's live preview and,
// through the reading renderer, the published site — so they cannot disagree
// about what a span means. The readings table and the suggestion order are
// shared/furiganaReadings.ts, kept apart so that this file stays the few
// hundred bytes every reader pays for and that one stays the editor's.

/** One `{base|reading…}` span found in a line. `start`/`end` are offsets into
 *  the line, `end` exclusive (the closing brace included). */
export interface FuriganaSpan {
  start: number;
  end: number;
  base: string;
  readings: string[];
}

/** One drawn piece: base text with its reading over it, or plain text with
 *  none (a kana run inside a per-character base). */
export interface RubySegment {
  text: string;
  rt: string | null;
}

// ── Script tests ───────────────────────────────────────────────────────────
// Codepoint ranges, not a language detector, the same bargain shared/script.ts
// makes for Arabic: a property of the characters, cheap and total.

/** CJK unified ideographs (with the extension and compatibility blocks a
 *  jōyō list can reach) and the repetition mark 々, which reads with the
 *  kanji before it and belongs to its run. */
const KANJI_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3005]/u;
/** Hiragana and katakana, the half-width forms included. */
const KANA_RE = /[\u3040-\u30ff\uff66-\uff9f]/u;
/** Anything that says "this line is Japanese": kana or a kanji. Han alone is
 *  also Chinese, but kana is unmistakable, and a line of bare Han in this
 *  vault is far likelier a Japanese note than a Chinese one — and the cost
 *  of being wrong is one font stack, not a dictionary. */
export const JAPANESE_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/u;

export function isKanji(ch: string): boolean {
  return KANJI_RE.test(ch);
}

export function isKana(ch: string): boolean {
  return KANA_RE.test(ch);
}

export function hasJapanese(text: string): boolean {
  return JAPANESE_RE.test(text);
}

export function hasKanji(text: string): boolean {
  return KANJI_RE.test(text);
}

/** The kanji of a base, in order — the characters a per-character reading
 *  list maps onto. */
export function kanjiOf(base: string): string[] {
  return [...base].filter(isKanji);
}

// ── Parse ──────────────────────────────────────────────────────────────────

/** A brace group: no braces or newline inside, at least one `|`. The base
 *  must carry a Japanese character, or `{x|y}` in an English sentence about
 *  sets would sprout a ruby — the plugin renders that; this product would
 *  rather leave an English note exactly as it was. */
const SPAN_RE = /\{([^{}|\n]+)((?:\|[^{}|\n]*)+)\}/g;

/** Every furigana span in `text` (one line, or several — a span never crosses
 *  a newline). A `\{` is an escaped brace and never opens one; a `{` with no
 *  `|` before its `}` is not furigana; with nested braces the INNERMOST group
 *  is the span and the outer braces are ordinary text, which is what the
 *  regex finds and what a reader would expect of `{{漢字|かんじ}}`. */
export function findFurigana(text: string): FuriganaSpan[] {
  const out: FuriganaSpan[] = [];
  SPAN_RE.lastIndex = 0;
  for (let m = SPAN_RE.exec(text); m; m = SPAN_RE.exec(text)) {
    if (m.index > 0 && text[m.index - 1] === "\\") continue;
    const base = m[1];
    if (!hasJapanese(base)) continue;
    const readings = m[2].slice(1).split("|");
    // An empty reading is a typo, not a request for an empty annotation.
    if (readings.some((r) => r.trim() === "")) continue;
    out.push({ start: m.index, end: m.index + m[0].length, base, readings });
  }
  return out;
}

/** The span of `text` that a selection `[from, to)` touches, or null. A
 *  selection that lands inside a span — its base, its reading, one of its
 *  braces — is an intent to EDIT that span, not to open a second one inside
 *  it: a popover that wrapped the base of `{漢字|かんじ}` again would write
 *  `{{漢字|かんじ}|かんじ}`, and the innermost-wins rule above would then
 *  show the outer braces as text. The editor's door (client/editor/
 *  furigana.ts) widens the selection to what this returns. */
export function furiganaSpanAt(text: string, from: number, to: number): FuriganaSpan | null {
  for (const span of findFurigana(text)) {
    if (from < span.end && to > span.start) return span;
  }
  return null;
}

/** The brace form of a base and its readings — the one spelling every
 *  surface writes, so a note never carries two. */
export function serialiseFurigana(base: string, readings: string[]): string {
  return `{${base}|${readings.join("|")}}`;
}

/** Which pieces to draw. One reading: the whole base under it. Several: each
 *  kanji takes the next reading, kana between them take nothing, and a run
 *  of consecutive kanji stays one segment per kanji so each kana sits over
 *  its own character. A count that does not match the kanji (three readings
 *  for two kanji, or one short) is a note written by hand and slightly off;
 *  the honest rendering is the joined reading over the whole word, which is
 *  what the writer meant and what the plugin draws too. */
export function rubySegments(base: string, readings: string[]): RubySegment[] {
  if (readings.length === 1) return [{ text: base, rt: readings[0] }];
  const kanji = kanjiOf(base);
  if (kanji.length !== readings.length) return [{ text: base, rt: readings.join("") }];
  const out: RubySegment[] = [];
  let k = 0;
  let plain = "";
  for (const ch of base) {
    if (isKanji(ch)) {
      if (plain !== "") {
        out.push({ text: plain, rt: null });
        plain = "";
      }
      out.push({ text: ch, rt: readings[k++] });
    } else {
      plain += ch;
    }
  }
  if (plain !== "") out.push({ text: plain, rt: null });
  return out;
}

/** The plain words of a line with its furigana braces taken off — the base
 *  alone, which is what an outline entry, a search hit or a copied title
 *  should carry. */
export function stripFurigana(text: string): string {
  const spans = findFurigana(text);
  if (spans.length === 0) return text;
  let out = "";
  let at = 0;
  for (const s of spans) {
    out += text.slice(at, s.start) + s.base;
    at = s.end;
  }
  return out + text.slice(at);
}

