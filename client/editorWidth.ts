// THE EDITOR'S MEASURE — how wide the writing column is, per device.
//
// The default column is a reading measure (648px of text): right for prose,
// wasteful on a wide screen when the note is a table or code. So the reader
// can widen it: "measure" (the default), "wide" (960px) or "full" (the whole
// pane, less a gutter). Per browser, like the theme: a habit of the screen
// rather than a fact about the vault. Applied as `data-editor-width` on
// <html>, which app.css reads for the editor, the reading view and zen.

export type EditorWidth = "measure" | "wide" | "full";

export const EDITOR_WIDTH_KEY = "vellum.editorWidth";

export function readEditorWidth(): EditorWidth {
  try {
    const raw = localStorage.getItem(EDITOR_WIDTH_KEY);
    return raw === "wide" || raw === "full" ? raw : "measure";
  } catch {
    return "measure";
  }
}

export function applyEditorWidth(width: EditorWidth = readEditorWidth()): void {
  const root = document.documentElement;
  if (width === "measure") delete root.dataset.editorWidth;
  else root.dataset.editorWidth = width;
}

export function setEditorWidth(width: EditorWidth): void {
  try {
    if (width === "measure") localStorage.removeItem(EDITOR_WIDTH_KEY);
    else localStorage.setItem(EDITOR_WIDTH_KEY, width);
  } catch {
    // storage unavailable — the width lasts the session
  }
  applyEditorWidth(width);
  window.dispatchEvent(new CustomEvent("vellum:editor-width", { detail: width }));
}
