// A LINE OF THE READER'S WORDS, OUTSIDE A NOTE. A sigil's task, a task due
// on Today, a backlink's context, a search hit, a Timeline excerpt: short
// runs of text lifted out of notes and drawn by a surface of their own. The
// reading renderer (reading/render.ts) turns `[[…]]` into a link inside a
// note; out here the brackets used to reach the screen as typed — the owner,
// on the phone: "I see [[orbits/japanese/kana]]" where the kana slot of a
// sigil should have been a link to the deck.
//
// One place answers for all of them, in three shapes:
//
//   - `appendInline` — for the DOM builders (the sigil card): the words with
//     each wikilink as the reading renderer's own anchor, `.s-rv-wikilink`,
//     dashed as `.s-rv-wikilink--broken` when the vault has no such note;
//   - `<InlineText>` — the same for React rows, or, with `links={false}`, the
//     words alone, for a line that is itself one button (a search hit, a
//     Timeline row): a link inside a button is two doors in one place;
//   - `inlinePlain` (./inlineRuns.ts) — the words as a string, for an aria
//     label or a snippet.
//
// A tap follows the link the way a tap in a note does (`followWikilink`,
// which the note's own click delegation calls too): open the note — on the
// phone, the shell pushes its reader screen for it — tell a visitor it is not
// published, or create it for the owner.
//
// The runs themselves — which words are a link, to what, under what label —
// are ./inlineRuns.ts, pure so a test can read them.

import { type MouseEvent as ReactMouseEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { isNotePath, noteTitleOf } from "../shared/noteFormat.ts";
import type { TreeNode } from "../shared/types.ts";
import { resolveLink } from "./editor/links.ts";
import { tf } from "./i18n.ts";
import { inlinePlain, inlineRuns, type InlineRun } from "./inlineRuns.ts";
import { useStore } from "./state.ts";
import { toast } from "./toast.ts";
import { twinSwapFor } from "./twinSwap.ts";

/** Follow a wikilink from anywhere: the note if the vault has it, a word to
 *  a visitor if it is private, a new note for the owner if it is not there
 *  (the Obsidian behaviour). `shown` is the label the reader tapped. */
export function followWikilink(name: string, heading: string | null, shown: string): void {
  const store = useStore.getState();
  // The same fallback the RENDERER applied when it decided this link was not
  // broken (the link-time swap, shared/twins.ts). The anchor carries the
  // author's raw target, so resolution happens twice — and the two had
  // better agree: a link drawn as live that then reported "not published"
  // would be the worst of both answers.
  const path = resolveLink(name, store.tree) ?? twinSwapFor(name);
  if (path) {
    if (heading) store.setPendingHeading(heading);
    store.openNote(path);
  } else if (!store.admin) {
    // Visitors can't create the missing note — and on a curated published
    // site the target usually exists but is private, so say that (with the
    // display label, never a raw internal vault path).
    const rendered = shown.trim();
    toast(tf("linkNotPublished", { name: rendered && !rendered.includes("/") ? rendered : noteTitleOf(name) }));
  } else {
    // Unresolved link: clicking it creates the note (Obsidian behavior).
    const notePath = isNotePath(name) ? name : `${name}.md`;
    toast(tf("creatingNote", { name }));
    void store.createNote(notePath);
  }
}

function linkClass(run: Extract<InlineRun, { kind: "link" }>): string {
  return run.path === null ? "s-rv-wikilink s-rv-wikilink--broken" : "s-rv-wikilink";
}

/** Follow the tapped run. The event stops here: a link inside a task's
 *  <label> must not also tick the box, and a card drawn inside a note must
 *  not be answered a second time by the note's own delegation. */
function follow(ev: { preventDefault(): void; stopPropagation(): void }, run: Extract<InlineRun, { kind: "link" }>): void {
  ev.preventDefault();
  ev.stopPropagation();
  followWikilink(run.target, run.heading, run.label);
}

function isActivation(key: string): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}

/** Append `text` to `parent` as words and links (the DOM builders' shape).
 *  The anchors are the reading renderer's: no href, `role="link"` and a tab
 *  stop, Enter and Space doing what a tap does. */
export function appendInline(parent: HTMLElement, text: string, tree: TreeNode | null): void {
  for (const run of inlineRuns(text, tree)) {
    if (run.kind === "text") {
      parent.appendChild(document.createTextNode(run.text));
      continue;
    }
    const a = document.createElement("a");
    a.className = linkClass(run);
    a.dataset.target = run.target;
    if (run.heading) a.dataset.heading = run.heading;
    a.setAttribute("role", "link");
    a.tabIndex = 0;
    a.dir = "auto";
    a.textContent = run.label;
    a.addEventListener("click", (ev) => follow(ev, run));
    a.addEventListener("keydown", (ev) => {
      if (isActivation(ev.key)) follow(ev, run);
    });
    parent.appendChild(a);
  }
}

/** A line of the reader's words in a React row. `links={false}` draws the
 *  labels as words — for a line that is itself one button. */
export function InlineText({ text, links = true }: { text: string; links?: boolean }): ReactNode {
  const tree = useStore((s) => s.tree);
  if (!links || !text.includes("[[")) return links ? text : inlinePlain(text);
  return inlineRuns(text, tree).map((run, i) =>
    run.kind === "text" ? (
      run.text
    ) : (
      <a
        key={i}
        className={linkClass(run)}
        data-target={run.target}
        data-heading={run.heading ?? undefined}
        role="link"
        tabIndex={0}
        dir="auto"
        onClick={(ev: ReactMouseEvent) => follow(ev, run)}
        onKeyDown={(ev: ReactKeyboardEvent) => {
          if (isActivation(ev.key)) follow(ev, run);
        }}
      >
        {run.label}
      </a>
    ),
  );
}
