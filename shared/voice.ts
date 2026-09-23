// VOICE NOTES — the arithmetic (docs/capture.md "Voice", CONTRACTS.md 3.24.0).
//
// A recording is spoken on a phone or a desk, uploaded to `POST /api/voice`,
// transcribed on the owner's own machine (server/voice.ts), and lands in the
// vault in one of two shapes:
//
//   short (≤ 80 words)   a timestamped bullet in `Inbox/YYYY-MM-DD.md`, the
//                        phone's capture note, with a link to the recording
//   long  (> 80 words)   its own note, `Inbox/Voice — <first words>.md`, the
//                        recording embedded above the transcript
//
// Eighty words is roughly thirty seconds of speech: a reminder or a thought is
// a line in the day's inbox, where the share sheet already puts lines; a
// dictated paragraph is a note, because a bullet that runs to a screen is a
// note wearing a bullet.
//
// Nothing here touches a filesystem or a clock: the server and the pocket both
// call it with the date and time the RECORDING carried (the device's clock,
// Western digits, like every other stamp the capture sheets write), and
// tests/voice.test.ts pins every byte.

import { resolveAttachmentDir, type AttachmentLocation } from "./attachments.ts";
import { clipFileName } from "./capture.ts";

/** Where the voice notes land. The same folder the phone's share sheet files
 *  into (mobile/src/capture.ts), so one inbox holds everything caught on the
 *  move. An address, not chrome: the same word in every language. */
export const VOICE_INBOX = "Inbox";

/** The recordings' own subfolder, inside whatever the attachment-location
 *  setting resolves to for a note in the inbox. */
export const VOICE_SUBFOLDER = "Voice";

/** Above this many words a transcript is its own note. */
export const LONG_TRANSCRIPT_WORDS = 80;

/** How much a single recording may weigh. Opus at the rates a browser's
 *  MediaRecorder picks is ~4 kB a second, so this is well over half an hour;
 *  the cap exists for the body, not for the speaker. */
export const VOICE_MAX_BYTES = 10 * 1024 * 1024;

/** The longest recording the sheet lets run before it stops on its own. The
 *  queue transcribes one job at a time, and a forgotten recorder should not
 *  hold the machine for an hour. */
export const VOICE_MAX_SECONDS = 15 * 60;

// ── What a recording is ──────────────────────────────────────────────────

export type RecordingFormat = "webm" | "ogg" | "wav";

/** The container, from the bytes — the extension and the Content-Type are
 *  the uploader's word, and this is the server's (and the pocket's). WebM is
 *  what Chromium, Electron and the Android WebView record; Ogg is Firefox's;
 *  WAV is what a script is likeliest to send. */
export function sniffRecording(buf: Uint8Array): RecordingFormat | null {
  const latin = (from: number, to: number): string =>
    buf.length >= to ? String.fromCharCode(...buf.subarray(from, to)) : "";
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "webm";
  if (latin(0, 4) === "OggS") return "ogg";
  if (latin(0, 4) === "RIFF" && latin(8, 12) === "WAVE") return "wav";
  return null;
}

// ── Settings ──────────────────────────────────────────────────────────────

export type VoiceLanguage = "auto" | "ar" | "en";
export const VOICE_LANGUAGES: readonly VoiceLanguage[] = ["auto", "ar", "en"];

export function isVoiceLanguage(value: unknown): value is VoiceLanguage {
  return typeof value === "string" && (VOICE_LANGUAGES as readonly string[]).includes(value);
}

/** One downloadable model. `bytes` is the file's exact size on the host it
 *  comes from, so the settings row can say what a choice costs before it is
 *  made, and the download can be checked when it is done. */
export interface VoiceModelInfo {
  id: VoiceModelId;
  /** The file under ASTROLABE_DATA/models/whisper/. */
  file: string;
  bytes: number;
}

export type VoiceModelId = "large-v3-turbo-q5_0" | "large-v3-turbo" | "small-q5_1";

/** whisper.cpp's own GGML files (huggingface.co/ggerganov/whisper.cpp). The
 *  default is the one measured best on Arabic (CONTRACTS.md 3.24.0): the
 *  quantised turbo scored better than its own full-precision file on the test
 *  clip and is a third of the download. `small-q5_1` is the answer for a
 *  machine with no GPU at all. */
export const VOICE_MODELS: readonly VoiceModelInfo[] = [
  { id: "large-v3-turbo-q5_0", file: "ggml-large-v3-turbo-q5_0.bin", bytes: 574_041_195 },
  { id: "large-v3-turbo", file: "ggml-large-v3-turbo.bin", bytes: 1_624_555_275 },
  { id: "small-q5_1", file: "ggml-small-q5_1.bin", bytes: 190_085_487 },
];

