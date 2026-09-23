// THE PHONE SHELL — Astrolabe designed for the device in the hand.
//
// client/main.tsx mounts this INSTEAD of App.tsx wherever PHONE_SHELL_QUERY
// matches (client/shellQuery.ts): a phone, a tablet with no mouse, a window
// dragged narrower than 700px. It shares everything below the chrome with the
// desktop — the store, the API layer, the dictionary, the editor, the reading
// view and every other surface — and none of the chrome: no tab strip, no
// panes or grips, no status bar, no sidebar drawer. The owner, 3.24: "I almost
// wish to rewrite that whole side of the app to be natively designed for the
// phone and tablet form factor instead of trying to retrofit what we have
// here." This is that side, and it is a frame, not a rewrite: the parts the
// audit measured as good on a phone are mounted as they are.
//
// THE PARTS:
//   · a navigation stack per bottom tab, synced to history (./nav.ts), so the
//     OS back gesture pops a screen and closes a sheet before it pops one;
//   · the bottom tab bar — Today, Notes, Search, Calendar, More — or, on a
//     tablet, the same five as a rail beside a list column and the note;
//   · sheets for everything that was a dialog (./Sheet.tsx), each with a
//     history entry and the page under it inert;
//   · the store collapsed to one pane holding one tab while this is mounted,
//     and never persisted (state.ts `setPhoneShellMode`), so a desktop's
//     eleven tabs survive a morning on the phone.
//
// THE STORE AND THE STACK ARE KEPT IN STEP IN BOTH DIRECTIONS, and neither
// direction is allowed to echo. A tap on a row pushes a screen and opens its
// content in the store; a wikilink, a palette command, a calendar day or the
// daily note opens content in the store and pushes the screen for it. The
// `applying` flag is what stops the second from answering the first.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { isDrawingPath } from "../../shared/noteFormat.ts";
import SiteMark from "../components/SiteMark.tsx";
import { useGlobalKeys } from "../globalKeys.ts";
import { t } from "../i18n.ts";
import { lazySurface } from "../lazySurface.tsx";
import { useOffline } from "../offline.ts";
import OfflineStrip from "../components/OfflineStrip.tsx";
import PreviewBanner from "../components/PreviewBanner.tsx";
import TemplatePicker from "../components/TemplatePicker.tsx";
import { applyUrl, notePathToUrl, orbitsUrl } from "../router.ts";
import { urlForBooksRoute } from "../books/door.ts";
import { useShellRuntime } from "../shellRuntime.ts";
import { TABLET_QUERY } from "../shellQuery.ts";
import { useStore, type State } from "../state.ts";
import {
  activeTabOf,
  isBookPath,
  isGraphTab,
  isMediaTab,
  isOrbitsTab,
  isReviewWeekTab,
  isRoutinesTab,
  orbitsSessionOf,
  paneAt,
  surfaceOf,
  type Workspace,
} from "../workspace.ts";
import ActionSheet from "./ActionSheet.tsx";
import { ACTION_SHEET, MOVE_SHEET, NOTE_SHEET } from "./sheetIds.ts";
import ConfirmSheetHost from "./ConfirmSheet.tsx";
import { PhoneContext, type PhoneApi, type SheetData } from "./context.ts";
import { hardwareKeyboardSeen, installHardwareKeyboardWatch, subscribeHardwareKeyboard } from "./hardwareKeyboard.ts";
import { createNav, sameScreen, topOf, type Nav, type NavCause, type NavState, type Screen, type TabId } from "./nav.ts";
import TabBar from "./TabBar.tsx";
import { screenTitle } from "./titles.ts";
import "./phone.css";

