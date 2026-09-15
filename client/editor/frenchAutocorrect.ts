// FRENCH, CORRECTED AS YOU TYPE — the editor's half.
//
// The owner: "add auto-correction to French — don't want full French support,
// just auto correction if I write in French". The arithmetic is
// shared/french.ts (which word, which spelling, is this line French); this
// file is when to ask, and how to write the answer into the document so that
// it behaves like something the writer can trust:
//
//   · WHEN: at a word boundary — the space, the comma, the Enter, the closing
//     bracket (typed, or stepped over when closeBrackets had already put it
//     there) — after a word, on a line that reads as French (or in a note
//     whose frontmatter says `lang: fr`). Not while a word is still being
//     typed, because the word is not finished, and not in an English line
//     with one French word in it, because that writer did not ask. And at
//     the boundary where a line BECOMES French — its second `je` or `les` —
//     the words already on it are corrected too, as one step: the line's
//     first word was finished before the line had earned it.
//   · WHERE NOT: code fences, inline code, a link's address, a wikilink's
//     target, the frontmatter, math, a `\command`, anything in a URL. Those
//     are not prose in any language and a corrected identifier is a broken
//     program.
//   · HOW: as a SECOND transaction, straight after the one that typed the
//     boundary, carrying `userEvent: "input.autocorrect"` and isolated from
//     the history on both sides. So the correction is its own undo step:
//     ONE Ctrl+Z after "très " gives "tres " back — the word as typed, the
//     space still there — and the editor remembers that refusal for that word
//     at that spot and does not correct it again. The dispatch is deferred to
//     a microtask because a dispatch inside an update is illegal (tables.ts
//     defers its prettify the same way), and it re-checks the document before
//     writing, because anything at all may have happened in between.
//   · VIM: insert mode only. In normal mode the keys are commands, and the
//     characters vim's own commands insert are not the writer typing.
//   · FEEDBACK: none. No toast, no underline, no flash — the corrected word
//     is the feedback, and a word that changes under the caret is enough.

