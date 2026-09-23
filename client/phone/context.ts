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
  open(screen: Screen): void;
  openOn(tab: TabId, screen: Screen): void;
  openSheet(id: string, data?: SheetData): void;
  closeSheet(id?: string): void;
  sheetData(id: string): SheetData | undefined;
}

export const PhoneContext = createContext<PhoneApi | null>(null);

export function usePhone(): PhoneApi {
  const api = useContext(PhoneContext);
  if (api === null) throw new Error("usePhone outside the phone shell");
  return api;
}
