// The phone shell's pure parts (client/phone/, client/shellQuery.ts): the
// navigation stack against a browser-shaped history, the one-pane reducer,
// the hardware-keyboard inference, the shell choice, and the seam lint.
//
// The history double below behaves like a browser in the ways that bit the
// old shell: `go()` is ASYNCHRONOUS (the popstate lands later), a push drops
// the forward entries, and replaceState rewrites the current entry in place.
// The P0 the audit traced — a note opened from the drawer was undone because
// a guard's `back()` landed after the router's push — is exactly an ordering
// bug across that asynchrony, so the tests below make the asynchrony real.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createNav, readMark, readSnapshot, remapScreen, screenKey, topOf, type HistoryLike, type NavSnapshot, type NavState, type Screen } from "../client/phone/nav.ts";
import { chainTo, foldersDownTo, parentPath, upChain } from "../client/phone/up.ts";
import { contentOf, isDetail, isFull, isList } from "../client/phone/kinds.ts";
import { isHardwareKeystroke } from "../client/phone/hardwareKeyboard.ts";
import { tagOfSearch } from "../client/phone/tagTap.ts";
import { PHONE_SHELL_QUERY, shellFor } from "../client/shellQuery.ts";
import { activeTabOf, openInPane, paneAt, panesInOrder, phoneWorkspace, setPinned, soloWorkspace, splitPane } from "../client/workspace.ts";
import { NEVER_TRAVELS, TRAVELLING_KEYS, travels } from "../client/prefsSync.ts";
import { importsOf, seamViolations, widthQueries } from "../scripts/shell-seam.mjs";

/** A browser's session history, with the popstate delivered asynchronously. */
class FakeHistory implements HistoryLike {
  entries: { state: unknown; url: string }[] = [{ state: null, url: "/" }];
  index = 0;
  onPop: ((state: unknown) => void) | null = null;
  pending: Promise<void> = Promise.resolve();
  get state(): unknown {
    return this.entries[this.index].state;
  }
  get url(): string {
    return this.entries[this.index].url;
  }
  pushState(data: unknown, _t: string, url?: string | null): void {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ state: structuredClone(data), url: url ?? this.url });
    this.index += 1;
  }
  replaceState(data: unknown, _t: string, url?: string | null): void {
    this.entries[this.index] = { state: structuredClone(data), url: url ?? this.url };
  }
  go(delta: number): void {
    const to = Math.max(0, Math.min(this.entries.length - 1, this.index + delta));
    this.pending = this.pending.then(async () => {
      await new Promise((r) => setTimeout(r, 1));
      this.index = to;
      this.onPop?.(this.state);
    });
  }
  /** The OS back gesture. */
  back(): Promise<void> {
    this.go(-1);
    return this.settle();
  }
  forward(): Promise<void> {
    this.go(1);
    return this.settle();
  }
  async settle(): Promise<void> {
    let before: Promise<void>;
    do {
      before = this.pending;
      await before;
    } while (before !== this.pending);
  }
}

function setup() {
  const history = new FakeHistory();
  const seen: NavState[] = [];
  const nav = createNav({
    history,
    urlFor: (s) => (s.kind === "note" ? `/${s.path.replace(/\.md$/, "")}` : "/"),
    onChange: (st) => seen.push(st),
  });
  history.onPop = (state) => nav.onPop(state);
  return { history, nav, seen };
}

const note = (path: string): Screen => ({ kind: "note", path });
const folder = (path: string): Screen => ({ kind: "folder", path });

