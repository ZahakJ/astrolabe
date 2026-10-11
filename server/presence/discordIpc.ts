// Discord's local RPC socket, spoken from scratch on node:net — the protocol
// is five opcodes and one command, and a dependency for it would be the
// largest thing in the feature (docs/plans/discord-presence.md, "Protocol
// notes"). Shared by the two hosts: a self-hosted server beside Discord
// (server/presence/host.ts) and the desktop's main process
// (electron/presence.ts), which imports it from here.
//
// SILENCE IS THE PRODUCT WHEN DISCORD IS ABSENT. Most machines this runs on
// have no Discord at all, so a missing socket is the normal case: one log
// line, then quiet retries on a doubling backoff, never a thrown error.

import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import {
  PRESENCE_BACKOFF_CAP_MS,
  PRESENCE_BACKOFF_FIRST_MS,
  PRESENCE_RATE_MS,
} from "../../shared/presence/config.ts";
import {
  closeCode,
  encodeFrame,
  FrameDecoder,
  handshakePayload,
  isReadyFrame,
  OPCODE,
  setActivityPayload,
  socketCandidates,
} from "../../shared/presence/frame.ts";
import { sameActivity } from "../../shared/presence/render.ts";
import type { DiscordActivity, PresenceConnection } from "../../shared/presence/types.ts";

export interface DiscordIpcOptions {
  clientId: string;
  pid: number;
  candidates?: string[];
  rateMs?: number;
  backoff?: { first: number; cap: number };
  now?: () => number;
  log?: (line: string) => void;
}

const READY_TIMEOUT_MS = 3_000;
const STOP_GRACE_MS = 300;
/** 4000 is the CLOSE Discord answers a handshake with for an unknown
 *  application; 4007 is the same verdict as an ERROR event. Retrying either
 *  can only be refused again, so neither is retried until the id changes. */
const INVALID_ID_CODES = new Set([4000, 4007]);

type Attempt = { socket: Socket; decoder: FrameDecoder } | "invalid" | null;

export class DiscordIpcClient {
  private clientId: string;
  private readonly pid: number;
  private readonly candidates: string[];
  private readonly rateMs: number;
  private readonly backoffFirst: number;
  private readonly backoffCap: number;
  private readonly now: () => number;
  private readonly log: (line: string) => void;

  private state: PresenceConnection = "off";
  private readonly listeners = new Set<(c: PresenceConnection) => void>();
  private socket: Socket | null = null;
  private running = false;
  /** Bumped by every start/stop/id change, so a connect that resolves after
   *  the world moved on knows to throw its socket away. */
  private generation = 0;
  private backoff: number;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private sendTimer: ReturnType<typeof setTimeout> | null = null;
  private desired: DiscordActivity | null = null;
  /** What Discord shows for us on THIS connection (null after a handshake). */
  private sent: DiscordActivity | null = null;
  private lastSendAt = Number.NEGATIVE_INFINITY;
  private saidMissing = false;

  constructor(opts: DiscordIpcOptions) {
    this.clientId = opts.clientId;
    this.pid = opts.pid;
    this.candidates = opts.candidates ?? socketCandidates(process.env, process.platform);
    this.rateMs = opts.rateMs ?? PRESENCE_RATE_MS;
    this.backoffFirst = opts.backoff?.first ?? PRESENCE_BACKOFF_FIRST_MS;
    this.backoffCap = opts.backoff?.cap ?? PRESENCE_BACKOFF_CAP_MS;
    this.backoff = this.backoffFirst;
    this.now = opts.now ?? Date.now;
    this.log = opts.log ?? ((line) => console.log(line));
  }

  get connection(): PresenceConnection {
    return this.state;
  }

  get id(): string {
    return this.clientId;
  }

  onConnection(cb: (c: PresenceConnection) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.backoff = this.backoffFirst;
    this.setState("searching");
    void this.connect(++this.generation);
  }

  /** A new id is the one thing that lifts an invalid-id verdict. */
  setClientId(id: string): void {
    if (id === this.clientId && this.state !== "invalid-id") return;
    this.clientId = id;
    if (!this.running) return;
    this.dropSocket();
    this.clearRetry();
    this.backoff = this.backoffFirst;
    this.setState("searching");
    void this.connect(++this.generation);
  }

  setActivity(activity: DiscordActivity | null): void {
    this.desired = activity;
    this.flush();
  }

  /** Clear what we showed and say goodbye, but never hold a quit hostage:
   *  a socket that will not close is destroyed after STOP_GRACE_MS. */
  async stop(): Promise<void> {
    this.running = false;
    this.generation++;
    this.clearRetry();
    this.clearSend();
    const socket = this.socket;
    this.socket = null;
    this.setState("off");
    if (socket === null || socket.destroyed) return;
    await new Promise<void>((resolve) => {
      const done = (): void => {
        clearTimeout(timer);
        socket.destroy();
        resolve();
      };
      const timer = setTimeout(done, STOP_GRACE_MS);
      socket.once("close", done);
      try {
        if (this.sent !== null) socket.write(encodeFrame(OPCODE.FRAME, setActivityPayload(this.pid, null, randomUUID())));
        socket.write(encodeFrame(OPCODE.CLOSE, {}));
        socket.end();
      } catch {
        done();
      }
    });
  }

  // ── connecting ───────────────────────────────────────────────────────────

