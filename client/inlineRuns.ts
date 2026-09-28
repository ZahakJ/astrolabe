// THE WORDS OF A LINE OUTSIDE A NOTE, as runs: plain text, or a wikilink
// with the label a reader sees and the note it resolves to. Pure — no DOM,
// no store — so tests/inlineRuns.test.ts reads it under node; the doors that
// draw and follow the runs are ./inlineLinks.tsx, which says why they exist.
//
// The label is the alias when one was written, else the target's last
// segment: a slot that says `review [[Orbits/Japanese/Kana]]` reads "review
// Kana", as the desktop's sigil card has always drawn it.

import { stripNoteExt } from "../shared/noteFormat.ts";
import type { TreeNode } from "../shared/types.ts";
import { parseWikilink, resolveLink } from "./editor/links.ts";
import { twinSwapFor } from "./twinSwap.ts";

/** A run of a line: plain words, or one wikilink resolved against the tree. */
export type InlineRun =
  | { kind: "text"; text: string }
  | { kind: "link"; target: string; heading: string | null; label: string; path: string | null };

/** `[[…]]` and `![[…]]` — an embed out of its note is a mention of the file. */
const LINK_RE = /!?\[\[([^[\]]+?)\]\]/g;

function labelOf(target: string, heading: string | null, alias: string | null): string {
  if (alias !== null && alias.trim() !== "") return alias.trim();
  const name = target ? (stripNoteExt(target).split("/").pop() ?? target) : "";
  if (heading) return name ? `${name} › ${heading}` : heading;
  return name;
}

/** The line as runs, each wikilink resolved as the reading renderer resolves
 *  it (the tree, then the link-time swap, shared/twins.ts). */
export function inlineRuns(text: string, tree: TreeNode | null): InlineRun[] {
  const out: InlineRun[] = [];
  let at = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ kind: "text", text: text.slice(at, i) });
    const { target, heading, alias } = parseWikilink(m[1]);
    const label = labelOf(target, heading ?? null, alias ?? null);
    // `[[#Heading]]` points inside the note it was written in; out here
    // there is no such note to scroll, so it reads as its words.
    if (target === "") out.push({ kind: "text", text: label });
    else out.push({ kind: "link", target, heading: heading ?? null, label, path: resolveLink(target, tree) ?? twinSwapFor(target) });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
  return out;
}

/** The words a reader sees, as a string: each link by its label, and the
 *  emphasis marks a line of prose does not show. */
export function inlinePlain(text: string): string {
  return text
    .replace(LINK_RE, (_m, inner: string) => {
      const { target, heading, alias } = parseWikilink(inner);
      return labelOf(target, heading ?? null, alias ?? null);
    })
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/^#{1,6}\s+/, "");
}
