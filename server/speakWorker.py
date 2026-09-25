"""THE SPEAKER — a persistent Python child, spawned by server/speakEngine.ts.

Read aloud (docs/read-aloud.md) runs two engines, both on the CPU BY DESIGN:
the owner ruled the GPU out, and the design target is an ordinary laptop or a
small home server that has none. Both run on onnxruntime's CPU provider:

  light    Piper 1.8 (VITS). One ~63 MB model per voice. Arabic is pointed by
           the libtashkeel diacritiser the wheel carries before espeak-ng
           reads it.
  natural  Kokoro-82M through kokoro-onnx, full precision (the int8 build was
           four to six times SLOWER on this CPU in the trial, not faster).
           Japanese goes through misaki's G2P (fugashi + UniDic-lite).

WHY A CHILD, AND WHY A PERSISTENT ONE. Loading Kokoro and its G2P is most of a
second; synthesising a word after that is a quarter of one. A process per
request would pay the load every time, so the child stays up and the parent
ends it after a few idle minutes, which gives the memory back.

Protocol: one JSON object per line on stdin, one per line on stdout.
  parent → {"id", "engine", "lang", "voice", "speed", "text", "format"}
           {"id", "warm": engine}
  child  → {"id", "ok": true, "audio": <base64>, "mime", "ms"}
           {"id", "ok": false, "error", "code"}
The first line the child writes is {"ready": true, "opus": bool}.

Nothing but stdout carries the protocol: every library's chatter is sent to
stderr, which the parent keeps a tail of and prints only if the child dies.
"""

import base64
import io
import json
import os
import sys
import time
import types

MODELS = os.environ.get("ASTROLABE_TTS_MODELS", "")
THREADS = int(os.environ.get("ASTROLABE_TTS_THREADS", "0") or 0) or max(1, min(8, (os.cpu_count() or 2) // 2))

# The protocol's own handle; everything else that prints goes to stderr.
_out = sys.stdout
sys.stdout = sys.stderr

# misaki's Japanese module imports pyopenjtalk at the top for an optional
# second G2P that is never selected here (the default, "cutlet", is fugashi +
# UniDic). pyopenjtalk publishes no wheels — it needs a C++ toolchain — and
# the installer promises nothing but a venv. So an empty module stands in for
# it: if anything ever called it, the call would fail loudly, not quietly.
if "pyopenjtalk" not in sys.modules:
    try:
        import pyopenjtalk  # noqa: F401
    except Exception:
        sys.modules["pyopenjtalk"] = types.ModuleType("pyopenjtalk")

import numpy as np  # noqa: E402
import onnxruntime as ort  # noqa: E402
import soundfile as sf  # noqa: E402

OPUS = "OPUS" in sf.available_subtypes("OGG")


def send(obj):
    _out.write(json.dumps(obj) + "\n")
    _out.flush()


def session(path):
    so = ort.SessionOptions()
    so.intra_op_num_threads = THREADS
    so.inter_op_num_threads = 1
    return ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])


# ── Kokoro ──────────────────────────────────────────────────────────────────

_kokoro = None
_jag2p = None
KOKORO_LANG = {"en": "en-us", "fr": "fr-fr", "es": "es", "it": "it", "pt": "pt-br"}


def kokoro():
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro

        d = os.path.join(MODELS, "kokoro")
        _kokoro = Kokoro.from_session(session(os.path.join(d, "kokoro-v1.0.onnx")), os.path.join(d, "voices-v1.0.bin"))
    return _kokoro


def jag2p():
    global _jag2p
    if _jag2p is None:
        from misaki import ja

        _jag2p = ja.JAG2P()
    return _jag2p


def speak_kokoro(text, lang, voice, speed):
    k = kokoro()
    lang_code = "en-gb" if voice.startswith("b") and lang == "en" else KOKORO_LANG.get(lang)
    if lang == "ja":
        phonemes, _ = jag2p()(text)
        audio, sr = k.create(phonemes, voice=voice, speed=speed, is_phonemes=True)
    else:
        if lang_code is None:
            raise Failure(f"Kokoro has no {lang}", "speakNoVoice")
        audio, sr = k.create(text, voice=voice, speed=speed, lang=lang_code)
    return np.asarray(audio, dtype=np.float32), sr


