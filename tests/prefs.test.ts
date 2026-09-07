// The vault-side half of "settings travel with the vault" (server/prefs.ts):
// what the file accepts, and how two devices' answers merge.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePrefs, sanitizePrefs, type PrefMap } from "../server/prefs.ts";

test("sanitizePrefs keeps well-formed prefixed keys and drops the rest", () => {
  const out = sanitizePrefs({
    "astrolabe.theme": { v: "graphite", t: 10 },
    "astrolabe.gone": { v: null, t: 11 },
    "vellum.theme": { v: "x", t: 1 }, // wrong prefix
    "astrolabe.bad": { v: 3, t: 1 }, // value not a string
    "astrolabe.nostamp": { v: "x" },
    "astrolabe.has space": { v: "x", t: 1 },
    "astrolabe.float": { v: "x", t: 5.9 },
  });
  assert.deepEqual(out, {
    "astrolabe.theme": { v: "graphite", t: 10 },
    "astrolabe.gone": { v: null, t: 11 },
    "astrolabe.float": { v: "x", t: 5 },
  });
  assert.deepEqual(sanitizePrefs(null), {});
  assert.deepEqual(sanitizePrefs("nope"), {});
});

test("mergePrefs: newest stamp wins per key, a tie keeps the file's copy", () => {
  const base: PrefMap = {
    "astrolabe.theme": { v: "paper", t: 100 },
    "astrolabe.lang": { v: "ar", t: 100 },
  };
  const incoming: PrefMap = {
    "astrolabe.theme": { v: "graphite", t: 200 }, // newer: wins
    "astrolabe.lang": { v: "en", t: 100 }, // tie: file keeps ar
    "astrolabe.vim": { v: "1", t: 50 }, // new key: lands
  };
  const { merged, changed } = mergePrefs(base, incoming);
  assert.equal(changed, true);
  assert.deepEqual(merged, {
    "astrolabe.theme": { v: "graphite", t: 200 },
    "astrolabe.lang": { v: "ar", t: 100 },
    "astrolabe.vim": { v: "1", t: 50 },
  });
  assert.equal(mergePrefs(merged, incoming).changed, false);
});

test("a tombstone travels like a value: a clear on one device clears the next", () => {
  const base: PrefMap = { "astrolabe.theme": { v: "paper", t: 100 } };
  const { merged } = mergePrefs(base, { "astrolabe.theme": { v: null, t: 300 } });
  assert.deepEqual(merged["astrolabe.theme"], { v: null, t: 300 });
});
