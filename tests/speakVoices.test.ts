// The voices folder's scan (server/speakVoices.ts) over a fixture tree shaped
// like the folders in the wild: a loose single-speaker Piper voice, the
// rhasspy/piper-voices catalogue's nested layout with a multi-speaker model,
// a config without its model, a model without its config, a config that is
// not JSON, a voice in a language Read aloud does not detect, a Kokoro pack
// beside its model and one without, a symlink loop — and the folder's own
// refusals (relative, inside the vault, missing, a file).

import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { zipSync } from "../shared/zip.ts";
import { initVault } from "../server/vault.ts";
import { scanVoicesDir } from "../server/speakVoices.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

const config = (code: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    audio: { sample_rate: 22050, quality: "medium" },
    espeak: { voice: code.split("_")[0] },
    phoneme_id_map: { _: [0] },
    num_speakers: 1,
    speaker_id_map: {},
    language: { code, family: code.split("_")[0] },
    ...extra,
  });

const root = makeDir();
const vault = makeVault({ "Note.md": "# Note\n" });

function put(rel: string, content: string | Uint8Array = "onnx"): void {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

before(() => {
  initVault(vault);
  // Loose, single speaker — where Read Text or a hand install leaves one.
  put("fr_FR-siwis-medium.onnx");
  put("fr_FR-siwis-medium.onnx.json", config("fr_FR", { dataset: "siwis" }));
  // The catalogue's layout, four deep, with two speakers in one model.
  put("fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx");
  put("fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx.json", config("fr_FR", { num_speakers: 2, speaker_id_map: { jessica: 0, pierre: 1 } }));
  put("ar/ar_JO/kareem/low/ar_JO-kareem-low.onnx");
  put("ar/ar_JO/kareem/low/ar_JO-kareem-low.onnx.json", config("ar_JO"));
  // Not voices, each for its own reason.
  put("half/en_US-ryan-high.onnx"); // no config beside it
  put("half/en_US-amy-low.onnx.json", config("en_US")); // no model beside it
  put("broken/es_ES-x-low.onnx");
  put("broken/es_ES-x-low.onnx.json", "{ not json");
  put("de/de_DE-thorsten-medium.onnx");
  put("de/de_DE-thorsten-medium.onnx.json", config("de_DE"));
  // A Kokoro pack beside its model, and one alone.
  const npz = zipSync(["af_heart", "ff_siwis", "jf_alpha", "zf_xiaobei"].map((v) => ({ name: `${v}.npy`, data: new Uint8Array(8) })));
  put("kokoro/kokoro-v1.0.onnx");
  put("kokoro/kokoro-v1.0.int8.onnx");
  put("kokoro/voices-v1.0.bin", npz);
  put("lonely/voices-v1.0.bin", npz);
  // Hidden folders are stepped around; a link back to the top ends.
  put(".cache/en_US-lessac-medium.onnx");
  put(".cache/en_US-lessac-medium.onnx.json", config("en_US"));
  symlinkSync(root, path.join(root, "fr", "loop"));
});

after(() => {
  removeVault(root);
  removeVault(vault);
});

describe("the voices folder's scan", () => {
  it("finds every voice, one per speaker, with its language, and the model it loads", async () => {
    const scan = await scanVoicesDir(root, vault);
    assert.equal(scan.problem, null);
    assert.equal(scan.truncated, false);
    const ids = scan.voices.map((v) => `${v.lang} ${v.id} ${v.name}`);
    assert.deepEqual(ids, [
      "ar own:ar/ar_JO/kareem/low/ar_JO-kareem-low.onnx Kareem",
      "en own:kokoro/voices-v1.0.bin#af_heart Heart",
      "fr own:fr_FR-siwis-medium.onnx Siwis",
      "fr own:kokoro/voices-v1.0.bin#ff_siwis Siwis",
      "fr own:fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx#jessica Upmc · Jessica",
      "fr own:fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx#pierre Upmc · Pierre",
      "ja own:kokoro/voices-v1.0.bin#jf_alpha Alpha",
    ]);
    const pierre = scan.voices.find((v) => v.speaker === "pierre")!;
    assert.equal(pierre.model, path.join(root, "fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx"));
    assert.equal(pierre.config, `${pierre.model}.json`);
    assert.equal(pierre.speakerId, 1);
    assert.equal(pierre.quality, "medium");
    const heart = scan.voices.find((v) => v.speaker === "af_heart")!;
    assert.equal(heart.kind, "kokoro");
    assert.equal(heart.model, path.join(root, "kokoro/kokoro-v1.0.onnx"), "the full-precision model, not the int8 one");
    assert.equal(heart.pack, path.join(root, "kokoro/voices-v1.0.bin"));
  });

  it("lists what it skipped and why, and nothing stops it", async () => {
    const scan = await scanVoicesDir(root, vault);
    const skipped = scan.skipped.map((s) => `${s.reason} ${s.file}${s.lang ? ` ${s.lang}` : ""}`).sort();
    assert.deepEqual(skipped, [
      "badJson broken/es_ES-x-low.onnx.json",
      "noJson half/en_US-ryan-high.onnx",
      "noKokoroModel lonely/voices-v1.0.bin",
      "noModel half/en_US-amy-low.onnx.json",
      "otherLanguage de/de_DE-thorsten-medium.onnx de",
      "otherLanguage kokoro/voices-v1.0.bin zh",
    ]);
  });

  it("steps around the vault when the folder contains it", async () => {
    const outer = makeDir();
    const inner = path.join(outer, "vault");
    mkdirSync(inner);
    writeFileSync(path.join(inner, "en_US-x-low.onnx"), "onnx");
    writeFileSync(path.join(inner, "en_US-x-low.onnx.json"), config("en_US"));
    writeFileSync(path.join(outer, "fr_FR-y-low.onnx"), "onnx");
    writeFileSync(path.join(outer, "fr_FR-y-low.onnx.json"), config("fr_FR"));
    try {
      const scan = await scanVoicesDir(outer, inner);
      assert.deepEqual(scan.voices.map((v) => v.id), ["own:fr_FR-y-low.onnx"]);
    } finally {
      removeVault(outer);
    }
  });

  it("refuses a folder it cannot be, with the reason", async () => {
    assert.equal((await scanVoicesDir("relative/voices", vault)).problem, "relative");
    assert.equal((await scanVoicesDir(path.join(vault, "voices"), vault)).problem, "inVault");
    assert.equal((await scanVoicesDir(vault, vault)).problem, "inVault");
    assert.equal((await scanVoicesDir(path.join(root, "nowhere"), vault)).problem, "missing");
    assert.equal((await scanVoicesDir(path.join(root, "fr_FR-siwis-medium.onnx"), vault)).problem, "notDir");
  });
});