  private async connect(gen: number): Promise<void> {
    for (const path of this.candidates) {
      const got = await this.attempt(path);
      if (gen !== this.generation) {
        if (got !== null && got !== "invalid") got.socket.destroy();
        return;
      }
      if (got === "invalid") {
        this.log(`discord presence: Discord refused application id ${this.clientId} — not retrying until it changes`);
        this.setState("invalid-id");
        return;
      }
      if (got !== null) {
        this.adopt(got.socket, got.decoder, gen);
        return;
      }
    }
    if (!this.saidMissing) {
      this.saidMissing = true;
      this.log("discord presence: Discord is not running here; trying again quietly");
    }
    this.scheduleRetry(gen);
  }

  /** One candidate: connect, handshake, wait for READY. */
  private attempt(path: string): Promise<Attempt> {
    return new Promise((resolve) => {
      let settled = false;
      const decoder = new FrameDecoder();
      const socket = createConnection(path);
      const finish = (result: Attempt): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.removeAllListeners("data");
        socket.removeAllListeners("connect");
        socket.removeAllListeners("close");
        if (result === null || result === "invalid") socket.destroy();
        resolve(result);
      };
      const timer = setTimeout(() => finish(null), READY_TIMEOUT_MS);
      timer.unref?.();
      // Every socket keeps an 'error' listener for life: an unhandled one
      // would take the whole process down for a missing Discord.
      socket.on("error", () => finish(null));
      socket.once("close", () => finish(null));
      socket.once("connect", () => {
        socket.write(encodeFrame(OPCODE.HANDSHAKE, handshakePayload(this.clientId)));
      });
      socket.on("data", (chunk: Buffer) => {
        for (const frame of decoder.push(chunk)) {
          if (frame.op === OPCODE.FRAME && isReadyFrame(frame.json)) return finish({ socket, decoder });
          if (frame.op === OPCODE.FRAME && INVALID_ID_CODES.has(closeCode(frame.json) ?? -1)) return finish("invalid");
          if (frame.op === OPCODE.CLOSE) return finish(INVALID_ID_CODES.has(closeCode(frame.json) ?? -1) ? "invalid" : null);
        }
      });
    });
  }

  private adopt(socket: Socket, decoder: FrameDecoder, gen: number): void {
    this.socket = socket;
    this.backoff = this.backoffFirst;
    this.sent = null;
    this.lastSendAt = Number.NEGATIVE_INFINITY;
    this.saidMissing = false;
    socket.on("data", (chunk: Buffer) => {
      for (const frame of decoder.push(chunk)) this.onFrame(socket, frame.op, frame.json);
    });
    socket.once("close", () => this.lost(socket, gen));
    this.log("discord presence: connected to Discord");
    this.setState("connected");
    this.flush();
  }

  private onFrame(socket: Socket, op: number, json: unknown): void {
    if (op === OPCODE.PING) {
      socket.write(encodeFrame(OPCODE.PONG, json));
      return;
    }
    const code = closeCode(json);
    if ((op === OPCODE.CLOSE || op === OPCODE.FRAME) && code !== null && INVALID_ID_CODES.has(code)) {
      this.invalid(socket);
      return;
    }
    if (op === OPCODE.CLOSE) socket.destroy();
  }

  private invalid(socket: Socket): void {
    this.generation++;
    if (this.socket === socket) this.socket = null;
    socket.destroy();
    this.clearSend();
    this.log(`discord presence: Discord refused application id ${this.clientId} — not retrying until it changes`);
    this.setState("invalid-id");
  }

  private lost(socket: Socket, gen: number): void {
    if (this.socket !== socket || gen !== this.generation) return;
    this.socket = null;
    this.clearSend();
    if (!this.running) return;
    this.setState("searching");
    this.scheduleRetry(gen);
  }

  private scheduleRetry(gen: number): void {
    if (!this.running || gen !== this.generation) return;
    this.clearRetry();
    const wait = this.backoff;
    this.backoff = Math.min(this.backoff * 2, this.backoffCap);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.running && gen === this.generation) void this.connect(gen);
    }, wait);
    this.retryTimer.unref?.();
  }

  private dropSocket(): void {
    const socket = this.socket;
    this.socket = null;
    this.clearSend();
    socket?.destroy();
  }

  // ── sending ──────────────────────────────────────────────────────────────

  /** Discord takes one SET_ACTIVITY per window; the latest desire wins it. */
  private flush(): void {
    const socket = this.socket;
    if (this.state !== "connected" || socket === null) return;
    if (sameActivity(this.sent, this.desired)) {
      this.clearSend();
      return;
    }
    const wait = this.lastSendAt + this.rateMs - this.now();
    if (wait <= 0) {
      this.clearSend();
      const activity = this.desired;
      this.sent = activity;
      this.lastSendAt = this.now();
      socket.write(encodeFrame(OPCODE.FRAME, setActivityPayload(this.pid, activity, randomUUID())));
      return;
    }
    if (this.sendTimer !== null) return;
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null;
      this.flush();
    }, wait);
    this.sendTimer.unref?.();
  }

  private clearSend(): void {
    if (this.sendTimer !== null) clearTimeout(this.sendTimer);
    this.sendTimer = null;
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private setState(next: PresenceConnection): void {
    if (next === this.state) return;
    this.state = next;
    for (const cb of this.listeners) cb(next);
  }
}
