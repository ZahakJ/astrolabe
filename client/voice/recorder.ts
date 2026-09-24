// THE MICROPHONE — MediaRecorder, and a level for the meter (docs/capture.md
// "Voice"). The sheet (components/VoiceRecorder.tsx) is the surface; this is
// the device.
//
// WHAT IS RECORDED is whatever the platform's MediaRecorder writes best of
// the two the server reads: WebM/Opus (Chromium, Electron, the Android
// WebView) or Ogg/Opus (Firefox). Opus at the browser's own rate is ~4 kB a
// second, so a minute is a quarter of a megabyte on the wire. The server
// sniffs the bytes; the type chosen here only has to be one it knows.
//
// THE LEVEL is an AnalyserNode's RMS over the last frame, eased: a meter that
// jumps with every sample reads as noise, and one that lags reads as broken.

import { VOICE_MAX_SECONDS } from "../../shared/voice.ts";
import { micSupport, type MicProblem } from "./micSupport.ts";

export { micSupport, type MicProblem };

export class MicError extends Error {
  readonly problem: MicProblem;
  constructor(problem: MicProblem, message: string = problem) {
    super(message);
    this.problem = problem;
  }
}

const TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"];

export interface Recording {
  blob: Blob;
  seconds: number;
}

export class Recorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private eased = 0;
  private startedAt = 0;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  /** Called when the recorder stops by itself (the time cap). */
  onLimit: (() => void) | null = null;

  async start(): Promise<void> {
    const problem = micSupport();
    if (problem) throw new MicError(problem);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") throw new MicError("denied");
      if (name === "NotFoundError" || name === "OverconstrainedError") throw new MicError("nomic");
      throw new MicError("failed", String((err as Error)?.message ?? err));
    }
    const mimeType = TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    // A timeslice, so a crash of the tab mid-sentence has still produced
    // most of the bytes rather than none of them.
    this.recorder.start(1000);
    this.startedAt = performance.now();
    try {
      this.context = new AudioContext();
      const source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      source.connect(this.analyser);
      this.buffer = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
    } catch {
      // No meter is not a reason to refuse to record.
      this.analyser = null;
    }
    this.stopTimer = setTimeout(() => this.onLimit?.(), VOICE_MAX_SECONDS * 1000);
  }

  /** 0…1, eased. Speech at a comfortable distance sits around the middle. */
  level(): number {
    if (!this.analyser || !this.buffer) return 0;
    this.analyser.getFloatTimeDomainData(this.buffer);
    let sum = 0;
    for (const v of this.buffer) sum += v * v;
    const rms = Math.sqrt(sum / this.buffer.length);
    // -50 dBFS → 0, -10 dBFS → 1: the band a voice actually occupies.
    const db = 20 * Math.log10(Math.max(rms, 1e-5));
    const target = Math.min(1, Math.max(0, (db + 50) / 40));
    this.eased += (target - this.eased) * (target > this.eased ? 0.5 : 0.15);
    return this.eased;
  }

  seconds(): number {
    return this.startedAt === 0 ? 0 : (performance.now() - this.startedAt) / 1000;
  }

  recording(): boolean {
    return this.recorder?.state === "recording";
  }

  /** Stop and hand back the recording. */
  stop(): Promise<Recording> {
    const recorder = this.recorder;
    const seconds = this.seconds();
    if (!recorder || recorder.state === "inactive") {
      this.release();
      return Promise.resolve({ blob: new Blob(this.chunks), seconds });
    }
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType || "audio/webm" });
        this.release();
        resolve({ blob, seconds });
      };
      recorder.stop();
    });
  }

  /** Throw it away: the microphone is released and nothing is kept. */
  cancel(): void {
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.chunks = [];
    this.release();
  }

  private release(): void {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    void this.context?.close().catch(() => {});
    this.context = null;
    this.analyser = null;
    this.startedAt = 0;
  }
}

/** A Blob → base64, the body `POST /api/voice` takes (client/api.ts says
 *  why). FileReader rather than a loop over bytes: it is native and it does
 *  not build a string one character at a time. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}
