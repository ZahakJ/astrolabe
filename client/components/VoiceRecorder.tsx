// THE RECORDER — the quick-capture sheet's voice half (docs/capture.md "Voice").
//
// One round button does both ways people talk to a phone: TAP it and it
// records until tapped again (or Send), HOLD it and it records while held and
// sends on release. A level meter and the elapsed time say that it is
// listening; Cancel throws the recording away; Send stops and uploads. Then
// the sheet says what the server is doing — sending, waiting its turn,
// fetching the model on the very first note, transcribing — and shows the
// words when they land, with a door to the note.
//
// Lazy, and its own chunk: the text sheet is opened far more often than the
// microphone, and neither the recorder nor its stylesheet belongs in a first
// paint or in the text sheet's chunk.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { localeNum, t } from "../i18n.ts";
import { vt } from "../voice/copy.ts";
import { useStore } from "../state.ts";
import type { VoiceEngineState, VoiceJob } from "../../shared/voice.ts";
import { voiceInboxPath } from "../../shared/voice.ts";
import { followJob, landedName, sendRecording, type Follow } from "../voice/jobs.ts";
import { micSupport, MicError, Recorder, type MicProblem } from "../voice/recorder.ts";
import "../styles/voice.css";
import { localIsoDay } from "../../shared/dates.ts";

type Phase = "idle" | "starting" | "recording" | "sending" | "following" | "result" | "error";

/** A press longer than this is a HOLD: release sends. */
const HOLD_MS = 450;

const PROBLEM_KEY = {
  insecure: "voiceInsecure",
  unsupported: "voiceUnsupported",
  denied: "voiceMicDenied",
  nomic: "voiceNoMic",
  failed: "voiceMicFailed",
} as const satisfies Record<MicProblem, string>;

