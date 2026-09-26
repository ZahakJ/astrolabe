// What the desktop app remembers between launches, and the one rule that makes
// it worth remembering at all.
//
// ── WHY THE PORT IS PERSISTED, AND NEVER EPHEMERAL ──────────────────────────
//
// Every device preference in Astrolabe is `localStorage`: `astrolabe.theme`,
// `astrolabe.workspace`, `astrolabe.tabs`, `astrolabe.vim`, `astrolabe.reading`,
// `astrolabe.sidebarSide`, the fold state, the pane sizes. `localStorage` is keyed
// by ORIGIN, and this app's origin is `http://127.0.0.1:<port>` — the port IS
// the identity of the reader's settings.
//
// So a desktop app that asks the OS for a free port on each launch is a desktop
// app that hands the reader a brand-new browser profile every morning: theme
// back to default, tabs gone, folds gone, sidebar back on the other side. There
// is nowhere in the product that could explain that, because from the inside
// nothing went wrong — a different origin genuinely has no settings. It is the
// single worst bug available to this stage, it is silent, and it is one line of
// convenience away at all times.
//
// Hence: a port per vault, chosen once, written down, and reused. The choice is
// SEEDED from the vault path rather than counted upward, so a reader who
// reinstalls (or syncs their vault to a second machine) lands on the same port
// and keeps their layout without the preferences file having survived. When the
// remembered port is taken, we say so out loud rather than silently drifting —
// see `pickPort` below and the dialog in main.ts.
//
// Pure and electron-free: `tests/desktop.test.ts` drives this file directly,
// and the root `npm run typecheck` follows it in from there.

/** Where the desktop app's ports live. NOT 6801: that is the web deployment's
 *  default, and the reader running `npm start` in a terminal beside this app is
 *  the normal case, not a conflict to arbitrate. */
import path from "node:path";
import { parseUpdatesPref, type UpdatesPref } from "./updatePolicy.ts";

export const PORT_MIN = 6820;
export const PORT_MAX = 6899;

/** How many vaults the File ▸ Recent menu offers. */
export const MAX_RECENTS = 10;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface VaultPref {
  /** Absolute vault root, as the reader chose it. */
  path: string;
  /** The origin's port — see the note at the top of this file. */
  port: number;
  /** Last window geometry for this vault, or null while it has none. */
  bounds: Bounds | null;
  /** Epoch ms of the last open, for the recent list's order. */
  lastOpened: number;
  /** An EXISTING Astrolabe home to use for this vault, instead of the app's own
   *  per-vault one — the door that lets the desktop and a long-running server
   *  deployment share one `settings.json`, one comments database and one
   *  books.json for the same vault. Unset for a vault the desktop discovered
   *  itself; validated as an absolute path to a directory that exists, and a
   *  value that stops existing falls back to the app's own home rather than
   *  failing the open. Two live servers over one data dir is the same
   *  arrangement as two apps over one vault: sqlite locks across processes,
   *  and the JSON files are written atomically — a concurrent settings edit
   *  from both UIs is last-write-wins, exactly as it always was.
   */
  data?: string;
  /** THE READER'S ZOOM FOR THIS VAULT, owned by the app.
   *
   *  Chromium already remembered it — under host `127.0.0.1`, inside the
   *  `persist:vault-<hash>` partition — and re-applied it on every launch, and
   *  nothing in the app read it, showed it or could reset it. A reader who had
   *  pressed Ctrl+= five times was permanently looking at a 689 CSS px
   *  viewport on a 1366 laptop, which is the phone shell, with no way to find
   *  out why. A factor the app stores is a factor the app can put in the
   *  status bar and hand back with one click. 1 = actual size. */
  zoom?: number;
}

export interface Prefs {
  vaults: VaultPref[];
  /** Whether the spellchecker is on. A device preference, like the rest. */
  spellcheck: boolean;
  /** Whether the app checks for releases and says so (`notify`, the default)
   *  or stays silent (`off`). Never more than that: what a check may do is
   *  decided in electron/updatePolicy.ts, and downloading is not on the list. */
  updates: UpdatesPref;
}

export const EMPTY_PREFS: Prefs = { vaults: [], spellcheck: true, updates: "notify" };

