// QUICK CAPTURE — the flow behind the sheet (components/CaptureSheet.tsx).
//
// A line typed anywhere in the app lands under `## Captured` in today's note
// or in the note pinned as the inbox (Settings → Vault → Capture inbox),
// stamped with the time. The sheet is the surface; this is the order of
// operations, which matters more than it looks:
//
//   1. Today's note is made through the DAILY-NOTE DOOR (client/daily.ts),
//      so a note the capture creates carries the daily template exactly as
//      Ctrl/Cmd+Alt+D would have given it. The server can append to a note
//      it has to create (the phone's share sheet has no other way), but a
//      note made that way is bare, and this client can do better.
//   2. The target's open buffer, if there is one, is FLUSHED first. The
//      append is a server-side write with the file's mtime as its
//      precondition; typing that has not been saved yet would either be
//      refused (409) or, worse, be overwritten by the next autosave.
//   3. The server appends (`POST /api/capture`) — one write, one event.
//   4. The open buffer ADOPTS the new text. The SSE echo would do this on
//      its own, except that step 2 just saved, and the shell reads a
//      "changed" that arrives within a few seconds of our own save as our
//      own echo (App.tsx, SELF_SAVE_WINDOW_MS). So the adoption is asked for
//      here, explicitly, where it is known to be wanted.

import { captureLine } from "./api.ts";
import { ensurePeriodicNote } from "./daily.ts";
import { adoptExternalChange, flushBufferPath } from "./editor/bufferBridge.ts";
import { useStore } from "./state.ts";
import { templateSettings } from "./templates.ts";

export type CaptureTarget = "daily" | "inbox";

/** The note pinned as the inbox, or null. From the same cached settings the
 *  template commands read, so the sheet opens without a round trip. */
export async function captureInbox(): Promise<string | null> {
  try {
    return (await templateSettings()).captureInbox;
  } catch {
    return null;
  }
}

/** `HH:MM` on this device's clock — the stamp the line carries. Western
 *  digits by construction, like the daily note's own filename: the note is a
 *  file, and a time in it is an address, not chrome. */
export function captureTime(now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(now.getHours())}:${p(now.getMinutes())}`;
}

/** Capture `text` into `target`. Resolves with the note's path, or null when
 *  today's note could not be made (the daily door has already said why). */
export async function capture(text: string, target: CaptureTarget): Promise<string | null> {
  let path: string;
  if (target === "inbox") {
    const inbox = await captureInbox();
    if (!inbox) throw new Error("no inbox");
    path = inbox;
  } else {
    // From TODAY, explicitly: the daily door otherwise walks from the open
    // note when that note is itself a daily note, and a line captured while
    // reading last month's page would land on last month — while the sheet
    // says "Today's note".
    const ensured = await ensurePeriodicNote("day", 0, new Date());
    if (ensured === null) return null;
    path = ensured.path;
  }
  await flushBufferPath(path);
  const result = await captureLine(text, path, captureTime());
  const adopted = await adoptExternalChange(result.path);
  // The reading view holds no buffer to adopt into; a remount re-reads it.
  // A tab that is open but not showing has no buffer either, and fetches
  // fresh when it is shown again.
  const store = useStore.getState();
  if (!adopted && store.openPath === result.path) store.bumpReload();
  return result.path;
}
