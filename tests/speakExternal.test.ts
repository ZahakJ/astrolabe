// The external speaker (server/speakExternal.ts) with a FAKE program — a
// shell script that reads the sentence from stdin and writes a WAV to {out}
// — through each of its endings: it spoke; it exited non-zero; it ran past
// the time allowed; it exited cleanly and wrote nothing; it wrote something
// that is not sound. And that a sentence is never part of the command line.

import assert from "node:assert/strict";
import { chmodSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { toneWav } from "../server/speakEngine.ts";
import { ExternalSpeakerError, runExternal, soundMime } from "../server/speakExternal.ts";
import { makeDir, removeVault } from "./helpers/vault.ts";

const dir = makeDir();
const work = path.join(dir, "work");
const fake = path.join(dir, "fake speaker.sh"); // a space: the template quotes it
const tone = path.join(dir, "tone.wav");
const said = path.join(dir, "said.txt");
const posix = process.platform !== "win32";

before(() => {
  writeFileSync(tone, toneWav("x"));
  writeFileSync(
    fake,
    `#!/bin/sh
# fake speaker: $1 is what to do, $2 the language, $3 the file to write.
cat > "${said}"
echo "speaking $2" >&2
case "$1" in
  ok) cp "${tone}" "$3" ;;
  ogg) printf 'OggS\\0\\2rest' > "$3" ;;
  fail) echo "no such voice" >&2; exit 3 ;;
  sleep) sleep 5; cp "${tone}" "$3" ;;
  nofile) exit 0 ;;
  junk) echo "hello" > "$3" ;;
esac
`,
  );
  chmodSync(fake, 0o755);
});

after(() => removeVault(dir));

const run = (mode: string, text = "Bonjour tout le monde.", timeoutMs?: number) =>
  runExternal({ command: `"${fake}" ${mode} {lang} {out}`, text, lang: "fr" }, { dir: work, timeoutMs });

async function fails(p: Promise<unknown>, reason: string): Promise<ExternalSpeakerError> {
  try {
    await p;
  } catch (err) {
    assert.ok(err instanceof ExternalSpeakerError, String(err));
    assert.equal(err.reason, reason);
    assert.equal(err.code, "speakExternal");
    assert.equal(err.status, 502);
    return err;
  }
  assert.fail(`expected a ${reason} failure`);
}

describe("the external speaker", { skip: posix ? false : "the fake program is a POSIX shell script" }, () => {
  it("speaks: the sentence on stdin, {lang} and {out} substituted, the WAV read back and removed", async () => {
    const out = await run("ok", "Le chat « dort » ; rm -rf / $(reboot)");
    assert.equal(out.mime, "audio/wav");
    assert.deepEqual(out.audio, new Uint8Array(readFileSync(tone)));
    // The sentence arrived whole on stdin — never a word of the command line.
    assert.equal(readFileSync(said, "utf8"), "Le chat « dort » ; rm -rf / $(reboot)");
    assert.deepEqual(readdirSync(work), [], "the {out} file is removed");
  });

  it("an Ogg file is answered as Ogg", async () => {
    assert.equal((await run("ogg")).mime, "audio/ogg");
  });

  it("a non-zero exit fails, naming the exit and the program's last words", async () => {
    const err = await fails(run("fail"), "exit");
    assert.match(err.message, /failed \(3\)/);
    assert.match(err.message, /no such voice/);
  });

  it("a program past its time is ended and fails", async () => {
    const started = Date.now();
    await fails(run("sleep", "x", 300), "timeout");
    assert.ok(Date.now() - started < 3000, "it does not wait for the program");
  });

  it("an exit with no file fails", async () => {
    await fails(run("nofile"), "noFile");
    assert.deepEqual(readdirSync(work), []);
  });

  it("a file that is not WAV or Ogg fails", async () => {
    await fails(run("junk"), "notAudio");
    assert.deepEqual(readdirSync(work), []);
  });

  it("a program that is not there fails to start", async () => {
    await fails(runExternal({ command: `${path.join(dir, "nothing-here")} {out}`, text: "x", lang: "fr" }, { dir: work }), "spawn");
    assert.equal(existsSync(path.join(dir, "nothing-here")), false);
  });

  it("knows sound by its first bytes", () => {
    assert.equal(soundMime(toneWav("x")), "audio/wav");
    assert.equal(soundMime(new TextEncoder().encode("OggS....")), "audio/ogg");
    assert.equal(soundMime(new TextEncoder().encode("RIFF....AVI ")), null);
    assert.equal(soundMime(new Uint8Array(0)), null);
  });
});
