// VOICE NOTES — the door, the recording, the note (docs/capture.md "Voice").
//
//   POST /api/voice           a recording → stored in the vault, queued
//   GET  /api/voice/engine    the model, its download, the queue
//   GET  /api/voice/:id       one job, which the sheet polls until it lands
//
// The order of operations is the contract, and it is written so that the
// RECORDING is never what is lost:
//
//   1. The bytes are sniffed (WebM, Ogg or WAV — anything else is a 415 with
//      a code) and written into the vault at once, under the attachment
//      setting's folder for the inbox plus `Voice/`, named by the device's
//      own date and minute. From here on a crash, a restart or a model that
//      will not load leaves a recording the owner can find.
//   2. The job joins the queue (server/voiceQueue.ts) and the route answers
//      202 with its id. The sheet polls; nothing is pushed over /api/events,
//      because a vault event means "a file changed" to every subscriber, and a
//      job's progress is not a file.
//   3. The words land by planVoiceNote (shared/voice.ts): a bullet appended to
//      `Inbox/YYYY-MM-DD.md` with the share sheet's precondition — read, add,
//      write with the read's mtime, and on a 409 read and add again, once —
//      or, past eighty words, a note of their own.
//
// POST is admin-only through the auth guard (a POST on a guarded path); the
// two GETs answer a visitor with the 404 an unknown route gives.

import { promises as fsp } from "node:fs";
import path from "node:path";
import { Hono, type Context } from "hono";
import {
  appendBullet,
  isVoiceDate,
  isVoiceLanguage,
  isVoiceTime,
  planVoiceNote,
  sniffRecording,
  voiceAudioDir,
  voiceAudioPath,
  voiceEffective,
  voiceModelInfo,
  voiceNotePath,
  voiceStamp,
  VOICE_MAX_BYTES,
  type VoiceEngineState,
  type VoiceJob,
  type VoiceLanguage,
} from "../shared/voice.ts";
import { isPublishLimited } from "./auth.ts";
import { indexFile, registerAttachment } from "./indexer.ts";
import { getSettings } from "./settings.ts";
import { attachmentLocation } from "./site.ts";
import { downloading, engineBackend, modelOnDisk, transcribeInChild } from "./voiceEngine.ts";
import { createVoiceQueue, type Landing, type VoiceQueue, type VoiceWork } from "./voiceQueue.ts";
import { emitEvent, noteExists, readNote, safeAbs, suppressWatcherEcho, VaultError, writeNote } from "./vault.ts";

