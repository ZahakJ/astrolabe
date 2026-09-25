// THE FLOATING PLAYER — what is being read, and the four things a listener
// does to it: pause, replay, rate, stop (docs/read-aloud.md).
//
// Fixed to the viewport's foot, so it survives scrolling: a reader who
// selects a paragraph and scrolls on to follow it keeps the controls. It
// shows the sentence being spoken (lit in the page too, when it came from
// the page), where that sentence is in the passage, and — when the device's
// own voices are speaking instead of the instance's — the one line that says
// so. Mounted once per shell (App, the phone shell, the blog); nothing is
// drawn while nothing is playing.

import "../styles/speech.css";
import { t, tf, localeNum } from "../i18n.ts";
import { cycleRate, pause, replay, resume, stop, usePlayer } from "./player.ts";

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

const PLAY = "M8 5.5v13l11-6.5z";
const PAUSE = "M7 5h3.5v14H7zM13.5 5H17v14h-3.5z";
const REPLAY = "M12 5V2L7.5 6.5 12 11V7.5a5 5 0 1 1-5 5H4.5A7.5 7.5 0 1 0 12 5z";
const STOP = "M6.5 6.5h11v11h-11z";

export default function SpeechPlayer() {
  const s = usePlayer();
  if (s.status === "idle" || s.sentences.length === 0) return null;
  const playing = s.status === "playing" || s.status === "loading";
  const sentence = s.sentences[Math.min(s.index, s.sentences.length - 1)] ?? "";
  return (
    <div className="s-speak" role="region" aria-label={t("speakPlayer")} data-status={s.status} data-source={s.source ?? ""}>
      <div className="s-speak__controls">
        <button
          type="button"
          className="s-speak__btn s-speak__btn--main"
          aria-label={playing ? t("speakPause") : t("speakPlay")}
          title={playing ? t("speakPause") : t("speakPlay")}
          onClick={() => (playing ? pause() : resume())}
        >
          <Icon d={playing ? PAUSE : PLAY} />
        </button>
        <button type="button" className="s-speak__btn" aria-label={t("speakReplay")} title={t("speakReplay")} onClick={replay}>
          <Icon d={REPLAY} />
        </button>
        <button
          type="button"
          className="s-speak__btn s-speak__rate"
          aria-label={tf("speakRateNow", { rate: localeNum(s.rate) })}
          title={t("speakRate")}
          onClick={cycleRate}
        >
          <bdi dir="ltr">{localeNum(s.rate)}×</bdi>
        </button>
        <button type="button" className="s-speak__btn" aria-label={t("speakStop")} title={t("speakStop")} onClick={stop}>
          <Icon d={STOP} />
        </button>
      </div>
      <div className="s-speak__text">
        <p className="s-speak__sentence" dir="auto" lang={s.lang ?? undefined} aria-live="polite">
          {s.status === "loading" && <span className="s-speak__dot" aria-hidden="true" />}
          <mark>{sentence}</mark>
        </p>
        <p className="s-speak__meta">
          {s.sentences.length > 1 && (
            <span>{tf("speakPosition", { at: localeNum(s.index + 1), of: localeNum(s.sentences.length) })}</span>
          )}
          {s.note && <span className="s-speak__note">{t(s.note)}</span>}
        </p>
      </div>
    </div>
  );
}
