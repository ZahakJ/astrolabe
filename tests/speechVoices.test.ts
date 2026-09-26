// Your own voices, the pure half (shared/speechVoices.ts): what a Piper
// config and a Kokoro pack say, the ids, the voices folder's path refusals,
// the merge of built-in and found voices into one picker, which voice
// speaks, and the external speaker's command template.

import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import {
  countByLang,
  engineNeededWith,
  externalArgv,
  externalCommandProblem,
  isOwnVoiceId,
  kokoroEntries,
  kokoroVoiceLang,
  pickerLangs,
  piperConfigLang,
  piperEntries,
  piperFileParts,
  piperSpeakerId,
  resolveVoice,
  skippedByReason,
  splitCommand,
  voiceChoices,
  voicesDirRefusal,
  type OwnVoice,
} from "../shared/speechVoices.ts";

const piperConfig = (extra: Record<string, unknown> = {}) => ({
  audio: { sample_rate: 22050, quality: "medium" },
  espeak: { voice: "fr" },
  phoneme_id_map: { a: [1] },
  num_speakers: 1,
  speaker_id_map: {},
  language: { code: "fr_FR", family: "fr", region: "FR" },
  dataset: "siwis",
  ...extra,
});

describe("a Piper voice file", () => {
  it("reads the catalogue's file name: locale, name, quality", () => {
    assert.deepEqual(piperFileParts("fr_FR-upmc-medium"), { locale: "fr_FR", name: "upmc", quality: "medium" });
    assert.deepEqual(piperFileParts("en_US-lessac-x_low"), { locale: "en_US", name: "lessac", quality: "x_low" });
    assert.deepEqual(piperFileParts("ar_JO-kareem-medium"), { locale: "ar_JO", name: "kareem", quality: "medium" });
    assert.deepEqual(piperFileParts("my-voice"), { locale: null, name: "my-voice", quality: null });
  });

  it("takes the language from the config first, then the file name", () => {
    assert.deepEqual(piperConfigLang(piperConfig(), null), { lang: "fr", locale: "fr_FR" });
    assert.deepEqual(piperConfigLang({ language: { family: "ar" } }, null), { lang: "ar", locale: "ar" });
    assert.deepEqual(piperConfigLang({ espeak: { voice: "en-us" } }, null), { lang: "en", locale: "en_us" });
    assert.deepEqual(piperConfigLang({}, "es_ES"), { lang: "es", locale: "es_ES" });
    assert.equal(piperConfigLang({}, null), null);
  });

  it("is one voice, named, in its language", () => {
    const got = piperEntries("fr_FR-siwis-medium.onnx", piperConfig());
    assert.ok("voices" in got);
    assert.deepEqual(got.voices, [
      { id: "own:fr_FR-siwis-medium.onnx", name: "Siwis", lang: "fr", locale: "fr_FR", quality: "medium", speaker: null, kind: "piper" },
    ]);
  });

  it("is one voice PER SPEAKER when the model has several (fr_FR-upmc: jessica and pierre)", () => {
    const config = piperConfig({ num_speakers: 2, speaker_id_map: { pierre: 1, jessica: 0 }, dataset: "upmc" });
    const got = piperEntries("fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx", config);
    assert.ok("voices" in got);
    assert.deepEqual(
      got.voices.map((v) => [v.id, v.name, v.speaker]),
      [
        ["own:fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx#jessica", "Upmc · Jessica", "jessica"],
        ["own:fr/fr_FR/upmc/medium/fr_FR-upmc-medium.onnx#pierre", "Upmc · Pierre", "pierre"],
      ],
    );
    assert.equal(piperSpeakerId(config, "pierre"), 1);
    assert.equal(piperSpeakerId(config, "nobody"), null);
    assert.equal(piperSpeakerId(config, null), null);
  });

  it("names a file that does not follow the convention by its dataset", () => {
    const got = piperEntries("mine/voice.onnx", piperConfig({ dataset: "grand_pere" }));
    assert.ok("voices" in got);
    assert.equal(got.voices[0].name, "Grand Pere");
  });

  it("says why a file is not a voice", () => {
    assert.deepEqual(piperEntries("x.onnx", "not an object"), { skip: "badJson" });
    assert.deepEqual(piperEntries("x.onnx", { audio: {} }), { skip: "badJson" }, "no phoneme table: not a Piper config");
    assert.deepEqual(piperEntries("x.onnx", { phoneme_id_map: {} }), { skip: "noLanguage" });
    assert.deepEqual(piperEntries("de_DE-thorsten-medium.onnx", piperConfig({ language: { code: "de_DE" } })), {
      skip: "otherLanguage",
      lang: "de",
    });
  });
});

