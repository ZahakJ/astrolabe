// THE GUARD ENTRY, with nothing of the app in it (client/backGesture.ts wires
// it to the store and the window). Kept apart so a test can drive it against a
// fake history that behaves like a browser's — traversals are ASYNCHRONOUS,
// and the offset is taken when the traversal runs, not when `back()` is
// called — without importing the whole store (tests/backGesture.test.ts).
//
// THE ORDERING BUG THIS SHAPE EXISTS FOR (3.23.1). Tapping a note in the phone
// drawer is ONE store update: `openNote` opens the note and closes the drawer
// in the same `set()`. Two subscribers answer it — this guard ("no layer is up
// any more: take the entry back out") and the router ("the note changed: push
// its URL") — and this one was installed first (main.tsx loads it at boot,
// App mounts the router later). So the guard called `history.back()` while
// the guard entry was still current, the router then pushed the note's URL on
// top, and the queued traversal — which counts from wherever the stack is when
// it RUNS — landed on the guard entry, whose URL is the previous note. The
// router's popstate put that note back. The tap opened a background tab and
// left the reader where they were.
//
// The fix is to decide AFTER the update has been answered by everyone: the
// retraction is deferred to a microtask, which runs after every subscriber of
// the same `set()` (and after any synchronous follow-up `set()` in the same
// handler — a search hit that closes the drawer, then opens the note) but
// before the browser gets a chance to paint or run a traversal. By then a
// navigation has pushed its entry and the guard is no longer current, so it is
// abandoned, which is the branch that was always meant to run.
//
// And a net for the one path a microtask cannot order: a navigation that is
// pushed LATER, between our `back()` and the traversal it queued (an open that
// waits on a fetch). The traversal then lands on our own guard entry instead
// of below it — and the only way that can happen is that something was pushed
// on top — so the pop is swallowed before the router sees it and the reader is
// stepped forward to the page they asked for.

/** Marks the entry this module pushed. */
export const MARK = "astrolabeOverlay";

export interface GuardHistory {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  back(): void;
  forward(): void;
}

/** A popstate as far as the guard needs one. */
export interface GuardPop {
  stopImmediatePropagation(): void;
}

export interface GuardHost {
  history: GuardHistory;
  /** Is any layer the guard is responsible for on screen? */
  layerUp(): boolean;
  /** Called after every store update. */
  subscribe(listener: () => void): void;
  /** Must be registered BEFORE the router's own popstate listener, so a pop
   *  the guard swallows never reaches it (backGesture installs at boot; the
   *  router mounts with App). */
  onPopState(listener: (e: GuardPop) => void): void;
  /** Close the topmost layer — an Escape through the app's own ladder. */
  escape(): void;
  /** Run after every subscriber of the current update: `queueMicrotask`. */
  defer(fn: () => void): void;
  /** Run after React has committed: `setTimeout(fn, 0)`. */
  later(fn: () => void): void;
}

const isGuard = (state: unknown): boolean =>
  !!(state as Record<string, unknown> | null)?.[MARK];

export function installBackGuard(host: GuardHost): void {
  const { history } = host;
  /** True while our guard entry stands in the stack as the current page's. */
  let guardUp = false;
  /** Set for the one `popstate` our own `history.back()` provokes, so an
   *  Escape-closed layer does not ALSO get an Escape from the pop. */
  let retracting = false;

  const pushGuard = (): void => {
    if (guardUp) return;
    guardUp = true;
    history.pushState({ [MARK]: true }, "");
  };

  const retractGuard = (): void => {
    if (!guardUp) return;
    guardUp = false;
    host.defer(() => {
      // A layer came straight back up in the same turn: its guard is the
      // entry already standing, so leave it where it is.
      if (guardUp) return;
      // Only if the entry is still OURS. A reader who opened the drawer and
      // then opened a note from it has pushed a note entry on top by now
      // (that is what deferring bought); going back there would undo the
      // navigation they just asked for, so the guard is simply abandoned — a
      // stale entry costs one harmless extra back press at worst, and undoing
      // a reader's navigation costs them the note.
      if (!isGuard(history.state)) return;
      retracting = true;
      history.back();
    });
  };

  let was = host.layerUp();
  if (was) pushGuard();

  host.subscribe(() => {
    const now = host.layerUp();
    if (now === was) return;
    was = now;
    if (now) pushGuard();
    else retractGuard();
  });

  host.onPopState((e) => {
    if (retracting) {
      retracting = false;
      // Our back() was meant to step BELOW the guard. Landing ON a guard
      // means a page was pushed above it between the call and the traversal:
      // the reader navigated, so undo our step instead of theirs.
      if (isGuard(history.state)) {
        e.stopImmediatePropagation();
        history.forward();
      }
      return;
    }
    if (!guardUp) return;
    guardUp = false;
    if (!host.layerUp()) return;
    // Escape decides WHICH layer, and re-arms the guard if the ladder left
    // another one standing.
    host.escape();
    host.later(() => {
      was = host.layerUp();
      if (was) pushGuard();
    });
  });
}