describe("the phone's navigation stack (client/phone/nav.ts)", () => {
  it("a tree tap pushes one entry, changes the URL, and back pops exactly that screen", async () => {
    const { history, nav } = setup();
    nav.start("notes");
    nav.push(folder("Notes"));
    nav.push(note("Notes/Stoicism.md"));
    assert.equal(history.url, "/Notes/Stoicism");
    assert.equal(history.entries.length, 3);
    assert.deepEqual(topOf(nav.state()), note("Notes/Stoicism.md"));
    await history.back();
    assert.deepEqual(topOf(nav.state()), folder("Notes"));
    assert.equal(nav.state().depth, 1);
    await history.forward();
    assert.deepEqual(topOf(nav.state()), note("Notes/Stoicism.md"), "forward restores the screen from the entry alone");
  });

  it("a sheet is an entry of its own, and back closes it before it pops the screen", async () => {
    const { history, nav } = setup();
    nav.start("notes");
    nav.push(note("A.md"));
    nav.openSheet("note");
    assert.deepEqual(nav.state().sheets, ["note"]);
    await history.back();
    assert.deepEqual(nav.state().sheets, []);
    assert.deepEqual(topOf(nav.state()), note("A.md"), "the screen under the sheet is still there");
    await history.back();
    assert.equal(topOf(nav.state()).kind, "root");
  });

  it("THE P0, REORDERED: closing a sheet and opening a note in one gesture lands on the note", async () => {
    // closeSheet asks the browser for a pop; the push asked for in the same
    // tick must wait for that pop, or the pop lands on top of the push and
    // restores the page the reader just left.
    const { history, nav } = setup();
    nav.start("notes");
    nav.push(note("A.md"));
    nav.openSheet("actions");
    nav.closeSheet("actions");
    nav.push(note("B.md"));
    await history.settle();
    assert.deepEqual(topOf(nav.state()), note("B.md"));
    assert.equal(history.url, "/B");
    assert.deepEqual(nav.state().sheets, []);
    await history.back();
    assert.deepEqual(topOf(nav.state()), note("A.md"), "back from the new note returns to the old one, not to the sheet");
  });

  it("navigating from inside a sheet replaces the sheet's entry", async () => {
    const { history, nav } = setup();
    nav.start("notes");
    nav.push(note("A.md"));
    nav.openSheet("note");
    const depth = history.entries.length;
    nav.navigateFromSheet(note("B.md"));
    assert.equal(history.entries.length, depth, "no entry was added");
    assert.deepEqual(nav.state().sheets, []);
    await history.back();
    assert.deepEqual(topOf(nav.state()), note("A.md"));
  });

  it("each tab keeps its own stack; tapping the active tab returns it to its root", async () => {
    const { history, nav } = setup();
    nav.start("today");
    nav.switchTab("notes");
    nav.push(folder("Notes"));
    nav.push(note("Notes/X.md"));
    nav.switchTab("search");
    assert.equal(nav.state().tab, "search");
    assert.equal(nav.state().stacks.notes.length, 3, "the notes stack survives a tab switch");
    nav.switchTab("notes");
    assert.deepEqual(topOf(nav.state()), note("Notes/X.md"));
    nav.switchTab("notes");
    await history.settle();
    assert.equal(topOf(nav.state()).kind, "root");
  });

  it("popScreen leaves the top screen whatever sheets stand over it", async () => {
    const { history, nav } = setup();
    nav.start("notes");
    nav.push(note("A.md"));
    nav.openSheet("note");
    nav.openSheet("confirm");
    nav.popScreen();
    await history.settle();
    assert.equal(topOf(nav.state()).kind, "root");
    assert.deepEqual(nav.state().sheets, []);
  });

  it("a rename follows every screen that names it, now and in entries a pop restores", async () => {
    const { history, nav } = setup();
    nav.start("notes");
    nav.push(folder("Old"));
    nav.push(note("Old/A.md"));
    nav.push(note("Other.md"));
    nav.remap("Old", "New");
    await history.back();
    assert.deepEqual(topOf(nav.state()), note("New/A.md"));
    await history.back();
    assert.deepEqual(topOf(nav.state()), folder("New"));
    assert.deepEqual(remapScreen(note("Old.md"), "Old", "New"), note("Old.md"), "a sibling with a shared prefix is untouched");
  });

  it("back at the base of the run steps down in place instead of leaving the app", () => {
    const { history, nav } = setup();
    nav.start("notes", [{ kind: "root", tab: "notes" }, note("Deep.md")]);
    nav.back();
    assert.equal(topOf(nav.state()).kind, "root");
    assert.equal(history.index, 0);
  });

  it("readMark is total: foreign and hand-edited states are null, never a throw", () => {
    assert.equal(readMark(null), null);
    assert.equal(readMark({ astrolabeOverlay: true }), null);
    assert.equal(readMark({ phone: { depth: -1, entry: {} } }), null);
    assert.equal(readMark({ phone: { depth: 1, entry: { tab: "notes", stack: [note("x")], sheets: [] } } }), null, "a stack must start at its tab's root");
    const ok = readMark({ phone: { depth: 2, entry: { tab: "notes", stack: [{ kind: "root", tab: "notes" }, note("x")], sheets: ["note", 4] } } });
    assert.deepEqual(ok?.entry.sheets, ["note"]);
  });
});

