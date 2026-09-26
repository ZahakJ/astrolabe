// READ ALOUD — the arithmetic both sides agree on (docs/read-aloud.md).
//
// A selection is spoken on the owner's own machine: the client splits it into
// sentences, asks `POST /api/speak` for each (server/speak.ts), and plays them
// in a row. Everything here is pure — no DOM, no filesystem, no clock — so the
// server, the client and the pocket read the same answers, and
// tests/speech.test.ts pins them:
//
//   · WHICH LANGUAGE a run of text is spoken in (script first, then the
//     note's own word, then the French test the editor already trusts);
//   · WHICH ENGINE speaks it: two engines, both on the CPU by design —
//     "light" (Piper, 63 MB a voice, fast on any machine) and "natural"
//     (Kokoro-82M, 353 MB once, wants a recent CPU). Arabic has only a Piper
//     voice and Japanese only a Kokoro one, whichever is chosen;
//   · WHERE A SENTENCE ENDS, in Arabic, Japanese and French punctuation;
//   · WHAT A NOTE SAYS when it is read whole — prose, not markup.
//
// The engine trial behind the choice (Kokoro, Piper and MeloTTS on the same
// ten lines, at 8, 2 and 1 cores) is written up in docs/read-aloud.md.

import { looksFrench } from "./frenchLine.ts";
import { stripFurigana } from "./furigana.ts";
import { noteProse } from "./wordCount.ts";
import type { OwnVoicesStatus, SpeakExternal } from "./speechVoices.ts";

// ── Engines, languages, voices ─────────────────────────────────────────────

export type SpeakEngineId = "light" | "natural";
export const SPEAK_ENGINES: readonly SpeakEngineId[] = ["light", "natural"];
/** The lighter engine is the default: the design target is an ordinary
 *  laptop or a small home server with no GPU, and Piper speaks a word there
 *  in well under a second. Kokoro is the choice for a machine that can
 *  afford it. */
export const SPEAK_ENGINE_DEFAULT: SpeakEngineId = "light";

/** The languages some installed engine can speak. */
export type SpeakLang = "en" | "fr" | "ja" | "ar" | "es" | "it" | "pt";
export const SPEAK_LANGS: readonly SpeakLang[] = ["en", "fr", "ja", "ar", "es", "it", "pt"];

export function isSpeakLang(v: unknown): v is SpeakLang {
  return typeof v === "string" && (SPEAK_LANGS as readonly string[]).includes(v);
}

export function isSpeakEngine(v: unknown): v is SpeakEngineId {
  return v === "light" || v === "natural";
}

/** A voice's gender as its dataset records it — a man's or a woman's voice,
 *  which a learner asks for by name ("men instead of women"). The pickers
 *  show it beside the name, (m) / (f) and their Arabic. */
export type SpeakVoiceGender = "m" | "f";

export interface SpeakVoice {
  id: string;
  /** Shown in the picker: a name, not chrome copy — the same in every UI
   *  language, like a font's name. */
  name: string;
  gender: SpeakVoiceGender;
  /** Light only: the Piper model file the voice is (`fr_FR-upmc-medium`),
   *  when the id is not the file's own name — one speaker of a
   *  multi-speaker model. */
  file?: string;
  /** Light only: that speaker's number in the model. */
  speaker?: number;
}

/** Every voice each engine offers, per language, default first. Piper's are
 *  model files (one download each — the Install fetches each language's
 *  FIRST voice, and the others download when the owner first chooses one);
 *  Kokoro's are rows of one voices file, so offering five costs nothing.
 *  Kokoro has one French voice, a woman's; Light's Pierre is the man's. */
