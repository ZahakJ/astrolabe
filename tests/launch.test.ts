// Open on launch (shared/launch.ts): four doors or a note path, nothing else.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_LAUNCH, isLaunchDoor, parseLaunch } from "../shared/launch.ts";

describe("parseLaunch", () => {
  it("keeps the four doors and a note path, and refuses the rest", () => {
    assert.equal(DEFAULT_LAUNCH, "resume");
    for (const door of ["resume", "sigils", "orbits", "today"]) {
      assert.ok(isLaunchDoor(door));
      assert.equal(parseLaunch(door), door);
    }
    assert.equal(parseLaunch(" Notes/Home.md "), "Notes/Home.md");
    assert.equal(parseLaunch("thesis.tex"), "thesis.tex");
    assert.equal(parseLaunch("attachments/x.png"), null, "not a note");
    assert.equal(parseLaunch("graph"), null, "not a door");
    assert.equal(parseLaunch(""), null);
    assert.equal(parseLaunch(42), null);
    assert.equal(parseLaunch(undefined), null);
  });
});
