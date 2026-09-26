// THE EXTERNAL SPEAKER — the escape hatch (docs/read-aloud.md, "An external
// speaker").
//
// For the reader whose voice is not a Piper or Kokoro file: a program of
// their own, run once per sentence. The owner writes a command template in
// Settings → Language & dates → Your own voices, e.g.
//
//     piper --model /home/me/voices/fr_FR-upmc-medium.onnx --output_file {out}
//     python3 /home/me/my_speaker.py --language {lang} --out {out}
//
// and names the languages it speaks for. Per sentence the server:
//
//   1. splits the template into words the way a shell would split quotes
//      (shared/speechVoices.ts `splitCommand`) and substitutes `{lang}` and
//      `{out}` in each — and then runs the program DIRECTLY, never through a
//      shell, so a sentence can never become part of a command line;
//   2. writes the sentence to the program's stdin and closes it;
//   3. waits at most TWENTY SECONDS for it to exit;
//   4. reads the WAV or Ogg it wrote to `{out}`, and deletes it.
//
// Its stderr is logged. A non-zero exit, a timeout, no file, or a file that
// is not audio is a `speakExternal` failure: the sentence stays unspoken and
// the player says the program failed (it does not quietly fall back to
// another voice — the owner asked for this program and should hear that it
// broke). It is NEVER run for a visitor: "Readers may listen" is served by
// the app's own voices only (server/speak.ts).
//
// The program runs as the server's own user, with its permissions — the
// row's ⓘ says exactly that, and so do the docs.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { externalArgv } from "../shared/speechVoices.ts";
import { SpeakError, ttsDir, type Synthesis } from "./speakEngine.ts";

export const EXTERNAL_TIMEOUT_MS = 20_000;
/** A sentence of audio is kilobytes; a program writing more than this has
 *  written something else. */
const EXTERNAL_MAX_BYTES = 32 * 1024 * 1024;

export type ExternalFailure = "spawn" | "exit" | "timeout" | "noFile" | "notAudio";

export class ExternalSpeakerError extends SpeakError {
  readonly reason: ExternalFailure;
  constructor(message: string, reason: ExternalFailure) {
    super(message, "speakExternal", 502);
    this.reason = reason;
  }
}

/** The kind of sound in `bytes`, by its first bytes. */
export function soundMime(bytes: Uint8Array): string | null {
  const head = String.fromCharCode(...bytes.subarray(0, 4));
  if (head === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WAVE") return "audio/wav";
  if (head === "OggS") return "audio/ogg";
  return null;
}

export interface ExternalJob {
  command: string;
  text: string;
  lang: string;
}

/** Run the owner's program for one sentence. */
export async function runExternal(job: ExternalJob, opts: { timeoutMs?: number; dir?: string } = {}): Promise<Synthesis> {
  const timeoutMs = opts.timeoutMs ?? EXTERNAL_TIMEOUT_MS;
  const dir = opts.dir ?? path.join(ttsDir(), "external");
  await fsp.mkdir(dir, { recursive: true });
  const out = path.join(dir, `${randomUUID()}.wav`);
  const argv = externalArgv(job.command, job.lang, out);
  if (argv.length === 0) throw new ExternalSpeakerError("The external speaker has no command", "spawn");
  const started = Date.now();
  const name = path.basename(argv[0]);
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = (err?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };
      // Its own process group on POSIX, so a timeout ends the whole of it — a
      // wrapper script's `piper` or `python3` as well as the script.
      const group = process.platform !== "win32";
      const child = spawn(argv[0], argv.slice(1), { stdio: ["pipe", "ignore", "pipe"], windowsHide: true, shell: false, detached: group });
      const kill = (): void => {
        try {
          if (group && child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          // already gone
        }
      };
      const tail: string[] = [];
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        for (const line of chunk.split("\n")) {
          if (!line.trim()) continue;
          console.error(`speak: external speaker (${name}): ${line}`);
          tail.push(line.trim());
        }
        if (tail.length > 10) tail.splice(0, tail.length - 10);
      });
      const timer = setTimeout(() => {
        kill();
        done(new ExternalSpeakerError(`${name} did not finish within ${Math.round(timeoutMs / 1000)} s`, "timeout"));
      }, timeoutMs);
      child.on("error", (err) => done(new ExternalSpeakerError(`${name} could not start: ${err.message}`, "spawn")));
      child.on("exit", (code, signal) => {
        if (code === 0) done();
        else done(new ExternalSpeakerError(`${name} failed (${signal ?? code})${tail.length ? `: ${tail.slice(-2).join(" · ")}` : ""}`, "exit"));
      });
      // A program that never reads its stdin closes the pipe under us.
      child.stdin.on("error", () => {});
      child.stdin.end(job.text, "utf8");
    });
    let bytes: Uint8Array;
    try {
      const st = await fsp.stat(out);
      if (st.size > EXTERNAL_MAX_BYTES) throw new ExternalSpeakerError(`${name} wrote ${st.size} bytes, which is not one sentence`, "notAudio");
      bytes = new Uint8Array(await fsp.readFile(out));
    } catch (err) {
      if (err instanceof ExternalSpeakerError) throw err;
      throw new ExternalSpeakerError(`${name} exited without writing ${"{out}"}`, "noFile");
    }
    const mime = soundMime(bytes);
    if (!mime) throw new ExternalSpeakerError(`${name} wrote a file that is not WAV or Ogg`, "notAudio");
    return { audio: bytes, mime, ms: Date.now() - started };
  } finally {
    await fsp.rm(out, { force: true });
  }
}