export const SPEAK_VOICES: Readonly<Record<SpeakEngineId, Partial<Record<SpeakLang, readonly SpeakVoice[]>>>> = {
  light: {
    en: [{ id: "en_US-lessac-medium", name: "Lessac", gender: "f" }],
    fr: [
      { id: "fr_FR-siwis-medium", name: "Siwis", gender: "f" },
      { id: "fr_FR-upmc-medium#pierre", name: "Pierre", gender: "m", file: "fr_FR-upmc-medium", speaker: 1 },
      { id: "fr_FR-upmc-medium#jessica", name: "Jessica", gender: "f", file: "fr_FR-upmc-medium", speaker: 0 },
    ],
    ar: [{ id: "ar_JO-kareem-medium", name: "Kareem", gender: "m" }],
  },
  natural: {
    en: [
      { id: "af_heart", name: "Heart", gender: "f" },
      { id: "af_bella", name: "Bella", gender: "f" },
      { id: "am_michael", name: "Michael", gender: "m" },
      { id: "bf_emma", name: "Emma (British)", gender: "f" },
      { id: "bm_george", name: "George (British)", gender: "m" },
    ],
    fr: [{ id: "ff_siwis", name: "Siwis", gender: "f" }],
    ja: [
      { id: "jf_alpha", name: "Alpha", gender: "f" },
      { id: "jf_nezumi", name: "Nezumi", gender: "f" },
      { id: "jf_gongitsune", name: "Gongitsune", gender: "f" },
      { id: "jm_kumo", name: "Kumo", gender: "m" },
    ],
    es: [
      { id: "ef_dora", name: "Dora", gender: "f" },
      { id: "em_alex", name: "Alex", gender: "m" },
    ],
    it: [
      { id: "if_sara", name: "Sara", gender: "f" },
      { id: "im_nicola", name: "Nicola", gender: "m" },
    ],
    pt: [
      { id: "pf_dora", name: "Dora", gender: "f" },
      { id: "pm_alex", name: "Alex", gender: "m" },
    ],
  },
};

/** The Piper model file a Light voice is spoken from. */
export function piperFileOf(v: Pick<SpeakVoice, "id" | "file">): string {
  return v.file ?? v.id;
}

/** A built-in voice by id, with its engine and language — or null. */
export function builtinVoice(id: unknown): { engine: SpeakEngineId; lang: SpeakLang; voice: SpeakVoice } | null {
  if (typeof id !== "string") return null;
  for (const engine of SPEAK_ENGINES) {
    for (const lang of SPEAK_LANGS) {
      const voice = SPEAK_VOICES[engine][lang]?.find((v) => v.id === id);
      if (voice) return { engine, lang, voice };
    }
  }
  return null;
}

/** A Light voice that is not its language's first: its model downloads when
 *  the owner first chooses it, not at Install. */
export function isOnChoiceVoice(id: string): boolean {
  const b = builtinVoice(id);
  return b !== null && b.engine === "light" && SPEAK_VOICES.light[b.lang]?.[0]?.id !== id;
}

// ── What each installed engine truly speaks ────────────────────────────────

/** The languages an installed engine was found NOT to speak on this machine
 *  by its self-test (server/speakSelfTest.ts) — Natural's French when its
 *  phonemiser could not be loaded here, say. Such a language goes to the
 *  other engine, never to the English rules. */
export type SpeakRefusals = Partial<Record<SpeakEngineId, readonly SpeakLang[]>>;

function refuses(refused: SpeakRefusals | undefined, engine: SpeakEngineId, lang: SpeakLang): boolean {
  return refused?.[engine]?.includes(lang) ?? false;
}

export function engineSpeaks(engine: SpeakEngineId, lang: SpeakLang): boolean {
  return (SPEAK_VOICES[engine][lang]?.length ?? 0) > 0;
}

/** The engine that speaks `lang`, given the owner's choice and what is on
 *  disk — or null when nothing installed can. The choice wins where both
 *  engines speak the language (English, French); elsewhere the one engine
 *  that has a voice for it answers, whatever was chosen. */
export function engineFor(
  lang: SpeakLang,
  chosen: SpeakEngineId,
  installed: ReadonlySet<SpeakEngineId>,
  refused?: SpeakRefusals,
): SpeakEngineId | null {
  const order: SpeakEngineId[] = chosen === "natural" ? ["natural", "light"] : ["light", "natural"];
  for (const e of order) if (installed.has(e) && engineSpeaks(e, lang) && !refuses(refused, e, lang)) return e;
  return null;
}

/** The engine that WOULD speak `lang` once installed: the choice if it can,
 *  else the other. What the "install the Natural voices for Japanese" line
 *  names — and "install Light for French" when Natural's self-test refused
 *  French here. */
export function engineNeeded(lang: SpeakLang, chosen: SpeakEngineId, refused?: SpeakRefusals): SpeakEngineId | null {
  if (engineSpeaks(chosen, lang) && !refuses(refused, chosen, lang)) return chosen;
  const other: SpeakEngineId = chosen === "light" ? "natural" : "light";
  return engineSpeaks(other, lang) && !refuses(refused, other, lang) ? other : null;
}

