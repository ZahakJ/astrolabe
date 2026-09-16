// The Nearby corpus: a cache around shared/nearby.ts, fed by the index.
//
// Two caches with two lifetimes, because the two halves of the work cost
// differently. TOKENIZING a note (countTerms) is the expensive half and
// depends on that note alone, so it is kept per path and keyed by the note's
// mtime — a save re-tokenizes one note and nothing else. WEIGHING every note
// (df, idf, the vectors) is cheap per note but depends on the whole corpus,
// so it is thrown away whenever the index changes shape (indexer.ts
// nearbyRev, bumped at the index's own mutations, which the watcher drives)
// and rebuilt on the next request rather than on the event: a panel nobody
// has open costs nothing while a sync storm rewrites four hundred notes.

import { TermTable, countTerms, documentFrequency, internTerms, nearest, weigh, type TermVector, type WeightedVector } from "../shared/nearby.ts";
import type { NearbyHit } from "../shared/types.ts";
import { nearbySources } from "./indexer.ts";

const NEARBY_LIMIT = 10;

const table = new TermTable();
const terms = new Map<string, { mtimeMs: number; vector: TermVector }>();
let weighed: { rev: number; vectors: Map<string, WeightedVector> } | null = null;

/** Every note's weighted vector at the index's current revision. */
function corpus(): { vectors: Map<string, WeightedVector>; titles: Map<string, string> } {
  const { rev, notes } = nearbySources();
  const titles = new Map(notes.map((n) => [n.path, n.title]));
  if (weighed !== null && weighed.rev === rev) return { vectors: weighed.vectors, titles };
  const live = new Set<string>();
  for (const note of notes) {
    live.add(note.path);
    const have = terms.get(note.path);
    if (have !== undefined && have.mtimeMs === note.mtimeMs) continue;
    // The author's spellings ride along so the panel's chips say «المقدمة»
    // and "résumé", not the folded keys the scoring runs on.
    const spellings = new Map<string, string>();
    terms.set(note.path, { mtimeMs: note.mtimeMs, vector: internTerms(countTerms(note.prose(), note.tags, note.title, spellings), table, spellings) });
  }
  // A deleted or moved note leaves the table; its term ids stay interned,
  // which is a vocabulary's price and not a leak that grows with edits.
  for (const path of [...terms.keys()]) if (!live.has(path)) terms.delete(path);
  const df = documentFrequency([...terms.values()].map((t) => t.vector), table.size);
  const vectors = new Map<string, WeightedVector>();
  for (const [path, { vector }] of terms) vectors.set(path, weigh(vector, df, terms.size));
  weighed = { rev, vectors };
  return { vectors, titles };
}

/** The ten notes that read most like `path`, with the terms that tie them.
 *  An unknown path (a note the index has not seen, an attachment) answers
 *  with nothing rather than a 404: the panel is a side note, not a page. */
export function nearbyNotes(path: string): NearbyHit[] {
  const { vectors, titles } = corpus();
  const target = vectors.get(path);
  if (target === undefined) return [];
  const candidates = (function* () {
    for (const [p, vector] of vectors) if (p !== path) yield { path: p, title: titles.get(p) ?? p, vector };
  })();
  return nearest(target, candidates, table, NEARBY_LIMIT).map((m) => ({
    path: m.path,
    title: m.title,
    score: Math.round(m.score * 1000) / 1000,
    terms: m.terms,
  }));
}
