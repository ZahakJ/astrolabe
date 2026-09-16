// NEARBY — related notes without a model anywhere near them.
//
// "What else did I write about this?" is the question the backlinks panel
// answers only when the author remembered to link, and a vault of atomic
// notes is mostly notes nobody linked yet. The answer here is the oldest one
// in information retrieval and still the honest one: two notes are near when
// they use the same UNUSUAL words. TF-IDF weighs each word by how rare it is
// across the vault (a word in every note weighs nothing, a word in three
// notes weighs a lot), and the cosine between two notes' weight vectors says
// how much of their rare vocabulary they share, size of note aside. Tags
// ride along as terms with extra weight: a shared tag is a stronger tie than
// a shared word, because somebody chose it.
//
// This module is PURE — text in, scores out, no vault, no index — so its
// every rule is tested under `node --test` on a dozen sentences, and the
// server (server/nearby.ts) is only a cache around it. It is written on
// typed arrays rather than Maps of strings for one reason: a corpus of ten
// thousand notes at three hundred terms each is three million entries, and
// three million Map entries of string keys are a few hundred megabytes where
// three million integers are thirty.

import { foldTerm } from "./fold.ts";

/** How many distinct terms a note keeps, most frequent first. A long note's
 *  three-hundredth most frequent word is not what it is about. */
export const TERMS_PER_NOTE = 300;
/** How many tokens of a note are read at all — the server's prose is already
 *  capped at 128 kB, this is a second belt for a pathological one. */
const TOKENS_MAX = 40_000;
/** A tag counts as this many occurrences of a word. */
const TAG_WEIGHT = 4;
/** A title word counts this many extra times. */
const TITLE_WEIGHT = 2;
/** Below this cosine two notes are strangers and the panel says nothing. */
export const NEARBY_MIN_SCORE = 0.03;

const SPLIT_RE = /[^\p{L}\p{N}\p{M}]+/u;
const DIGITS_RE = /^\p{N}+$/u;

/** One text's terms, folded like search (shared/fold.ts) so «الْمُقَدِّمَة»
 *  and «المقدمة» are one term, words under three letters and bare numbers dropped
 *  (a two-letter word is a function word in English and in Arabic alike —
 *  "on", "of", "في", "من" — and a stop list in one language is a bug in the
 *  other; length is the rule that needs no dictionary),
 *  and cut to the TERMS_PER_NOTE most frequent. Insertion order breaks
 *  ties, so the word the author used first wins a tie at the cut. */
