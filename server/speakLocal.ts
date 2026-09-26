// READ ALOUD'S MACHINE SETTINGS — the voices folder and the external speaker
// (docs/read-aloud.md, "Your own voices").
//
// Both arrive through the ordinary settings PATCH (`speak.voicesDir`,
// `speak.external`) and both are answered in `effective.speak`, but NEITHER
// is written to settings.json. That file is mirrored into the vault
// (server/configMirror.ts) and from there into every other server over the
// same folder — and these two are this machine's:
//
//   · the voices folder is a path on THIS disk; on the next machine it names
//     nothing, or something else;
//   · the external speaker is a PROGRAM THIS SERVER RUNS. A setting that
//     travels with the vault is a setting anyone who can write to the vault
//     (a git remote, a shared folder, a phone) could set — and a command line
//     that arrives by sync and is then executed is a remote code execution,
//     not a preference.
//
// So they live in ASTROLABE_DATA/speak-local.json (0600), beside
// git-credentials.json and ask-credentials.json, which do not travel either.
// A PATCH stages them (validated, nothing written) and settings.ts applies
// the stage only after the whole patch was accepted, the git token's shape.

import { accessSync, chmodSync, constants, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isSpeakLang, type SpeakLang, type SpeakLocal } from "../shared/speech.ts";
import { externalCommandProblem, voicesDirRefusal, type OwnDirProblem, type SpeakExternal } from "../shared/speechVoices.ts";
import { dataDir } from "./site.ts";
import { getVaultRoot, VaultError } from "./vault.ts";

const FILE = "speak-local.json";

function localPath(): string {
  return path.join(dataDir(), FILE);
}

let cache: { file: string; mtimeMs: number; value: SpeakLocal } | null = null;

function clean(raw: unknown): SpeakLocal {
  const out: SpeakLocal = { voicesDir: null, external: null };
  if (typeof raw !== "object" || raw === null) return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.voicesDir === "string" && r.voicesDir.trim() !== "") out.voicesDir = r.voicesDir.trim();
  const ext = r.external;
  if (typeof ext === "object" && ext !== null) {
    const e = ext as Record<string, unknown>;
    const langs = Array.isArray(e.langs) ? e.langs.filter(isSpeakLang) : [];
    if (typeof e.command === "string" && externalCommandProblem(e.command) === null) {
      out.external = { command: e.command.trim(), langs: [...new Set(langs)] };
    }
  }
  return out;
}

/** This machine's voices folder and external speaker. */
export function speakLocal(): SpeakLocal {
  const file = localPath();
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    // no file: nothing set
  }
  if (cache && cache.file === file && cache.mtimeMs === mtimeMs) return cache.value;
  let value: SpeakLocal = { voicesDir: null, external: null };
  if (mtimeMs >= 0) {
    try {
      value = clean(JSON.parse(readFileSync(file, "utf8")));
    } catch {
      // a torn or hand-mangled file: nothing set, the next save rewrites it
    }
  }
  cache = { file, mtimeMs, value };
  return value;
}

// ── The folder's path ──────────────────────────────────────────────────────

/** Why `dir` cannot be the voices folder, or null. Absolute, outside the
 *  vault, a directory, readable by this process. */
export function voicesDirProblem(dir: string): OwnDirProblem | null {
  let vault = "";
  try {
    vault = getVaultRoot();
  } catch {
    // no vault yet (a test): nothing to be inside of
  }
  if (!path.isAbsolute(dir)) return "relative";
  if (vault) {
    const lexical = voicesDirRefusal(path.resolve(dir), path.resolve(vault), path.isAbsolute, path.sep);
    if (lexical) return lexical;
  }
  let st;
  try {
    st = statSync(dir);
  } catch {
    return "missing";
  }
  if (!st.isDirectory()) return "notDir";
  try {
    accessSync(dir, constants.R_OK | constants.X_OK);
  } catch {
    return "unreadable";
  }
  // The same question after the links are followed: a symlink in the home
  // folder that points into the vault is inside the vault.
  if (vault) {
    try {
      const real = voicesDirRefusal(realpathSync(dir), realpathSync(vault), path.isAbsolute, path.sep);
      if (real) return real;
    } catch {
      // the lexical answer stands
    }
  }
  return null;
}

