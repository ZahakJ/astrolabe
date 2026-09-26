// THE DEVICE'S VOICES — which one reads, and the reader's say in it
// (docs/read-aloud.md, "This device's voices").
//
// When the app's own voices cannot speak a passage, the player reads with the
// browser's `speechSynthesis`. It used to hand the browser a language and let
// it choose, and on Windows the browser chose badly: a reader who had picked
// Microsoft Paul in Settings → Speech heard Hortense, a woman's voice he never
// chose, because Chromium takes the FIRST French voice it enumerates. What a
// page can know is also less than it looks: Chromium marks `voice.default` on
// the first voice of its whole list (`is_default = (i == 0)` in
// content/browser/speech/speech_synthesis_impl.cc), and on Windows that list
// is the registry's order (the OneCore voices, then SAPI), so the voice chosen
// in Windows' own Settings is NOT exposed to a page at all. macOS and Android
// browsers do mark their real default.
//
// So the app chooses honestly and says what it chose:
//   1. the voice the reader picked for this language on this device (the
//      player's ▾, or Settings → Language & dates → Read aloud), remembered
//      in localStorage — a device fact, like the voices themselves;
//   1½. in the Windows desktop app, the voice chosen in Windows' own
//      Settings → Speech, which the app reads from the registry
//      (electron/systemVoice.ts) since the page cannot;
//   2. else the voice the browser marks as default, when it speaks this
//      language (a real default on macOS and Android; on Windows the mark is
//      the registry's first voice and is not trusted);
//   3. else a voice in the reader's own locale for the language (fr-FR for a
//      reader whose languages say fr-FR, over fr-CA);
//   4. else a voice on the device over one that sends the words to a
//      network service (Chrome's "Google …" voices) — nothing leaves the
//      machine unless nothing else can speak;
//   5. else the first.
// and the player names it ("Microsoft Paul · French (France)") with the ▾ that
// changes it, so the one thing a page cannot see is one click to put right.
//
// The choice logic is pure and takes the voice list as an argument, so
// tests/deviceVoices.test.ts drives it with Windows-, Android- and
// macOS-shaped lists and an empty one; the live list and the storage are
// below it.

import { useSyncExternalStore } from "react";

/** The fields of a SpeechSynthesisVoice the choice reads. */
export interface VoiceLike {
  name: string;
  lang: string;
  voiceURI: string;
  default: boolean;
  localService: boolean;
}

/** The primary language of a tag, lowercased. Android has been seen to
 *  answer `fr_FR`; a lone `fil` stays `fil`. */
export function primaryLang(tag: string): string {
  return tag.replace(/_/g, "-").split("-")[0].toLowerCase();
}

function normTag(tag: string): string {
  return tag.replace(/_/g, "-").toLowerCase();
}

/** Every voice that speaks `lang` (a primary subtag or a full tag), in the
 *  order a picker lists them: by locale, then by name. */
export function voicesFor(voices: readonly VoiceLike[], lang: string): VoiceLike[] {
  const want = primaryLang(lang);
  return voices
    .filter((v) => primaryLang(v.lang) === want)
    .sort((a, b) => normTag(a.lang).localeCompare(normTag(b.lang)) || a.name.localeCompare(b.name));
}

export interface PickOptions {
  /** The reader's remembered choice for this language: a voiceURI (or a
   *  name, which older stores and some engines use interchangeably). */
  chosen?: string | null;
  /** The reader's locales, most preferred first (`navigator.languages`). */
  locales?: readonly string[];
  /** The voice the OPERATING SYSTEM chose, by name, when something outside
   *  the page could read it (the Windows desktop app: electron/systemVoice.ts).
   *  Honoured for its own language only. */
  system?: string | null;
  /** Whether the browser's `default` mark means anything here. It does not
   *  on Windows (see the header): there the mark is simply the first voice of
   *  the registry, so it is ignored rather than passed off as the system's. */
  trustDefault?: boolean;
}

/** Whether this browser's `default` mark is the system's choice. */
export function defaultMarkIsReal(userAgent: string): boolean {
  return !/Windows/i.test(userAgent);
}

