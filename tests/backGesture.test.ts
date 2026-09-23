import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createStore } from "zustand/vanilla";
import { installBackGuard, MARK, type GuardPop } from "../client/backGuard.ts";

// THE PHONE'S BACK GUARD AGAINST THE ROUTER (3.23.1).
//
// A note tapped in the phone drawer did not open. `openNote` opens the note
// and closes the drawer in ONE store update; the guard (installed first, at
// boot) answered "no layer: take the entry back out" with `history.back()`
// before the router answered "new note: push its URL" — and a browser runs a
// traversal LATER, counting from wherever the stack is by then, so it landed
// on the guard entry (the previous note's URL) and the router restored the
// previous note. Nothing in the gates could see it: check-phone measured
// sizes, never whether a tap went anywhere.
//
// No DOM here and no store import: a history that traverses the way a browser
// does (asynchronously, offset resolved at run time, listeners in
// registration order), a store of just the two fields that matter, and a
// router of the same shape as client/router.ts's installRouter.

interface Entry {
  state: unknown;
  url: string;
}

/** A browser's session history, as far as the ordering bug is concerned. */
class FakeHistory {
  entries: Entry[];
  index = 0;
  private listeners: ((e: GuardPop) => void)[] = [];

  constructor(url: string) {
    this.entries = [{ state: null, url }];
  }
  get state(): unknown {
    return this.entries[this.index].state;
  }
  get url(): string {
    return this.entries[this.index].url;
  }
  pushState(state: unknown, _unused: string, url?: string): void {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ state, url: url ?? this.url });
    this.index = this.entries.length - 1;
  }
  replaceState(state: unknown, _unused: string, url?: string): void {
    this.entries[this.index] = { state, url: url ?? this.url };
  }
  back(): void {
    this.go(-1);
  }
  /** How many times the guard had to step forward past its own entry. */
  forwards = 0;
  forward(): void {
    this.forwards++;
    this.go(1);
  }
  /** Queued, like the real thing — and the target is computed when the
   *  traversal RUNS, which is the whole bug. */
  private go(delta: number): void {
    setTimeout(() => {
      const to = this.index + delta;
      if (to < 0 || to >= this.entries.length) return;
      this.index = to;
      let stopped = false;
      const e: GuardPop = { stopImmediatePropagation: () => void (stopped = true) };
      for (const fn of [...this.listeners]) {
        fn(e);
        if (stopped) break;
      }
    }, 0);
  }
  addPopState(fn: (e: GuardPop) => void): void {
    this.listeners.push(fn);
  }
}

interface S {
  openPath: string;
  sidebarOpen: boolean;
}

function world(opts: { routerFirst?: boolean; syncRetract?: boolean } = {}) {
  const history = new FakeHistory("/A");
  const store = createStore<S>(() => ({ openPath: "A", sidebarOpen: false }));
  const escapes: number[] = [];

  const installGuard = (): void =>
    installBackGuard({
      history,
      layerUp: () => store.getState().sidebarOpen,
      subscribe: (fn) => void store.subscribe(fn),
      onPopState: (fn) => history.addPopState(fn),
      escape: () => {
        escapes.push(1);
        store.setState({ sidebarOpen: false }); // the Escape ladder closes the drawer
      },
      // The 3.23.0 shape is kept reachable so the fake is shown to reproduce
      // the bug — a harness that cannot fail proves nothing.
      defer: opts.syncRetract ? (fn) => fn() : (fn) => queueMicrotask(fn),
      later: (fn) => void setTimeout(fn, 0),
    });

  // client/router.ts::installRouter, reduced to notes.
  const installRouter = (): void => {
    let applying = false;
    store.subscribe((s, prev) => {
      const url = `/${s.openPath}`;
      if (url === `/${prev.openPath}`) return;
      if (history.url === url) return;
      if (applying) history.replaceState(null, "", url);
      else history.pushState(null, "", url);
    });
    history.addPopState(() => {
      applying = true;
      try {
        store.setState({ openPath: history.url.slice(1) });
      } finally {
        applying = false;
      }
    });
  };

  // main.tsx installs the guard at boot; App mounts the router later.
  if (opts.routerFirst) {
    installRouter();
    installGuard();
  } else {
    installGuard();
    installRouter();
  }
  return { history, store, escapes };
}