const TodayScreen = lazySurface(() => import("./screens/TodayScreen.tsx"));
const NotesScreen = lazySurface(() => import("./screens/NotesScreen.tsx"));
const SearchScreen = lazySurface(() => import("./screens/SearchScreen.tsx"));
const CalendarScreen = lazySurface(() => import("./screens/CalendarScreen.tsx"));
const MoreScreen = lazySurface(() => import("./screens/MoreScreen.tsx"));
const TagScreen = lazySurface(() => import("./screens/TagScreen.tsx"));
const NoteScreen = lazySurface(() => import("./screens/NoteScreen.tsx"));
const SurfaceScreen = lazySurface(() => import("./screens/SurfaceScreen.tsx"));
// The note sheet and the move sheet reach the outline, the section surgery,
// the twins and the move rules: a first paint that has opened no note has no
// business carrying them (check-bundle's phone audience).
const NoteSheet = lazySurface(() => import("./NoteSheet.tsx"));
const MoveSheet = lazySurface(() => import("./MoveSheet.tsx"));

// The store's own modal surfaces, as the desktop mounts them (App.tsx), each
// behind its flag. On a phone they are LAYERS: each takes a history entry, so
// Back closes it the way its own ✕ does.
const CommandPalette = lazySurface(() => import("../components/CommandPalette.tsx"));
const SettingsModal = lazySurface(() => import("../components/SettingsModal.tsx"));
const TrashModal = lazySurface(() => import("../components/TrashModal.tsx"));
const CaptureSheet = lazySurface(() => import("../components/CaptureSheet.tsx"));
const AskPanel = lazySurface(() => import("../components/AskPanel.tsx"));
const ShortcutsHelp = lazySurface(() => import("../components/ShortcutsHelp.tsx"));
const BannerModal = lazySurface(() => import("../components/BannerModal.tsx"));
const ModerationPanel = lazySurface(() => import("../components/ModerationPanel.tsx"));
const UnusedAttachmentsModal = lazySurface(() => import("../components/UnusedAttachmentsModal.tsx"));
const LoginModal = lazySurface(() => import("../components/LoginModal.tsx"));
const EditorAnnotator = lazySurface(() => import("../annotations/EditorAnnotator.tsx"));

/** A store flag that raises a layer, and how to lower it. */
interface Layer {
  id: string;
  up: (s: State) => boolean;
  down: (s: State) => void;
}

const LAYERS: Layer[] = [
  { id: "settings", up: (s) => s.settingsOpen, down: (s) => s.setSettingsOpen(false) },
  { id: "trash", up: (s) => s.trashOpen, down: (s) => s.setTrashOpen(false) },
  { id: "palette", up: (s) => s.paletteOpen, down: (s) => s.setPaletteOpen(false) },
  { id: "capture", up: (s) => s.captureOpen, down: (s) => s.setCaptureOpen(false) },
  { id: "ask", up: (s) => s.askOpen, down: (s) => s.setAskOpen(false) },
  { id: "shortcuts", up: (s) => s.shortcutsOpen, down: (s) => s.setShortcutsOpen(false) },
  { id: "login", up: (s) => s.loginOpen, down: (s) => s.setLoginOpen(false) },
  { id: "banner", up: (s) => s.bannerModalOpen, down: (s) => s.setBannerModalOpen(false) },
  { id: "moderation", up: (s) => s.moderationOpen, down: (s) => s.setModerationOpen(false) },
  { id: "unused", up: (s) => s.unusedOpen, down: (s) => s.setUnusedOpen(false) },
];
const layerSheet = (id: string): string => `layer:${id}`;

/** Sheets this shell draws itself, which need their data to draw. */
const DATA_SHEETS = new Set([ACTION_SHEET, MOVE_SHEET]);
/** How long a leaving sheet stays mounted for its exit. */
const LEAVE_MS = 240;

/** The content the store is showing, as a screen: what a wikilink, the
 *  palette or the daily note just opened. "calendar" is the Calendar TAB. */
export function screenOfWorkspace(ws: Workspace): Screen | "calendar" | null {
  const pane = paneAt(ws, ws.focus);
  if (pane === null) return null;
  const surface = surfaceOf(pane);
  const tab = activeTabOf(pane);
  switch (surface) {
    case "empty":
      return null;
    case "library":
      return { kind: "surface", tab: "~library" };
    case "calendar":
      return "calendar";
    case "edit":
    case "reading":
      return tab ? { kind: "note", path: tab.path } : null;
    default:
      return tab ? { kind: "surface", tab: tab.path } : null;
  }
}