/** The voice that reads `lang` on this device, or null when none speaks it. */
export function pickVoice(voices: readonly VoiceLike[], lang: string, opts: PickOptions = {}): VoiceLike | null {
  const own = voices.filter((v) => primaryLang(v.lang) === primaryLang(lang));
  if (own.length === 0) return null;
  if (opts.chosen) {
    const hit = own.find((v) => v.voiceURI === opts.chosen) ?? own.find((v) => v.name === opts.chosen);
    if (hit) return hit;
  }
  if (opts.system) {
    // By name, and by short name without SAPI's " Desktop": the OneCore
    // and SAPI stores name one voice two ways.
    const bare = (n: string): string => voiceShortName({ name: n }).replace(/\s+Desktop$/i, "").toLowerCase();
    const want = bare(opts.system);
    const hit = own.find((v) => v.name === opts.system) ?? own.find((v) => bare(v.name) === want);
    if (hit) return hit;
  }
  const marked = opts.trustDefault === false ? undefined : own.find((v) => v.default);
  if (marked) return marked;
  const localeFirst = (list: VoiceLike[]): VoiceLike | undefined => {
    for (const loc of opts.locales ?? []) {
      if (primaryLang(loc) !== primaryLang(lang)) continue;
      const hit = list.find((v) => normTag(v.lang) === normTag(loc));
      if (hit) return hit;
    }
    return undefined;
  };
  const local = own.filter((v) => v.localService);
  return localeFirst(local) ?? local[0] ?? localeFirst(own) ?? own[0];
}

/** A voice's name without the language the platform appended to it:
 *  Windows says "Microsoft Paul - French (France)", and the player puts the
 *  language beside the name itself. */
export function voiceShortName(v: Pick<VoiceLike, "name">): string {
  const m = /^(.+?)\s+-\s+[^-]+\(.+\)\s*$/.exec(v.name);
  return (m ? m[1] : v.name).trim();
}

/** A locale in the reader's language: "French (France)" / "الفرنسية (فرنسا)".
 *  Falls back to the tag itself where Intl cannot name it. */
export function localeName(tag: string, uiLang: string): string {
  try {
    const name = new Intl.DisplayNames([uiLang], { type: "language" }).of(tag.replace(/_/g, "-"));
    if (name) return name;
  } catch {
    // an odd tag
  }
  return tag;
}

// ── The system's choice, where the desktop app could read it ───────────────

let systemVoiceName: string | null = null;

/** The desktop hands over Windows' chosen voice at `hello`. */
export function setSystemVoiceName(name: string | null): void {
  systemVoiceName = name;
  bump();
}

export function systemVoice(): string | null {
  return systemVoiceName;
}

// ── The reader's choice, per device ────────────────────────────────────────

const STORE_KEY = "astrolabe.speak.deviceVoices";

function readChoices(): Record<string, string> {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** The voice the reader chose for `lang` on this device, or null. */
export function chosenVoice(lang: string): string | null {
  const v = readChoices()[primaryLang(lang)];
  return typeof v === "string" && v !== "" ? v : null;
}

/** Remember (or, with null, forget) the reader's voice for `lang`. */
export function chooseVoice(lang: string, voiceURI: string | null): void {
  const next = readChoices();
  if (voiceURI) next[primaryLang(lang)] = voiceURI;
  else delete next[primaryLang(lang)];
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    // private mode: the choice lasts this page
  }
  bump();
}

// ── The live list ──────────────────────────────────────────────────────────

export function hasSpeechSynthesis(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
}

/** The device's voices now. Chromium fills the list asynchronously: the first
 *  call on a page is often empty, and `voiceschanged` says when it is not. */
export function deviceVoiceList(): SpeechSynthesisVoice[] {
  if (!hasSpeechSynthesis()) return [];
  try {
    return window.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

/** The list once the browser has had a moment to fill it: at once when it
 *  has voices, else after `voiceschanged` or `wait` ms, whichever is first.
 *  An empty answer is real on a Linux Electron, which has no speech engine. */
export function loadDeviceVoices(wait = 1500): Promise<SpeechSynthesisVoice[]> {
  const now = deviceVoiceList();
  if (now.length > 0 || !hasSpeechSynthesis()) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = (): void => {
      window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(deviceVoiceList());
    };
    const timer = window.setTimeout(done, wait);
    window.speechSynthesis.addEventListener("voiceschanged", done);
  });
}

let version = 0;
const listeners = new Set<() => void>();
function bump(): void {
  version++;
  for (const l of listeners) l();
}
let watching = false;

/** Re-render when the device's voices arrive or the reader's choice changes.
 *  Answers a number that moves; read the list with deviceVoiceList(). */
export function useDeviceVoicesVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      if (!watching && hasSpeechSynthesis()) {
        watching = true;
        window.speechSynthesis.addEventListener("voiceschanged", bump);
        // Ask once: some engines only start filling the list when asked.
        deviceVoiceList();
      }
      return () => listeners.delete(l);
    },
    () => version,
    () => version,
  );
}
