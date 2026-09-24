// What KIND of screen a screen is — the three questions the shell asks of
// every one before it draws it.
//
//   · A LIST is a place you pick from: the five roots, a folder, a tag, the
//     decks, the sigils, the shelf of trackers, the bookshelf, the Timeline
//     (3.28: a list of days whose rows open notes), Settings. It
//     keeps the tab bar under it on a phone, and on a tablet it is what the
//     list column shows.
//   · A DETAIL is what a list opened: a note, a deck, a sigil, a tracker, a
//     Settings section, the graph. It hides the tab bar on a phone (the top
//     bar's ‹ is the way out) and takes the column beside the list on a
//     tablet.
//   · A FULL screen is a detail that wants the whole glass even on a tablet:
//     a study session and a book. The list column steps aside for it.
//
// And one more: which CONTENT the store shows while a screen is on top, so a
// surface that closes itself (a session's "back to the shelf") can be met by
// the stack going back down to the screen that shows it, rather than by a
// second copy of that screen pushed on top.

import { FEEDS_TAB, isBookPath, isFeedsTab, isMediaTab, isOrbitsTab, isRoutinesTab, isTimelineTab, MEDIA_TAB, orbitsSessionOf, ORBITS_TAB, ROUTINES_TAB } from "../workspace.ts";
import type { Screen } from "./nav.ts";

const LIST_SURFACES = (tab: string): boolean =>
  tab === "~library" || isRoutinesTab(tab) || isTimelineTab(tab) || isMediaTab(tab) || isFeedsTab(tab) || (isOrbitsTab(tab) && orbitsSessionOf(tab) === null);

export function isList(s: Screen): boolean {
  switch (s.kind) {
    case "root":
    case "folder":
    case "tag":
      return true;
    case "settings":
      return s.section === "";
    case "surface":
      return LIST_SURFACES(s.tab);
    default:
      return false;
  }
}

export function isDetail(s: Screen): boolean {
  return !isList(s);
}

export function isFull(s: Screen): boolean {
  return s.kind === "surface" && (orbitsSessionOf(s.tab) !== null || isBookPath(s.tab));
}

/** The workspace content the store holds while `s` is on top, or null for a
 *  screen that does not change it (a root, a folder, Settings). */
export function contentOf(s: Screen): string | null {
  switch (s.kind) {
    case "note":
      return s.path;
    case "surface":
      return s.tab;
    case "deck":
      return ORBITS_TAB;
    case "sigil":
      return ROUTINES_TAB;
    case "tracker":
      return MEDIA_TAB;
    case "feed-item":
      return FEEDS_TAB;
    default:
      return null;
  }
}
