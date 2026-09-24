// THE PHONE'S NAVIGATION: a stack per bottom tab, and the browser's history
// kept in step with it.
//
// WHY A STACK, AND WHY IT OWNS HISTORY. A phone has one gesture for "go back"
// — the Android back button, the edge swipe, iOS's interactive pop — and it
// is wired to `history`. The desktop shell pushes one history entry per note
// and NONE for the layers it draws over a note, so client/backGesture.ts had
// to stand a guard entry behind every drawer and palette and take it back out
// when the layer closed. That guard raced the router: a note opened FROM the
// drawer closed the drawer in the same store commit, the guard's `back()` was
// issued before the router's `pushState`, and the pop landed on the guard and
// restored the page the reader had just left (the audit's P0: a tree tap on a
// phone opened nothing). Two modules each owning half of history cannot be
// ordered; one module owning all of it can.
//
// So here every screen push is a `pushState` and every sheet is one too, each
// entry carrying the WHOLE of what it shows (`{ phone: { depth, entry } }`),
// and every way back is the browser's own pop. A pop restores the entry it
// lands on; nothing is inferred from the order events arrive in. And the one
// asynchronous operation — `history.back()`/`go()` — is SERIALISED: anything
// asked for while a pop is in flight waits for the `popstate` and then runs,
// so "close the sheet, then open the note" cannot be reordered by the browser.
//
// TWO THINGS A SCREEN MAY ASK OF THE STACK (3.27.0). A list remembers where
// it was scrolled: the push that leaves it stamps the scroll offset into the
// entry it leaves (`scrollOf`), so the pop that comes back — a Back, or a
// reload that lands on it — hands the offset back (`NavState.scroll`). And a
// screen holding unsaved edits (a Settings section) may refuse to be left
// (`canLeave`): the move is not made, the refusal is reported with a way to
// make it anyway (`onBlocked`), and a Back that had already popped the entry
// is undone by pushing the entry straight back, so the edits are never
// unmounted under the question.
//
// PURE BY INJECTION. The history object, the URL of a screen and the popstate
// subscription are passed in, so tests/phoneNav.test.ts drives this module
// with a fake history and asserts the stack and the entries together.

/** The five bottom tabs, in reading order. */
export const TABS = ["today", "notes", "search", "calendar", "more"] as const;
export type TabId = (typeof TABS)[number];

/** One screen of a tab's stack. */
export type Screen =
  | { kind: "root"; tab: TabId }
  /** A note, in the note screen. */
  | { kind: "note"; path: string }
  /** One folder of the tree, as a pushed list. */
  | { kind: "folder"; path: string }
  /** Every note carrying a tag. */
  | { kind: "tag"; tag: string }
  /** A surface the store opens as a workspace tab: `~orbits` (the decks),
   *  `~orbits/<deck>` (a session), `~sigils`, `~media`, `~graph`,
   *  `~review-week`, a book, a drawing, or `~library`. Each has a phone
   *  screen of its own except the graph and a drawing, which are still drawn
   *  by the pane's surface switch under a top bar (SurfaceScreen). */
  | { kind: "surface"; tab: string }
  /** Settings: the list of sections (`section: ""`), or one section. */
  | { kind: "settings"; section: string }
  /** One deck: what is due, what is new, and Study. */
  | { kind: "deck"; path: string }
  /** One sigil — the `index`th ```sigil fence in `path` — with today first. */
  | { kind: "sigil"; path: string; index: number }
  /** One tracker — the `index`th ```tracker fence in `path` — as its card. */
  | { kind: "tracker"; path: string; index: number };

export interface NavEntry {
  tab: TabId;
  /** The active tab's stack at this entry, root first. */
  stack: Screen[];
  /** Sheets open over the top screen, innermost last. */
  sheets: string[];
  /** Where the top screen's list was scrolled when a push left it. */
  scroll?: number;
}

