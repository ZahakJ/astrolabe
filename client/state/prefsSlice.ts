// This device's preferences as the store holds them: theme, vim, reading,
// the palette, the sidebar and the panel, zen. Moved out of client/state.ts
// unchanged.

import { PANEL_COLLAPSED_KEY, READING_KEY, RELNUM_KEY, SIDEBAR_COLLAPSED_KEY, SIDE_KEY, VIM_KEY, ZEN_KEY, persistFlag, persistFlagValue, themeKey } from "./persistence.ts";
import type { State } from "./types.ts";
import type { StoreGet, StoreSet } from "./sliceTypes.ts";
import * as api from "../api.ts";
import { applyTheme } from "./dom.ts";
import { choiceLabel, counterpartChoice } from "../themes.ts";
import { effectiveSide } from "./helpers.ts";
import { mirrorTheme } from "./themeMirror.ts";
import { setPaneMode as setPaneModeIn } from "../workspace.ts";
import { t, tf } from "../i18n.ts";
import { toast } from "../toast.ts";

/** This device's preferences: theme, vim, reading, the palette, the sidebar and panel, zen. */
export function prefsSlice(set: StoreSet, get: StoreGet) {
  return {
    setTheme: (theme) => {
      // The surface's own key: a ☾/☀ press on the public site, or in preview,
      // never rewrites the editor's theme (themeKey).
      localStorage.setItem(themeKey(), theme);
      applyTheme(theme);
      set({ theme });
      // An ADMIN's pick is also the public site's default, unless a pin says
      // otherwise. Queued, not sent: see mirrorTheme's note.
      mirrorTheme(theme);
    },

    toggleTheme: () => {
      get().setTheme(counterpartChoice(get().theme));
    },

    setPublicTheme: async (theme) => {
      const previous = get().publicTheme;
      // Optimistic, because this is a one-click affordance sitting next to the
      // sentence it changes — the line must not lag behind the button.
      set({
        publicTheme: {
          mode: theme === null ? "follow" : "pinned",
          theme: theme ?? get().theme,
        },
      });
      try {
        // "follow" is stored, not cleared: an instance whose .env pins
        // DEFAULT_THEME needs a value that OVERRIDES that pin, and clearing
        // the key would only fall back to it.
        const res = await api.patchSettings({ defaultTheme: theme ?? "follow" });
        const eff = res.effective;
        set({
          publicTheme: {
            mode: eff.defaultTheme === "follow" ? "follow" : "pinned",
            theme: eff.visitorTheme,
          },
        });
        // Following again means the server's mirror is now what visitors get;
        // make sure it holds this browser's actual theme.
        if (theme === null) mirrorTheme(get().theme);
        toast(theme === null ? t("themeFollowingNow") : tf("themePinnedNow", { theme: choiceLabel(theme) }));
      } catch (err) {
        set({ publicTheme: previous });
        toast(err instanceof Error ? err.message : t("themePinFailed"), "error");
      }
    },

    toggleVim: () => {
      const vimMode = !get().vimMode;
      localStorage.setItem(VIM_KEY, String(vimMode));
      // Leaving vim clears the sub-mode straight away rather than waiting for
      // the editor's effect: the pill must never read "VIM · INSERT" for a
      // mode that is already off.
      set({ vimMode, vimSubMode: vimMode ? get().vimSubMode : null });
    },

    toggleRelativeLines: () => {
      const relativeLines = !get().relativeLines;
      localStorage.setItem(RELNUM_KEY, String(relativeLines));
      set({ relativeLines });
    },

    setVimSubMode: (vimSubMode) => set({ vimSubMode }),

    toggleReading: () => get().setReadingMode(!get().readingMode),

    setReadingMode: (readingMode) => {
      // READING MODE IS PER-PANE, and this writes the PANE, not the flag.
      //
      // It used to set `readingMode` on the store and that was the whole
      // mechanism, because there was one editor and `App.tsx` chose between it
      // and the reading view. With panes, a pane picks its own surface from
      // `pane.mode` — so setting the flag alone left `Ctrl/Cmd+E` flipping a
      // value nothing rendered from. `check-layouts` caught it on all seven
      // keyboard layouts at once, which is what a browser gate is for: nothing
      // in the type system or the unit tests can see a store field that no
      // longer reaches a component.
      //
      // The flag survives as the DERIVED mirror (`mirrorOf`), for the same
      // reason `openPath` does: the status bar, the palette and the mode pill
      // all read it and none of them needs to learn what a pane is.
      localStorage.setItem(READING_KEY, String(readingMode));
      const s = get();
      s.commitWorkspace(
        setPaneModeIn(s.workspace, s.workspace.focus, readingMode ? "reading" : "edit"),
      );
    },

    setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

    setSidebarSidePref: (sidebarSidePref) => {
      persistFlagValue(SIDE_KEY, sidebarSidePref);
      // Resolve immediately against the language in force — "auto" has to
      // land the sidebar somewhere the moment it is chosen, not on the next
      // /api/me.
      set({ sidebarSidePref, sidebarSide: effectiveSide(sidebarSidePref, get().language) });
    },

    // `paneStill: false` for the same reason `setPanelCollapsed` carries it:
    // this is the reader's own hand on a pane, and the 180ms belongs to it.
    setSidebarCollapsed: (sidebarCollapsed) => {
      persistFlag(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed);
      set({ sidebarCollapsed, paneStill: false });
    },

    toggleSidebar: () => {
      const s = get();
      s.setSidebarCollapsed(!s.sidebarCollapsed);
    },

    // `persist` is false for a close that must not become a remembered
    // choice. A viewport-driven collapse goes through
    // `collapsePanelForViewport` instead, which also stills the animation.
    setPanelCollapsed: (panelCollapsed, persist = true) => {
      if (persist) persistFlag(PANEL_COLLAPSED_KEY, panelCollapsed);
      set({ panelCollapsed, paneStill: false });
    },

    // AN AUTOMATIC COLLAPSE DOES NOT ANIMATE. `paneStill` rides in the same
    // `set` as the flag, so React lands both classes in one commit and there
    // is no frame in which the pane is closing with its transition still on —
    // no timer, no resize listener, and it is right in RTL and on every OS
    // because it is not a matter of timing at all.
    collapsePanelForViewport: (panelCollapsed) => set({ panelCollapsed, paneStill: true }),

    setZen: (zen) => {
      persistFlag(ZEN_KEY, zen);
      set({ zen, paneStill: false });
    },
  } satisfies Partial<State>;
}
