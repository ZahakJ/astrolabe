// The two template commands, and the only two doors into client/templates.ts
// from the UI. Four surfaces open them — the palette, two keybindings, the
// tree's folder menu — and they all land here, so "insert a template" means
// one thing in this product.

import { createNote, getNote, putNote } from "./api.ts";
import { pickTemplate } from "./components/TemplatePicker.tsx";
import { t, tf } from "./i18n.ts";
import { noteTitleOf } from "../shared/noteFormat.ts";
import { promptNotePath } from "./prompts.ts";
import { useStore } from "./state.ts";
import { applyTemplate, fillPrompts, templatePrompts, templateSettings, type TemplateVars } from "./templates.ts";
import { toast } from "./toast.ts";

/** The event the mounted editor answers: "put this template in, at the
 *  caret". The editor owns the transaction because it owns the document —
 *  merging the frontmatter and inserting the body must be ONE undo step, and
 *  only the view knows where the caret is. */
export interface InsertTemplateDetail {
  /** The template file's raw text, placeholders NOT yet filled (the editor
   *  fills them against the note it is actually holding) — except the
   *  PROMPTS, which are answered before this is dispatched: the sheet is a
   *  question to the writer, and the editor is not the one asking. */
  source: string;
  vars: TemplateVars;
  /** Set to true by the editor that handles it — see waitForEditor(). */
  handled: { value: boolean };
}

export const INSERT_TEMPLATE_EVENT = "astrolabe:insert-template";

/** Everything the placeholders need, for a note called `title`. */
async function varsFor(title: string): Promise<TemplateVars> {
  const settings = await templateSettings();
  return {
    title,
    now: new Date(),
    locale: settings.locale,
    calendar: settings.calendar,
    lang: settings.lang,
  };
}

/** The template's questions, asked. `{{prompt:Label}}` / `{{VALUE:Label}}`
 *  (client/templates.ts) open one sheet with a field per distinct label, in
 *  the template's own order; the answers are written in and the filled text
 *  comes back. Null means the writer pressed Escape, and the caller does
 *  NOTHING — not the frontmatter, not the body: a template half-applied is
 *  the worse outcome. A template that asks nothing costs no sheet and no
 *  chunk: the component is loaded only when there is a question to put. */
async function answerPrompts(source: string): Promise<string | null> {
  const labels = templatePrompts(source);
  if (labels.length === 0) return source;
  const { askTemplateValues } = await import("./components/TemplateValuesSheet.tsx");
  const answers = await askTemplateValues(labels);
  if (answers === null) return null;
  return fillPrompts(source, answers);
}

/** Queue the caret for a note about to open, when the template said where.
 *  Nothing queued for a template without `{{cursor}}`: the editor's own home
 *  rule (editor/caretHome.ts) is the right answer there, as it always was. */
function queueCaret(path: string, applied: { content: string; caret: number | null }): void {
  if (applied.caret === null) return;
  useStore.getState().setPendingCaret({ path, offset: applied.content.length + applied.caret });
}

/** "Insert template…" — pick one, then drop its body at the caret and fold its
 *  frontmatter into the note's own block. */
export async function insertTemplateCommand(): Promise<void> {
  const store = useStore.getState();
  const path = store.openPath;
  if (!store.admin || !path) return;
  const chosen = await pickTemplate(t("cmdInsertTemplate"), noteTitleOf(path));
  if (!chosen) return;
  try {
    const [template, vars] = await Promise.all([getNote(chosen), varsFor(noteTitleOf(path))]);
    const source = await answerPrompts(template.content);
    if (source === null) return;
    // Reading view has no caret and no editor. Switch first — an "insert at
    // the cursor" command that silently does nothing because the reader is in
    // reading mode is the invisible-failure this codebase keeps hunting.
    if (useStore.getState().readingMode) useStore.getState().setReadingMode(false);
    const delivered = await deliverToEditor(source, vars);
    if (delivered) return;
    // No editor came up (the note failed to open, the tab changed under us):
    // fall back to the file itself rather than dropping the reader's request.
    const note = await getNote(path);
    const applied = applyTemplate(source, note.content, vars);
    await putNote(path, `${applied.content}${applied.insert}`);
    queueCaret(path, applied);
    useStore.getState().bumpReload();
    toast(tf("templateInserted", { name: noteTitleOf(chosen) }));
  } catch (err) {
    console.error("astrolabe: inserting template failed", err);
    toast(t("templateFailed"));
  }
}