/** The zoom range the app offers: Chromium's own steps, floored and capped
 *  where the shell is still a shell. Below 0.5 the 44px targets are 22px; above
 *  3 a 1920 screen is 640 CSS px and every layout is the phone's. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
/** One press. Chromium's own ratio, so a reader who learned the steps in a
 *  browser gets the steps they expect. */
export const ZOOM_STEP = 1.2;

export function saneZoom(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

/** One step up or down from here, or exactly 1 for a reset. */
export function stepZoom(from: number, direction: -1 | 0 | 1): number {
  if (direction === 0) return 1;
  return saneZoom(direction > 0 ? from * ZOOM_STEP : from / ZOOM_STEP);
}

/** THE SMALLEST WINDOW THE APP ITSELF ALLOWS, and the one place it is said.
 *
 *  It used to be a single number, 480, tested against BOTH axes here — while
 *  windows.ts asked Chromium for `minHeight: 400`. So every rectangle between
 *  400 and 479 DIP tall was one the app handed out and then refused to write
 *  down: a Snap quadrant on a 150% 1080p laptop, a vertical half, the app's
 *  own minimum. And because `saneBounds` rejects the WHOLE record, the
 *  `maximized` flag went with the rectangle and the next launch restored a
 *  stale one. Two numbers, one export, imported by both files — they cannot
 *  disagree again. */
export const MIN_WINDOW = { width: 480, height: 400 };
/** Larger than any display anyone has, small enough that a corrupt number
 *  cannot ask the compositor for a 2-billion-pixel surface. */
const MAX_WINDOW = 20000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function saneBounds(value: unknown): Bounds | null {
  if (!isRecord(value)) return null;
  const nums = ["x", "y", "width", "height"].map((k) => value[k]);
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [x, y, width, height] = nums as number[];
  if (width < MIN_WINDOW.width || height < MIN_WINDOW.height) return null;
  if (width > MAX_WINDOW || height > MAX_WINDOW) return null;
  // x/y may legitimately be negative (a display to the left of the primary
  // one), so they are bounded rather than floored. Whether the rectangle is on
  // a display that still EXISTS is a question only `screen` can answer, and it
  // is asked in windows.ts — this file stays pure.
  if (Math.abs(x) > MAX_WINDOW || Math.abs(y) > MAX_WINDOW) return null;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), maximized: value.maximized === true };
}

/** Read a preferences document that may be anything at all — hand-edited,
 *  truncated by a power cut, written by a future version. Every field is
 *  validated field-by-field and a bad one is DROPPED rather than failing the
 *  load: losing one vault's window position is a shrug, and refusing to start
 *  because a number went missing is not. */
export function parsePrefs(raw: unknown): Prefs {
  if (!isRecord(raw)) return { ...EMPTY_PREFS };
  const seen = new Set<string>();
  const vaults: VaultPref[] = [];
  const list = Array.isArray(raw.vaults) ? raw.vaults : [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const vaultPath = typeof entry.path === "string" ? entry.path : "";
    if (!vaultPath || seen.has(vaultPath)) continue;
    const port = typeof entry.port === "number" && Number.isInteger(entry.port) ? entry.port : 0;
    seen.add(vaultPath);
    const data =
      typeof entry.data === "string" && entry.data !== "" && path.isAbsolute(entry.data)
        ? entry.data
        : undefined;
    vaults.push({
      path: vaultPath,
      // A port outside the desktop's range is not honored: it is either a
      // preferences file from a different scheme or a hand edit aiming at 80.
      port: port >= PORT_MIN && port <= PORT_MAX ? port : 0,
      bounds: saneBounds(entry.bounds),
      lastOpened: typeof entry.lastOpened === "number" && Number.isFinite(entry.lastOpened) ? entry.lastOpened : 0,
      ...(data === undefined ? {} : { data }),
      ...(entry.zoom === undefined ? {} : { zoom: saneZoom(entry.zoom) }),
    });
  }
  vaults.sort((a, b) => b.lastOpened - a.lastOpened);
  return { vaults, spellcheck: raw.spellcheck !== false, updates: parseUpdatesPref(raw.updates) };
}

