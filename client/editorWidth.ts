// THE EDITOR'S MEASURE — how wide the writing column is, per device.
//
// The default column is a reading measure (648px of text): right for prose,
// wasteful on a wide screen when the note is a table or code. So the reader
// can widen it: "measure" (the default), "wide" (960px), "wider" (1200px),
// "full" (the whole pane, less a gutter) or "custom" — a width of their own,
// in pixels or as a share of the pane, applied as it is typed. Per browser,
// like the theme: a habit of the screen rather than a fact about the vault.
// Applied as `data-editor-width` on <html> (and, for a custom width, the
// `--editor-measure` property itself), which app.css and reading.css read
// for the editor, the reading view and zen alike.

export type EditorWidth = "measure" | "wide" | "wider" | "full" | "custom";

export const EDITOR_WIDTH_KEY = "astrolabe.editorWidth";
export const EDITOR_WIDTH_CUSTOM_KEY = "astrolabe.editorWidthCustom";
export const DEFAULT_CUSTOM_WIDTH = "900px";

export function readEditorWidth(): EditorWidth {
  try {
    const raw = localStorage.getItem(EDITOR_WIDTH_KEY);
    return raw === "wide" || raw === "wider" || raw === "full" || raw === "custom" ? raw : "measure";
  } catch {
    return "measure";
  }
}

/** A typed width as a CSS length, or null when it is not one: `900` and
 *  `900px` are pixels (320–2400), `70%` a share of the pane (30–100). */
export function normalizeCustomWidth(raw: string): string | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(px|%)?\s*$/i.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (m[2] === "%") return n >= 30 && n <= 100 ? `${Math.round(n)}%` : null;
  return n >= 320 && n <= 2400 ? `${Math.round(n)}px` : null;
}

export function readCustomWidth(): string {
  try {
    return normalizeCustomWidth(localStorage.getItem(EDITOR_WIDTH_CUSTOM_KEY) ?? "") ?? DEFAULT_CUSTOM_WIDTH;
  } catch {
    return DEFAULT_CUSTOM_WIDTH;
  }
}

export function applyEditorWidth(width: EditorWidth = readEditorWidth()): void {
  const root = document.documentElement;
  if (width === "measure") delete root.dataset.editorWidth;
  else root.dataset.editorWidth = width;
  if (width === "custom") root.style.setProperty("--editor-measure", readCustomWidth());
  else root.style.removeProperty("--editor-measure");
}

export function setEditorWidth(width: EditorWidth): void {
  try {
    if (width === "measure") localStorage.removeItem(EDITOR_WIDTH_KEY);
    else localStorage.setItem(EDITOR_WIDTH_KEY, width);
  } catch {
    // storage unavailable — the width lasts the session
  }
  applyEditorWidth(width);
  window.dispatchEvent(new CustomEvent("astrolabe:editor-width", { detail: width }));
}

/** The custom width, as typed; a value that is not a width is kept out of
 *  storage and the column stays where it was. Returns whether it applied. */
export function setCustomWidth(raw: string): boolean {
  const value = normalizeCustomWidth(raw);
  if (value === null) return false;
  try {
    localStorage.setItem(EDITOR_WIDTH_CUSTOM_KEY, value);
  } catch {
    // storage unavailable
  }
  if (readEditorWidth() === "custom") applyEditorWidth("custom");
  return true;
}