/** Every queued traversal, its popstate and whatever that re-arms. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 1));
};

describe("the back guard and the router", () => {
  it("the fake history reproduces the 3.23.0 bug with a synchronous retraction", async () => {
    const { history, store } = world({ syncRetract: true });
    store.setState({ sidebarOpen: true });
    store.setState({ openPath: "B", sidebarOpen: false }); // openNote from the drawer
    await settle();
    // The old order lands the traversal ON the guard (the previous note's
    // URL). 3.23.0 applied it and the tap went nowhere; the popstate net now
    // catches exactly that landing and steps forward again.
    assert.equal(history.forwards, 1, "the traversal landed on the guard entry");
    assert.equal(history.url, "/B");
    assert.equal(store.getState().openPath, "B");
  });

  it("a tree row tapped in the drawer opens its note", async () => {
    const { history, store } = world();
    store.setState({ sidebarOpen: true });
    assert.equal(history.entries.length, 2, "the drawer stands a guard entry behind the page");
    store.setState({ openPath: "B", sidebarOpen: false });
    await settle();
    assert.equal(history.url, "/B");
    assert.equal(store.getState().openPath, "B");
    assert.equal(store.getState().sidebarOpen, false);
    assert.equal(history.forwards, 0, "the microtask ordered it; the net was not needed");
  });

  it("a drawer search hit (close, then open, in one handler) opens its note", async () => {
    const { history, store } = world();
    store.setState({ sidebarOpen: true });
    store.setState({ sidebarOpen: false });
    store.setState({ openPath: "B" });
    await settle();
    assert.equal(history.url, "/B");
    assert.equal(store.getState().openPath, "B");
    assert.equal(history.forwards, 0);
  });

  it("does not depend on which subscriber was installed first", async () => {
    const { history, store } = world({ routerFirst: true });
    store.setState({ sidebarOpen: true });
    store.setState({ openPath: "B", sidebarOpen: false });
    await settle();
    assert.equal(history.url, "/B");
    assert.equal(store.getState().openPath, "B");
  });

  it("a navigation pushed between the retraction and its traversal still wins", async () => {
    const { history, store } = world();
    store.setState({ sidebarOpen: true });
    store.setState({ sidebarOpen: false }); // e.g. a new note: close, then await the create
    await Promise.resolve(); // the retraction's microtask has run and called back()…
    await Promise.resolve();
    store.setState({ openPath: "B" }); // …and the note opens before the traversal
    await settle();
    assert.equal(history.url, "/B", "stepped forward past the stale guard");
    assert.equal(store.getState().openPath, "B");
  });

  it("closing the drawer without navigating takes the guard back out", async () => {
    const { history, store } = world();
    store.setState({ sidebarOpen: true });
    store.setState({ sidebarOpen: false });
    await settle();
    assert.equal(history.index, 0, "the stack is as deep as it was before the drawer opened");
    assert.equal(history.url, "/A");
    assert.equal(store.getState().openPath, "A");
  });

  it("back with the drawer out closes the drawer and navigates nowhere", async () => {
    const { history, store, escapes } = world();
    store.setState({ sidebarOpen: true });
    assert.ok((history.state as Record<string, unknown>)[MARK]);
    history.back();
    await settle();
    assert.equal(escapes.length, 1);
    assert.equal(store.getState().sidebarOpen, false);
    assert.equal(history.url, "/A");
    assert.equal(store.getState().openPath, "A");
    assert.equal(history.index, 0);
  });
});
