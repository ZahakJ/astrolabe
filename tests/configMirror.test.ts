// The mirror's one decision (server/configMirror.ts::pickSource): which copy
// of an instance file the other side takes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSource } from "../server/configMirror.ts";

test("a file on one side only is copied to the other", () => {
  assert.equal(pickSource({ mtimeMs: 10_000, size: 5 }, null), "data");
  assert.equal(pickSource(null, { mtimeMs: 10_000, size: 5 }), "vault");
  assert.equal(pickSource(null, null), null);
});

test("the newer copy wins, in either direction", () => {
  assert.equal(pickSource({ mtimeMs: 50_000, size: 5 }, { mtimeMs: 10_000, size: 9 }), "data");
  assert.equal(pickSource({ mtimeMs: 10_000, size: 5 }, { mtimeMs: 50_000, size: 9 }), "vault");
});

test("copies a rounding error apart are the same write and settle", () => {
  assert.equal(pickSource({ mtimeMs: 10_000.4, size: 5 }, { mtimeMs: 10_000, size: 5 }), null);
  assert.equal(pickSource({ mtimeMs: 10_000, size: 5 }, { mtimeMs: 10_000.9, size: 5 }), null);
  // Same moment, different bytes: something is off; the later one still wins.
  assert.equal(pickSource({ mtimeMs: 10_000.4, size: 5 }, { mtimeMs: 10_000, size: 6 }), "data");
});

test("on first contact the vault wins whatever the clocks say", () => {
  // The desktop's 31-byte defaults, a day younger than the site's settings.
  assert.equal(pickSource({ mtimeMs: 90_000, size: 31 }, { mtimeMs: 10_000, size: 1373 }, true), "vault");
  // Afterwards, the clocks decide again.
  assert.equal(pickSource({ mtimeMs: 90_000, size: 31 }, { mtimeMs: 10_000, size: 1373 }, false), "data");
  // A vault with no copy still takes this side's file.
  assert.equal(pickSource({ mtimeMs: 90_000, size: 31 }, null, true), "data");
});