describe("Round 2 of the stack (3.27.0): scroll memory, the leave guard, popTo, the new screens", () => {
  /** A nav whose top list reports `scroll`, and whose guard refuses while
   *  `dirty` is true on the screen keyed `guarded`. */
  function guarded() {
    const history = new FakeHistory();
    let scroll = 0;
    let dirty = false;
    const blocked: (() => void)[] = [];
    const guardKey = "settings:site";
    const nav = createNav({
      history,
      urlFor: (s) => (s.kind === "note" ? `/${s.path.replace(/\.md$/, "")}` : null),
      onChange: () => {},
      scrollOf: () => scroll,
      canLeave: (from, to) => !dirty || screenKey(topOf(from)) !== guardKey || (screenKey(topOf(to)) === guardKey && from.tab === to.tab),
      onBlocked: (proceed) => blocked.push(proceed),
    });
    history.onPop = (state) => nav.onPop(state);
    return {
      history,
      nav,
      blocked,
      setScroll: (y: number) => (scroll = y),
      setDirty: (d: boolean) => (dirty = d),
    };
  }

  it("a list comes back where it was left: the push stamps the offset, the pop hands it back", async () => {
    const { history, nav, setScroll } = guarded();
    nav.start("notes");
    nav.push(folder("Notes"));
    setScroll(640);
    nav.push(note("Notes/A.md"));
    assert.equal(nav.state().scroll, undefined, "a pushed screen starts at its top");
    setScroll(0);
    await history.back();
    assert.deepEqual(topOf(nav.state()), folder("Notes"));
    assert.equal(nav.state().scroll, 640);
    // …and the offset is in the entry itself, so a Forward and a Back again still find it.
    await history.forward();
    await history.back();
    assert.equal(nav.state().scroll, 640);
    assert.equal(readMark(history.state)?.entry.scroll, 640);
  });

  it("a screen with unsaved edits refuses a push and a tab, and asks", () => {
    const { nav, blocked, setDirty } = guarded();
    nav.start("more");
    nav.push({ kind: "settings", section: "" });
    nav.push({ kind: "settings", section: "site" });
    setDirty(true);
    nav.push(note("Else.md"));
    nav.switchTab("today");
    assert.deepEqual(topOf(nav.state()), { kind: "settings", section: "site" }, "still on the section");
    assert.equal(blocked.length, 2);
    // A sheet over it is not leaving it: the confirm question itself.
    nav.openSheet("confirm");
    assert.deepEqual(nav.state().sheets, ["confirm"]);
  });

  it("a Back the browser already made is put back, the question is asked, and Discard goes", async () => {
    const { history, nav, blocked, setDirty } = guarded();
    nav.start("more");
    nav.push({ kind: "settings", section: "" });
    nav.push({ kind: "settings", section: "site" });
    const depth = nav.state().depth;
    setDirty(true);
    await history.back();
    assert.deepEqual(topOf(nav.state()), { kind: "settings", section: "site" }, "the section was never left");
    assert.equal(readMark(history.state)?.depth, depth, "history is back on the section's entry");
    assert.equal(blocked.length, 1);
    // Discard: the edits are dropped, then the move is made.
    setDirty(false);
    blocked[0]();
    await history.settle();
    assert.deepEqual(topOf(nav.state()), { kind: "settings", section: "" });
  });

  it("popTo walks back down to a screen the stack holds, and says so when it does not", async () => {
    const { history, nav } = guarded();
    nav.start("more");
    nav.push({ kind: "surface", tab: "~orbits" });
    nav.push({ kind: "deck", path: "Orbits/Hiragana.md" });
    nav.push({ kind: "surface", tab: "~orbits/Orbits/Hiragana.md" });
    assert.equal(nav.popTo({ kind: "deck", path: "Orbits/Hiragana.md" }), true);
    await history.settle();
    assert.deepEqual(topOf(nav.state()), { kind: "deck", path: "Orbits/Hiragana.md" });
    assert.equal(nav.popTo({ kind: "surface", tab: "~media" }), false);
  });

  it("the new screens survive a reload's entry, and a move follows them", () => {
    const stack: Screen[] = [
      { kind: "root", tab: "more" },
      { kind: "settings", section: "sync" },
      { kind: "sigil", path: "Sigils/Run.md", index: 0 },
      { kind: "tracker", path: "Media/Books.md", index: 1 },
      { kind: "deck", path: "Orbits/Kana.md" },
    ];
    const back = readMark({ phone: { depth: 3, entry: { tab: "more", stack, sheets: [], scroll: 120 } } });
    assert.deepEqual(back?.entry.stack, stack);
    assert.equal(back?.entry.scroll, 120);
    assert.equal(readMark({ phone: { depth: 1, entry: { tab: "more", stack: [stack[0], { kind: "sigil", path: "x.md", index: -1 }], sheets: [] } } }), null, "an index is a fence's, never negative");
    assert.deepEqual(remapScreen(stack[2], "Sigils", "Habits"), { kind: "sigil", path: "Habits/Run.md", index: 0 });
    assert.deepEqual(remapScreen(stack[4], "Orbits/Kana.md", "Orbits/Hiragana.md"), { kind: "deck", path: "Orbits/Hiragana.md" });
  });

  it("a list keeps the tab bar, a detail takes the column, a session and a book take the glass", () => {
    assert.ok(isList({ kind: "surface", tab: "~orbits" }) && isList({ kind: "settings", section: "" }) && isList({ kind: "surface", tab: "~sigils" }));
    assert.ok(isDetail({ kind: "deck", path: "a.md" }) && isDetail({ kind: "settings", section: "site" }) && isDetail(note("a.md")));
    assert.ok(isFull({ kind: "surface", tab: "~orbits/a.md" }) && isFull({ kind: "surface", tab: "Library/Book.pdf" }));
    assert.ok(!isFull({ kind: "surface", tab: "~graph" }));
    assert.equal(contentOf({ kind: "deck", path: "a.md" }), "~orbits");
  });
});

