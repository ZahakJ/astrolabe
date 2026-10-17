// THE DESK'S WRITES — every one of them a frontmatter edit through the same
// doors the rest of the product uses (docs/writing-desk.md).
//
// A status is `POST /api/frontmatter` on one key. Publishing is NOT a status:
// moving a piece onto Published asks the question the phone's ✦ asks and then
// runs the store's own togglePublish, so the piece reaches the site exactly
// the way any note does, and a cancelled question publishes nothing. Moving a
// piece that is on the site to another column asks first too, because it
// takes the piece off the site.

import { noteTitleOf } from "../../shared/noteFormat.ts";
import { freePath } from "../../shared/periodic.ts";
import { DESK_FOLDER, newPieceContent, pieceNotePath, type DeskPiece, type DeskStatus, type NewPiece } from "../../shared/desk.ts";
import { putNote, setFrontmatter } from "../api.ts";
import { confirmModal } from "../components/Confirm.tsx";
import { collectNotes } from "../editor/links.ts";
import { t, tf } from "../i18n.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { actionToast } from "../undoToast.ts";
import { statusLabel } from "./words.ts";

/** Move a piece to `to`. Resolves true when the note now says so. */
export async function moveTo(piece: DeskPiece, to: DeskStatus): Promise<boolean> {
  if (piece.stage === to) return false;
  const store = useStore.getState();
  const name = piece.title;
  try {
    if (to === "published") {
      const ok = await confirmModal({
        title: tf("phPublishAsk", { name }),
        body: t("phPublishBody"),
        confirmLabel: t("publish"),
        accent: true,
      });
      if (!ok) return false;
      await store.togglePublish(piece.path, true);
      await setFrontmatter(piece.path, "status", { kind: "text", text: "published" });
      return true;
    }
    if (piece.published) {
      const ok = await confirmModal({
        title: tf("deskUnpublishAsk", { name }),
        body: tf("deskUnpublishBody", { status: statusLabel(to) }),
        confirmLabel: t("deskUnpublishConfirm"),
      });
      if (!ok) return false;
      await store.togglePublish(piece.path, false);
    }
    await setFrontmatter(piece.path, "status", { kind: "text", text: to });
    toast(tf("deskMoved", { name, status: statusLabel(to) }));
    return true;
  } catch (err) {
    console.error("astrolabe: moving a piece failed", err);
    toast(t("deskMoveFailed"), "error");
    return false;
  }
}

/** Write a new piece or series note under Writing/ and say where it went.
 *  The name takes a ` 2` when the title is already a note there. No
 *  `publish:` key is ever written: a new piece is private. */
export async function createPiece(title: string, piece: NewPiece, opts: { open?: boolean } = {}): Promise<string | null> {
  const store = useStore.getState();
  if (!store.admin) return null;
  const taken = new Set(collectNotes(store.tree).map((n) => n.path));
  const path = freePath(pieceNotePath(title), taken);
  try {
    await putNote(path, newPieceContent(piece));
    await useStore.getState().loadTree();
  } catch (err) {
    console.error("astrolabe: creating a piece failed", err);
    toast(t("deskCreateFailed"), "error");
    return null;
  }
  if (opts.open) {
    useStore.getState().openNote(path);
    return path;
  }
  actionToast(tf("deskCreated", { name: noteTitleOf(path) }), t("deskOpenAction"), () => {
    useStore.getState().openNote(path);
    useStore.getState().setView("editor");
  });
  return path;
}

/** A planned slot of a series, made into a piece: the note the slot already
 *  names, filed beside the series, so the series' `[[…]]` finds it. */
export async function startPlanned(ref: string, seriesPath: string): Promise<string | null> {
  const store = useStore.getState();
  const dir = seriesPath.includes("/") ? seriesPath.slice(0, seriesPath.lastIndexOf("/")) : DESK_FOLDER;
  const taken = new Set(collectNotes(store.tree).map((n) => n.path));
  const path = pieceNotePath(ref, dir);
  if (taken.has(path)) {
    store.openNote(path);
    return path;
  }
  try {
    await putNote(path, newPieceContent({ kind: "essay", angle: "", series: noteTitleOf(seriesPath) }));
    await useStore.getState().loadTree();
    useStore.getState().openNote(path);
    return path;
  } catch (err) {
    console.error("astrolabe: starting a planned piece failed", err);
    toast(t("deskCreateFailed"), "error");
    return null;
  }
}
