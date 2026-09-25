// THE SPOKEN-AUDIO CACHE — every sentence the speaker has said, by what was
// asked (docs/read-aloud.md).
//
// A reader replays a word; a note is read twice; a public post is heard by
// every visitor who presses the button. None of that should cost the CPU a
// second time, so each answer is kept on disk under ASTROLABE_DATA/tts/cache/
// by sha256 of everything that shapes the sound — the text, the language, the
// voice, the rate and the container — and an ENGINE_REVISION that changes
// when the engines do, so an upgrade never replays yesterday's voice.
//
// LEAST RECENTLY USED, 500 MB. Opus at the worker's rate is ~3 kB a second of
// speech, so the cap is days of listening; past it the files heard longest ago
// go first. "Heard" is the file's mtime, touched on every hit — the disk IS
// the index, so a restart loses nothing and needs no sidecar to agree with.

import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";

/** Bump when a change to the worker or a model changes what a key sounds
 *  like: every old entry then misses and ages out by the LRU. */
export const ENGINE_REVISION = 1;

export const CACHE_CAP_BYTES = 500 * 1024 * 1024;

export interface CacheKeyParts {
  text: string;
  lang: string;
  voice: string;
  rate: number;
  format: string;
}

/** The key: sha256 over the parts in a fixed order, NUL-separated so no
 *  text can impersonate another text plus a language. The rate is written
 *  to two decimals so 1 and 1.0 are one entry. */
export function speakCacheKey(p: CacheKeyParts): string {
  const h = createHash("sha256");
  h.update([`r${ENGINE_REVISION}`, p.text.normalize("NFC"), p.lang, p.voice, p.rate.toFixed(2), p.format].join("\u0000"));
  return h.digest("hex");
}

export function extFor(mime: string): string {
  return mime === "audio/wav" ? "wav" : "ogg";
}

export function mimeFor(ext: string): string {
  return ext === "wav" ? "audio/wav" : "audio/ogg";
}

interface Entry {
  file: string;
  size: number;
  /** Last heard, ms. */
  at: number;
}

export interface SpeakCache {
  get(key: string): Promise<{ bytes: Uint8Array; mime: string } | null>;
  put(key: string, bytes: Uint8Array, mime: string): Promise<void>;
  /** Bytes on disk, as the index knows them. */
  size(): Promise<number>;
}

/** A cache rooted at `dir`, holding at most `cap` bytes. The index is read
 *  from the directory on first use; after that the map is the truth and the
 *  directory follows it. */
export function createSpeakCache(dir: string, cap = CACHE_CAP_BYTES): SpeakCache {
  let index: Map<string, Entry> | null = null;
  let total = 0;

  async function load(): Promise<Map<string, Entry>> {
    if (index) return index;
    const found: [string, Entry][] = [];
    let shards: string[] = [];
    try {
      shards = await fsp.readdir(dir);
    } catch {
      // no cache yet
    }
    for (const shard of shards) {
      if (!/^[0-9a-f]{2}$/.test(shard)) continue;
      let names: string[] = [];
      try {
        names = await fsp.readdir(path.join(dir, shard));
      } catch {
        continue;
      }
      for (const name of names) {
        const m = /^([0-9a-f]{64})\.(ogg|wav)$/.exec(name);
        if (!m) continue;
        const file = path.join(dir, shard, name);
        try {
          const st = await fsp.stat(file);
          found.push([m[1], { file, size: st.size, at: st.mtimeMs }]);
        } catch {
          // raced with an eviction
        }
      }
    }
    // Oldest first: a Map iterates in insertion order, which is then the
    // eviction order, and a hit moves its key to the end.
    found.sort((a, b) => a[1].at - b[1].at);
    index = new Map(found);
    total = found.reduce((n, [, e]) => n + e.size, 0);
    return index;
  }

  async function evict(map: Map<string, Entry>): Promise<void> {
    for (const [key, e] of map) {
      if (total <= cap) break;
      map.delete(key);
      total -= e.size;
      await fsp.rm(e.file, { force: true });
    }
  }

  return {
    async get(key) {
      const map = await load();
      const e = map.get(key);
      if (!e) return null;
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await fsp.readFile(e.file));
      } catch {
        map.delete(key);
        total -= e.size;
        return null;
      }
      e.at = Date.now();
      map.delete(key);
      map.set(key, e);
      const when = new Date(e.at);
      await fsp.utimes(e.file, when, when).catch(() => {});
      return { bytes, mime: mimeFor(path.extname(e.file).slice(1)) };
    },
    async put(key, bytes, mime) {
      const map = await load();
      const file = path.join(dir, key.slice(0, 2), `${key}.${extFor(mime)}`);
      await fsp.mkdir(path.dirname(file), { recursive: true });
      // Written aside and renamed: a reader never gets half a file.
      const part = `${file}.${process.pid}.part`;
      await fsp.writeFile(part, bytes);
      await fsp.rename(part, file);
      const old = map.get(key);
      if (old) {
        total -= old.size;
        map.delete(key);
      }
      map.set(key, { file, size: bytes.length, at: Date.now() });
      total += bytes.length;
      await evict(map);
    },
    async size() {
      await load();
      return total;
    },
  };
}