describe("BACK MEANS UP (3.34): a folder's chevron goes to its parent, and the stack survives a reload", () => {
  const root = { kind: "root", tab: "notes" } as const;
  /** A nav that persists, like the shell's; `reload()` builds a SECOND nav on
   *  the same history — what a page reload does: the browser keeps its
   *  entries and their states, the page keeps only what it wrote down. */
  function persisted() {
    const history = new FakeHistory();
    let saved: string | null = null;
    const make = () => {
      const nav = createNav({
        history,
        urlFor: (s) => (s.kind === "note" ? `/${s.path.replace(/\.md$/, "")}` : "/"),
        onChange: () => {},
        persist: (snap: NavSnapshot) => (saved = JSON.stringify(snap)),
      });
      history.onPop = (state) => nav.onPop(state);
      return nav;
    };
    return { history, make, saved: () => saved, forget: () => (saved = null) };
  }
  const up = (nav: ReturnType<typeof createNav>): void => {
    const chain = upChain(nav.state().stacks[nav.state().tab], nav.state().tab);
    assert.ok(chain, "a folder has somewhere to go up to");
    nav.upTo(chain!);
  };

  it("THE REPORT: Notes → a folder two down → Today → Notes, and the chevron is the parent, not Today", async () => {
    const { history, make } = persisted();
    const nav = make();
    nav.start("today");
    nav.switchTab("notes");
    nav.push(folder("Maths"));
    nav.push(folder("Maths/History"));
    nav.switchTab("today");
    nav.switchTab("notes");
    assert.deepEqual(topOf(nav.state()), folder("Maths/History"), "the tab comes back on its folder");
    up(nav);
    await history.settle();
    assert.deepEqual(topOf(nav.state()), folder("Maths"));
    assert.equal(nav.state().tab, "notes");
    // The OS back from there walks up the tab before it leaves it.
    await history.back();
    assert.deepEqual(topOf(nav.state()), root);
    await history.back();
    assert.equal(nav.state().tab, "today");
  });

  it("a tab switch pushes an entry per level, so the browser's back walks up the tab first", async () => {
    const { history, make } = persisted();
    const nav = make();
    nav.start("today");
    nav.switchTab("notes");
    nav.push(folder("A"));
    nav.push(note("A/x.md"));
    nav.switchTab("today");
    const before = history.entries.length;
    nav.switchTab("notes");
    assert.equal(history.entries.length, before + 3, "root, the folder, the note");
    await history.back();
    assert.deepEqual(topOf(nav.state()), folder("A"));
    // Tapping the active tab still goes home in one move.
    nav.switchTab("notes");
    await history.settle();
    assert.deepEqual(topOf(nav.state()), root);
  });

  it("A RELOAD two folders down resumes there, and the chevron pops to the parent's own entry", async () => {
    const { history, make, saved } = persisted();
    const first = make();
    first.start("today");
    first.switchTab("notes");
    first.push(folder("Maths"));
    first.push(folder("Maths/History"));
    first.switchTab("search");
    first.switchTab("notes");
    // The reload.
    const nav = make();
    assert.equal(nav.resume(history.state, saved(), "/"), true);
    assert.deepEqual(topOf(nav.state()), folder("Maths/History"));
    assert.equal(nav.state().stacks.search.length, 1, "the other tabs' stacks come back too");
    const at = history.index;
    up(nav);
    await history.settle();
    assert.deepEqual(topOf(nav.state()), folder("Maths"));
    assert.equal(history.index, at - 1, "a pop, not a new entry: the record said the parent is right under it");
  });

  it("a reload with nothing written down still goes up — and rewrites history so the back gesture does too", async () => {
    const { history, make, forget } = persisted();
    const first = make();
    first.start("today");
    first.switchTab("notes");
    first.push(folder("Maths"));
    first.push(folder("Maths/History"));
    forget();
    const nav = make();
    assert.equal(nav.resume(history.state, null, "/"), true);
    up(nav);
    await history.settle();
    assert.deepEqual(topOf(nav.state()), folder("Maths"));
    await history.back();
    assert.deepEqual(topOf(nav.state()), root, "back from the parent is the root, not home");
  });

  it("a folder opened from a pinned row goes up by its path, level by level", async () => {
    const { history, make } = persisted();
    const nav = make();
    nav.start("notes");
    nav.push(folder("a/b/c"));
    up(nav);
    await history.settle();
    assert.deepEqual(nav.state().stacks.notes, [root, folder("a"), folder("a/b")]);
    await history.back();
    assert.deepEqual(topOf(nav.state()), folder("a"));
    await history.back();
    assert.deepEqual(topOf(nav.state()), root);
  });

  it("the address wins: a mark whose screen is not the loaded address is not resumed", () => {
    const { history, make, saved } = persisted();
    const first = make();
    first.start("notes");
    first.push(note("A.md"));
    const nav = make();
    assert.equal(nav.resume(history.state, saved(), "/B"), false);
    assert.equal(nav.resume(null, saved(), "/A"), false, "no mark: a fresh load, nothing to resume");
    assert.equal(nav.resume(history.state, saved(), "/A"), true);
  });

  it("a sheet does not survive a reload: the page comes back on the screen under it", async () => {
    const { history, make, saved } = persisted();
    const first = make();
    first.start("notes");
    first.push(note("A.md"));
    first.openSheet("note");
    const nav = make();
    assert.equal(nav.resume(history.state, saved(), "/A"), true);
    await history.settle();
    assert.deepEqual(nav.state().sheets, []);
    assert.deepEqual(topOf(nav.state()), note("A.md"));
    assert.deepEqual(readMark(history.state)?.entry.sheets, [], "history is on the bare note's entry");
  });

  it("readSnapshot is total", () => {
    assert.equal(readSnapshot(null), null);
    assert.equal(readSnapshot("{not json"), null);
    assert.equal(readSnapshot({ v: 2, tab: "notes", depth: 0, stacks: {}, entries: [] }), null);
    const snap = readSnapshot({ v: 1, tab: "notes", depth: 1, stacks: { notes: [root, folder("A")], search: [folder("x")] }, entries: [null, { tab: "notes", stack: [root], sheets: [] }, { bad: true }] });
    assert.ok(snap);
    assert.deepEqual(snap!.stacks.notes, [root, folder("A")]);
    assert.deepEqual(snap!.stacks.search, [{ kind: "root", tab: "search" }], "a stack that does not start at its root is dropped");
    assert.deepEqual(snap!.entries, [null, { tab: "notes", stack: [root], sheets: [] }, null]);
  });

  it("up, by path (client/phone/up.ts)", () => {
    assert.equal(parentPath("a/b/c"), "a/b");
    assert.equal(parentPath("a"), "");
    assert.deepEqual(foldersDownTo("a/b/c"), ["a", "a/b", "a/b/c"]);
    assert.deepEqual(foldersDownTo(""), []);
    assert.deepEqual(upChain([root, folder("a"), folder("a/b")], "notes"), [root, folder("a")]);
    assert.deepEqual(upChain([root, folder("a")], "notes"), [root]);
    assert.deepEqual(upChain([root, { kind: "tag", tag: "x" }, folder("a/b")], "notes"), [root, folder("a")], "a tag the reader came by is not on the way up");
    assert.equal(upChain([root, note("a.md")], "notes"), null, "only a folder goes up by path");
    assert.deepEqual(chainTo([root, folder("a"), folder("a/b"), folder("a/b/c")], "notes", ""), [root]);
    assert.deepEqual(chainTo([folder("a/b/c")], "notes", "a"), [root, folder("a")], "a stack with no root gets one");
  });
});

