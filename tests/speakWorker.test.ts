// The speaker's loading BY PATH (server/speakWorker.py) — a found voice from
// the voices folder is a model named by absolute path, its config beside it,
// cached by path + mtime so a replaced file is loaded again, and a
// multi-speaker model's speaker number reaches the synthesis.
//
// The checks are Python (tests/helpers/speak_worker_paths.py), run with any
// python3 on the machine: the engines' wheels are replaced by stand-ins, so
// this is the plumbing, not Piper. Skipped where no python3 is on the PATH.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const script = fileURLToPath(new URL("./helpers/speak_worker_paths.py", import.meta.url));
const python = ["python3", "python"].find((exe) => spawnSync(exe, ["--version"], { encoding: "utf8" }).status === 0);

describe("the speaker loads a found voice by path", () => {
  it("path, config, cache by mtime, speaker number, and the refusals", { skip: python ? false : "no python3 here" }, () => {
    const env = { ...process.env };
    delete env.PYTHONHOME;
    delete env.PYTHONPATH;
    env.PYTHONDONTWRITEBYTECODE = "1"; // no __pycache__ beside the server
    const run = spawnSync(python!, [script], { encoding: "utf8", env });
    const out = `${run.stdout}${run.stderr}`;
    assert.equal(run.status, 0, out);
    assert.match(out, /^done$/m, out);
    assert.doesNotMatch(out, /^FAIL/m, out);
    // The worker hands stdout to its protocol and prints everything else on
    // stderr, so the checks are read from both. Every check printed, so a
    // silently skipped one is a failure too.
    assert.equal((out.match(/^ok /gm) ?? []).length, 12, out);
  });
});
