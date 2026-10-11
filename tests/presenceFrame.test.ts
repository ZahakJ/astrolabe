// Discord IPC framing (shared/presence/frame.ts). The byte layout is the part
// of the protocol a typo breaks without a sound — Discord simply never
// answers — so it is asserted here byte for byte, alongside the order the
// socket is searched for and the shape of every payload we send.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  closeCode,
  encodeFrame,
  FrameDecoder,
  handshakePayload,
  isReadyFrame,
  OPCODE,
  setActivityPayload,
  socketCandidates,
} from "../shared/presence/frame.ts";

describe("encodeFrame / FrameDecoder", () => {
  it("writes a little-endian opcode and length, then the JSON, in one buffer", () => {
    const f = encodeFrame(OPCODE.HANDSHAKE, { v: 1 });
    assert.deepEqual([...f.subarray(0, 8)], [0, 0, 0, 0, 7, 0, 0, 0]);
    assert.equal(new TextDecoder().decode(f.subarray(8)), '{"v":1}');
    const big = encodeFrame(OPCODE.PONG, { s: "x".repeat(300) });
    assert.deepEqual([...big.subarray(0, 8)], [4, 0, 0, 0, 0x34, 0x01, 0, 0], "308 bytes: 0x134, low byte first");
  });

  it("round-trips multibyte UTF-8 and an emoji, counting bytes not characters", () => {
    const payload = { title: "الفصل الثالث — Chapter 3 🌙" };
    const f = encodeFrame(OPCODE.FRAME, payload);
    const len = new DataView(f.buffer).getUint32(4, true);
    assert.equal(len, new TextEncoder().encode(JSON.stringify(payload)).length);
    assert.notEqual(len, JSON.stringify(payload).length);
    assert.deepEqual(new FrameDecoder().push(f), [{ op: 1, json: payload }]);
  });

  it("reassembles a frame split across three chunks, the header itself split", () => {
    const f = encodeFrame(OPCODE.FRAME, { cmd: "DISPATCH", evt: "READY", note: "سلام" });
    const d = new FrameDecoder();
    assert.deepEqual(d.push(f.subarray(0, 3)), []);
    assert.deepEqual(d.push(f.subarray(3, 12)), []);
    assert.deepEqual(d.push(f.subarray(12)), [{ op: 1, json: { cmd: "DISPATCH", evt: "READY", note: "سلام" } }]);
  });

  it("yields three frames from one chunk, and keeps a fourth's head for later", () => {
    const parts = [encodeFrame(3, { a: 1 }), encodeFrame(1, { b: 2 }), encodeFrame(2, { code: 4000 })];
    const tail = encodeFrame(4, { c: 3 });
    const joined = new Uint8Array([...parts.flatMap((p) => [...p]), ...tail.subarray(0, 5)]);
    const d = new FrameDecoder();
    assert.deepEqual(d.push(joined), [
      { op: 3, json: { a: 1 } },
      { op: 1, json: { b: 2 } },
      { op: 2, json: { code: 4000 } },
    ]);
    assert.deepEqual(d.push(tail.subarray(5)), [{ op: 4, json: { c: 3 } }]);
  });

  it("a body that is not JSON is still a frame, with json null", () => {
    const body = new TextEncoder().encode("not json");
    const f = new Uint8Array(8 + body.length);
    new DataView(f.buffer).setUint32(0, 2, true);
    new DataView(f.buffer).setUint32(4, body.length, true);
    f.set(body, 8);
    assert.deepEqual(new FrameDecoder().push(f), [{ op: 2, json: null }]);
  });
});

describe("socketCandidates", () => {
  it("linux with XDG_RUNTIME_DIR: it first, then the temp variables, then /tmp, each × four sub-dirs × 0..9", () => {
    const list = socketCandidates({ XDG_RUNTIME_DIR: "/run/user/1000", TMPDIR: "/tmp/" }, "linux");
    assert.equal(list.length, 2 * 4 * 10, "TMPDIR=/tmp/ and the /tmp fallback are one prefix");
    assert.deepEqual(list.slice(0, 2), ["/run/user/1000/discord-ipc-0", "/run/user/1000/discord-ipc-1"]);
    assert.equal(list[10], "/run/user/1000/app/com.discordapp.Discord/discord-ipc-0");
    assert.equal(list[20], "/run/user/1000/app/com.discordapp.DiscordCanary/discord-ipc-0");
    assert.equal(list[39], "/run/user/1000/snap.discord/discord-ipc-9");
    assert.equal(list[40], "/tmp/discord-ipc-0");
  });

  it("linux without it: the temp variables in order, unset ones skipped", () => {
    const list = socketCandidates({ TMP: "/var/tmp", TEMP: "" }, "linux");
    assert.equal(list[0], "/var/tmp/discord-ipc-0");
    assert.equal(list[40], "/tmp/discord-ipc-0");
    assert.equal(list.length, 80);
    assert.deepEqual(socketCandidates({}, "linux").slice(0, 1), ["/tmp/discord-ipc-0"]);
  });

  it("darwin reads TMPDIR like any unix", () => {
    const list = socketCandidates({ TMPDIR: "/var/folders/xy/T/" }, "darwin");
    assert.equal(list[0], "/var/folders/xy/T/discord-ipc-0");
  });

  it("win32: the ten named pipes", () => {
    const list = socketCandidates({ XDG_RUNTIME_DIR: "/ignored" }, "win32");
    assert.equal(list.length, 10);
    assert.equal(list[0], "\\\\?\\pipe\\discord-ipc-0");
    assert.equal(list[9], String.raw`\\?\pipe\discord-ipc-9`);
  });
});

describe("payloads", () => {
  it("handshake", () => {
    assert.deepEqual(handshakePayload("123456789012345678"), { v: 1, client_id: "123456789012345678" });
  });

  it("SET_ACTIVITY carries the pid and the activity; clearing has no activity key at all", () => {
    const set = setActivityPayload(42, { type: 0, details: "Writing" }, "n-1");
    assert.deepEqual(set, { cmd: "SET_ACTIVITY", args: { pid: 42, activity: { type: 0, details: "Writing" } }, nonce: "n-1" });
    const clear = setActivityPayload(42, null, "n-2");
    assert.deepEqual(clear, { cmd: "SET_ACTIVITY", args: { pid: 42 }, nonce: "n-2" });
    assert.equal("activity" in clear.args, false);
  });

  it("READY and the close codes", () => {
    assert.equal(isReadyFrame({ cmd: "DISPATCH", evt: "READY", data: {} }), true);
    assert.equal(isReadyFrame({ cmd: "SET_ACTIVITY", evt: null }), false);
    assert.equal(isReadyFrame(null), false);
    assert.equal(closeCode({ code: 4000, message: "Invalid Client ID" }), 4000);
    assert.equal(closeCode({ cmd: "SET_ACTIVITY", evt: "ERROR", data: { code: 4007, message: "x" } }), 4007);
    assert.equal(closeCode({ evt: "READY" }), null);
    assert.equal(closeCode("x"), null);
  });
});
