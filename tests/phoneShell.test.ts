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
import { createNav, readMark, remapScreen, topOf, type HistoryLike, type NavState, type Screen } from "../client/phone/nav.ts";
import { isHardwareKeystroke } from "../client/phone/hardwareKeyboard.ts";
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
    for (const fn of ["persistWorkspace", "persistTabs"]) {
      const at = src.indexOf(`function ${fn}(`);
      assert.ok(at > 0, fn);
      const body = src.slice(at, src.indexOf("\n}", at));
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
  it("the phone query contains the drawer query, and lifts its ceiling only for a finger", () => {
    const state = readFileSync(fileURLToPath(new URL("../client/state.ts", import.meta.url)), "utf8");
    const drawer = /export const DRAWER_QUERY = "([^"]+)";/.exec(state)![1];
    assert.ok(drawer.includes("(max-width: 700px)") && PHONE_SHELL_QUERY.includes("(max-width: 700px)"));
    assert.ok(PHONE_SHELL_QUERY.includes("((pointer: coarse) and (hover: none))"));
    assert.ok(!PHONE_SHELL_QUERY.includes("any-pointer"), "a stylus is an any-pointer: fine, and a stylus is not a mouse");
    assert.ok(!/hover: hover/.test(PHONE_SHELL_QUERY), "a tablet with a trackpad keeps the desktop");
  });
  it("the reader's Classic choice wins over the device", () => {
    assert.equal(shellFor(true, "new"), "phone");
    assert.equal(shellFor(true, "classic"), "desktop");
    assert.equal(shellFor(false, "new"), "desktop");
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
