// THE VOICES FOLDER'S SCAN (docs/read-aloud.md, "Your own voices").
//
// The owner points Settings → Language & dates → Your own voices at a folder
// (server/speakLocal.ts keeps the path, this machine's own), and this module
// walks it for voices: Piper models with their configs, and Kokoro packs
// (shared/speechVoices.ts says what each looks like in the wild and parses
// them). What it finds joins every voice picker; the worker loads each BY
// PATH (server/speakWorker.py), so nothing is copied or downloaded.
//
// The scan runs at server start, when the folder is saved, and when the owner
// presses Rescan. It is RECURSIVE — the rhasspy/piper-voices catalogue nests
// its voices four deep (`fr/fr_FR/upmc/medium/`) — follows symbolic links
// (each real directory once, so a link loop ends), steps around dot-folders
// and around the vault itself, and stops at limits a voices folder never
// reaches but a mistakenly chosen home folder would. A file that is not a
// voice is LISTED with why (no config beside the model, a config that is not
// JSON, a language Read aloud does not detect yet) and never stops the scan.

import { open, readdir, readFile, realpath, stat } from "node:fs/promises";
import { statSync } from "node:fs";
import path from "node:path";
import {
  kokoroEntries,
  piperEntries,
  piperSpeakerId,
  type OwnDirProblem,
  type OwnSkipped,
  type OwnVoice,
  type OwnVoicesStatus,
} from "../shared/speechVoices.ts";
import { onVoicesDirChange, speakLocal, voicesDirProblem } from "./speakLocal.ts";
import { getVaultRoot } from "./vault.ts";
import { readZipDirectory } from "./zip.ts";

/** A found voice with what the worker needs to load it. */
export interface FoundVoice extends OwnVoice {
  /** The model: a Piper `.onnx`, or Kokoro's `kokoro-*.onnx`. Absolute. */
  model: string;
  /** Piper's `.onnx.json`. */
  config: string | null;
  /** The speaker's number in a multi-speaker Piper model. */
  speakerId: number | null;
  /** Kokoro's `voices-*.bin`. */
  pack: string | null;
}

export interface VoiceScan {
  voices: FoundVoice[];
  skipped: OwnSkipped[];
  problem: OwnDirProblem | null;
  truncated: boolean;
}

/** Deeper than the catalogue's four levels with room to spare; more
 *  directories and files than any voices folder holds. A home folder chosen
 *  by mistake stops here and says so rather than walking the disk. */
export const SCAN_LIMITS = { depth: 8, dirs: 5000, files: 50_000 };
/** A Piper config is a few kilobytes; one of megabytes is not one. */
const CONFIG_MAX = 1024 * 1024;

const posix = (p: string): string => p.split(path.sep).join("/");

function isKokoroModel(name: string): boolean {
  return /^kokoro.*\.onnx$/i.test(name);
}

/** The Kokoro model to pair a pack with: the full-precision one when there
 *  are several (the int8 build was slower on a CPU in the trial). */
function pickKokoroModel(names: string[]): string {
  const sorted = [...names].sort();
  return sorted.find((n) => !/int8|fp16|quant/i.test(n)) ?? sorted[0];
}

/** Walk `root` and read every voice in it. `vault` is stepped around. */
export async function scanVoicesDir(root: string, vault: string | null = null): Promise<VoiceScan> {
  const out: VoiceScan = { voices: [], skipped: [], problem: null, truncated: false };
  const problem = voicesDirProblem(root);
  if (problem) return { ...out, problem };
  const vaultReal = vault ? await realpath(vault).catch(() => path.resolve(vault)) : null;
  const seen = new Set<string>();
  const queue: { abs: string; depth: number }[] = [{ abs: root, depth: 0 }];
  let dirs = 0;
  let files = 0;
  const skip = (abs: string, reason: OwnSkipped["reason"], lang?: string): void => {
    out.skipped.push({ file: posix(path.relative(root, abs)), reason, ...(lang ? { lang } : {}) });
  };

  while (queue.length > 0) {
    const { abs, depth } = queue.shift()!;
    let real: string;
    try {
      real = await realpath(abs);
    } catch {
      continue;
    }
    if (seen.has(real) || (vaultReal !== null && real === vaultReal)) continue;
    seen.add(real);
    if (++dirs > SCAN_LIMITS.dirs) {
      out.truncated = true;
      break;
    }
    let names: string[];
    try {
      names = (await readdir(abs)).sort();
    } catch {
      if (abs === root) return { ...out, problem: "unreadable" };
      skip(abs, "unreadable");
      continue;
    }
    const here = new Set<string>();
    for (const name of names) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const child = path.join(abs, name);
      let st;
      try {
        st = await stat(child); // follows a link
      } catch {
        continue; // a dangling link
      }
      if (st.isDirectory()) {
        if (depth + 1 <= SCAN_LIMITS.depth) queue.push({ abs: child, depth: depth + 1 });
        else out.truncated = true;
      } else if (st.isFile()) {
        if (++files > SCAN_LIMITS.files) {
          out.truncated = true;
          break;
        }
        here.add(name);
      }
    }
    await readDir(root, abs, here, out, skip);
  }
  out.voices.sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

