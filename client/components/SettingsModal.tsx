// The settings panel (admin): eighteen short pages in four groups over
// ASTROLABE_DATA/settings.json and this browser's own preferences, read and
// written through GET/PATCH /api/settings and localStorage.
//
// THE PAGES ARE BY INTENT, IN A TWO-LEVEL RAIL (settings, round 2): You ·
// Your site · Data · App, each a heading over its pages — see
// settings/tabs.ts, contracts/settings-design.md for the shape and the
// control catalogue, and contracts/settings-audit.md for where each row went.
//
// TWO KINDS OF ROW, ONE ANATOMY. A row the reader's browser keeps (the theme,
// the reader's language, Vim) saves itself on click; a page made only of such
// rows says so once under its intro, and on a mixed page those rows wear a
// small "This device" mark. Every other row is a form value, and the Save bar
// at the foot appears the moment one of them changes and speaks for all of
// them. Every row is a label, one line of help under it, and its control; a ⓘ
// beside the label opens a folded paragraph under the row (the environment
// variable's line, or reference text); a page opens with one sentence and may
// end with an Advanced line that names what it holds.
// Text fields left empty inherit the env default (shown as the placeholder).
// Saving PATCHes only the keys that changed, then refreshes /api/me so the
// wordmark, layout, theme default, fonts and favicon apply live — no reload.
//
// THE PANEL IS A HOST (3.27.0). The form, its rules and its Save live in
// settings/useSettingsForm.ts; each section's rows in settings/<Tab>Tab.tsx,
// chosen by one switch (settings/TabBody.tsx). What stays here is the
// DIALOG: the rail, the search above it, the Save bar, the picker stacked on
// top, and the exits that ask before discarding. The phone shell hosts the
// same form and the same section bodies as pushed screens (client/phone/
// screens/SettingsScreen.tsx), in the same order under the same names.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
// Aliased: the panel also installs a window keydown listener, and React's
// KeyboardEvent would shadow the DOM one that listener is typed with.
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useDialog } from "../a11y.ts";
import { t } from "../i18n.ts";
import { useStore } from "../state.ts";
import { attachScrollFade } from "../scrollFade.ts";
import { confirmModal } from "./Confirm.tsx";
import SettingsSearch from "./settings/SettingsSearch.tsx";
import { SETTINGS_INDEX } from "./settings/settingsIndex.ts";
import { isSelectOpen } from "./controls/Select.tsx";
import { isThemePickerOpen } from "./ThemePicker.tsx";
import { SettingsContext, loadedCtx } from "./settings/context.ts";
import { ImagePicker } from "./settings/ImageField.tsx";
import TabBody from "./settings/TabBody.tsx";
import { GROUPS, pageName, rememberedTab, revealRow, TAB_STORAGE, tabIntro, visiblePages } from "./settings/tabs.ts";
import { useSettingsForm } from "./settings/useSettingsForm.ts";