const DIR_SENTENCE: Record<OwnDirProblem, string> = {
  relative: "The voices folder must be an absolute path (it starts with / — or a drive letter on Windows)",
  inVault: "The voices folder must be outside the vault: the vault is synced and published, and a voice is this machine's",
  missing: "There is no folder at that path on the machine the server runs on",
  notDir: "That path is a file, not a folder",
  unreadable: "The server cannot read that folder (its user has no permission)",
};

// ── Staging ────────────────────────────────────────────────────────────────

let staged: Partial<SpeakLocal> | null = null;

export function discardStagedSpeakLocal(): void {
  staged = null;
}

/** Validate a PATCH's `speak.voicesDir` and stage it; nothing is written. */
export function stageVoicesDir(value: unknown): void {
  if (value === null || value === "") {
    staged = { ...staged, voicesDir: null };
    return;
  }
  if (typeof value !== "string") throw new VaultError(400, 'Settings key "speak.voicesDir" must be a string or null', "speakDirRelative");
  const dir = value.trim();
  if (dir.length > 4096) throw new VaultError(400, "The voices folder's path is too long", "speakDirRelative");
  const problem = voicesDirProblem(dir);
  if (problem) throw new VaultError(400, DIR_SENTENCE[problem], `speakDir${problem[0].toUpperCase()}${problem.slice(1)}`);
  staged = { ...staged, voicesDir: path.normalize(dir) };
}

/** Validate a PATCH's `speak.external` and stage it. */
export function stageExternal(value: unknown): void {
  if (value === null) {
    staged = { ...staged, external: null };
    return;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new VaultError(400, 'Settings key "speak.external" must be an object or null');
  }
  const v = value as Record<string, unknown>;
  for (const key of Object.keys(v)) {
    if (key !== "command" && key !== "langs") throw new VaultError(400, `Unknown settings key: speak.external.${key}`);
  }
  const command = typeof v.command === "string" ? v.command.trim() : "";
  if (command === "") {
    staged = { ...staged, external: null };
    return;
  }
  const problem = externalCommandProblem(command);
  if (problem === "noOut") throw new VaultError(400, "The command must name {out}, the file it writes the sound to", "speakExternalNoOut");
  if (problem === "quotes") throw new VaultError(400, "The command's quotes do not close", "speakExternalQuotes");
  if (problem) throw new VaultError(400, "The command is too long", "speakExternalTooLong");
  const langs: SpeakLang[] = [];
  if (v.langs !== undefined) {
    if (!Array.isArray(v.langs) || !v.langs.every(isSpeakLang)) {
      throw new VaultError(400, 'Settings key "speak.external.langs" must be a list of languages Read aloud speaks');
    }
    for (const l of v.langs) if (!langs.includes(l)) langs.push(l);
  }
  const external: SpeakExternal = { command, langs };
  staged = { ...staged, external };
}

const dirListeners = new Set<() => void>();

/** Called when a saved PATCH moved the voices folder (server/speakVoices.ts
 *  scans it again). */
export function onVoicesDirChange(listener: () => void): () => void {
  dirListeners.add(listener);
  return () => dirListeners.delete(listener);
}

/** Write what the accepted PATCH staged. */
export function applyStagedSpeakLocal(): { dirChanged: boolean } {
  const item = staged;
  staged = null;
  if (item === null) return { dirChanged: false };
  const before = speakLocal();
  const next: SpeakLocal = { ...before, ...item };
  const file = localPath();
  if (next.voicesDir === null && next.external === null) {
    try {
      rmSync(file);
    } catch {
      // nothing stored
    }
  } else {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, file);
    chmodSync(file, 0o600);
  }
  cache = null;
  // Saving the folder is also "scan it now", even when the path is the same
  // one: a reader who just dropped a voice in and pressed Save expects it.
  const dirChanged = "voicesDir" in item;
  if (dirChanged) for (const l of dirListeners) l();
  return { dirChanged };
}
