// The session: boot, /api/me, sign-in and sign-out, the visitor preview,
// publishing, the banner and a single property. Moved out of client/state.ts
// unchanged.

import { DEFAULT_DATE_CALENDAR, isDateCalendar, type DateCalendar } from "../../shared/dates.ts";
import { DEFAULT_LAUNCH, parseLaunch } from "../../shared/launch.ts";
import { DEFAULT_TEXT_ALIGN, DEFAULT_TEXT_DIRECTION, isTextAlign, isTextDirection, type TextAlign, type TextDirection } from "../../shared/textLayout.ts";
import { t, tf, type Lang } from "../i18n.ts";
import { NO_FOLDER_ICONS, NO_PUBLIC_FOLDERS, effectiveSide, guarded, noteTitle, waitForClean } from "./helpers.ts";
import type { State } from "./types.ts";
import type { StoreCtx, StoreGet, StoreSet } from "./sliceTypes.ts";
import { THEMES } from "../themes.ts";
import { THEME_KEY, themeKey } from "./persistence.ts";
import { emptyWorkspace, openInPane, pruneWorkspace, type Workspace } from "../workspace.ts";
import { actionToast } from "../undoToast.ts";
import * as api from "../api.ts";
import { applyLanguage, applyTheme, ensureCustomCss, ensureFavicon, ensureSiteFonts } from "./dom.ts";
import { chromeLang, readEditorLang, readVisitorLang } from "../langPref.ts";
import { clearBrokenEmbeds } from "../editor/embeds.ts";
import { collectNotes } from "../editor/links.ts";
import { desktop } from "../desktop/bridge.ts";
import { isKnownThemeChoice, syncCustomThemes } from "../design/customThemes.ts";
import { isPublishedContent } from "../publish.ts";
import { loadTagLabels } from "../tagLabels.ts";
import { markSelfWrite, mirrorOf } from "../state.ts";
import { mirrorTheme, noteMirrored } from "./themeMirror.ts";
import { setDateBothStyle, setDateCalendar } from "../dates.ts";
import { setSiteTextLayout } from "../textLayout.ts";
import { toast } from "../toast.ts";

let launchSyncAsked = false;

// The admin's tabs, parked while previewing; restored on exit (with the note
// the preview ended on kept open, per "exit returns to the same note").
/** The whole WORKSPACE the admin was in when preview started, not a tab list.
 *  Preview is a round trip through a smaller vault, and what has to come back
 *  afterwards is the layout as well as the notes — a reader who split a pane
 *  and then looked at their site as a visitor should not find the split gone. */
/** The reader language the preview borrowed (see setPreviewVisitor), and
 *  the one to put back on exit. */
let newBuildNoticed = false;
function noticeNewBuild(serverVersion: unknown): void {
  const mine = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";
  if (newBuildNoticed || mine === "" || typeof serverVersion !== "string" || serverVersion === mine) return;
  newBuildNoticed = true;
  actionToast(tf("newBuildOnServer", { version: serverVersion }), t("crashReload"), () => location.reload());
}

let previewLangBefore: string | null = null;
let previewLangFlipped: string | null = null;
let previewSnapshot: Workspace | null = null;

