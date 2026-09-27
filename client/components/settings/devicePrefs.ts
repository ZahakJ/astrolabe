// The hooks the device-kept rows read their values through, shared by every
// section that holds one (the settings purge scattered "This device" to the
// sections whose questions its rows answer — Appearance, Writing, Reading &
// speech, Backup & sync, About).

import { useEffect, useState } from "react";
import { EYE_COMFORT_EVENT } from "../../eyeComfort.ts";

/** A localStorage preference that is NOT in the store, kept live the way its
 *  own module already publishes it: a window event. Most of these have a
 *  second switch elsewhere in the app (the outline's "1.", the toolbar's own
 *  last row), and a settings row that goes stale the moment someone uses the
 *  other switch is a settings row that lies. */
export function useEventPref(event: string, read: () => boolean): boolean {
  const [on, setOn] = useState(read);
  useEffect(() => {
    const sync = (): void => setOn(read());
    window.addEventListener(event, sync);
    return () => window.removeEventListener(event, sync);
  }, [event, read]);
  return on;
}

/** A 0–max level of the eye-comfort sheet (client/eyeComfort.ts), kept live
 *  the same way: the palette's "Warm the screen" flips the same value, and a
 *  slider that stays put while the page turns amber is a slider that lies. */
export function useLevel(read: () => number): number {
  const [level, setLevel] = useState(read);
  useEffect(() => {
    const sync = (): void => setLevel(read());
    window.addEventListener(EYE_COMFORT_EVENT, sync);
    return () => window.removeEventListener(EYE_COMFORT_EVENT, sync);
  }, [read]);
  return level;
}
