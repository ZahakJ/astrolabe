// WHAT THE SPEAKER SAYS ABOUT ITSELF, held once for every surface that asks
// (docs/read-aloud.md): the Read aloud row, the Your own voices row and the
// player's voice ▾ all read `GET /api/speak/status` — what is installed, the
// install's progress, the voices folder and what its scan found. One store,
// so a Rescan in one row is the picker's news in the other, and a save that
// moved the folder is seen by the player without a reload.
//
// While an install or a scan runs, the store polls; otherwise it asks when a
// surface mounts, and when told to (a save, a Rescan, an install).

import { useEffect, useSyncExternalStore } from "react";
import { speakRescan, speakStatus } from "../api.ts";
import type { SpeakStatus } from "../../shared/speech.ts";

let status: SpeakStatus | null = null;
let asking: Promise<void> | null = null;
let timer: number | null = null;
const listeners = new Set<() => void>();

function set(next: SpeakStatus | null): void {
  status = next;
  for (const l of listeners) l();
  schedule();
}

function busy(s: SpeakStatus | null): boolean {
  if (!s) return false;
  const p = s.install.phase;
  return p === "fetch-python" || p === "python" || p === "packages" || p === "models" || s.own.scanning;
}

/** Poll while something runs and somebody is looking. */
function schedule(): void {
  if (timer !== null || !busy(status) || listeners.size === 0) return;
  timer = window.setTimeout(() => {
    timer = null;
    void refreshSpeakStatus();
  }, 1500);
}

/** Ask the server again. A visitor's answer (`{ public }`) is not stored. */
export function refreshSpeakStatus(): Promise<void> {
  if (asking) return asking;
  asking = speakStatus()
    .then(
      (s) => {
        if ("engines" in s) set(s);
      },
      () => {},
    )
    .finally(() => {
      asking = null;
    });
  return asking;
}

/** Read the voices folder again; the store holds the answer. */
export async function rescanOwnVoices(): Promise<void> {
  set(await speakRescan());
}

/** The store, after an install call answered with a fresh status. */
export function setSpeakStatus(s: SpeakStatus): void {
  set(s);
}

export function currentSpeakStatus(): SpeakStatus | null {
  return status;
}

/** The status, asked for on mount (once per mount, however many surfaces). */
export function useSpeakStatus(enabled = true): SpeakStatus | null {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      schedule();
      return () => listeners.delete(l);
    },
    () => status,
    () => status,
  );
  useEffect(() => {
    if (enabled) void refreshSpeakStatus();
  }, [enabled]);
  return s;
}
