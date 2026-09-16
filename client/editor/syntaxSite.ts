// WHERE PROSE RULES DO NOT APPLY. The popups that open on a typed character
// — `#` for a tag (autocomplete.ts), `@` for a date (dateMention.ts) — are
// prose affordances, and the same character inside a code fence, a URL or
// a math block is syntax: a `#` in a fence is a comment or a colour, a `@`
// in an autolink is an address. One test, asked by every trigger, so no
// popup can ever be the one that forgot to ask.

import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

/** Is `pos` somewhere prose rules don't apply — code, or a link/URL? */
export function inCodeOrLink(state: EditorState, pos: number): boolean {
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
    node;
    node = node.parent
  ) {
    if (/Code|URL|Autolink|Link|HTML|Math/.test(node.name)) return true;
  }
  return false;
}