# ── Piper ───────────────────────────────────────────────────────────────────

_piper = {}


def speak_piper(text, voice, speed):
    from pathlib import Path

    from piper import PiperVoice, SynthesisConfig
    from piper.config import PiperConfig

    v = _piper.get(voice)
    if v is None:
        path = os.path.join(MODELS, "piper", voice + ".onnx")
        if not os.path.exists(path):
            raise Failure(f"The voice {voice} is not installed", "speakNotInstalled")
        with open(path + ".json", encoding="utf-8") as f:
            config = PiperConfig.from_dict(json.load(f))
        # Built here rather than by PiperVoice.load, which makes its session
        # with onnxruntime's defaults (every core): the worker keeps one thread
        # count for both engines.
        v = PiperVoice(config=config, session=session(path), download_dir=Path(MODELS, "piper"))
        _piper[voice] = v
    cfg = SynthesisConfig(length_scale=1.0 / max(0.5, min(2.0, speed)))
    chunks = [c.audio_float_array for c in v.synthesize(text, syn_config=cfg)]
    audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
    return audio.astype(np.float32), v.config.sample_rate


# ── Encoding ────────────────────────────────────────────────────────────────


def resample(audio, rate, to):
    """Linear resampling: Piper's 22 050 Hz up to the 24 000 Hz Opus accepts.
    Speech has nothing up there for a linear filter to spoil."""
    if rate == to or len(audio) == 0:
        return audio
    n = int(round(len(audio) * to / rate))
    return np.interp(np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio).astype(np.float32)


def encode(audio, rate, fmt):
    # A breath of silence at each end: a browser starting playback clips the
    # first few milliseconds, and a word is short enough to lose a consonant.
    pad = np.zeros(int(rate * 0.06), dtype=np.float32)
    audio = np.concatenate([pad, np.clip(audio, -1, 1), pad])
    buf = io.BytesIO()
    if fmt == "opus" and OPUS:
        audio = resample(audio, rate, 24000)
        sf.write(buf, audio, 24000, format="OGG", subtype="OPUS")
        return buf.getvalue(), "audio/ogg"
    sf.write(buf, audio, rate, format="WAV", subtype="PCM_16")
    return buf.getvalue(), "audio/wav"


class Failure(Exception):
    def __init__(self, message, code):
        super().__init__(message)
        self.code = code


def handle(job):
    if "warm" in job:
        if job["warm"] == "natural":
            kokoro()
        return {"id": job["id"], "ok": True}
    t0 = time.perf_counter()
    engine, lang, voice = job["engine"], job["lang"], job["voice"]
    speed = float(job.get("speed") or 1.0)
    text = job["text"]
    if engine == "natural":
        audio, rate = speak_kokoro(text, lang, voice, speed)
    elif engine == "light":
        audio, rate = speak_piper(text, voice, speed)
    else:
        raise Failure(f"No engine {engine}", "speakNoVoice")
    data, mime = encode(audio, rate, job.get("format") or "opus")
    return {
        "id": job["id"],
        "ok": True,
        "audio": base64.b64encode(data).decode("ascii"),
        "mime": mime,
        "ms": round((time.perf_counter() - t0) * 1000),
        "seconds": round(len(audio) / rate, 3),
    }


def main():
    send({"ready": True, "opus": OPUS, "threads": THREADS})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            job = json.loads(line)
        except ValueError:
            continue
        try:
            send(handle(job))
        except Failure as e:
            send({"id": job.get("id"), "ok": False, "error": str(e), "code": e.code})
        except Exception as e:  # the job fails, the child lives on
            send({"id": job.get("id"), "ok": False, "error": f"{type(e).__name__}: {e}", "code": "engine"})


if __name__ == "__main__":
    main()