describe("the phone's workspace: one pane, one tab, replaced (client/workspace.ts phoneWorkspace)", () => {
  it("collapses whatever the desktop reducers built to the focused pane's active tab", () => {
    let ws = soloWorkspace([], null);
    ws = openInPane(ws, ws.focus, "a.md", { newTab: true });
    ws = openInPane(ws, ws.focus, "b.md", { newTab: true });
    const split = splitPane(ws, ws.focus, "inline", activeTabOf(paneAt(ws, ws.focus)!));
    assert.ok(split);
    const phone = phoneWorkspace(split!);
    assert.equal(panesInOrder(phone).length, 1);
    const pane = paneAt(phone, phone.focus)!;
    assert.equal(pane.tabs.length, 1);
    assert.equal(activeTabOf(pane)?.path, "b.md");
  });

  it("opening another note REPLACES the tab rather than appending one", () => {
    let ws = phoneWorkspace(openInPane(soloWorkspace([], null), soloWorkspace([], null).focus, "a.md"));
    ws = phoneWorkspace(openInPane(ws, ws.focus, "b.md", { newTab: true }));
    const pane = paneAt(ws, ws.focus)!;
    assert.deepEqual(pane.tabs.map((t) => t.path), ["b.md"]);
  });

  it("drops pins and previews, and is identity-preserving when there is nothing to collapse", () => {
    let ws = soloWorkspace([{ path: "a.md", pinned: false, ephemeral: false }], "a.md");
    ws = setPinned(ws, ws.focus, "a.md", true);
    const once = phoneWorkspace(ws);
    assert.equal(activeTabOf(paneAt(once, once.focus)!)?.pinned, false);
    assert.equal(phoneWorkspace(once), once);
  });
});

