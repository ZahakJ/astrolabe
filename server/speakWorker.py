"""THE SPEAKER — a persistent Python child, spawned by server/speakEngine.ts.

Read aloud (docs/read-aloud.md) runs two engines, both on the CPU BY DESIGN:
the owner ruled the GPU out, and the design target is an ordinary laptop or a
small home server that has none. Both run on onnxruntime's CPU provider:

  light    Piper 1.8 (VITS). One ~63 MB model per voice. Arabic is pointed by
           the libtashkeel diacritiser the wheel carries before espeak-ng
           reads it.
  natural  Kokoro-82M through kokoro-onnx, full precision (the int8 build was
           four to six times SLOWER on this CPU in the trial, not faster).
           Japanese goes through misaki's G2P (fugashi + UniDic-lite); every
           other language through espeak-ng, which the espeakng-loader wheel
           carries (its library and its data), as Piper's wheel carries its
           own.

KOKORO'S ESPEAK-NG DATA, BY A SHORT PATH. The espeak-ng in the
espeakng-loader wheel keeps its data path in a 160-byte buffer: a path that
does not fit — the venv deep under a data folder with a long vault name — is
cut, espeak then looks in the directory it was COMPILED in (a CI runner's),
and calls exit(1). Not an exception: the whole speaker goes, and with it
every language that passes through espeak — all but Japanese, which misaki
reads. On Windows the path also reaches espeak's ANSI file calls, where a
user or vault name in Arabic is another path. So when the wheel's own path is
long or not plain ASCII, its data (18 MB) is copied once to a short folder —
the temp folder, or on Windows ProgramData — and Kokoro is handed that
(`kokoro_espeak_data`). Piper's own espeak has no such limit (measured to
258 characters) and keeps its wheel's data.

THE SELF-TEST (`--selftest <json>`, server/speakSelfTest.ts): a separate,
short-lived run that speaks one word per language through the same code and
prints, per language, the phonemes the engine made and the phonemes the
ENGLISH rules make of the same word. The server judges them: phonemes equal
to the English ones are the English fallback, not the language — and a run
that died partway (espeak's exit) fails every language it had not reached.
Being its own process, the test can die without taking the speaker with it.

WHY A CHILD, AND WHY A PERSISTENT ONE. Loading Kokoro and its G2P is most of a
second; synthesising a word after that is a quarter of one. A process per
request would pay the load every time, so the child stays up and the parent
ends it after a few idle minutes, which gives the memory back.

Protocol: one JSON object per line on stdin, one per line on stdout.
  parent → {"id", "engine", "lang", "voice", "speed", "text", "format"}
             + for one of the reader's own voices (the voices folder):
               "model" (an absolute path), "config" (Piper's .onnx.json),
               "speaker" (a multi-speaker model's number), "pack" (Kokoro's
               voices-*.bin) — loaded by path, cached by path + mtime
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


# ── espeak-ng's data, for Kokoro ────────────────────────────────────────────

# The longest data path Kokoro's espeak-ng is handed. Its library keeps the
# path in a 160-byte buffer (measured: a 159-character path is read, a
# 160-character one is not) and resolves a relative path against the working
# directory first, so only a short ABSOLUTE path will do. A margin under the
# limit; ASCII only, for Windows' ANSI file calls.
ESPEAK_PATH_MAX = 150

# The path chosen, once: None until asked, "" when none could be had.
_kokoro_espeak = None


def _fits(p):
    try:
        return len(p.encode("ascii")) <= ESPEAK_PATH_MAX
    except UnicodeEncodeError:
        return False


def _short_bases():
    """Folders a copy of the data may live in, shortest first by habit: the
    temp folder (/tmp on Linux), then on Windows the machine-wide ProgramData
    and Public folders, which carry no user name."""
    import tempfile

    bases = [tempfile.gettempdir()]
    if os.name == "nt":
        bases += [os.environ.get("ProgramData") or "", os.environ.get("PUBLIC") or ""]
    else:
        bases += ["/tmp", "/var/tmp"]
    seen = []
    for b in bases:
        if b and b not in seen:
            seen.append(b)
    return seen


def _copy_data(src, dst):
    """Copy espeak-ng's data to `dst` once: into a scratch name, renamed into
    place, so a half-made copy is never taken for a whole one."""
    import shutil

    if os.path.isfile(os.path.join(dst, "phontab")):
        return True
    part = f"{dst}.part-{os.getpid()}"
    try:
        shutil.copytree(src, part)
        os.replace(part, dst)
    except OSError:
        shutil.rmtree(part, ignore_errors=True)
    return os.path.isfile(os.path.join(dst, "phontab"))


def kokoro_espeak_data():
    """The data path Kokoro's espeak-ng is given: the wheel's own when it is
    short and plain, else a copy under a short folder (see the header). None
    when neither could be had — Kokoro then tries the library's default, the
    self-test finds out, and the server hands the language to Light."""
    global _kokoro_espeak
    if _kokoro_espeak is not None:
        return _kokoro_espeak or None
    _kokoro_espeak = ""
    try:
        import espeakng_loader

        src = os.path.abspath(espeakng_loader.get_data_path())
    except Exception:
        return None
    if _fits(src):
        _kokoro_espeak = src
        return src
    try:
        from importlib.metadata import version

        tag = version("espeakng-loader")
    except Exception:
        tag = "x"
    owner = f"-{os.getuid()}" if hasattr(os, "getuid") else ""
    for base in _short_bases():
        dst = os.path.join(os.path.abspath(base), f"astrolabe-espeak-{tag}{owner}")
        if _fits(dst) and _copy_data(src, dst):
            _kokoro_espeak = dst
            return dst
    return None


def send(obj):
    _out.write(json.dumps(obj) + "\n")
    _out.flush()


def session(path):
    so = ort.SessionOptions()
    so.intra_op_num_threads = THREADS
    so.inter_op_num_threads = 1
    return ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])


# ── Kokoro ──────────────────────────────────────────────────────────────────

# Loaded Kokoro models, keyed like Piper's: (model, its mtime, pack, its mtime).
_kokoro = {}
_jag2p = None
KOKORO_LANG = {"en": "en-us", "fr": "fr-fr", "es": "es", "it": "it", "pt": "pt-br"}


def kokoro(model=None, pack=None):
    """The built-in Kokoro under MODELS/kokoro, or a pack of the reader's own
    (a `voices-*.bin` beside a `kokoro-*.onnx`) by absolute path."""
    if not model:
        d = os.path.join(MODELS, "kokoro")
        model, pack = os.path.join(d, "kokoro-v1.0.onnx"), os.path.join(d, "voices-v1.0.bin")
    try:
        key = (model, os.stat(model).st_mtime_ns, pack, os.stat(pack).st_mtime_ns)
    except OSError:
        raise Failure("The Kokoro model is not there", "speakNotInstalled")
    k = _kokoro.get(key)
    if k is None:
        from kokoro_onnx import Kokoro
        from kokoro_onnx.config import EspeakConfig

        for old in [o for o in _kokoro if o[0] == model and o[2] == pack]:
            del _kokoro[old]
        data = kokoro_espeak_data()
        k = Kokoro.from_session(session(model), pack, espeak_config=EspeakConfig(data_path=data) if data else None)
        _kokoro[key] = k
    return k


def jag2p():
    global _jag2p
    if _jag2p is None:
        from misaki import ja

        _jag2p = ja.JAG2P()
    return _jag2p


def speak_kokoro(text, lang, voice, speed, model=None, pack=None):
    k = kokoro(model, pack)
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

# Loaded voices, keyed by (model path, its mtime): a voice file replaced
# under the same name is a different key, so it is loaded afresh rather than
# answered from the voice that was there before.
_piper = {}


def load_piper(path, config_path):
    from pathlib import Path

    from piper import PiperVoice
    from piper.config import PiperConfig

    with open(config_path, encoding="utf-8") as f:
        config = PiperConfig.from_dict(json.load(f))
    # Built here rather than by PiperVoice.load, which makes its session
    # with onnxruntime's defaults (every core): the worker keeps one thread
    # count for both engines.
    return PiperVoice(config=config, session=session(path), download_dir=Path(os.path.dirname(path)))


def piper_voice(job):
    """The Piper voice a job names: a built-in one BY NAME under MODELS/piper,
    or one of the reader's own (the voices folder, server/speakVoices.ts) BY
    ABSOLUTE PATH — `model`, with its `config` beside it."""
    model = job.get("model")
    if model:
        path = model
        config_path = job.get("config") or path + ".json"
    else:
        path = os.path.join(MODELS, "piper", job["voice"] + ".onnx")
        config_path = path + ".json"
    try:
        mtime = os.stat(path).st_mtime_ns
    except OSError:
        raise Failure(f"The voice {job.get('voice')} is not installed", "speakNotInstalled")
    if not os.path.exists(config_path):
        raise Failure(f"The voice {job.get('voice')} has no config beside it", "speakNotInstalled")
    key = (path, mtime)
    v = _piper.get(key)
    if v is None:
        for old in [k for k in _piper if k[0] == path]:
            del _piper[old]
        v = load_piper(path, config_path)
        _piper[key] = v
    return v


def speak_piper(text, job, speed):
    from piper import SynthesisConfig

    v = piper_voice(job)
    speaker = job.get("speaker")
    cfg = SynthesisConfig(
        length_scale=1.0 / max(0.5, min(2.0, speed)),
        speaker_id=speaker if isinstance(speaker, int) else None,
    )
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
        audio, rate = speak_kokoro(text, lang, voice, speed, job.get("model"), job.get("pack"))
    elif engine == "light":
        audio, rate = speak_piper(text, job, speed)
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


# ── The self-test ───────────────────────────────────────────────────────────


def selftest(spec):
    """One word per language through the engine's own path: its phonemes, the
    English rules' phonemes of the same word, and the length of the spoken
    word. One line per language, flushed as it goes, so a run that dies
    partway has said which languages it reached."""
    engine = spec["engine"]
    for lang, word in spec["words"].items():
        voice = spec["voices"].get(lang)
        line = {"lang": lang}
        try:
            if engine == "natural":
                k = kokoro()
                if lang == "ja":
                    phonemes, _ = jag2p()(word)
                    english = ""
                else:
                    phonemes = k.tokenizer.phonemize(word, KOKORO_LANG[lang])
                    english = k.tokenizer.phonemize(word, "en-us")
                audio, rate = k.create(phonemes, voice=voice, speed=1.0, is_phonemes=True)
            else:
                from piper.phonemize_espeak import EspeakPhonemizer

                v = piper_voice({"voice": voice})
                phonemes = " ".join("".join(p) for p in v.phonemize(word))
                english = " ".join("".join(p) for p in EspeakPhonemizer(v.espeak_data_dir).phonemize("en-us", word))
                chunks = [c.audio_float_array for c in v.synthesize(word)]
                audio = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
                rate = v.config.sample_rate
            line.update(phonemes=phonemes, english=english, seconds=round(len(audio) / rate, 3))
        except Failure as e:
            line.update(error=str(e), code=e.code)
        except Exception as e:  # this language fails; the next is tried
            line.update(error=f"{type(e).__name__}: {e}", code="engine")
        send(line)
    send({"done": True})


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--selftest":
        selftest(json.loads(sys.argv[2]))
        return
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
