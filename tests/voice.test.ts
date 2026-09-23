// Voice notes (3.24.0): the note-writing rule (short → a bullet in the day's
// inbox, long → a note of its own), the filename scheme for recordings and
// for long notes, the queue (one job at a time, FIFO, and the recording is
// never the thing that is lost), and the landing against a throwaway vault.
// The engine is FAKED throughout: what whisper hears is measured in
// CONTRACTS.md, and a test that ran a 574 MB model would not be a unit test.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  appendBullet,
  isLongTranscript,
  LONG_TRANSCRIPT_WORDS,
  planVoiceNote,
  sniffRecording,
  tidyTranscript,
  voiceAudioDir,
  voiceAudioPath,
  voiceBullet,
  voiceEffective,
  voiceInboxPath,
  voiceNotePath,
  voiceStamp,
  wordCount,
} from "../shared/voice.ts";
import { createVoiceQueue, type VoiceWork } from "../server/voiceQueue.ts";
import { resample, WHISPER_RATE } from "../server/voiceAudio.ts";
import { appendWithPrecondition, landVoiceNote } from "../server/voice.ts";
import { initIndexer, registerAttachment } from "../server/indexer.ts";
import { listUnusedAttachments } from "../server/unusedAttachments.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";
import { VOICE_COPY } from "../client/voice/copy.ts";

const words = (n: number, word = "word"): string => Array.from({ length: n }, (_, i) => `${word}${i}`).join(" ");

describe("the filename scheme", () => {
  it("stamps a recording by the device's day and minute, colon dropped", () => {
    assert.equal(voiceStamp("2026-09-23", "14:02"), "2026-09-23 1402");
    assert.equal(voiceStamp("2026-01-05", "00:00"), "2026-01-05 0000");
  });

  it("never reuses a name: the second recording in a minute is (2)", () => {
    assert.equal(voiceAudioPath("attachments/Voice", "2026-09-23 1402", "webm"), "attachments/Voice/2026-09-23 1402.webm");
    assert.equal(voiceAudioPath("attachments/Voice", "2026-09-23 1402", "webm", 2), "attachments/Voice/2026-09-23 1402 (2).webm");
    assert.equal(voiceAudioPath("Voice", "2026-09-23 1402", "ogg", 3), "Voice/2026-09-23 1402 (3).ogg");
  });

  it("follows the attachment-location setting, asked from the inbox", () => {
    assert.equal(voiceAudioDir({ mode: "specified", folder: "attachments" }), "attachments/Voice");
    assert.equal(voiceAudioDir({ mode: "specified", folder: "Attachments" }), "Attachments/Voice");
    assert.equal(voiceAudioDir({ mode: "vault-root", folder: "attachments" }), "Voice");
    assert.equal(voiceAudioDir({ mode: "same-folder", folder: "attachments" }), "Inbox/Voice");
    assert.equal(voiceAudioDir({ mode: "subfolder", folder: "assets" }), "Inbox/assets/Voice");
  });

  it("files a day's short notes in the phone's inbox note", () => {
    assert.equal(voiceInboxPath("2026-09-23"), "Inbox/2026-09-23.md");
  });

  it("names a long note by its first words, cleaned for a filename and a wikilink", () => {
    assert.equal(voiceNotePath("Remember: the map is an argument, always. And more words here"), "Inbox/Voice — Remember the map is an argument.md");
    assert.equal(voiceNotePath("ذهبت هذا الصباح إلى المكتبة، قبل أن تفتح أبوابها"), "Inbox/Voice — ذهبت هذا الصباح إلى المكتبة قبل.md");
    assert.equal(voiceNotePath("a/b [c] #d e? f"), "Inbox/Voice — a b c d e f.md");
    assert.equal(voiceNotePath("Same words again", 2), "Inbox/Voice — Same words again (2).md");
  });
});

