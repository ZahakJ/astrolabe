// THE LINK-TIME SWAP, on the reading side.
//
// An Arabic reader follows `[[Quantum Computers]]` out of an Arabic post. The
// note it names is English, and under the language filter it is not in the
// tree this reader was served — so the link resolves to nothing and renders
// as a broken one, while the Arabic face of that very note sits one file
// away, fully readable. This table is the missing half: the server builds it
// per reader (server/indexer.ts twinSwapTable) and it says, for a link key
// this reader cannot follow, the path of the face they can.
//
// A MODULE-LEVEL TABLE rather than a store read, because the consulting code
// is the reading renderer's per-link hot path and it already reaches for the
// tree the same way. Empty until the store fills it — and EMPTY FOREVER in
// the editor, because the server refuses to build one for an admin scope. The
// author linked what they linked; a wikilink that landed somewhere else while
// they were writing would make the vault unwritable.

import { twinSwapKey } from "../shared/twins.ts";

let table: Record<string, string> = {};

/** Replace the table (client/state.ts, with every tree refresh). */
export function setTwinSwapTable(next: Record<string, string>): void {
  table = next;
}

/** The face THIS reader can read for a wikilink target the resolver could not
 *  answer, or null. Consulted only after an ordinary resolution has failed,
 *  so a link that lands is never redirected. */
export function twinSwapFor(target: string): string | null {
  return table[twinSwapKey(target)] ?? null;
}
