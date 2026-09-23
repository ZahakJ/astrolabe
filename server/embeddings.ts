// THE MEANING INDEX — every note, cut into passages, each passage a vector
// (docs/ask.md). What meaning search, Related, Suggest links and the answer
// panel's retrieval all read.
//
// LOCAL AND INCREMENTAL. The vectors come from Ollama on this machine
// (server/ollama.ts) and are kept in ASTROLABE_DATA/embeddings.db (node:sqlite,
// the store server/comments.ts opened first), KEYED BY A HASH OF WHAT THE MODEL
// WAS SHOWN plus the model's name. An unchanged passage — in a note that was
// edited somewhere else, in a note that was renamed and kept its heading, on a
// restart — is found by its hash and never embedded twice. The database is a
// cache: deleting it costs one re-embedding pass and loses nothing, and it is
// never mirrored into the vault (configMirror.ts's NEVER list).
//
// FED BY THE INDEXER, NEVER BLOCKING IT. The index does not read the vault on
// its own schedule: it asks the note index what exists (indexer.ts
// nearbySources: path, title, mtime), re-cuts only the notes whose mtime moved,
// and is woken by the vault watcher's own event stream AFTER the note index has
// applied the event (whenIndexed). A save returns before any of this starts;
// the embedding pass runs in the background, one batch at a time, and a burst
// of events is one pass. Boot does the same thing, unawaited, after the note
// index is built — so the indexer's cold start pays nothing for it
// (check-perf measures that).
//
// IN-PROCESS COSINE. A vault is thousands of notes, not millions: a few tens
// of thousands of unit vectors compared by a dot product is milliseconds, and
// a vector database would be a second service to install for no measurable
// gain.

import { createHash } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  centroid,
  chunkNote,
  dot,
  embedInput,
  embedPrefixes,
  normalize,
  rankTop,
  type NoteChunk,
} from "../shared/semantic.ts";

/** One passage in memory. `vec` is null until the model has embedded it. */
export interface IndexedChunk extends NoteChunk {
  hash: string;
  vec: Float32Array | null;
}

export interface IndexedNote {
  path: string;
  title: string;
  mtimeMs: number;
  chunks: IndexedChunk[];
  /** The note's own vector (the mean of its chunks'), cached. */
  centroid: Float32Array | null;
}

/** What the index needs from the rest of the server — injected, so the tests
 *  can drive it with a vault of strings and a counting fake embedder. */
export interface IndexDeps {
  dbFile: string | null;
  /** Every note that should be indexed, as the note index knows it. */
  sources(): { path: string; title: string; mtimeMs: number }[];
  /** The note's source text. */
  read(path: string): Promise<string>;
  /** The embedding model in force. */
  model(): string;
  embed(model: string, inputs: string[]): Promise<number[][]>;
}

/** How many passages go to the model per request. Small enough that a pass
 *  yields often (a query arriving mid-pass waits for one batch, not all). */
export const EMBED_BATCH = 16;

export function contentHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 40);
}