describe("the note-writing rule", () => {
  it("counts words by whitespace in both scripts", () => {
    assert.equal(wordCount(""), 0);
    assert.equal(wordCount("  one two\nthree  "), 3);
    assert.equal(wordCount("ذهبت هذا الصباح"), 3);
    assert.equal(isLongTranscript(words(LONG_TRANSCRIPT_WORDS)), false);
    assert.equal(isLongTranscript(words(LONG_TRANSCRIPT_WORDS + 1)), true);
  });

  it("a short transcript is one bullet in Inbox/<day>.md with the recording linked", () => {
    const plan = planVoiceNote({ transcript: "Buy bread", audioPath: "attachments/Voice/2026-09-23 1402.webm", date: "2026-09-23", time: "14:02" });
    assert.deepEqual(plan, {
      kind: "bullet",
      path: "Inbox/2026-09-23.md",
      bullet: "- 14:02 — Buy bread [[attachments/Voice/2026-09-23 1402.webm#t=0|🎙]]\n",
    });
  });

  it("eighty words is still a bullet; eighty-one is a note", () => {
    const at = { audioPath: "Voice/x.webm", date: "2026-09-23", time: "09:00" };
    assert.equal(planVoiceNote({ transcript: words(80), ...at }).kind, "bullet");
    const long = planVoiceNote({ transcript: words(81), ...at });
    assert.equal(long.kind, "note");
    assert.ok(long.kind === "note");
    assert.equal(long.body, `![[Voice/x.webm]]\n\n${words(81)}\n`);
  });

  it("with no recording kept, the words stand alone; with no words, the link does", () => {
    assert.equal(voiceBullet("14:02", "Buy bread", null), "- 14:02 — Buy bread\n");
    assert.equal(voiceBullet("14:02", null, "Voice/a.webm"), "- 14:02 — [[Voice/a.webm#t=0|🎙]]\n");
    const plan = planVoiceNote({ transcript: words(90), audioPath: null, date: "2026-09-23", time: "09:00" });
    assert.ok(plan.kind === "note");
    assert.equal(plan.body, `${words(90)}\n`);
  });

  it("a transcript that is only whisper's furniture is no transcript", () => {
    assert.equal(tidyTranscript(" [BLANK_AUDIO] "), "");
    assert.equal(tidyTranscript("[Music] Hello  there (applause)\n"), "Hello there");
    assert.equal(tidyTranscript("[موسيقى] مرحبا"), "مرحبا");
    const plan = planVoiceNote({ transcript: "[BLANK_AUDIO]", audioPath: "Voice/a.webm", date: "2026-09-23", time: "08:15" });
    assert.ok(plan.kind === "bullet");
    assert.equal(plan.bullet, "- 08:15 — [[Voice/a.webm#t=0|🎙]]\n");
  });

  it("appends exactly one newline's worth — the share sheet's join", () => {
    assert.equal(appendBullet("", "- a\n"), "- a\n");
    assert.equal(appendBullet("- x\n", "- a\n"), "- x\n- a\n");
    assert.equal(appendBullet("- x", "- a\n"), "- x\n- a\n");
  });

  it("defaults: the Arabic-tested model, auto language, the audio kept", () => {
    assert.deepEqual(voiceEffective(undefined), { model: "large-v3-turbo-q5_0", language: "auto", keepAudio: true });
    assert.deepEqual(voiceEffective({ language: "ar", keepAudio: false }), { model: "large-v3-turbo-q5_0", language: "ar", keepAudio: false });
  });
});

describe("the recording", () => {
  it("is known by its bytes, never its name", () => {
    assert.equal(sniffRecording(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0])), "webm");
    assert.equal(sniffRecording(new TextEncoder().encode("OggS\0\0\0\0")), "ogg");
    assert.equal(sniffRecording(new TextEncoder().encode("RIFF\0\0\0\0WAVEfmt ")), "wav");
    assert.equal(sniffRecording(new TextEncoder().encode("\0\0\0 ftypM4A ")), null);
    assert.equal(sniffRecording(new Uint8Array([])), null);
  });

  it("resamples to 16 kHz without folding the top of the band down", () => {
    const rate = 48000;
    const n = rate; // one second
    const low = new Float32Array(n);
    const high = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      low[i] = Math.sin((2 * Math.PI * 440 * i) / rate);
      high[i] = Math.sin((2 * Math.PI * 12000 * i) / rate); // above the new Nyquist
    }
    const outLow = resample(low, rate);
    const outHigh = resample(high, rate);
    assert.equal(outLow.length, WHISPER_RATE);
    const rms = (a: Float32Array): number => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
    assert.ok(rms(outLow) > 0.6, `speech band kept (${rms(outLow)})`);
    assert.ok(rms(outHigh) < 0.05, `12 kHz filtered before decimation (${rms(outHigh)})`);
  });
});