export default function SettingsModal() {
  const setOpen = useStore((s) => s.setSettingsOpen);
  const settingsFocus = useStore((s) => s.settingsFocus);
  useStore((s) => s.language); // re-render the chrome strings on language change
  const settings = useSettingsForm();
  const { pocket, form, eff, inh, loadError, saving, patch, dirty, valid, save, discard, picker, setPicker, setForm, dirtyRef } = settings;
  const ctx = loadedCtx(settings);
  /** The panel is gone. Only `requestClose` below may call this from an exit
   *  path a reader takes; this is the half that runs once the question of
   *  unsaved edits has been settled (or never arose). */
  const closeNow = useCallback(() => setOpen(false), [setOpen]);

  // Read by the once-registered Esc listener, so it sees the picker that is
  // open NOW rather than the one at registration.
  const pickerRef = useRef(picker);
  pickerRef.current = picker;
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  /** EVERY EXIT ASKS FIRST WHEN THERE IS SOMETHING TO LOSE. Escape, the
   *  scrim, the × and Close all reached a bare `setOpen(false)`, so a reader
   *  who had retyped a remote URL and a branch and then pressed Esc to dismiss
   *  a font list one keystroke too many lost both, silently — the panel's
   *  only `confirmModal` guarded font deletion. The designer already had the
   *  twelve-line answer (`DesignerPanel.tsx` `requestClose`), and this is the
   *  same one: clean form closes at once; a dirty one gets the question, with
   *  Discard as the confirm and Cancel returning to the panel. The dirty flag
   *  is read through a ref because the Esc listener is registered once. */
  const askingRef = useRef(false);
  const requestClose = useCallback(() => {
    if (!dirtyRef.current) {
      closeNow();
      return;
    }
    if (askingRef.current) return;
    askingRef.current = true;
    void confirmModal({
      title: t("closeUnsavedTitle"),
      body: t("closeUnsavedBody"),
      confirmLabel: t("discardChanges"),
    }).then((ok) => {
      askingRef.current = false;
      if (ok) closeNow();
    });
  }, [closeNow, dirtyRef]);

  // Trap + restore. Escape stays with the capture-phase handler below, which
  // has to close the PICKER first when one is stacked on top. The trap arms
  // once the form has loaded, because that is when the search field exists:
  // armed at mount it landed the first focus on the ✕, the one control in a
  // settings panel nobody opens it to use. A coarse pointer gets the panel
  // itself instead — focusing a text field there raises the keyboard over
  // the tab strip before the reader has chosen a tab.
  useDialog(panelRef, {
    active: form !== null,
    initialFocus: () => (window.matchMedia("(pointer: coarse)").matches ? panelRef.current : searchRef.current),
  });

  const bodyRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  /** The section the panel last showed, on this device. A panel that always
   *  reopens on the first section sends a reader who is tuning Backup & sync
   *  back through the rail on every visit; it is the panel's one piece of
   *  per-device state and it is cheap to keep. */
  const [tab, setTab] = useState(rememberedTab);
  /** THE BODY'S SCROLL EDGES ARE A MASK, NOT AN OVERLAY.
   *
   *  Two absolutely-positioned gradient `<span>`s used to sit over the top and
   *  bottom of the scroller, painting `--bg-raised` to transparent. A gradient
   *  laid over content only hides what it exactly matches, and it did not: at
   *  the top edge a segmented pill came through cut across its middle with its
   *  accent border flat-cut, which reads as a rendering fault rather than as
   *  "there is more above" — the same slice again at the foot against the
   *  footer rule. `.s-scrollfade` masks the element's own alpha instead, so
   *  the row genuinely dissolves; and being a mask it cannot disagree with the
   *  ground it is drawn on. `attachScrollFade` keeps it honest through
   *  scrolling, resizing, tab changes and rows appearing (the size-adjust row
   *  comes and goes), which the old handler needed three dependencies to do. */
  useEffect(() => attachScrollFade(bodyRef.current), []);
  /** The rail is a scroller of its own since 3.39.2 — eighteen English names
   *  outgrow the column the search field leaves them — and a cut list must
   *  fade, not guillotine, like the body beside it. */
  useEffect(() => attachScrollFade(railRef.current), []);

  /** A new tab starts at ITS top — carrying the previous tab's scroll offset
   *  into a shorter tab lands the reader in the middle of it (or past its
   *  end), which reads as a broken panel. */
  const goToTab = useCallback((id: string) => {
    setTab(id);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    try {
      localStorage.setItem(TAB_STORAGE, id);
    } catch {
      // Not remembered, then; the panel still switches.
    }
  }, []);

  /** The tabs this vault actually has. Only a pocket vault differs, and the
   *  rail, the arrow keys and the heading all read this rather than TABS — a
   *  rail that skips a tab while ↓ still walks into it is worse than either
   *  answer on its own. */
  const visibleTabs = useMemo(() => visiblePages(pocket), [pocket]);

  /** The panel remembers the last section per device, and a phone that
   *  opened an instance yesterday and a pocket vault today remembers one that
   *  is not here. The first — Appearance, which every vault has — is the
   *  answer, and it is taken before a single row renders. */
  useEffect(() => {
    if (!visibleTabs.some((s) => s.id === tab)) goToTab(visibleTabs[0].id);
  }, [visibleTabs, tab, goToTab]);

  /** Bring one row into view and MARK it for a moment. Scrolling to a row
   *  without marking it leaves the reader looking at a list and guessing which
   *  one answered. Shared by the panel's own search and by the surfaces
   *  elsewhere in the app that point at a row (`openSettingsAt`). */
  const reveal = useCallback((label: string, host?: string) => revealRow(bodyRef.current, label, host), []);

  /** ↑/↓ walk the rail, the way a tab list is expected to behave; the arrow
   *  keys never leave the rail, and Home/End jump to its ends. */
  const onRailKey = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      const keys: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
      const delta = keys[e.key];
      const at = visibleTabs.findIndex((s) => s.id === tab);
      let next = -1;
      if (delta !== undefined) next = Math.max(0, Math.min(visibleTabs.length - 1, at + delta));
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = visibleTabs.length - 1;
      if (next < 0 || next === at) return;
      e.preventDefault();
      goToTab(visibleTabs[next].id);
      railRef.current?.querySelectorAll("button")[next]?.focus();
    },
    [goToTab, tab, visibleTabs],
  );

  /** ARRIVING FROM SOMEWHERE ELSE IN THE APP, pointed at one row.
   *
   *  `openSettingsAt("rowComments")` is how the moderation panel answers "the
   *  margins are closed" with the switch that opens them rather than with a
   *  shell variable (v1.8 UX audit F33). The tab comes from SETTINGS_INDEX —
   *  the same index the search above walks, so a row that moves tabs moves for
   *  both — and the request is cleared the moment it has been served, or the
   *  panel would jump back to it on every re-render. It waits for `form`,
   *  because no row exists in the DOM until the settings have loaded. */
  useEffect(() => {
    if (settingsFocus === null || form === null) return;
    const entry = SETTINGS_INDEX.find((row) => row.label === settingsFocus);
    useStore.setState({ settingsFocus: null });
    if (entry === undefined) return;
    goToTab(entry.tab);
    reveal(t(entry.label), entry.row === undefined ? undefined : t(entry.row));
  }, [settingsFocus, form, goToTab, reveal]);

  // Esc closes — the picker first when it is open (capture phase, so the
  // editor never sees it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      // The theme picker is mounted on <body>, so its own capture listener was
      // registered LATER than this one and runs SECOND: without this line, Esc
      // in the picker closed the settings panel underneath it (and the picker
      // with it) instead of reverting the previewed theme.
      if (isThemePickerOpen()) return;
      // Same precedence, one level closer: an open select popover is a
      // transient surface INSIDE this panel, and its Esc means "put the value
      // back", not "close the settings". Its own listener is registered later
      // than this capture-phase one and would otherwise never run.
      if (isSelectOpen()) return;
      // The "close without saving?" dialog is on top: its Esc is "cancel",
      // and it must reach the dialog rather than be swallowed here.
      if (askingRef.current) return;
      e.stopPropagation();
      if (pickerRef.current !== null) {
        setPicker(null);
        return;
      }
      requestClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [requestClose, setPicker]);

  return (
    // The palette's overlay drops its panel at 18vh, which is right for a
    // 400px-tall list and wrong for a panel that wants the whole height.
    <div className="s-palette-overlay s-smodal-overlay" onMouseDown={requestClose}>
      <div
        ref={panelRef}
        className="s-bmodal s-smodal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="s-bmodal__head">
          {/* The panel's own name, and nothing else. It used to read
              "Site settings — settings.json", which named an implementation
              file in the title bar of a settings screen: it told a reader
              what the product writes rather than what the panel does, and it
              named a path without saying where that path is. Where the file
              lives is a FACT about the instance, so it moved to About, beside
              the vault and data directories.
              The id is what the dialog's aria-labelledby points at, so the
              panel's accessible name is this same line and not a second copy
              of it that could drift. */}
          <span className="s-bmodal__title" id={titleId}>
            {t("siteSettings")}
          </span>
          <button type="button" className="s-bmodal__close" onClick={requestClose} aria-label={t("close")}>
            ×
          </button>
        </div>

        {loadError && <div className="s-bmodal__empty">{loadError}</div>}
        {!loadError && (!form || !eff || !inh) && <div className="s-bmodal__empty">{t("loading")}</div>}

        {ctx && (
          <SettingsContext.Provider value={ctx}>
          <div className="s-smodal__cols">
            {/* Sections, not anchors: the rail switches what the panel is
                showing. The body scrolls on its own, and so does the rail
                when its names outgrow the column (settings.css explains the
                cut-off "About" that forced it). */}
            <div className="s-smodal__railwrap">
            {/* SEARCH SITS ABOVE THE RAIL, not inside the body: it searches
                every tab, so putting it in one of them would say it searched
                that one. */}
            <SettingsSearch
              inputRef={searchRef}
              tabName={pageName}
              onGo={(entry, label) => {
                goToTab(entry.tab);
                // After the tab has painted: find the row by the label it
                // stamped (settings/Row.tsx) — or, for a part not drawn right
                // now, the row it folds into.
                reveal(label, entry.row === undefined ? undefined : t(entry.row));
              }}
            />
            {/* A TWO-LEVEL RAIL (settings, round 2): four group headings,
                each with its pages under it, the open page lit. Navigation,
                not a tab list — eighteen pages in four groups is a table of
                contents, and a tablist may own nothing but tabs — so each
                page is a button marked `aria-current="page"` when it is the
                one showing, and the body is a region named by the page's own
                heading. ↑/↓ still walk every page across the groups, and
                Home/End jump to the ends. */}
            <nav className="s-smodal__rail s-scrollfade" ref={railRef} aria-label={t("settingsSections")} onKeyDown={onRailKey}>
              {GROUPS.map((g) => {
                const pages = visibleTabs.filter((s) => s.group === g.id);
                if (pages.length === 0) return null;
                return (
                  <div className="s-smodal__railgroup" key={g.id} role="group" aria-labelledby={`s-smodal-group-${g.id}`}>
                    <div className="s-smodal__railhead" id={`s-smodal-group-${g.id}`}>
                      {t(g.key)}
                    </div>
                    {pages.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        id={`s-smodal-tab-${s.id}`}
                        data-page={s.id}
                        aria-current={tab === s.id ? "page" : undefined}
                        aria-controls="s-smodal-panel"
                        tabIndex={tab === s.id ? 0 : -1}
                        className={`s-smodal__railbtn${tab === s.id ? " s-smodal__railbtn--on" : ""}`}
                        onClick={() => goToTab(s.id)}
                      >
                        {t(s.key)}
                      </button>
                    ))}
                  </div>
                );
              })}
            </nav>
            </div>

            <div className="s-smodal__scroll">
              <div
                // data-popbounds: every Select in this panel clamps its
                // popover to THIS box rather than to the dialog, so a long
                // list can no longer run over the footer divider and the
                // Close / Save row (Select.tsx `measure`).
                className="s-smodal__body s-scrollfade"
                data-popbounds
                ref={bodyRef}
                role="region"
                id="s-smodal-panel"
                aria-labelledby="s-smodal-pagehead"
                data-page={tab}
              >
                {/* Every page opens the same way: its name, then one sentence
                    saying what it decides. */}
                <h2 className="s-smodal__group s-smodal__tabhead" id="s-smodal-pagehead">
                  {pageName(tab)}
                </h2>
                <p className="s-smodal__note">{t(tabIntro(tab, pocket))}</p>
                <TabBody tab={tab} />
              </div>
            </div>
          </div>
          </SettingsContext.Provider>
        )}

        {/* THE SAVE BAR APPEARS ONLY WHEN THERE IS SOMETHING TO SAVE. It used
            to stand under every server tab with a disabled Save and a Close
            beside the header's ×, and to vanish on This device — a bar whose
            presence depended on which tab was open rather than on whether
            anything had changed. Now it rises when a form value changes, on
            any section (the edits survive a section switch), and goes when it
            is saved or discarded. Rows marked "This device" save on click and
            never raise it. */}
        {(dirty || saving) && (
          <div className="s-smodal__foot">
            {/* "Unsaved changes" / "Fix the marked fields" / "Saving…" is the
                panel's only status text — it has to be spoken, not just shown. */}
            <span className="s-smodal__dirty" role="status">
              {saving ? t(patch.fonts ? "fontFetching" : "saving") : t(valid ? "unsavedChanges" : "fixMarkedFields")}
            </span>
            <button type="button" className="s-btn" onClick={discard} disabled={saving}>
              {t("discardChanges")}
            </button>
            <button type="button" className="s-btn s-btn--accent" disabled={!dirty || !valid || saving} onClick={save}>
              {t("save")}
            </button>
          </div>
        )}

        {picker && (
          <ImagePicker
            title={t(
              picker === "favicon" ? "faviconImage" : picker === "logo" ? "logoImage" : "rowHomeBanner",
            )}
            onPick={(path) => {
              setForm((f) => (f ? { ...f, [picker]: path } : f));
              setPicker(null);
            }}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
    </div>
  );
}
