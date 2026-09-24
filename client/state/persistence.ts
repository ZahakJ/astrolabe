// What the store keeps in this browser: the localStorage keys and their
// readers and writers — theme, vim, reading mode, the sidebar's side and
// folds, the tab list and the workspace (and the desktop's copy of it beside
// the vault). Moved out of client/state.ts unchanged.

import { IS_DESKTOP } from "../desktop/bridge.ts";
import type { SidebarSidePref } from "./types.ts";
import { THEMES, isTheme, type ThemeChoice } from "../themes.ts";
import { parseWorkspace, serializeWorkspace, type Workspace } from "../workspace.ts";
import * as api from "../api.ts";
import { boot } from "../boot.ts";
import { isCustomThemeId } from "../../shared/customTheme.ts";
import { t } from "../i18n.ts";
import { useStore, workspacePersists } from "../state.ts";

export const THEME_KEY = "astrolabe.theme";
/** A READER'S choice, made on the public site. A second key, and the whole
 *  reason it exists is the owner: `setTheme` stores the editor's pick in
 *  THEME_KEY, that key survives signing out, and a stored choice outranks the
 *  site's theme by a rule that is right for visitors — so in any browser the
 *  owner had ever signed in from, their EDITOR theme outranked every design
 *  they made, for them and only for them ("none of my themes really show on
 *  Mission Control, it's just the default dark theme"). The editor's theme is
 *  a preference about the editor; a choice a reader makes on the public site
 *  is a preference about the public site; one key cannot hold both. Which key
 *  a session reads is decided by the surface it is on (`themeKey`). */
const SITE_THEME_KEY = "astrolabe.site-theme";

/** The key in force for this session: the public site's for a visitor shell
 *  (the served page said so — client/boot.ts — which only a session shown the
 *  public site is told) and for the owner previewing as one, the editor's
 *  otherwise. Read live, because preview is entered and left without a
 *  reload. `useStore` is not yet defined at boot, and does not need to be:
 *  every boot starts out of preview (clearStoredPreview). */
export function themeKey(): string {
  if (boot.layout !== undefined) return SITE_THEME_KEY;
  try {
    if (useStore.getState().previewVisitor) return SITE_THEME_KEY;
  } catch {
    // boot: the store is being created
  }
  return THEME_KEY;
}
export const VIM_KEY = "astrolabe.vim";
/** Relative line numbers beside vim keys — on by default, a device choice. */
export const RELNUM_KEY = "astrolabe.relativeLines";
export const READING_KEY = "astrolabe.reading";
const TABS_KEY = "astrolabe.tabs";
/** The workspace supersedes `astrolabe.tabs`, and BOTH are written. The old key
 *  costs a few bytes and buys a downgrade that does not lose anyone's session:
 *  an instance rolled back to a build without panes still finds the tabs it
 *  understands. It is read only when the new key is absent or unreadable. */
const WORKSPACE_KEY = "astrolabe.workspace";
const PREVIEW_KEY = "astrolabe.preview";
export const SIDE_KEY = "astrolabe.sidebarSide";
export const SIDEBAR_COLLAPSED_KEY = "astrolabe.sidebarCollapsed";

/* NO DRAWER BREAKPOINT HERE ANY MORE (3.27.0). This file held DRAWER_QUERY —
 * "≤700px, or ≤999px on a finger that cannot hover" — and PHONE_QUERY, its
 * first arm, and below them the desktop shell folded its sidebar into an
 * overlay drawer and its outline pane into a second one. Both arms are
 * inside PHONE_SHELL_QUERY (client/shellQuery.ts), and since the Classic
 * phone layout was deleted the desktop shell is never mounted where that
 * query matches — so the drawer had no device left to open on. The one
 * question left, "is this a phone", is the shell's, and shellQuery.ts owns
 * it. A desktop window between 700 and 999px on a mouse keeps its docked,
 * resizable panes, exactly as it did (the drawer's second arm never took a
 * mouse). */
export const PANEL_COLLAPSED_KEY = "astrolabe.panelCollapsed";
export const ZEN_KEY = "astrolabe.zen";

/** The stored theme, at BOOT — before the custom-theme registry has been
 *  fetched, so a `custom:` id cannot be checked for existence yet. It is
 *  accepted on SHAPE here and re-checked in loadMe() once the registry lands:
 *  refusing it now would mean every custom-theme user opens on iron-gall for a
 *  beat and then jumps, which is the flash this function exists to avoid. */
