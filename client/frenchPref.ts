// AUTO-CORRECT FRENCH — the device switch, and nothing else.
//
// One preference, read by the editor on every word boundary
// (client/editor/frenchAutocorrect.ts) and set by one row in Settings → This
// device. It lives in its own module, with no CodeMirror in it, for the
// reason client/eyeComfort.ts and client/reading/headingNumbers.ts do: the
// settings panel must not pull the editor chunk into the first paint to draw
// a toggle, and the editor must not import a React tab to read it.
//
// ON by default. The owner writes French and asked for this; a switch that
// ships off is a feature the person who asked for it has to go and find.
// It TRAVELS with the vault (client/prefsSync.ts): whether your French is
// corrected is a fact about you, not about the window you are sitting at.

const KEY = "astrolabe.frenchAutocorrect";
export const FRENCH_AUTOCORRECT_EVENT = "astrolabe:french-autocorrect";

/** The setting as stored: anything but an explicit "off" is on. */
export function frenchAutocorrectEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setFrenchAutocorrectEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // A blocked localStorage costs the preference, never the editor.
  }
  window.dispatchEvent(new CustomEvent(FRENCH_AUTOCORRECT_EVENT, { detail: on }));
}
