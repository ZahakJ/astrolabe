// THE SETTINGS FORM'S LIFE — loaded once, edited in place, saved as a patch.
//
// Everything the panel held between "open" and "close" that is not chrome:
// the settings as the server answered them, the form the reader is editing,
// the rules that judge it, the patch a Save would send, the uploaded faces,
// the live visibility preview, and the three verbs that write (Save and the
// two credential Clears). Lifted out of SettingsModal.tsx (3.27.0) so two
// hosts can hold one form: the desktop's dialog with its rail, and the phone
// shell's Settings screen, where each section is a pushed screen with its own
// Save and its own "discard your changes?" on Back. The tab bodies read it
// through ./context.ts and do not know which host they are in.
//
// Nothing here changed in the move: the same requests in the same order, the
// same toasts, the same refresh of /api/me after a save.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomFontInfo, SettingsResponse } from "../../../shared/types.ts";
import { deleteCustomFont, getSettings, listCustomFonts, patchSettings, uploadFont } from "../../api.ts";
import { loadPeriodic } from "../../daily.ts";
import { clearFontFaces } from "../../fontFaces.ts";
import { t, tf } from "../../i18n.ts";
import { browserDictionaries, SPELL_DICTS_EVENT, type Declarable } from "../../spellDicts.ts";
import { useStore } from "../../state.ts";
import { refreshTemplateSettings } from "../../templates.ts";
import { toast } from "../../toast.ts";
import { confirmModal } from "../Confirm.tsx";
import type { Segment } from "../controls/Fields.tsx";
import { SYSTEM_FONT } from "../FontPicker.tsx";
import { fontErrorText, useFontPreview } from "./CustomFonts.tsx";
import { buildPatch, formFrom, validate, type Form } from "./form.ts";
import { SYNC_INTERVALS } from "./tabs.ts";
import { useVisibility } from "./Visibility.tsx";

export type ImageSlot = "favicon" | "logo" | "homeBanner";