function toBlob(v: Float32Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

function fromBlob(b: Uint8Array): Float32Array {
  // Copy: node:sqlite hands back a view whose buffer is not ours to keep.
  const copy = new Uint8Array(b.byteLength);
  copy.set(b);
  return new Float32Array(copy.buffer);
}

export class SemanticIndex {
  readonly notes = new Map<string, IndexedNote>();
  private db: DatabaseSync | null = null;
  private currentModel = "";
  /** hash → vector for the current model, the in-memory face of the db. */
  private vectors = new Map<string, Float32Array>();
  private running: Promise<void> | null = null;
  private again = false;
  lastError: string | null = null;
  /** Counts for the tests and the status line. */
  embedded = 0;

  private deps: IndexDeps;

  constructor(deps: IndexDeps) {
    this.deps = deps;
    if (deps.dbFile !== null) {
      mkdirSync(path.dirname(deps.dbFile), { recursive: true });
      const db = new DatabaseSync(deps.dbFile);
      // Vectors are derived from every note, published or not: owner-only,
      // like the settings file beside them.
      try {
        chmodSync(deps.dbFile, 0o600);
      } catch {
        /* a filesystem without modes */
      }
      db.exec(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS vectors (
          model TEXT NOT NULL,
          hash  TEXT NOT NULL,
          dim   INTEGER NOT NULL,
          vec   BLOB NOT NULL,
          PRIMARY KEY (model, hash)
        ) WITHOUT ROWID;
      `);
      this.db = db;
    }
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  /** Bring the index up to date with the vault. Single-flight: a call while a
   *  pass is running books one more pass after it, never a second in
   *  parallel, so a sync storm is at most two passes. */
  refresh(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.pass();
        } while (this.again);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  /** Resolves when no pass is running (the tests' and the perf harness's). */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  private switchModel(model: string): void {
    if (model === this.currentModel) return;
    this.currentModel = model;
    this.vectors = new Map();
    if (this.db) {
      const rows = this.db.prepare("SELECT hash, vec FROM vectors WHERE model = ?").all(model) as unknown as { hash: string; vec: Uint8Array }[];
      for (const row of rows) this.vectors.set(row.hash, fromBlob(row.vec));
    }
    for (const note of this.notes.values()) {
      for (const c of note.chunks) c.vec = this.vectors.get(c.hash) ?? null;
      note.centroid = null;
    }
  }

  private async pass(): Promise<void> {
    this.switchModel(this.deps.model());
    const model = this.currentModel;
    // 1. Re-cut what moved; forget what went.
    const live = new Set<string>();
    for (const src of this.deps.sources()) {
      live.add(src.path);
      const have = this.notes.get(src.path);
      if (have && have.mtimeMs === src.mtimeMs && have.title === src.title) continue;
      let text: string;
      try {
        text = await this.deps.read(src.path);
      } catch {
        continue; // gone between the listing and the read; the next event says so
      }
      const chunks: IndexedChunk[] = chunkNote(text, src.title).map((c) => {
        const hash = contentHash(embedInput(src.title, c));
        return { ...c, hash, vec: this.vectors.get(hash) ?? null };
      });
      this.notes.set(src.path, { path: src.path, title: src.title, mtimeMs: src.mtimeMs, chunks, centroid: null });
    }
    for (const p of [...this.notes.keys()]) if (!live.has(p)) this.notes.delete(p);

    // 2. Embed what has no vector yet, a batch at a time.
    const byHash = new Map<string, { input: string; chunks: IndexedChunk[] }>();
    for (const note of this.notes.values()) {
      for (const c of note.chunks) {
        if (c.vec !== null) continue;
        const slot = byHash.get(c.hash);
        if (slot) slot.chunks.push(c);
        else byHash.set(c.hash, { input: embedInput(note.title, c), chunks: [c] });
      }
    }
    const todo = [...byHash.entries()];
    const prefix = embedPrefixes(model).document;
    const insert = this.db?.prepare("INSERT OR REPLACE INTO vectors (model, hash, dim, vec) VALUES (?, ?, ?, ?)");
    for (let i = 0; i < todo.length; i += EMBED_BATCH) {
      if (this.deps.model() !== model) {
        this.again = true; // the setting changed mid-pass: start over under the new one
        return;
      }
      const batch = todo.slice(i, i + EMBED_BATCH);
      let out: number[][];
      try {
        out = await this.deps.embed(model, batch.map(([, s]) => prefix + s.input));
        this.lastError = null;
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        return; // Ollama down or the model missing: the next refresh retries
      }
      batch.forEach(([hash, slot], j) => {
        const vec = normalize(Float32Array.from(out[j]));
        this.vectors.set(hash, vec);
        insert?.run(model, hash, vec.length, toBlob(vec));
        for (const c of slot.chunks) c.vec = vec;
        this.embedded++;
      });
      for (const note of this.notes.values()) note.centroid = null;
    }
  }

  /** Delete the vectors no note references any more, for the current model.
   *  Called rarely (after a full pass that embedded nothing new). */
  prune(): number {
    if (!this.db) return 0;
    const used = new Set<string>();
    for (const n of this.notes.values()) for (const c of n.chunks) used.add(c.hash);
    const rows = this.db.prepare("SELECT hash FROM vectors WHERE model = ?").all(this.currentModel) as unknown as { hash: string }[];
    const del = this.db.prepare("DELETE FROM vectors WHERE model = ? AND hash = ?");
    let n = 0;
    for (const { hash } of rows) {
      if (used.has(hash)) continue;
      del.run(this.currentModel, hash);
      this.vectors.delete(hash);
      n++;
    }
    return n;
  }

  counts(): { notes: number; indexedNotes: number; chunks: number; pending: number } {
    let chunks = 0;
    let pending = 0;
    let indexedNotes = 0;
    for (const n of this.notes.values()) {
      let done = true;
      for (const c of n.chunks) {
        chunks++;
        if (c.vec === null) {
          pending++;
          done = false;
        }
      }
      if (done) indexedNotes++;
    }
    return { notes: this.notes.size, indexedNotes, chunks, pending };
  }

  /** How many vectors the database holds for `model` (the tests' window). */
  stored(model: string): number {
    if (!this.db) return this.vectors.size;
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM vectors WHERE model = ?").get(model) as { n: number };
    return Number(row.n);
  }

  private noteCentroid(note: IndexedNote): Float32Array | null {
    if (note.centroid === null) {
      const vecs = note.chunks.flatMap((c) => (c.vec ? [c.vec] : []));
      note.centroid = centroid(vecs);
    }
    return note.centroid;
  }

  /** The best passage of each note for a query vector, best notes first. */
  searchVector(qv: Float32Array, limit: number, exclude?: ReadonlySet<string>): { note: IndexedNote; chunk: IndexedChunk; score: number }[] {
    const best = (function* (notes: Iterable<IndexedNote>) {
      for (const note of notes) {
        if (exclude?.has(note.path)) continue;
        let top: IndexedChunk | null = null;
        let s = -2;
        for (const c of note.chunks) {
          if (!c.vec) continue;
          const d = dot(qv, c.vec);
          if (d > s) {
            s = d;
            top = c;
          }
        }
        if (top) yield { note, chunk: top, s };
      }
    })(this.notes.values());
    return rankTop(best, limit, (x) => x.s).map(({ item }) => ({ note: item.note, chunk: item.chunk, score: item.s }));
  }

  /** The k best passages overall, at most `perNote` from any one note — the
   *  answer panel's retrieval. */
  retrieve(qv: Float32Array, k: number, perNote = 2): { note: IndexedNote; chunk: IndexedChunk; score: number }[] {
    const all = (function* (notes: Iterable<IndexedNote>) {
      for (const note of notes) for (const chunk of note.chunks) if (chunk.vec) yield { note, chunk, s: dot(qv, chunk.vec) };
    })(this.notes.values());
    const ranked = rankTop(all, k * 4, (x) => x.s);
    const out: { note: IndexedNote; chunk: IndexedChunk; score: number }[] = [];
    const per = new Map<string, number>();
    for (const { item } of ranked) {
      const n = per.get(item.note.path) ?? 0;
      if (n >= perNote) continue;
      per.set(item.note.path, n + 1);
      out.push({ note: item.note, chunk: item.chunk, score: item.s });
      if (out.length >= k) break;
    }
    return out;
  }

  /** The notes nearest `notePath` as whole notes (centroid to centroid). */
  related(notePath: string, limit: number): { note: IndexedNote; score: number }[] {
    const self = this.notes.get(notePath);
    const sv = self ? this.noteCentroid(self) : null;
    if (!sv) return [];
    const others = (function* (idx: SemanticIndex) {
      for (const note of idx.notes.values()) {
        if (note.path === notePath) continue;
        const v = idx.noteCentroid(note);
        if (v) yield { note, s: dot(sv, v) };
      }
    })(this);
    return rankTop(others, limit, (x) => x.s).map(({ item }) => ({ note: item.note, score: item.s }));
  }

  /** Passages elsewhere closest to any passage of `notePath`, best per note,
   *  leaving out the notes in `linked`. */
  suggest(notePath: string, limit: number, linked: ReadonlySet<string>): { note: IndexedNote; chunk: IndexedChunk; score: number }[] {
    const self = this.notes.get(notePath);
    const own = self?.chunks.flatMap((c) => (c.vec ? [c.vec] : [])) ?? [];
    if (own.length === 0) return [];
    const best = (function* (notes: Iterable<IndexedNote>) {
      for (const note of notes) {
        if (note.path === notePath || linked.has(note.path)) continue;
        let top: IndexedChunk | null = null;
        let s = -2;
        for (const c of note.chunks) {
          if (!c.vec) continue;
          for (const v of own) {
            const d = dot(v, c.vec);
            if (d > s) {
              s = d;
              top = c;
            }
          }
        }
        if (top) yield { note, chunk: top, s };
      }
    })(this.notes.values());
    return rankTop(best, limit, (x) => x.s).map(({ item }) => ({ note: item.note, chunk: item.chunk, score: item.s }));
  }
}