/** 83 → "1:23" in the instance's numerals, always left-to-right. */
function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${localeNum(Math.floor(whole / 60))}:${localeNum(whole % 60).padStart(2, localeNum(0))}`;
}

function today(): string {
  return localIsoDay();
}

export default function VoiceRecorder({ onClose }: { onClose: () => void }) {
  const openNote = useStore((s) => s.openNote);
  useStore((s) => s.language);
  // A page that cannot record at all (no MediaRecorder, or an http:// address
  // on a LAN, where the browser offers no microphone) says so from the start
  // and draws the button disabled, rather than a button that fails on press.
  const [unsupported] = useState(() => micSupport());
  const [phase, setPhase] = useState<Phase>(() => (unsupported ? "error" : "idle"));
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [job, setJob] = useState<VoiceJob | null>(null);
  const [engine, setEngine] = useState<VoiceEngineState | null>(null);
  const [problem, setProblem] = useState<string | null>(() => (unsupported ? vt(PROBLEM_KEY[unsupported]) : null));
  const recorder = useRef<Recorder | null>(null);
  const follow = useRef<Follow | null>(null);
  const pressAt = useRef(0);
  const pressStarted = useRef(false);
  const spokenAt = useRef(new Date());
  const micRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!unsupported) micRef.current?.focus();
    return () => {
      // Closing the sheet mid-sentence throws the sentence away (Cancel's
      // meaning); closing it while the server works keeps following, and the
      // landing becomes a toast.
      recorder.current?.cancel();
      follow.current?.detach();
    };
  }, []);

  // The meter and the clock: fifteen frames a second is smooth to an eye
  // and a quarter of the renders a rAF-per-frame state update would cost.
  useEffect(() => {
    if (phase !== "recording") return;
    let raf = 0;
    let last = 0;
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      if (now - last < 66) return;
      last = now;
      const r = recorder.current;
      if (!r) return;
      setLevel(r.level());
      setSeconds(r.seconds());
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const start = useCallback(async () => {
    if (phase !== "idle" && phase !== "result" && phase !== "error") return;
    setProblem(null);
    setJob(null);
    setPhase("starting");
    const r = new Recorder();
    recorder.current = r;
    try {
      await r.start();
    } catch (err) {
      recorder.current = null;
      setProblem(vt(PROBLEM_KEY[err instanceof MicError ? err.problem : "failed"]));
      setPhase("error");
      return;
    }
    spokenAt.current = new Date();
    setSeconds(0);
    setPhase("recording");
    // The time cap stops and sends, as a press of Send would. `send` reads
    // the recorder from its ref, so the closure it is called through is
    // never stale.
    r.onLimit = () => void sendRef.current();
  }, [phase]);

  const send = useCallback(async () => {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    setPhase("sending");
    setLevel(0);
    const rec = await r.stop();
    if (rec.blob.size === 0 || rec.seconds < 0.4) {
      // A tap that recorded nothing is not a note.
      setPhase("idle");
      return;
    }
    let first: VoiceJob;
    try {
      first = await sendRecording(rec, spokenAt.current);
    } catch (err) {
      console.error("astrolabe: voice note failed to send", err);
      setProblem(vt("voiceSendFailed"));
      setPhase("error");
      return;
    }
    setJob(first);
    setPhase(first.status === "queued" || first.status === "transcribing" ? "following" : "result");
    if (first.status === "queued" || first.status === "transcribing") {
      follow.current = followJob(first, (next, eng) => {
        setJob(next);
        setEngine(eng);
        if (next.status !== "queued" && next.status !== "transcribing") setPhase("result");
      });
    }
  }, []);

  const sendRef = useRef(send);
  sendRef.current = send;

  const cancel = useCallback(() => {
    if (recorder.current) {
      recorder.current.cancel();
      recorder.current = null;
      setLevel(0);
      setPhase("idle");
      micRef.current?.focus();
      return;
    }
    onClose();
  }, [onClose]);

  // ── The one button: tap or hold ─────────────────────────────────────────
  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pressAt.current = performance.now();
    pressStarted.current = phase !== "recording";
    if (pressStarted.current) void start();
  };
  const onPointerUp = (): void => {
    const held = performance.now() - pressAt.current;
    const live = recorder.current?.recording() === true;
    if (pressStarted.current) {
      // The press that STARTED the recording: held, it was talk-while-held
      // and release sends; tapped, the recording runs on. A release that
      // comes before the microphone has opened (the first-use permission
      // prompt sits between the press and the recording) is a tap.
      if (held >= HOLD_MS && live) void send();
    } else if (phase === "recording" && live) {
      void send();
    }
    pressStarted.current = false;
  };
  const onKey = (e: ReactKeyboardEvent<HTMLButtonElement>): void => {
    // Space and Enter are taps. Pointer presses are handled above, so the
    // synthetic click that follows them is ignored below.
    if (e.key !== " " && e.key !== "Enter") return;
    e.preventDefault();
    if (e.repeat) return;
    if (phase === "recording") void send();
    else void start();
  };

  const recording = phase === "recording";
  const busy = phase === "sending" || phase === "following" || phase === "starting";
  const inbox = landedName(voiceInboxPath(today()));

  let status = vt("voiceTapOrHold");
  if (phase === "starting") status = vt("voiceStarting");
  else if (recording) status = vt("voiceListening");
  else if (phase === "sending") status = vt("voiceSending");
  else if (phase === "following" && job) {
    if (engine && engine.bytes > 0 && engine.downloaded < engine.bytes && job.status === "transcribing") {
      status = vt("voiceFetchingModel", { pct: localeNum(Math.floor((engine.downloaded / engine.bytes) * 100)) });
    } else if (job.status === "queued" && (job.ahead ?? 0) > 0) {
      status = vt("voiceQueued", { n: localeNum(job.ahead ?? 0) });
    } else status = vt("voiceTranscribing");
  } else if (phase === "result" && job) {
    const where = job.notePath ? landedName(job.notePath) : inbox;
    if (job.status === "kept") status = vt(job.error === "pocket" ? "voiceKeptPocket" : "voiceKeptOff", { name: where });
    else if (job.status === "failed") status = vt("voiceFailedKept", { name: where });
    else if (job.error === "silence") status = vt("voiceSilence", { name: where });
    else status = vt("voiceLanded", { name: where });
  } else if (phase === "error" && problem) status = problem;

  return (
    <div className="s-voice" data-phase={phase}>
      <p className="s-voice__where" dir="auto">{vt("voiceWhere", { name: inbox })}</p>
      <div className="s-voice__stage">
        <button
          ref={micRef}
          type="button"
          className="s-voice__mic"
          aria-label={recording ? vt("voiceStopSend") : vt("voiceRecord")}
          aria-pressed={recording}
          disabled={busy || unsupported !== null}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKey}
          onClick={(e) => e.preventDefault()}
        >
          {recording ? (
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <path d="M12 18v3" />
            </svg>
          )}
        </button>
        <div className="s-voice__readout">
          <div className="s-voice__meter" aria-hidden="true">
            <span className="s-voice__level" style={{ transform: `scaleX(${recording ? Math.max(0.02, level) : 0})` }} />
          </div>
          <span className="s-voice__time" dir="ltr" aria-label={vt("voiceElapsed", { time: clock(seconds) })}>
            {clock(recording ? seconds : phase === "idle" || phase === "error" ? 0 : seconds)}
          </span>
        </div>
      </div>
      <p className={phase === "error" ? "s-voice__status s-voice__status--error" : "s-voice__status"} role={phase === "error" ? "alert" : "status"} aria-live="polite" dir="auto">
        {busy && <span className="s-voice__spinner" aria-hidden="true" />}
        {status}
      </p>
      {phase === "result" && job?.transcript && (
        <blockquote className="s-voice__transcript" dir="auto">{job.transcript}</blockquote>
      )}
      <div className="s-capture__actions s-voice__actions">
        {phase === "result" ? (
          <>
            <button type="button" className="s-capture__cancel" onClick={() => void start()}>
              {vt("voiceAnother")}
            </button>
            {job?.notePath && (
              <button
                type="button"
                className="s-capture__send"
                onClick={() => {
                  const path = job.notePath as string;
                  onClose();
                  openNote(path);
                }}
              >
                {t("captureOpenNote")}
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="s-capture__cancel" onClick={cancel}>
              {recording ? vt("voiceDiscard") : phase === "following" ? vt("voiceHide") : t("cancel")}
            </button>
            <button type="button" className="s-capture__send" onClick={() => void send()} disabled={!recording}>
              {vt("voiceSend")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
