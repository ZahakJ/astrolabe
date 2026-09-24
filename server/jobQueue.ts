// ONE AT A TIME, THREE MORE TRIES (docs/webmentions.md).
//
// The webmention fetches and sends (webmentions.db) and the fediverse
// deliveries (activitypub.db) are work the server does on other people's
// servers, and both are queued the same way: rows in a table of their own
// store, run one at a time — a flood of mentions is a line, not a stampede,
// and a slow site holds up nobody but itself for longer than its timeout —
// and a job that fails for a reason that might pass (a network error, a 5xx)
// is tried again three more times with growing waits before it is given up.
// A job that fails for a reason that will not pass (a refusal, a 4xx) is
// finished at once: asking again would be the same answer.
//
// The rows survive a restart; the timer does not need to.

import type { DatabaseSync } from "node:sqlite";

/** Waits before the first, second and third retry. */
export const DEFAULT_BACKOFF_MS: readonly number[] = [60_000, 5 * 60_000, 30 * 60_000];

/** A failure worth another try. Anything else a job throws finishes it. */
export class RetryLater extends Error {}

export interface JobRow {
  id: number;
  kind: string;
  payload: string;
  attempts: number;
}

export interface QueueOptions {
  db: DatabaseSync;
  table: string;
  /** Runs one job. Throw RetryLater to try again; anything else finishes it
   *  as failed (onGiveUp is told). */
  run: (job: JobRow) => Promise<void>;
  /** Told when a job is finished as failed — its last error. */
  onGiveUp?: (job: JobRow, error: string) => void;
  backoffMs?: readonly number[];
}

export class JobQueue {
  private readonly db: DatabaseSync;
  private readonly table: string;
  private readonly run: QueueOptions["run"];
  private readonly onGiveUp: QueueOptions["onGiveUp"];
  backoffMs: readonly number[];
  private timer: NodeJS.Timeout | null = null;
  private pumping: Promise<void> | null = null;
  private again = false;
  private closed = false;

  constructor(opts: QueueOptions) {
    this.db = opts.db;
    this.table = opts.table;
    this.run = opts.run;
    this.onGiveUp = opts.onGiveUp;
    this.backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.db.exec(`CREATE TABLE IF NOT EXISTS ${this.table} (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      kind      TEXT    NOT NULL,
      payload   TEXT    NOT NULL,
      dedupe    TEXT,
      attempts  INTEGER NOT NULL DEFAULT 0,
      nextAt    INTEGER NOT NULL,
      createdMs INTEGER NOT NULL,
      lastError TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_${this.table}_next ON ${this.table} (nextAt, id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_${this.table}_dedupe ON ${this.table} (dedupe) WHERE dedupe IS NOT NULL;`);
  }

  /** Queue a job. With `dedupe`, a job already waiting under the same key is
   *  replaced by this one (a second mention of the same pair while the first
   *  waits is one fetch, of the newest). */
  add(kind: string, payload: unknown, dedupe: string | null = null, delayMs = 0): void {
    const now = Date.now();
    if (dedupe !== null) this.db.prepare(`DELETE FROM ${this.table} WHERE dedupe = ?`).run(dedupe);
    this.db
      .prepare(`INSERT INTO ${this.table} (kind, payload, dedupe, nextAt, createdMs) VALUES (?, ?, ?, ?, ?)`)
      .run(kind, JSON.stringify(payload), dedupe, now + delayMs, now);
    this.kick();
  }

  size(kind?: string): number {
    const row = (kind === undefined
      ? this.db.prepare(`SELECT COUNT(*) AS n FROM ${this.table}`).get()
      : this.db.prepare(`SELECT COUNT(*) AS n FROM ${this.table} WHERE kind = ?`).get(kind)) as { n: number | bigint };
    return Number(row.n);
  }

  /** Start working through what is due, if not already. */
  kick(): void {
    if (this.closed) return;
    if (this.pumping) {
      this.again = true;
      return;
    }
    this.pumping = this.pump().finally(() => {
      this.pumping = null;
      if (this.again) {
        this.again = false;
        this.kick();
      }
    });
  }

  /** Work until nothing is due; resolves when the queue is idle. For the
   *  tests, and for a caller that must know its job has run. */
  async drain(): Promise<void> {
    for (;;) {
      this.kick();
      await this.pumping;
      const due = this.db.prepare(`SELECT id FROM ${this.table} WHERE nextAt <= ? LIMIT 1`).get(Date.now());
      if (!due && !this.pumping) return;
    }
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async pump(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (;;) {
      if (this.closed) return;
      const job = this.db
        .prepare(`SELECT id, kind, payload, attempts FROM ${this.table} WHERE nextAt <= ? ORDER BY nextAt, id LIMIT 1`)
        .get(Date.now()) as unknown as JobRow | undefined;
      if (!job) break;
      try {
        await this.run(job);
        this.db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(job.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const retries = this.backoffMs.length;
        if (err instanceof RetryLater && job.attempts < retries) {
          const wait = this.backoffMs[job.attempts] ?? this.backoffMs[retries - 1] ?? 60_000;
          this.db
            .prepare(`UPDATE ${this.table} SET attempts = attempts + 1, nextAt = ?, lastError = ? WHERE id = ?`)
            .run(Date.now() + wait, message, job.id);
        } else {
          this.db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(job.id);
          try {
            this.onGiveUp?.(job, message);
          } catch (hookErr) {
            console.error(`astrolabe: ${this.table} give-up hook failed:`, hookErr);
          }
        }
      }
    }
    // Sleep until the next job falls due.
    const next = this.db.prepare(`SELECT MIN(nextAt) AS at FROM ${this.table}`).get() as { at: number | bigint | null };
    if (next.at !== null && !this.closed) {
      const wait = Math.max(0, Number(next.at) - Date.now());
      this.timer = setTimeout(() => this.kick(), Math.min(wait, 2_147_000_000));
      this.timer.unref?.();
    }
  }
}
