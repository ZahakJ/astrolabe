// THE MODAL'S CARD LINES — the textarea's text as cards. Pure and apart
// from the form so the node tests can read it (they cannot import a .tsx).

import type { NewCard } from "../../shared/decks.ts";

/** `front::back` and `front::back::extra` lines, one card each. A line
 *  without `::` is not a card and is not counted. The plugin's `:::` is
 *  read as the same separator — the pair it asks for is the "Both ways"
 *  kind, and a third colon must not turn the back into an empty extra. */
export function cardsOfText(text: string): NewCard[] {
  const out: NewCard[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || !line.includes("::")) continue;
    const parts = line.split(/:::?/).map((p) => p.trim());
    if (parts.length < 2 || parts[0] === "" || parts[1] === "") continue;
    out.push({ front: parts[0], back: parts[1], extra: parts.length > 2 && parts.slice(2).join("::") !== "" ? parts.slice(2).join("::") : null });
  }
  return out;
}