export function useSettingsForm() {
  /** THIS VAULT IS A CLONE ON A PHONE (/api/me `pocket`). It decides which
   *  tabs exist, which rows are locked, and which Backup & sync tab is drawn
   *  — see `visibleTabs` in the hosts and ./TabBody.tsx. */
  const pocket = useStore((s) => s.pocket);

  const [loaded, setLoaded] = useState<SettingsResponse | null>(null);
  const [initial, setInitial] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picker, setPicker] = useState<ImageSlot | null>(null);

  /** The operator's uploaded faces. Its own request rather than a field on
   *  the settings payload: it changes on upload and delete, several times per
   *  visit to the Typography tab, while the settings payload does not. */
  const [customFonts, setCustomFonts] = useState<CustomFontInfo[]>([]);
  const [fontBusy, setFontBusy] = useState(false);
  // The browser's declared dictionaries (client/spellDicts.ts): device-local,
  // drawn under Language & dates because that is where a person looks for a
  // language, and hidden on the desktop, which asks Electron itself.
  const [dicts, setDicts] = useState<Declarable[]>(() => browserDictionaries());
  useEffect(() => {
    const on = (): void => setDicts(browserDictionaries());
    window.addEventListener(SPELL_DICTS_EVENT, on);
    return () => window.removeEventListener(SPELL_DICTS_EVENT, on);
  }, []);

  useEffect(() => {
    let disposed = false;
    getSettings()
      .then((s) => {
        if (disposed) return;
        const f = formFrom(s);
        setLoaded(s);
        setInitial(f);
        setForm(f);
      })
      .catch((err: unknown) => {
        console.error("astrolabe: loading settings failed", err);
        if (!disposed) setLoadError(err instanceof Error ? err.message : t("settingsLoadFailed"));
      });
    return () => {
      disposed = true;
    };
  }, []);

  useFontPreview(
    form?.fontProse ?? SYSTEM_FONT,
    form?.fontUi ?? SYSTEM_FONT,
    form?.fontMono ?? SYSTEM_FONT,
    form?.fontArabic ?? SYSTEM_FONT,
    form?.fontSizeAdjust ?? "",
  );

  const reloadCustomFonts = useCallback(() => {
    listCustomFonts()
      .then(setCustomFonts)
      // A vault with no uploads answers [], so a failure here is a real one —
      // and still not worth a toast on open: the section renders empty and
      // the upload path reports its own errors.
      .catch((err: unknown) => console.error("astrolabe: listing uploaded fonts failed", err));
  }, []);

  useEffect(() => reloadCustomFonts(), [reloadCustomFonts]);

  /** The preview faces are a menu's worth of families; they must not outlive
   *  the panel that draws the menu. */
  useEffect(() => () => clearFontFaces(), []);

  const uploadCustomFont = useCallback(
    (file: File) => {
      if (fontBusy) return;
      setFontBusy(true);
      uploadFont(file)
        .then((font) => {
          reloadCustomFonts();
          toast(tf("fontAdded", { name: font.family }));
        })
        .catch((err: unknown) => {
          console.error("astrolabe: font upload failed", err);
          toast(fontErrorText(err, "fontUploadFailed"), "error");
        })
        .finally(() => setFontBusy(false));
    },
    [fontBusy, reloadCustomFonts],
  );

  const removeCustomFont = useCallback(
    (font: CustomFontInfo) => {
      void (async () => {
        const ok = await confirmModal({
          title: tf("fontDeleteTitle", { name: font.family }),
          body: t("fontDeleteBody"),
          confirmLabel: t("remove"),
        });
        if (!ok) return;
        setFontBusy(true);
        try {
          await deleteCustomFont(font.file);
          reloadCustomFonts();
          toast(t("fontRemoved"));
        } catch (err) {
          console.error("astrolabe: font delete failed", err);
          toast(fontErrorText(err, "fontRemoveFailed"), "error");
        } finally {
          setFontBusy(false);
        }
      })();
    },
    [reloadCustomFonts],
  );

  const errors = useMemo(() => (form ? validate(form) : {}), [form]);
  const patch = useMemo(() => (form && initial ? buildPatch(initial, form) : {}), [form, initial]);
  const dirty = Object.keys(patch).length > 0;
  /** Read by listeners registered once (the dialog's Escape, the phone's
   *  Back guard), so they see the form as it is NOW. */
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const valid = Object.keys(errors).length === 0;

  /** One helper for every control in the panel, because every control in the
   *  panel now speaks the same language: a string in, a string out. (The old
   *  one spread a native ChangeEvent handler, which is what tied these rows to
   *  <select> and <input> in the first place.) */
  const field = <K extends keyof Form>(key: K) => ({
    value: form ? form[key] : "",
    onChange: (value: string) => setForm((f) => (f ? { ...f, [key]: value } : f)),
  });

  /** The mode a segment's "inherit" note prints. Not enumLabel(): these four
   *  values have names in the panel's own language, and "follow" in particular
   *  is meaningless as a raw id to the person reading it. */
  const langFilterLabel = (mode: string): string => {
    if (mode === "follow") return t("langFilterFollow");
    if (mode === "ar") return t("langFilterAr");
    if (mode === "en") return t("langFilterEn");
    return t("langFilterOff");
  };

  /** A three-way row: inherit the env default, or force on / off. The middle
   *  state is the ROW BEING EMPTY, which is why it is a segment rather than a
   *  checkbox — a checkbox cannot be "not set". */
  const onOffSegments = (envValue: boolean): Segment[] => [
    { value: "", label: t("inheritSegment"), note: envValue ? t("on") : t("off") },
    { value: "on", label: t("on") },
    { value: "off", label: t("off") },
  ];

  const save = useCallback(() => {
    if (!form || !initial || saving) return;
    const body = buildPatch(initial, form);
    if (Object.keys(body).length === 0) return;
    setSaving(true);
    patchSettings(body)
      .then(async (s) => {
        const f = formFrom(s);
        setLoaded(s);
        setInitial(f);
        setForm(f);
        // The template commands cache the folder and the default template
        // (they open on a keystroke and must not wait on a round trip); this
        // save may have just moved either one.
        refreshTemplateSettings();
        // The periodic-note cache (client/daily.ts) re-reads through that
        // fresh fetch, so the sidebar's month and the status bar's crumb
        // follow a moved daily folder or a renamed format without a reload.
        void loadPeriodic();
        // Everything the shell renders from /api/me follows live: wordmark,
        // logo, layout, theme default, favicon link.
        await useStore.getState().loadMe();
        toast(t("settingsSaved"));
      })
      .catch((err: unknown) => {
        console.error("astrolabe: saving settings failed", err);
        // A typography save is the one that can fail on the NETWORK (the
        // faces are fetched before the file is written), so its fallback
        // message says so — and settings.json is untouched either way.
        toast(err instanceof Error ? err.message : t(body.fonts ? "fontsFetchFailed" : "settingsSaveFailed"));
      })
      .finally(() => setSaving(false));
  }, [form, initial, saving]);

  /** Put the form back to what the server last answered: the phone's
   *  "discard" when a section is left with edits in it. */
  const discard = useCallback(() => setForm(initial), [initial]);

  /** Clearing a credential is not a form edit: it takes effect at once, on its
   *  own, so a reader who wants the token off the disk never has to find the
   *  Save button afterwards. */
  const clearToken = useCallback(() => {
    if (saving) return;
    setSaving(true);
    patchSettings({ gitToken: null })
      .then((s) => {
        const f = formFrom(s);
        setLoaded(s);
        setInitial(f);
        // Unsaved edits elsewhere in the panel survive; only the token field
        // resets (there is nothing left to replace).
        setForm((prev) => (prev ? { ...prev, syncToken: "" } : f));
        toast(t("tokenCleared"));
      })
      .catch((err: unknown) => {
        console.error("astrolabe: clearing the git token failed", err);
        toast(err instanceof Error ? err.message : t("settingsSaveFailed"));
      })
      .finally(() => setSaving(false));
  }, [saving]);

  /** The Anthropic key's Clear: the git token's, for the same reason. */
  const clearAskKey = useCallback(() => {
    if (saving) return;
    setSaving(true);
    patchSettings({ anthropicKey: null })
      .then((s) => {
        const f = formFrom(s);
        setLoaded(s);
        setInitial(f);
        setForm((prev) => (prev ? { ...prev, askKey: "" } : f));
        toast(t("askKeyCleared"));
      })
      .catch((err: unknown) => {
        console.error("astrolabe: clearing the Anthropic key failed", err);
        toast(t("settingsSaveFailed"));
      })
      .finally(() => setSaving(false));
  }, [saving]);

  const eff = loaded?.effective;
  /** What each empty field WOULD resolve to — never `eff`, which is the stored
   *  value whenever one is stored. Every "Inherit" note and every "if this is
   *  left empty…" consequence below reads this one; a panel that predicted an
   *  empty language field with the language it currently held told the owner
   *  of an Arabic site that clearing it would keep it Arabic. */
  const inh = loaded?.inherited;
  // The live consequence preview, shared by every row that can shrink the
  // public site (language filter, excluded tags, home note) and by both tabs'
  // standing summary. One request per settled edit, for all of them.
  const impact = useVisibility(form);
  /** The master switch is off: every control below it in Backup & sync is
   *  inert, and says so. */
  const syncOff = form?.syncEnabled !== "on";
  /** The public-folders master switch is off: the table and the two placement
   *  toggles are inert, and say so. Read from the FORM like `syncOff`, so
   *  flipping the master lights the section up before the save. */
  const foldersOff = form?.publicFoldersOn !== "on" && form?.topicsMode !== "folders";
  const libraryOff = form?.libraryOn !== "on";
  /** settings.home.mode and the home banner are read by the BLOG shell only —
   *  server/auth.ts sends `me.home` inside `if (publicLayout() === "blog")`,
   *  and BlogDashboard mounts from BlogShell. PUBLIC_LAYOUT defaults to "app",
   *  where both were offered live, with no note and no disabled state: an
   *  operator picked Dashboard, uploaded a hero, got a success toast, and the
   *  site did not change. Read from the FORM (like syncOff) so switching
   *  Public layout to blog lights them up in the same breath, before the save.
   *  The Home NOTE row between them stays live on purpose — the app shell
   *  opens it at boot. */
  // The home rows are live in BOTH public shells: a designed site has a home
  // page too, and it is composed from the same settings the blog's is.
  const homeLayout = form?.publicLayout || eff?.publicLayout;
  const homeOff = homeLayout !== "blog" && homeLayout !== "designed";
  /** The sync fields hold unsaved edits, so the two actions must wait for the
   *  save rather than act on a remote the form no longer shows. */
  const syncStale = patch.gitSync !== undefined || patch.gitToken !== undefined || patch.gitUser !== undefined;
  /** A value hand-written into settings.json outside the offered set still
   *  gets an option, so opening the panel can never silently change it. */
  const intervalChoices = useMemo(() => {
    const stored = Number(form?.syncInterval ?? "0");
    const all = Number.isInteger(stored) && stored >= 0 && !SYNC_INTERVALS.includes(stored) ? [...SYNC_INTERVALS, stored] : SYNC_INTERVALS;
    return [...all].sort((a, b) => a - b);
  }, [form?.syncInterval]);

  return {
    pocket,
    loaded,
    loadError,
    initial,
    form,
    setForm,
    saving,
    picker,
    setPicker,
    customFonts,
    fontBusy,
    uploadCustomFont,
    removeCustomFont,
    errors,
    patch,
    dirty,
    dirtyRef,
    valid,
    field,
    langFilterLabel,
    onOffSegments,
    save,
    discard,
    clearToken,
    clearAskKey,
    eff,
    inh,
    impact,
    syncOff,
    foldersOff,
    libraryOff,
    homeLayout,
    homeOff,
    syncStale,
    intervalChoices,
    dicts,
  };
}

export type SettingsFormState = ReturnType<typeof useSettingsForm>;
