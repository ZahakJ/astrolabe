// The phone shell's layout question and the note's tabs (client/shellQuery.ts
// SPLIT_QUERY / NOTE_TABS_QUERY, client/phone/noteTabs.ts): two columns only
// where a note at its measure fits beside a list, and the open notes a list
// of their own on the device — never the vault's workspace.

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

// A fake localStorage, in place before the module reads it at load (node's
// own wants a flag and warns without it).
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
});
store.set("astrolabe.phone-note-tabs", JSON.stringify([{ path: "kept.md", used: 3 }, { path: "kept.md", used: 4 }, 7, { path: "" }]));

const tabs = await import("../client/phone/noteTabs.ts");
const loaded = [...tabs.noteTabs()];
const { NOTE_TABS_QUERY, SPLIT_MIN_PX, SPLIT_QUERY } = await import("../client/shellQuery.ts");
const { TRAVELLING_KEYS } = await import("../client/prefsSync.ts");

const KEY = "astrolabe.phone-note-tabs";
const saved = (): string[] => (JSON.parse(store.get(KEY) ?? "[]") as { path: string }[]).map((e) => e.path);

describe("the layout question (client/shellQuery.ts)", () => {
  it("two columns from 1000px: a note's measure beside a list's", () => {
    assert.equal(SPLIT_MIN_PX, 1000);
    assert.equal(SPLIT_QUERY, "(min-width: 1000px)");
    // The widths it was written for, as numbers: one column below, two above.
    const split = (w: number): boolean => w >= SPLIT_MIN_PX;
    for (const w of [344, 412, 690, 707, 768, 810, 820, 829, 915]) assert.equal(split(w), false, `${w} is one column`);
    for (const w of [1024, 1080, 1180, 1366]) assert.equal(split(w), true, `${w} is two`);
  });

  it("tabs from 600 wide and 480 tall: the open Fold, a tablet — never a phone on its side", () => {
    assert.equal(NOTE_TABS_QUERY, "(min-width: 600px) and (min-height: 480px)");
  });
});

describe("the note's tabs (client/phone/noteTabs.ts)", () => {
  beforeEach(() => {
    for (const p of [...tabs.noteTabs()]) tabs.closeNoteTab(p);
  });

  it("reads what was kept, once each, skipping what is not a tab", () => {
    assert.deepEqual(loaded, ["kept.md"]);
  });

  it("a second note opened is a second tab, just after the one on screen", () => {
    tabs.showNoteTab("a.md");
    tabs.showNoteTab("b.md");
    assert.deepEqual([...tabs.noteTabs()], ["a.md", "b.md"]);
    tabs.showNoteTab("a.md");
    tabs.showNoteTab("c.md");
    assert.deepEqual([...tabs.noteTabs()], ["a.md", "c.md", "b.md"]);
    assert.deepEqual(saved(), ["a.md", "c.md", "b.md"], "kept on the device");
  });

  it("showing the note already on screen writes nothing", () => {
    tabs.showNoteTab("a.md");
    const before = tabs.noteTabs();
    let woke = 0;
    const off = tabs.subscribeNoteTabs(() => (woke += 1));
    tabs.showNoteTab("a.md");
    off();
    assert.equal(woke, 0);
    assert.equal(tabs.noteTabs(), before, "the same array until it changes");
  });

  it("closing answers the neighbour: the next, or the one before at the end", () => {
    for (const p of ["a.md", "b.md", "c.md"]) tabs.showNoteTab(p);
    assert.equal(tabs.closeNoteTab("b.md"), "c.md");
    assert.equal(tabs.closeNoteTab("c.md"), "a.md");
    assert.equal(tabs.closeNoteTab("a.md"), null);
    assert.equal(tabs.closeNoteTab("gone.md"), null);
  });

  it("eight at most: the one touched longest ago goes", () => {
    for (let i = 1; i <= 8; i += 1) tabs.showNoteTab(`n${i}.md`);
    tabs.showNoteTab("n1.md");
    tabs.showNoteTab("n9.md");
    const now = [...tabs.noteTabs()];
    assert.equal(now.length, tabs.NOTE_TABS_MAX);
    assert.ok(now.includes("n1.md") && now.includes("n9.md"));
    assert.ok(!now.includes("n2.md"), "n2 was the stalest");
  });

  it("a rename or a folder moved carries the tabs; a note gone leaves", () => {
    for (const p of ["x/a.md", "x/b.md", "y.md"]) tabs.showNoteTab(p);
    tabs.remapNoteTabs("x", "z");
    assert.deepEqual([...tabs.noteTabs()], ["z/a.md", "z/b.md", "y.md"]);
    tabs.remapNoteTabs("y.md", "w.md");
    assert.deepEqual([...tabs.noteTabs()], ["z/a.md", "z/b.md", "w.md"]);
    tabs.pruneNoteTabs((p) => p !== "z/b.md");
    assert.deepEqual([...tabs.noteTabs()], ["z/a.md", "w.md"]);
  });

  it("never travels with the preferences, so never into the vault", () => {
    assert.ok(!TRAVELLING_KEYS.some((k) => k.startsWith("phone-")));
  });
});
