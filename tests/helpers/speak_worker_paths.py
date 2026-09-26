"""The speaker's loading by path (server/speakWorker.py), without the engines.

Run by tests/speakWorker.test.ts with any python3. numpy, onnxruntime,
soundfile and piper are replaced by stand-ins BEFORE the worker is imported,
so what is tested is the plumbing a found voice goes through — a model named
by absolute path, its config beside it, the loaded-voice cache keyed by path
and mtime (a replaced file is loaded again), the speaker's number passed to
the synthesis — and not Piper itself, which the release trial covers with the
real wheels. Prints one line per check; exits non-zero on the first failure.
"""

import json
import os
import shutil
import sys
import tempfile
import types

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(HERE, "..", "..", "server")

# ── stand-ins ────────────────────────────────────────────────────────────────


class Arr(list):
    def astype(self, _dtype):
        return self


np = types.ModuleType("numpy")
np.float32 = "float32"
np.zeros = lambda n, dtype=None: Arr([0.0] * n)
np.concatenate = lambda chunks: Arr([x for c in chunks for x in c])
sys.modules["numpy"] = np

ort = types.ModuleType("onnxruntime")
ort.SessionOptions = lambda: types.SimpleNamespace()
ort.InferenceSession = lambda path, so, providers=None: ("session", path)
sys.modules["onnxruntime"] = ort

sf = types.ModuleType("soundfile")
sf.available_subtypes = lambda fmt: {}
sys.modules["soundfile"] = sf


class SynthesisConfig:
    def __init__(self, **kw):
        self.__dict__.update(kw)


piper = types.ModuleType("piper")
piper.SynthesisConfig = SynthesisConfig
piper.PiperVoice = object
sys.modules["piper"] = piper

MODELS = tempfile.mkdtemp(prefix="speakworker-models-")
os.environ["ASTROLABE_TTS_MODELS"] = MODELS
sys.path.insert(0, SERVER)
import speakWorker as w  # noqa: E402

# ── a fake voice the loader hands back ───────────────────────────────────────

loads = []


class FakeVoice:
    def __init__(self, path, config):
        self.path = path
        self.config = types.SimpleNamespace(sample_rate=22050)
        self.asked = []

    def synthesize(self, text, syn_config=None):
        self.asked.append((text, syn_config))
        return [types.SimpleNamespace(audio_float_array=[0.1, 0.2])]


def fake_load(path, config_path):
    loads.append((path, config_path))
    return FakeVoice(path, config_path)


w.load_piper = fake_load


def check(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        sys.exit(1)


def touch(path, text="x"):
    with open(path, "w") as f:
        f.write(text)


own = tempfile.mkdtemp(prefix="speakworker-own-")
nested = os.path.join(own, "fr", "fr_FR", "upmc", "medium")
os.makedirs(nested)
model = os.path.join(nested, "fr_FR-upmc-medium.onnx")
touch(model)
touch(model + ".json", json.dumps({"phoneme_id_map": {}}))

# 1. A found voice is loaded by its absolute path, with its config beside it.
v1 = w.piper_voice({"voice": "own:fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx#pierre", "model": model})
check("a found voice loads by absolute path", loads == [(model, model + ".json")])
check("the loaded voice is the file named", v1.path == model)

# 2. Asked again, it is the cached voice.
v2 = w.piper_voice({"voice": "x", "model": model})
check("asked again, the cache answers", v2 is v1 and len(loads) == 1)

# 3. The file replaced under the same name: a new mtime, a new load, and the
#    old voice is dropped from the cache.
st = os.stat(model)
os.utime(model, ns=(st.st_atime_ns, st.st_mtime_ns + 5_000_000_000))
v3 = w.piper_voice({"voice": "x", "model": model})
check("a replaced file is loaded again", v3 is not v1 and len(loads) == 2)
check("the old voice leaves the cache", sum(1 for k in w._piper if k[0] == model) == 1)

# 4. An explicit config path wins over `<model>.json`.
other = os.path.join(own, "my-voice.onnx")
touch(other)
touch(os.path.join(own, "my-voice.json"), "{}")
w.piper_voice({"voice": "x", "model": other, "config": os.path.join(own, "my-voice.json")})
check("an explicit config is used", loads[-1] == (other, os.path.join(own, "my-voice.json")))

# 5. A model that is gone, or a config that is gone, is speakNotInstalled.
for job, what in (
    ({"voice": "x", "model": os.path.join(own, "gone.onnx")}, "a missing model"),
    ({"voice": "x", "model": other, "config": os.path.join(own, "gone.json")}, "a missing config"),
):
    try:
        w.piper_voice(job)
        check(what + " fails", False)
    except w.Failure as e:
        check(what + " is speakNotInstalled", e.code == "speakNotInstalled")

# 6. A built-in voice is still found by NAME under MODELS/piper.
os.makedirs(os.path.join(MODELS, "piper"))
builtin = os.path.join(MODELS, "piper", "fr_FR-siwis-medium.onnx")
touch(builtin)
touch(builtin + ".json", "{}")
w.piper_voice({"voice": "fr_FR-siwis-medium"})
check("a built-in voice loads by name", loads[-1] == (builtin, builtin + ".json"))

# 7. The speaker's number reaches the synthesis; a single-speaker voice gets none.
audio, rate = w.speak_piper("Bonjour.", {"voice": "x", "model": model, "speaker": 1}, 1.0)
cfg = v3.asked[-1][1]
check("the speaker's number is passed", cfg.speaker_id == 1 and rate == 22050 and list(audio) == [0.1, 0.2])
w.speak_piper("Bonjour.", {"voice": "x", "model": model}, 1.0)
check("no speaker, no number", v3.asked[-1][1].speaker_id is None)

# 8. handle() routes a Light job with a model through the path.
reply = None
try:
    w.encode = lambda audio, rate, fmt: (b"RIFF", "audio/wav")
    reply = w.handle({"id": "9", "engine": "light", "lang": "fr", "voice": "x", "text": "Salut.", "format": "wav", "model": model, "speaker": 0})
except Exception as e:  # noqa: BLE001
    print("handle raised", e)
check("handle speaks a found voice", reply is not None and reply["ok"] and v3.asked[-1][1].speaker_id == 0)

shutil.rmtree(own, ignore_errors=True)
shutil.rmtree(MODELS, ignore_errors=True)
print("done")
