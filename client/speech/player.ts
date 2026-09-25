// THE PLAYER — one passage read aloud, a sentence at a time (docs/read-aloud.md).
//
// Both shells mount the same player (client/speech/SpeechPlayer.tsx draws it;
// this module is the logic, no DOM chrome), and every door ends here: the
// selection menu's row and the chip over a reading selection, Ctrl/Cmd ⇧ .,
// the palette's "Read this note", the phone's ⋯ row and the blog.
//
//   · A passage is split with shared/speech.ts's splitSentences, and each
//     sentence is its own `POST /api/speak`: the first word answers at once,
//     and the NEXT sentence is fetched while this one plays, so a paragraph
//     never waits for its own end.
//   · The current sentence is lit — in the player always, and in the page too
//     when the passage came from a DOM selection, with the CSS Custom
//     Highlight API (the same mechanism the annotation marks use, so the
//     prose is never rewritten to show it).
//   · WHEN THE SERVER CANNOT SPEAK — nothing installed that speaks the
//     language, a pocket vault (501, no server), a visitor on a blog whose
//     owner has not turned listening on — the player reads with the device's
//     own voices (`speechSynthesis`) and SAYS so, once, in the player: the
//     quality then depends on the device (Android's Google voices are good;
//     a Linux desktop's are not), and a reader deserves to know why this time
//     sounds worse.
//
// The rate button is the browser's playbackRate on top of the synthesis rate
// Settings chose — instant, no re-synthesis, the pitch kept.

import { useSyncExternalStore } from "react";
import { ApiError, speakAudio } from "../api.ts";
import { detectSpeechLang, splitSentences, type SpeakLang } from "../../shared/speech.ts";
import type { I18nKey } from "../i18n.ts";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "ended";

export interface PlayerState {
  status: PlayerStatus;
  sentences: string[];
  index: number;
  /** The playback multiplier (the player's own button). */
  rate: number;
  /** Who is speaking: the instance's engine, or the device's voices. */
  source: "engine" | "device" | null;
  /** An honest line for the reader (i18n key), or null. */
  note: I18nKey | null;
  /** The language of the passage, for the player's `lang` attribute. */
  lang: string | null;
}

export interface SpeakRequest {
  text: string;
  /** The note the words came from: its `lang:` decides a Latin passage, and
   *  a visitor may only be read the words of a published page. */
  path?: string | null;
  /** The paragraph around a short selection, for the language test. */
  context?: string | null;
  lang?: SpeakLang | null;
  /** The DOM range the passage was selected from — lit sentence by sentence. */
  range?: Range | null;
}

export const PLAYER_RATES = [0.75, 1, 1.25, 1.5];

let state: PlayerState = { status: "idle", sentences: [], index: 0, rate: 1, source: null, note: null, lang: null };
const listeners = new Set<() => void>();

function set(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function playerState(): PlayerState {
  return state;
}

export function usePlayer(): PlayerState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

// ── One passage ────────────────────────────────────────────────────────────

interface Passage {
  req: SpeakRequest;
  ctl: AbortController;
  audio: Map<number, Promise<string>>;
  /** Device mode: the server said no, for the rest of the passage. */
  device: boolean;
  /** Whether the device note has been shown for this passage. */
  langGuess: SpeakLang;
}

let passage: Passage | null = null;
let element: HTMLAudioElement | null = null;
let highlight: HighlightRange | null = null;

function audioEl(): HTMLAudioElement {
  if (element) return element;
  element = new Audio();
  element.preload = "auto";
  element.addEventListener("ended", () => void advance());
  element.addEventListener("error", () => {
    // A blob that will not decode (a WebView without Opus): the rest of the
    // passage goes to the device, which can always be asked.
    if (passage && !passage.device) void toDevice("speakDeviceNote");
  });
  return element;
}

/** Which container the page can play. Opus in Ogg is a sixth of WAV's
 *  size; a browser that cannot decode it gets WAV. */
function format(): "opus" | "wav" {
  try {
    return audioEl().canPlayType('audio/ogg; codecs="opus"') !== "" ? "opus" : "wav";
  } catch {
    return "wav";
  }
}

/** The audio as a `data:` URL, NOT a `blob:` one. The shell's CSP has no
 *  `blob:` anywhere (server/index.ts, and check-books holds it there — the
 *  pdf.js worker shim it keeps out is built from one), so an object URL is
 *  refused as a media source in production and the player fell straight to
 *  the device's voices on its first run. `data:` is in media-src already,
 *  and a spoken sentence is a few kilobytes of Opus. */
function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("unreadable audio"));
    reader.readAsDataURL(blob);
  });
}