export const VOICE_MODEL_DEFAULT: VoiceModelId = "large-v3-turbo-q5_0";

/** The stored `voice.model` may also be "off": recordings are kept and never
 *  transcribed — the setting for a small server that should not run a model. */
export type VoiceModelSetting = VoiceModelId | "off";

export function isVoiceModelSetting(value: unknown): value is VoiceModelSetting {
  return value === "off" || VOICE_MODELS.some((m) => m.id === value);
}

export function voiceModelInfo(id: VoiceModelId): VoiceModelInfo {
  return VOICE_MODELS.find((m) => m.id === id) ?? VOICE_MODELS[0];
}

// ── Names ─────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isVoiceDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
}

export function isVoiceTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

/** `2026-09-23` + `14:02` → `2026-09-23 1402`: the recording's stem. The colon
 *  goes because Windows refuses it in a filename, and the day's own format
 *  stays so the folder sorts by when things were said. */
export function voiceStamp(date: string, time: string): string {
  return `${date} ${time.replace(":", "")}`;
}

/** The folder a recording lands in: the attachment-location setting, asked
 *  as though the upload happened in the inbox (so "same folder" means
 *  `Inbox/Voice`, "subfolder" means `Inbox/<folder>/Voice`, and the default
 *  "specified" mode means `<attachments folder>/Voice`), plus `Voice`. */
export function voiceAudioDir(loc: AttachmentLocation): string {
  const base = resolveAttachmentDir(loc, VOICE_INBOX);
  return base === "" ? VOICE_SUBFOLDER : `${base}/${VOICE_SUBFOLDER}`;
}

/** The n-th candidate path for a recording: `…/2026-09-23 1402.webm`, then
 *  `…/2026-09-23 1402 (2).webm`. Two recordings in one minute are two files;
 *  nothing is ever overwritten. */
export function voiceAudioPath(dir: string, stamp: string, ext: string, n = 1): string {
  const name = n <= 1 ? `${stamp}.${ext}` : `${stamp} (${n}).${ext}`;
  return dir === "" ? name : `${dir}/${name}`;
}

/** The day's capture note — the phone's rule exactly. */
export function voiceInboxPath(date: string): string {
  return `${VOICE_INBOX}/${date}.md`;
}

/** Words, by whitespace. Arabic separates words with spaces as English does,
 *  and a transcript has no markup to be fooled by. */
export function wordCount(text: string): number {
  const t = text.trim();
  return t === "" ? 0 : t.split(/\s+/u).length;
}

export function isLongTranscript(text: string): boolean {
  return wordCount(text) > LONG_TRANSCRIPT_WORDS;
}

/** How many words of the transcript name its note. */
const TITLE_WORDS = 6;

/** `Inbox/Voice — <first words>.md`, the n-th candidate. The words go through
 *  the clipper's filename rule (the filesystem's refusals plus `[`, `]`, `#`,
 *  which would break a wikilink to the note), and the punctuation a sentence
 *  ends on is dropped so a title does not end in a comma. */
export function voiceNotePath(transcript: string, n = 1): string {
  const words = transcript.trim().split(/\s+/u).slice(0, TITLE_WORDS).join(" ");
  const cleaned = words.replace(/[.,;:!?،؛؟…"'«»()]+/gu, " ").replace(/\s+/g, " ").trim();
  const stem = clipFileName(`Voice — ${cleaned}`, "Voice").slice(0, -3);
  return `${VOICE_INBOX}/${n <= 1 ? stem : `${stem} (${n})`}.md`;
}

// ── What a transcript looks like once it is prose ──────────────────────────

/** whisper's own furniture, which is not something anybody said:
 *  `[BLANK_AUDIO]`, `[Music]`, `(applause)`, `[موسيقى]`. A bracketed run of up
 *  to four words on its own is a sound effect; a sentence in parentheses is
 *  left alone. */
const NON_SPEECH = /[[(](?:[^\])\s]+(?:\s+[^\])\s]+){0,3})[\])]/gu;