describe("the queue", () => {
  const work = (audio: string, over: Partial<VoiceWork> = {}): VoiceWork => ({
    audio,
    date: "2026-09-23",
    time: "10:00",
    language: "auto",
    keepAudio: true,
    ...over,
  });

  it("runs one job at a time, first in first out", async () => {
    const log: string[] = [];
    let running = 0;
    let most = 0;
    const q = createVoiceQueue({
      async transcribe(w) {
        running++;
        most = Math.max(most, running);
        log.push(`start ${w.audio}`);
        await new Promise((r) => setTimeout(r, 5));
        log.push(`end ${w.audio}`);
        running--;
        return { text: `words of ${w.audio}`, language: "en" };
      },
      land: async (w, text) => ({ notePath: `Inbox/${w.date}.md`, kind: text ? "bullet" : "bullet" }),
      discard: async () => {},
    });
    const a = q.submit(work("a"));
    const b = q.submit(work("b"));
    const c = q.submit(work("c"));
    assert.equal(a.status, "transcribing", "the first job starts at once");
    assert.equal(b.ahead, 1);
    assert.equal(c.ahead, 2);
    assert.equal(q.get(c.id)?.status, "queued");
    await q.idle();
    assert.equal(most, 1, "two transcriptions overlapped");
    assert.deepEqual(log, ["start a", "end a", "start b", "end b", "start c", "end c"]);
    for (const job of [a, b, c]) {
      const done = q.get(job.id);
      assert.equal(done?.status, "done");
      assert.equal(done?.notePath, "Inbox/2026-09-23.md");
    }
    assert.equal(q.get(b.id)?.transcript, "words of b");
    assert.equal(q.busy(), false);
    assert.equal(q.waiting(), 0);
  });

  it("a failed transcription still lands the recording's link, and keeps it", async () => {
    const landed: [string | null, string | null][] = [];
    const discarded: string[] = [];
    const q = createVoiceQueue({
      transcribe: async () => {
        throw Object.assign(new Error("no GPU today"), { code: "download" });
      },
      land: async (_w, text, audio) => {
        landed.push([text, audio]);
        return { notePath: "Inbox/2026-09-23.md", kind: "bullet" };
      },
      discard: async (a) => void discarded.push(a),
    });
    const job = q.submit(work("Voice/a.webm", { keepAudio: false }));
    await q.idle();
    const out = q.get(job.id);
    assert.equal(out?.status, "failed");
    assert.equal(out?.error, "download");
    assert.equal(out?.audio, "Voice/a.webm");
    assert.deepEqual(landed, [[null, "Voice/a.webm"]]);
    assert.deepEqual(discarded, [], "a recording with no words was deleted");
  });

  it("'keep the audio' off deletes the recording only AFTER the words have landed", async () => {
    const order: string[] = [];
    const q = createVoiceQueue({
      transcribe: async () => ({ text: "Buy bread", language: "en" }),
      land: async (_w, text, audio) => {
        order.push(`land ${text} ${audio}`);
        return { notePath: "Inbox/2026-09-23.md", kind: "bullet" };
      },
      discard: async (a) => void order.push(`discard ${a}`),
    });
    const job = q.submit(work("Voice/a.webm", { keepAudio: false }));
    await q.idle();
    assert.deepEqual(order, ["land Buy bread null", "discard Voice/a.webm"]);
    assert.equal(q.get(job.id)?.audio, null);
    assert.equal(q.get(job.id)?.status, "done");
  });

  it("silence is done with nothing to say — and the recording is kept", async () => {
    const discarded: string[] = [];
    const q = createVoiceQueue({
      transcribe: async () => ({ text: "  ", language: null }),
      land: async () => ({ notePath: "Inbox/2026-09-23.md", kind: "bullet" }),
      discard: async (a) => void discarded.push(a),
    });
    const job = q.submit(work("Voice/quiet.webm", { keepAudio: false }));
    await q.idle();
    assert.equal(q.get(job.id)?.status, "done");
    assert.equal(q.get(job.id)?.error, "silence");
    assert.deepEqual(discarded, []);
  });

  it("a note that cannot be written fails the job without throwing out of the queue", async () => {
    const q = createVoiceQueue({
      transcribe: async () => ({ text: "x", language: "en" }),
      land: async () => {
        throw new Error("disk full");
      },
      discard: async () => {},
    });
    const a = q.submit(work("a"));
    const b = q.submit(work("b"));
    await q.idle();
    assert.equal(q.get(a.id)?.status, "failed");
    assert.equal(q.get(a.id)?.error, "write");
    assert.equal(q.get(b.id)?.status, "failed", "the second job still ran");
  });
});

