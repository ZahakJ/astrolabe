// Real OS windows, with the two things a browser tab cannot have: a position
// that survives quitting, and a lifetime that belongs to one vault.
//
// ── ONE WINDOW PER VAULT, AND WHY IT IS NOT ONE WINDOW PER NOTE ─────────────
// Astrolabe already has a window model — `client/workspace.ts` — with panes, tab
// groups and splits, and it is the model the reader learns. A desktop app that
// opened a new OS window per note would be a second, competing arrangement of
// the same idea, and the reader would have to keep both in their head. So the
// main window is the vault, the workspace inside it is the workspace, and the
// only OS window that is NOT a vault is the reference window below — which
// exists precisely because it is the one arrangement the in-app model cannot
// express: a note that stays visible over other applications.

import { BrowserWindow, screen, shell } from "electron";
import path from "node:path";
import { APP_ROOT } from "./server.ts";
import { MIN_WINDOW, fitToWorkArea, onSomeDisplay, type Bounds } from "./prefs.ts";

/** The compiled preload. It is compiled — not run as TypeScript like the rest
 *  of `electron/` — because `sandbox: true` is not negotiable and a sandboxed
 *  preload is loaded by Chromium rather than by Node: no ESM, no type
 *  stripping, and `require` limited to `electron` itself. That constraint is
 *  the reason preload.ts inlines its channel names instead of importing
 *  ipc.ts, and the reason `check-desktop` counts them by string. */
const PRELOAD = path.join(APP_ROOT, "desktop", "build", "preload.js");

const DEFAULT_SIZE = { width: 1280, height: 860 };
/** Astrolabe's own ground colour (`--bg` on the default theme), so the window is
 *  the app's colour for the ~200ms before the first paint rather than white —
 *  which on a dark theme is a flash straight into the reader's eyes. */
const DEFAULT_GROUND = "#0d1117";

export interface WindowContext {
  vault: string;
  vaultName: string;
  origin: string;
  partition: string;
  /** The window's icon: the reader's own when they set one (electron/brand.ts). */
  icon?: string;
  /** Called whenever this window's geometry settles, so the vault's bounds
   *  are what the reader last left, not what they first got. */
  onBounds: (bounds: Bounds) => void;
}

/** The work area of the display a rectangle belongs to — the desk minus the
 *  taskbar, the dock and the menu bar. `screen` is only available after the
 *  app is ready, which is the only time this file is called. */
function deskFor(rect: { x: number; y: number; width: number; height: number } | null): Electron.Rectangle {
  const display = rect ? screen.getDisplayMatching(rect) : screen.getPrimaryDisplay();
  return display.workArea;
}

/** WHAT THE WINDOW OPENS AS, AND WHETHER IT OPENS MAXIMISED.
 *
 *  Every rectangle that reaches a BrowserWindow goes through `fitToWorkArea`
 *  first — the remembered one AND the default. Without it a rectangle saved on
 *  a large screen re-opened on a small one with its caption buttons off the
 *  desk (a window the reader cannot move, close or resize), and the 1280×860
 *  default on a 934×600 DIP desktop opened as a window that exactly filled the
 *  screen and was not maximised, so the maximise button did nothing visible.
 *  A default that does not fit means "this desk wants the whole app": the
 *  window opens MAXIMISED, which is a state the reader can leave. */
function restore(bounds: Bounds | null): { options: Partial<Electron.BrowserWindowConstructorOptions>; maximize: boolean } {
  const usable = bounds && onSomeDisplay(bounds, screen.getAllDisplays()) ? bounds : null;
  const desk = deskFor(usable);
  if (usable) {
    const fitted = fitToWorkArea(usable, desk);
    return { options: fitted, maximize: usable.maximized === true };
  }
  const wanted = { x: desk.x + Math.round((desk.width - DEFAULT_SIZE.width) / 2), y: desk.y + Math.round((desk.height - DEFAULT_SIZE.height) / 2), ...DEFAULT_SIZE };
  const fitted = fitToWorkArea(wanted, desk);
  const tooSmall = fitted.width < DEFAULT_SIZE.width || fitted.height < DEFAULT_SIZE.height;
  return { options: fitted, maximize: tooSmall };
}

function webPreferences(partition: string): Electron.WebPreferences {
  return {
    preload: PRELOAD,
    partition,
    // The four that `npm run check-desktop` refuses to let anyone flip. They
    // are stated rather than left to default because a default is a decision
    // nobody wrote down: `sandbox` and `contextIsolation` have both been the
    // other way inside living memory of this framework, and a reader's vault
    // is on the other side of them.
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    // The point of the whole spellcheck arrangement: Chromium's own
    // spellchecker, reading the `lang` that client/editor/bidi.ts already puts
    // on each LINE. See electron/spellcheck.ts.
    spellcheck: true,
  };
}

/** Every window is fenced to its own vault's origin.
 *
 *  A note can contain a link to anywhere, and the reading view renders links.
 *  Without this, one click on `http://evil.example` replaces the app's window
 *  with somebody else's page — inside a window holding an authenticated
 *  session to the reader's vault. External links open in the reader's BROWSER,
 *  which is where a link to the web belongs; in-app navigation stays on the
 *  origin the app started. */
function fence(win: BrowserWindow, origin: string): void {
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(`${origin}/`) || url === origin) return;
    event.preventDefault();
    void openExternally(url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    void openExternally(url);
    return { action: "deny" };
  });
}

/** `shell.openExternal` will hand ANY scheme to the OS, `file:` and
 *  `astrolabe:` included — so a note containing a crafted link would be a
 *  one-click "run this". Two schemes, and nothing else. */