/** A key for "what is showing" that a mode flip (edit ↔ read) does not change. */
function contentKey(ws: Workspace): string {
  const pane = paneAt(ws, ws.focus);
  if (pane === null) return "";
  if (pane.mode === "library") return "~library";
  return activeTabOf(pane)?.path ?? "";
}

function isDetail(s: Screen): boolean {
  return s.kind === "note" || s.kind === "surface";
}

/** The address a screen shows. Lists have none of their own; a note, a book
 *  and every surface keep the permalink the desktop gives them. */
export function urlForScreen(screen: Screen, tab: TabId): string | null {
  switch (screen.kind) {
    case "note":
      return notePathToUrl(screen.path);
    case "surface": {
      const s = screen.tab;
      if (s === "~library") return urlForBooksRoute({ kind: "library" });
      if (isBookPath(s)) return urlForBooksRoute({ kind: "book", path: s });
      if (isGraphTab(s)) return "/graph";
      if (isMediaTab(s)) return "/media";
      if (isRoutinesTab(s)) return "/sigils";
      if (isReviewWeekTab(s)) return "/review-week";
      if (isOrbitsTab(s)) {
        const session = orbitsSessionOf(s);
        return orbitsUrl(session?.path ?? null, session?.section ?? null);
      }
      return notePathToUrl(s);
    }
    case "root":
      return tab === "calendar" ? "/calendar" : "/";
    default:
      return "/";
  }
}

/** Bring the store to the screen the stack is showing. */
function applyScreen(screen: Screen): void {
  const s = useStore.getState();
  const pane = paneAt(s.workspace, s.workspace.focus);
  const here = pane === null ? null : activeTabOf(pane)?.path ?? null;
  const library = pane?.mode === "library";
  if (screen.kind === "note") {
    if (library) s.closeLibrary();
    if (here !== screen.path || library) s.openNote(screen.path);
    return;
  }
  if (screen.kind !== "surface") return;
  const tab = screen.tab;
  if (tab === "~library") {
    if (!library) s.openLibrary();
    return;
  }
  if (here === tab && !library) return;
  if (isBookPath(tab)) s.openBook(tab);
  else if (isGraphTab(tab)) s.setView("graph");
  else if (isMediaTab(tab)) s.setView("media");
  else if (isRoutinesTab(tab)) s.setView("routines");
  else if (isReviewWeekTab(tab)) s.setView("review-week");
  else if (isOrbitsTab(tab)) {
    const session = orbitsSessionOf(tab);
    s.openOrbits(session?.path ?? null, session?.section ?? null);
  } else if (isDrawingPath(tab)) {
    if (library) s.closeLibrary();
    s.openNote(tab);
  }
}

