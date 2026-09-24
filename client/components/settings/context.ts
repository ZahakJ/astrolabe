// What a tab body reads: the form in hand, already loaded. A context rather
// than props because the seven server tabs each take a different dozen of the
// form's thirty handles, and the hosts (the desktop dialog, a phone Settings
// screen) should not have to know which. The provider is mounted only once
// the settings have arrived, so `form`, `eff` and `inh` are never null in a
// tab — the same promise the dialog's `form && eff && inh &&` made.

import { createContext, useContext } from "react";
import type { SettingsResponse } from "../../../shared/types.ts";
import type { Form } from "./form.ts";
import type { SettingsFormState } from "./useSettingsForm.ts";

export type SettingsTabCtx = Omit<SettingsFormState, "form" | "eff" | "inh" | "loaded"> & {
  form: Form;
  loaded: SettingsResponse;
  eff: SettingsResponse["effective"];
  inh: SettingsResponse["inherited"];
};

export const SettingsContext = createContext<SettingsTabCtx | null>(null);

export function useSettings(): SettingsTabCtx {
  const ctx = useContext(SettingsContext);
  if (ctx === null) throw new Error("a settings tab outside its form");
  return ctx;
}

/** The context value for a form that has loaded, or null while it has not. */
export function loadedCtx(s: SettingsFormState): SettingsTabCtx | null {
  if (!s.form || !s.loaded || !s.eff || !s.inh) return null;
  return { ...s, form: s.form, loaded: s.loaded, eff: s.eff, inh: s.inh };
}
