// The DESKTOP shell: layout grid (sidebar | main | backlinks, status bar
// below). What keeps the vault fresh underneath (the SSE subscription, the
// boot, the unsaved-text guard) is client/shellRuntime.ts and the global keys
// are client/globalKeys.ts — both shared with the phone shell
// (client/phone/PhoneShell.tsx), which client/main.tsx mounts instead of this
// one on phones and tablets.

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { lazySurface } from "./lazySurface.tsx";
import PaneGrip, { reopenDragProps, usePaneLayout } from "./components/PaneGrip.tsx";
import SiteMark from "./components/SiteMark.tsx";
import { collectNotes } from "./editor/links.ts";
import ConfirmHost from "./components/Confirm.tsx";
import LoginModal from "./components/LoginModal.tsx";
import PreviewBanner from "./components/PreviewBanner.tsx";
// The vim sub-mode copy table lives in its own module rather than in
// StatusBar, which is now lazy: a named import from a lazy component's file is
// a STATIC import of that file, and StatusBar reaches the designer, the theme
// picker and the sync badge. One named import would have dragged all of it
// back into the first paint and quietly undone the split below.
import { vimSubCopy } from "./vimCopy.ts";
// Always-mounted hosts stay STATIC. All four render (or stand ready to
// render) on every path through this component, so lazy() would buy no
// deferral — the import fires the moment they mount — while costing each of
// them a boundary and a round trip. Only a surface that is CONDITIONALLY
// mounted is worth splitting.
import DesignStatus from "./design/DesignStatus.tsx";

import TemplatePicker from "./components/TemplatePicker.tsx";
import { t } from "./i18n.ts";
import { promptNewNote } from "./prompts.ts";
import { applyUrl, installRouter, syncUrl } from "./router.ts";
import { useShellRuntime } from "./shellRuntime.ts";
import { useGlobalKeys } from "./globalKeys.ts";
import { openTour, subscribeTourSeen, tourSeen } from "./tour.ts";
import { useOffline } from "./offline.ts";
import OfflineStrip from "./components/OfflineStrip.tsx";
import { useStore } from "./state.ts";
import { toast } from "./toast.ts";
import { paneAt, surfaceOf } from "./workspace.ts";

/** How long zen's ✕ lingers before fading out (any mouse move brings it back). */
const ZEN_HINT_MS = 2000;


// macOS binds Ctrl+B to emacs-style "char left" inside CodeMirror, and this
// file used to carry an IS_MAC test so the editor could keep it. The test is
// gone with the shortcut: Ctrl/Cmd+B is now the EDITOR's (bold), so the
// question "may the editor have this key" no longer has a platform answer —
// CodeMirror's own precedence decides, and plain Ctrl+B on macOS still reaches
// the emacs binding underneath `formatKeymap`'s Mod-b.

