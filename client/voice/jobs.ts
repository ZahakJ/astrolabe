// A RECORDING, SENT AND FOLLOWED (docs/capture.md "Voice").
//
// The server answers `POST /api/voice` at once with a job and does the work
// behind it; this module polls the job until it lands. Polling, not the
// /api/events stream: a vault event means "a file changed" to every
// subscriber in the app, and "the model is still thinking" is not a file.
// The note the words land in DOES arrive over the stream, as any write does,
// so an open copy of the day's inbox updates itself.
//
// A job outlives its sheet. The sheet may be closed while the model works —
// that is the point of a queue — and then the landing is a toast with the
// note's name and a door to it, exactly as the text capture's is.

import { sendVoiceNote, voiceEngine, voiceJob } from "../api.ts";
import { captureTime } from "../capture.ts";
import { t } from "../i18n.ts";
import { vt } from "./copy.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { actionToast } from "../undoToast.ts";
import { stripNoteExt } from "../../shared/noteFormat.ts";
import type { VoiceEngineState, VoiceJob } from "../../shared/voice.ts";
import { blobToBase64, type Recording } from "./recorder.ts";

const POLL_MS = 1000;
/** A job not heard from in this long is given up on by the SHEET (the server
 *  still finishes it, and the note still lands). */
const GIVE_UP_MS = 30 * 60 * 1000;

function localDate(now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Send one recording, stamped with THIS device's day and minute — the
 *  moment it was spoken, which is what the filename and the bullet say. */
export async function sendRecording(rec: Recording, spokenAt: Date): Promise<VoiceJob> {
  const audio = await blobToBase64(rec.blob);
  return sendVoiceNote(audio, localDate(spokenAt), captureTime(spokenAt));
}

export function finished(job: VoiceJob): boolean {
  return job.status !== "queued" && job.status !== "transcribing";
}

/** Where the words went, as a place: `Inbox/2026-09-23`. The folder is kept
 *  because it is the answer — a bare "2026-09-23" reads as today's daily note,
 *  which is a different note in a different folder. */
export function landedName(path: string): string {
  return stripNoteExt(path);
}

export interface Follow {
  /** The sheet went away: keep following, and toast the landing. */
  detach(): void;
  stop(): void;
}

/** Poll `job` until it lands. `onUpdate` sees every state and the engine's
 *  (for the download's progress while the first job waits on the model). */
export function followJob(
  first: VoiceJob,
  onUpdate: (job: VoiceJob, engine: VoiceEngineState | null) => void,
): Follow {
  let attached = true;
  let stopped = false;
  const started = Date.now();
  const land = (job: VoiceJob): void => {
    if (attached) return;
    const where = job.notePath ? landedName(job.notePath) : "";
    const open = job.notePath ? () => useStore.getState().openNote(job.notePath as string) : null;
    if (job.status === "done" && !job.error && open) {
      actionToast(vt("voiceLandedToast", { name: where }), t("captureOpenNote"), open);
    } else if (open) {
      actionToast(vt("voiceKeptToast", { name: where }), t("captureOpenNote"), open);
    } else {
      toast(vt("voiceFailed"), "error");
    }
  };
  const tick = async (): Promise<void> => {
    if (stopped) return;
    let job: VoiceJob;
    let engine: VoiceEngineState | null = null;
    try {
      job = await voiceJob(first.id);
      if (!finished(job) && attached) engine = await voiceEngine().catch(() => null);
    } catch {
      // A restart forgets its jobs (the recording is in the vault either
      // way); a sheet that polled a 404 forever would be a spinner for ever.
      if (Date.now() - started > GIVE_UP_MS || !attached) {
        stopped = true;
        return;
      }
      setTimeout(() => void tick(), POLL_MS * 3);
      return;
    }
    if (stopped) return;
    onUpdate(job, engine);
    if (finished(job)) {
      stopped = true;
      land(job);
      return;
    }
    if (Date.now() - started > GIVE_UP_MS) {
      stopped = true;
      return;
    }
    setTimeout(() => void tick(), POLL_MS);
  };
  if (finished(first)) onUpdate(first, null);
  else setTimeout(() => void tick(), POLL_MS / 2);
  return {
    detach() {
      attached = false;
    },
    stop() {
      stopped = true;
    },
  };
}