/** Boot, /api/me, sign-in and out, the visitor preview, publishing, the banner and a property. */
export function sessionSlice(set: StoreSet, get: StoreGet, ctx: StoreCtx) {
  const { enterVault } = ctx;
  return {
    bootstrap: async () => {
      await get().loadMe();
      const { admin, publicReads } = get();
      if (!admin && !publicReads) {
        // Locked vault: nothing is readable until sign-in.
        set({ authReady: true, loginOpen: true });
        return;
      }
      await enterVault();
      set({ authReady: true });
      void get().loadPublished();
    },

    loadMe: async () => {
      try {
        // DECLARE THE VISITOR'S LANGUAGE BEFORE THE FIRST /api/me, not after
        // it. The header was set from the RESOLVED language further down, so
        // the boot request went out with none and the server scoped it to the
        // site language: on an Arabic site a visitor who had switched to
        // English refreshed and the library door vanished, because /api/me
        // answers "is there a lesson this session may read" under the
        // language it was asked in. The stored choice is what the resolved
        // language will be for a visitor anyway; the server ignores the
        // header for an admin and while the toggle is off, and the resolved
        // value below overwrites this in every case.
        if (!api.hasReaderLang()) api.setReaderLang(readVisitorLang());
        let me = await api.getMe();
        // THE DESKTOP OWNS THIS SESSION. A window that finds itself signed
        // out of a vault whose password the app minted at launch asks main
        // to sign in again rather than showing a modal for a password nobody
        // can type (the owner: "cannot sign in with my password… at least on
        // the app"). One attempt per load; a restore that fails leaves the
        // visitor view, which is at least honest.
        if (!me.admin && get().desktopOwnsSession && (await desktop()?.sessionRestore?.()) === true) {
          me = await api.getMe();
        }
        // A WINDOW OPENED: the server runs a sync pass when one is due
        // (Backup & sync enabled with a remote; not within five minutes of
        // the last). Once per load, admins only, every answer ignored — an
        // open local vault says 403 by design and the status panel says the
        // rest.
        if (me.admin && !launchSyncAsked) {
          launchSyncAsked = true;
          void api.syncLaunch().catch(() => {});
        }
        // THE SERVER MAY HAVE MOVED ON. A tab that outlived a deploy still
        // runs the old build and asks for on-demand chunks by names the
        // server no longer has; the first symptom the owner saw was "Failed
        // to open <note>". So every /api/me compares the server's version
        // with this build's, and says "reload" once, plainly.
        // ADMINS ONLY. This is a maintenance line — "the server moved on,
        // reload" — and it was going to every visitor, on a page they have no
        // stake in and often cannot fix by reloading (the owner: "we shouldn't
        // print that to visitors"). The reason it exists is the admin's own
        // long-lived tab asking for chunks a deploy has replaced.
        if (me.admin) noticeNewBuild(me.version);
        // A preview flag the server did NOT honor (me.preview absent) means
        // the admin session is gone — we are a real visitor now, so drop the
        // flag rather than showing a lying "previewing" banner.
        if (get().previewVisitor && me.preview !== true) {
          api.setPreviewVisitor(false);
          set({ previewVisitor: false });
        }
        const siteLang: Lang = me.language === "ar" ? "ar" : "en";
        // Whose preference this session reads, resolved in ONE place
        // (langPref.ts::chromeLang) because the two of them are easy to get
        // wrong in each other's favour: an admin reads their own editor
        // language, a visitor their own — and only while the instance offers
        // the switch, so turning settings.languageToggle back off restores
        // the site language for everyone, stored preference or not. `me.admin`
        // is false while previewing as a visitor, which is exactly what makes
        // the preview honest.
        const languageToggle = me.languageToggle === true;
        const obsidianVault = me.obsidianVault === true;
        const language: Lang = chromeLang({
          admin: me.admin,
          languageToggle,
          siteLang,
          editor: readEditorLang(),
          visitor: readVisitorLang(),
        });
        // Declare it on every call from here on. Set even when the filter is
        // off: the server ignores it then, and the alternative is a mode-
        // dependent branch on the client that would be wrong for exactly one
        // request each time the mode changed.
        api.setReaderLang(language);
        const locale = me.blogLocale?.trim() || "en";
        // The calendar and the note-layout pair are pushed into their plain
        // modules BEFORE the store commit, exactly as applyLanguage pushes the
        // dictionary: a component re-rendering off `dateCalendar` must already
        // see siteDate() answering in the new calendar, or the first paint
        // after a settings save shows the old one.
        const calendar: DateCalendar = isDateCalendar(me.dateCalendar) ? me.dateCalendar : DEFAULT_DATE_CALENDAR;
        const noteDir: TextDirection = isTextDirection(me.textDirection) ? me.textDirection : DEFAULT_TEXT_DIRECTION;
        const noteAlign: TextAlign = isTextAlign(me.textAlign) ? me.textAlign : DEFAULT_TEXT_ALIGN;
        // Taken as sent, not re-validated. Both ends of a bad row are already
        // inert: an unknown glyph draws NOTHING (FolderGlyph.tsx), and a key
        // that is not a folder path matches no row in the tree. Re-checking it
        // here would cost the entry bundle the whole glyph module (see the
        // type-only import at the top of this file) to defend against a state
        // that has no symptom. The empty case shares one object — see
        // NO_FOLDER_ICONS.
        const icons =
          me.folderIcons && Object.keys(me.folderIcons).length > 0
            ? me.folderIcons
            : NO_FOLDER_ICONS;
        setDateCalendar(calendar);
        setDateBothStyle(me.dateOrder, me.dateSeparator);
        setSiteTextLayout(noteDir, noteAlign);
        applyLanguage(language, locale); // before set(): re-renders already see t() in the new language
        // "auto" is re-evaluated on EVERY language change, not only on a
        // fresh install: switching the instance to Arabic moves the notes
        // sidebar to the right edge, switching back moves it home. An
        // explicit "left"/"right" pin outranks the language and never moves.
        set({ sidebarSide: effectiveSide(get().sidebarSidePref, language) });
        set({
          languageToggle,
          obsidianVault,
          languageFilter: me.languageFilter ?? "off",
          languageFallback: me.languageFallback === "ar" || me.languageFallback === "en" ? me.languageFallback : null,
          visibility: me.visibility ?? null,
          commentsEnabled: me.comments === true,
          admin: me.admin,
          pocket: me.pocket === true,
          publicReads: me.public,
          authProtected: me.protected ?? false,
          homeNote: me.homeNote ?? null,
          launch: parseLaunch(me.launch) ?? DEFAULT_LAUNCH,
          authorSites: me.authorSites ?? [],
          // One shared empty array when the feature is off (the overwhelming
          // majority), for the reason NO_FOLDER_ICONS gives one line up: the
          // blog band and the nav row both read this on every render and a
          // fresh `[]` per loadMe would re-run their memos for nothing.
          publicFolders: me.publicFolders?.length ? me.publicFolders : NO_PUBLIC_FOLDERS,
          publicFoldersHome: me.publicFoldersHome === true,
          publicFoldersNav: me.publicFoldersNav === true,
          topicsMode: me.topics === "folders" ? "folders" : "tags",
          library: me.library ?? null,
          publishedCounts: me.published ?? null,
          siteName: me.siteName?.trim() || "Astrolabe",
          language,
          siteLanguage: siteLang,
          publicLayout:
            me.publicLayout === "blog" || me.publicLayout === "designed" ? me.publicLayout : "app",
          designNotice: me.designNotice ?? null,
          tagline: me.tagline?.trim() || null,
          shareButtons: me.shareButtons === true,
          ambient: me.ambient === true,
          footerLine: me.footer?.trim() || null,
          blogLocale: locale,
          bannerFallback: me.bannerFallback === "none" ? "none" : "generated",
          home: me.home ?? null,
          logo: me.logo ?? null,
          dateCalendar: calendar,
          textDirection: noteDir,
          textAlign: noteAlign,
          emptyPropsCard: me.emptyPropsCard !== false,
          folderIcons: icons,
          attachmentFolder: me.attachmentFolder ?? null,
          drawingsFolder: me.drawingsFolder ?? "",
        });
        // The tag-label map is scoped by session (a visitor is told about
        // visible tags only), so it is refetched on every /api/me — which is
        // also every sign-in, sign-out and preview toggle. Failures are silent:
        // an unlabelled chip renders its canonical tag, which is correct.
        void loadTagLabels();
        // Custom themes: link (or drop) the generated override stylesheet and
        // refresh the registry when its signature moved. Awaited because
        // everything under it — the stored choice, DEFAULT_THEME — is only
        // answerable once the registry knows which custom themes exist.
        await syncCustomThemes(typeof me.customThemes === "string" ? me.customThemes : null);
        // A stored `custom:` choice whose theme is gone (deleted on another
        // device, or on an instance whose designs.json was replaced) falls
        // back to the site default rather than painting its base and claiming
        // to be something else. Boot accepted it on SHAPE; this is where it
        // meets the registry.
        // THE KEY IN FORCE FOR THIS SURFACE (themeKey): the editor's in the
        // app, the public site's in a visitor shell and in preview. loadMe
        // runs on the way into and out of preview, which is what makes one
        // block serve both: entering, the site key is empty and the design's
        // theme applies; leaving, the editor key holds the owner's own room
        // and it comes back — where before the design's theme followed them
        // out into the editor.
        const key = themeKey();
        const stored = localStorage.getItem(key);
        if (stored !== null && !isKnownThemeChoice(stored)) {
          localStorage.removeItem(key);
          const fallback = isKnownThemeChoice(me.defaultTheme) ? me.defaultTheme : THEMES[0];
          applyTheme(fallback);
          set({ theme: fallback });
        } else if (stored !== null && stored !== get().theme) {
          applyTheme(stored);
          set({ theme: stored });
        }
        // The site's default theme applies only while this reader has made no
        // explicit choice (nothing in localStorage) — and is deliberately NOT
        // persisted, so a changed server default keeps reaching them. The
        // server has already resolved WHICH theme that is (a pinned
        // defaultTheme, or the admin's own editor theme when the instance is
        // following it); the client only obeys the precedence: a stored
        // visitor choice always wins. It may name a custom theme, which is the
        // whole "selectable everywhere a built-in is" promise reaching its
        // last surface.
        if (
          !localStorage.getItem(key) &&
          isKnownThemeChoice(me.defaultTheme) &&
          me.defaultTheme !== get().theme
        ) {
          applyTheme(me.defaultTheme);
          set({ theme: me.defaultTheme });
        } else if (isKnownThemeChoice(get().theme)) {
          // The registry may have arrived AFTER boot painted the base alone —
          // re-apply so a custom theme's overrides land without a reload.
          applyTheme(get().theme);
        }
        // Admin sessions also learn WHY, so the chrome can say it out loud.
        // (Visitors — and an admin previewing as one — get null: there is
        // nothing to explain to a reader about the owner's own theme.)
        set({ publicTheme: me.publicTheme ?? null });
        // The server's copy of this browser's theme, as of this load: it is
        // what a follow-mode instance is serving, so an unchanged pick later
        // costs no request at all.
        noteMirrored(me.publicTheme?.mode === "follow" ? me.defaultTheme ?? null : null);
        // First run: the instance is following a theme nobody has ever told
        // it. If this admin has actually PICKED one (it is in their
        // localStorage, not merely the built-in default), tell it now instead
        // of leaving the public site on iron-gall until their next pick.
        // Deliberately narrow — an instance that already has a mirrored value
        // is not overwritten just because a second browser opened the app.
        if (me.publicTheme?.mode === "follow" && !me.defaultTheme && localStorage.getItem(THEME_KEY)) {
          mirrorTheme(get().theme);
        }
        // Fonts before custom.css: ensureSiteFonts inserts itself ahead of the
        // custom.css link, and on first load that link does not exist yet.
        ensureSiteFonts(typeof me.fonts === "string" && me.fonts !== "" ? me.fonts : null);
        ensureCustomCss(me.customCss === true, me.customCssVersion ?? "");
        ensureFavicon(me.favicon === true);
      } catch (err) {
        // Server unreachable/old — behave like open local mode.
        console.error("astrolabe: fetching /api/me failed", err);
        set({ admin: true, publicReads: true, authProtected: false });
      }
    },

    login: async (password) => {
      await api.login(password); // throws with server message on 401/429
      await get().loadMe();
      set({ loginOpen: false });
      // The tree we hold is the visitor's flat published view (or nothing,
      // when the vault was locked) — refetch as admin either way.
      await get().loadTree();
      if (get().openTabs.length === 0) await enterVault();
      void get().loadPublished();
    },

    logout: () =>
      guarded("signing out", async () => {
        await api.logout();
        await get().loadMe();
        set({ publishedPaths: null, twins: {}, publishedFilter: false, openPublished: null, moderationOpen: false, trashOpen: false, unusedOpen: false });
        const { admin, publicReads } = get();
        if (!admin && !publicReads) {
          // Vault is locked again for this session — drop everything readable.
          set({ tree: null, ...mirrorOf(emptyWorkspace()), backlinks: [], view: "editor" });
          return;
        }
        // Back to the visitor's curated view: refetch the (flat) tree and
        // drop tabs pointing at notes that are not published.
        await get().loadTree();
        const visible = new Set(collectNotes(get().tree).map((n) => n.path));
        set((s) => mirrorOf(pruneWorkspace(s.workspace, visible)));
        void get().refreshBacklinks();
      }),

    setLoginOpen: (loginOpen) => set({ loginOpen }),

    setModerationOpen: (moderationOpen) => set({ moderationOpen }),

    setTrashOpen: (trashOpen) => set({ trashOpen }),
    openImport: (folder = "") => set({ importFolder: folder, paletteOpen: false }),
    closeImport: () => set({ importFolder: null }),

    setUnusedOpen: (unusedOpen) => set({ unusedOpen }),

    setPreviewVisitor: (on) =>
      guarded("toggling visitor preview", async () => {
        if (on === get().previewVisitor) return;
        if (on && !get().admin) return; // admin-only affordance
        // A PRIVATE VAULT HAS NO VISITOR TO BE. With PUBLIC=false (the desktop
        // app's way of running a vault) the visitor branch answers 401 to
        // everything, and the preview used to walk into it anyway: the tree
        // failed, the note "failed to open", and the owner read it as a bug in
        // the note. Say what a stranger would meet, and stay put.
        if (on && !get().publicReads) {
          toast(t("previewPrivateVault"), "info", { keep: true });
          return;
        }
        // Let a pending autosave land first — the Editor unmounts on entry.
        const before = get().openPath;
        if (before && get().dirty[before]) await waitForClean(before, 2000);
        api.setPreviewVisitor(on);
        // Attachment resolution is scope-dependent; never reuse across modes.
        clearBrokenEmbeds();
        if (on) {
          previewSnapshot = get().workspace;
          // THE TABS LEAVE BEFORE THE HEADER GOES ON. The scoping below cannot
          // run until loadTree() answers, and in the meantime every pane
          // refetches ITS OWN note with the visitor header on — the server
          // correctly 404s an unpublished one, and preview opened by
          // announcing "cannot access <note>" about a site that is fine. The
          // pre-pane code nulled `openPath` here for exactly this reason, and
          // panes made that guard DEAD: a pane renders from the workspace, so
          // the write desynced the mirror and unmounted nothing (the owner
          // met this within a day). The pane-shaped guard prunes the
          // WORKSPACE, optimistically, against the published set the store
          // already holds — the authoritative prune against the visitor tree
          // still runs below, and the snapshot above restores everything on
          // the way out.
          set((s) => ({
            ...s,
            ...mirrorOf(pruneWorkspace(s.workspace, s.publishedPaths ?? new Set())),
            previewVisitor: true,
            paletteOpen: false,
            moderationOpen: false,
            // The trash browser is an admin surface over deleted vault paths;
            // it must not survive into a visitor preview.
            trashOpen: false,
            importFolder: null,
            unusedOpen: false,
          }));
          // Tree BEFORE me: the shell swap (admin flips false on loadMe) must
          // find the visitor tree already in place, or the blog router would
          // transiently resolve routes against the full admin tree.
          await get().loadTree(); // the flat published tree (header is on)
          await get().loadMe(); // now visitor-shaped (admin: false, preview)
          // Visitor scoping of the session: tabs pointing at unpublished
          // notes disappear, exactly as they do on logout.
          let visible = new Set(collectNotes(get().tree).map((n) => n.path));
          // THE NOTE YOU ARE ON IS THE ONE YOU MEANT TO PREVIEW. Under the
          // language filter's "follow", the preview is scoped to the reader
          // language this browser declares — the owner's English editor — so
          // an Arabic note he had just published vanished from the tab bar
          // and the home note took its place ("it keeps opening to that").
          // When the note is published and the other language can see it,
          // the preview switches to that reader for its duration and says so;
          // what he sees is then exactly what an Arabic reader sees.
          previewLangBefore = api.getReaderLang();
          previewLangFlipped = null;
          if (before !== null && !visible.has(before) && (get().publishedPaths?.has(before) ?? false)) {
            // With no reader language declared, the server picks one of its
            // own (the site language, or none at all), and guessing which
            // sent the flip the wrong way: an English editor on an Arabic
            // site tried "en" for an Arabic note and gave up. So both
            // languages are tried, the likelier one first.
            const current = previewLangBefore ?? get().language;
            const tries = current === "ar" ? ["en", "ar"] : ["ar", "en"];
            let found: string | null = null;
            for (const candidate of tries) {
              api.setReaderLang(candidate);
              await get().loadTree();
              const again = new Set(collectNotes(get().tree).map((n) => n.path));
              if (again.has(before)) {
                visible = again;
                found = candidate;
                break;
              }
            }
            if (found !== null) {
              previewLangFlipped = found;
              await get().loadMe();
            } else {
              api.setReaderLang(previewLangBefore);
              await get().loadTree();
            }
          }
          set((s) => ({
            ...mirrorOf(
              before !== null && visible.has(before)
                ? openInPane(pruneWorkspace(s.workspace, visible), s.workspace.focus, before)
                : pruneWorkspace(s.workspace, visible),
            ),
            view: "editor" as const,
          }));
          // And SAY why the note went away. Silence here is the same bug in
          // the other direction: the tab vanishes, the pane reads "The vault
          // is open", and nothing connects either to the eye button.
          if (previewLangFlipped !== null) {
            toast(t(previewLangFlipped === "ar" ? "previewAsArabicReader" : "previewAsEnglishReader"), "info", { keep: true });
          }
          if (before && !visible.has(before)) {
            // Two reasons a note is not in the visitor tree, and they call for
            // different fixes: publish it, or look at the language filter /
            // excluded tags. "Not published" on a note that IS published sent
            // the owner hunting for a flag that was already on.
            const published = get().publishedPaths?.has(before) ?? false;
            // `keep`: the tab bar changes a frame after this mounts, and the
            // openPath effect would otherwise dismiss the explanation unread.
            toast(tf(published ? "previewHiddenNamed" : "previewNotPublishedNamed", { path: noteTitle(before) }), "info", {
              keep: true,
            });
          }
          void get().refreshBacklinks();
        } else {
          const current = get().openPath; // exit lands on the same note
          set({ previewVisitor: false, paletteOpen: false });
          // The reader language the preview borrowed goes back.
          if (previewLangFlipped !== null) {
            api.setReaderLang(previewLangBefore);
            previewLangFlipped = null;
          }
          // Same ordering on the way out: full tree first, then the admin
          // shell mounts against it.
          await get().loadTree();
          await get().loadMe();
          const snap = previewSnapshot;
          previewSnapshot = null;
          set((s) => {
            // The layout the admin left, plus wherever preview ended up: a
            // reader who followed a link while previewing means to keep it.
            const base = snap ?? s.workspace;
            return {
              ...mirrorOf(current === null ? base : openInPane(base, base.focus, current)),
              view: "editor" as const,
            };
          });
          void get().refreshBacklinks();
          void get().loadPublished();
        }
      }),

    loadPublished: async () => {
      if (!get().admin) return;
      // Counts always refresh (cheap, drives the "N published" segment).
      try {
        const me = await api.getMe();
        set({ publishedCounts: me.published ?? null });
      } catch {
        // keep last known counts
      }
      // The path set comes from GET /api/published — an ADMIN route. It used
      // to ride on the VISITOR view of /api/tree, which made publish state
      // conditional on `authProtected && publicReads`: on an open local vault
      // and on every PUBLIC=false instance the stars and the published filter
      // silently did not exist, and where it did exist it arrived
      // language-filtered. Both are gone: publish is a fact about a note, and
      // the owner sees it wherever they are signed in.
      try {
        const publishedPaths = await api.getPublishedPaths();
        set({ publishedPaths });
      } catch (err) {
        console.error("astrolabe: loading published set failed", err);
      }
    },

    togglePublish: (path, publish) =>
      guarded("toggling publish", async () => {
        // If the note is open with unsaved edits, let the autosave land first
        // so the server-side frontmatter edit isn't clobbered by a stale
        // editor buffer (and vice versa).
        if (get().dirty[path]) await waitForClean(path, 2000);
        const current =
          get().openPath === path && get().openPublished !== null
            ? get().openPublished!
            : isPublishedContent((await api.getNote(path)).content);
        const next = publish ?? !current;
        markSelfWrite(path); // the SSE echo arrives before the response
        const result = await api.publishNote(path, next);
        const before = get().publishedPaths;
        const publishedPaths = before === null ? null : new Set(before);
        if (publishedPaths !== null) {
          if (result.published) publishedPaths.add(result.path);
          else publishedPaths.delete(result.path);
        }
        const live = publishedPaths === null ? null : publishedPaths.size;
        set((s) => ({
          publishedPaths,
          openPublished: s.openPath === result.path ? result.published : s.openPublished,
        }));
        void get().loadPublished();
        // The note's bytes changed on disk: refresh the open editor/reading
        // pane so its buffer carries the new frontmatter.
        if (get().openPath === result.path) get().bumpReload();
        if (!result.published) {
          toast(t("unpublishedToast"));
          return;
        }
        // THE PROUDEST MOMENT IN THE PRODUCT, and until now it was four words
        // that faded (v1.8 UX audit F22). Publishing is the one action whose
        // result the author cannot see from where they are standing — it
        // happens on a site they are not looking at — so the message carries
        // the door to it. And the FIRST one is not the same event as the
        // ninetieth: an instance whose published set has exactly one note in
        // it just became a public site, and says so.
        //
        // The count comes from the set this call just updated, not from the
        // refreshed counters above: `loadPublished()` is two requests away and
        // the sentence has to be right in this frame. A vault whose published
        // set never loaded (`null`) gets the ordinary line — over-claiming a
        // first publish is the worse of the two mistakes.
        actionToast(
          live === 1 ? t("publishedFirstToast") : t("publishedToast"),
          t("publishedViewAction"),
          () => {
            // Open the note that was just published BEFORE entering preview:
            // the toggle can be fired from a tree row for a note nobody has
            // open, and preview reopens whatever `openPath` names.
            get().openNote(result.path);
            void get().setPreviewVisitor(true);
          },
        );
      }),

    setPublishedFilter: (publishedFilter) => set({ publishedFilter }),

    setOpenPublished: (openPublished) => set({ openPublished }),

    setBannerModalOpen: (bannerModalOpen) => set({ bannerModalOpen }),

    setBanner: (path, value) =>
      guarded("setting banner", async () => {
        // Same choreography as togglePublish: let a pending autosave land so
        // the server-side line edit and the editor buffer don't clobber each
        // other, and claim the SSE echo as our own write.
        if (get().dirty[path]) await waitForClean(path, 2000);
        markSelfWrite(path);
        await api.setFrontmatter(path, "banner", value);
        // The note's bytes changed on disk: refresh the open editor/reading
        // pane so its buffer carries the new frontmatter.
        if (get().openPath === path) get().bumpReload();
        toast(value === null ? t("bannerRemovedToast") : t("bannerSetToast"));
      }),

    // The properties card's every write (v1.8, Obsidian parity #1). The
    // choreography is `setBanner`'s to the letter, and deliberately so: a
    // property IS a banner as far as this client is concerned — one surgical
    // line edit on the server, one pane reload afterwards. What differs is the
    // silence. A card that raised a toast for every ticked checkbox would put
    // a message in the corner for an action whose result is already on screen
    // one row away; REMOVAL says so, because a row that vanishes is the one
    // change the card cannot show you afterwards.
    setProperty: (path, key, value) =>
      guarded("saving the property", async () => {
        if (get().dirty[path]) await waitForClean(path, 2000);
        markSelfWrite(path);
        await api.setFrontmatter(path, key, value);
        if (get().openPath === path) get().bumpReload();
        if (value === null) toast(tf("propRemovedToast", { key }));
      }),
  } satisfies Partial<State>;
}