// Everything below this line is a SURFACE, not a shell: exactly one of the
// two shells is ever mounted, and most of the app shell's modals never open
// at all. Reaching them through lazy() is what gives rollup a boundary to
// split on — build/chunks.ts then regroups them so each surface arrives as
// one request rather than a waterfall of per-component chunks.
//
// ConfirmHost, LoginModal and PreviewBanner deliberately stay static above:
// all three render in the BLOG branch as well, so making them lazy would
// drag the app-shell chunk back into an anonymous reader's first paint —
// the exact cost this split exists to remove.
//
// The CodeMirror editor keeps its own chunk (its dependencies dwarf every
// other surface). That boundary is ASSERTED, not assumed:
// `node scripts/check-bundle.mjs` fails the build if CodeMirror, the vim
// keymap, KaTeX or the graph engine ever reappear in what a first paint
// downloads.
//
// EVERY ONE OF THESE GETS ITS OWN <Suspense>, and that is a correctness rule,
// not a taste one. A boundary is not a loading indicator: React unmounts the
// WHOLE subtree under the boundary that suspends and replaces it with the
// fallback. One boundary around the shell therefore meant that opening
// Settings — a modal — tore down the sidebar, the tabs, the editor and the
// status bar with it; on a throttled connection the open note went to zero
// characters while the reader watched, and CodeMirror was remounted from
// scratch when the chunk landed. It also broke focus: the dialogs capture
// `document.activeElement` as the opener to restore on Escape, and the
// element they were opened FROM had just been unmounted, so the first Escape
// of every session dropped focus to <body>. Per-surface boundaries fix both,
// because nothing that is already on screen is inside the boundary that
// suspends.
const Workspace = lazySurface(() => import("./components/Workspace.tsx"));
const BlogShell = lazySurface(() => import("./blog/BlogShell.tsx"));
const DesignedSite = lazySurface(() => import("./design/DesignedSite.tsx"));
const Sidebar = lazySurface(() => import("./components/Sidebar.tsx"));
const EditorAnnotator = lazySurface(() => import("./annotations/EditorAnnotator.tsx"));
const Tabs = lazySurface(() => import("./components/Tabs.tsx"));
const StatusBar = lazySurface(() => import("./components/StatusBar.tsx"));
const BacklinksPanel = lazySurface(() => import("./components/BacklinksPanel.tsx"));
const CommandPalette = lazySurface(() => import("./components/CommandPalette.tsx"));
const BannerModal = lazySurface(() => import("./components/BannerModal.tsx"));
const ModerationPanel = lazySurface(() => import("./components/ModerationPanel.tsx"));
const TrashModal = lazySurface(() => import("./components/TrashModal.tsx"));
const ImportDialog = lazySurface(() => import("./import/ImportDialog.tsx"));
const UnusedAttachmentsModal = lazySurface(() => import("./components/UnusedAttachmentsModal.tsx"));
const SettingsModal = lazySurface(() => import("./components/SettingsModal.tsx"));
// The quick-capture sheet (docs/capture.md): a keystroke away from anywhere,
// so it is mount-gated on its store flag like the shortcuts sheet and lazy
// for the same reason — a first paint should not carry a dialog it has not
// been asked for.
const CaptureSheet = lazySurface(() => import("./components/CaptureSheet.tsx"));
// The answer panel (docs/ask.md): mount-gated and lazy on the same terms —
// its chunk carries the NDJSON reader and the citation renderer, and a first
// paint has asked no question.
const AskPanel = lazySurface(() => import("./components/AskPanel.tsx"));
// The keyboard-shortcut sheet is lazy AND mount-gated on `shortcutsOpen` —
// which is why it is worth splitting when the other always-mounted hosts are
// not. It renders in the BLOG branch too, so a static copy put its 389 lines,
// and the theme picker it reaches, into an anonymous article reader's first
// request in order to describe keys that reader has not pressed. The store
// already holds the open flag, so the mount can simply wait for it.
const ShortcutsHelp = lazySurface(() => import("./components/ShortcutsHelp.tsx"));

/** One lazy surface, one boundary. `fallback` defaults to nothing for the
 *  modals — a dialog that arrives a frame late is invisible, whereas a
 *  SKELETON that flashes where a dialog is about to be is not. The panes pass
 *  a real placeholder so the grid keeps its shape while the chunk lands. */
/** The empty state's mark: the instance's OWN logo when the owner set one
 *  (the crown, the seal — whatever the sidebar wears), else the brand mark.
 *  A friend saw the app's star over their vault and asked why. */
function EmptyGlyph() {
  // The site's logo, then the desktop app's own icon, then the product's mark
  // (client/components/SiteMark.tsx). Every state of this page — locked,
  // open, empty — draws through here.
  return (
    <div className="s-empty__glyph" aria-hidden="true">
      <SiteMark size={44} className="s-empty__logo" />
    </div>
  );
}