/** The voice to use: the owner's pick when the engine has it (and, for a
 *  voice that downloads on choice, when it is on disk — `ready`), else the
 *  engine's first. */
export function voiceFor(
  engine: SpeakEngineId,
  lang: SpeakLang,
  picked?: string | null,
  ready: (id: string) => boolean = () => true,
): string | null {
  const list = SPEAK_VOICES[engine][lang];
  if (!list || list.length === 0) return null;
  return list.find((v) => v.id === picked && ready(v.id))?.id ?? list[0].id;
}

/** Is `voice` a BUILT-IN voice of `lang` in some engine? (The settings
 *  validator; a found voice's `own:` id is shared/speechVoices.ts's.) */
export function isVoiceOf(lang: SpeakLang, voice: unknown): boolean {
  return typeof voice === "string" && SPEAK_ENGINES.some((e) => SPEAK_VOICES[e][lang]?.some((v) => v.id === voice));
}

// ── Settings ───────────────────────────────────────────────────────────────

/** The synthesis speeds the row offers. The player's own rate button is the
 *  browser's playbackRate on top of this, which costs no re-synthesis. */
export const SPEAK_RATES: readonly number[] = [0.8, 1, 1.2];

export interface SpeakSettings {
  engine?: SpeakEngineId;
  rate?: number;
  /** A voice per language, for the languages with more than one. */
  voices?: Partial<Record<SpeakLang, string>>;
  /** "Readers may listen": the public blog offers Read aloud to visitors
   *  (it costs this machine's CPU, so off unless the owner says so). */
  public?: boolean;
}

/** The two settings that are THIS MACHINE'S and never the vault's: the
 *  voices folder is a path on this disk, and the external speaker is a
 *  program this server runs. They live in ASTROLABE_DATA/speak-local.json,
 *  which the config mirror does not carry (server/speakLocal.ts). */
export interface SpeakLocal {
  voicesDir: string | null;
  external: SpeakExternal | null;
}

export interface SpeakEffective extends SpeakLocal {
  engine: SpeakEngineId;
  rate: number;
  voices: Partial<Record<SpeakLang, string>>;
  public: boolean;
}

export function speakEffective(s: SpeakSettings | undefined, local?: Partial<SpeakLocal>): SpeakEffective {
  return {
    engine: isSpeakEngine(s?.engine) ? s.engine : SPEAK_ENGINE_DEFAULT,
    rate: typeof s?.rate === "number" && SPEAK_RATES.includes(s.rate) ? s.rate : 1,
    voices: { ...(s?.voices ?? {}) },
    public: s?.public === true,
    voicesDir: local?.voicesDir ?? null,
    external: local?.external ?? null,
  };
}

// ── What the server says about itself ─────────────────────────────────────

/** `fetch-python`: no uv and no usable Python on the machine, so a
 *  standalone CPython is being downloaded into the data folder
 *  (server/standalonePython.ts) — the packaged desktop app's usual case. */
export type SpeakInstallPhase = "idle" | "fetch-python" | "python" | "packages" | "models" | "check" | "done" | "failed";

/** What the self-test found for one language (server/speakSelfTest.ts). */
export interface SpeakCheckLang {
  ok: boolean;
  /** The phonemes the engine made of the test word. */
  phonemes?: string;
  /** Why not: the English rules' phonemes came back (`english`), no sound
   *  (`silent`), the run stopped before this language (`stopped` — espeak's
   *  exit), or the engine raised (`error`, with its message). */
  why?: "english" | "silent" | "stopped" | "error";
  error?: string;
}

export interface SpeakCheck {
  /** When it ran (ms since the epoch). */
  at: number;
  langs: Partial<Record<SpeakLang, SpeakCheckLang>>;
}

export interface SpeakEngineStatus {
  installed: boolean;
  /** Bytes of this engine's models on disk, and of the whole set. */
  downloaded: number;
  bytes: number;
  /** The last self-test of this engine on this machine, or null (never run,
   *  or the engine changed since). */
  check: SpeakCheck | null;
  /** A self-test is running now. */
  checking: boolean;
}