describe("a Kokoro pack", () => {
  it("reads a voice's language from its first letter", () => {
    assert.equal(kokoroVoiceLang("af_heart"), "en");
    assert.equal(kokoroVoiceLang("bm_george"), "en");
    assert.equal(kokoroVoiceLang("ff_siwis"), "fr");
    assert.equal(kokoroVoiceLang("jf_alpha"), "ja");
    assert.equal(kokoroVoiceLang("zf_xiaobei"), "zh");
    assert.equal(kokoroVoiceLang("weird"), null);
  });

  it("is one voice per npz member in a language Read aloud speaks; the rest are counted", () => {
    const { voices, other } = kokoroEntries("kokoro/voices-v1.0.bin", ["af_heart.npy", "bm_george.npy", "ff_siwis.npy", "zf_xiaobei.npy", "hf_alpha.npy", "README"]);
    assert.deepEqual(
      voices.map((v) => [v.id, v.name, v.lang, v.locale, v.kind]),
      [
        ["own:kokoro/voices-v1.0.bin#af_heart", "Heart", "en", "en_US", "kokoro"],
        ["own:kokoro/voices-v1.0.bin#bm_george", "George (British)", "en", "en_GB", "kokoro"],
        ["own:kokoro/voices-v1.0.bin#ff_siwis", "Siwis", "fr", "fr", "kokoro"],
      ],
    );
    assert.deepEqual([...other], [["zh", 1], ["hi", 1]]);
  });
});

describe("ids", () => {
  it("an own id is a relative path, never one that climbs", () => {
    assert.equal(isOwnVoiceId("own:fr/x.onnx#pierre"), true);
    assert.equal(isOwnVoiceId("own:x.onnx"), true);
    assert.equal(isOwnVoiceId("own:"), false);
    assert.equal(isOwnVoiceId("own:../x.onnx"), false);
    assert.equal(isOwnVoiceId("own:a//x.onnx"), false);
    assert.equal(isOwnVoiceId("fr_FR-siwis-medium"), false);
    assert.equal(isOwnVoiceId(42), false);
  });
});

describe("the voices folder's path", () => {
  const posixAbs = (p: string): boolean => p.startsWith("/");
  it("must be absolute", () => {
    assert.equal(voicesDirRefusal("piper-voices", "/home/me/vault", posixAbs), "relative");
    assert.equal(voicesDirRefusal("~/piper", "/home/me/vault", posixAbs), "relative");
  });
  it("must be outside the vault — the vault itself and anything in it are refused", () => {
    assert.equal(voicesDirRefusal("/home/me/vault", "/home/me/vault", posixAbs), "inVault");
    assert.equal(voicesDirRefusal("/home/me/vault/voices", "/home/me/vault", posixAbs), "inVault");
    assert.equal(voicesDirRefusal("/home/me/vault/", "/home/me/vault", posixAbs), "inVault");
  });
  it("a neighbour whose name starts like the vault's is not inside it; a parent is allowed", () => {
    assert.equal(voicesDirRefusal("/home/me/vault-voices", "/home/me/vault", posixAbs), null);
    assert.equal(voicesDirRefusal("/home/me/.local/share/piper-voices", "/home/me/vault", posixAbs), null);
    assert.equal(voicesDirRefusal("/home/me", "/home/me/vault", posixAbs), null);
  });
  it("on Windows, case does not hide the vault", () => {
    assert.equal(voicesDirRefusal("C:\\Users\\Me\\VAULT\\voices", "C:\\Users\\Me\\vault", path.win32.isAbsolute, "\\"), "inVault");
    assert.equal(voicesDirRefusal("voices", "C:\\Users\\Me\\vault", path.win32.isAbsolute, "\\"), "relative");
  });
});

