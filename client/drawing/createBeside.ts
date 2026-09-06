// "/draw": a drawing made FROM a note, without leaving it.
//
// The owner's ask was to draw inside a note without making a separate file
// and pasting an embed by hand. A drawing is still its own file (that is
// what keeps it Obsidian-compatible and lets it be embedded anywhere), but
// the three steps collapse into one: the file is created beside the note,
// named after it, the embed is written where the caret is, and the canvas
// opens in a pane beside the note so the two are on screen together.
import { putNote } from "../api.ts";
import { isDrawingPath } from "../../shared/noteFormat.ts";
import { useStore } from "../state.ts";
import type { TreeNode } from "../../shared/types.ts";

function taken(tree: TreeNode | null, path: string): boolean {
  const want = path.toLowerCase();
  const walk = (n: TreeNode): boolean => (n.type === "folder" ? (n.children ?? []).some(walk) : n.path.toLowerCase() === want);
  return tree !== null && walk(tree);
}

/** Create `<note> sketch.excalidraw` (numbered when that exists) in the
 *  note's folder, open it in a pane beside the note, and return the embed
 *  target to write. Null when the note has no path or the write failed. */
export async function createDrawingBeside(notePath: string): Promise<string | null> {
  const store = useStore.getState();
  const { drawingExtension, newDrawingContent } = await import("../../shared/drawing.ts");
  const format = store.obsidianVault ? "plugin" : "json";
  const ext = drawingExtension(format);
  const slash = notePath.lastIndexOf("/");
  const dir = slash === -1 ? "" : notePath.slice(0, slash + 1);
  const base = notePath.slice(slash + 1).replace(/\.(md|tex|latex)$/i, "");
  let path = `${dir}${base} sketch${ext}`;
  for (let n = 2; taken(store.tree, path); n++) path = `${dir}${base} sketch ${n}${ext}`;
  if (!isDrawingPath(path)) return null;
  try {
    await putNote(path, newDrawingContent(format));
  } catch (err) {
    console.error("createDrawingBeside: create failed", err);
    return null;
  }
  await store.loadTree();
  // Beside, not instead: the note stays where it is and the canvas takes a
  // new pane; when the window has no room for one, the drawing opens in
  // the pane the note is in and the note is one tab away.
  const split = store.splitFocusedPane("inline");
  useStore.getState().openNote(path);
  if (!split) useStore.getState().setView("editor");
  return path.slice(dir.length);
}
