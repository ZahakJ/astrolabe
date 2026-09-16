import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ROOT_GROUP,
  UNTAGGED_GROUP,
  UNMATCHED_GROUP,
  accentScale,
  queryGroupColor,
  queryOrder,
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

describe("tag gatherings", () => {
  const nodes = [
    { id: "a.md", title: "a", links: 1, tags: ["raft", "systems"] },
    { id: "b.md", title: "b", links: 1, tags: ["paxos"] },
    { id: "c.md", title: "c", links: 1, tags: ["poetry", "raft"] },
  ];
  it("colours every gathered tag as one group, whatever the case or the #", () => {
    const { of, groups } = groupNodes(nodes, "tag", 1, {
      pick: "common",
      gatherings: [{ name: "distributed", tags: "#Raft, paxos" }],
    });
    assert.equal(of.get("a.md"), "distributed");
    assert.equal(of.get("b.md"), "distributed");
    assert.equal(of.get("c.md"), "distributed");
    assert.equal(groups[0].name, "distributed");
    assert.equal(groups[0].count, 3);
  });
  it("can take the FIRST tag in the note instead of the most shared", () => {
    const { of } = groupNodes(nodes, "tag", 1, { pick: "first", gatherings: [] });
    assert.equal(of.get("c.md"), "poetry");
    const common = groupNodes(nodes, "tag", 1, { pick: "common", gatherings: [] });
    assert.equal(common.of.get("c.md"), "raft");
  });
  it("survives a stored preferences object with junk gatherings", () => {
    const prefs = normalizeGraphPrefs({ tagPick: "first", tagGroups: [{ name: "x", tags: "a b" }, null, 3, { name: 5 }] });
    assert.equal(prefs.tagPick, "first");
    assert.deepEqual(prefs.tagGroups, [
      { name: "x", tags: "a b" },
      { name: "", tags: "" },
    ]);
  });
});

describe("graph groups by query", () => {
  const nodes = [
    { id: "Physics/a.md", title: "a", links: 1, tags: ["physics"] },
    { id: "Physics/b.md", title: "b", links: 1, tags: ["physics", "draft"] },
    { id: "Kitchen/c.md", title: "c", links: 1, tags: ["recipes"] },
    { id: "loose.md", title: "loose", links: 0, tags: [] },
  ];
  const matches = new Map<string, Set<string>>([
    ["tag:physics", new Set(["Physics/a.md", "Physics/b.md"])],
    ["tag:draft", new Set(["Physics/b.md"])],
    ["tag:recipes", new Set(["Kitchen/c.md"])],
  ]);
  it("the first query that names a note wins it; the rest is one neutral bucket, in the rows' order", () => {
    const { groups, of } = groupNodes(nodes, "query", 1, undefined, {
      groups: [{ query: "tag:draft ", color: null }, { query: "tag:physics", color: null }, { query: "", color: null }, { query: "tag:nothing", color: null }],
      matches,
    });
    assert.equal(of.get("Physics/b.md"), "tag:draft");
    assert.equal(of.get("Physics/a.md"), "tag:physics");
    assert.equal(of.get("Kitchen/c.md"), UNMATCHED_GROUP);
    assert.deepEqual(groups.map((g) => [g.name, g.count]), [["tag:draft", 1], ["tag:physics", 1], ["tag:nothing", 0], [UNMATCHED_GROUP, 2]]);
  });
  it("a query the server has not answered names nothing yet", () => {
    const { of } = groupNodes(nodes, "query", 1, undefined, { groups: [{ query: "tag:physics", color: null }], matches: new Map() });
    assert.equal(of.get("Physics/a.md"), UNMATCHED_GROUP);
  });
  it("keeps the rows' order and drops blanks and repeats", () => {
    assert.deepEqual(queryOrder([{ query: " b ", color: null }, { query: "", color: null }, { query: "a", color: null }, { query: "b", color: null }]), ["b", "a"]);
  });
  it("the accent scale walks the theme's hue; a set colour wins; the unmatched bucket is neutral", () => {
    const scale = accentScale("#58a6ff", 6, true);
    assert.equal(scale.length, 6);
    assert.equal(new Set(scale).size, 6);
    assert.ok(scale.every((c) => /^#[0-9a-f]{6}$/.test(c)));
    // Grey has no hue: still six distinct colours. Not a hex: the palette.
    assert.equal(new Set(accentScale("#808080", 6, false)).size, 6);
    assert.deepEqual(accentScale("gold", 3, true), graphPalette(true).slice(0, 3));
    const groups = [{ query: "tag:a", color: null }, { query: "tag:b", color: "#123456" }];
    assert.equal(queryGroupColor(groups, "tag:a", "#58a6ff", true), scale[0]);
    assert.equal(queryGroupColor(groups, "tag:b", "#58a6ff", true), "#123456");
    assert.equal(groupColor(UNMATCHED_GROUP, 0, {}, true, "#ccc"), "#ccc");
  });
  it("survives a stored preferences object with junk query rows, capped at six", () => {
    const prefs = normalizeGraphPrefs({ colorBy: "query", queryGroups: [{ query: "tag:x", color: "#ABCDEF" }, { query: 4, color: "red" }, null, ...Array(8).fill({ query: "q", color: null })] });
    assert.equal(prefs.colorBy, "query");
    assert.equal(prefs.queryGroups.length, 6);
    assert.deepEqual(prefs.queryGroups[0], { query: "tag:x", color: "#abcdef" });
    assert.deepEqual(prefs.queryGroups[1], { query: "", color: null });
    assert.deepEqual(prefs.hiddenGroups.query, []);
  });
});