/** FNV-1a over the vault path. Not a security hash — a spreader. It exists so
 *  the FIRST port a vault is offered is a function of the vault rather than of
 *  how many vaults happened to be opened before it, which is what lets a
 *  reinstall (or the same vault on a second machine) land on the same origin
 *  and keep its stored layout. */
export function seedFor(vaultPath: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < vaultPath.length; i++) {
    hash ^= vaultPath.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * The order this vault's port is looked for in: the one it had (if it had one)
 * first, then a linear probe from its seed, skipping ports this preferences
 * file has already given to OTHER vaults.
 *
 * A list rather than a choice, and sync rather than async, because the part
 * worth testing is the SEARCH — "does a remembered port come first", "is
 * another vault's port skipped", "does the probe wrap and cover the whole
 * range" — and none of those questions needs a socket. Binding is the caller's
 * job (electron/server.ts), which walks this list and takes the first port that
 * answers.
 *
 * The list always covers the whole band, so it is empty only if the band is.
 */
export function portCandidates(vaultPath: string, prefs: Prefs): number[] {
  const remembered = prefs.vaults.find((v) => v.path === vaultPath)?.port ?? 0;
  const taken = new Set(
    prefs.vaults.filter((v) => v.path !== vaultPath && v.port !== 0).map((v) => v.port),
  );
  const out: number[] = [];
  if (remembered !== 0) out.push(remembered);
  const span = PORT_MAX - PORT_MIN + 1;
  const start = seedFor(vaultPath) % span;
  for (let i = 0; i < span; i++) {
    const port = PORT_MIN + ((start + i) % span);
    if (port === remembered || taken.has(port)) continue;
    out.push(port);
  }
  return out;
}

/** The port a vault WANTS — what it had last time, or 0 for a vault that has
 *  never been opened. The caller compares this against the port it actually
 *  bound: a difference is the moment this vault's theme, tabs and folds stop
 *  being findable, and the reader is told rather than left to discover it. */
export function rememberedPort(vaultPath: string, prefs: Prefs): number {
  return prefs.vaults.find((v) => v.path === vaultPath)?.port ?? 0;
}

/** Record an open: the vault moves to the head of the recent list, keeps its
 *  port and bounds, and the list is trimmed. Returns a NEW Prefs — the store
 *  writes whole documents, so nothing here mutates what a caller still holds. */
export function rememberVault(prefs: Prefs, vaultPath: string, port: number, now: number): Prefs {
  const existing = prefs.vaults.find((v) => v.path === vaultPath);
  const updated: VaultPref = {
    path: vaultPath,
    port,
    bounds: existing?.bounds ?? null,
    lastOpened: now,
    // The data-dir override SURVIVES the rewrite. This function rebuilds the
    // row on every open, so a field it does not carry forward is a field that
    // exists until the first launch — and losing this one silently reverts the
    // vault to an empty per-app home, which reads as "the desktop lost my
    // settings", the exact complaint that created the field.
    ...(existing?.data === undefined ? {} : { data: existing.data }),
    // THE ZOOM SURVIVES IT TOO, for the same reason and after the same
    // complaint: a reader set 120%, closed the app, and every launch came back
    // at 100% — `rememberZoom` wrote the factor faithfully, and the next open
    // rebuilt the row without it. "It has become a habit to set the zoom
    // every launch." tests/prefs.test.ts holds the round trip.
    ...(existing?.zoom === undefined ? {} : { zoom: existing.zoom }),
  };
  const rest = prefs.vaults.filter((v) => v.path !== vaultPath);
  return { ...prefs, vaults: [updated, ...rest].slice(0, MAX_RECENTS) };
}

/** Record a window's geometry against its vault. A vault we have never opened
 *  is not invented here: geometry without an open is a write from a stale
 *  window, and inventing the row would resurrect a vault the reader removed. */
export function rememberBounds(prefs: Prefs, vaultPath: string, bounds: Bounds): Prefs {
  const clean = saneBounds(bounds);
  let touched = false;
  const vaults = prefs.vaults.map((v) => {
    if (v.path !== vaultPath) return v;
    touched = true;
    // A RECTANGLE WE CANNOT KEEP IS NOT A REASON TO FORGET THE FLAG.
    // `maximized` is the more important half of this record — it is what
    // decides whether the app comes back the size the reader left it — and it
    // is not a rectangle, so a rectangle we distrust says nothing about it.
    // Dropping the pair together is how a maximised window re-opened at a
    // stale size that had been superseded twice.
    return clean ? { ...v, bounds: clean } : { ...v, bounds: v.bounds ? { ...v.bounds, maximized: bounds.maximized === true } : null };
  });
  return touched ? { ...prefs, vaults } : prefs;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** FIT A REMEMBERED RECTANGLE TO THE SCREEN IT IS ABOUT TO OPEN ON.
 *
 *  `onSomeDisplay` below answers "can the reader grab this window at all",
 *  which is a floor and not an answer: a rectangle saved on a 1920×1080
 *  desktop and re-opened on a 1366×768 laptop at 150% (a 911×512 DIP work
 *  area) passes it with its caption buttons, its trailing edge and its bottom
 *  corner all off the desk. And the 1280×860 default was never
 *  fitted to anything, so on a small laptop the first window came up filling
 *  the screen exactly and UN-maximised: maximise and restore did nothing
 *  visible, and there was no way to see it was a window.
 *
 *  Size first, then origin: a window is shrunk to what the work area holds and
 *  only then pulled back inside it, so a rectangle bigger than the desk lands
 *  at the desk's own corner rather than hanging off the far one. Pure, so
 *  tests/desktop.test.ts drives it without a display. */
export function fitToWorkArea(rect: Rect, workArea: Rect): Rect {
  const width = Math.max(Math.min(rect.width, workArea.width), Math.min(MIN_WINDOW.width, workArea.width));
  const height = Math.max(Math.min(rect.height, workArea.height), Math.min(MIN_WINDOW.height, workArea.height));
  const x = Math.round(Math.min(Math.max(rect.x, workArea.x), workArea.x + workArea.width - width));
  const y = Math.round(Math.min(Math.max(rect.y, workArea.y), workArea.y + workArea.height - height));
  return { x, y, width: Math.round(width), height: Math.round(height) };
}

/** Remember this vault's zoom. Beside the bounds, for the same reason: it is
 *  a fact about this install's window, not about the vault's contents. */
export function rememberZoom(prefs: Prefs, vaultPath: string, zoom: number): Prefs {
  const clean = saneZoom(zoom);
  let touched = false;
  const vaults = prefs.vaults.map((v) => {
    if (v.path !== vaultPath) return v;
    touched = true;
    return { ...v, zoom: clean };
  });
  return touched ? { ...prefs, vaults } : prefs;
}

/** Drop a vault from the recent list (its port and geometry go with it). */
export function forgetVault(prefs: Prefs, vaultPath: string): Prefs {
  return { ...prefs, vaults: prefs.vaults.filter((v) => v.path !== vaultPath) };
}

/** Most recent first — the order the File ▸ Recent menu is drawn in. */
export function recentVaults(prefs: Prefs): VaultPref[] {
  return [...prefs.vaults].sort((a, b) => b.lastOpened - a.lastOpened);
}

/** Is this rectangle still on a display that exists?
 *
 *  A remembered position is a promise about a monitor, and monitors are
 *  unplugged. Restoring a window to a second screen that is no longer there
 *  puts it at coordinates the compositor will happily accept and the reader
 *  cannot see — an app that "does not start" while it is in fact running,
 *  fully, off the side of the desk. Intersection rather than containment: a
 *  window half off the edge is a window the reader can grab. */
export function onSomeDisplay(bounds: Bounds, displays: { bounds: { x: number; y: number; width: number; height: number } }[]): boolean {
  const NEED = 80; // enough of a title bar to grab
  return displays.some((display) => {
    const d = display.bounds;
    const overlapX = Math.min(bounds.x + bounds.width, d.x + d.width) - Math.max(bounds.x, d.x);
    const overlapY = Math.min(bounds.y + bounds.height, d.y + d.height) - Math.max(bounds.y, d.y);
    return overlapX >= NEED && overlapY >= NEED;
  });
}