describe("the phone never persists or syncs the workspace", () => {
  it("prefsSync refuses the workspace, the tab list and the layout choice outright", () => {
    for (const key of NEVER_TRAVELS) {
      assert.equal(travels(`astrolabe.${key}`), false, key);
      assert.ok(!TRAVELLING_KEYS.includes(key), `${key} must never join the allowlist`);
    }
    assert.ok(NEVER_TRAVELS.includes("workspace") && NEVER_TRAVELS.includes("tabs"));
  });

  it("the store writes neither while the phone shell is mounted (state.ts)", () => {
    const src = readFileSync(fileURLToPath(new URL("../client/state.ts", import.meta.url)), "utf8");
    // The two writers live with the rest of the store's storage since the
    // sweep's split (client/state/persistence.ts); the rule is the same.
    const persistence = readFileSync(fileURLToPath(new URL("../client/state/persistence.ts", import.meta.url)), "utf8");
    for (const fn of ["persistWorkspace", "persistTabs"]) {
      const at = persistence.indexOf(`function ${fn}(`);
      assert.ok(at > 0, fn);
      const body = persistence.slice(at, persistence.indexOf("\n}", at));
      assert.match(body, /if \(!workspacePersists\(\)\) return;/, `${fn} must refuse while the phone shell is mounted`);
    }
    assert.match(src, /export function workspacePersists\(\): boolean \{\n  return !phoneShell;/);
    assert.match(src, /const ws = phoneShell \? phoneWorkspace\(wsIn\) : wsIn;/, "every commit goes through the phone reducer");
  });
});

describe("a hardware keyboard, inferred (client/phone/hardwareKeyboard.ts)", () => {
  const key = (k: string, extra: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; isComposing: boolean }> = {}) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    ...extra,
  });
  it("a printable key with the viewport at rest is a hardware key", () => {
    assert.equal(isHardwareKeystroke(key("a"), { restingHeight: 915, height: 915 }), true);
  });
  it("a printable key with the viewport shrunk by a soft keyboard is not", () => {
    assert.equal(isHardwareKeystroke(key("a"), { restingHeight: 915, height: 560 }), false);
  });
  it("chords and navigation keys settle it on their own", () => {
    assert.equal(isHardwareKeystroke(key("k", { ctrlKey: true }), { restingHeight: 915, height: 560 }), true);
    assert.equal(isHardwareKeystroke(key("Escape"), null), true);
    assert.equal(isHardwareKeystroke(key("ArrowDown"), null), true);
  });
  it("an IME's composition and its placeholder keys prove nothing", () => {
    assert.equal(isHardwareKeystroke(key("a", { isComposing: true }), { restingHeight: 915, height: 915 }), false);
    assert.equal(isHardwareKeystroke(key("Unidentified"), null), false);
    assert.equal(isHardwareKeystroke(key("Process"), null), false);
    assert.equal(isHardwareKeystroke(key("a"), null), false, "no visual viewport: no inference from a printable key");
  });
});

