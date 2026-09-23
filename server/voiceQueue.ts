// THE VOICE QUEUE — one transcription at a time (docs/capture.md "Voice").
//
// A model that fills a GPU's memory is not something to run twice at once: two
// recordings sent a second apart would each load, each allocate, and on a card
// that is also running somebody's chat model the second would fail for want of
// memory the first was about to give back. So jobs wait in line, FIFO, and the
// machine does one thing at a time. The line is per process — the whole world
// for a vault, the same assumption server/clip.ts's write queue makes.
//
// The queue knows nothing about whisper, files or notes. It is handed three
// verbs and runs them in order, which is what lets tests/voice.test.ts drive
// it with a fake engine and a fake vault:
//
//   transcribe   the recording → words (or a thrown error)
//   land         the words (or null) → where they were written
//   discard      the recording is not wanted any more ("keep the audio" off)
//
// THE RECORDING IS NEVER THE THING THAT IS LOST. It is in the vault before the
// job is queued; a transcription that fails still lands a bullet linking it,
// and "keep the audio: off" only ever deletes it AFTER words have landed.

import { randomUUID } from "node:crypto";
import type { VoiceJob, VoiceLanguage } from "../shared/voice.ts";

export interface VoiceWork {
  /** The recording's vault path. */
  audio: string;
  /** The device's own date and time when the recording was made. */
  date: string;
  time: string;
  language: VoiceLanguage;
  keepAudio: boolean;
}

export interface Transcript {
  text: string;
  language: string | null;
}

export interface Landing {
  notePath: string;
  kind: "bullet" | "note";
}

export interface VoiceQueueDeps {
  transcribe(work: VoiceWork): Promise<Transcript>;
  /** `audio` is null when the recording is not to be linked (discarded). */
  land(work: VoiceWork, transcript: string | null, audio: string | null): Promise<Landing>;
  discard(audio: string): Promise<void>;
}

/** How many finished jobs are remembered for the sheet to poll. A job is
 *  asked about for seconds after it finishes, not days. */
const KEEP_FINISHED = 64;

export interface VoiceQueue {
  submit(work: VoiceWork): VoiceJob;
  get(id: string): VoiceJob | null;
  /** Jobs waiting, not counting the one running. */
  waiting(): number;
  busy(): boolean;
  /** Resolves when the line is empty — the tests' only way to wait. */
  idle(): Promise<void>;
}

/** Why a job failed, as a code the client words (`voiceFail…`). An engine may
 *  throw an Error whose `code` names one; anything else is `engine`. */
function failureCode(err: unknown): string {
  const code = (err as { code?: unknown })?.code;
  return typeof code === "string" && /^[a-zA-Z]+$/.test(code) ? code : "engine";
}

export function createVoiceQueue(deps: VoiceQueueDeps): VoiceQueue {
  const jobs = new Map<string, VoiceJob>();
  const line: { job: VoiceJob; work: VoiceWork }[] = [];
  let running = false;
  let drained: (() => void)[] = [];

  function remember(job: VoiceJob): void {
    jobs.set(job.id, job);
    // Oldest FINISHED jobs go first; a queued or running one is never
    // forgotten while somebody may be waiting on it.
    if (jobs.size <= KEEP_FINISHED) return;
    for (const [id, j] of jobs) {
      if (jobs.size <= KEEP_FINISHED) break;
      if (j.status !== "queued" && j.status !== "transcribing") jobs.delete(id);
    }
  }

  async function run(job: VoiceJob, work: VoiceWork): Promise<void> {
    job.status = "transcribing";
    let transcript: Transcript | null = null;
    try {
      transcript = await deps.transcribe(work);
    } catch (err) {
      console.error("voice: transcription failed:", err);
      job.error = failureCode(err);
    }
    const words = transcript?.text.trim() ?? "";
    // Keep the recording unless there are words to show for it AND the owner
    // asked not to — a failed or empty transcript keeps it whatever the
    // setting says, because then the recording is all there is.
    const keep = work.keepAudio || words === "";
    try {
      const landed = await deps.land(work, words === "" ? null : words, keep ? work.audio : null);
      job.notePath = landed.notePath;
      job.kind = landed.kind;
      if (!keep) {
        try {
          await deps.discard(work.audio);
          job.audio = null;
        } catch (err) {
          // Not a failure of the job: the words are in the vault, and a
          // recording that could not be deleted is still a recording.
          console.error("voice: could not discard the recording:", err);
        }
      }
    } catch (err) {
      console.error("voice: could not write the note:", err);
      job.error = job.error ?? "write";
      job.status = "failed";
      return;
    }
    if (transcript !== null) {
      job.transcript = words;
      job.language = transcript.language ?? undefined;
    }
    job.status = job.error ? "failed" : "done";
    if (!job.error && words === "") job.error = "silence";
  }

  async function pump(): Promise<void> {
    if (running) return;
    running = true;
    try {
      for (let next = line.shift(); next; next = line.shift()) {
        for (const [i, w] of line.entries()) w.job.ahead = i;
        next.job.ahead = undefined;
        await run(next.job, next.work);
      }
    } finally {
      running = false;
      const waiters = drained;
      drained = [];
      for (const resolve of waiters) resolve();
    }
  }

  return {
    submit(work) {
      const job: VoiceJob = { id: randomUUID(), status: "queued", audio: work.audio, ahead: line.length + (running ? 1 : 0) };
      remember(job);
      line.push({ job, work });
      void pump();
      return { ...job };
    },
    get(id) {
      const job = jobs.get(id);
      return job ? { ...job } : null;
    },
    waiting: () => line.length,
    busy: () => running,
    idle() {
      if (!running && line.length === 0) return Promise.resolve();
      return new Promise((resolve) => drained.push(resolve));
    },
  };
}
