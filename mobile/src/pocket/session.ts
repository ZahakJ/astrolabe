/**
 * ONE POCKET VAULT, ASSEMBLED.
 *
 * The filesystem, the index, the repository and the server are four things
 * with one lifetime; this is the thing that has that lifetime. It is what the
 * connection screen builds to clone, and what the pocket page builds to open.
 *
 * It also owns the SYNC LOOP, which is four rules and no cleverness:
 *
 *   pull on open · pull on foreground · commit on save · push, debounced 30s
 *                                                        and on background
 *
 * The debounce is the only number with an argument behind it: typing a
 * paragraph is nine saves and nine commits, and nine pushes over a phone
 * network is nine chances for one of them to be the one that fails. Thirty
 * seconds makes it one push, and putting the phone down still gets the writing
 * out before the laptop is open.
 */

import type { PocketSyncStatus, VaultEvent } from "../../../shared/types.ts";
import { PocketIndex } from "./index.ts";
import { PocketRepo } from "./git.ts";
import { createPocketServer, type PocketRequest, type PocketResponse } from "./server.ts";
import { createVaultIo, isHiddenPath } from "./vaultIo.ts";
import { isNote } from "./index.ts";
import { standingConflicts } from "./conflict.ts";
import { PUSH_DEBOUNCE_MS, initialSyncState, syncReduce, type SyncEvent, type SyncState } from "./sync.ts";
import type { PocketFs } from "./fs.ts";
import type { GitHttpClient } from "./transport.ts";

export interface PocketSessionOptions {
  fs: PocketFs;
  http: GitHttpClient;
  /** The clone's root inside the app's private storage. */
  dir: string;
  repo: { fullName: string; branch: string; cloneUrl: string };
  headers: Record<string, string>;
  author: { name: string; email: string };
  base: { read(): Promise<string | null>; write(sha: string): Promise<void> };
  store: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void> };
  onSync?: (state: SyncState) => void;
  onEvent?: (event: VaultEvent) => void;
  /** Forget which repository this phone opens and the token that reaches it,
   *  so the next launch is the connection screen. Lives in the caller because
   *  it is Preferences (pocket/store.ts) and a session knows nothing about
   *  them; absent means the settings panel's "Leave this vault" is refused
   *  with a reason rather than half-performed. */
  onLeave?: () => Promise<void>;
  now?: () => number;
}

export class PocketSession {
  readonly index = new PocketIndex();
  readonly repo: PocketRepo;
  private readonly io;
  private readonly server;
  private readonly now: () => number;
  private state: SyncState = initialSyncState;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  /** One at a time, always: a pull racing a push is a repository in two states. */
  private turn: Promise<unknown> = Promise.resolve();

  // Spelled out rather than a constructor parameter property: Node's type
  // stripping is strip-only, and a parameter property is syntax it refuses
  // rather than erases.
  private readonly options: PocketSessionOptions;

  constructor(options: PocketSessionOptions) {
    this.options = options;
    this.now = options.now ?? (() => Date.now());
    this.io = createVaultIo(options.fs, options.dir);
    this.repo = new PocketRepo({
      fs: options.fs,
      http: options.http,
      dir: options.dir,
      url: options.repo.cloneUrl,
      branch: options.repo.branch,
      headers: options.headers,
      author: options.author,
      base: options.base,
    });
    this.server = createPocketServer({
      io: this.io,
      git: {
        commit: (message, paths) => this.repo.commit(message, paths),
        history: (path, limit) => this.repo.history(path, limit),
        blobAt: (path, sha) => this.repo.blobAt(path, sha),
      },
      store: options.store,
      index: this.index,
      repo: { name: options.repo.fullName, branch: options.repo.branch },
      // The settings panel's Backup & sync tab, in a pocket vault, is about
      // THIS: the same state the shell's strip shows, the same pull and push,
      // and the door back to the connection screen. `onLeave` is optional, so
      // a session built without one refuses the door rather than forgetting
      // half of what makes a vault openable.
      shell: {
        syncState: () => this.syncStatus(),
        syncNow: async () => {
          await this.pull();
          await this.push();
          return this.syncStatus();
        },
        leave: async () => {
          if (!options.onLeave) throw new Error("This phone cannot forget a vault it did not choose");
          await options.onLeave();
        },
      },
      now: this.now,
      onEvent: options.onEvent,
      onCommit: () => {
        this.dispatch({ kind: "committed" });
        this.schedulePush();
      },
    });
  }

  handle(request: PocketRequest): Promise<PocketResponse> {
    return this.server.handle(request);
  }

  syncState(): SyncState {
    return this.state;
  }

