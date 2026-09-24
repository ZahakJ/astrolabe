// THE GLOBAL KEYS, as a hook either shell mounts.
//
// This listener was App.tsx's own effect, which was right while App was the
// only shell: a keyboard belongs to the window, not to a layout. The phone
// shell (client/phone/) needs the very same table the moment a bluetooth
// keyboard is paired with a tablet — Ctrl/Cmd+K, Ctrl/Cmd+P, the daily note,
// vim's Escape rules — and a second copy of four hundred lines of chord
// precedence is the one thing guaranteed to drift. So it moved here whole, and
// the differences between the shells are options rather than branches:
//
//   · `enabled` — the phone mounts the hook always but answers only once a
//     HARDWARE keyboard has been seen (client/phone/hardwareKeyboard.ts). An
//     on-screen keyboard sends no chords, and the phone's own layers (sheets,
//     screens) answer Escape and Back themselves.
//   · `quickSearch` — where Ctrl/Cmd+K goes. The desktop dispatches
//     `astrolabe:quicksearch` for the sidebar's field; the phone opens its
//     Search tab.
//   · `phone` — the pane and tab chords (split, close pane, walk tabs) belong
//     to a shell that has panes and tabs, and are left to the browser there.

import { useEffect, useRef } from "react";
import { openDailyNote } from "./daily.ts";
import { toggleBookmark } from "./bookmarks.ts";
import { t } from "./i18n.ts";
import { isKey, shortcutKey } from "./keys.ts";
import { promptNewNote } from "./prompts.ts";
import { useStore } from "./state.ts";
import { insertTemplateCommand, newNoteFromTemplateCommand } from "./templateActions.ts";
import { toast } from "./toast.ts";
import { switchToTwin } from "./twins.ts";

export interface GlobalKeysOptions {
  /** Answer at all right now? Read per keystroke. Default: always. */
  enabled?: () => boolean;
  /** Ctrl/Cmd+K. Default: the desktop's `astrolabe:quicksearch` event. */
  quickSearch?: () => void;
  /** The phone shell: no pane or tab chords. */
  phone?: boolean;
}