/** Dispatch the insert to whichever editor is mounted, giving a just-switched
 *  reading→editing pane a moment to arrive. Resolves false if none answers. */
function deliverToEditor(source: string, vars: TemplateVars): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + 1500;
    const attempt = (): void => {
      const handled = { value: false };
      const detail: InsertTemplateDetail = { source, vars, handled };
      window.dispatchEvent(new CustomEvent(INSERT_TEMPLATE_EVENT, { detail }));
      if (handled.value) {
        resolve(true);
        return;
      }
      if (Date.now() > deadline) {
        resolve(false);
        return;
      }
      window.setTimeout(attempt, 60);
    };
    attempt();
  });
}

/** "New note from template…" — name it, pick a template, create it with the
 *  template already applied, open it. `dir` is the folder the surface is
 *  creating into ("" = vault root; the tree's folder menu passes its own). */
export async function newNoteFromTemplateCommand(dir = ""): Promise<void> {
  const store = useStore.getState();
  if (!store.admin) return;
  // THE NAME COMES FIRST, and that ordering is the feature: `{{title}}` is
  // filled from the filename, so the picker's preview can only show what will
  // actually land once the name exists.
  const path = await promptNotePath(dir, t("cmdNewFromTemplate"));
  if (!path) return;
  const title = noteTitleOf(path);
  const chosen = await pickTemplate(t("cmdNewFromTemplate"), title);
  if (!chosen) return;
  try {
    const [template, vars] = await Promise.all([getNote(chosen), varsFor(title)]);
    // The questions come BEFORE the file exists: Escape here means no note,
    // not an empty one the writer then has to find and delete.
    const source = await answerPrompts(template.content);
    if (source === null) return;
    // A fresh note has no frontmatter of its own, so the merge is the
    // template's block with its identity keys re-minted (client/templates.ts).
    const applied = applyTemplate(source, "", vars);
    await createNote(path);
    await putNote(path, `${applied.content}${applied.insert}`);
    await useStore.getState().loadTree();
    queueCaret(path, applied);
    useStore.getState().openNote(path);
    if (useStore.getState().readingMode) useStore.getState().setReadingMode(false);
  } catch (err) {
    console.error("astrolabe: creating note from template failed", err);
    toast(err instanceof Error && /exists/i.test(err.message) ? t("couldNotCreateNote") : t("templateFailed"));
  }
}

/** The default template, applied to a note that was just created empty. Off
 *  unless `settings.defaultTemplate` names one — a product that silently puts
 *  text in every new note is a product that has to be fought. */
export async function applyDefaultTemplate(path: string, templatePath: string | null = null): Promise<void> {
  let settings;
  try {
    settings = await templateSettings();
  } catch {
    return; // settings unreachable: a new note is empty, as it always was
  }
  // A period's own template (the daily note's, the weekly's) wins over the
  // default for new notes; neither → the note stays empty.
  const chosen = templatePath ?? settings.defaultTemplate;
  if (!chosen || chosen === path) return;
  try {
    const [template, vars] = await Promise.all([
      getNote(chosen),
      varsFor(noteTitleOf(path)),
    ]);
    // A default template that asks questions asks them on every new note —
    // that is what putting a prompt in the default template means. Escape
    // leaves the note as it was born: empty.
    const source = await answerPrompts(template.content);
    if (source === null) return;
    const applied = applyTemplate(source, "", vars);
    const content = `${applied.content}${applied.insert}`;
    if (content.trim() === "") return;
    await putNote(path, content);
    queueCaret(path, applied);
    useStore.getState().bumpReload();
  } catch (err) {
    // A missing/renamed default template must not break note creation — the
    // note is already there and empty, which is the pre-feature behaviour.
    console.error("astrolabe: applying the default template failed", err);
    toast(t("defaultTemplateFailed"));
  }
}