  /** The same state, on the wire, for the settings panel. The shell's strip
   *  and the panel's line are one truth with two renderings — the rule that
   *  chooses the words is still `syncLine` in pocket/sync.ts, and the client
   *  applies it to these numbers. */
  syncStatus(): PocketSyncStatus {
    return {
      repo: this.options.repo.fullName,
      branch: this.options.repo.branch,
      phase: this.state.phase,
      ahead: this.state.ahead,
      syncedAtMs: this.state.syncedAtMs,
      online: this.state.online,
      error: this.state.error,
      conflicts: this.state.conflicts.map((pair) => ({ path: pair.path, phonePath: pair.phonePath })),
    };
  }

  private dispatch(event: SyncEvent): void {
    this.state = syncReduce(this.state, event);
    this.options.onSync?.(this.state);
  }

  /** Read the whole working tree into the index. Called once after a clone
   *  and once per open; a pull updates only what it changed. */
  async build(): Promise<{ notes: number; assets: number; ms: number }> {
    const started = this.now();
    for (const file of await this.io.list()) {
      if (isHiddenPath(file.path)) continue;
      if (isNote(file.path)) {
        const content = await this.io.readText(file.path);
        if (content !== null) this.index.put(file.path, content, file.mtimeMs);
      } else {
        this.index.putAsset(file.path, file.size, file.mtimeMs);
      }
    }
    // The first sync line the shell ever shows, read from the REPOSITORY and
    // the TREE rather than assumed to be nothing: an app reopened after a
    // failed push must not say "synced", and one reopened with two unresolved
    // `(phone)` pairs must still name them.
    this.state = {
      ...this.state,
      ahead: await this.repo.ahead(),
      conflicts: standingConflicts(this.index.notes.keys()),
    };
    this.options.onSync?.(this.state);
    return { notes: this.index.notes.size, assets: this.index.assets.size, ms: this.now() - started };
  }

  /** One serialized turn of the repository. */
  private queue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.turn.then(work, work);
    this.turn = next.catch(() => undefined);
    return next;
  }

  async pull(): Promise<void> {
    await this.queue(async () => {
      this.dispatch({ kind: "pull-started" });
      try {
        const result = await this.repo.pull();
        for (const path of result.removed) this.index.remove(path);
        for (const path of result.changed) {
          if (isHiddenPath(path)) continue;
          const stat = await this.io.stat(path);
          if (!stat) {
            this.index.remove(path);
            continue;
          }
          if (isNote(path)) {
            const content = await this.io.readText(path);
            if (content !== null) this.index.put(path, content, stat.mtimeMs);
          } else this.index.putAsset(path, stat.size, stat.mtimeMs);
        }
        if (result.changed.length > 0 || result.removed.length > 0) {
          // One "re-read everything you hold" rather than a frame per file: a
          // pull is exactly the storm the client's bulk event exists for.
          this.options.onEvent?.({ kind: "bulk", path: "" });
        }
        this.dispatch({ kind: "pull-done", conflicts: result.conflicts });
        if (result.conflicts.length > 0) this.schedulePush();
      } catch (err) {
        this.dispatch(offlineOrFailed(err));
      }
    });
  }

  /** Send what is waiting. Safe to call when nothing is: it answers at once. */
  async push(): Promise<void> {
    if (this.pushTimer !== null) {
      clearTimeout(this.pushTimer);
      this.pushTimer = null;
    }
    await this.queue(async () => {
      if ((await this.repo.ahead()) === 0) {
        this.dispatch({ kind: "push-done", atMs: this.now() });
        return;
      }
      this.dispatch({ kind: "push-started" });
      try {
        await this.repo.push();
        this.dispatch({ kind: "push-done", atMs: this.now() });
      } catch (err) {
        // A push refused as non-fast-forward means the remote moved while we
        // were writing. That is a pull, and the pull is where the conflict
        // contract lives — so it is asked for, and the push that follows it
        // carries both versions.
        if (/fast.?forward|rejected|non-fast/i.test(String((err as Error)?.message ?? err))) {
          this.dispatch({ kind: "failed", message: "remote-moved" });
          void this.pull().then(() => this.push());
          return;
        }
        this.dispatch(offlineOrFailed(err));
      }
    });
  }

  private schedulePush(): void {
    if (this.pushTimer !== null) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.push();
    }, PUSH_DEBOUNCE_MS);
  }

  /** Foreground: catch up. Background: get the writing out before the phone
   *  is put down, because "later" on a phone can be days. */
  installLifecycle(): () => void {
    const onHide = (): void => {
      // The tree, then the network: a phone put down mid-sentence must not
      // come back to a filesystem that has the bytes and not the names
      // (see PocketFs.flush).
      void this.options.fs.promises.flush?.();
      void this.push();
    };
    const onVisible = (): void => {
      if (document.visibilityState === "visible") void this.pull();
      else onHide();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
    };
  }
}

/** A network that is not there is not a failure worth a sentence about git. */
function offlineOrFailed(err: unknown): SyncEvent {
  const message = String((err as Error)?.message ?? err);
  if (/network|fetch|failed to fetch|timeout|ENOTFOUND|ECONN/i.test(message) || navigator.onLine === false) {
    return { kind: "offline" };
  }
  return { kind: "failed", message };
}
