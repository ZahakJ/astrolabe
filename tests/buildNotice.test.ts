import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPair, decideBuildNotice } from "../shared/buildNotice.ts";

describe("the server-moved-on notice", () => {
  it("says nothing when the versions agree, or when either side is unknown", () => {
    assert.equal(decideBuildNotice("3.30.1", "3.30.1", null, null), null);
    assert.equal(decideBuildNotice(undefined, "3.30.1", null, null), null);
    assert.equal(decideBuildNotice("", "3.30.1", null, null), null);
    assert.equal(decideBuildNotice("3.30.2", "", null, null), null);
  });
  it("asks for a reload the first time a deploy is seen under an open tab", () => {
    assert.deepEqual(decideBuildNotice("3.30.2", "3.30.1", null, null), { kind: "reload", server: "3.30.2", build: "3.30.1" });
    // A reload for an OLDER pair does not count: the server moved on again.
    assert.deepEqual(decideBuildNotice("3.30.3", "3.30.1", buildPair("3.30.2", "3.30.1"), null), { kind: "reload", server: "3.30.3", build: "3.30.1" });
  });
  it("calls the build stale, once, when a reload brought the same pair back", () => {
    const pair = buildPair("3.30.2", "3.30.1");
    assert.deepEqual(decideBuildNotice("3.30.2", "3.30.1", pair, null), { kind: "stale", server: "3.30.2", build: "3.30.1" });
    // Told already on this device: silence, not a nag on every load.
    assert.equal(decideBuildNotice("3.30.2", "3.30.1", pair, pair), null);
    assert.equal(decideBuildNotice("3.30.2", "3.30.1", null, pair), null);
    // A real fix (the files rebuilt) clears it by construction: the pair changes.
    assert.equal(decideBuildNotice("3.30.2", "3.30.2", pair, pair), null);
    assert.deepEqual(decideBuildNotice("3.30.3", "3.30.2", pair, pair), { kind: "reload", server: "3.30.3", build: "3.30.2" });
  });
});
