// YOUR OWN VOICES — the arithmetic of a voices folder (docs/read-aloud.md,
// "Your own voices").
//
// A reader who already has Piper voices on disk (installed by LibreOffice's
// Read Text extension, by hand, or downloaded from the rhasspy/piper-voices
// catalogue) points Settings → Language & dates → Your own voices at the
// folder, and the server scans it (server/speakVoices.ts). Every voice it
// finds joins the built-in ones in every picker, under "Your voices", and is
// loaded BY PATH by the worker — nothing is copied or downloaded again.
//
// What a voice file looks like in the wild, and so what the scan reads:
//
//   · PIPER: `<name>.onnx` beside `<name>.onnx.json` (the model and its
//     config — always both; the model without its config cannot be spoken).
//     The file name is `<locale>-<name>-<quality>` by convention
//     (`fr_FR-upmc-medium`); the LANGUAGE is the config's `language.code`
//     (`fr_FR`) or `language.family` (`fr`), else its `espeak.voice`, else the
//     file name's locale. A multi-speaker model (`num_speakers` > 1, a
//     `speaker_id_map`) is one entry PER SPEAKER — fr_FR-upmc-medium is two
//     voices, jessica and pierre, in one file. The catalogue's own layout is
//     `<lang>/<locale>/<name>/<quality>/<file>`, which a recursive scan reads
//     like any other.
//   · KOKORO: a `voices-*.bin` (an npz: one `<voice>.npy` per voice) beside a
//     `kokoro-*.onnx`. A voice's first letter is its language (a/b English,
//     e Spanish, f French, i Italian, j Japanese, p Portuguese, …).
//
// Everything here is pure — the parsing of a config, the ids, the merge of
// built-in and found voices into one picker, which voice speaks — so the
// server, the client and tests/speechVoices.test.ts read the same answers.

import {
  engineFor,
  engineNeeded,
  isSpeakLang,
  SPEAK_VOICES,
  voiceFor,
  type SpeakEngineId,
  type SpeakLang,
  type SpeakVoice,
} from "./speech.ts";

// ── What a found voice is ──────────────────────────────────────────────────

export type OwnVoiceKind = "piper" | "kokoro";

/** A voice found in the voices folder, as every picker sees it. */
export interface OwnVoice {
  /** `own:<path relative to the folder>` (+ `#<speaker>` for one speaker of
   *  a multi-speaker model, or one voice of a Kokoro pack). Stable across
   *  rescans, so it is what `speak.voices` stores. */
  id: string;
  /** Shown in the picker: a name, like a font's name — "Upmc · Jessica". */
  name: string;
  lang: SpeakLang;
  /** The locale the file names (`fr_FR`), or the language alone. */
  locale: string;
  /** Piper's quality word (x_low, low, medium, high), when the file says. */
  quality: string | null;
  speaker: string | null;
  kind: OwnVoiceKind;
}

/** Why a file in the folder is not a voice. Listed, never fatal. */
export type OwnSkipReason =
  /** A `.onnx` with no `.onnx.json` beside it. */
  | "noJson"
  /** A `.onnx.json` with no `.onnx` beside it. */
  | "noModel"
  /** A config that is not JSON, or not a Piper config. */
  | "badJson"
  /** A config that names no language the scan can read. */
  | "noLanguage"
  /** A voice in a language Read aloud does not detect yet (`lang` says which). */
  | "otherLanguage"
  /** A file the server's user cannot read. */
  | "unreadable"
  /** A Kokoro `voices-*.bin` with no `kokoro-*.onnx` beside it. */
  | "noKokoroModel";

export interface OwnSkipped {
  /** Relative to the folder, `/`-separated. */
  file: string;
  reason: OwnSkipReason;
  /** For `otherLanguage`: the language the file is in. */
  lang?: string;
}

/** Why the folder itself could not be read. */
export type OwnDirProblem = "relative" | "inVault" | "missing" | "notDir" | "unreadable";

/** What `GET /api/speak/status` says about the folder. */
export interface OwnVoicesStatus {
  dir: string | null;
  /** A scan is running now. */
  scanning: boolean;
  /** When the last scan finished (ms since the epoch), or null. */
  at: number | null;
  voices: OwnVoice[];
  skipped: OwnSkipped[];
  /** The folder could not be read at all. */
  problem: OwnDirProblem | null;
  /** The scan stopped at its limits (a folder of a whole disk). */
  truncated: boolean;
}

export const OWN_PREFIX = "own:";

export function isOwnVoiceId(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.startsWith(OWN_PREFIX) &&
    v.length > OWN_PREFIX.length &&
    v.length <= 1024 &&
    !/[\u0000-\u001f]/.test(v) &&
    !v.slice(OWN_PREFIX.length).split("#")[0].split("/").some((seg) => seg === ".." || seg === "")
  );
}

