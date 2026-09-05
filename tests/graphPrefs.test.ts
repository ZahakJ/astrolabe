import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ROOT_GROUP,
  UNTAGGED_GROUP,
  defaultGraphPrefs,
  folderOf,
  groupColor,
  groupNodes,
  graphPalette,
  normalizeGraphPrefs,
} from "../client/graphPrefs.ts";

describe("graph preferences", () => {
  it("groups by folder at one or two levels, with the root as its own bucket", () => {
    assert.equal(folderOf("a/b/c/note.md", 1), "a");
    assert.equal(folderOf("a/b/c/note.md", 2), "a/b");
    assert.equal(folderOf("note.md", 1), ROOT_GROUP);
    const { groups, of } = groupNodes(
      [
        { id: "essays/one.md", title: "one", links: 1, tags: [] },
        { id: "essays/two.md", title: "two", links: 0, tags: [] },
        { id: "daily/x.md", title: "x", links: 2, tags: [] },
        { id: "loose.md", title: "loose", links: 0, tags: [] },
      ],
      "folder",
      1,
    );
    assert.deepEqual(groups.map((g) => [g.name, g.count]), [["essays", 2], ["daily", 1], [ROOT_GROUP, 1]]);
    assert.equal(of.get("loose.md"), ROOT_GROUP);
  });

  it("puts a many-tagged note under its most common tag (ties to the first written), and the tagless under one bucket", () => {
    const { groups, of } = groupNodes(
      [
        { id: "a.md", title: "a", links: 1, tags: ["physics", "draft"] },
        { id: "b.md", title: "b", links: 1, tags: ["physics"] },
        { id: "c.md", title: "c", links: 1, tags: ["history", "draft"] },
        { id: "d.md", title: "d", links: 1, tags: [] },
      ],
      "tag",
      1,
    );
    assert.equal(of.get("a.md"), "physics");
    assert.equal(of.get("c.md"), "draft");
    assert.equal(of.get("d.md"), UNTAGGED_GROUP);
    assert.equal(groups[0].name, "physics");
  });

  it("colours the biggest groups from the palette, the rest by a stable hue, and honours overrides", () => {
    const dark = graphPalette(true);
    assert.equal(groupColor("essays", 0, {}, true, "#ccc"), dark[0]);
    assert.equal(groupColor("essays", 0, { essays: "#123456" }, true, "#ccc"), "#123456");
    assert.equal(groupColor(ROOT_GROUP, 0, {}, true, "#ccc"), "#ccc");
    const thirteenth = groupColor("thirteenth", 12, {}, true, "#ccc");
    assert.match(thirteenth, /^#[0-9a-f]{6}$/);
    assert.equal(thirteenth, groupColor("thirteenth", 12, {}, true, "#ccc"));
    assert.notEqual(thirteenth, groupColor("fourteenth", 13, {}, true, "#ccc"));
  });

  it("normalises anything back into a valid preferences object", () => {
    assert.deepEqual(normalizeGraphPrefs(null), defaultGraphPrefs());
    const p = normalizeGraphPrefs({
      colorBy: "tag",
      folderDepth: 7,
      groupColors: { tag: { physics: "#ABCDEF", bad: "red" } },
      hiddenGroups: { tag: ["draft", 3] },
      minLinks: 99,
      forces: { repulsion: 100, linkDistance: "x", gravity: -1 },
      display: { nodeScale: 0.1, glow: false },
    });
    assert.equal(p.colorBy, "tag");
    assert.equal(p.folderDepth, 1);
    assert.deepEqual(p.groupColors.tag, { physics: "#abcdef" });
    assert.deepEqual(p.hiddenGroups.tag, ["draft"]);
    assert.equal(p.minLinks, 50);
    assert.equal(p.forces.repulsion, 2.5);
    assert.equal(p.forces.linkDistance, 235);
    assert.equal(p.forces.gravity, 0);
    assert.equal(p.display.nodeScale, 0.6);
    assert.equal(p.display.glow, false);
  });
});