export function countTerms(text: string, tags: readonly string[] = [], title = "", spellings?: Map<string, string>): Map<string, number> {
  const counts = new Map<string, number>();
  const bump = (term: string, by: number): void => {
    counts.set(term, (counts.get(term) ?? 0) + by);
  };
  // The folded term is the KEY, never what a reader is shown: «المقدمه» is
  // how the index spells «المقدمة» and "resume" how it spells "résumé", and
  // a chip that says either is a misspelling to the person who wrote the
  // note. The caller's map takes the first spelling the author used, case
  // aside, so the panel can say the word the way the vault says it.
  const spell = (term: string, raw: string): void => {
    if (spellings !== undefined && !spellings.has(term)) spellings.set(term, raw);
  };
  const words = (source: string, by: number): void => {
    let seen = 0;
    for (const raw of source.split(SPLIT_RE)) {
      if (raw === "") continue;
      if (++seen > TOKENS_MAX) break;
      const term = foldTerm(raw);
      if (term.length < 3 || DIGITS_RE.test(term)) continue;
      bump(term, by);
      spell(term, raw.toLocaleLowerCase());
    }
  };
  words(text, 1);
  words(title, TITLE_WEIGHT);
  for (const tag of tags) {
    const raw = tag.trim().replace(/^#/, "");
    const key = foldTerm(raw);
    if (key === "") continue;
    bump(`#${key}`, TAG_WEIGHT);
    spell(`#${key}`, `#${raw}`);
    // A nested tag is also its parent: `#book/history` ties to `#book/fiction`
    // through `#book`, more weakly than two notes that share the leaf.
    const slash = key.indexOf("/");
    if (slash > 0) {
      bump(`#${key.slice(0, slash)}`, TAG_WEIGHT / 2);
      spell(`#${key.slice(0, slash)}`, `#${raw.slice(0, raw.indexOf("/"))}`);
    }
  }
  if (counts.size <= TERMS_PER_NOTE) return counts;
  return new Map([...counts].sort((a, b) => b[1] - a[1]).slice(0, TERMS_PER_NOTE));
}

/** The vocabulary: every term the corpus has seen, numbered once. Ids are
 *  stable for the table's life, so a vector built last week still names the
 *  same words. */
export class TermTable {
  private readonly ids = new Map<string, number>();
  readonly names: string[] = [];
  /** What a term is SHOWN as, by id: the first author's spelling of it
   *  (countTerms' spellings), else the folded name. Sparse. */
  private readonly shown: string[] = [];
  idOf(term: string): number {
    let id = this.ids.get(term);
    if (id === undefined) {
      id = this.names.length;
      this.ids.set(term, id);
      this.names.push(term);
    }
    return id;
  }
  /** Keep a spelling for a term, the first one offered winning: a vocabulary
   *  is spelled once, by whoever used the word first. */
  spell(term: string, raw: string): void {
    const id = this.idOf(term);
    if (this.shown[id] === undefined && raw !== term) this.shown[id] = raw;
  }
  shownOf(id: number): string {
    return this.shown[id] ?? this.names[id];
  }
  get size(): number {
    return this.names.length;
  }
}

/** A note's term counts, interned: ids ascending, one count per id. */
export interface TermVector {
  ids: Uint32Array;
  counts: Float32Array;
}

export function internTerms(counts: ReadonlyMap<string, number>, table: TermTable, spellings?: ReadonlyMap<string, string>): TermVector {
  const pairs = [...counts].map(([term, n]) => [table.idOf(term), n] as const).sort((a, b) => a[0] - b[0]);
  if (spellings !== undefined) {
    for (const term of counts.keys()) {
      const raw = spellings.get(term);
      if (raw !== undefined) table.spell(term, raw);
    }
  }
  return { ids: Uint32Array.from(pairs, (p) => p[0]), counts: Float32Array.from(pairs, (p) => p[1]) };
}

/** In how many documents each term id appears. */
export function documentFrequency(docs: Iterable<TermVector>, vocabulary: number): Uint32Array {
  const df = new Uint32Array(vocabulary);
  for (const doc of docs) for (const id of doc.ids) df[id]++;
  return df;
}

/** A note as a weighted vector: ids ascending, `(1 + ln tf) · ln(N / df)` per
 *  term, and the vector's length. Sublinear tf, so a word repeated fifty
 *  times is not fifty times the note; plain ln(N/df) rather than a smoothed
 *  idf, so a word in EVERY note weighs exactly nothing and needs no stop
 *  list in any language. Terms that weigh nothing are left out. */
export interface WeightedVector {
  ids: Uint32Array;
  weights: Float32Array;
  norm: number;
}

export function weigh(doc: TermVector, df: Uint32Array, corpusSize: number): WeightedVector {
  const ids: number[] = [];
  const weights: number[] = [];
  let sum = 0;
  for (let i = 0; i < doc.ids.length; i++) {
    const id = doc.ids[i];
    const d = df[id] ?? 0;
    if (d === 0 || d >= corpusSize) continue;
    const w = (1 + Math.log(doc.counts[i])) * Math.log(corpusSize / d);
    if (w <= 0) continue;
    ids.push(id);
    weights.push(w);
    sum += w * w;
  }
  return { ids: Uint32Array.from(ids), weights: Float32Array.from(weights), norm: Math.sqrt(sum) };
}

export interface Similarity {
  /** Cosine, 0 … 1. */
  score: number;
  /** The term ids that contributed most, largest first. */
  top: number[];
}

/** The cosine between two vectors and the terms that made it. A merge walk
 *  over two ascending id lists, so it costs the sum of their lengths. */
export function similarity(a: WeightedVector, b: WeightedVector, topCount = 2): Similarity {
  if (a.norm === 0 || b.norm === 0) return { score: 0, top: [] };
  let dot = 0;
  const contributions: { id: number; w: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.ids.length && j < b.ids.length) {
    const x = a.ids[i];
    const y = b.ids[j];
    if (x === y) {
      const w = a.weights[i] * b.weights[j];
      dot += w;
      contributions.push({ id: x, w });
      i++;
      j++;
    } else if (x < y) i++;
    else j++;
  }
  contributions.sort((p, q) => q.w - p.w);
  return { score: dot / (a.norm * b.norm), top: contributions.slice(0, topCount).map((c) => c.id) };
}

export interface NearbyCandidate {
  path: string;
  title: string;
  vector: WeightedVector;
}

export interface NearbyMatch {
  path: string;
  title: string;
  score: number;
  terms: string[];
}

/** The `limit` candidates nearest `target`, best first, strangers left out. */
export function nearest(
  target: WeightedVector,
  candidates: Iterable<NearbyCandidate>,
  table: TermTable,
  limit = 10,
  minScore = NEARBY_MIN_SCORE,
): NearbyMatch[] {
  const hits: NearbyMatch[] = [];
  for (const c of candidates) {
    const sim = similarity(target, c.vector);
    if (sim.score < minScore) continue;
    hits.push({ path: c.path, title: c.title, score: sim.score, terms: sim.top.map((id) => table.shownOf(id)) });
  }
  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return hits.slice(0, limit);
}
