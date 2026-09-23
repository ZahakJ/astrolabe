// WHAT EVERY SHELL RUNS, WHICHEVER SHELL IT IS.
//
// Two shells exist (client/shellQuery.ts): the desktop's (App.tsx) and the
// phone's (client/phone/PhoneShell.tsx). What they DRAW has nothing in common;
// what keeps the vault honest underneath is identical, and it used to live in
// App.tsx's body where a second shell could only have copied it — and a copy of
// the SSE handler is a copy that stops noticing external edits the first time
// someone improves the other one. So it lives here, as one hook each shell
// mounts: the boot, the window census, the unsaved-text guard, the live event
// stream, the wake-up revalidation, the offline worker, the what's-new door,
// and the two window events the properties card raises.
//
// Nothing here renders. Nothing here knows which shell called it, except
// `blogVisitor`, which decides whether the admin-only half runs at all.

import { useEffect, useRef } from "react";
import type { PropertyValue, VaultEvent } from "../shared/types.ts";
import { BOOKMARKS_PATH } from "../shared/bookmarks.ts";
import { subscribeEvents } from "./api.ts";
import { bookmarksChanged } from "./bookmarks.ts";
import { coalesce } from "./coalesce.ts";
import { loadPeriodic } from "./daily.ts";
import { clearBrokenEmbeds } from "./editor/embeds.ts";
import {
  adoptExternalChange,
  flushAllBuffers,
  revalidateBuffers,
  unsavedPaths,
} from "./editor/bufferBridge.ts";
import { invalidateVaultGraph } from "./graphCache.ts";
import { tf } from "./i18n.ts";
import { syncOfflineWorker } from "./offline.ts";
import { recentSelfWrite, useStore } from "./state.ts";
import { dismissToasts, toast } from "./toast.ts";
import { maybeOpenWhatsNew } from "./whatsnew/door.ts";

/** Writes made by our own autosave echo back through the watcher; ignore
 *  "changed" events arriving within this window of a local save. */
const SELF_SAVE_WINDOW_MS = 1500;
/** The floor between two wake-up revalidations. An alt-tab raises `focus` and
 *  `visibilitychange` within a frame of each other, and a reader flicking
 *  between two windows raises them again a second later; the probe is cheap
 *  but it is not free, and nothing about a vault changes twice in two seconds
 *  that the SSE stream is not already carrying. */
const WAKE_THROTTLE_MS = 2000;
/** Trailing window for whole-vault refreshes driven by the SSE stream. Above
 *  the watcher's own 100ms debounce, so a burst arrives as one wave, and far
 *  below the threshold at which a tree feels stale. */
const SSE_COALESCE_MS = 250;

let booted = false;