export function ownVoiceId(rel: string, part?: string | null): string {
  return OWN_PREFIX + rel + (part ? `#${part}` : "");
}

/** The engine whose runtime a found voice needs: Piper's is Light's
 *  (onnxruntime + piper), Kokoro's is Natural's (kokoro-onnx). */
export function ownVoiceEngine(v: Pick<OwnVoice, "kind">): SpeakEngineId {
  return v.kind === "kokoro" ? "natural" : "light";
}

function title(word: string): string {
  return word
    .split(/[_\s]+/)
    .filter((w) => w !== "")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── Piper ──────────────────────────────────────────────────────────────────

/** What a Piper file name says: `fr_FR-upmc-medium` → fr_FR, upmc, medium.
 *  A file named otherwise (`my-voice.onnx`) is its own name. */
export function piperFileParts(base: string): { locale: string | null; name: string; quality: string | null } {
  // A locale (`fr_FR-…`), or a bare language when a quality closes the name
  // (`fr-siwis-low`) — never just any short first word (`my-voice`).
  const m =
    /^([a-z]{2,3}_[A-Z]{2})-(.+?)(?:-(x_low|low|medium|high))?$/.exec(base) ?? /^([a-z]{2,3})-(.+)-(x_low|low|medium|high)$/.exec(base);
  if (m) return { locale: m[1], name: m[2], quality: m[3] ?? null };
  return { locale: null, name: base, quality: null };
}

/** The language a Piper config speaks: `language.code`, `language.family`,
 *  `espeak.voice`, then the file name's locale — the primary subtag,
 *  lowercased. */
export function piperConfigLang(config: Record<string, unknown>, fileLocale: string | null): { lang: string; locale: string } | null {
  const language = typeof config.language === "object" && config.language !== null ? (config.language as Record<string, unknown>) : {};
  const espeak = typeof config.espeak === "object" && config.espeak !== null ? (config.espeak as Record<string, unknown>) : {};
  for (const tag of [language.code, language.family, espeak.voice, fileLocale]) {
    if (typeof tag !== "string" || tag.trim() === "") continue;
    const locale = tag.trim().replace(/-/g, "_");
    const lang = locale.split("_")[0].toLowerCase();
    if (/^[a-z]{2,3}$/.test(lang)) return { lang, locale: typeof language.code === "string" && language.code !== "" ? language.code : locale };
  }
  return null;
}

export type PiperEntries = { voices: OwnVoice[] } | { skip: OwnSkipReason; lang?: string };

/** The voices one Piper model is: one, or one per speaker. `rel` is the
 *  model's path relative to the folder (`fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx`). */
export function piperEntries(rel: string, config: unknown): PiperEntries {
  if (typeof config !== "object" || config === null || Array.isArray(config)) return { skip: "badJson" };
  const c = config as Record<string, unknown>;
  // A Piper config always carries its phoneme table; a JSON that does not is
  // some other program's file that happens to sit beside a model.
  if (typeof c.phoneme_id_map !== "object" || c.phoneme_id_map === null) return { skip: "badJson" };
  const base = rel.split("/").pop()!.replace(/\.onnx$/i, "");
  const parts = piperFileParts(base);
  const found = piperConfigLang(c, parts.locale);
  if (!found) return { skip: "noLanguage" };
  if (!isSpeakLang(found.lang)) return { skip: "otherLanguage", lang: found.lang };
  const lang = found.lang;
  const audio = typeof c.audio === "object" && c.audio !== null ? (c.audio as Record<string, unknown>) : {};
  const quality = parts.quality ?? (typeof audio.quality === "string" ? audio.quality : null);
  const dataset = typeof c.dataset === "string" && c.dataset.trim() !== "" && parts.locale === null ? c.dataset.trim() : parts.name;
  const name = title(dataset);
  const map = typeof c.speaker_id_map === "object" && c.speaker_id_map !== null ? (c.speaker_id_map as Record<string, unknown>) : {};
  const speakers = Object.entries(map)
    .filter(([, id]) => typeof id === "number" && Number.isInteger(id) && id >= 0)
    .sort((a, b) => (a[1] as number) - (b[1] as number));
  const many = (typeof c.num_speakers === "number" ? c.num_speakers : speakers.length) > 1 && speakers.length > 1;
  const one = (speaker: string | null): OwnVoice => ({
    id: ownVoiceId(rel, speaker),
    name: speaker ? `${name} · ${title(speaker)}` : name,
    lang,
    locale: found.locale,
    quality,
    speaker,
    kind: "piper",
  });
  return { voices: many ? speakers.map(([speaker]) => one(speaker)) : [one(null)] };
}

/** The speaker number a multi-speaker config gives `speaker`, or null. */
export function piperSpeakerId(config: unknown, speaker: string | null): number | null {
  if (!speaker || typeof config !== "object" || config === null) return null;
  const map = (config as Record<string, unknown>).speaker_id_map;
  if (typeof map !== "object" || map === null) return null;
  const id = (map as Record<string, unknown>)[speaker];
  return typeof id === "number" && Number.isInteger(id) && id >= 0 ? id : null;
}

// ── Kokoro ─────────────────────────────────────────────────────────────────

const KOKORO_LANG: Record<string, string> = { a: "en", b: "en", e: "es", f: "fr", h: "hi", i: "it", j: "ja", p: "pt", z: "zh" };

/** The language a Kokoro voice speaks, from its first letter. */
export function kokoroVoiceLang(voice: string): string | null {
  return /^[a-z][fm]_/.test(voice) ? (KOKORO_LANG[voice[0]] ?? null) : null;
}

/** The voices of one Kokoro pack, from the npz member names it holds. */
export function kokoroEntries(rel: string, members: readonly string[]): { voices: OwnVoice[]; other: Map<string, number> } {
  const voices: OwnVoice[] = [];
  const other = new Map<string, number>();
  for (const member of members) {
    const voice = member.replace(/\.npy$/, "");
    if (voice === member) continue;
    const lang = kokoroVoiceLang(voice);
    if (lang === null) continue;
    if (!isSpeakLang(lang)) {
      other.set(lang, (other.get(lang) ?? 0) + 1);
      continue;
    }
    const [, bare] = voice.split("_");
    voices.push({
      id: ownVoiceId(rel, voice),
      name: title(bare ?? voice) + (voice[0] === "b" ? " (British)" : ""),
      lang,
      locale: voice[0] === "b" ? "en_GB" : voice[0] === "a" ? "en_US" : lang,
      quality: null,
      speaker: voice,
      kind: "kokoro",
    });
  }
  return { voices, other };
}

// ── The folder's path ──────────────────────────────────────────────────────

/** Whether `p` may be the voices folder, before the disk is asked: absolute
 *  (the server's working directory is nobody's business), and not inside the
 *  vault (the vault is synced, published and committed — a 60 MB model has
 *  no place in it, and a voice is this machine's, not the vault's). `sep` and
 *  `isAbsolute` are the platform's, passed in so the rule is testable. */
export function voicesDirRefusal(
  p: string,
  vaultRoot: string,
  isAbsolute: (p: string) => boolean,
  sep = "/",
): "relative" | "inVault" | null {
  if (!isAbsolute(p)) return "relative";
  const norm = (s: string): string => (s.endsWith(sep) ? s : s + sep);
  const a = norm(p);
  const v = norm(vaultRoot);
  const fold = sep === "\\" ? (s: string) => s.toLowerCase() : (s: string) => s;
  // Inside the vault, or the vault itself. A folder that CONTAINS the vault
  // is allowed: the scan steps around the vault when it walks.
  if (fold(a).startsWith(fold(v))) return "inVault";
  return null;
}

// ── The picker: built-in and found, per language ───────────────────────────

export interface VoiceChoices {
  /** The engine whose built-in voices are offered (the one that speaks or
   *  would speak the language), or null when no built-in engine speaks it. */
  engine: SpeakEngineId | null;
  builtin: readonly SpeakVoice[];
  own: OwnVoice[];
}

/** Every voice a picker for `lang` offers: the built-in engine's, then the
 *  folder's ("Your voices"). */
export function voiceChoices(
  lang: SpeakLang,
  chosen: SpeakEngineId,
  installed: ReadonlySet<SpeakEngineId>,
  own: readonly OwnVoice[],
): VoiceChoices {
  const engine = engineFor(lang, chosen, installed) ?? engineNeeded(lang, chosen);
  return {
    engine,
    builtin: engine ? (SPEAK_VOICES[engine][lang] ?? []) : [],
    own: own.filter((v) => v.lang === lang),
  };
}

/** The languages a Settings picker is drawn for: those with a choice to
 *  make — more than one built-in voice, or any voice of the reader's own. */
export function pickerLangs(
  langs: readonly SpeakLang[],
  chosen: SpeakEngineId,
  installed: ReadonlySet<SpeakEngineId>,
  own: readonly OwnVoice[],
): SpeakLang[] {
  return langs.filter((lang) => {
    const c = voiceChoices(lang, chosen, installed, own);
    // Several built-in voices count when their engine is here or chosen —
    // Japanese's four Kokoro voices are no choice on a Light-only machine.
    return c.own.length > 0 || (c.builtin.length > 1 && c.engine !== null && (installed.has(c.engine) || c.engine === chosen));
  });
}

export interface ResolvedVoice {
  engine: SpeakEngineId;
  /** The built-in voice id, or the found voice's `own:` id. */
  voice: string;
  own: OwnVoice | null;
}

/** WHICH VOICE SPEAKS `lang`:
 *    1. the reader's pick, when it is a found voice still in the folder and
 *       its engine's runtime is installed;
 *    2. else the built-in engine that speaks the language (the choice where
 *       both do), with the pick when it is that engine's, else its first;
 *    3. else the first found voice of the language whose runtime is here —
 *       a Spanish Piper voice speaks Spanish on a Light-only machine;
 *    4. else nothing (the route's 409). */
export function resolveVoice(
  lang: SpeakLang,
  chosen: SpeakEngineId,
  picked: string | null | undefined,
  installed: ReadonlySet<SpeakEngineId>,
  own: readonly OwnVoice[],
): ResolvedVoice | null {
  if (isOwnVoiceId(picked)) {
    const hit = own.find((v) => v.id === picked && v.lang === lang);
    if (hit && installed.has(ownVoiceEngine(hit))) return { engine: ownVoiceEngine(hit), voice: hit.id, own: hit };
  }
  const engine = engineFor(lang, chosen, installed);
  if (engine) return { engine, voice: voiceFor(engine, lang, picked) as string, own: null };
  const first = own.find((v) => v.lang === lang && installed.has(ownVoiceEngine(v)));
  if (first) return { engine: ownVoiceEngine(first), voice: first.id, own: first };
  return null;
}

/** The engine to install so that `lang` can be spoken: the built-in one it
 *  needs, else the runtime its found voices need. */
export function engineNeededWith(lang: SpeakLang, chosen: SpeakEngineId, own: readonly OwnVoice[]): SpeakEngineId | null {
  const mine = own.find((v) => v.lang === lang);
  if (mine) return ownVoiceEngine(mine);
  return engineNeeded(lang, chosen);
}

/** "fr: 3 voices · ar: 1" — the counts per language, most first. */
export function countByLang(voices: readonly OwnVoice[]): { lang: SpeakLang; count: number }[] {
  const counts = new Map<SpeakLang, number>();
  for (const v of voices) counts.set(v.lang, (counts.get(v.lang) ?? 0) + 1);
  return [...counts].map(([lang, count]) => ({ lang, count })).sort((a, b) => b.count - a.count || a.lang.localeCompare(b.lang));
}

/** The skipped files, grouped by why. */
export function skippedByReason(skipped: readonly OwnSkipped[]): { reason: OwnSkipReason; count: number; files: string[] }[] {
  const groups = new Map<OwnSkipReason, string[]>();
  for (const s of skipped) groups.set(s.reason, [...(groups.get(s.reason) ?? []), s.file]);
  return [...groups].map(([reason, files]) => ({ reason, count: files.length, files }));
}

// ── The external speaker ───────────────────────────────────────────────────

/** An owner's own program, run per sentence (server/speakExternal.ts). */
export interface SpeakExternal {
  /** `piper --model /path/voice.onnx --output_file {out}`: the sentence
   *  arrives on stdin; `{lang}` and `{out}` are substituted. */
  command: string;
  /** The languages it speaks for, instead of the app's voices. */
  langs: SpeakLang[];
}

export const EXTERNAL_COMMAND_MAX = 2000;

/** Split a command template into its words, the way a POSIX shell would
 *  split a line with quotes and backslashes — and nothing more: no
 *  variables, no globs, no pipes. The program is run directly, never
 *  through a shell. Null when the quotes do not close. */
export function splitCommand(line: string): string[] | null {
  const out: string[] = [];
  let word = "";
  let inWord = false;
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else word += ch;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === "\\" && i + 1 < line.length && /["\\$`]/.test(line[i + 1])) word += line[++i];
      else word += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
      continue;
    }
    if (ch === "\\" && i + 1 < line.length) {
      word += line[++i];
      inWord = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (inWord) out.push(word);
      word = "";
      inWord = false;
      continue;
    }
    word += ch;
    inWord = true;
  }
  if (quote !== null) return null;
  if (inWord) out.push(word);
  return out;
}

/** Why a command template cannot be saved, or null. */
export function externalCommandProblem(command: string): "empty" | "tooLong" | "quotes" | "noOut" | null {
  const c = command.trim();
  if (c === "") return "empty";
  if (c.length > EXTERNAL_COMMAND_MAX) return "tooLong";
  const words = splitCommand(c);
  if (words === null || words.length === 0) return "quotes";
  if (!words.slice(1).some((w) => w.includes("{out}"))) return "noOut";
  return null;
}

/** The argv a template becomes for one sentence. */
export function externalArgv(command: string, lang: string, out: string): string[] {
  return (splitCommand(command.trim()) ?? []).map((w) => w.replaceAll("{lang}", lang).replaceAll("{out}", out));
}
