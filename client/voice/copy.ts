// THE RECORDER'S WORDS — which travel with the recorder.
//
// WHY NOT client/i18n.ts. The DICT is entry-chunk code: every string in it is
// downloaded by every reader on first paint, the anonymous one reading a
// single article included. The recorder's twenty-nine sentences in two
// languages measured ~3.4 kB of that, for a sheet most sessions never open —
// so they ride in the recorder's own lazy chunk, the way the tour's folios do
// (components/tourCards.ts, and the argument written out there). Only the
// DOORS stay in the DICT — the palette row, the phone's ⋯ row, the sheet's
// title and its switch — because those are painted before this module exists,
// and the Settings rows, which the settings index reads by key.
//
// Both halves are required and gated by `tests/voice.test.ts` (check-i18n
// walks only the DICT and would not notice an empty `ar`). Placeholders are
// `{name}`, bidi-isolated on the way in exactly as `tf()` isolates them.

import { getLang, isolate } from "../i18n.ts";

export interface VoiceText {
  en: string;
  ar: string;
}

export const VOICE_COPY = {
  voiceWhere: { en: "Into {name}", ar: "إلى {name}" },
  voiceRecord: { en: "Record", ar: "سجّل" },
  voiceStopSend: { en: "Stop and send", ar: "أوقف وأرسل" },
  voiceTapOrHold: { en: "Tap to record, or hold to talk and let go to send.", ar: "انقر للتسجيل، أو اضغط مطوّلًا وتكلّم ثم أفلت للإرسال." },
  voiceStarting: { en: "Opening the microphone…", ar: "يفتح الميكروفون…" },
  voiceListening: { en: "Listening", ar: "يستمع" },
  voiceElapsed: { en: "{time} recorded", ar: "سُجّل {time}" },
  voiceSending: { en: "Sending the recording…", ar: "يرسل التسجيل…" },
  voiceQueued: { en: "Waiting its turn — {n} ahead", ar: "ينتظر دوره — قبله {n}" },
  voiceFetchingModel: { en: "Fetching the speech model the first time — {pct}%", ar: "يجلب نموذج الكلام أول مرة — {pct}٪" },
  voiceTranscribing: { en: "Transcribing on the server…", ar: "يفرّغ التسجيل على الخادم…" },
  voiceLanded: { en: "In {name}.", ar: "في {name}." },
  voiceSilence: { en: "Nothing was heard; the recording is in {name}.", ar: "لم يُسمع شيء؛ التسجيل في {name}." },
  voiceFailedKept: { en: "Could not transcribe it; the recording is in {name}.", ar: "تعذّر تفريغه؛ التسجيل في {name}." },
  voiceKeptOff: { en: "Kept the recording in {name}; transcription is off in Settings.", ar: "حُفظ التسجيل في {name}؛ والتفريغ متوقف في الإعدادات." },
  voiceKeptPocket: { en: "Kept the recording in {name}; transcription needs an Astrolabe server.", ar: "حُفظ التسجيل في {name}؛ فالتفريغ يحتاج إلى خادم أسطرلاب." },
  voiceSend: { en: "Send", ar: "أرسل" },
  voiceDiscard: { en: "Discard", ar: "تجاهل" },
  voiceHide: { en: "Close", ar: "إغلاق" },
  voiceAnother: { en: "Record another", ar: "سجّل أخرى" },
  voiceSendFailed: { en: "Could not send the recording. Nothing was saved.", ar: "تعذّر إرسال التسجيل. لم يُحفظ شيء." },
  voiceInsecure: { en: "Recording needs this site on https (or localhost).", ar: "التسجيل يحتاج أن يُفتح الموقع عبر https (أو localhost)." },
  voiceUnsupported: { en: "This browser cannot record audio.", ar: "هذا المتصفح لا يستطيع تسجيل الصوت." },
  voiceMicDenied: { en: "The microphone was refused. Allow it for this site and try again.", ar: "رُفض الوصول إلى الميكروفون. اسمح به لهذا الموقع وحاول مجددًا." },
  voiceNoMic: { en: "No microphone was found.", ar: "لم يُعثر على ميكروفون." },
  voiceMicFailed: { en: "The microphone could not be opened.", ar: "تعذّر فتح الميكروفون." },
  voiceLandedToast: { en: "Voice note in {name}", ar: "الملاحظة الصوتية في {name}" },
  voiceKeptToast: { en: "Recording kept in {name}", ar: "حُفظ التسجيل في {name}" },
  voiceFailed: { en: "The voice note could not be written", ar: "تعذّرت كتابة الملاحظة الصوتية" },
} satisfies Record<string, VoiceText>;

export type VoiceCopyKey = keyof typeof VOICE_COPY;

/** `t()`/`tf()` for the recorder: the instance's language, English as the
 *  floor, every placeholder value isolated. */
export function vt(key: VoiceCopyKey, vars: Record<string, string | number> = {}): string {
  const entry: VoiceText = VOICE_COPY[key];
  let out = entry[getLang()] || entry.en;
  for (const [name, value] of Object.entries(vars)) out = out.replaceAll(`{${name}}`, isolate(value));
  return out;
}