/** The languages each engine's self-test refused. */
export function refusalsOf(engines: Record<SpeakEngineId, Pick<SpeakEngineStatus, "check">>): SpeakRefusals {
  const out: Partial<Record<SpeakEngineId, SpeakLang[]>> = {};
  for (const e of SPEAK_ENGINES) {
    const langs = engines[e].check?.langs ?? {};
    const no = SPEAK_LANGS.filter((l) => langs[l]?.ok === false);
    if (no.length > 0) out[e] = no;
  }
  return out;
}

/** A built-in voice that downloads on choice: how much of it is here. */
export interface SpeakVoiceFile {
  ready: boolean;
  downloaded: number;
  bytes: number;
}

/** The download of an on-choice voice (one at a time). */
export interface SpeakVoiceFetch {
  voice: string | null;
  phase: "idle" | "downloading" | "done" | "failed";
  error?: string;
}

export interface SpeakStatus {
  /** The venv exists and its packages are in. */
  runtime: boolean;
  engines: Record<SpeakEngineId, SpeakEngineStatus>;
  install: {
    phase: SpeakInstallPhase;
    engine: SpeakEngineId | null;
    error?: string;
    code?: string;
    /** 0–100 while a standalone Python is fetched. */
    progress?: number;
  };
  /** The built-in voices that download on choice (Light's Pierre, …), by
   *  voice id, and the one downloading now. */
  voices: Record<string, SpeakVoiceFile>;
  fetch: SpeakVoiceFetch;
  /** The worker is up (a warm engine answers a word in well under a second). */
  warm: boolean;
  /** Jobs waiting behind the one running. */
  queued: number;
  /** The gates' tone stands in for the engines (ASTROLABE_SPEAK_FAKE=1). */
  test: boolean;
  /** Where the venv lives, for the docs' "where is it" answer. */
  venv: string;
  settings: SpeakEffective;
  /** The voices folder and what its last scan found. */
  own: OwnVoicesStatus;
  /** The operator allowed an external speaker (`SPEAK_EXTERNAL=on` in the
   *  server's .env; the desktop app passes it on). Off, none is saved or run. */
  externalAllowed: boolean;
}

// ── Which language ─────────────────────────────────────────────────────────

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
/** Kana (unmistakably Japanese) and Han (Japanese in this vault — the same
 *  bargain shared/script.ts makes). */
const JAPANESE_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿ｦ-ﾟ々]/g;
const LATIN_RE = /[A-Za-zÀ-ɏ]/g;

export interface SpeechLangHints {
  /** The note's own `lang:` / `language:` frontmatter, as written. */
  noteLang?: string | null;
  /** The twin face the note wears ("ar" | "en"), when it has one. */
  face?: "ar" | "en" | null;
  /** The site's language — the last word for Latin text nobody labelled. */
  siteLang?: string | null;
  /** The line or paragraph the selection sits in. One selected word has no
   *  function words to count; the sentence around it does. */
  context?: string | null;
  /** The language of the whole passage being read (`passageSpeechLang`),
   *  when it has one: a French lesson's heading ("Décrire son quotidien")
   *  carries no French word a detector can count, and read sentence by
   *  sentence it was English. */
  passage?: string | null;
}

/** The language `lang: fr-CA` means, when it is one we speak. */
export function speakLangOf(tag: string | null | undefined): SpeakLang | null {
  if (typeof tag !== "string") return null;
  const base = tag.trim().toLowerCase().split(/[-_]/)[0];
  return isSpeakLang(base) ? base : null;
}