function fetchSentence(p: Passage, i: number): Promise<string> {
  const had = p.audio.get(i);
  if (had) return had;
  const got = speakAudio(
    {
      text: state.sentences[i],
      lang: p.req.lang ?? undefined,
      path: p.req.path ?? undefined,
      context: i === 0 ? p.req.context ?? undefined : undefined,
      format: format(),
    },
    p.ctl.signal,
  ).then((spoken) => {
    if (spoken.lang && passage === p) set({ lang: spoken.lang });
    return dataUrl(spoken.blob);
  });
  // Rejections are read by whoever awaits; a prefetch nobody awaited yet must
  // not surface as an unhandled one.
  got.catch(() => {});
  p.audio.set(i, got);
  return got;
}

async function playIndex(i: number): Promise<void> {
  const p = passage;
  if (!p) return;
  if (i >= state.sentences.length) {
    set({ status: "ended", index: state.sentences.length - 1 });
    clearHighlight();
    return;
  }
  set({ index: i, status: state.status === "paused" ? "paused" : "loading" });
  lightSentence(i);
  if (p.device) {
    deviceSpeak(i);
    return;
  }
  let url: string;
  try {
    url = await fetchSentence(p, i);
  } catch (err) {
    if (passage !== p || p.ctl.signal.aborted) return;
    await toDevice(noteFor(err));
    return;
  }
  if (passage !== p) return;
  // The next one is asked for while this one plays.
  if (i + 1 < state.sentences.length) void fetchSentence(p, i + 1);
  const el = audioEl();
  el.src = url;
  el.playbackRate = state.rate;
  el.preservesPitch = true;
  set({ source: "engine" });
  if (state.status === "paused") return;
  try {
    await el.play();
    set({ status: "playing" });
  } catch {
    // Autoplay refused (no gesture reached this far): wait for the ▶.
    set({ status: "paused" });
  }
}

async function advance(): Promise<void> {
  if (!passage) return;
  await playIndex(state.index + 1);
}

/** Why the server did not speak, as the line the player shows. */
function noteFor(err: unknown): I18nKey {
  if (err instanceof ApiError) {
    if (err.code === "pocket") return "speakPocketNote";
    if (err.code === "speakNotInstalled") return "speakNotInstalledNote";
  }
  return "speakDeviceNote";
}

// ── The device's voices ────────────────────────────────────────────────────

function deviceVoices(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
}

async function toDevice(note: I18nKey): Promise<void> {
  const p = passage;
  if (!p) return;
  p.device = true;
  if (!deviceVoices()) {
    set({ status: "ended", note: "speakNoVoice", source: null });
    return;
  }
  set({ source: "device", note });
  deviceSpeak(state.index);
}