export function tidyTranscript(raw: string): string {
  return raw
    .replace(NON_SPEECH, " ")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

// ── The two shapes ────────────────────────────────────────────────────────

/** The glyph a recording is linked by. A picture of a microphone reads the
 *  same in both languages, which a word would not. */
export const RECORDING_MARK = "🎙";

/** `[[path#t=0|🎙]]` — a wikilink rather than a markdown link, because the
 *  path has spaces in it and a wikilink is what the index counts as a
 *  reference (so the recording is never swept up as an unused attachment).
 *  And a MOMENT link (shared/mediaEmbeds.ts, `#t=`), because a bare wikilink
 *  to a sound is a link the note resolver cannot answer and is drawn broken:
 *  a moment link is drawn as the live link it is, seeks a player for the
 *  recording when one is on the page, and otherwise opens the recording at
 *  its start. */
export function recordingLink(audioPath: string): string {
  return `[[${audioPath}#t=0|${RECORDING_MARK}]]`;
}

/** One bullet: `- 14:02 — the words [[…|🎙]]`, the share sheet's shape
 *  (`- HH:MM — text`). With no transcript it is the link alone; with no
 *  recording (the owner turned "keep the audio" off) it is the words alone. */
export function voiceBullet(time: string, transcript: string | null, audioPath: string | null): string {
  const parts: string[] = [];
  if (transcript) parts.push(transcript);
  if (audioPath) parts.push(recordingLink(audioPath));
  return `- ${time} — ${parts.join(" ")}\n`;
}

/** The share sheet's join: an existing note that ends mid-line gets its
 *  newline, one that ends in a newline does not get a second. */
export function appendBullet(existing: string, bullet: string): string {
  if (!existing) return bullet;
  return existing.endsWith("\n") ? existing + bullet : `${existing}\n${bullet}`;
}

/** The long shape's body: the recording embedded (the reading view draws a
 *  player for it), then the transcript. No H1 — the filename is the title,
 *  as it is for every note in this product. */
export function voiceNoteBody(transcript: string, audioPath: string | null): string {
  const head = audioPath ? `![[${audioPath}]]\n\n` : "";
  return `${head}${transcript}\n`;
}

export type VoicePlan =
  | { kind: "bullet"; path: string; bullet: string }
  | { kind: "note"; transcript: string; body: string };

/** Which of the two shapes a transcript takes, and its bytes. The note's PATH
 *  is not decided here, because choosing a free one needs the filesystem —
 *  the writer walks `voiceNotePath(transcript, n)` until one is free. */
export function planVoiceNote(input: { transcript: string | null; audioPath: string | null; date: string; time: string }): VoicePlan {
  const transcript = input.transcript ? tidyTranscript(input.transcript) : "";
  if (transcript !== "" && isLongTranscript(transcript)) {
    return { kind: "note", transcript, body: voiceNoteBody(transcript, input.audioPath) };
  }
  return {
    kind: "bullet",
    path: voiceInboxPath(input.date),
    bullet: voiceBullet(input.time, transcript === "" ? null : transcript, input.audioPath),
  };
}

// ── The job, as the client polls it ───────────────────────────────────────

export type VoiceJobStatus = "queued" | "transcribing" | "done" | "failed" | "kept";

/** `GET /api/voice/:id`. `kept` is the answer when no transcription will
 *  happen (the model is off) — the recording is in the vault and linked from
 *  the inbox, which is `notePath`. */
export interface VoiceJob {
  id: string;
  status: VoiceJobStatus;
  /** The recording's vault path, or null once it was discarded ("keep the
   *  audio" off, after a transcript landed). */
  audio: string | null;
  /** Jobs ahead of this one, while queued. */
  ahead?: number;
  transcript?: string;
  language?: string;
  /** Where the words landed. */
  notePath?: string;
  kind?: "bullet" | "note";
  /** A code the client words in its own language (`voiceFail*`). */
  error?: string;
}

/** `GET /api/voice/engine`: what the settings row and the sheet say about
 *  the machine behind them. */
export interface VoiceEngineState {
  model: VoiceModelSetting;
  /** Bytes of the chosen model on disk, and the total — equal once it is
   *  there; `downloaded < bytes` while it is on its way. */
  downloaded: number;
  bytes: number;
  /** `vulkan`, `cuda`, `cpu`, or null before the engine has loaded once. */
  backend: string | null;
  busy: boolean;
  queued: number;
}

// ── The stored setting (settings.json `voice`) ─────────────────────────────

/** Stored: each sub-key absent means its default. */
export interface VoiceSettings {
  model?: VoiceModelSetting;
  language?: VoiceLanguage;
  keepAudio?: boolean;
}

/** In force: every default filled in. */
export interface VoiceEffective {
  model: VoiceModelSetting;
  language: VoiceLanguage;
  keepAudio: boolean;
}

export function voiceEffective(stored: VoiceSettings | undefined): VoiceEffective {
  return {
    model: stored?.model ?? VOICE_MODEL_DEFAULT,
    language: stored?.language ?? "auto",
    keepAudio: stored?.keepAudio ?? true,
  };
}
