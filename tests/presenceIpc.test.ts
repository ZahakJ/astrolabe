// The Discord IPC client (server/presence/discordIpc.ts) against a FAKE
// Discord: a unix socket in a temp dir that speaks the framing from
// shared/presence/frame.ts. Everything the real Discord would punish — a
// second SET_ACTIVITY inside the rate window, an unchanged activity re-sent,
// a retry against an id it already refused — and everything the owner would
// notice — a card left behind on quit, a crash when Discord is not running —
// is asserted on the frames that actually cross the socket.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { encodeFrame, FrameDecoder, OPCODE } from "../shared/presence/frame.ts";
import type { DiscordActivity } from "../shared/presence/types.ts";
import { DiscordIpcClient } from "../server/presence/discordIpc.ts";

const dir = mkdtempSync(path.join(os.tmpdir(), "astrolabe-ipc-"));
after(() => rmSync(dir, { recursive: true, force: true }));
let seq = 0;

interface Seen {
  op: number;
  json: Record<string, unknown>;
}

/** A Discord that answers READY, or closes with `refuse` when given. */
class FakeDiscord {
  readonly path = path.join(dir, `d${++seq}`, "discord-ipc-7");
  readonly frames: Seen[] = [];
  readonly sockets: Socket[] = [];
  ended = 0;
  connections = 0;
  refuse: number | null = null;
  private server: Server | null = null;