function Surface({ fallback = null, children }: { fallback?: ReactNode; children: ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

// ── Recently opened notes ──────────────────────────────────────────────────
// The empty state on a phone cannot be a keymap, and "here are four buttons"
// is only half an answer: the thing a reader wants at the top of a session is
// the note they were in. Nothing else in the client remembers that — the
// store persists OPEN TABS, and by definition there are none when this pane
// is on screen — so App keeps a short list of its own beside them. Paths only;
// they are re-checked against the live tree before anything is drawn, so a
// deleted note, a signed-out session and an admin previewing as a visitor all
// narrow the list by themselves rather than leaking a title.
const RECENT_KEY = "astrolabe.recent";
const RECENT_MAX = 12;
/** How many of them the empty state offers — a list, not an index. */
const RECENT_SHOWN = 5;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === "string").slice(0, RECENT_MAX);
  } catch {
    return []; // private mode, quota, a hand-edited value: not worth a toast
  }
}

/** Where Ctrl/Cmd+K goes, reached by tapping instead. The sidebar owns the
 *  search box and reveals itself when it is collapsed; the dispatch waits a
 *  frame so it lands after whatever commit asked for it. */
function openQuickSearch(): void {
  requestAnimationFrame(() => window.dispatchEvent(new Event("astrolabe:quicksearch")));
}

function pushRecent(path: string): string[] {
  const next = [path, ...readRecent().filter((p) => p !== path)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore — the in-memory list still works for this session */
  }
  return next;
}


