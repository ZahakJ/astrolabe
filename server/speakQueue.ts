// THE SPEAKER'S LINE — one synthesis at a time (docs/read-aloud.md).
//
// The engine is a CPU job by design, and two at once only make both slower:
// onnxruntime already spreads one synthesis over the cores it is given. So
// requests wait in line, FIFO, the way voice notes do (server/voiceQueue.ts),
// with two differences that come from how a player asks:
//
//   · THE SAME REQUEST TWICE IS ONE JOB. The player prefetches the next
//     sentence while this one plays; a replay, a second tab or two visitors
//     pressing the button on one post ask for the same key. They share the
//     job's promise instead of queueing a second synthesis.
//   · A REQUEST NOBODY WANTS ANY MORE IS DROPPED BEFORE IT RUNS. Stop, or a
//     new selection, aborts the player's fetches; a job whose every asker has
//     gone is skipped when its turn comes, so a stopped paragraph does not
//     keep the machine busy for a minute after the reader walked away. A job
//     already running finishes (it will be cached, and the next replay is
//     free).
//
// The line knows nothing about engines or audio: it is handed a key and a
// thunk, which is what lets tests/speakQueue.test.ts drive it with timers.

export class Abandoned extends Error {
  constructor() {
    super("Nobody is waiting for this any more");
    this.name = "AbortError";
  }
}

interface Job<T> {
  key: string;
  run: () => Promise<T>;
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  askers: number;
}

export interface SpeakQueue<T> {
  /** Run `run` for `key` in its turn, or join the job already asked for. */
  submit(key: string, run: () => Promise<T>, signal?: AbortSignal): Promise<T>;
  /** Jobs waiting behind the one running. */
  waiting(): number;
  busy(): boolean;
}

export function createSpeakQueue<T>(): SpeakQueue<T> {
  const line: Job<T>[] = [];
  const byKey = new Map<string, Job<T>>();
  let running = false;

  async function pump(): Promise<void> {
    if (running) return;
    running = true;
    try {
      for (let job = line.shift(); job; job = line.shift()) {
        if (job.askers <= 0) {
          byKey.delete(job.key);
          job.reject(new Abandoned());
          continue;
        }
        try {
          job.resolve(await job.run());
        } catch (err) {
          job.reject(err);
        } finally {
          byKey.delete(job.key);
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    submit(key, run, signal) {
      let job = byKey.get(key);
      if (!job) {
        let resolve!: (v: T) => void;
        let reject!: (e: unknown) => void;
        const promise = new Promise<T>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        // An abandoned job's rejection is for its askers, each of whom has
        // their own; the shared promise must not be an unhandled one.
        promise.catch(() => {});
        job = { key, run, promise, resolve, reject, askers: 0 };
        byKey.set(key, job);
        line.push(job);
      }
      const mine = job;
      mine.askers++;
      if (signal?.aborted) {
        mine.askers--;
        return Promise.reject(new Abandoned());
      }
      const asked = new Promise<T>((resolve, reject) => {
        let settled = false;
        const onAbort = (): void => {
          if (settled) return;
          settled = true;
          mine.askers--;
          reject(new Abandoned());
        };
        signal?.addEventListener("abort", onAbort, { once: true });
        mine.promise.then(
          (v) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            resolve(v);
          },
          (e) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            reject(e);
          },
        );
      });
      void pump();
      return asked;
    },
    waiting: () => line.length,
    busy: () => running,
  };
}
