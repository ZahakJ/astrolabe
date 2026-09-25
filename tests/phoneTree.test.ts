// The Notes tab's two new pure parts (3.34): a folder's path folded into the
// crumbs that fit its top bar (client/phone/crumbs.ts), and the tree's rows
// with the device's memory of which folders are open (client/phone/treeRows.ts).

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TreeNode } from "../shared/types.ts";
import { collapseCrumbs, crumbsOf } from "../client/phone/crumbs.ts";
import { countOpenable, createExpansion, filesKey, filesOf, visibleRows, type StorageLike, type TreeRules } from "../client/phone/treeRows.ts";

describe("a folder's crumbs (client/phone/crumbs.ts)", () => {
  it("are the root and every folder down to this one", () => {
    assert.deepEqual(crumbsOf("Maths/History/Egypt", "Notes"), [
      { path: "", label: "Notes" },
      { path: "Maths", label: "Maths" },
      { path: "Maths/History", label: "History" },
      { path: "Maths/History/Egypt", label: "Egypt" },
    ]);
    assert.deepEqual(crumbsOf("", "Notes"), [{ path: "", label: "Notes" }]);
  });

  it("draw everything when it fits", () => {
    assert.deepEqual(collapseCrumbs([60, 90, 110], 400, 16, 44), { items: [0, 1, 2], hidden: [] });
  });

  it("fold the middle first, keeping the root and the nearest folders", () => {
    // 60+16+90+16+80+16+110 = 388 does not fit 300; root + … + the last two
    // = 60+16+44+16+80+16+110 = 342 does not either; root + … + the last one
    // = 60+16+44+16+110 = 246 does.
    assert.deepEqual(collapseCrumbs([60, 90, 80, 110], 300, 16, 44), { items: [0, "more", 3], hidden: [1, 2] });
    assert.deepEqual(collapseCrumbs([60, 90, 80, 110], 350, 16, 44), { items: [0, "more", 2, 3], hidden: [1] });
  });

  it("never fold the current folder: at the narrowest it is … and the folder", () => {
    // A Fold's cover screen: 204px for the crumbs.
    assert.deepEqual(collapseCrumbs([61, 101, 180], 204, 16, 44), { items: ["more", 2], hidden: [0, 1] });
    const plan = collapseCrumbs([61, 101, 400], 100, 16, 44);
    assert.equal(plan.items[plan.items.length - 1], 2, "a name wider than the bar is still drawn — the bar truncates its end");
  });

  it("a single crumb is never folded", () => {
    assert.deepEqual(collapseCrumbs([500], 100, 16, 44), { items: [0], hidden: [] });
  });
});

const note = (path: string): TreeNode => ({ name: path.slice(path.lastIndexOf("/") + 1), path, type: "file" });
const pic = (path: string): TreeNode => ({ ...note(path), attachment: { kind: "image", size: 1 } as TreeNode["attachment"] });
const folder = (path: string, children: TreeNode[]): TreeNode => ({ name: path.slice(path.lastIndexOf("/") + 1), path, type: "folder", children });

const vault = folder("", [
  folder("Maths", [
    folder("Maths/History", [note("Maths/History/Euclid.md"), pic("Maths/History/map.png"), pic("Maths/History/pyramid.png")]),
    note("Maths/Index.md"),
  ]),
  folder("Empty", []),
  note("Welcome.md"),
  pic("cover.png"),
]);

const rules: TreeRules = {
  order: (kids) => [...kids],
  listed: (n) => n.type === "folder" || !n.attachment,
  file: (n) => n.type === "file" && !!n.attachment,
};

function memoryStorage(seed: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...seed };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

const shape = (rows: ReturnType<typeof visibleRows>): string[] =>
  rows.map((r) => {
    switch (r.kind) {
      case "node":
        return `${"  ".repeat(r.depth)}${r.node.type === "folder" ? (r.open ? "▾ " : "▸ ") : ""}${r.node.name}`;
      case "files":
        return `${"  ".repeat(r.depth)}${r.open ? "▾" : "▸"} Files · ${r.count}`;
      case "file":
        return `${"  ".repeat(r.depth)}${r.node.name}`;
      case "empty":
        return `${"  ".repeat(r.depth)}(empty)`;
    }
  });