async function readDir(
  root: string,
  abs: string,
  names: Set<string>,
  out: VoiceScan,
  skip: (abs: string, reason: OwnSkipped["reason"], lang?: string) => void,
): Promise<void> {
  const rel = (name: string): string => posix(path.relative(root, path.join(abs, name)));
  const kokoroModels = [...names].filter(isKokoroModel);
  // ── Piper: a model and its config ──
  for (const name of names) {
    if (!/\.onnx$/i.test(name) || isKokoroModel(name)) continue;
    const model = path.join(abs, name);
    // `<name>.onnx.json` is the convention; `<name>.json` is seen too.
    const configName = names.has(`${name}.json`) ? `${name}.json` : names.has(`${name.replace(/\.onnx$/i, "")}.json`) ? `${name.replace(/\.onnx$/i, "")}.json` : null;
    if (configName === null) {
      skip(model, "noJson");
      continue;
    }
    const configPath = path.join(abs, configName);
    let config: unknown;
    try {
      const st = await stat(configPath);
      if (st.size > CONFIG_MAX) {
        skip(configPath, "badJson");
        continue;
      }
      config = JSON.parse(await readFile(configPath, "utf8"));
    } catch (err) {
      skip(configPath, (err as NodeJS.ErrnoException).code === "EACCES" ? "unreadable" : "badJson");
      continue;
    }
    const entries = piperEntries(rel(name), config);
    if ("skip" in entries) {
      skip(model, entries.skip, entries.lang);
      continue;
    }
    for (const v of entries.voices) {
      out.voices.push({ ...v, model, config: configPath, speakerId: piperSpeakerId(config, v.speaker), pack: null });
    }
  }
  // A config whose model is not beside it.
  for (const name of names) {
    if (!/\.onnx\.json$/i.test(name)) continue;
    if (!names.has(name.replace(/\.json$/i, ""))) skip(path.join(abs, name), "noModel");
  }
  // ── Kokoro: a voices pack beside its model ──
  for (const name of names) {
    if (!/^voices.*\.bin$/i.test(name)) continue;
    const pack = path.join(abs, name);
    if (kokoroModels.length === 0) {
      skip(pack, "noKokoroModel");
      continue;
    }
    let members: string[];
    try {
      const handle = await open(pack, "r");
      try {
        const size = (await handle.stat()).size;
        members = [...(await readZipDirectory(handle, size)).entries.keys()];
      } finally {
        await handle.close();
      }
    } catch (err) {
      skip(pack, (err as NodeJS.ErrnoException).code === "EACCES" ? "unreadable" : "badJson");
      continue;
    }
    const { voices, other } = kokoroEntries(rel(name), members);
    const model = path.join(abs, pickKokoroModel(kokoroModels));
    for (const v of voices) out.voices.push({ ...v, model, config: null, speakerId: null, pack });
    for (const [lang] of other) skip(pack, "otherLanguage", lang);
  }
}

// ── The folder this server scans ───────────────────────────────────────────

let last: (VoiceScan & { dir: string; at: number }) | null = null;
let running: Promise<void> | null = null;
let runningDir: string | null = null;

function vaultOrNull(): string | null {
  try {
    return getVaultRoot();
  } catch {
    return null;
  }
}

/** Scan the folder Settings names, now. Resolves when done. A second ask
 *  while one runs joins it. */
export function rescanVoices(): Promise<void> {
  const dir = speakLocal().voicesDir;
  if (running && runningDir === dir) return running;
  if (dir === null) {
    last = null;
    return Promise.resolve();
  }
  runningDir = dir;
  const job = (async () => {
    try {
      const scan = await scanVoicesDir(dir, vaultOrNull());
      if (speakLocal().voicesDir === dir) last = { ...scan, dir, at: Date.now() };
    } catch (err) {
      console.error("speak: scanning the voices folder failed:", (err as Error).message);
      last = { voices: [], skipped: [], problem: "unreadable", truncated: false, dir, at: Date.now() };
    }
  })().finally(() => {
    if (running === job) {
      running = null;
      runningDir = null;
    }
  });
  running = job;
  return job;
}

/** At boot, and whenever a save moves the folder. */
export function startVoiceScan(): void {
  void rescanVoices();
}
onVoicesDirChange(() => void rescanVoices());

/** The voices the last scan found in the folder Settings names now. A folder
 *  saved elsewhere than through the PATCH (a test, a hand-edited file) is
 *  noticed here and scanned. */
export function foundVoices(): FoundVoice[] {
  const dir = speakLocal().voicesDir;
  if (dir === null) return [];
  if ((!last || last.dir !== dir) && runningDir !== dir) void rescanVoices();
  return last && last.dir === dir ? last.voices : [];
}

/** The found voices once the folder Settings names has been scanned at
 *  least once — what a request waits for on a freshly started server. */
export async function foundVoicesSettled(): Promise<FoundVoice[]> {
  const dir = speakLocal().voicesDir;
  if (dir !== null && (!last || last.dir !== dir)) await rescanVoices();
  return foundVoices();
}

export function ownVoicesStatus(): OwnVoicesStatus {
  const dir = speakLocal().voicesDir;
  const scan = last && last.dir === dir ? last : null;
  if (dir !== null && !scan && runningDir !== dir) void rescanVoices();
  return {
    dir,
    scanning: running !== null && runningDir === dir,
    at: scan?.at ?? null,
    voices: (scan?.voices ?? []).map(({ model: _m, config: _c, speakerId: _s, pack: _p, ...v }) => v),
    skipped: scan?.skipped ?? [],
    problem: scan?.problem ?? null,
    truncated: scan?.truncated ?? false,
  };
}

/** The found voice `id`, with its model's modification time now — part of
 *  the cache key, so a voice file replaced under the same name is spoken
 *  afresh, not answered from the old audio. Null when the file is gone. */
export function foundVoiceNow(id: string): (FoundVoice & { mtime: number }) | null {
  const v = foundVoices().find((f) => f.id === id);
  if (!v) return null;
  try {
    const mtime = Math.max(statSync(v.model).mtimeMs, v.pack ? statSync(v.pack).mtimeMs : 0);
    return { ...v, mtime };
  } catch {
    void rescanVoices();
    return null;
  }
}

/** Tests only: forget the last scan. */
export function resetVoiceScan(): void {
  last = null;
}