/** The `lang:` (or `language:`) value in a frontmatter's TEXT. */
export function frontmatterLang(fmText: string): string | null {
  const m = /^[ \t]*(?:lang|language)[ \t]*:[ \t]*["']?([A-Za-z_-]+)["']?[ \t]*$/m.exec(fmText);
  return m ? m[1] : null;
}

/** Which language `text` is spoken in. SCRIPT FIRST, because script is a
 *  property of the characters and never wrong: Arabic letters are Arabic,
 *  kana and kanji are Japanese — by count, so an Arabic line quoting one
 *  kanji is still Arabic, and a Japanese line naming a Latin thing is still
 *  Japanese. Then Latin text, strongest evidence first:
 *
 *    1. the text itself reads as French (shared/frenchLine.ts: two French
 *       function words, whole words — the test the editor's corrections
 *       already trust), so a French quotation in an English note is French;
 *    2. the note's own `lang:` when it names a language we speak;
 *    3. the sentence around the selection reads as French — one selected
 *       word ("grenouille") has nothing to count on its own;
 *    4. the passage being read is French as a whole (most of its lines
 *       are), so its short lines — a heading, "C'est tout." — are too;
 *    5. a lone word wearing an accent French uses and English does not;
 *    6. the twin face, the site's language, and English. */
export function detectSpeechLang(text: string, hints: SpeechLangHints = {}): SpeakLang {
  const ar = text.match(ARABIC_RE)?.length ?? 0;
  const ja = text.match(JAPANESE_RE)?.length ?? 0;
  const latin = text.match(LATIN_RE)?.length ?? 0;
  if (ar > 0 && ar >= ja && ar >= latin) return "ar";
  if (ja > 0 && ja >= latin) return "ja";
  if (looksFrench(text)) return "fr";
  const note = speakLangOf(hints.noteLang);
  if (note && note !== "ar" && note !== "ja") return note;
  if (hints.context && looksFrench(hints.context)) return "fr";
  if (speakLangOf(hints.passage) === "fr") return "fr";
  if (/^\s*\p{L}+\s*$/u.test(text) && /[àâæçéèêëîïôœùûüÿ]/i.test(text)) return "fr";
  if (hints.face === "en") return "en";
  const site = speakLangOf(hints.siteLang);
  if (site && site !== "ar" && site !== "ja") return site;
  return "en";
}

/** The language of a whole passage, for the sentences in it that carry no
 *  evidence of their own — or null. Counted by LINE, not by marker, so an
 *  English note quoting one French line stays English: the passage is
 *  French when its French lines are at least half of the lines that could
 *  tell (a line of three words or more, or one that reads as French).
 *  Only Latin text is counted — Arabic and Japanese never needed help. */
export function passageSpeechLang(text: string): SpeakLang | null {
  let french = 0;
  let telling = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || (line.match(LATIN_RE)?.length ?? 0) === 0) continue;
    if (looksFrench(line)) {
      french++;
      telling++;
    } else if ((line.match(/\p{L}+/gu)?.length ?? 0) >= 3) {
      telling++;
    }
  }
  return french > 0 && french * 2 >= telling ? "fr" : null;
}

// ── Where a sentence ends ──────────────────────────────────────────────────

/** A sentence longer than this is cut at its last comma, semicolon or colon
 *  before the limit (and at a space when it has none): the engines' prosody
 *  is planned per call, and the first word of a paragraph should not wait
 *  for the whole paragraph to be synthesised. */
export const SENTENCE_MAX = 280;

/** The most one request may carry. The client sends a sentence at a time;
 *  this is the server's refusal of anything else. */
export const SPEAK_MAX_CHARS = 1000;

/** Abbreviations whose full stop does not end a sentence. */
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "st", "vs", "etc", "e.g", "i.e", "cf", "no", "vol", "p", "pp", "fig", "ch",
  "m", "mm", "mme", "mlle", "me", "st", "ste", "av", "apr", "j.-c", "env", "ex", "réf", "éd",
]);

/** Sentence-final marks: Latin . ! ? … ; Arabic ؟ (and the Urdu full stop
 *  ۔, which Arabic-script text sometimes carries); Japanese 。！？ and the
 *  full-width forms. */
const FINAL = /[.!?…؟۔。！？]/;
/** Closers that belong to the sentence they end: quotes, brackets, and the
 *  French guillemet, with the narrow no-break space French sets before it. */