describe("landing in a vault", () => {
  const data = makeDir();
  const root = makeVault({
    "Inbox/2026-09-22.md": "- 08:00 — Shared from the phone\n",
  });

  before(async () => {
    initSite({ ASTROLABE_DATA: data });
    initVault(root);
    await initIndexer();
  });

  after(() => {
    removeVault(root);
    removeVault(data);
  });

  const at = (date: string, time: string): VoiceWork => ({ audio: "attachments/Voice/x.webm", date, time, language: "auto", keepAudio: true });

  it("a short one joins the day's inbox note after what the phone put there", async () => {
    const out = await landVoiceNote(at("2026-09-22", "09:30"), "Call the dentist", "attachments/Voice/2026-09-22 0930.webm");
    assert.deepEqual(out, { notePath: "Inbox/2026-09-22.md", kind: "bullet" });
    assert.equal(
      readFileSync(path.join(root, "Inbox/2026-09-22.md"), "utf8"),
      "- 08:00 — Shared from the phone\n- 09:30 — Call the dentist [[attachments/Voice/2026-09-22 0930.webm#t=0|🎙]]\n",
    );
  });

  it("a linked recording is a REFERENCED attachment, never swept as unused", async () => {
    const rel = "attachments/Voice/2026-09-25 0800.webm";
    mkdirSync(path.join(root, "attachments/Voice"), { recursive: true });
    writeFileSync(path.join(root, rel), Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    registerAttachment(rel);
    const before = await listUnusedAttachments();
    assert.ok(before.files.some((f) => f.path === rel), "the bare recording should read as unused before it is linked");
    await landVoiceNote(at("2026-09-25", "08:00"), "Short thought", rel);
    const afterLink = await listUnusedAttachments();
    assert.ok(!afterLink.files.some((f) => f.path === rel), "the moment link does not count as a reference");
  });

  it("the day's first makes the note", async () => {
    const out = await landVoiceNote(at("2026-09-23", "07:05"), "First thing", null);
    assert.equal(out.notePath, "Inbox/2026-09-23.md");
    assert.equal(readFileSync(path.join(root, "Inbox/2026-09-23.md"), "utf8"), "- 07:05 — First thing\n");
  });

  it("a long one is its own note, and a second with the same words does not overwrite it", async () => {
    const text = `Essay notes ${words(85)}`;
    const one = await landVoiceNote(at("2026-09-23", "10:00"), text, "attachments/Voice/2026-09-23 1000.webm");
    assert.equal(one.kind, "note");
    assert.equal(one.notePath, "Inbox/Voice — Essay notes word0 word1 word2 word3.md");
    assert.equal(readFileSync(path.join(root, one.notePath), "utf8"), `![[attachments/Voice/2026-09-23 1000.webm]]\n\n${text}\n`);
    const two = await landVoiceNote(at("2026-09-23", "10:05"), text, null);
    assert.equal(two.notePath, "Inbox/Voice — Essay notes word0 word1 word2 word3 (2).md");
  });

  it("appends after what another writer put there since the index last read it", async () => {
    // Written behind the server's back, as the laptop's editor or the phone's
    // share sheet would: the append reads the file as it is NOW and carries
    // that read's mtime as its precondition, so the other writer's line
    // survives rather than being written over from a stale copy.
    const rel = "Inbox/2026-09-24.md";
    writeFileSync(path.join(root, rel), "- 06:00 — one\n");
    await appendWithPrecondition(rel, "- 06:01 — two\n");
    assert.equal(readFileSync(path.join(root, rel), "utf8"), "- 06:00 — one\n- 06:01 — two\n");
  });
});

describe("the recorder's own copy (client/voice/copy.ts)", () => {
  // check-i18n walks only the DICT; the recorder's sentences travel in its
  // lazy chunk, so the parity the gate would have checked is checked here.
  for (const [key, text] of Object.entries(VOICE_COPY)) {
    it(`${key} has both halves, the same placeholders, and Arabic in the Arabic`, () => {
      assert.ok(text.en.trim().length > 0, "empty en");
      assert.ok(text.ar.trim().length > 0, "empty ar");
      assert.match(text.ar, /[\u0600-\u06ff]/, "the ar half has no Arabic in it");
      const holes = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      assert.deepEqual(holes(text.ar), holes(text.en));
    });
  }
});