// ── The picker, and which voice speaks ─────────────────────────────────────

const own: OwnVoice[] = [
  { id: "own:fr_FR-upmc-medium.onnx#jessica", name: "Upmc · Jessica", lang: "fr", locale: "fr_FR", quality: "medium", speaker: "jessica", kind: "piper" },
  { id: "own:fr_FR-upmc-medium.onnx#pierre", name: "Upmc · Pierre", lang: "fr", locale: "fr_FR", quality: "medium", speaker: "pierre", kind: "piper" },
  { id: "own:es_ES-davefx-medium.onnx", name: "Davefx", lang: "es", locale: "es_ES", quality: "medium", speaker: null, kind: "piper" },
  { id: "own:k/voices.bin#af_nicole", name: "Nicole", lang: "en", locale: "en_US", quality: null, speaker: "af_nicole", kind: "kokoro" },
];
const light = new Set(["light"] as const);
const both = new Set(["light", "natural"] as const);
const none = new Set<"light" | "natural">();

describe("the picker: built-in and found, per language", () => {
  it("offers the built-in engine's voices, then the folder's", () => {
    const fr = voiceChoices("fr", "light", light, own);
    assert.equal(fr.engine, "light");
    assert.deepEqual(fr.builtin.map((v) => v.id), ["fr_FR-siwis-medium"]);
    assert.deepEqual(fr.own.map((v) => v.id), ["own:fr_FR-upmc-medium.onnx#jessica", "own:fr_FR-upmc-medium.onnx#pierre"]);
  });

  it("a language no built-in voice of the choice speaks still gets its found voices", () => {
    const es = voiceChoices("es", "light", light, own);
    assert.equal(es.engine, "natural", "Spanish's built-in voices are Kokoro's, not installed");
    assert.deepEqual(es.own.map((v) => v.id), ["own:es_ES-davefx-medium.onnx"]);
  });

  it("draws a picker for a language with a choice to make", () => {
    // fr: found voices; es: a found voice; en under Light: one built-in and a
    // found Kokoro voice; ar: one built-in, nothing found — no picker.
    assert.deepEqual(pickerLangs(["en", "fr", "ar", "es", "ja"], "light", light, own), ["en", "fr", "es"]);
    // Natural's English has five voices: a picker with nothing found.
    assert.deepEqual(pickerLangs(["en", "ar"], "natural", both, []), ["en"]);
  });
});

