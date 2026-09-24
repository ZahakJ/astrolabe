// Searching the settings panel — the part with no JSX in it.
//
// Split from `SettingsSearch.tsx` for a plain reason: Node strips types from a
// `.ts` file and refuses a `.tsx`, so logic that sits beside a component cannot
// be unit-tested at all. The matching rule here is the whole feature — what
// counts as a hit, and what order the hits come back in — and it is exactly the
// part worth pinning.

import { t } from "../../i18n.ts";
import { IS_DESKTOP } from "../../desktop/bridge.ts";
import { SETTINGS_INDEX, type SettingEntry } from "./settingsIndex.ts";
import { foldTerm } from "../../../shared/fold.ts";

/** Rows that exist only where there is an app around the page (DeviceTab's
 *  "This app" group). The index is generated from the panel's source and
 *  cannot know which rows a browser will not draw; a hit that scrolls to
 *  nothing is the failure this module exists to prevent, so these are named
 *  here and dropped from a browser's results. Kept in step by the test that
 *  asserts each name is a real index entry. */
export const DESKTOP_ONLY_ROWS: ReadonlySet<string> = new Set(["rowAppName", "rowAppIcon", "rowUpdates"]);

/** The fold is shared/fold.ts's `foldTerm` — the one every search box in the
 *  product uses (the vault index, the palette, the book reader). This file
 *  kept its own copy of the table once, and once that copy was a complete
 *  no-op (it NFKD-normalised before mapping, which split the hamza-alefs into
 *  a letter and a mark neither class stripped): a bare-alef spelling found
 *  nothing a hamza-spelled label offered, and the test comparing the two
 *  spellings passed vacuously. One table cannot drift from itself. */
function fold(text: string): string {
  return foldTerm(text);
}

export interface SettingHit {
  entry: SettingEntry;
  label: string;
}

/** A WORD-START match, not a substring. `includes` answered "graph" with Text
 *  direction (para*graph*), "date" with What's new (up*date*), "print" with
 *  Footer and "publish" with Comments and Paths — junk that outnumbered the
 *  real hit and taught the reader the search was guessing. A hit now begins a
 *  word: the start of the text, or after anything that is not a letter or a
 *  digit (so `SITE_LANG` still answers "lang", and Arabic words after a
 *  wāw prefix still answer the bare word). An English plural is folded once,
 *  so "fonts" finds the four rows whose help says "font". */
function matches(text: string, q: string): boolean {
  if (text === "") return false;
  const re = (needle: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u");
  if (re(q).test(text)) return true;
  return q.length > 3 && q.endsWith("s") && re(q.slice(0, -1)).test(text);
}

/**
 * `pocket` is the same fact `/api/me` sends and the panel renders from: this
 * vault is a repository cloned onto a phone. Rows the index marks
 * `mode: "instance"` are not drawn there (Publishing, Collections and the
 * whole server-side git tab), and the `mode: "pocket"` rows are not drawn
 * anywhere else — so each is dropped from the other's results for exactly the
 * reason DESKTOP_ONLY_ROWS is: a hit that scrolls to nothing is worse than no
 * hit at all. The caller passes it; this module imports no store.
 */
export function searchSettings(
  query: string,
  desktop: boolean = IS_DESKTOP,
  pocket = false,
): SettingHit[] {
  const q = fold(query.trim());
  if (q === "") return [];
  const hits: { hit: SettingHit; rank: number }[] = [];
  for (const entry of SETTINGS_INDEX) {
    if (!desktop && DESKTOP_ONLY_ROWS.has(entry.label)) continue;
    if (entry.mode !== undefined && entry.mode !== (pocket ? "pocket" : "instance")) continue;
    const label = t(entry.label);
    const hint = entry.hint === undefined ? "" : t(entry.hint);
    const env = entry.env ?? "";
    const inLabel = matches(fold(label), q);
    const inEnv = matches(fold(env), q);
    const inHint = matches(fold(hint), q);
    if (!inLabel && !inEnv && !inHint) continue;
    // A label match is what the reader meant; a help match is a hint that they
    // are close. Ranking rather than filtering, because the help sentence is
    // often where the WORD they are searching for actually lives.
    hits.push({ hit: { entry, label }, rank: inLabel ? 0 : inEnv ? 1 : 2 });
  }
  return hits.sort((a, b) => a.rank - b.rank).map((h) => h.hit);
}
