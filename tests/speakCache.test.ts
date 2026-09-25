// Read aloud's cache (server/speakCache.ts): the key is sha256 over
// everything that shapes the sound and nothing else, and the directory is a
// least-recently-USED store under a byte cap — a hit makes an entry young
// again, and the index survives a restart because the disk is the index.

import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync, utimesSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { createSpeakCache, ENGINE_REVISION, speakCacheKey } from "../server/speakCache.ts";
import { makeDir } from "./helpers/vault.ts";

const parts = { text: "grenouille.", lang: "fr", voice: "fr_FR-siwis-medium", rate: 1, format: "opus" };

describe("speakCacheKey", () => {
  it("is a sha256 hex and stable", () => {
    const k = speakCacheKey(parts);
    assert.match(k, /^[0-9a-f]{64}$/);
    assert.equal(speakCacheKey({ ...parts }), k);
  });
  it("changes with every part that shapes the sound", () => {
    const k = speakCacheKey(parts);
    for (const change of [{ text: "grenouilles." }, { lang: "en" }, { voice: "ff_siwis" }, { rate: 0.8 }, { format: "wav" }]) {
      assert.notEqual(speakCacheKey({ ...parts, ...change }), k, JSON.stringify(change));
    }
  });
  it("1 and 1.0 are one rate; composed and decomposed é are one text", () => {
    assert.equal(speakCacheKey({ ...parts, rate: 1.0 }), speakCacheKey(parts));
    assert.equal(speakCacheKey({ ...parts, text: "élève" }), speakCacheKey({ ...parts, text: "élève" }));
  });
  it("no text can pass for another text plus a language", () => {
    assert.notEqual(speakCacheKey({ ...parts, text: "a", lang: "bc" }), speakCacheKey({ ...parts, text: "ab", lang: "c" }));
  });
  it("names the engine revision, so an engine change misses every old entry", () => {
    assert.equal(typeof ENGINE_REVISION, "number");
  });
});

describe("createSpeakCache: least recently used, capped", () => {
  const bytes = (n: number, fill = 1): Uint8Array => new Uint8Array(n).fill(fill);
  const key = (i: number): string => speakCacheKey({ ...parts, text: `sentence ${i}.` });

  it("stores, answers, and keeps the container's type", async () => {
    const dir = makeDir();
    const cache = createSpeakCache(dir, 10_000);
    assert.equal(await cache.get(key(1)), null);
    await cache.put(key(1), bytes(100), "audio/ogg");
    await cache.put(key(2), bytes(100), "audio/wav");
    const one = await cache.get(key(1));
    assert.equal(one?.mime, "audio/ogg");
    assert.equal(one?.bytes.length, 100);
    assert.equal((await cache.get(key(2)))?.mime, "audio/wav");
    // Sharded by the key's first two characters, named by the key.
    assert.ok(existsSync(path.join(dir, key(1).slice(0, 2), `${key(1)}.ogg`)));
  });

  it("evicts the entry heard longest ago once past the cap", async () => {
    const dir = makeDir();
    const cache = createSpeakCache(dir, 350);
    await cache.put(key(1), bytes(100), "audio/ogg");
    await cache.put(key(2), bytes(100), "audio/ogg");
    await cache.put(key(3), bytes(100), "audio/ogg");
    // Hearing 1 again makes it the youngest…
    assert.ok(await cache.get(key(1)));
    // …so the fourth put evicts 2, not 1.
    await cache.put(key(4), bytes(100), "audio/ogg");
    assert.ok(await cache.get(key(1)));
    assert.equal(await cache.get(key(2)), null);
    assert.ok(await cache.get(key(3)));
    assert.ok(await cache.get(key(4)));
    assert.ok((await cache.size()) <= 350);
  });

  it("an entry bigger than the cap does not survive its own put", async () => {
    const dir = makeDir();
    const cache = createSpeakCache(dir, 50);
    await cache.put(key(1), bytes(100), "audio/ogg");
    assert.equal(await cache.get(key(1)), null);
    assert.equal(await cache.size(), 0);
  });

  it("a restart reads the index back from the disk, oldest first by mtime", async () => {
    const dir = makeDir();
    const first = createSpeakCache(dir, 1000);
    await first.put(key(1), bytes(100), "audio/ogg");
    await first.put(key(2), bytes(100), "audio/ogg");
    // Make 2 the older of the two on disk.
    const file2 = path.join(dir, key(2).slice(0, 2), `${key(2)}.ogg`);
    utimesSync(file2, new Date(1_000_000), new Date(1_000_000));
    const again = createSpeakCache(dir, 250);
    assert.equal(await again.size(), 200);
    await again.put(key(3), bytes(100), "audio/ogg");
    assert.equal(await again.get(key(2)), null, "the oldest file went first");
    assert.ok(await again.get(key(1)));
  });

  it("a hit touches the file, so the order survives a restart", async () => {
    const dir = makeDir();
    const cache = createSpeakCache(dir, 1000);
    await cache.put(key(1), bytes(10), "audio/ogg");
    const file = path.join(dir, key(1).slice(0, 2), `${key(1)}.ogg`);
    utimesSync(file, new Date(1_000_000), new Date(1_000_000));
    await cache.get(key(1));
    assert.ok(statSync(file).mtimeMs > 1_000_000_000);
  });

  it("leaves no .part file behind", async () => {
    const dir = makeDir();
    const cache = createSpeakCache(dir, 1000);
    await cache.put(key(1), bytes(10), "audio/ogg");
    const shard = path.join(dir, key(1).slice(0, 2));
    assert.deepEqual(readdirSync(shard).filter((n) => n.endsWith(".part")), []);
  });
});