export function readTheme(): ThemeChoice {
  const stored = localStorage.getItem(themeKey());
  if (isTheme(stored)) return stored;
  if (stored !== null && isCustomThemeId(stored)) return stored;
  // No choice of their own: the room the served shell was ALREADY painted in
  // (client/boot.ts), so the first paint and the first frame agree. Falling
  // to iron-gall here repainted a phosphor site iron-gall for the ~200ms
  // until /api/me — the flash of the wrong colour under the flash of the
  // wrong layout. /api/me still confirms it under the same stored-choice rule.
  // The payload says it; the <html> tag the server painted says it too, and
  // is read as the fallback so the theme survives even a shell whose JSON
  // block is missing or foreign.
  const served = boot.theme ?? document.documentElement.dataset.theme;
  if (isTheme(served) || (served !== undefined && isCustomThemeId(served))) return served;
  return THEMES[0];
}

export function readRelativeLines(): boolean {
  return localStorage.getItem(RELNUM_KEY) !== "false";
}

export function readVim(): boolean {
  return localStorage.getItem(VIM_KEY) === "true";
}

/** A persisted boolean flag, or `null` when the user never chose. The null is
 *  load-bearing for the panel: no stored choice means the responsive
 *  auto-collapse still owns the panel (see BacklinksPanel). */
export function readFlag(key: string): boolean | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : raw === "true";
  } catch {
    return null;
  }
}

export function persistFlag(key: string, value: boolean): void {
  persistFlagValue(key, String(value));
}

export function persistFlagValue(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage full/unavailable — the preference still works for this session
  }
}

/** True once the reader has explicitly collapsed/expanded the right panel;
 *  until then the viewport width decides (BacklinksPanel reads this). */
export function hasPanelPreference(): boolean {
  return readFlag(PANEL_COLLAPSED_KEY) !== null;
}

/** The stored preference. A value written by an OLDER build is a bare
 *  "left"/"right" with no "auto" in the vocabulary — it was an explicit act
 *  then and it stays an explicit pin now, which is the migration: nothing is
 *  rewritten, the same two strings simply keep meaning what they meant.
 *  Anything else (absent, corrupt, a value from the future) is "auto". */
export function readSidebarSidePref(): SidebarSidePref {
  try {
    const raw = localStorage.getItem(SIDE_KEY);
    return raw === "left" || raw === "right" || raw === "auto" ? raw : "auto";
  } catch {
    return "auto";
  }
}

export function readReading(): boolean {
  return localStorage.getItem(READING_KEY) === "true";
}

// Open tabs survive reloads; their absence marks a fresh visitor (→ home note).
interface StoredTabs {
  tabs: string[];
  open: string | null;
}

export function readStoredTabs(): StoredTabs | null {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTabs>;
    if (!Array.isArray(parsed.tabs)) return null;
    return {
      tabs: parsed.tabs.filter((t): t is string => typeof t === "string"),
      open: typeof parsed.open === "string" ? parsed.open : null,
    };
  } catch {
    return null; // corrupted or unavailable storage
  }
}

export function persistTabs(tabs: string[], open: string | null): void {
  if (!workspacePersists()) return;
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify({ tabs, open }));
  } catch {
    // storage full/unavailable — session restore just won't work
  }
}

let workspaceBackupTimer: ReturnType<typeof setTimeout> | null = null;

export function persistWorkspace(ws: Workspace): void {
  if (!workspacePersists()) return;
  const stored = serializeWorkspace(ws);
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(stored));
  } catch {
    // storage full/unavailable — session restore just won't work
  }
  // THE DESKTOP KEEPS A COPY BESIDE THE VAULT. localStorage is per origin and
  // the desktop's origin is a port; a launch that had to move ports opened
  // on nothing and then on the first note in the tree. Debounced: a drag
  // across four panes is one write, a second later.
  if (IS_DESKTOP && useStore.getState().admin) {
    if (workspaceBackupTimer !== null) clearTimeout(workspaceBackupTimer);
    workspaceBackupTimer = setTimeout(() => {
      workspaceBackupTimer = null;
      void api.putWorkspaceState(stored).catch(() => {});
    }, 1000);
  }
}

/** The stored workspace, or null. `parseWorkspace` is TOTAL — it never throws
 *  and recovers the reader's open notes out of a layout it cannot otherwise
 *  understand — so the only null here means "nothing stored", and the caller
 *  falls back to `astrolabe.tabs`. */
export function readStoredWorkspace(): Workspace | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return null;
    return parseWorkspace(JSON.parse(raw));
  } catch {
    return null;
  }
}

// Visitor preview is deliberately NOT persisted: it is a mode that takes the
// editor away, and the reader who lands in it after a reload has no memory of
// asking for it — a reload always returns the admin to the app. (Older builds
// stored the flag; clear it once so an upgrade cannot strand anyone in a
// visitor shell they cannot reason about.)
export function clearStoredPreview(): void {
  try {
    localStorage.removeItem(PREVIEW_KEY);
  } catch {
    // storage unavailable — nothing was stored either
  }
}