function deviceSpeak(i: number): void {
  const p = passage;
  if (!p || !deviceVoices()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(state.sentences[i]);
  const lang = p.req.lang ?? p.langGuess;
  u.lang = lang === "ja" ? "ja-JP" : lang === "ar" ? "ar" : lang === "fr" ? "fr-FR" : lang;
  u.rate = state.rate;
  u.onend = () => {
    if (passage === p && state.status !== "paused") void playIndex(i + 1);
  };
  u.onerror = (e) => {
    if (passage !== p || e.error === "interrupted" || e.error === "canceled") return;
    set({ status: "ended", note: "speakNoVoice" });
  };
  set({ lang, status: "playing" });
  synth.speak(u);
}

// ── Lighting the sentence in the page ──────────────────────────────────────

interface HighlightRange {
  /** Every non-space character of the passage, with where it lives. */
  chars: { node: Text; offset: number }[];
  flat: string;
  cursor: number;
}

const HIGHLIGHT_NAME = "astrolabe-speaking";

function indexRange(range: Range): HighlightRange | null {
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root.nodeType === Node.TEXT_NODE ? root.parentNode ?? root : root, NodeFilter.SHOW_TEXT);
  const chars: { node: Text; offset: number }[] = [];
  let flat = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    if (!range.intersectsNode(text)) continue;
    // Readings (<rt>) are spoken in place of their base, never lit.
    if (text.parentElement?.closest("rt, rp")) continue;
    const from = text === range.startContainer ? range.startOffset : 0;
    const to = text === range.endContainer ? range.endOffset : text.data.length;
    for (let o = from; o < to; o++) {
      const ch = text.data[o];
      if (/\s/.test(ch)) continue;
      chars.push({ node: text, offset: o });
      flat += ch;
    }
  }
  return chars.length > 0 ? { chars, flat, cursor: 0 } : null;
}

function lightSentence(i: number): void {
  const h = highlight;
  const registry = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
  if (!h || !registry || typeof Highlight !== "function") return;
  const needle = state.sentences[i].replace(/\s+/g, "");
  const at = h.flat.indexOf(needle, h.cursor);
  if (at < 0) {
    registry.delete(HIGHLIGHT_NAME);
    return;
  }
  h.cursor = at + needle.length;
  const first = h.chars[at];
  const last = h.chars[at + needle.length - 1];
  const r = document.createRange();
  r.setStart(first.node, first.offset);
  r.setEnd(last.node, last.offset + 1);
  registry.set(HIGHLIGHT_NAME, new Highlight(r));
}

function clearHighlight(): void {
  (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights?.delete(HIGHLIGHT_NAME);
}

// ── The verbs ──────────────────────────────────────────────────────────────

/** Read `req.text` aloud from its first sentence, ending whatever was
 *  playing. An empty passage does nothing. */
export function speak(req: SpeakRequest): void {
  const sentences = splitSentences(req.text);
  if (sentences.length === 0) return;
  stop();
  const langGuess = req.lang ?? detectSpeechLang(req.text, { context: req.context ?? null });
  passage = { req, ctl: new AbortController(), audio: new Map(), device: false, langGuess };
  highlight = req.range ? indexRange(req.range) : null;
  set({ status: "loading", sentences, index: 0, source: null, note: null, lang: langGuess });
  void playIndex(0);
}

export function pause(): void {
  if (state.status !== "playing" && state.status !== "loading") return;
  if (passage?.device) window.speechSynthesis?.pause();
  else element?.pause();
  set({ status: "paused" });
}

export function resume(): void {
  if (state.status === "ended") {
    replay();
    return;
  }
  if (state.status !== "paused" || !passage) return;
  if (passage.device) {
    // Chrome's resume() is unreliable after a long pause; saying the
    // sentence again is what a reader expects anyway.
    set({ status: "playing" });
    deviceSpeak(state.index);
    return;
  }
  const el = audioEl();
  set({ status: "playing" });
  if (el.src) void el.play().catch(() => set({ status: "paused" }));
  else void playIndex(state.index);
}

/** From the top again — cached, so it costs nothing twice. */
export function replay(): void {
  if (!passage) return;
  if (highlight) highlight.cursor = 0;
  if (passage.device) window.speechSynthesis?.cancel();
  set({ status: "loading" });
  void playIndex(0);
}

export function stop(): void {
  const p = passage;
  passage = null;
  if (p) {
    p.ctl.abort();
  }
  if (element) {
    element.pause();
    element.removeAttribute("src");
  }
  if (deviceVoices()) window.speechSynthesis.cancel();
  clearHighlight();
  highlight = null;
  set({ status: "idle", sentences: [], index: 0, source: null, note: null, lang: null });
}

export function setRate(rate: number): void {
  set({ rate });
  if (element) element.playbackRate = rate;
}

export function cycleRate(): void {
  const at = PLAYER_RATES.indexOf(state.rate);
  setRate(PLAYER_RATES[(at + 1) % PLAYER_RATES.length]);
}
