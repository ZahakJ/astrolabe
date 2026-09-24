// What every slice of the store is handed: the creator's set and get, and the
// few values the creator computes before its slices run.

import type { State } from "./types.ts";
import type { StoreApi } from "zustand";
import type { ThemeChoice } from "../themes.ts";

/** The store creator's own two functions, as its slices receive them. */
export type StoreSet = StoreApi<State>["setState"];
export type StoreGet = StoreApi<State>["getState"];
/** What the creator computes before its slices and hands to the ones that
 *  need it: the theme it booted in, and the three session steps. */
export interface StoreCtx {
  initialTheme: ThemeChoice;
  enterVault: () => Promise<void>;
  restoreSession: () => Promise<void>;
  openLaunchDoor: () => void;
}