/** Mount once, in whichever shell is on screen. */
export function useShellRuntime(): void {
  const openPath = useStore((s) => s.openPath);
  const admin = useStore((s) => s.admin);
  const language = useStore((s) => s.language);
  const authReady = useStore((s) => s.authReady);
  const publicLayout = useStore((s) => s.publicLayout);
  const blogVisitor = authReady && !admin && publicLayout !== "app";
  const lastSaveRef = useRef(0);

  // Boot: /api/me, then tree + session restore / home note.
  // ONCE PER PAGE, not once per mount: a rotation that swaps the phone shell
  // for the desktop's (or back) remounts this hook, and a second bootstrap
  // would re-read /api/me and re-open the session over the note in hand.
  useEffect(() => {
    if (booted) return;
    booted = true;
    void useStore.getState().bootstrap();
  }, []);

  // Several windows of one vault, behaving like one application: the theme and
  // the language follow each other, a saved note re-bases its peers' write
  // precondition, a sign-out is a barrier rather than an event, and exactly one
  // window at a time holds the pen on any given note.
  // DYNAMICALLY, because none of it is needed in the first frame. The bus, the
  // lease and the peer census answer a question — "is another window editing
  // this note" — that cannot arise until a note is open, and a static import
  // put four modules into the entry chunk that every anonymous blog reader then
  // downloaded to coordinate windows they do not have. `check-bundle` is what
  // noticed.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let dead = false;
    void import("./windows/coherence.ts").then((m) => {
      if (dead) return;
      stop = m.installWindowCoherence();
    });
    return () => {
      dead = true;
      stop?.();
    };
  }, []);

  // CLOSING THE TAB WITH UNSAVED TEXT IN IT.
  //
  // There was no `beforeunload` anywhere in the client, and `putNote` is a
  // plain fetch: closing a tab mid-sentence warned about nothing and saved
  // nothing. The loss is one sentence at a time, which is exactly why it
  // erodes trust instead of getting reported — nobody files a bug about a
  // paragraph they are not certain they wrote.
  //
  // Two halves, and the order matters. The BEACON goes first and
  // unconditionally, because it is the half that actually saves the work: a
  // `fetch` started here dies with the document, while `sendBeacon` is the one
  // transport the platform promises to deliver afterwards. Only then is the
  // browser's own "leave site?" dialog raised, and only when something was
  // still unsaved after the attempt — a confirmation prompt in front of a
  // reader whose work is already on its way is a prompt that teaches them to
  // click through prompts.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      flushAllBuffers();
      if (unsavedPaths().length === 0) return;
      e.preventDefault();
      // Every modern browser prints its own wording and ignores ours, but the
      // assignment is still what marks the event as needing the dialog.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Track when the Editor finishes a save (dirty true -> false), so SSE
  // "changed" echoes of our own writes can be told apart from external edits.
  useEffect(
    () =>
      useStore.subscribe((state, prev) => {
        const p = state.openPath;
        if (p && prev.dirty[p] && !state.dirty[p]) lastSaveRef.current = Date.now();
      }),
    [],
  );

  // WHAT'S NEW, once per update: the first time this device opens a new
  // minor version as an admin in the editor shell, the release's deck
  // (client/whatsnew/) walks its features. A visitor never sees it — the
  // deck is about the tools, and the tools are the admin's. Settled once
  // the session is known, so a blog visitor's shell never even imports it.
  useEffect(() => {
    if (!authReady || !admin || blogVisitor) return;
    // The periodic-note settings (folder, formats) prime once here, so the
    // palette's synchronous hint and the sidebar's Hijri label read the
    // instance's answer rather than the defaults.
    void loadPeriodic();
    const timer = window.setTimeout(maybeOpenWhatsNew, 900);
    return () => window.clearTimeout(timer);
  }, [authReady, admin, blogVisitor]);

  // OFFLINE READING (client/offline.ts): the worker follows the session —
  // registered for an admin with the switch on, unregistered and its copy
  // deleted the moment the session ends. Re-run on the switch's own event
  // so the settings row acts at once.
  useEffect(() => {
    if (!authReady) return;
    void syncOfflineWorker(admin);
    const again = (): void => void syncOfflineWorker(admin);
    window.addEventListener("astrolabe:offline", again);
    return () => window.removeEventListener("astrolabe:offline", again);
  }, [authReady, admin]);

  // Navigating to another note dismisses lingering PLAIN toasts — a message
  // about the previous interaction must not overlay unrelated content. An
  // action toast is deliberately spared (client/toast.ts): deleting the open
  // note is exactly the gesture that changes `openPath`, and the Undo it
  // offers cannot dismiss itself in the same frame it appears.
  useEffect(() => {
    dismissToasts();
  }, [openPath]);

  // SSE: keep tree + backlinks fresh; reload the open note on external change.
  // Re-subscribed whenever `admin` flips: the server filters the stream by the
  // session it saw AT CONNECTION TIME, so a stream opened before login keeps
  // visitor filtering (publish toggles would arrive as bogus "deleted" events)
  // and a stream opened as admin would keep leaking unpublished paths after
  // logout. A fresh EventSource carries the current cookie.
  //
  // `language` is in the dependency list for exactly the same reason, one
  // dimension over: under `settings.languageFilter: "follow"` the stream is
  // scoped to the reader's language at connection time (EventSource cannot
  // send a header, so it went out as ?lang=), and a reader who flips the EN/ع
  // switch would otherwise keep a stream describing the collection they left —
  // announcing edits to notes their new language hides, and silent about the
  // ones it reveals. Cheap: one reconnect per deliberate language change.
  useEffect(() => {
    // Whole-vault refreshes are COALESCED; per-event bookkeeping below is not.
    // One changed file and sixty changed files leave the tree, the backlinks,
    // the tag list and the publish marks in the same place, so a burst pays
    // for one round of each instead of sixty (client/coalesce.ts spells out
    // the numbers this replaced).
    const refreshVault = coalesce(() => {
      const store = useStore.getState();
      void store.loadTree();
      void store.refreshBacklinks();
      // Keep publish marks + "N published" fresh (external edits can flip
      // frontmatter flags too).
      if (store.admin) void store.loadPublished();
    }, SSE_COALESCE_MS);

    const onEvent = (ev: VaultEvent) => {
      const store = useStore.getState();
      refreshVault();
      // Surfaces that draw a QUERY over the vault rather than one note (the
      // Media page's shelves) listen for this and re-ask; they are lazy
      // chunks, so they cannot be called from here by name.
      window.dispatchEvent(new Event("astrolabe:vault"));
      // TOO MUCH CHANGED TO NARRATE. The server stops sending one frame per
      // file above ~25 in 200ms (a `git pull`, a folder restore, an Obsidian
      // sync) and sends this instead; the honest answer is the one a dropped
      // stream gets — re-read everything this client is holding, since we were
      // not told which of it moved.
      if (ev.kind === "bulk") {
        invalidateVaultGraph();
        clearBrokenEmbeds();
        void revalidateBuffers();
        return;
      }
      // The link graph is the most expensive of the lot and has its own
      // debounce and its own shared cache, so it is invalidated rather than
      // refetched here.
      invalidateVaultGraph();

      // New/renamed files may satisfy embeds that 404'd earlier.
      if (ev.kind === "created" || ev.kind === "renamed") clearBrokenEmbeds();
      // Bookmarks.md edited anywhere (by hand, in Obsidian, on the phone):
      // the sidebar's rows re-read it.
      if (ev.path === BOOKMARKS_PATH || ev.toPath === BOOKMARKS_PATH) bookmarksChanged();

      if (ev.kind === "renamed" && ev.toPath) {
        store.remapPath(ev.path, ev.toPath);
      } else if (ev.kind === "deleted" && store.openTabs.includes(ev.path)) {
        store.closeTab(ev.path);
      } else if (ev.kind === "changed" && (ev.path === store.openPath || store.openTabs.includes(ev.path))) {
        // Not only the focused note: a task ticked in a fence, or a mention
        // linked from the panel, rewrites a note that may be open in ANOTHER
        // pane, and a clean buffer left stale there 409s on its next save.
        // A publish toggle rewrites the file too; its echo is handled by
        // togglePublish's own bumpReload, not the external-change path.
        // Two ways to recognise our own write, and the FIRST is the one
        // that catches an autosave: every writer claims the path before it
        // sends the request, because the echo overtakes the response by a
        // couple of milliseconds (state.ts::markSelfWrite). The dirty→clean
        // stamp stays as the belt to that braces — it still answers for a
        // write some future path forgets to claim.
        const selfSave =
          recentSelfWrite(ev.path, SELF_SAVE_WINDOW_MS) ||
          Date.now() - lastSaveRef.current < SELF_SAVE_WINDOW_MS;
        if (!selfSave) {
          if (store.dirty[ev.path]) {
            toast(tf("changedOnDisk", { path: ev.path }));
          } else {
            // Adopt the new text INTO the open buffer rather than remounting
            // the editor. The remount used to be the whole mechanism, and with
            // the buffer registry it became the wrong one: an unmount releases
            // the buffer and a remount re-fetches it, so the note would come
            // back correct and the reader's undo history would be gone — on an
            // event they did not cause. Adoption goes through the document as
            // an ordinary transaction, so the external change is itself
            // undoable. The remount stays as the fallback for the surface that
            // has no buffer: the reading view.
            void adoptExternalChange(ev.path).then((adopted) => {
              if (!adopted) store.bumpReload();
            });
          }
        }
      }
    };
    // A STREAM THAT DROPPED AND CAME BACK IS A GAP IN WHAT WE KNOW. EventSource
    // reconnects on its own and replays nothing, so every "changed" sent while
    // it was away is gone — and the buffers here still describe files that may
    // have moved on. Re-ask, before the reader types into one of them.
    return subscribeEvents(onEvent, () => void revalidateBuffers());
  }, [admin, language]);

  // WAKING UP: the window was hidden and is visible again.
  //
  // The incident this exists for: one vault, TWO SERVERS — the desktop app's
  // child server beside a systemd instance behind the web admin. A note was
  // published from the web; the desktop app had been running for days with
  // that note's buffer loaded from before the publish. Each server's watcher
  // announces to its OWN subscribers, so the frame that would have refreshed
  // the desktop buffer went to a stream that had long since dropped. The write
  // precondition still refuses the stale save — nothing is lost — but the
  // client had no way to LEARN it was stale until it tried to write, which is
  // the worst moment to find out.
  //
  // `visibilitychange` is the event that actually fires when a laptop lid
  // opens or a backgrounded tab is picked up again; `focus` catches the case
  // where the window never went hidden and the reader simply came back to it
  // from another app. Both are throttled together — they fire in quick
  // succession on a single alt-tab, and this must not become a poll.
  useEffect(() => {
    let last = 0;
    const wake = (): void => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < WAKE_THROTTLE_MS) return;
      last = now;
      void revalidateBuffers();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, []);

  // "Set banner…" requests from the editor's properties-card action.
  useEffect(() => {
    const onSetBanner = (): void => {
      const store = useStore.getState();
      if (store.admin && store.openPath) store.setBannerModalOpen(true);
    };
    window.addEventListener("astrolabe:set-banner", onSetBanner);
    return () => window.removeEventListener("astrolabe:set-banner", onSetBanner);
  }, []);

  // The properties card writes one property (v1.8, Obsidian parity #1). The
  // card is raw DOM inside a CodeMirror widget and knows nothing about the
  // store, so it asks the shell the same way the "Set banner…" button beside
  // it does — but it names its own NOTE in the event, because a split puts two
  // cards on screen and the one that was clicked is not always the focused
  // pane's. `admin` is re-checked here rather than trusted from the DOM: this
  // is the shell's gate, and the editor is only one of the things that can
  // dispatch a window event.
  useEffect(() => {
    const onProperty = (ev: Event): void => {
      const detail = (ev as CustomEvent<{ path?: unknown; key?: unknown; value?: unknown }>).detail;
      const store = useStore.getState();
      if (!store.admin) return;
      const path = typeof detail?.path === "string" ? detail.path : store.openPath;
      const key = typeof detail?.key === "string" ? detail.key.trim() : "";
      if (path === null || key === "") return;
      void store.setProperty(path, key, (detail?.value ?? null) as PropertyValue | null);
    };
    window.addEventListener("astrolabe:property", onProperty);
    return () => window.removeEventListener("astrolabe:property", onProperty);
  }, []);
}
