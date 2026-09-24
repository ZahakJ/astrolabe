// What every phone screen can reach: the navigation, and the few verbs built
// on it. A context rather than props, because a sheet opened from a row four
// components down (the tree's long-press, a heading's) needs the same `nav`
// the shell holds, and threading it through every list would make each list a
// part of the shell rather than a thing the shell shows.

import { createContext, useContext } from "react";
import type { Nav, NavState, Screen, TabId } from "./nav.ts";

export interface SheetData {
  /** Anything the sheet's renderer needs that a history entry cannot carry
   *  (rows with callbacks, the node a long-press landed on). A sheet whose
   *  data is gone — restored by a Forward press after a reload — simply does
   *  not draw, and the shell steps back over it. */
  [key: string]: unknown;
}

/** How `open` places a screen: `auto` lets a tablet REPLACE the detail
 *  beside the list; `push` always stacks (a step deeper into what is open). */
export type OpenHow = "auto" | "push";

/** A screen that may refuse to be left: a Settings section holding edits. */
export interface LeaveGuard {
  /** Are there edits a move would lose? Read at the moment of the move. */
  dirty(): boolean;
  /** Put the edits back: the reader chose to leave without them. */
  discard(): void;
}

export interface PhoneApi {
  nav: Nav;
  state: NavState;
  /** Two columns: a rail, a list and the note beside it. */
  tablet: boolean;
  /** A hardware keyboard has been seen (client/phone/hardwareKeyboard.ts). */
  keyboard: boolean;
  /** Open a screen. On a tablet, a note picked from the list column REPLACES
   *  the note beside it rather than stacking — the list is the navigation
   *  there, and forty notes read in a row are not forty steps back. */
  open(screen: Screen, how?: OpenHow): void;
  openOn(tab: TabId, screen: Screen): void;
  openSheet(id: string, data?: SheetData): void;
  closeSheet(id?: string): void;
  sheetData(id: string): SheetData | undefined;
  /** Register (or with null, drop) the guard for the screen keyed `key`
   *  (nav.ts `screenKey`): while it is dirty, every move off that screen —
   *  Back, a tab, a push — asks before discarding. */
  setGuard(key: string, guard: LeaveGuard | null): void;
}

export const PhoneContext = createContext<PhoneApi | null>(null);

export function usePhone(): PhoneApi {
  const api = useContext(PhoneContext);
  if (api === null) throw new Error("usePhone outside the phone shell");
  return api;
}
