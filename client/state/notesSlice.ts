// The notes themselves: backlinks, create, rename, delete, restore, the dirty
// flags and path remaps. Moved out of client/state.ts unchanged.

import type { State } from "./types.ts";
import type { StoreGet, StoreSet } from "./sliceTypes.ts";
import { actionToast } from "../undoToast.ts";
import * as api from "../api.ts";
import { applyDefaultTemplate } from "../templateActions.ts";
import { clearBrokenEmbeds } from "../editor/embeds.ts";
import { deletedToast, guarded, remap } from "./helpers.ts";
import { flushBufferPath, remapBufferPath } from "../editor/bufferBridge.ts";
import { mirrorOf } from "../state.ts";
import { noteLabelOf, noteTitleOf } from "../../shared/noteFormat.ts";
import { remapWorkspace } from "../workspace.ts";
import { t, tf } from "../i18n.ts";
import { toast } from "../toast.ts";

/** The notes themselves: backlinks, create, rename, delete, restore, dirty flags and remaps. */
export function notesSlice(set: StoreSet, get: StoreGet) {
  return {
    refreshBacklinks: async () => {
      const { openPath } = get();
      if (!openPath) {
        set({ backlinks: [] });
        return;
      }
      try {
        const backlinks = await api.getBacklinks(openPath);
        // Ignore stale responses if the open note changed mid-flight.
        if (get().openPath === openPath) set({ backlinks });
      } catch (err) {
        console.error("astrolabe: loading backlinks failed", err);
      }
    },

    createNote: (path) =>
      guarded(`creating ${path}`, async () => {
        await api.createNote(path);
        // The default template, when the instance has one configured (off by
        // default — a product that silently writes into every new note is a
        // product that has to be fought). It runs BEFORE the note opens, so
        // the editor loads the templated content rather than an empty buffer
        // it would then have to be told about. A failure here is logged and
        // the note stays empty: creation must not depend on it.
        await applyDefaultTemplate(path);
        await get().loadTree();
        get().openNote(path);
        // A just-created note is empty — reading view would be a blank pane.
        if (get().readingMode) get().setReadingMode(false);
      }),

    renameNote: (path, toPath) =>
      guarded(`renaming ${path}`, async () => {
        const oldTitle = noteTitleOf(path);
        // THE TEXT GOES FIRST. A rename moves the file the server has, and a
        // note typed into seconds ago is not that file yet: the move carried
        // an empty file to the new name while the pending autosave, still
        // aimed at the old one, resurrected it there with everything the
        // reader had written — a note that looked lost until someone looked
        // in the trash. Flushing before the move makes the file being moved
        // the one on the screen.
        await flushBufferPath(path);
        await api.renameNote(path, toPath);
        get().remapPath(path, toPath);
        await get().loadTree();
        void get().refreshBacklinks();
        // The rewrite fixed every [[wikilink]] INSIDE this vault. It could not
        // fix what is outside it: a published permalink, a link in someone
        // else's notes, a bookmark — and it never sees the reader's own memory
        // of what the note was called. One button keeps the old title working
        // as a name (frontmatter `aliases:`), which is the half of a rename
        // Obsidian leaves to the author. Offered only when the NAME changed —
        // a move keeps it, and an alias for a name nothing lost is clutter.
        const newTitle = noteTitleOf(toPath);
        if (oldTitle.toLowerCase() !== newTitle.toLowerCase()) {
          actionToast(tf("renameKeepAliasToast", { title: oldTitle }), t("renameKeepAliasAction"), () => {
            api
              .addAlias(toPath, oldTitle)
              .then(() => toast(tf("renameAliasKeptToast", { title: oldTitle })))
              .catch((err: unknown) => {
                console.error("astrolabe: keeping the old title as an alias failed", err);
                toast(tf("renameAliasFailed", { title: oldTitle }), "error");
              });
          });
        }
      }),

    deleteNote: (path, opts) =>
      guarded(`deleting ${path}`, async () => {
        const permanent = opts?.permanent === true;
        // The tree's own label, like the dialog that asked and the tab that
        // closed — a toast reading “Welcome.md” after a row reading "Welcome"
        // is the same file wearing two names in two seconds.
        const name = noteLabelOf(path);
        const result = await api.deleteNote(path, permanent);
        get().closeTab(path);
        await get().loadTree();
        void get().refreshBacklinks();
        // A published note leaving the vault changes the public site — the
        // "N published" segment and the publish marks have to follow it.
        void get().loadPublished();
        deletedToast(get, tf(permanent ? "noteDeletedToast" : "noteTrashedToast", { name }), result.trashPath);
      }, t("couldNotDeleteNote")),

    deleteFolder: (path, opts) =>
      guarded(`deleting folder ${path}`, async () => {
        const permanent = opts?.permanent === true;
        const name = path.split("/").pop() ?? path;
        const result = await api.deleteFolder(path, permanent);
        // Tabs pointing INTO the folder now name files that no longer exist —
        // close them before the tree reload so no stale editor tries to save
        // into the hole. (The folder itself is never a tab.)
        for (const open of [...get().openTabs]) {
          if (open.startsWith(`${path}/`)) get().closeTab(open);
        }
        // The server indexes before it answers, so this refetch is already
        // correct — no wait on the SSE echo (which arrives too, harmlessly).
        await get().loadTree();
        void get().refreshBacklinks();
        void get().loadPublished();
        deletedToast(get, tf(permanent ? "folderDeletedToast" : "folderTrashedToast", { name }), result.trashPath);
      }, t("couldNotDeleteFolder")),

    deleteAttachment: (path, opts) =>
      guarded(`deleting ${path}`, async () => {
        const permanent = opts?.permanent === true;
        const name = path.split("/").pop() ?? path;
        const result = await api.deleteAttachment(path, permanent);
        await get().loadTree();
        // An attachment is not a note, so no tab and no backlinks — but a
        // PUBLISHED note may embed it, and the file leaving the vault leaves
        // that note's <img> pointing at a 404 on the public site. Refresh the
        // publish surfaces for the same reason a note delete does.
        void get().loadPublished();
        // Embed widgets cache what resolved and what did not; a deleted file
        // must not keep rendering from that cache.
        clearBrokenEmbeds();
        get().bumpReload();
        deletedToast(get, tf(permanent ? "fileDeletedToast" : "fileTrashedToast", { name }), result.trashPath);
      }, t("couldNotDeleteFile")),

    restoreTrash: async (name) => {
      const result = await api.restoreTrash(name);
      // A restored folder brings notes, attachments and possibly publish marks
      // back at once; the server has already reindexed, so one refetch is
      // enough and it is already correct.
      await get().loadTree();
      void get().refreshBacklinks();
      void get().loadPublished();
      clearBrokenEmbeds();
      get().bumpReload();
      return { path: result.path, renamed: result.renamed };
    },

    setDirty: (path, isDirty) =>
      set((s) =>
        s.dirty[path] === isDirty ? s : { dirty: { ...s.dirty, [path]: isDirty } },
      ),

    remapPath: (path, toPath) =>
      set((s) => {
        // The open DOCUMENT follows its file too, not just the tab. A rename
        // that dropped the undo history of the note being renamed would do it
        // at the one moment a reader most wants it back.
        remapBufferPath(path, toPath);
        const dirty: Record<string, boolean> = {};
        for (const [p, d] of Object.entries(s.dirty)) dirty[remap(p, path, toPath)] = d;
        return { ...mirrorOf(remapWorkspace(s.workspace, path, toPath)), dirty, lastRemap: { from: path, to: toPath } };
      }),

    bumpReload: () => set((s) => ({ reloadTick: s.reloadTick + 1 })),

    setPendingHeading: (pendingHeading) => set({ pendingHeading }),
    setPendingCaret: (pendingCaret) => set({ pendingCaret }),
  } satisfies Partial<State>;
}