  async listen(): Promise<void> {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(path.dirname(this.path), { recursive: true });
    this.server = createServer((socket) => {
      this.connections++;
      this.sockets.push(socket);
      const decoder = new FrameDecoder();
      socket.on("error", () => {});
      socket.on("end", () => {
        this.ended++;
        socket.end();
      });
      socket.on("data", (chunk) => {
        for (const f of decoder.push(chunk)) {
          this.frames.push({ op: f.op, json: f.json as Record<string, unknown> });
          if (f.op === OPCODE.HANDSHAKE) {
            if (this.refuse !== null) {
              socket.write(encodeFrame(OPCODE.CLOSE, { code: this.refuse, message: "Invalid Client ID" }));
              socket.end();
            } else socket.write(encodeFrame(OPCODE.FRAME, { cmd: "DISPATCH", evt: "READY", data: { v: 1 } }));
          }
        }
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(this.path, resolve));
  }

  async close(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    this.sockets.length = 0;
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
    this.server = null;
  }

  sets(): Seen[] {
    return this.frames.filter((f) => f.op === OPCODE.FRAME && f.json.cmd === "SET_ACTIVITY");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(what: string, pred: () => boolean, ms = 2_000): Promise<void> {
  const end = Date.now() + ms;
  while (!pred()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(5);
  }
}

const A: DiscordActivity = { type: 0, details: "Writing", state: "Chapter 3" };
const B: DiscordActivity = { type: 0, details: "Writing", state: "Chapter 4" };
const C: DiscordActivity = { type: 0, details: "Drawing" };

function client(candidates: string[], logs: string[] = []): DiscordIpcClient {
  return new DiscordIpcClient({
    clientId: "123456789012345678",
    pid: 4242,
    candidates,
    rateMs: 50,
    backoff: { first: 20, cap: 100 },
    log: (line) => logs.push(line),
  });
}

describe("DiscordIpcClient against a fake Discord", { skip: process.platform === "win32" }, () => {
  it("handshakes, reaches connected, sends one SET_ACTIVITY with pid and nonce", async () => {
    const d = new FakeDiscord();
    await d.listen();
    const c = client([path.join(dir, "missing", "discord-ipc-0"), d.path]);
    try {
      const seen: string[] = [];
      c.onConnection((s) => seen.push(s));
      c.start();
      await until("connected", () => c.connection === "connected");
      assert.deepEqual(d.frames[0], { op: OPCODE.HANDSHAKE, json: { v: 1, client_id: "123456789012345678" } });
      assert.deepEqual(seen, ["searching", "connected"]);
      c.setActivity(A);
      await until("a SET_ACTIVITY", () => d.sets().length === 1);
      const args = d.sets()[0].json.args as Record<string, unknown>;
      assert.equal(args.pid, 4242);
      assert.deepEqual(args.activity, A);
      assert.match(String(d.sets()[0].json.nonce), /^[0-9a-f-]{36}$/);
    } finally {
      await c.stop();
      await d.close();
    }
  });

  it("coalesces: two quick changes are one frame now and ONE more after the window, carrying the latest", async () => {
    const d = new FakeDiscord();
    await d.listen();
    const c = client([d.path]);
    try {
      c.start();
      await until("connected", () => c.connection === "connected");
      c.setActivity(A);
      c.setActivity(B);
      c.setActivity(C);
      await until("the first frame", () => d.sets().length === 1);
      assert.deepEqual((d.sets()[0].json.args as Record<string, unknown>).activity, A);
      await sleep(120);
      assert.equal(d.sets().length, 2);
      assert.deepEqual((d.sets()[1].json.args as Record<string, unknown>).activity, C);
      const nonces = new Set(d.sets().map((f) => f.json.nonce));
      assert.equal(nonces.size, 2, "a fresh nonce per command");
      // The same activity again, after the window: nothing.
      c.setActivity({ details: "Drawing", type: 0 });
      await sleep(80);
      assert.equal(d.sets().length, 2);
    } finally {
      await c.stop();
      await d.close();
    }
  });

  it("answers PING with PONG and the same body", async () => {
    const d = new FakeDiscord();
    await d.listen();
    const c = client([d.path]);
    try {
      c.start();
      await until("connected", () => c.connection === "connected");
      d.sockets[0].write(encodeFrame(OPCODE.PING, { nonce: "p-1", n: 7 }));
      await until("a PONG", () => d.frames.some((f) => f.op === OPCODE.PONG));
      assert.deepEqual(d.frames.find((f) => f.op === OPCODE.PONG)?.json, { nonce: "p-1", n: 7 });
    } finally {
      await c.stop();
      await d.close();
    }
  });

  it("reconnects after Discord goes away and comes back, and re-sends what it wants shown", async () => {
    const d = new FakeDiscord();
    await d.listen();
    const c = client([d.path]);
    try {
      c.start();
      await until("connected", () => c.connection === "connected");
      c.setActivity(A);
      await until("first frame", () => d.sets().length === 1);
      await d.close();
      await until("searching", () => c.connection === "searching");
      await sleep(60);
      await d.listen();
      await until("connected again", () => c.connection === "connected", 3_000);
      await until("the activity again", () => d.sets().length === 2);
      assert.deepEqual((d.sets()[1].json.args as Record<string, unknown>).activity, A);
      assert.equal(d.frames.filter((f) => f.op === OPCODE.HANDSHAKE).length, 2);
    } finally {
      await c.stop();
      await d.close();
    }
  });

  it("stop() clears the activity, sends CLOSE and ends the socket", async () => {
    const d = new FakeDiscord();
    await d.listen();
    const c = client([d.path]);
    try {
      c.start();
      await until("connected", () => c.connection === "connected");
      c.setActivity(A);
      await until("first frame", () => d.sets().length === 1);
      const t = Date.now();
      await c.stop();
      assert.ok(Date.now() - t < 400);
      await until("the socket ended", () => d.ended === 1);
      const tail = d.frames.slice(-2);
      assert.equal(tail[0].op, OPCODE.FRAME);
      assert.deepEqual(tail[0].json.args, { pid: 4242 });
      assert.equal("activity" in (tail[0].json.args as object), false);
      assert.deepEqual(tail[1], { op: OPCODE.CLOSE, json: {} });
      assert.equal(c.connection, "off");
    } finally {
      await d.close();
    }
  });

  it("CLOSE 4000 is invalid-id, and nothing retries until the id changes", async () => {
    const d = new FakeDiscord();
    d.refuse = 4000;
    await d.listen();
    const logs: string[] = [];
    const c = client([d.path], logs);
    try {
      c.start();
      await until("invalid-id", () => c.connection === "invalid-id");
      await sleep(5 * 100);
      assert.equal(d.connections, 1, "no reconnect");
      assert.equal(logs.length, 1);
      d.refuse = null;
      c.setClientId("876543210987654321");
      await until("connected with the new id", () => c.connection === "connected");
      assert.deepEqual(d.frames.filter((f) => f.op === OPCODE.HANDSHAKE).at(-1)?.json, { v: 1, client_id: "876543210987654321" });
    } finally {
      await c.stop();
      await d.close();
    }
  });

  it("no Discord at all: searching, one log line, no throw, a clean start and stop", async () => {
    const logs: string[] = [];
    const c = client([path.join(dir, "nobody", "discord-ipc-0"), path.join(dir, "nobody", "discord-ipc-1")], logs);
    c.start();
    assert.equal(c.connection, "searching");
    c.setActivity(A);
    await sleep(250);
    assert.equal(c.connection, "searching");
    assert.equal(logs.length, 1, "silence after the first line");
    await c.stop();
    assert.equal(c.connection, "off");
  });
});