import { isolateHistory } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { Transaction, type ChangeSpec, type EditorState, type Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { BOUNDARIES, frenchCorrection, lineFixes, looksFrench, noteIsFrench, typographyFix, wordFix } from "../../shared/french.ts";
import { frontmatterText } from "../../shared/textLayout.ts";
import { frenchAutocorrectEnabled } from "../frenchPref.ts";

/** How far the frontmatter can reach — bidi.ts's number, for the same reason. */
const FRONTMATTER_SCAN = 4000;

/** Markdown nodes whose text is not prose. `URL` is a link's address (the
 *  label around it stays prose); `CodeText` is what a fenced block holds;
 *  the HTML pair covers a `<span lang="en">` and a raw block. */
const NOT_PROSE = new Set([
  "FencedCode", "CodeBlock", "CodeText", "InlineCode", "URL", "Autolink", "HTMLBlock", "HTMLTag", "CommentBlock", "Comment",
]);

/** 1-based number of the frontmatter's closing fence, or 0 when the note has
 *  no frontmatter. */
function frontmatterLastLine(state: EditorState): number {
  const doc = state.doc;
  if (doc.lines < 2 || doc.line(1).text.trim() !== "---") return 0;
  for (let n = 2; n <= Math.min(doc.lines, 60); n++) {
    const text = doc.line(n).text.trim();
    if (text === "---" || text === "...") return n;
  }
  return 0;
}

/** Inside a `$$` display block: an odd number of `$$`-opening lines above. */
function inBlockMath(state: EditorState, lineNumber: number): boolean {
  let fences = 0;
  for (let n = 1; n < lineNumber; n++) {
    if (state.doc.line(n).text.trimStart().startsWith("$$")) fences += 1;
  }
  return fences % 2 === 1;
}

/** Is `pos` (the end of the word) a place prose is written? Every check the
 *  header lists, cheapest first, and none of them is reached unless the word
 *  is actually in the table — most keystrokes never get here. */
function isProse(state: EditorState, pos: number, lineNumber: number, before: string): boolean {
  if (lineNumber <= frontmatterLastLine(state)) return false;
  // Inline code and inline math by parity: an odd number of backticks or
  // dollars before the word means it sits inside an open span — including
  // one the writer has not closed yet, which the syntax tree cannot see.
  if ((before.match(/`/g) ?? []).length % 2 === 1) return false;
  if ((before.match(/(?<!\\)\$/g) ?? []).length % 2 === 1) return false;
  // A wikilink's TARGET: after `[[` with no `]]` since, and no `|` either —
  // past the pipe is the alias, which is prose.
  const open = before.lastIndexOf("[[");
  if (open !== -1 && before.indexOf("]]", open) === -1 && before.indexOf("|", open) === -1) return false;
  if (inBlockMath(state, lineNumber)) return false;
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (NOT_PROSE.has(node.name)) return false;
  }
  return true;
}

/** The two flags vim publishes on its adapter (vimStatus.ts reads the same
 *  object). Absent when vim is off — then every keystroke is insert. */
function vimInserting(view: EditorView): boolean {
  const cm = (view as unknown as { cm?: { state: { vim?: { insertMode?: boolean } | null; overwrite?: boolean } } }).cm;
  const vim = cm?.state.vim;
  if (!vim) return true;
  return vim.insertMode === true && cm?.state.overwrite !== true;
}

interface Plan {
  changes: ChangeSpec[];
  /** What the document must still read at each range when the microtask
   *  runs, or the plan is stale and is dropped. */
  expect: Array<{ from: number; to: number; text: string }>;
}

/** A refusal: the writer undid this correction, at this position, and the
 *  editor does not argue. Positions are mapped through later edits so the
 *  memory follows the word. */
interface Declined {
  pos: number;
  word: string;
}

const DECLINED_MAX = 32;

function plan(view: EditorView, tr: Transaction, declined: readonly Declined[]): Plan | null {
  if (!frenchAutocorrectEnabled() || !vimInserting(view)) return null;
  // One typed insertion, at one caret. A paste, a completion, a multi-cursor
  // edit and an IME composition all arrive as something else. The one
  // replacement that counts is closeBrackets stepping over the `)` or `"`
  // it had already inserted: that arrives as the character replacing
  // itself, and it is how a word in brackets or quotes gets finished.
  let count = 0;
  let at = -1;
  let inserted = "";
  tr.changes.iterChanges((fromA, toA, fromB, _toB, text) => {
    count += 1;
    inserted = text.toString();
    const stepOver = toA > fromA && tr.startState.doc.sliceString(fromA, toA) === inserted;
    at = fromA === toA || stepOver ? fromB : -1;
  });
  if (count !== 1 || at < 0) return null;
  const newline = inserted.startsWith("\n");
  const typed = newline ? "\n" : inserted;
  if (!newline && !BOUNDARIES.has(typed)) return null;

  const state = tr.state;
  const line = state.doc.lineAt(at);
  const before = line.text.slice(0, at - line.from);
  if (before === "") return null;
  const noteFrench = noteIsFrench(frontmatterText(state.doc.sliceString(0, FRONTMATTER_SCAN)));
  if (!noteFrench && !looksFrench(line.text)) return null;

  const changes: ChangeSpec[] = [];
  const expect: Plan["expect"] = [];
  const consider = (from: number, to: number, insert: string, word: string | undefined): void => {
    if (word !== undefined && declined.some((d) => d.pos === from && d.word === word)) return;
    if (!isProse(state, to, line.number, state.doc.sliceString(line.from, to))) return;
    changes.push({ from, to, insert });
    expect.push({ from, to, text: state.doc.sliceString(from, to) });
  };

  // The word just finished is what made the line French: the whole line,
  // its earlier words included. Measured against the line WITHOUT that word
  // rather than against the previous keystroke, because the `n` of `bien`
  // tipped the line and the space after it is the first boundary since. (A
  // note that says `lang: fr` never tips — every line of it was French from
  // its first letter.)
  if (!noteFrench) {
    let start = before.length;
    while (start > 0 && /\p{L}/u.test(before.charAt(start - 1))) start -= 1;
    if (start < before.length && !looksFrench(before.slice(0, start) + line.text.slice(before.length))) {
      for (const fix of lineFixes(line.text)) consider(line.from + fix.from, line.from + fix.to, fix.insert, fix.word);
      return changes.length === 0 ? null : { changes, expect };
    }
  }

  const word = wordFix(before);
  if (word !== null) consider(at + word.from, at, word.insert, word.word);
  if (!newline) {
    const typo = typographyFix(before, typed);
    if (typo !== null) consider(at + typo.from, at + typo.to, typo.insert, undefined);
  }
  return changes.length === 0 ? null : { changes, expect };
}

/** Undo turned a correction back into the word as typed — remember it. The
 *  test is on the CHANGE, not on any record of what this plugin did: the
 *  history may have merged or split around it, and what matters is only that
 *  the document went from a target to its source. */
function refusals(tr: Transaction): Declined[] {
  const out: Declined[] = [];
  tr.changes.iterChanges((fromA, toA, fromB, toB) => {
    const was = tr.startState.doc.sliceString(fromA, toA);
    const now = tr.state.doc.sliceString(fromB, toB);
    if (now !== "" && frenchCorrection(now) === was) out.push({ pos: fromB, word: now });
  });
  return out;
}

function apply(view: EditorView, p: Plan): void {
  if (!view.dom.isConnected) return;
  const doc = view.state.doc;
  for (const e of p.expect) {
    if (e.to > doc.length || doc.sliceString(e.from, e.to) !== e.text) return;
  }
  view.dispatch({
    changes: p.changes,
    userEvent: "input.autocorrect",
    annotations: isolateHistory.of("full"),
  });
}

export function frenchAutocorrect(): Extension {
  return ViewPlugin.fromClass(
    class {
      declined: Declined[] = [];
      constructor(readonly view: EditorView) {}
      update(u: ViewUpdate): void {
        if (!u.docChanged) return;
        let pending: Plan | null = null;
        for (const tr of u.transactions) {
          if (!tr.docChanged) continue;
          this.declined = this.declined.map((d) => ({ pos: tr.changes.mapPos(d.pos, 1), word: d.word }));
          const event = tr.annotation(Transaction.userEvent);
          if (event === "undo") {
            this.declined.push(...refusals(tr));
            if (this.declined.length > DECLINED_MAX) this.declined.splice(0, this.declined.length - DECLINED_MAX);
          } else if (event === "input.type" || event === "input") {
            pending = plan(this.view, tr, this.declined);
          } else {
            pending = null;
          }
        }
        if (pending) {
          const p = pending;
          queueMicrotask(() => apply(this.view, p));
        }
      }
    },
  );
}
