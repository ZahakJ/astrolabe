// A RECORDING → the 16 kHz mono samples whisper reads.
//
// What arrives is whatever the recording device's MediaRecorder writes:
// WebM/Opus from Chromium, Electron and the Android WebView, Ogg/Opus from
// Firefox. Both are decoded by libopus compiled to WASM (@audio/decode-webm,
// @audio/decode-opus) — no ffmpeg on the PATH, no native build — and WAV is
// read here, because a WAV is a header and an array. Anything else is refused
// with a code before it reaches the queue (`voiceFailFormat`): Safari's MP4/AAC
// is the one a reader could plausibly send, and it is named in the manual.
//
// Runs in the transcriber's child process (server/voiceWorker.ts), so the
// server's own heap never holds a decoded half-hour.

import { sniffRecording } from "../shared/voice.ts";

export const WHISPER_RATE = 16000;

class FormatError extends Error {
  code = "format";
}

/** PCM WAV (16-bit integer or 32-bit float), any rate, any channel count. */
function decodeWav(buf: Uint8Array): { channelData: Float32Array[]; sampleRate: number } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 12;
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  while (offset + 8 <= buf.length) {
    const id = String.fromCharCode(...buf.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === "data") {
      if (channels === 0) break;
      const frame = channels * (bits / 8);
      const frames = Math.floor(Math.min(size, buf.length - body) / frame);
      const out = Array.from({ length: channels }, () => new Float32Array(frames));
      for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) {
          const at = body + i * frame + c * (bits / 8);
          if (format === 3 && bits === 32) out[c][i] = view.getFloat32(at, true);
          else if (format === 1 && bits === 16) out[c][i] = view.getInt16(at, true) / 32768;
          else throw new FormatError(`WAV format ${format}/${bits} is not read`);
        }
      }
      return { channelData: out, sampleRate };
    }
    offset = body + size + (size % 2);
  }
  throw new FormatError("WAV with no data");
}

/** Mix to mono. A phone records one channel; a desk microphone may record
 *  two, and speech is the same in both. */
function mono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i] / channels.length;
  return out;
}

/** To 16 kHz. Downsampling without a low-pass folds everything above 8 kHz
 *  back into the band speech lives in, so the input is filtered first — a
 *  Hann-windowed sinc, cut a little under the new Nyquist — and then read at
 *  the new rate with linear interpolation between filtered samples. */
export function resample(input: Float32Array, rate: number): Float32Array {
  if (rate === WHISPER_RATE) return input;
  // The filter is evaluated only at the input positions the output reads —
  // two per output sample — rather than over the whole input: a minute at
  // 48 kHz is a third of the work, which is most of a warm job's time.
  let taps: Float32Array | null = null;
  const half = 16;
  if (rate > WHISPER_RATE) {
    const cutoff = (0.9 * WHISPER_RATE) / 2 / rate; // cycles per input sample
    taps = new Float32Array(half * 2 + 1);
    let sum = 0;
    for (let k = -half; k <= half; k++) {
      const x = 2 * Math.PI * cutoff * k;
      const sinc = k === 0 ? 1 : Math.sin(x) / x;
      const hann = 0.5 + 0.5 * Math.cos((Math.PI * k) / (half + 1));
      taps[k + half] = sinc * hann;
      sum += taps[k + half];
    }
    for (let k = 0; k < taps.length; k++) taps[k] /= sum;
  }
  const at = (i: number): number => {
    const j = Math.min(i, input.length - 1);
    if (taps === null) return input[j];
    let acc = 0;
    const lo = Math.max(0, j - half);
    const hi = Math.min(input.length - 1, j + half);
    for (let m = lo; m <= hi; m++) acc += input[m] * taps[m - j + half];
    return acc;
  };
  const ratio = rate / WHISPER_RATE;
  const n = Math.floor(input.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const f = x - i0;
    const a = at(i0);
    out[i] = f === 0 ? a : a + (at(i0 + 1) - a) * f;
  }
  return out;
}

export async function decodeRecording(buf: Uint8Array, hint = ""): Promise<Float32Array> {
  const format = sniffRecording(buf) ?? (hint === "wav" ? "wav" : null);
  if (format === null) throw new FormatError("Not a recording this server reads (WebM, Ogg or WAV)");
  let decoded: { channelData: Float32Array[]; sampleRate: number };
  if (format === "wav") decoded = decodeWav(buf);
  else if (format === "webm") {
    const { default: decode } = await import("@audio/decode-webm");
    decoded = await decode(buf);
  } else {
    const { default: decode } = await import("@audio/decode-opus");
    decoded = await decode(buf);
  }
  if (!decoded.channelData.length) throw new FormatError("The recording has no audio track");
  return resample(mono(decoded.channelData), decoded.sampleRate);
}

/** Signed 16-bit, what the addon's `transcribeData` takes. */
export function toPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out[i] = Math.round(v * 32767);
  }
  return out;
}

// ── Windows ─────────────────────────────────────────────────────────────────
//
// whisper reads thirty seconds at a time. The ONNX engine (server/voiceWorker.ts,
// the processor's path) hears the first thirty seconds and drops the rest;
// whisper.cpp walks a long recording on its own but detects its language once,
// from the start, and hears the rest as that language. So a recording is cut
// into windows here, each at most WINDOW_MAX long, and each cut is made at the
// quietest tenth of a second in the window's last stretch — between words,
// where a cut loses nothing. Both engines hear each window on its own, which
// is why a note that changes language halfway comes back in both: every
// window detects its own. A window that straddles the change is still heard
// in one language (its first); cutting at the LONGEST pause instead, on the
// theory that a speaker changes language at a sentence, measured worse on
// the test notes (34% of the words wrong against 12%), because a pause
// between sentences is as long as a pause between languages.

/** A window's longest: under whisper's thirty, so the model's own padding
 *  never clips the last word. */
export const WINDOW_MAX = 28 * WHISPER_RATE;
/** Where the search for a quiet cut begins inside a full window. */
const WINDOW_SEARCH_FROM = 18 * WHISPER_RATE;
/** The unit a cut is chosen in: a tenth of a second. */
const FRAME = WHISPER_RATE / 10;
/** A window quieter than this (RMS) is silence, and is not sent to a model
 *  that answers silence with "Thank you." */
const SILENCE_RMS = 0.003;

function rms(samples: Float32Array, from: number, to: number): number {
  let acc = 0;
  for (let i = from; i < to; i++) acc += samples[i] * samples[i];
  return to > from ? Math.sqrt(acc / (to - from)) : 0;
}

/** The recording as `[start, end)` sample ranges, in order, covering all of
 *  it except the windows that are silence. */
export function speechWindows(samples: Float32Array): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = 0;
  while (start < samples.length) {
    let end = samples.length;
    if (end - start > WINDOW_MAX) {
      // The quietest frame in [start + 18 s, start + 28 s), cut at its middle.
      let best = start + WINDOW_MAX;
      let bestRms = Infinity;
      for (let f = start + WINDOW_SEARCH_FROM; f + FRAME <= start + WINDOW_MAX; f += FRAME) {
        const r = rms(samples, f, f + FRAME);
        if (r < bestRms) {
          bestRms = r;
          best = f + FRAME / 2;
        }
      }
      end = best;
    }
    if (rms(samples, start, end) >= SILENCE_RMS) out.push([start, end]);
    start = end;
  }
  return out;
}