const CLOSERS = /[\s  ]*["'”’»)\]」』）]/y;

/** Split `text` into the sentences a player speaks one at a time. Empty
 *  pieces never come back; every piece is trimmed; a piece keeps its own
 *  punctuation (the engines read it as prosody). */
export function splitSentences(text: string): string[] {
  return splitSentencesIn(text).map((s) => s.text);
}

/** The sentences, each with the paragraph it came from — the context its
 *  language is judged in when it has no French word of its own. */
export function splitSentencesIn(text: string): { text: string; block: string }[] {
  const all: { text: string; block: string }[] = [];
  // A blank line is always a boundary — a heading, a list item and a
  // paragraph are separate thoughts even when nobody punctuated them.
  for (const block of text.split(/\n[ \t]*\n|\r\n[ \t]*\r\n/)) {
    const out: string[] = [];
    const flat = block.replace(/\s*\n\s*/g, " ").trim();
    if (flat === "") continue;
    let start = 0;
    for (let i = 0; i < flat.length; i++) {
      const ch = flat[i];
      if (!FINAL.test(ch)) continue;
      // A run of marks ("?!", "...") ends together.
      let end = i + 1;
      while (end < flat.length && FINAL.test(flat[end])) end++;
      CLOSERS.lastIndex = end;
      let m: RegExpExecArray | null;
      while ((m = CLOSERS.exec(flat)) !== null) {
        end = CLOSERS.lastIndex;
      }
      if (ch === ".") {
        // A decimal (3.5), an initial (J. R. R.), an abbreviation (Dr., etc.)
        // and a mid-word dot (e.g) do not end anything.
        const next = flat[i + 1] ?? "";
        if (/\d/.test(flat[i - 1] ?? "") && /\d/.test(next)) continue;
        if (/\p{L}/u.test(next)) continue;
        const word = /([\p{L}.-]+)$/u.exec(flat.slice(start, i))?.[1] ?? "";
        if (ABBREVIATIONS.has(word.toLowerCase())) continue;
        if (/^\p{Lu}$/u.test(word)) continue;
      }
      // Latin and Arabic marks end a sentence only before a space (or the
      // end); Japanese marks need none — Japanese sets no space after 。.
      const cjk = /[。！？]/.test(ch);
      if (!cjk && end < flat.length && !/[\s  ]/.test(flat[end])) continue;
      push(out, flat.slice(start, end));
      start = end;
      i = end - 1;
    }
    push(out, flat.slice(start));
    for (const s of out) all.push({ text: s, block: flat });
  }
  return all;
}

function push(out: string[], piece: string): void {
  const s = piece.trim();
  if (s === "" || !/[\p{L}\p{N}]/u.test(s)) return;
  for (const part of cutLong(s)) out.push(part);
}

/** A sentence past SENTENCE_MAX, cut where a reader would breathe. */
function cutLong(s: string): string[] {
  const out: string[] = [];
  let rest = s;
  while (rest.length > SENTENCE_MAX) {
    const window = rest.slice(0, SENTENCE_MAX);
    let at = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(": "), window.lastIndexOf("، "), window.lastIndexOf("、"));
    if (at < SENTENCE_MAX / 3) at = window.lastIndexOf(" ");
    if (at < SENTENCE_MAX / 3) at = SENTENCE_MAX - 1;
    out.push(rest.slice(0, at + 1).trim());
    rest = rest.slice(at + 1).trim();
  }
  if (rest !== "") out.push(rest);
  return out;
}

// ── What a note says ───────────────────────────────────────────────────────

/** Furigana, spoken: `{漢字|かん|じ}` reads its BASE, once — never the base and
 *  then its reading, which is what a screen reader makes of the rendered
 *  <ruby> and what a naive text extraction of the page gives. The engine's
 *  own Japanese G2P (UniDic) reads the kanji; the base is also what is on
 *  the page, so the sentence the player lights is the sentence the reader
 *  sees. */
export function speakFurigana(text: string): string {
  return stripFurigana(text);
}

/** A note's source, reduced to what is read aloud: shared/wordCount.ts's
 *  prose (no frontmatter, no code, no math, links as their labels), with
 *  furigana read as its base and footnote markers dropped. */
export function speechTextOfNote(source: string): string {
  return noteProse(speakFurigana(source))
    .replace(/\[\^[^\]]+\]:?/g, " ")
    .replace(/^[ \t]*\[![a-z-]+\][+-]?/gim, "")
    .replace(/[ \t]+/g, " ");
}

/** Selected text, made speakable: furigana read as its base, markup the
 *  selection may have caught (an editor selection is source) stripped the
 *  same way a whole note is. */
export function speechTextOfSelection(text: string): string {
  return speechTextOfNote(text).trim();
}

/** A text with no sentence-final mark gets the language's own full stop
 *  before it reaches the engine. Kokoro's prosody wants a sentence: in the
 *  trial it spoke 図書館 alone with a trailing lilt that whisper misheard
 *  three times in ten kanji words, and all ten were understood once closed
 *  with 「。」. Harmless to Piper. */
export function closeSentence(text: string, lang: SpeakLang): string {
  const s = text.trim();
  if (s === "" || /[.!?…؟۔。！？"”»」』)]$/.test(s)) return s;
  return s + (lang === "ja" ? "。" : ".");
}
