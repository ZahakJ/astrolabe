"""Kokoro's espeak-ng data by a short path (server/speakWorker.py), without the
engines.

Run by tests/speakWorker.test.ts with any python3. espeak-ng in the
espeakng-loader wheel keeps its data path in a 160-byte buffer and calls
exit(1) when the path does not fit — which took the whole speaker, and every
language but Japanese, with it. The worker hands Kokoro the wheel's own path
when it is short and plain ASCII, and otherwise a copy under a short folder.
The wheel is a stand-in here: a data folder at whatever path the check
needs. Prints one line per check; exits non-zero on the first failure.
"""

import os
import shutil
import sys
import tempfile
import types

HERE = os.path.dirname(os.path.abspath(__file__))
SERVER = os.path.join(HERE, "..", "..", "server")

for name in ("numpy", "onnxruntime", "soundfile"):
    sys.modules[name] = types.ModuleType(name)
sys.modules["numpy"].float32 = "float32"
sys.modules["soundfile"].available_subtypes = lambda fmt: {}

loader = types.ModuleType("espeakng_loader")
sys.modules["espeakng_loader"] = loader

sys.path.insert(0, SERVER)
import speakWorker as w  # noqa: E402


def check(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        sys.exit(1)


def data_at(path):
    os.makedirs(path, exist_ok=True)
    with open(os.path.join(path, "phontab"), "w") as f:
        f.write("x")
    with open(os.path.join(path, "fr_dict"), "w") as f:
        f.write("y")
    return path


def reset(path):
    loader.get_data_path = lambda: path
    w._kokoro_espeak = None


root = tempfile.mkdtemp(prefix="espeak-")
short_home = tempfile.mkdtemp(prefix="t-", dir="/tmp" if os.path.isdir("/tmp") else None)
w._short_bases = lambda: [short_home]

# 1. A short plain path is handed over as it is: nothing copied.
short = data_at(os.path.join(root, "espeak-ng-data"))
reset(short)
check("a short path is used as it is", w.kokoro_espeak_data() == short and os.listdir(short_home) == [])

# 2. A path past the buffer is copied under the short folder, whole.
deep = data_at(os.path.join(root, *(["a-long-folder-name-for-a-vault"] * 6), "espeak-ng-data"))
check("the deep path does not fit", len(deep) > w.ESPEAK_PATH_MAX)
reset(deep)
got = w.kokoro_espeak_data()
check("a long path is replaced by a short copy", got is not None and got.startswith(short_home) and len(got) <= w.ESPEAK_PATH_MAX)
check("the copy is whole", sorted(os.listdir(got)) == ["fr_dict", "phontab"])
check("the answer is kept", w.kokoro_espeak_data() == got)

# 3. A second start finds the copy and does not make another.
reset(deep)
check("an existing copy is reused", w.kokoro_espeak_data() == got and len(os.listdir(short_home)) == 1)

# 4. A path that is not plain ASCII (a Windows user or vault named in Arabic)
#    is copied too, however short.
arabic = data_at(os.path.join(root, "ملاحظات", "espeak-ng-data"))
reset(arabic)
check("a non-ASCII path is replaced by a copy", w.kokoro_espeak_data() == got)

# 5. No short folder to be had: None — Kokoro tries the library's default,
#    and the self-test finds out.
w._short_bases = lambda: [os.path.join(root, *(["x" * 40] * 5))]
reset(deep)
check("no short folder: no path", w.kokoro_espeak_data() is None)

shutil.rmtree(root, ignore_errors=True)
shutil.rmtree(short_home, ignore_errors=True)
print("done")