export default function App() {
  const view = useStore((s) => s.view);
  const openPath = useStore((s) => s.openPath);
  const readingMode = useStore((s) => s.readingMode);
  const vimMode = useStore((s) => s.vimMode);
  const vimSubMode = useStore((s) => s.vimSubMode);
  const paletteOpen = useStore((s) => s.paletteOpen);
  const loginOpen = useStore((s) => s.loginOpen);
  const bannerModalOpen = useStore((s) => s.bannerModalOpen);
  const moderationOpen = useStore((s) => s.moderationOpen);
  const trashOpen = useStore((s) => s.trashOpen);
  const importOpen = useStore((s) => s.importFolder !== null);
  const unusedOpen = useStore((s) => s.unusedOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const captureOpen = useStore((s) => s.captureOpen);
  const askOpen = useStore((s) => s.askOpen);
  // Subscribed here (not only inside the sheet) because App now decides
  // whether the sheet is MOUNTED at all — that is what keeps its chunk out of
  // the first paint on both shells.
  const shortcutsOpen = useStore((s) => s.shortcutsOpen);
  const previewVisitor = useStore((s) => s.previewVisitor);
  const reloadTick = useStore((s) => s.reloadTick);
  // Split at all? The shell's own tab bar belongs to the shell only while
  // there is one pane; past that each pane carries its own, because a tab bar
  // names what is open HERE and one strip above two panes cannot say which.
  const split = useStore(
    (s) => s.workspace.layout.columns.length > 1 || s.workspace.layout.columns[0].length > 1,
  );
  const admin = useStore((s) => s.admin);
  const offline = useOffline();
  const authReady = useStore((s) => s.authReady);
  const publicLayout = useStore((s) => s.publicLayout);
  const sidebarSide = useStore((s) => s.sidebarSide);
  const sidebarCollapsed = useStore((s) => s.sidebarCollapsed);
  const panelCollapsed = useStore((s) => s.panelCollapsed);
  const paneStill = useStore((s) => s.paneStill);
  const zen = useStore((s) => s.zen);
  const locked = useStore((s) => !s.admin && !s.publicReads);
  const lang = useStore((s) => s.language); // re-render the chrome strings on language change
  const tree = useStore((s) => s.tree);
  /** Recently opened notes, for the phone's empty state (see readRecent). */
  const [recent, setRecent] = useState<string[]>(readRecent);
  /** Zen's ✕ has been sitting still long enough to fade out. */
  const [zenIdle, setZenIdle] = useState(false);
  /** Is the focused pane a BOOK? The reader carries its own ✕ in the same
   *  corner, at the same size, 5px higher — so in zen over a book there were
   *  two identical crosses overlapping, and which one a click hit decided
   *  between "leave zen" and "close the book". The reader's own wins: it is
   *  the one that belongs to what is on screen, and Esc still leaves zen. */
  const zenOverBook = useStore((s) => {
    const pane = paneAt(s.workspace, s.workspace.focus);
    return pane !== null && surfaceOf(pane) === "book";
  });

  // The grid follows the inline direction, so the sidebar already sits on the
  // reading direction's leading edge (left in English, right in Arabic).
  // "Flipped" means the reader asked for the OTHER edge — the one rule that
  // has to be expressed physically, because the preference is physical.
  const flipped = (lang === "ar") === (sidebarSide === "left");

  // Public-shell modes (PUBLIC_LAYOUT=blog / designed): visitors get a public
  // shell that owns its own routes (/, /topic/…, article pages) — the app
  // router below must then stay uninstalled. Admin sessions keep the full app.
  // Both modes behave identically here on purpose: which of the two shells
  // renders is one line in the branch below, and everything else (no app
  // router, no app keybindings, the blog shortcut sheet) is the same answer.
  const blogVisitor = authReady && !admin && publicLayout !== "app";

  // Everything that keeps the vault honest under either shell — the boot, the
  // live event stream, the unsaved-text guard (client/shellRuntime.ts) — and
  // the keyboard, which belongs to the window rather than to a layout
  // (client/globalKeys.ts). The phone shell mounts the same two hooks.
  useShellRuntime();
  useGlobalKeys();

  // Once the vault is in, the router takes over the address bar: a pasted
  // deep link outranks the restored session and the home note, and
  // back/forward walk visited notes. Re-installed when an admin signs in out
  // of the blog shell (blogVisitor flips false) and torn down on sign-out.
  useEffect(() => {
    if (!authReady || blogVisitor) return;
    const cleanup = installRouter();
    const hadDeepLink = location.pathname !== "/" && location.pathname !== "/graph";
    // A locked vault keeps the deep link in the address bar: it resolves
    // right after login (see installRouter's tree watcher). A bare "/"
    // keeps what bootstrap opened (home note / restored session) and
    // syncUrl() canonicalizes the address bar to it.
    if (useStore.getState().tree !== null && !applyUrl(true)) {
      // Blog-only routes (/topic/…) name nothing in the app shell — land
      // home quietly instead of complaining about a missing note.
      if (hadDeepLink && !location.pathname.startsWith("/topic/")) {
        toast(t("noteGone"));
      }
      syncUrl();
    }
    return cleanup;
  }, [authReady, blogVisitor]);

  // Remember which notes this reader was in. Subscribed rather than driven off
  // the `openPath` render value, so the list is written once per real change
  // (a re-render for any other reason must not reorder it).
  useEffect(
    () =>
      useStore.subscribe((state, prev) => {
        if (state.openPath && state.openPath !== prev.openPath) {
          setRecent(pushRecent(state.openPath));
        }
      }),
    [],
  );

  // …and shown only if they still exist for THIS session. The tree is already
  // scoped — a visitor's is the flat published collection, an admin in preview
  // gets the same one — so filtering through it is what keeps a remembered
  // path from naming an unpublished note to somebody who may not see it.
  const recentNotes = useMemo(() => {
    if (!tree) return [];
    const live = new Map(collectNotes(tree).map((n) => [n.path, n.title]));
    return recent
      .filter((p) => live.has(p))
      .slice(0, RECENT_SHOWN)
      .map((p) => ({ path: p, title: live.get(p)! }));
  }, [recent, tree]);

  // THE ONE-TIME MARK. A small gold dot on the empty state's tour line, and
  // it is the entire nudge this feature is allowed: no popup, no toast, no
  // first-run modal, nothing that has to be dismissed. It goes out for good
  // the first time anybody opens the tour (client/tour.ts writes the flag on
  // the click, before the chunk lands, so the mark disappears on the press
  // rather than a network round-trip later).
  //
  // The seen-flag alone is the whole condition, and an earlier draft that
  // ALSO required an empty recents ledger was wrong twice over. It never fired
  // — the first run opens the home note, which is a visit, so the ledger is
  // never empty on the screen this mark lives on — and it was answering the
  // wrong question: the reader this exists for is the one who has been here
  // for months without finding the designer, not the one who arrived
  // yesterday. Per browser, once, ever.
  const seen = useSyncExternalStore(subscribeTourSeen, tourSeen, tourSeen);
  const nudgeTour = !seen;

  // Zen's only visible chrome is a faint ✕. It shows on entry (so the way out
  // is never a secret), fades after a beat, and any mouse movement brings it
  // back — the pointer is the one input that means "I am looking for a
  // control". Leaving zen resets it for the next time.
  useEffect(() => {
    if (!zen) {
      setZenIdle(false);
      return;
    }
    let timer = window.setTimeout(() => setZenIdle(true), ZEN_HINT_MS);
    const onMove = () => {
      setZenIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setZenIdle(true), ZEN_HINT_MS);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousemove", onMove);
    };
  }, [zen]);

  // The panes answer the WINDOW as well as the hand: stored widths applied at
  // boot and re-clamped on every resize and fold (client/paneWidths.ts).
  usePaneLayout();

  // Until /api/me answers, render nothing — no flash of the wrong mode.
  if (!authReady) return <div className="s-app" />;

  // Visitors of a blog-mode instance get the classic blog — no app chrome.
  // (The banner renders only during admin preview — PreviewBanner is inert
  // for real visitors.)
  if (blogVisitor) {
    return (
      <>
        {/* First in the flow: the strip pushes the whole site down rather than
            covering its masthead — preview exists to JUDGE that masthead. */}
        <PreviewBanner />
        {/* THE one line where the design engine meets the stock blog. The
            server only sends "designed" when a design is actually renderable,
            and DesignedSite falls back to this very component — unmodified,
            no props — for every failure it can see that the server cannot.

            The fallback is the empty shell, not a spinner: the blog chunk is
            one request behind the entry and a flash of chrome-then-content
            reads worse than a beat of the page background. Both arms share the
            one boundary because only one of them is ever mounted, and the
            fallback they would each want is the same page-shaped blank. */}
        <Surface fallback={<div className="s-blog" />}>
          {publicLayout === "designed" ? <DesignedSite /> : <BlogShell />}
        </Surface>
        {/* The sheet knows which shell it is in and drops the rows this one
            does not have — six of them named controls the blog never mounts. */}
        {shortcutsOpen && (
          <Surface>
            <ShortcutsHelp shell="blog" />
          </Surface>
        )}
        <ConfirmHost />
      </>
    );
  }

  // A mode that removes the ability to type has to be visible in the
  // WORKSPACE, not only in the status bar: the reader's eyes are on the note.
  const readingLocked = admin && !previewVisitor && readingMode && view === "editor" && !!openPath;

  // Zen takes the status bar (and with it the whole mode cluster) to zero
  // height, so in zen the strip is the ONLY place a mode can live. Reading
  // already survived into zen; vim did not, and ZEN + VIM was a modal editor
  // with nothing on screen saying whether the next keystroke would type or
  // delete a line. Outside zen the pill carries this, so the strip stays out
  // of the way — and the two are mutually exclusive by construction
  // (reading unmounts the editor, so there is no vim to report).
  const vimLocked =
    admin && !previewVisitor && !readingMode && vimMode && zen && view === "editor" && !!openPath;
  const vimStrip = vimLocked ? vimSubCopy(vimSubMode) : null;

  const shellClass = [
    "s-app",
    admin ? "" : "s-app--visitor",
    flipped ? "s-app--flip" : "",
    sidebarCollapsed ? "s-app--nosidebar" : "",
    // The panel's own collapse lives on .s-panel--collapsed and always has —
    // but the CENTRE column has to know about it too (app.css balances its
    // gutters against what each end of the shell is actually holding), and a
    // sibling's class is not something CSS can ask about.
    panelCollapsed ? "s-app--nopanel" : "",
    // The pane's width changed for a reason the reader did not give (the
    // outline panel's responsive auto-collapse). Same commit as the flag
    // above, so there is no frame in which it is closing WITH its transition.
    paneStill ? "s-app--pane-still" : "",
    zen ? "s-app--zen" : "",
    // The notice row exists while EITHER strip is up: the preview banner or
    // the offline strip (both components render into grid-area notice).
    previewVisitor || offline ? "s-app--notice" : "",
    readingLocked ? "s-app--reading" : "",
    // Zen's ✕ steps below whichever strip is up; one class covers both so the
    // offset rule does not have to enumerate the modes.
    readingLocked || vimLocked ? "s-app--modebar" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      {/* First tab stop in the document: past the sidebar tree (which can be
          a thousand rows) and straight into the note. Hidden until focused. */}
      <a className="s-skip" href="#s-main">
        {t("skipToContent")}
      </a>
      {/* Grid row above every pane (grid-area: notice) — never an overlay. */}
      <PreviewBanner />
      <OfflineStrip />
      {/* The sidebar's own boundary. Its fallback holds the grid column open
          at the width the pane will occupy, so the shell does not reflow
          sideways when the chunk lands. */}
      <Surface fallback={<aside className="s-sidebar" aria-hidden="true" />}>
        <Sidebar />
      </Surface>
      {/* Slim reopen handle for a collapsed sidebar — a hairline strip on the
          sidebar's own edge, so the bar always leaves a door where it stood.
          (In zen there is no door: Esc and the ✕ are the way out.) */}
      {sidebarCollapsed && !zen && (
        <button
          type="button"
          className="s-reopen s-reopen--sidebar"
          {...reopenDragProps("sidebar")}
          onClick={() => useStore.getState().setSidebarCollapsed(false)}
          title={t("showPaneNotes")}
          aria-label={t("showPaneNotes")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}
      {/* tabIndex -1 so the skip link can actually land focus here: an <a
          href="#…"> moves the caret to the target only if the target is
          focusable, otherwise the next Tab starts from the top again. */}
      <main className="s-main" id="s-main" tabIndex={-1} aria-label={t("mainContent")}>
        {/* The shell's tools, top and trailing: StatusBar portals them here
            (see its note). An empty div until it does. */}
        <div id="s-topactions" className="s-topactions" />
        <Surface fallback={<div className="s-tabs" aria-hidden="true" />}>
          {/* The shell's bar belongs to the shell only while there is one pane.
              Split, each pane carries its own — a tab bar names what is open
              HERE, and one strip above two panes could not say which. */}
          {!split && <Tabs />}
        </Surface>
        {/* One line, part of the layout (it pushes the note down, it does not
            float over it), saying what the mode is and how to leave it. The
            accent rule down the column's inline-start edge is its companion:
            app.css draws it from .s-app--reading. */}
        {readingLocked && (
          <div className="s-modebar" role="status">
            <span className="s-modebar__dot" aria-hidden="true" />
            <span className="s-modebar__text">{t("readingStrip")}</span>
            <button
              type="button"
              className="s-modebar__action"
              onClick={() => useStore.getState().setReadingMode(false)}
            >
              {t("readingStripAction")}
              {/* The keycap is its own element so a coarse pointer can drop
                  it (reading.css): a phone has no Ctrl and no Cmd. A chord
                  label is language-neutral and lives beside its call, like
                  the palette's `hint` rows. */}
              <span className="s-modebar__key"> (Ctrl/Cmd+E)</span>
            </button>
          </div>
        )}
        {vimStrip && (
          <div className="s-modebar s-modebar--vim" role="status">
            <span className="s-modebar__dot" aria-hidden="true" />
            <span className="s-modebar__text">{t(vimStrip.strip)}</span>
            <button
              type="button"
              className="s-modebar__action"
              onClick={() => useStore.getState().toggleVim()}
            >
              {t("vimStripAction")}
            </button>
          </div>
        )}
        {/* The graph and the Media page are TABS (client/workspace.ts
            GRAPH_TAB, MEDIA_TAB) and draw inside the pane that holds them. */}
        {(
          // Every pane draws its own note. The children below are the states
          // that belong to the window rather than to a pane — a locked vault,
          // an empty one — and a pane with no tab hands them straight through.
          <Surface fallback={<div className="s-view" />}>
            <Workspace>
              {locked ? (
            <div className="s-empty">
              <EmptyGlyph />
              <p className="s-empty__title">{t("vaultPrivate")}</p>
              <button
                type="button"
                className="s-btn s-btn--accent"
                onClick={() => useStore.getState().setLoginOpen(true)}
              >
                {t("signIn")}
              </button>
            </div>
          ) : (
            <div className="s-empty">
              <EmptyGlyph />
              <p className="s-empty__title">{t("vaultOpen")}</p>
              {/* TWO empty states, and CSS picks. The keymap is the right
                  answer on a machine with a keyboard and is nothing but a
                  taunt without one: at 390px the first screen after signing in
                  was seven chips naming Ctrl-combinations, one of them
                  wrapping and shoving the grid a row out of true, the first
                  chip flush against x=0 because the grid was exactly as wide
                  as the viewport. Below ~700px — and on ANY coarse pointer,
                  because a tablet in landscape is 1024px wide and still has no
                  Ctrl key — the pane offers the same four destinations as
                  things to tap, with the notes this reader was last in above
                  them. app.css owns the swap; both halves are always in the
                  DOM so there is no resize listener and no first-paint flash. */}
              <div className="s-empty__keys">
                <span className="s-empty__key">
                  <kbd>Ctrl P</kbd> {t("keyPalette")}
                </span>
                <span className="s-empty__key">
                  <kbd>Ctrl G</kbd> {t("keyGraph")}
                </span>
                <span className="s-empty__key">
                  <kbd>Ctrl K</kbd> {t("keySearch")}
                </span>
                <span className="s-empty__key">
                  <kbd>Ctrl /</kbd> {t("keyShortcuts")}
                </span>
                {admin && (
                  <>
                    <span className="s-empty__key">
                      <kbd>Ctrl N</kbd> {t("keyNewNote")}
                    </span>
                    <span className="s-empty__key">
                      <kbd>Ctrl S</kbd> {t("keySave")}
                    </span>
                    <span className="s-empty__key">
                      <kbd>Ctrl E</kbd> {t("keyReading")}
                    </span>
                  </>
                )}
              </div>
              <div className="s-empty__touch">
                {recentNotes.length > 0 && (
                  <nav className="s-empty__recents" aria-label={t("emptyRecent")}>
                    <h2 className="s-empty__recentshead">{t("emptyRecent")}</h2>
                    {recentNotes.map((note) => (
                      <button
                        type="button"
                        className="s-empty__recent"
                        key={note.path}
                        onClick={() => useStore.getState().openNote(note.path)}
                      >
                        {/* A note title is user content in a chrome row: it
                            picks its own direction, like every other title in
                            the product. */}
                        <bdi>{note.title}</bdi>
                      </button>
                    ))}
                  </nav>
                )}
                <div className="s-empty__actions">
                  {admin && (
                    <button
                      type="button"
                      className="s-empty__action s-empty__action--go"
                      onClick={() => void promptNewNote("")}
                    >
                      {t("newNote")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="s-empty__action"
                    onClick={openQuickSearch}
                  >
                    {t("scSearch")}
                  </button>
                  <button
                    type="button"
                    className="s-empty__action"
                    onClick={() => useStore.getState().setView("graph")}
                  >
                    {t("scGraph")}
                  </button>
                </div>
              </div>
              {/* THE QUIET DOOR. Outside both halves above, because it is the
                  one line that belongs on a laptop and on a phone alike: the
                  keymap answers "which key", the touch column answers "where
                  to", and neither answers "what is in here". A real reader
                  used this vault for months without discovering the designer,
                  and this line is the whole remedy — a link, wearing the
                  wordmark's star, that has to be pressed. Never a popup. */}
              <button
                type="button"
                className="s-empty__tour"
                onClick={openTour}
              >
                <span className="s-empty__tourstar" aria-hidden="true"><SiteMark size={14} /></span>
                {t("tourDoor")}
                {nudgeTour && <span className="s-empty__tourdot" aria-hidden="true" />}
              </button>
            </div>
              )}
            </Workspace>
          </Surface>
        )}
      </main>
      <Surface fallback={<aside className="s-panel" aria-hidden="true" />}>
        <BacklinksPanel />
      </Surface>
      {/* THE SEAMS. Both grips are the shell's own children, not the panes' —
          a pane is `overflow: hidden` (that is what makes its collapse a width
          animation) and a strip that straddles the divider cannot live inside
          the box it straddles. They sit on `--sidebar-w`/`--panel-w`, so they
          follow the pane they resize without the pane holding them; the
          stylesheet hides each one where its pane is not a grid column. */}
      <PaneGrip pane="sidebar" />
      <PaneGrip pane="panel" />
      <Surface fallback={<footer className="s-statusbar" aria-hidden="true" />}>
        <StatusBar />
      </Surface>
      {zen && !zenOverBook && (
        <div className={`s-zen-exit-wrap${zenIdle ? " s-zen-exit-wrap--idle" : ""}`}>
          {/* The keystroke, spelled out. Esc is the route that always works,
              and a mode with no visible chrome must say so at least once. */}
          <span className="s-zen-exit__hint" aria-hidden="true">
            {t("zenEscHint")}
          </span>
          <button
            type="button"
            className="s-zen-exit"
            onClick={() => useStore.getState().setZen(false)}
            title={t("exitZen")}
            aria-label={t("exitZen")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
      {/* Renders nothing unless /api/me told a REAL admin session that the
          designed site fell back to stock. One line, the reason, one click
          back — the app-side twin of the notice on the designed page itself. */}
      <DesignStatus />
      {shortcutsOpen && (
        <Surface>
          <ShortcutsHelp />
        </Surface>
      )}
      {/* A boundary EACH, with no fallback. These are the surfaces that proved
          the rule: they were the ones being opened when the shell vanished,
          and they are the ones whose opener has to stay mounted underneath so
          Escape has somewhere to put focus back. */}
      {paletteOpen && (
        <Surface>
          <CommandPalette />
        </Surface>
      )}
      {bannerModalOpen && admin && (
        <Surface>
          <BannerModal />
        </Surface>
      )}
      {moderationOpen && admin && (
        <Surface>
          <ModerationPanel />
        </Surface>
      )}
      {trashOpen && admin && (
        <Surface>
          <TrashModal />
        </Surface>
      )}
      {importOpen && admin && (
        <Surface>
          <ImportDialog />
        </Surface>
      )}
      {unusedOpen && admin && (
        <Surface>
          <UnusedAttachmentsModal />
        </Surface>
      )}
      {settingsOpen && admin && (
        <Surface>
          <SettingsModal />
        </Surface>
      )}
      {captureOpen && admin && (
        <Surface>
          <CaptureSheet />
        </Surface>
      )}
      {askOpen && admin && (
        <Surface>
          <AskPanel />
        </Surface>
      )}
      {/* Always mounted (like ConfirmHost): the two template commands await a
          promise from it, and a host that only exists once something has
          already opened it cannot be the thing that opens. */}
      {admin && <TemplatePicker />}
      {loginOpen && <LoginModal />}
      {/* The editor's "Annotate" opens its popover here, at the root, where
          no pane's own re-render can take it down. */}
      {/* Admin-only and lazy: the popover, the tooltip and their sheet are the
          reading layer's chunk, not the entry's. */}
      {admin && (
        <Suspense fallback={null}>
          <EditorAnnotator />
        </Suspense>
      )}
      <ConfirmHost />
    </div>
  );
}
