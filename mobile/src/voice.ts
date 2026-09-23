import { el } from "./dom.ts";
import { t } from "./i18n.ts";
import { HttpError, pollVoice, sendVoice, type VoiceReply } from "./server.ts";
import { blobToBase64, micSupport, Recorder, MicError, type MicProblem } from "../../client/voice/recorder.ts";

/**
 * THE SHARE SHEET'S VOICE NOTE (3.24.0, docs/capture.md "Voice").
 *
 * The same gesture as the web client's recorder (client/components/
 * VoiceRecorder.tsx) and the same microphone code — `Recorder` is imported
 * from client/voice/recorder.ts rather than written twice, because it is
 * plain DOM with no React and no store in it — drawn with this shell's own
 * three-line DOM helper. TAP the round button to record until tapped again;
 * HOLD it to talk and let go to send.
 *
 * The recording goes to the owner's server as base64 inside JSON, through
 * CapacitorHttp like every other call this sheet makes: the page is on
 * https://localhost, the server ships no CORS, and the native bridge moves a
 * string, not a Blob. The server stores it, queues it, and answers with a job
 * this sheet polls until the words land.
 *
 * THE MICROPHONE PERMISSION. `RECORD_AUDIO` is declared in the manifest, and
 * Capacitor's WebChromeClient turns the page's getUserMedia into the
 * platform's runtime prompt the first time. A refusal is a sentence here, not
 * a dead button.
 */

const HOLD_MS = 450;

const PROBLEM: Record<MicProblem, string> = {
  insecure: t.voiceUnsupported,
  unsupported: t.voiceUnsupported,
  denied: t.voiceDenied,
  nomic: t.voiceNoMic,
  failed: t.voiceMicFailed,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function mountVoice(base: string, host: string, onDone: () => void): HTMLElement {
  const status = el("p", { class: "voice-status" });
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const level = el("span", { class: "voice-level" });
  const meter = el("div", { class: "voice-meter" }, level);
  meter.setAttribute("aria-hidden", "true");
  const time = el("span", { class: "voice-time", textContent: "0:00" });
  time.setAttribute("dir", "ltr");
  const mic = el("button", { class: "voice-mic", type: "button" });
  mic.setAttribute("aria-label", t.voiceRecord);
  mic.setAttribute("aria-pressed", "false");
  mic.innerHTML =
    '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>';
  const send = el("button", { class: "btn-primary", type: "button", textContent: t.voiceSend, disabled: true });
  const discard = el("button", { class: "btn-quiet", type: "button", textContent: t.voiceDiscard, hidden: true });
  const transcript = el("blockquote", { class: "voice-transcript", hidden: true });
  transcript.setAttribute("dir", "auto");
  const section = el(
    "section",
    { class: "voice" },
    el("h2", { class: "voice-title", textContent: t.voiceTitle }),
    el("div", { class: "voice-stage" }, mic, el("div", { class: "voice-readout" }, meter, time)),
    status,
    transcript,
    el("div", { class: "capture-actions" }, send, discard),
  );

  let recorder: Recorder | null = null;
  let raf = 0;
  let pressAt = 0;
  let pressStarted = false;
  let spokenAt = new Date();
  const say = (text: string, error = false): void => {
    status.textContent = text;
    status.className = error ? "voice-status message" : "voice-status";
  };
  say(micSupport() ? PROBLEM[micSupport() as MicProblem] : t.voiceTapOrHold, micSupport() !== null);
  if (micSupport()) mic.disabled = true;

  const draw = (): void => {
    raf = requestAnimationFrame(draw);
    if (!recorder) return;
    level.style.transform = `scaleX(${Math.max(0.02, recorder.level())})`;
    const s = Math.floor(recorder.seconds());
    time.textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`;
  };

  const setRecording = (on: boolean): void => {
    mic.setAttribute("aria-pressed", String(on));
    mic.setAttribute("aria-label", on ? t.voiceStopSend : t.voiceRecord);
    send.disabled = !on;
    discard.hidden = !on;
    if (!on) {
      cancelAnimationFrame(raf);
      level.style.transform = "scaleX(0)";
    }
  };

  async function start(): Promise<void> {
    if (recorder) return;
    transcript.hidden = true;
    say(t.voiceStarting);
    const r = new Recorder();
    recorder = r;
    try {
      await r.start();
    } catch (err) {
      recorder = null;
      say(PROBLEM[err instanceof MicError ? err.problem : "failed"], true);
      return;
    }
    spokenAt = new Date();
    r.onLimit = () => void stopAndSend();
    say(t.voiceListening);
    setRecording(true);
    draw();
  }

  async function stopAndSend(): Promise<void> {
    const r = recorder;
    if (!r) return;
    recorder = null;
    setRecording(false);
    mic.disabled = true;
    say(t.voiceSending);
    const rec = await r.stop();
    if (rec.blob.size === 0 || rec.seconds < 0.4) {
      mic.disabled = false;
      say(t.voiceTapOrHold);
      return;
    }
    const date = `${spokenAt.getFullYear()}-${pad(spokenAt.getMonth() + 1)}-${pad(spokenAt.getDate())}`;
    const hm = `${pad(spokenAt.getHours())}:${pad(spokenAt.getMinutes())}`;
    let job: VoiceReply;
    try {
      job = await sendVoice(base, await blobToBase64(rec.blob), date, hm);
    } catch (err) {
      mic.disabled = false;
      const code = err instanceof HttpError ? err.status : 0;
      say(code === 401 || code === 403 ? t.captureUnauthorized(host) : code === 0 ? t.errUnreachable(host) : t.voiceSendFailed, true);
      return;
    }
    say(t.voiceTranscribing(host));
    for (let i = 0; i < 600 && (job.status === "queued" || job.status === "transcribing"); i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        job = await pollVoice(base, job.id);
      } catch {
        // A hiccup on the phone's network is not the job failing; the server
        // finishes it either way, and the next poll may get through.
      }
    }
    mic.disabled = false;
    const where = job.notePath ?? "";
    if (job.transcript) {
      transcript.textContent = job.transcript;
      transcript.hidden = false;
    }
    if (job.status === "done" && !job.error) say(t.voiceLanded(where));
    else if (job.status === "queued" || job.status === "transcribing") say(t.voiceStillWorking(host));
    else say(t.voiceKept(where));
    send.textContent = t.voiceDone;
    send.disabled = false;
    send.onclick = onDone;
  }

  send.onclick = () => void stopAndSend();
  discard.onclick = () => {
    recorder?.cancel();
    recorder = null;
    setRecording(false);
    say(t.voiceTapOrHold);
  };
  mic.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || mic.disabled) return;
    mic.setPointerCapture(e.pointerId);
    pressAt = performance.now();
    pressStarted = recorder === null;
    if (pressStarted) void start();
  });
  const release = (): void => {
    const live = recorder?.recording() === true;
    if (pressStarted) {
      if (performance.now() - pressAt >= HOLD_MS && live) void stopAndSend();
    } else if (live) {
      void stopAndSend();
    }
    pressStarted = false;
  };
  mic.addEventListener("pointerup", release);
  mic.addEventListener("pointercancel", release);
  mic.addEventListener("keydown", (e) => {
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (e.repeat) return;
    if (recorder?.recording()) void stopAndSend();
    else void start();
  });
  return section;
}