export function useGlobalKeys(options: GlobalKeysOptions = {}): void {
  /** Where the caret was when Ctrl/Cmd+K threw focus into the search box —
   *  Esc puts it back there (see returnToNote in the keyboard effect). */
  const quickReturnRef = useRef<HTMLElement | null>(null);
  // Read through a ref so the listener is bound once and still sees the
  // caller's latest callbacks.
  const optsRef = useRef(options);
  optsRef.current = options;

  // Global keyboard shortcuts.
  useEffect(() => {
    /** Is the caret inside the CodeMirror editor right now? */
    const inEditor = (target: EventTarget | null): boolean =>
      target instanceof Element && target.closest(".cm-editor") !== null;

    /** Something modal is on screen and owns the keyboard. The DOM half covers
     *  the layers that are not store flags — the confirm dialog, the theme
     *  picker and the attachment viewer — all of which close on Esc
     *  themselves, and none of which may have Esc taken out from under them by
     *  zen or by leaving preview. */
    const modalUp = (store: ReturnType<typeof useStore.getState>): boolean =>
      store.loginOpen ||
      store.bannerModalOpen ||
      store.moderationOpen ||
      store.trashOpen ||
      store.importFolder !== null ||
      store.unusedOpen ||
      store.settingsOpen ||
      store.captureOpen ||
      store.askOpen ||
      document.querySelector(".s-confirm-overlay, .s-tpick-overlay, .s-att-view") !== null;

    /** Put the caret back where the reader left it — the note they came from.
     *  Ctrl/Cmd+K throws focus into a search box on the other side of the
     *  screen; Esc has to be a way BACK, not just a way out, or the next
     *  keystroke lands in a field nobody is looking at. */
    const returnToNote = (preferred: HTMLElement | null): void => {
      if (preferred?.isConnected) {
        preferred.focus();
        return;
      }
      const editor = document.querySelector<HTMLElement>(".s-view .cm-content");
      if (editor) {
        editor.focus();
        return;
      }
      // Reading view has nothing focusable — at least take the keyboard out
      // of the search field so typing does not disappear into it.
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const opts = optsRef.current;
      if (opts.enabled && !opts.enabled()) return;
      const phone = opts.phone === true;
      const store = useStore.getState();
      // Ctrl/Cmd+Shift+F: search and replace across the vault (the sidebar's
      // own panel). Before Escape, before everything: it is a chord nothing
      // else in the shell claims, and it must beat the browser's.
      // `isKey`, never `e.key`: on an Arabic layout the F key sends "ب" and
      // this chord was the one in the shell still reading the character
      // (the owner: "all shortcuts must work in both langs").
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && isKey(e, "f") && store.admin) {
        // keymap: scReplaceVault
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("astrolabe:replace-open"));
        return;
      }
      // Ctrl/Cmd+Alt+Shift+L: THE WAY BACK — the chrome's language, flipped
      // to the other one (chromeLangSwitch.ts). The twin's chord
      // with Shift: L for language, and Shift because this is the bigger
      // turn (everything around the note, not the note). Before everything,
      // modals included, for the reason the whole feature exists: the reader
      // pressing it cannot read the dialog that is open. `isKey`, so an
      // Arabic layout's م key answers it too.
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.shiftKey && isKey(e, "l") && store.admin) {
        // keymap: scChromeLang
        e.preventDefault();
        e.stopPropagation();
        store.toggleChromeLang();
        return;
      }
      if (e.key === "Escape") {
        // keymap: scEscape scEscapeBlog
        // 1. The shortcuts overlay closes first (it is the topmost layer).
        if (store.shortcutsOpen) {
          e.preventDefault();
          store.setShortcutsOpen(false);
          return;
        }
        // 2. Ctrl/Cmd+K parked the caret in the sidebar search: Esc returns it
        //    to the note. (The Sidebar's own Esc still clears the query — this
        //    runs in the capture phase and moves focus, nothing else.)
        const inSearch =
          e.target instanceof Element && e.target.closest(".s-search") !== null;
        if (inSearch) {
          const back = quickReturnRef.current;
          quickReturnRef.current = null;
          window.setTimeout(() => returnToNote(back), 0);
          return;
        }
        if (store.paletteOpen || modalUp(store)) return;
        if (e.target instanceof Element && e.target.closest("input, textarea")) return;
        // 3. Preview is a mode that took the editor away — Esc gives it back.
        if (store.previewVisitor) {
          e.preventDefault();
          void store.setPreviewVisitor(false);
          return;
        }
        // 4. Esc leaves zen — never out from under vim, where Esc is sacred,
        //    and never out from under a reader panel: a book's contents list
        //    or go-to field closes on Esc, and this listener runs first
        //    (capture), so it has to look before it drops the window out of
        //    zen on the same keystroke.
        if (store.zen) {
          if (store.vimMode && inEditor(e.target)) return;
          if (document.querySelector('.s-book[data-overlay]:not([data-overlay="none"])')) return;
          e.preventDefault();
          store.setZen(false);
        }
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      // NOT `e.key.toLowerCase()`. `e.key` is what the LAYOUT produced, and on
      // the owner's Arabic keyboard the physical P key produces "ح" — so every
      // line below was false and every shortcut in this listener was dead for
      // him (and for Russian, Greek, Hebrew, Persian…). `shortcutKey` takes the
      // layout's answer when it has a Latin one and the PHYSICAL key when it
      // does not; client/keys.ts carries the whole argument, including why
      // physical must not simply win (Dvorak) and why AltGr returns null
      // (Ctrl+Alt is how half of Europe types). One consequence worth naming:
      // the two `e.altKey && e.code === "KeyB"` special cases that used to live
      // here are GONE — macOS Option+B ("∫") is not a Latin character, so it
      // falls to the physical key on the general path now, and the AltGraph
      // guards the pane toggles carried are the resolver's job for every
      // binding rather than two of them.
      const key = shortcutKey(e) ?? "";
      const bKey = key === "b";
      const tKey = key === "t";
      // Ctrl/Cmd+/ — the list of every binding, including this one. Handled
      // ahead of the modal guard so it opens (and closes) from anywhere. `?` is
      // Shift+/ on a US keyboard and the sheet answers to both; on a layout
      // that puts / elsewhere (German Shift+7, Dvorak's `[` position) the
      // layout's own "/" is what arrives, and on Arabic the physical Slash key
      // (which types "ظ") resolves to "/". `isKey` is what folds "?" into "/",
      // so this is the one binding that does not read `key` directly.
      // …but NOT Ctrl/Cmd+Alt+/, which is the editor's comment toggle. Without
      // this exclusion the sheet swallowed it in the capture phase, and a
      // capture-phase preventDefault ends CodeMirror's pipeline before its
      // first handler runs — the same way it kept Ctrl/Cmd+D and Ctrl/Cmd+B
      // dead. Alt is the escape hatch this file already uses for exactly this.
      if (isKey(e, "/") && !e.altKey) {
        // keymap: scHelp
        e.preventDefault();
        if (!modalUp(store)) {
          store.setPaletteOpen(false);
          store.setShortcutsOpen(!store.shortcutsOpen);
        }
        return;
      }
      // Which shell this keystroke is landing in. The blog mounts no palette,
      // no graph, no panes and no zen — so every binding below except
      // Ctrl/Cmd+K (its search overlay answers that one) belongs to the
      // BROWSER there, and taking it would be theft: an anonymous reader lost
      // the print dialog and Firefox's bookmarks sidebar to two commands that
      // do not exist on the page. Same predicate as the blogVisitor render
      // branch below, read from the store because this listener never re-binds.
      const blogShell =
        store.authReady && !store.admin && store.publicLayout !== "app";
      // Ctrl/Cmd+P and +K are ALWAYS ours IN THE APP SHELL — swallowed before
      // any early return so the browser's print dialog / address-bar search
      // can never fire, modal open or not, and regardless of what CM does
      // downstream.
      //
      // +B IS THE EXCEPTION, AND preventDefault IS WHY. CodeMirror's whole
      // keydown pipeline begins `if (event.defaultPrevented) break` — so a
      // capture-phase preventDefault here does not merely stop the browser,
      // it stops the EDITOR, and Ctrl/Cmd+B is now the editor's (bold). It
      // was swallowed unconditionally while it folded a pane, and left that
      // way it made the new binding silently dead: measured, Ctrl+I bolded
      // nothing and Ctrl+B did nothing at all. So outside the editor it still
      // dies here — Firefox's bookmarks sidebar (Ctrl+B) and Chrome's bookmark
      // bar (Ctrl+Shift+B) must never open over the app — and inside it, the
      // formatting keymap's own `preventDefault: true` does the same job one
      // layer down, where it can also let vim's Ctrl+B through.
      if (key === "k" || (!blogShell && key === "p")) e.preventDefault();
      if (bKey && !blogShell && !inEditor(e.target)) e.preventDefault();
      // +D IS THE SAME EXCEPTION, FOR THE SAME REASON. Ctrl/Cmd+D is the
      // EDITOR's — `searchKeymap`'s selectNextOccurrence, and vim's half-page
      // scroll ahead of it — so it may only die out here, where it would
      // otherwise be Chrome's and Firefox's "bookmark this page". Swallowing
      // it unconditionally is precisely what kept multi-cursor dead: this
      // listener has held the key for the daily note since it shipped, and a
      // capture-phase preventDefault ends CodeMirror's pipeline before its
      // first handler runs. The daily note now wears Alt, below.
      if (key === "d" && !e.altKey && !blogShell && !inEditor(e.target)) e.preventDefault();
      // A modal dialog owns the keyboard: app-level shortcuts firing behind
      // the login/banner/moderation/confirm overlays would steal focus (e.g.
      // Ctrl+K focusing the sidebar search under the modal) or stack modals.
      if (modalUp(store) || store.shortcutsOpen) return;
      // Ctrl/Cmd+K is the blog reader's one command; the rest act on chrome
      // that is not on their page.
      if (blogShell && key !== "k") return;
      if (key === "p" && e.altKey) {
        // Ctrl/Cmd+Alt+P — print / export PDF. THE OBVIOUS CHORD WAS ALREADY
        // SPENT, twice: Ctrl/Cmd+P is the palette and Ctrl/Cmd+Shift+P
        // publishes, and neither of those is worth moving so that printing can
        // have the key browsers hand it. So printing wears Alt, like the daily
        // note and the pane toggles, and both of the alternatives are honest:
        // the palette row prints the chord, and inside the BLOG shell nothing
        // is swallowed at all — a visitor's Ctrl/Cmd+P is the browser's, and
        // reading/print.css is what makes it produce the right pages.
        //
        // Dynamic import for the reason CommandPalette gives at the same call:
        // the module carries the markdown renderer and must not be in a first
        // paint. It is already resolved whenever a document is on screen.
        // keymap: cmdPrintNote
        e.preventDefault();
        void import("./print.ts").then((mod) => mod.printNote());
      } else if (key === "p" && e.shiftKey) {
        // Ctrl/Cmd+Shift+P: publish toggle (admin, note open) — never the palette.
        // keymap: cmdPublishNote
        if (store.admin && store.openPath) void store.togglePublish(store.openPath);
      } else if (key === "p") {
        // keymap: scPalette
        store.setPaletteOpen(!store.paletteOpen);
      } else if (key === "k") {
        // keymap: scSearch
        // Ctrl/Cmd+K — search everywhere: the sidebar's search box in the
        // app shell, a centered overlay in the blog shell. Whichever shell is
        // mounted owns the event. An open palette hands over to search
        // instead of fighting it for focus.
        e.preventDefault();
        if (store.paletteOpen) store.setPaletteOpen(false);
        // Remember the note we are leaving so Esc can hand it back. A second
        // press while the search box already has focus must not overwrite it
        // with the search box itself.
        const from = document.activeElement;
        if (from instanceof HTMLElement && from.closest(".s-search") === null) {
          quickReturnRef.current = from;
        }
        if (opts.quickSearch) opts.quickSearch();
        else window.dispatchEvent(new Event("astrolabe:quicksearch"));
      } else if (key === "g") {
        // keymap: scGraph
        e.preventDefault();
        store.toggleGraph();
      } else if (key === "e") {
        // keymap: cmdToggleReading
        if (!store.admin) return; // visitors live in reading view
        e.preventDefault();
        store.toggleReading();
        if (store.view !== "editor") store.setView("editor");
      } else if (bKey && e.altKey) {
        // keymap: cmdTogglePaneNotes cmdTogglePaneOutline
        // THE PANE TOGGLES WEAR ONE MORE MODIFIER THAN THEY USED TO.
        // Ctrl/Cmd+B was the notes sidebar and Ctrl/Cmd+Shift+B the outline
        // pane; Ctrl/Cmd+B is now BOLD, because that is the binding every
        // reader arrives with and formatting wins inside the editor
        // (client/editor/commands.ts). The pair kept its shape — one key,
        // Shift picks the second pane — and moved out to Alt, so the only
        // thing to re-learn is "add Alt". The status-bar tooltips, the two
        // palette rows and the Ctrl/Cmd+/ sheet all print the new numbers.
        // AltGraph is excluded — on several European layouts Right-Alt reports
        // ctrl+alt, and a reader typing a bracket must not fold a pane — but
        // the exclusion is no longer spelled here: `shortcutKey` returns null
        // for AltGr, for THIS binding and every other one.
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) store.setPanelCollapsed(!store.panelCollapsed);
        else store.toggleSidebar();
      } else if (bKey && e.shiftKey && !e.altKey) {
        // keymap: cmdBookmarkNote
        // Ctrl/Cmd+Shift+B — bookmark the open note (or take the bookmark
        // off). Plain Ctrl/Cmd+B is bold in the editor; Alt+B is the sidebar.
        if (!store.admin || !store.openPath) return;
        e.preventDefault();
        const path = store.openPath;
        toggleBookmark(path)
          .then((on) => toast(t(on ? "bookmarkAdded" : "bookmarkRemoved")))
          .catch(() => toast(t("bookmarkFailed"), "error"));
      } else if (bKey) {
        // Plain Ctrl/Cmd+B (and +Shift+B) are swallowed above — Firefox's
        // bookmarks sidebar and Chrome's bookmark bar must never open over the
        // app — and then handed on: inside the editor CodeMirror's formatting
        // keymap answers them, and outside it nothing does. Deliberately
        // nothing: a key that folds a pane in one half of the window and bolds
        // a word in the other is a key nobody can describe.
      } else if (key === "z" && e.shiftKey) {
        // keymap: cmdZen
        // Ctrl/Cmd+Shift+Z — zen. On macOS this is ALSO CodeMirror's only
        // redo binding (redo is Mod-y elsewhere), so the editor keeps Cmd+
        // Shift+Z when the caret is in it — Ctrl+Shift+Z, the palette command
        // and the ✕ all still enter zen there. stopPropagation everywhere
        // else: CM must never redo and toggle zen off the same keystroke.
        if (e.metaKey && inEditor(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        store.setZen(!store.zen);
      } else if (phone && (isKey(e, "\\") || (e.altKey && (e.key === "PageDown" || e.key === "PageUp")) || (key === "w" && e.altKey))) {
        // The phone shell has one pane and no tab strip: the split, the
        // pane close and the tab walk are the browser's there.
        return;
      } else if (isKey(e, "\\")) {
        // keymap: scSplitPane scSplitPaneDown scClosePane
        // `isKey`, not `key ===`: Shift+\ arrives as "|" on a US keyboard, so
        // the stacked split answered only to the harness that sends "\"
        // with Shift held (the owner: "ctrl \ works but ctrl shift \ doesn't").
        // Ctrl/Cmd+\ splits along the INLINE axis, +Shift stacks instead, and
        // +Alt closes the pane. One key, one mental model: "another one of
        // these", with Shift choosing the direction — the same shape the pane
        // toggles use. A split that would breach the cap says so by name
        // rather than appearing to do nothing, which is how a keystroke gets
        // reported as broken.
        if (!store.admin) return;
        e.preventDefault();
        if (e.altKey) {
          store.closeFocusedPane();
        } else if (!store.splitFocusedPane(e.shiftKey ? "block" : "inline")) {
          toast(t("paneCapReached"));
        }
      } else if (e.altKey && (e.key === "PageDown" || e.key === "PageUp")) {
        // keymap: scStepTab
        // THE TAB STRIP GETS A KEYBOARD (v1.8 audit, F12). Every other pane
        // operation had a chord and the tabs inside them had none, so a reader
        // with forty notes open could split, close and walk between panes
        // without a mouse and then had to reach for one to change tab.
        //
        // WHY THESE KEYS. The three chords the whole world uses for tabs —
        // Ctrl+Tab, Ctrl+PageUp/PageDown, Ctrl+W — all belong to the browser,
        // and a keystroke that fights the browser is a keystroke that loses.
        // Two of them can be worn one modifier over, which is the escape hatch
        // this file already takes for the templates and the pane toggles; the
        // third cannot, because Alt+Tab belongs to the window manager. So the
        // page keys carry the walk and W carries the close, and the muscle
        // memory transfers with one extra finger.
        //
        // NOT arrows: Ctrl+Alt+←/→ is GNOME's workspace switcher and macOS
        // Chrome's own tab switcher, and neither hands it back.
        e.preventDefault();
        store.stepTab(e.key === "PageDown" ? 1 : -1);
      } else if (key === "w" && e.altKey) {
        // keymap: scCloseTab
        // Ctrl/Cmd+Alt+W — close the focused pane's active tab. The bare chord
        // closes the browser window and is not takeable anywhere.
        e.preventDefault();
        store.closeActiveTab();
      } else if (key === "d" && e.shiftKey && e.altKey) {
        // keymap: cmdOpenToday
        // Ctrl/Cmd+Alt+Shift+D — the Today page (client/today/): the daily
        // note's Alt and capture's Shift together, the same idea's third
        // verb. Checked BEFORE the two below, each of which would otherwise
        // take it for its own (neither asks about the other modifier). On a
        // phone with a keyboard it lands on the Today tab (PhoneShell maps
        // `~today` to it).
        if (!store.admin) return;
        e.preventDefault();
        e.stopPropagation();
        store.setView("today");
      } else if (key === "d" && e.shiftKey && !e.altKey) {
        // keymap: cmdQuickCapture
        // Ctrl/Cmd+Shift+D — quick capture: a line into today's note without
        // leaving this one (client/capture.ts). Shift, beside the daily
        // note's Alt: the two are one idea ("today's note") with two verbs,
        // and the plain key stays the editor's (multi-cursor). Swallowed
        // even inside the editor, where CodeMirror binds nothing to it and
        // the browser's "bookmark all tabs" would otherwise open.
        if (!store.admin) return;
        e.preventDefault();
        e.stopPropagation();
        store.setCaptureOpen(true);
      } else if (key === "d" && e.altKey) {
        // keymap: cmdDailyNote
        // Ctrl/Cmd+Alt+D — the daily note, moved here off the plain key for
        // the same reason the pane toggles moved to Alt above: the unmodified
        // key belongs to the editor, and a once-a-day verb does not outrank a
        // per-minute one. It kept its letter, so the only thing to re-learn is
        // "add Alt". The vim guard that used to sit here is gone with the
        // collision: vim's Ctrl-D now reaches vim by simply not being taken.
        if (!store.admin) return; // daily note may create a file
        e.preventDefault();
        void openDailyNote();
      } else if (key === "n") {
        // keymap: newNote
        if (!store.admin) return;
        e.preventDefault();
        // Our dialog, not the OS box: prompts.ts owns the naming rule and
        // shows what the typed name becomes (see client/prompts.ts).
        void promptNewNote("");
      } else if (tKey && e.altKey) {
        // keymap: cmdInsertTemplate cmdNewFromTemplate
        // TEMPLATES WEAR ALT, and it is not a stylistic choice. Ctrl/Cmd+T is
        // the browser's new tab and Ctrl/Cmd+Shift+T reopens a closed one —
        // neither is takeable, and a keystroke that fights the browser is a
        // keystroke that loses. Alt is the same escape hatch the pane toggles
        // took when Ctrl/Cmd+B became bold, and the pair keeps that shape:
        // one key, Shift picks the second command. AltGraph is excluded for
        // the same reason it is there (European layouts report Right-Alt as
        // ctrl+alt) — `shortcutKey` does that for every binding now, so the
        // guard is not repeated here. A desktop that eats Ctrl+Alt+T at the WM
        // layer still leaves the palette and the tree's folder menu.
        if (!store.admin) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) void newNoteFromTemplateCommand();
        else if (store.openPath) void insertTemplateCommand();
      } else if (key === "l" && e.altKey && !e.shiftKey) {
        // keymap: cmdTwinSwitch
        // Ctrl/Cmd+Alt+L — turn the note over to its other face
        // (client/twins.ts). Advertised by the sheet, the palette row and
        // docs/keymap.md since the twins shipped, and bound nowhere until
        // 3.26.1: the sheet's row carried a `run` for the palette and the
        // listener never learned the key. A no-op on a note with no twin,
        // which is most of them — switchToTwin says nothing then, by design.
        if (!store.admin) return;
        e.preventDefault();
        e.stopPropagation();
        switchToTwin();
      }
    };
    // Capture phase: run ahead of CodeMirror/vim handlers so a stopPropagation
    // downstream can never let Ctrl+P fall through to the browser.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