export interface NavState {
  tab: TabId;
  stacks: Record<TabId, Screen[]>;
  sheets: string[];
  /** Where in our own run of history entries this is (0 = the base entry). */
  depth: number;
  /** The scroll offset the top screen should come back to — set when a pop
   *  lands on an entry that recorded one. */
  scroll?: number;
}

export interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string, url?: string | null): void;
  replaceState(data: unknown, unused: string, url?: string | null): void;
  go(delta: number): void;
}

export interface NavDeps {
  history: HistoryLike;
  /** The address a screen shows in the bar; null keeps the current one. */
  urlFor: (screen: Screen, tab: TabId) => string | null;
  /** Called after every change, with the new state. */
  onChange: (state: NavState, cause: NavCause) => void;
  /** The scroll offset of the screen on top now, read as a push leaves it. */
  scrollOf?: () => number | null;
  /** May the reader go from `from` to `to`? Asked before every move and on
   *  every pop; absent means yes. */
  canLeave?: (from: NavState, to: NavState) => boolean;
  /** A move `canLeave` refused. `proceed` makes it anyway — call it once the
   *  reason for refusing is gone (the edits were saved or discarded). */
  onBlocked?: (proceed: () => void) => void;
}

/** Why the state changed — a pop is the one the shell answers differently
 *  (it closes a store layer the entry no longer carries). */
export type NavCause = "start" | "push" | "replace" | "pop" | "tab";

export function rootOf(tab: TabId): Screen {
  return { kind: "root", tab };
}

export function emptyStacks(): Record<TabId, Screen[]> {
  return { today: [rootOf("today")], notes: [rootOf("notes")], search: [rootOf("search")], calendar: [rootOf("calendar")], more: [rootOf("more")] };
}

export function screenKey(s: Screen): string {
  switch (s.kind) {
    case "root":
      return `root:${s.tab}`;
    case "note":
      return `note:${s.path}`;
    case "folder":
      return `folder:${s.path}`;
    case "tag":
      return `tag:${s.tag}`;
    case "surface":
      return `surface:${s.tab}`;
    case "settings":
      return `settings:${s.section}`;
    case "deck":
      return `deck:${s.path}`;
    case "sigil":
      return `sigil:${s.path}#${s.index}`;
    case "tracker":
      return `tracker:${s.path}#${s.index}`;
  }
}

export function sameScreen(a: Screen | undefined, b: Screen | undefined): boolean {
  return a !== undefined && b !== undefined && screenKey(a) === screenKey(b);
}

export function topOf(state: NavState): Screen {
  const stack = state.stacks[state.tab];
  return stack[stack.length - 1];
}

function isTab(v: unknown): v is TabId {
  return typeof v === "string" && (TABS as readonly string[]).includes(v);
}

function isScreen(v: unknown): v is Screen {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  switch (s.kind) {
    case "root":
      return isTab(s.tab);
    case "note":
    case "folder":
      return typeof s.path === "string";
    case "tag":
      return typeof s.tag === "string";
    case "surface":
      return typeof s.tab === "string";
    case "settings":
      return typeof s.section === "string";
    case "deck":
      return typeof s.path === "string";
    case "sigil":
    case "tracker":
      return typeof s.path === "string" && typeof s.index === "number" && Number.isInteger(s.index) && s.index >= 0;
    default:
      return false;
  }
}

/** The phone's own mark on a history entry, or null for any other entry (the
 *  first load, a hash jump, a foreign `pushState(null…)`). Total: a
 *  hand-edited or truncated state is null, never a throw. */
