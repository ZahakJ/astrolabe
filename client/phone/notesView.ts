// Tree or Folders: how the Notes tab shows the vault, remembered per device.
//
// Until the reader chooses, the answer follows the screen: a two-column
// layout (the open Fold, a tablet) starts on the Tree, where the list column
// and the note beside it read like a book's contents and its page; one column
// starts on Folders, a phone's own way. Once chosen, the choice is kept.

export type NotesView = "tree" | "folders";

const KEY = "astrolabe.phone-notes-view";
const listeners = new Set<() => void>();

function stored(): NotesView | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "tree" || v === "folders" ? v : null;
  } catch {
    return null;
  }
}

let chosen: NotesView | null = stored();

export function notesView(twoColumns: boolean): NotesView {
  return chosen ?? (twoColumns ? "tree" : "folders");
}

export function setNotesView(view: NotesView): void {
  chosen = view;
  try {
    localStorage.setItem(KEY, view);
  } catch {
    /* kept for the session */
  }
  for (const l of listeners) l();
}

export function subscribeNotesView(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