describe("the tree's rows (client/phone/treeRows.ts)", () => {
  it("everything folded: the top level, and the root's files as ONE row after the notes", () => {
    assert.deepEqual(shape(visibleRows(vault, () => false, rules)), ["▸ Maths", "▸ Empty", "Welcome.md", "▸ Files · 1"]);
  });

  it("an open folder shows its folders and notes, then its files folded — never a wall of pictures", () => {
    const open = new Set(["Maths", "Maths/History"]);
    assert.deepEqual(shape(visibleRows(vault, (k) => open.has(k), rules)), [
      "▾ Maths",
      "  ▾ History",
      "    Euclid.md",
      "    ▸ Files · 2",
      "  Index.md",
      "▸ Empty",
      "Welcome.md",
      "▸ Files · 1",
    ]);
    open.add(filesKey("Maths/History"));
    const rows = visibleRows(vault, (k) => open.has(k), rules);
    assert.deepEqual(shape(rows).slice(3, 6), ["    ▾ Files · 2", "      map.png", "      pyramid.png"]);
    const file = rows[5];
    assert.ok(file.kind === "file" && file.folder === "Maths/History" && file.index === 1);
    assert.deepEqual(filesOf(vault.children![0].children![0], rules).map((n) => n.name), ["map.png", "pyramid.png"]);
  });

  it("an open folder with nothing in it says so", () => {
    assert.deepEqual(shape(visibleRows(vault, (k) => k === "Empty", rules)).slice(1, 3), ["▾ Empty", "  (empty)"]);
  });

  it("walks only what shows: a closed folder's subtree is never visited", () => {
    let visits = 0;
    const counting: TreeRules = { ...rules, order: (kids) => (visits++, [...kids]) };
    visibleRows(vault, () => false, counting);
    assert.equal(visits, 1, "only the root's children were ordered");
  });

  it("counts what opens, once per node", () => {
    let asked = 0;
    const opens = (n: TreeNode): boolean => (asked++, !n.attachment);
    assert.equal(countOpenable(vault, opens), 3);
    const first = asked;
    assert.equal(countOpenable(vault, opens), 3);
    assert.equal(asked, first, "the second count is remembered");
  });
});

describe("the tree remembers which folders are open, per device", () => {
  it("a toggle is written, and a new page reads it back", () => {
    const storage = memoryStorage();
    const a = createExpansion(storage, "k");
    assert.equal(a.toggle("Maths"), true);
    a.set(filesKey("Maths"), true);
    const b = createExpansion(storage, "k");
    assert.ok(b.isOpen("Maths") && b.isOpen(filesKey("Maths")));
    b.toggle("Maths");
    assert.equal(createExpansion(storage, "k").isOpen("Maths"), false);
  });

  it("a folder that moves takes its open state, and its children's, with it", () => {
    const storage = memoryStorage();
    const e = createExpansion(storage, "k");
    e.set("Maths", true);
    e.set("Maths/History", true);
    e.set(filesKey("Maths/History"), true);
    e.set("Mathsy", true);
    e.remap("Maths", "Mathematics");
    assert.deepEqual(e.keys().sort(), ["Mathematics", "Mathematics/History", filesKey("Mathematics/History"), "Mathsy"].sort());
    assert.ok(createExpansion(storage, "k").isOpen("Mathematics/History"));
  });

  it("unreadable or refusing storage is an empty, working memory", () => {
    assert.deepEqual(createExpansion(memoryStorage({ k: "{not json" }), "k").keys(), []);
    assert.deepEqual(createExpansion(memoryStorage({ k: '{"a":true}' }), "k").keys(), []);
    const refusing: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    const e = createExpansion(refusing, "k");
    assert.equal(e.toggle("A"), true);
    assert.ok(e.isOpen("A"), "kept for the session");
    assert.ok(createExpansion(null, "k").toggle("A"));
  });
});