export function readMark(raw: unknown): { depth: number; entry: NavEntry } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const mark = (raw as { phone?: unknown }).phone;
  if (typeof mark !== "object" || mark === null) return null;
  const m = mark as { depth?: unknown; entry?: unknown };
  if (typeof m.depth !== "number" || !Number.isInteger(m.depth) || m.depth < 0) return null;
  const e = m.entry as { tab?: unknown; stack?: unknown; sheets?: unknown; scroll?: unknown } | undefined;
  if (!e || !isTab(e.tab) || !Array.isArray(e.stack) || e.stack.length === 0 || !e.stack.every(isScreen)) return null;
  const sheets = Array.isArray(e.sheets) ? e.sheets.filter((x): x is string => typeof x === "string") : [];
  const stack = e.stack as Screen[];
  if (stack[0].kind !== "root" || stack[0].tab !== e.tab) return null;
  const entry: NavEntry = { tab: e.tab, stack, sheets };
  if (typeof e.scroll === "number" && Number.isFinite(e.scroll) && e.scroll > 0) entry.scroll = Math.round(e.scroll);
  return { depth: m.depth, entry };
}

function entryOf(state: NavState): NavEntry {
  return { tab: state.tab, stack: state.stacks[state.tab], sheets: state.sheets };
}

export interface Nav {
  state(): NavState;
  /** Take over the current history entry as the base of the run. */
  start(tab: TabId, stack?: Screen[]): void;
  /** Push a screen on the active tab. */
  push(screen: Screen): void;
  /** Replace the top screen (the tablet's list-to-detail pick, a rename). */
  replaceTop(screen: Screen): void;
  /** Switch bottom tab; the active tab again pops it to its root. */
  switchTab(tab: TabId): void;
  /** Push a screen on ANOTHER tab and show it there. */
  pushOn(tab: TabId, screen: Screen): void;
  /** One step back: the browser's pop. */
  back(): void;
  /** Leave the top screen, however many sheets stand over it. */
  popScreen(): void;
  /** Go back down the active tab's stack to `screen` (the highest one below
   *  the top that it names): what a session's own "back to the shelf" asks,
   *  said to the stack. False when the stack does not hold it. */
  popTo(screen: Screen): boolean;
  /** Open a sheet: an entry of its own, so back closes it first. */
  openSheet(id: string): void;
  /** Close the innermost sheet if it is `id` (or any, with no id). */
  closeSheet(id?: string): void;
  /** Navigate from inside a sheet: the sheet's entry becomes the screen's, so
   *  back returns to the screen the sheet was over, not to the sheet. */
  navigateFromSheet(screen: Screen): void;
  /** Feed a `popstate`. */
  onPop(raw: unknown): "restored" | "foreign";
  /** Re-stamp the current (foreign) entry with a screen pushed on top. */
  adoptForeign(screen: Screen | null): void;
  /** A note or folder moved (client/state.ts `lastRemap`): every screen that
   *  names it follows, now and in any entry a later pop restores. */
  remap(from: string, to: string): void;
}

function remapPath(path: string, from: string, to: string): string {
  if (path === from) return to;
  if (path.startsWith(`${from}/`)) return to + path.slice(from.length);
  return path;
}

/** One screen with a move applied. */
export function remapScreen(screen: Screen, from: string, to: string): Screen {
  switch (screen.kind) {
    case "note": {
      const path = remapPath(screen.path, from, to);
      return path === screen.path ? screen : { kind: "note", path };
    }
    case "folder": {
      const path = remapPath(screen.path, from, to);
      return path === screen.path ? screen : { kind: "folder", path };
    }
    case "surface": {
      const tab = remapPath(screen.tab, from, to);
      return tab === screen.tab ? screen : { kind: "surface", tab };
    }
    case "deck": {
      const path = remapPath(screen.path, from, to);
      return path === screen.path ? screen : { kind: "deck", path };
    }
    case "sigil":
    case "tracker": {
      const path = remapPath(screen.path, from, to);
      return path === screen.path ? screen : { ...screen, path };
    }
    default:
      return screen;
  }
}

