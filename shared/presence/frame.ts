// Discord's local IPC framing, the payloads we send, and where the socket may
// be (docs/plans/discord-presence.md, "Protocol notes"). Pure on purpose: the
// byte layout is the part a typo breaks silently, so it is proved byte for
// byte in tests/presenceFrame.test.ts without a socket in sight.

import type { DiscordActivity } from "./types.ts";

export const OPCODE = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 } as const;

const HEADER = 8;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Header and body in ONE buffer: Discord reads a frame per write, and a
 *  header that arrives alone has been seen to stall the official client. */
export function encodeFrame(op: number, payload: unknown): Uint8Array {
  const body = encoder.encode(JSON.stringify(payload));
  const out = new Uint8Array(HEADER + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, op, true);
  view.setUint32(4, body.length, true);
  out.set(body, HEADER);
  return out;
}

/** A stream socket owes us no frame boundaries; this restores them. */
export class FrameDecoder {
  private buf: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): { op: number; json: unknown }[] {
    const joined = new Uint8Array(this.buf.length + chunk.length);
    joined.set(this.buf, 0);
    joined.set(chunk, this.buf.length);
    const frames: { op: number; json: unknown }[] = [];
    let at = 0;
    while (joined.length - at >= HEADER) {
      const view = new DataView(joined.buffer, joined.byteOffset + at, HEADER);
      const op = view.getUint32(0, true);
      const len = view.getUint32(4, true);
      if (joined.length - at - HEADER < len) break;
      const text = decoder.decode(joined.subarray(at + HEADER, at + HEADER + len));
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        // A body we cannot read is still a frame: its opcode (a CLOSE, say)
        // is the part that matters.
      }
      frames.push({ op, json });
      at += HEADER + len;
    }
    this.buf = joined.slice(at);
    return frames;
  }
}

const SUBDIRS = ["", "app/com.discordapp.Discord/", "app/com.discordapp.DiscordCanary/", "snap.discord/"];

/** Every path a Discord client may be listening on, in the order the
 *  official client tries them; Flatpak and Snap hide it a directory deeper. */
export function socketCandidates(env: Record<string, string | undefined>, platform: string): string[] {
  const out: string[] = [];
  if (platform === "win32") {
    for (let n = 0; n < 10; n++) out.push(`\\\\?\\pipe\\discord-ipc-${n}`);
    return out;
  }
  const prefixes: string[] = [];
  for (const value of [env.XDG_RUNTIME_DIR, env.TMPDIR, env.TMP, env.TEMP, "/tmp"]) {
    if (value === undefined || value === "") continue;
    const dir = value.endsWith("/") ? value : `${value}/`;
    if (!prefixes.includes(dir)) prefixes.push(dir);
  }
  for (const prefix of prefixes) {
    for (const sub of SUBDIRS) {
      for (let n = 0; n < 10; n++) out.push(`${prefix}${sub}discord-ipc-${n}`);
    }
  }
  return out;
}

export function handshakePayload(clientId: string): { v: 1; client_id: string } {
  return { v: 1, client_id: clientId };
}

/** Clearing omits `activity` altogether, as the official client does —
 *  `activity: null` is not what Discord documents. */
export function setActivityPayload(
  pid: number,
  activity: DiscordActivity | null,
  nonce: string,
): { cmd: "SET_ACTIVITY"; args: { pid: number; activity?: DiscordActivity }; nonce: string } {
  return { cmd: "SET_ACTIVITY", args: activity === null ? { pid } : { pid, activity }, nonce };
}

function record(json: unknown): Record<string, unknown> | null {
  return typeof json === "object" && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
}

export function isReadyFrame(json: unknown): boolean {
  const r = record(json);
  return r !== null && r.cmd === "DISPATCH" && r.evt === "READY";
}

/** The code a CLOSE body, or an ERROR event, carries; null when none. */
export function closeCode(json: unknown): number | null {
  const r = record(json);
  if (r === null) return null;
  if (typeof r.code === "number") return r.code;
  const data = record(r.data);
  if (r.evt === "ERROR" && data !== null && typeof data.code === "number") return data.code;
  return null;
}
