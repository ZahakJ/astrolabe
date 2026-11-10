// WHERE A LINE'S WORDS START, past the Markdown that makes it a block.
//
// The bug (2026-11 purge, E2): Ctrl+B over a selection of whole lines wrapped
// the block marker with the words — `**- alpha**`, `*## Heading*`,
// `**> quote**` — which stops a list item being a list item, drops a heading
// out of the outline and a quote out of its bar. A format wraps the WORDS; the
// marker that says what kind of line they sit on stays outside it.
//
// Pure, so the rule has a test without a browser (tests/linePrefix.test.ts).

/** Indent, any number of `>` quote marks, then at most one of: a heading's
 *  hashes, a bullet or a number (each with an optional task box). The marker
 *  needs its following space — `#tag` and `-5` are words, not markers. */
const BLOCK_PREFIX = /^[ \t]*(?:>[ \t]?)*[ \t]*(?:#{1,6}[ \t]+|(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)?/;

/** The length of the block marker at the start of `line` (0 when none). */
export function blockPrefixLength(line: string): number {
  return BLOCK_PREFIX.exec(line)?.[0].length ?? 0;
}