function useMatch(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Warm the editor's chunks while the reader is still choosing a note, so the
 *  first open is not also the first download. The audit measured 351–995ms
 *  of long tasks on the first note switch and 560–1,317ms on the first scroll
 *  or keystroke after it — all of it the first touch of a chunk. */
function preloadWhenIdle(): () => void {
  const idle = (cb: () => void): number =>
    typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(cb, { timeout: 4000 }) : window.setTimeout(cb, 1500);
  const cancel = (id: number): void => (typeof window.cancelIdleCallback === "function" ? window.cancelIdleCallback(id) : window.clearTimeout(id));
  const steps: (() => Promise<unknown>)[] = [
    () => import("./screens/NoteScreen.tsx"),
    () => import("../components/Editor.tsx"),
    () => import("../reading/ReadingView.tsx"),
    () => import("../editor/livePreview.ts"),
    () => import("../editor/sectioning.ts"),
    () => import("../reading/renderNote.ts"),
    () => import("../reading/toc.ts"),
    () => import("./screens/NotesScreen.tsx"),
    () => import("./screens/SearchScreen.tsx"),
    () => import("./NoteSheet.tsx"),
  ];
  let id = 0;
  let dead = false;
  const next = (): void => {
    const step = steps.shift();
    if (!step || dead) return;
    id = idle(() => {
      void step()
        .catch(() => {})
        .finally(next);
    });
  };
  id = idle(next);
  return () => {
    dead = true;
    cancel(id);
  };
}

function Loading() {
  return <div className="s-ph-screen s-ph-screen--loading" aria-hidden="true" />;
}

export default function PhoneShell() {
  useShellRuntime();
  const authReady = useStore((s) => s.authReady);
  const admin = useStore((s) => s.admin);
  const tree = useStore((s) => s.tree);
  const locked = useStore((s) => !s.admin && !s.publicReads);
  const lang = useStore((s) => s.language);
  const zen = useStore((s) => s.zen);
  const previewVisitor = useStore((s) => s.previewVisitor);
  const offline = useOffline();
  const flags = {
    settings: useStore((s) => s.settingsOpen),
    trash: useStore((s) => s.trashOpen),
    palette: useStore((s) => s.paletteOpen),
    capture: useStore((s) => s.captureOpen),
    ask: useStore((s) => s.askOpen),
    shortcuts: useStore((s) => s.shortcutsOpen),
    login: useStore((s) => s.loginOpen),
    banner: useStore((s) => s.bannerModalOpen),
    moderation: useStore((s) => s.moderationOpen),
    unused: useStore((s) => s.unusedOpen),
  };
  const tablet = useMatch(TABLET_QUERY);
  const keyboard = useSyncExternalStore(subscribeHardwareKeyboard, hardwareKeyboardSeen, () => false);

  const [navState, setNavState] = useState<NavState | null>(null);
  const [cause, setCause] = useState<NavCause>("start");
  const [leaving, setLeaving] = useState<string[]>([]);
  const sheetData = useRef(new Map<string, SheetData>());
  const applying = useRef(false);
  const shownLayers = useRef(new Set<string>());
  const navRef = useRef<Nav | null>(null);
  const prevSheets = useRef<string[]>([]);
  const appRef = useRef<HTMLDivElement | null>(null);

  // ── the navigation, once ─────────────────────────────────────────────────
  if (navRef.current === null) {
    navRef.current = createNav({
      history: window.history,
      urlFor: urlForScreen,
      onChange: (st, why) => onNavChangeRef.current(st, why),
    });
  }
  const nav = navRef.current;

  const onNavChangeRef = useRef<(st: NavState, why: NavCause) => void>(() => {});
  onNavChangeRef.current = (st, why) => {
    setNavState({ ...st, stacks: { ...st.stacks }, sheets: [...st.sheets] });
    setCause(why);
    const top = topOf(st);
    // The store follows the stack.
    applying.current = true;
    try {
      applyScreen(top);
    } finally {
      applying.current = false;
    }
    const site = useStore.getState().siteName;
    document.title = `${screenTitle(top)} · ${site}`;
    // Sheets that left: animate them out, then forget their data.
    const gone = prevSheets.current.filter((id) => !st.sheets.includes(id));
    prevSheets.current = [...st.sheets];
    if (gone.length > 0) {
      setLeaving((l) => [...l, ...gone.filter((id) => !id.startsWith("layer:"))]);
      window.setTimeout(() => {
        setLeaving((l) => l.filter((id) => !gone.includes(id)));
        for (const id of gone) if (!nav.state().sheets.includes(id)) sheetData.current.delete(id);
      }, LEAVE_MS);
    }
    // A data sheet restored by Forward, with nothing to draw: step over it.
    const inner = st.sheets[st.sheets.length - 1];
    if (inner !== undefined && DATA_SHEETS.has(inner) && !sheetData.current.has(inner)) nav.closeSheet(inner);
    // A layer whose entry went (Back): let it close ITSELF, the way its own
    // Escape does — Settings asks before discarding an edit, and a layer that
    // decides to stay takes its entry back.
    const s = useStore.getState();
    for (const layer of LAYERS) {
      const id = layerSheet(layer.id);
      if (st.sheets.includes(id)) {
        shownLayers.current.add(layer.id);
        continue;
      }
      if (!shownLayers.current.has(layer.id) || !layer.up(s)) continue;
      shownLayers.current.delete(layer.id);
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      window.setTimeout(() => {
        const now = useStore.getState();
        if (!layer.up(now)) return;
        // Still up after its own Escape: a question is being asked, or the
        // layer ignores Escape. Close the ones that do not guard anything;
        // give a guarding one (Settings) its entry back.
        if (layer.id === "settings") nav.openSheet(id);
        else layer.down(now);
      }, 60);
    }
  };

  // ── the api every screen reaches ─────────────────────────────────────────
  const api = useMemo<PhoneApi>(() => {
    const open = (screen: Screen): void => {
      const st = nav.state();
      if (st.sheets.length > 0) {
        nav.navigateFromSheet(screen);
        return;
      }
      const top = topOf(st);
      if (tablet && isDetail(screen) && isDetail(top)) nav.replaceTop(screen);
      else nav.push(screen);
    };
    return {
      nav,
      state: navState ?? nav.state(),
      tablet,
      keyboard,
      open,
      openOn: (tab, screen) => nav.pushOn(tab, screen),
      openSheet: (id, data) => {
        if (data) sheetData.current.set(id, data);
        nav.openSheet(id);
      },
      closeSheet: (id) => nav.closeSheet(id),
      sheetData: (id) => sheetData.current.get(id),
    };
  }, [nav, navState, tablet, keyboard]);
  const apiRef = useRef(api);
  apiRef.current = api;

  // ── start: the address bar decides the first screen ──────────────────────
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !authReady) return;
    if (tree === null && !locked) return;
    started.current = true;
    const pathname = location.pathname;
    if (pathname === "/calendar") {
      nav.start("calendar");
      return;
    }
    if (pathname === "/" || locked) {
      nav.start("today");
      return;
    }
    // A deep link: the router's own reading of the address (the same one the
    // desktop runs) opens the content in the store — BEFORE the stack takes
    // the entry over, since `start` rewrites the address to Today's. The stack
    // then pushes the screen for it one entry above the base, so Back comes
    // home to Today instead of leaving the app.
    applying.current = true;
    let known = false;
    const before = contentKey(useStore.getState().workspace);
    try {
      known = applyUrl(true);
    } finally {
      applying.current = false;
    }
    const target = screenOfWorkspace(useStore.getState().workspace);
    nav.start("today");
    if (target === "calendar") nav.switchTab("calendar");
    // Only what the address NAMED: a link the tree could not resolve is
    // being asked of the server (router.ts `probeNote`), and the store still
    // shows whatever the boot restored — which is not what was linked.
    else if (known && target !== null && (contentKey(useStore.getState().workspace) !== before || decodeURI(urlForScreen(target, "today") ?? "") === decodeURI(pathname))) nav.push(target);
  }, [authReady, tree, locked, nav]);

  // ── the store → the stack ────────────────────────────────────────────────
  useEffect(() => {
    if (navState === null) return;
    return useStore.subscribe((s, prev) => {
      if (s.lastRemap !== prev.lastRemap && s.lastRemap !== null) {
        nav.remap(s.lastRemap.from, s.lastRemap.to);
        return;
      }
      // Layers first: a flag that rose takes an entry; one that fell by its
      // own ✕ gives its entry back.
      for (const layer of LAYERS) {
        const was = layer.up(prev);
        const is = layer.up(s);
        if (is && !was) apiRef.current.openSheet(layerSheet(layer.id));
        else if (!is && was) {
          shownLayers.current.delete(layer.id);
          if (nav.state().sheets.includes(layerSheet(layer.id))) nav.closeSheet(layerSheet(layer.id));
        }
      }
      if (applying.current) return;
      if (contentKey(s.workspace) === contentKey(prev.workspace)) return;
      const target = screenOfWorkspace(s.workspace);
      const top = topOf(nav.state());
      if (target === null) {
        // What was on screen closed under us (deleted, unpublished): leave it.
        if (isDetail(top)) nav.popScreen();
        return;
      }
      if (target === "calendar") {
        nav.switchTab("calendar");
        return;
      }
      if (sameScreen(top, target)) return;
      apiRef.current.open(target);
    });
    // Installed once the stack has started; `navState` flips from null once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navState === null, nav]);

  // ── history → the stack ──────────────────────────────────────────────────
  useEffect(() => {
    const onPop = (e: PopStateEvent): void => {
      if (nav.onPop(e.state) === "restored") return;
      // Not one of ours: a hash jump, or a chip that pushed a route and fired
      // popstate (the Orbits chip does). Read the address the way the desktop
      // router would, and stamp the entry with the screen it names.
      applying.current = true;
      try {
        applyUrl();
      } finally {
        applying.current = false;
      }
      const target = screenOfWorkspace(useStore.getState().workspace);
      nav.adoptForeign(target === "calendar" || target === null ? null : target);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [nav]);

  // ── the keyboard ─────────────────────────────────────────────────────────
  useEffect(() => installHardwareKeyboardWatch(), []);
  useGlobalKeys({ phone: true, enabled: hardwareKeyboardSeen, quickSearch: () => nav.switchTab("search") });

  // ── idle warm-up and the document's own marks ────────────────────────────
  useEffect(() => (admin ? preloadWhenIdle() : undefined), [admin]);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("s-ph-doc");
    return () => root.classList.remove("s-ph-doc");
  }, []);

  // Everything under a sheet is INERT: no stray tap reaches the note, no
  // screen reader wanders behind the sheet. Set on the element rather than as
  // a prop, which this React's typings do not carry yet.
  const sheetsUp = (navState?.sheets.length ?? 0) > 0;
  useEffect(() => {
    if (appRef.current) appRef.current.inert = sheetsUp;
  }, [sheetsUp]);

  if (!authReady) return <div className="s-ph" />;

  const st = navState;
  const stack = st ? st.stacks[st.tab] : [];
  const top = stack[stack.length - 1];
  const back = (): void => nav.back();

  const render = (screen: Screen, withBack: boolean): ReactNode => {
    const onBack = withBack ? back : undefined;
    switch (screen.kind) {
      case "root":
        switch (screen.tab) {
          case "today":
            return <TodayScreen />;
          case "notes":
            return <NotesScreen path="" />;
          case "search":
            return <SearchScreen />;
          case "calendar":
            return <CalendarScreen />;
          case "more":
            return <MoreScreen />;
        }
        return null;
      case "folder":
        return <NotesScreen key={screen.path} path={screen.path} onBack={onBack} />;
      case "tag":
        return <TagScreen key={screen.tag} tag={screen.tag} onBack={back} />;
      case "note":
        return <NoteScreen key={screen.path} path={screen.path} onBack={back} />;
      case "surface":
        return <SurfaceScreen key={screen.tab} tab={screen.tab} onBack={back} />;
    }
  };

  let body: ReactNode;
  if (locked) {
    body = (
      <div className="s-ph-screen s-ph-locked">
        <SiteMark size={44} className="s-ph-locked__mark" />
        <p className="s-ph-locked__title">{t("vaultPrivate")}</p>
        <button type="button" className="s-ph-btn s-ph-btn--accent" onClick={() => useStore.getState().setLoginOpen(true)}>
          {t("signIn")}
        </button>
      </div>
    );
  } else if (!st || !top) {
    body = <Loading />;
  } else if (tablet) {
    // Two columns: the deepest list of this tab's stack, and what it opened.
    let listAt = stack.length - 1;
    while (listAt > 0 && isDetail(stack[listAt])) listAt -= 1;
    const list = stack[listAt];
    const detail = isDetail(top) ? top : null;
    const wide = list.kind === "root" && list.tab === "calendar" && detail === null;
    body = (
      <div className={`s-ph-cols${wide ? " s-ph-cols--wide" : ""}`}>
        <div className="s-ph-cols__list">
          <Suspense fallback={<Loading />}>{render(list, listAt > 0 && detail === null)}</Suspense>
        </div>
        {!wide && (
          <div className="s-ph-cols__detail">
            {detail ? (
              <Suspense fallback={<Loading />}>{render(detail, true)}</Suspense>
            ) : (
              <div className="s-ph-cols__empty">
                <SiteMark size={40} />
              </div>
            )}
          </div>
        )}
      </div>
    );
  } else {
    body = (
      <Suspense fallback={<Loading />}>
        <div className={`s-ph-stage s-ph-stage--${cause}`} key={`${st.tab}:${stack.length}:${top.kind}`}>
          {render(top, stack.length > 1)}
        </div>
      </Suspense>
    );
  }

  const barShown = !tablet && !!top && !isDetail(top) && !zen && !locked;
  const sheetIds = [...(st?.sheets ?? []), ...leaving.filter((id) => !(st?.sheets ?? []).includes(id))];
  const layerUp = (id: keyof typeof flags): boolean => flags[id];

  return (
    <PhoneContext.Provider value={api}>
      <div
        className={["s-ph", tablet ? "s-ph--tablet" : "s-ph--phone", zen ? "s-ph--zen" : "", barShown ? "s-ph--tabs" : "", previewVisitor || offline ? "s-ph--notice" : ""].filter(Boolean).join(" ")}
        dir={lang === "ar" ? "rtl" : "ltr"}
        data-tab={st?.tab}
      >
        <PreviewBanner />
        <OfflineStrip />
        <div className="s-ph__app" ref={appRef}>
          {tablet && !locked && !zen && <TabBar rail />}
          <main className="s-ph__main" id="s-main" aria-label={t("mainContent")}>
            {body}
          </main>
          {barShown && <TabBar />}
        </div>
        <div className="s-ph__sheets">
          {sheetIds.map((id) => {
            const out = !(st?.sheets ?? []).includes(id);
            if (id === ACTION_SHEET) return <ActionSheet key={id} leaving={out} />;
            if (id === MOVE_SHEET)
              return (
                <Suspense key={id} fallback={null}>
                  <MoveSheet leaving={out} />
                </Suspense>
              );
            if (id === NOTE_SHEET)
              return (
                <Suspense key={id} fallback={null}>
                  <NoteSheet leaving={out} />
                </Suspense>
              );
            return null;
          })}
          <ConfirmSheetHost />
        </div>
        {/* The store's own layers, as the desktop mounts them. */}
        {layerUp("palette") && (
          <Suspense fallback={null}>
            <CommandPalette />
          </Suspense>
        )}
        {layerUp("settings") && admin && (
          <Suspense fallback={null}>
            <SettingsModal />
          </Suspense>
        )}
        {layerUp("trash") && admin && (
          <Suspense fallback={null}>
            <TrashModal />
          </Suspense>
        )}
        {layerUp("ask") && admin && (
          <Suspense fallback={null}>
            <AskPanel />
          </Suspense>
        )}
        {layerUp("capture") && admin && (
          <Suspense fallback={null}>
            <CaptureSheet />
          </Suspense>
        )}
        {layerUp("shortcuts") && (
          <Suspense fallback={null}>
            <ShortcutsHelp />
          </Suspense>
        )}
        {layerUp("banner") && admin && (
          <Suspense fallback={null}>
            <BannerModal />
          </Suspense>
        )}
        {layerUp("moderation") && admin && (
          <Suspense fallback={null}>
            <ModerationPanel />
          </Suspense>
        )}
        {layerUp("unused") && admin && (
          <Suspense fallback={null}>
            <UnusedAttachmentsModal />
          </Suspense>
        )}
        {layerUp("login") && (
          <Suspense fallback={null}>
            <LoginModal />
          </Suspense>
        )}
        {admin && <TemplatePicker />}
        {admin && (
          <Suspense fallback={null}>
            <EditorAnnotator />
          </Suspense>
        )}
      </div>
    </PhoneContext.Provider>
  );
}