describe("which voice speaks", () => {
  it("no pick: the built-in engine's first voice, as before", () => {
    assert.deepEqual(resolveVoice("fr", "light", undefined, light, own), { engine: "light", voice: "fr_FR-siwis-medium", own: null });
  });

  it("a found voice picked is the one that speaks, by the engine whose runtime it needs", () => {
    const got = resolveVoice("fr", "light", "own:fr_FR-upmc-medium.onnx#pierre", light, own);
    assert.equal(got?.engine, "light");
    assert.equal(got?.voice, "own:fr_FR-upmc-medium.onnx#pierre");
    assert.equal(got?.own?.speaker, "pierre");
  });

  it("a found Kokoro voice needs Natural's runtime; without it the built-in answers", () => {
    assert.equal(resolveVoice("en", "light", "own:k/voices.bin#af_nicole", both, own)?.voice, "own:k/voices.bin#af_nicole");
    assert.equal(resolveVoice("en", "light", "own:k/voices.bin#af_nicole", light, own)?.voice, "en_US-lessac-medium");
  });

  it("a pick that is no longer in the folder falls back to the built-in voice", () => {
    assert.equal(resolveVoice("fr", "light", "own:gone.onnx", light, own)?.voice, "fr_FR-siwis-medium");
  });

  it("a pick in another language is not taken", () => {
    assert.equal(resolveVoice("ar", "light", "own:fr_FR-upmc-medium.onnx#pierre", light, own)?.voice, "ar_JO-kareem-medium");
  });

  it("a language only a found voice speaks is spoken by it", () => {
    assert.deepEqual(resolveVoice("es", "light", undefined, light, own), {
      engine: "light",
      voice: "own:es_ES-davefx-medium.onnx",
      own: own[2],
    });
  });

  it("nothing installed: nothing speaks, and the runtime to install is named", () => {
    assert.equal(resolveVoice("fr", "light", "own:fr_FR-upmc-medium.onnx#pierre", none, own), null);
    assert.equal(engineNeededWith("fr", "light", own), "light");
    assert.equal(engineNeededWith("es", "light", own), "light", "the found Piper voice needs Light, not Kokoro");
    assert.equal(engineNeededWith("es", "light", []), "natural");
    assert.equal(engineNeededWith("en", "light", own.slice(3)), "natural");
  });

  it("counts per language and groups the skipped by why", () => {
    assert.deepEqual(countByLang(own), [
      { lang: "fr", count: 2 },
      { lang: "en", count: 1 },
      { lang: "es", count: 1 },
    ]);
    assert.deepEqual(
      skippedByReason([
        { file: "a.onnx", reason: "noJson" },
        { file: "b.onnx.json", reason: "noModel" },
        { file: "c.onnx", reason: "noJson" },
      ]),
      [
        { reason: "noJson", count: 2, files: ["a.onnx", "c.onnx"] },
        { reason: "noModel", count: 1, files: ["b.onnx.json"] },
      ],
    );
  });
});

describe("the external speaker's command", () => {
  it("splits like a shell line, quotes and escapes, and nothing more", () => {
    assert.deepEqual(splitCommand("piper --model /v/fr.onnx --output_file {out}"), ["piper", "--model", "/v/fr.onnx", "--output_file", "{out}"]);
    assert.deepEqual(splitCommand(`python3 "/home/me/My Voices/speak.py" --lang '{lang}' --out {out}`), [
      "python3",
      "/home/me/My Voices/speak.py",
      "--lang",
      "{lang}",
      "--out",
      "{out}",
    ]);
    assert.deepEqual(splitCommand("a\\ b \"c \\\"d\\\"\" ''"), ["a b", 'c "d"', ""]);
    assert.deepEqual(splitCommand("echo $HOME; rm -rf / | cat"), ["echo", "$HOME;", "rm", "-rf", "/", "|", "cat"], "no shell: these are words");
    assert.equal(splitCommand('piper "unclosed'), null);
  });

  it("must name {out}, have closed quotes, and fit", () => {
    assert.equal(externalCommandProblem("piper --output_file {out}"), null);
    assert.equal(externalCommandProblem("python3 s.py --out={out}.wav"), null);
    assert.equal(externalCommandProblem(""), "empty");
    assert.equal(externalCommandProblem("piper --model x.onnx"), "noOut");
    assert.equal(externalCommandProblem("{out}"), "noOut", "the program itself cannot be the file");
    assert.equal(externalCommandProblem('piper "{out}'), "quotes");
    assert.equal(externalCommandProblem(`p ${"x".repeat(2001)} {out}`), "tooLong");
  });

  it("substitutes {lang} and {out} in every word", () => {
    assert.deepEqual(externalArgv("speak --language {lang} --voice {lang}-best -o {out}", "fr", "/tmp/a.wav"), [
      "speak",
      "--language",
      "fr",
      "--voice",
      "fr-best",
      "-o",
      "/tmp/a.wav",
    ]);
  });
});