describe("which shell (client/shellQuery.ts)", () => {
  it("is a phone width, or a finger that cannot hover — and nothing else", () => {
    // The drawer query this was lifted from is gone with the drawer (3.27.0):
    // the store no longer carries one at all.
    const state = readFileSync(fileURLToPath(new URL("../client/state.ts", import.meta.url)), "utf8");
    assert.ok(!/export const (DRAWER|PHONE)_QUERY/.test(state), "the drawer's queries went with the drawer");
    assert.equal(PHONE_SHELL_QUERY, "(max-width: 700px), ((pointer: coarse) and (hover: none))");
    assert.ok(!PHONE_SHELL_QUERY.includes("any-pointer"), "a stylus is an any-pointer: fine, and a stylus is not a mouse");
    assert.ok(!/hover: hover/.test(PHONE_SHELL_QUERY), "a tablet with a trackpad keeps the desktop");
  });
  it("is the device's alone: there is no Classic layout to choose (3.27.0)", () => {
    assert.equal(shellFor(true), "phone");
    assert.equal(shellFor(false), "desktop");
    const main = readFileSync(fileURLToPath(new URL("../client/main.tsx", import.meta.url)), "utf8");
    assert.ok(!/import\("\.\/(swipe|backGesture)\.ts"\)|readPhoneLayout/.test(main),"main.tsx loads no drawer gesture and reads no layout choice");
  });
});

describe("a #tag tapped in a note opens its screen (client/phone/tagTap.ts)", () => {
  it("reads one bare tag from the pills' search, and nothing else", () => {
    assert.equal(tagOfSearch("#hosting"), "hosting");
    assert.equal(tagOfSearch("  #guide "), "guide");
    assert.equal(tagOfSearch("#project/astrolabe"), "project/astrolabe");
    assert.equal(tagOfSearch("#قراءة"), "قراءة");
    assert.equal(tagOfSearch("#a_b-2"), "a_b-2");
    for (const not of ["hosting", "#", "#a #b", "is:published", "tag:x", "#a b", "", null, undefined, 3, { tag: "x" }]) {
      assert.equal(tagOfSearch(not), null, JSON.stringify(not));
    }
  });
  it("is answered by the phone shell, which has no sidebar to search in", () => {
    const shell = readFileSync(fileURLToPath(new URL("../client/phone/PhoneShell.tsx", import.meta.url)), "utf8");
    assert.match(shell, /addEventListener\("astrolabe:search"/);
    assert.match(shell, /kind: "tag", tag/);
  });
});

describe("the seam between the shells (scripts/shell-seam.mjs)", () => {
  it("holds in this tree", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    assert.deepEqual(seamViolations(root), []);
  });
  it("sees every kind of import and every width question", () => {
    assert.deepEqual(importsOf(`import "../styles/app.css";\nimport X from "./Tabs.tsx";\nconst y = import("../phone/nav.ts");`), ["../styles/app.css", "./Tabs.tsx", "../phone/nav.ts"]);
    assert.equal(widthQueries("@media (max-width: 700px) { a {} }").length, 1);
    assert.equal(widthQueries("@media (width <= 700px) { a {} }").length, 1);
    assert.equal(widthQueries("@media (prefers-reduced-motion: reduce) { a {} }").length, 0);
  });
});