/** The server's clock, for a caller that sent none. */
function localDate(now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
function localTime(now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${p(now.getHours())}:${p(now.getMinutes())}`;
}

// ── Writing ─────────────────────────────────────────────────────────────────

/** Append one bullet to a note with the share sheet's precondition: the
 *  write carries the read's mtime, and a 409 — somebody saved the day's note
 *  in between — is answered by reading and appending again, ONCE. An append
 *  is the rare write where that is safe: the line was in neither version. */
export async function appendWithPrecondition(rel: string, bullet: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const existed = await noteExists(rel);
    const current = existed ? await readNote(rel) : null;
    try {
      suppressWatcherEcho(rel);
      const written = await writeNote(rel, appendBullet(current?.content ?? "", bullet), current?.mtimeMs, "autosave");
      emitEvent({ kind: existed ? "changed" : "created", path: written.path });
      await indexFile(written.path);
      return;
    } catch (err) {
      if (attempt === 0 && err instanceof VaultError && err.status === 409) continue;
      throw err;
    }
  }
}

/** Where the words go. Exported for the tests, which drive it over a
 *  throwaway vault. */
export async function landVoiceNote(work: VoiceWork, transcript: string | null, audio: string | null): Promise<Landing> {
  const plan = planVoiceNote({ transcript, audioPath: audio, date: work.date, time: work.time });
  if (plan.kind === "bullet") {
    await appendWithPrecondition(plan.path, plan.bullet);
    return { notePath: plan.path, kind: "bullet" };
  }
  for (let n = 1; n < 1000; n++) {
    const rel = voiceNotePath(plan.transcript, n);
    if (await noteExists(rel)) continue;
    suppressWatcherEcho(rel);
    const written = await writeNote(rel, plan.body, undefined, "autosave");
    emitEvent({ kind: "created", path: written.path });
    await indexFile(written.path);
    return { notePath: written.path, kind: "note" };
  }
  throw new VaultError(409, "A thousand voice notes with those words already", "voiceNoFreeName");
}

/** Put the recording in the vault under the first free name. */
async function storeRecording(bytes: Uint8Array, ext: string, date: string, time: string): Promise<string> {
  const dir = voiceAudioDir(attachmentLocation());
  const stamp = voiceStamp(date, time);
  for (let n = 1; n < 1000; n++) {
    const rel = voiceAudioPath(dir, stamp, ext, n);
    const abs = safeAbs(rel);
    try {
      await fsp.access(abs);
      continue;
    } catch {
      // free
    }
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    suppressWatcherEcho(rel);
    // `wx`: two recordings racing for one minute's name — the second is told
    // the file exists and takes the next one, rather than overwriting.
    try {
      await fsp.writeFile(abs, bytes, { flag: "wx" });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw err;
    }
    registerAttachment(rel);
    emitEvent({ kind: "created", path: rel });
    return rel;
  }
  throw new VaultError(409, "No free name for the recording", "voiceNoFreeName");
}

async function discardRecording(rel: string): Promise<void> {
  await fsp.unlink(safeAbs(rel));
  emitEvent({ kind: "deleted", path: rel });
}

// ── The queue, with the real engine ─────────────────────────────────────────

let queue: VoiceQueue | null = null;

function voiceQueue(): VoiceQueue {
  if (queue) return queue;
  queue = createVoiceQueue({
    async transcribe(work) {
      const model = voiceEffective(getSettings().voice).model;
      if (model === "off") return { text: "", language: null };
      const bytes = new Uint8Array(await fsp.readFile(safeAbs(work.audio)));
      const ext = work.audio.slice(work.audio.lastIndexOf(".") + 1);
      return transcribeInChild(bytes, ext, model, work.language);
    },
    land: landVoiceNote,
    discard: discardRecording,
  });
  return queue;
}

// ── The routes ──────────────────────────────────────────────────────────────

export const voiceRoutes = new Hono();

/** The recording's bytes and the device's clock, from either body shape:
 *  multipart (the web client: a Blob in `audio`), or JSON with the bytes as
 *  base64 (the Android shell's share sheet, whose native HTTP bridge moves a
 *  string and not a Blob). */
async function readUpload(c: Context): Promise<{ bytes: Uint8Array; fields: Record<string, unknown> }> {
  const type = c.req.header("content-type") ?? "";
  if (type.includes("application/json")) {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new VaultError(400, "Invalid JSON body");
    }
    if (typeof body !== "object" || body === null) throw new VaultError(400, "Invalid JSON body");
    const fields = body as Record<string, unknown>;
    if (typeof fields.audio !== "string" || fields.audio === "") {
      throw new VaultError(400, 'Field "audio" (the recording, base64) is required', "voiceEmpty");
    }
    return { bytes: new Uint8Array(Buffer.from(fields.audio, "base64")), fields };
  }
  let form: Record<string, unknown>;
  try {
    form = await c.req.parseBody();
  } catch {
    throw new VaultError(400, "Invalid multipart body");
  }
  const file = form.audio;
  if (!(file instanceof File)) throw new VaultError(400, 'Multipart field "audio" (the recording) is required', "voiceEmpty");
  return { bytes: new Uint8Array(await file.arrayBuffer()), fields: form };
}

voiceRoutes.post("/voice", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
  const { bytes, fields } = await readUpload(c);
  if (bytes.length === 0) throw new VaultError(400, "The recording is empty", "voiceEmpty");
  if (bytes.length > VOICE_MAX_BYTES) throw new VaultError(413, `Recording too large (${VOICE_MAX_BYTES} bytes max)`, "voiceTooLarge");
  const ext = sniffRecording(bytes);
  if (ext === null) throw new VaultError(415, "Not a recording this server reads (WebM, Ogg or WAV)", "voiceFormat");
  const date = isVoiceDate(fields.date) ? fields.date : localDate();
  const time = isVoiceTime(fields.time) ? fields.time : localTime();
  const settings = voiceEffective(getSettings().voice);
  const language: VoiceLanguage = isVoiceLanguage(fields.language) ? fields.language : settings.language;
  const audio = await storeRecording(bytes, ext, date, time);
  const work: VoiceWork = { audio, date, time, language, keepAudio: settings.keepAudio };
  if (settings.model === "off") {
    // No model: the recording is linked from the day's inbox and that is the
    // whole job — answered at once, with nothing to poll.
    const landed = await landVoiceNote(work, null, audio);
    const job: VoiceJob = { id: "", status: "kept", audio, notePath: landed.notePath, kind: landed.kind };
    return c.json(job);
  }
  return c.json(voiceQueue().submit(work), 202);
});

voiceRoutes.get("/voice/engine", (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const model = voiceEffective(getSettings().voice).model;
  const q = queue;
  const state: VoiceEngineState = {
    model,
    downloaded: model === "off" ? 0 : modelOnDisk(model),
    bytes: model === "off" ? 0 : voiceModelInfo(model).bytes,
    backend: engineBackend(),
    busy: (q?.busy() ?? false) || (model !== "off" && downloading(model)),
    queued: q?.waiting() ?? 0,
  };
  return c.json(state);
});

voiceRoutes.get("/voice/:id", (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const job = queue?.get(c.req.param("id")) ?? null;
  if (!job) throw new VaultError(404, "No such voice job", "voiceNoJob");
  return c.json(job);
});