export function createNav(deps: NavDeps): Nav {
  let st: NavState = { tab: "today", stacks: emptyStacks(), sheets: [], depth: 0 };
  /** Our record of the run, by depth — what `popScreen` and a re-tap of the
   *  active tab walk back through. Entries past the current depth are the
   *  forward half and are dropped on the next push, as the browser drops them. */
  let entries: NavEntry[] = [];
  /** Pops asked of the browser and not yet answered. */
  let popsInFlight = 0;
  /** Every move seen this session, oldest first. */
  const remaps: [string, string][] = [];
  const followMoves = (stack: Screen[]): Screen[] => {
    if (remaps.length === 0) return stack;
    let out = stack;
    for (const [from, to] of remaps) out = out.map((sc) => remapScreen(sc, from, to));
    return out;
  };
  const queue: (() => void)[] = [];

  const url = (s: NavState): string | null => deps.urlFor(topOf(s), s.tab);
  const mark = (depth: number, entry: NavEntry) => ({ phone: { depth, entry } });

  function run(op: () => void): void {
    if (popsInFlight > 0) queue.push(op);
    else op();
  }

  /** Would this move leave a screen that refuses to be left? Then it is not
   *  made: the refusal goes to the shell with the move to make once the
   *  reason is gone. */
  function refused(next: NavState, proceed: () => void): boolean {
    if (!deps.canLeave || deps.canLeave(st, next)) return false;
    deps.onBlocked?.(proceed);
    return true;
  }

  function commit(next: NavState, how: "push" | "replace", cause: NavCause): void {
    if (how === "push" && deps.scrollOf && st.depth < next.depth) {
      // The screen being left keeps its place: the entry it is leaving
      // records the scroll, so the pop that comes back can restore it.
      const y = deps.scrollOf();
      const leaving = entries[st.depth];
      if (leaving && y !== null && y > 0 && leaving.scroll !== y) {
        entries[st.depth] = { ...leaving, scroll: Math.round(y) };
        deps.history.replaceState(mark(st.depth, entries[st.depth]), "");
      }
    }
    st = { ...next, scroll: undefined };
    const entry = entryOf(st);
    if (how === "push") {
      entries = entries.slice(0, st.depth);
      entries[st.depth] = entry;
      deps.history.pushState(mark(st.depth, entry), "", url(st));
    } else {
      entries[st.depth] = entry;
      deps.history.replaceState(mark(st.depth, entry), "", url(st));
    }
    deps.onChange(st, cause);
  }

  function goBack(n: number): void {
    if (n <= 0) return;
    popsInFlight += 1;
    deps.history.go(-n);
  }

  function withStack(tab: TabId, stack: Screen[], sheets: string[] = []): NavState {
    return { tab, stacks: { ...st.stacks, [tab]: stack }, sheets, depth: st.depth };
  }

  /** The state an earlier entry of our run would restore. */
  function stateAt(j: number): NavState {
    const e = entries[j];
    return { tab: e.tab, stacks: { ...st.stacks, [e.tab]: e.stack }, sheets: e.sheets, depth: j };
  }

  const nav: Nav = {
    state: () => st,

    start(tab, stack) {
      const s = stack && stack.length > 0 && stack[0].kind === "root" ? stack : [rootOf(tab)];
      st = { tab, stacks: { ...emptyStacks(), [tab]: s }, sheets: [], depth: 0 };
      entries = [entryOf(st)];
      deps.history.replaceState(mark(0, entryOf(st)), "", url(st));
      deps.onChange(st, "start");
    },

    push(screen) {
      run(() => {
        if (sameScreen(topOf(st), screen) && st.sheets.length === 0) return;
        const next = withStack(st.tab, [...st.stacks[st.tab], screen]);
        next.depth = st.depth + 1;
        if (refused(next, () => nav.push(screen))) return;
        commit(next, "push", "push");
      });
    },

    replaceTop(screen) {
      run(() => {
        const stack = st.stacks[st.tab];
        if (stack.length === 1) {
          nav.push(screen);
          return;
        }
        const next = withStack(st.tab, [...stack.slice(0, -1), screen], st.sheets);
        if (refused(next, () => nav.replaceTop(screen))) return;
        commit(next, "replace", "replace");
      });
    },

    switchTab(tab) {
      run(() => {
        if (tab === st.tab && st.sheets.length === 0) {
          const stack = st.stacks[tab];
          if (stack.length === 1) return;
          // Back through our own run to the tab's root, when the entries
          // between here and there are all this tab's (the usual case: the
          // reader drilled down and wants out). Otherwise a fresh entry.
          let j = st.depth;
          while (j > 0 && entries[j - 1]?.tab === tab && entries[j - 1].sheets.length === 0 && entries[j].stack.length > 1) j -= 1;
          if (entries[j]?.tab === tab && entries[j].stack.length === 1 && j < st.depth) {
            if (refused(stateAt(j), () => nav.switchTab(tab))) return;
            goBack(st.depth - j);
            return;
          }
          const next = withStack(tab, [rootOf(tab)]);
          next.depth = st.depth + 1;
          if (refused(next, () => nav.switchTab(tab))) return;
          commit(next, "push", "tab");
          return;
        }
        const next: NavState = { tab, stacks: st.stacks, sheets: [], depth: st.depth + 1 };
        if (refused(next, () => nav.switchTab(tab))) return;
        commit(next, "push", "tab");
      });
    },

    pushOn(tab, screen) {
      run(() => {
        const base = st.stacks[tab];
        const stack = sameScreen(base[base.length - 1], screen) ? base : [...base, screen];
        const next: NavState = { tab, stacks: { ...st.stacks, [tab]: stack }, sheets: [], depth: st.depth + 1 };
        if (refused(next, () => nav.pushOn(tab, screen))) return;
        commit(next, "push", "tab");
      });
    },

    back() {
      run(() => {
        if (st.depth === 0) {
          // The base of our run: nothing of ours to pop. A pushed screen
          // with no entry under it (a deep link) steps down in place, so
          // back never leaves the app from inside a note.
          const stack = st.stacks[st.tab];
          let next: NavState | null = null;
          if (st.sheets.length > 0) next = { ...st, sheets: st.sheets.slice(0, -1) };
          else if (stack.length > 1) next = withStack(st.tab, stack.slice(0, -1));
          else if (st.tab !== "today") next = { tab: "today", stacks: st.stacks, sheets: [], depth: 0 };
          if (next === null || refused(next, () => nav.back())) return;
          commit(next, "replace", "pop");
          return;
        }
        // The pop itself is judged when it lands (onPop): the entry under
        // this one is what it restores.
        goBack(1);
      });
    },

    popScreen() {
      run(() => {
        const n = st.stacks[st.tab].length;
        if (n <= 1 && st.sheets.length === 0) return;
        // The nearest earlier entry of this tab with a shorter stack and no
        // sheet: that is the screen under this one.
        let j = st.depth - 1;
        while (j >= 0 && !(entries[j]?.tab === st.tab && entries[j].stack.length < n && entries[j].sheets.length === 0)) j -= 1;
        if (j >= 0 && entries[j].stack.length === n - 1) {
          if (refused(stateAt(j), () => nav.popScreen())) return;
          goBack(st.depth - j);
          return;
        }
        const next = withStack(st.tab, n > 1 ? st.stacks[st.tab].slice(0, -1) : st.stacks[st.tab]);
        if (refused(next, () => nav.popScreen())) return;
        commit(next, "replace", "pop");
      });
    },

    popTo(screen) {
      const below = (): number => {
        const stack = st.stacks[st.tab];
        let i = stack.length - 2;
        while (i >= 0 && !sameScreen(stack[i], screen)) i -= 1;
        return i;
      };
      if (below() < 0) return false;
      run(() => {
        const i = below();
        if (i < 0) return;
        const n = i + 1;
        let j = st.depth - 1;
        while (j >= 0 && !(entries[j]?.tab === st.tab && entries[j].sheets.length === 0 && entries[j].stack.length === n && sameScreen(entries[j].stack[i], screen))) j -= 1;
        if (j >= 0) {
          if (refused(stateAt(j), () => nav.popTo(screen))) return;
          goBack(st.depth - j);
          return;
        }
        const next = withStack(st.tab, st.stacks[st.tab].slice(0, n));
        if (refused(next, () => nav.popTo(screen))) return;
        commit(next, "replace", "pop");
      });
      return true;
    },

    openSheet(id) {
      run(() => {
        const next: NavState = { ...st, sheets: [...st.sheets, id], depth: st.depth + 1 };
        commit(next, "push", "push");
      });
    },

    closeSheet(id) {
      run(() => {
        const inner = st.sheets[st.sheets.length - 1];
        if (inner === undefined || (id !== undefined && inner !== id)) return;
        const below = entries[st.depth - 1];
        if (st.depth > 0 && below && below.sheets.length === st.sheets.length - 1) goBack(1);
        else commit({ ...st, sheets: st.sheets.slice(0, -1) }, "replace", "pop");
      });
    },

    navigateFromSheet(screen) {
      run(() => {
        if (st.sheets.length === 0) {
          nav.push(screen);
          return;
        }
        const stack = st.stacks[st.tab];
        const next = withStack(st.tab, sameScreen(stack[stack.length - 1], screen) ? stack : [...stack, screen], []);
        if (refused(next, () => nav.navigateFromSheet(screen))) return;
        commit(next, "replace", "replace");
      });
    },

    onPop(raw) {
      if (popsInFlight > 0) popsInFlight -= 1;
      const found = readMark(raw);
      if (found !== null) {
        const { depth } = found;
        const entry = { ...found.entry, stack: followMoves(found.entry.stack) };
        const next: NavState = { tab: entry.tab, stacks: { ...st.stacks, [entry.tab]: entry.stack }, sheets: entry.sheets, depth, scroll: entry.scroll };
        if (deps.canLeave && !deps.canLeave(st, next)) {
          // The browser has already popped. Put the entry we were on back on
          // top — one step past where the pop landed — so what is on screen
          // and what history says agree, and ask. The state is not touched,
          // so the screen holding the edits is never unmounted.
          const at = depth + 1;
          const here = entryOf(st);
          entries = entries.slice(0, at);
          entries[at] = here;
          st = { ...st, depth: at };
          deps.history.pushState(mark(at, here), "", url(st));
          deps.onBlocked?.(() => nav.back());
        } else {
          st = next;
          entries[depth] = entry;
          deps.onChange(st, "pop");
        }
      }
      // Whatever was asked for while the pop was in flight runs now, in order.
      while (popsInFlight === 0 && queue.length > 0) queue.shift()!();
      return found === null ? "foreign" : "restored";
    },

    remap(from, to) {
      if (from === to) return;
      remaps.push([from, to]);
      run(() => {
        const stacks = { ...st.stacks };
        for (const tab of TABS) stacks[tab] = followMoves(stacks[tab]);
        entries = entries.map((e) => ({ ...e, stack: followMoves(e.stack) }));
        commit({ ...st, stacks }, "replace", "replace");
      });
    },

    adoptForeign(screen) {
      // A `pushState(null…)` from outside (a chip that pushes a route and
      // fires popstate, the way the Orbits chip does), a hash jump, or the
      // first load: the entry is here and carries nothing of ours. Stamp it
      // as one step past the last entry we knew, with the screen it names.
      const stack = st.stacks[st.tab];
      const nextStack = screen === null || sameScreen(stack[stack.length - 1], screen) ? stack : [...stack, screen];
      const next: NavState = { tab: st.tab, stacks: { ...st.stacks, [st.tab]: nextStack }, sheets: [], depth: st.depth + 1 };
      commit(next, "replace", "push");
    },
  };
  return nav;
}
