// The two faces of a note, on this side of the wire (shared/twins.ts holds
// the rules; server/indexer.ts resolves the pairs).
//
// Three gestures and one lookup, in one module because they are one idea:
//
//   • TURN THE TAB OVER — the other face opens in the SAME tab, same pane,
//     same position in the strip, carrying the reader's place across. The
//     address bar moves, so Back turns it back (client/router.ts makes that
//     step a swap too, not a second tab).
//   • OPEN THE OTHER FACE BESIDE — the same split every other pane gesture
//     uses, which is what you want while translating: both faces on screen,
//     the pair scrolling independently.
//   • MAKE THE OTHER FACE — the new file beside this one, carrying this
//     note's frontmatter, with `twin:` written on both.
//
// The lookup is `twinOf`, over the table the store refreshes with the tree.

import { createTwin } from "./api.ts";
import { promptNotePath } from "./prompts.ts";
import { carryScrollTo, scrollFractionOf } from "./scrollCarry.ts";
import { t, tf } from "./i18n.ts";
import { useStore } from "./state.ts";
import { toast } from "./toast.ts";
import { noteTitleOf } from "../shared/noteFormat.ts";
import { spellcheckLang } from "../shared/script.ts";
import { defaultTwinName, twinFaceLabel, twinIsStale } from "../shared/twins.ts";
import type { TwinPair } from "../shared/types.ts";
import { activeTabOf, paneAt, splitPane, swapTabIn } from "./workspace.ts";

/** This note's other face, or null. A plain lookup: the table arrives with
 *  the tree, so no surface has to ask per note. */
export function twinOf(path: string | null): TwinPair | null {
  if (path === null) return null;
  return useStore.getState().twins[path] ?? null;
}

/** What the pill says, as the two halves of `EN ⇄ ع`. `here` is the face on
 *  screen; `there` is the one a click would bring. The rung both halves are
 *  drawn from is chosen once for the pair — see shared/twins.ts. */
export function twinPillLabels(pair: TwinPair): { here: string; there: string } {
  const langsDiffer = pair.lang !== null && pair.twinLang !== null && pair.lang !== pair.twinLang;
  const named = pair.face !== null || pair.twinFace !== null;
  const opts = { named, langsDiffer };
  return {
    here: twinFaceLabel(pair.face, pair.lang, noteTitleOf(pair.path), opts),
    there: twinFaceLabel(pair.twinFace, pair.twinLang, pair.twinTitle, opts),
  };
}

/** Has the other face fallen behind this one? The cheap, honest hint: two
 *  mtimes and a minute's grace, no diffing and nothing automatic. */
export function twinIsBehind(pair: TwinPair): boolean {
  return twinIsStale(pair.mtimeMs, pair.twinMtimeMs);
}

/** TURN THE TAB OVER. The twin takes this tab's place — same pane, same
 *  index, same pin — and the reader's place in the note travels with it.
 *
 *  `from` defaults to the open note. A no-op when it has no twin. */
export function switchToTwin(from?: string): void {
  const store = useStore.getState();
  const path = from ?? store.openPath;
  const pair = twinOf(path ?? null);
  if (path === null || pair === null) return;
  swapInPlace(path, pair.twin);
}

/** The swap itself, also used by the router when Back walks into the face the
 *  reader came from: a tab that turned over must turn back, not fork. */
export function swapInPlace(from: string, to: string): boolean {
  const store = useStore.getState();
  const pane = paneAt(store.workspace, store.workspace.noteFocus) ?? paneAt(store.workspace, store.workspace.focus);
  if (pane === null) return false;
  const tab = activeTabOf(pane);
  if (tab === null || tab.path !== from) return false;
  carryScrollTo(to, scrollFractionOf(from));
  const next = swapTabIn(store.workspace, pane.id, from, to);
  if (next === store.workspace) return false;
  store.commitWorkspace(next);
  void store.refreshBacklinks();
  return true;
}

/** OPEN THE OTHER FACE BESIDE — a column split carrying the twin, which is
 *  the arrangement translating actually wants. Falls back to opening it in
 *  this pane when the layout is at its cap, and says so rather than appearing
 *  to do nothing. */
export function openTwinBeside(from?: string): void {
  const store = useStore.getState();
  const path = from ?? store.openPath;
  const pair = twinOf(path ?? null);
  if (path === null || pair === null) return;
  const source = store.workspace.noteFocus;
  const next = splitPane(store.workspace, source, "inline", {
    path: pair.twin,
    pinned: false,
    ephemeral: false,
  });
  if (next === null) {
    toast(t("twinBesideFull"));
    store.openNote(pair.twin);
    return;
  }
  store.commitWorkspace(next);
  void store.refreshBacklinks();
}

/** MAKE THE OTHER FACE.
 *
 *  One dialog, because the name IS the choice: it names the file, it is what
 *  the tree and every `[[` completion will show, and for a same-language pair
 *  ("Elden Ring, the long one") it is also the face's own name. The default
 *  offered is the language suffix, which is the common case; typing over it
 *  is how an Arabic title — or a second English face — gets made. A face that
 *  wants a SHORT label as well says so with `face:` in its frontmatter, which
 *  the pill then prefers.
 *
 *  The new file lands beside this one, carries this note's frontmatter minus
 *  its `id`, and both files get `twin:`. Then it opens beside, because the
 *  first thing anyone does with a new face is write it against the old one. */
export async function createTwinFlow(from?: string): Promise<void> {
  const store = useStore.getState();
  const path = from ?? store.openPath;
  if (path === null) return;
  if (twinOf(path) !== null) {
    toast(t("twinAlready"));
    return;
  }
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  // Which language the note is in, read off its NAME — the one piece of it
  // this dialog already holds. A starting point for the suggested filename,
  // never a claim about what the new note will be, and the reader types over
  // it whenever it guesses wrong.
  const mine = spellcheckLang(noteTitleOf(path)) === "ar" ? "ar" : "en";
  const suggestion = defaultTwinName(noteTitleOf(path), mine === "ar" ? "en" : "ar");
  const toPath = await promptNotePath(dir, t("twinCreateTitle"), suggestion);
  if (toPath === null) return;
  try {
    const created = await createTwin(path, toPath);
    await store.loadTree();
    openTwinBeside(path);
    toast(tf("twinCreated", { path: created.path }));
  } catch (err) {
    console.error("astrolabe: creating the twin failed", err);
    toast(err instanceof Error ? err.message : t("twinCreateFailed"), "error");
  }
}