async function openExternally(url: string): Promise<void> {
  if (/^https?:\/\//i.test(url)) await shell.openExternal(url);
}

function watchBounds(win: BrowserWindow, onBounds: (bounds: Bounds) => void): void {
  const report = (): void => {
    // A maximized or minimized window's `getBounds()` is the maximized frame,
    // which is not what to restore to — `getNormalBounds()` is the size it
    // would return to, and the flag is remembered separately.
    if (win.isDestroyed() || win.isMinimized()) return;
    const b = win.getNormalBounds();
    onBounds({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() });
  };
  win.on("moved", report);
  win.on("resized", report);
  win.on("maximize", report);
  win.on("unmaximize", report);
  win.on("close", report);
}

/** The main window for a vault. */
export function createVaultWindow(ctx: WindowContext, bounds: Bounds | null, route = "/"): BrowserWindow {
  const opened = restore(bounds);
  const win = new BrowserWindow({
    ...opened.options,
    // ONE SOURCE for the floor (electron/prefs.ts): what the window may be is
    // what the preferences file is willing to write down. They disagreed —
    // 400 here, 480 there on both axes — and every rectangle in the gap was
    // handed out by this line and then refused by that one.
    minWidth: MIN_WINDOW.width,
    minHeight: MIN_WINDOW.height,
    // The title is the app's, not the document's: `client/` sets
    // `document.title` per note, and Electron would otherwise let a note name
    // overwrite the window title with no vault in it. `title` + this flag mean
    // "the vault is always in the title bar".
    title: ctx.vaultName,
    ...(ctx.icon ? { icon: ctx.icon } : {}),
    backgroundColor: DEFAULT_GROUND,
    show: false,
    autoHideMenuBar: false,
    webPreferences: webPreferences(ctx.partition),
  });
  if (opened.maximize) win.maximize();
  fence(win, ctx.origin);
  watchBounds(win, ctx.onBounds);
  // Painted before shown: a window that appears already holding the vault,
  // rather than a white rectangle that fills in. The geometry is reported
  // once here as well: a rectangle the display constrained at CREATION (a
  // default fitted to a small desk) is the rectangle the reader has, and it
  // should be the one written down — not the one we asked for.
  win.once("ready-to-show", () => {
    win.show();
    if (win.isDestroyed()) return;
    const b = win.getNormalBounds();
    ctx.onBounds({ x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() });
  });
  reportFailures(win, ctx.origin);
  void win.loadURL(ctx.origin + route);
  return win;
}

/**
 * THE REFERENCE WINDOW — the thing this whole stage is for, in one feature.
 *
 * A second window on ONE note, always on top of every other application, with
 * the chrome out of the way. It is what you put the source in while you write
 * the essay, and it is the arrangement a browser fundamentally cannot give you:
 * a tab is always inside its window, and a window is always inside the stack.
 *
 * It is a plain window on the same origin with the same session, so it is the
 * same app — the same editor, the same theme, the same keys. Nothing about it
 * is a reduced mode.
 */
export function createReferenceWindow(ctx: WindowContext, route: string): BrowserWindow {
  // Fitted like every other rectangle this file hands out: 720 tall does not
  // fit a 1366×768 laptop's work area at 125%, and an always-on-top window
  // whose bottom is off the desk is one the reader cannot resize back.
  const desk = deskFor(null);
  const size = fitToWorkArea({ x: desk.x + 40, y: desk.y + 40, width: 520, height: 720 }, desk);
  const win = new BrowserWindow({
    ...size,
    minWidth: 360,
    minHeight: 300,
    title: ctx.vaultName,
    backgroundColor: DEFAULT_GROUND,
    show: false,
    alwaysOnTop: true,
    // Visible over full-screen apps too, on the platforms that distinguish —
    // otherwise "always on top" means "except when you are actually working".
    fullscreenable: false,
    webPreferences: webPreferences(ctx.partition),
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  fence(win, ctx.origin);
  win.once("ready-to-show", () => win.show());
  reportFailures(win, ctx.origin);
  void win.loadURL(ctx.origin + route);
  return win;
}

/** A window that cannot load its own origin, or whose renderer died, is the
 *  exact failure this app is most likely to have and least able to show: the
 *  window is the only place a message could go, and the window is the thing
 *  that failed. So it goes to the console the server's own output already
 *  shares, where a bug report can reach it. */
function reportFailures(win: BrowserWindow, origin: string): void {
  win.webContents.on("did-fail-load", (_event, code, description, url) => {
    // -3 is ERR_ABORTED, which every cancelled in-flight navigation reports —
    // including the ordinary one where a second load starts before the first
    // finishes. It is not a failure.
    if (code === -3) return;
    console.error(`astrolabe: could not load ${url || origin} — ${description} (${code})`);
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error(`astrolabe: the window's renderer stopped — ${details.reason}`);
  });
}

/** Send a message to one window, safely. A window can be closing while a menu
 *  click is still in flight, and `webContents.send` on a destroyed window
 *  throws — which would take the menu handler down with it. */
export function tell(win: BrowserWindow | null, channel: string, payload: unknown): void {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
  win.webContents.send(channel, payload);
}

/** Every open window across every vault, focused-first — the order the menu
 *  and the tray need when they have to pick "the current one". */
export function focusedFirst(): BrowserWindow[] {
  const all = BrowserWindow.getAllWindows();
  const focused = BrowserWindow.getFocusedWindow();
  return focused ? [focused, ...all.filter((w) => w !== focused)] : all;
}
