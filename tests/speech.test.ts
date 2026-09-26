// Read aloud: which language a run of text is spoken in, where a sentence
// ends (Latin, Arabic, Japanese and French punctuation), which engine answers
// a language, and what a note says when it is read whole. The engines
// themselves are faked in tests/speakRoutes.test.ts; what they sound like is
// docs/read-aloud.md's trial, measured by ear and by whisper, not here.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  closeSentence,
  detectSpeechLang,
  engineFor,
  engineNeeded,
  frontmatterLang,
  isVoiceOf,
  SENTENCE_MAX,
  speakEffective,
  speakFurigana,
  speakLangOf,
  speechTextOfNote,
  splitSentences,
  splitSentencesIn,
  passageSpeechLang,
  builtinVoice,
  isOnChoiceVoice,
  refusalsOf,
  SPEAK_ENGINES,
  SPEAK_VOICES,
  voiceFor,
  type SpeakEngineId,
} from "../shared/speech.ts";

describe("detectSpeechLang: script first", () => {
  it("Arabic letters are Arabic, pointed or not", () => {
    assert.equal(detectSpeechLang("الْمَكْتَبَةُ"), "ar");
    assert.equal(detectSpeechLang("المكتبة العامة"), "ar");
  });
  it("kana and kanji are Japanese, a lone kanji word included", () => {
    assert.equal(detectSpeechLang("図書館"), "ja");
    assert.equal(detectSpeechLang("ありがとう"), "ja");
    assert.equal(detectSpeechLang("東京タワー Tokyo"), "ja"); // a tie goes to Japanese
  });
  it("by count: an English sentence quoting one kanji stays English", () => {
    assert.equal(detectSpeechLang("The word 猫 means cat in Japanese."), "en");
    assert.equal(detectSpeechLang("The word كتاب means book."), "en");
  });
  it("script beats every hint", () => {
    assert.equal(detectSpeechLang("図書館", { noteLang: "fr" }), "ja");
    assert.equal(detectSpeechLang("كتاب", { noteLang: "en", siteLang: "en" }), "ar");
  });
});

describe("detectSpeechLang: Latin text", () => {
  it("a French sentence is French in an English note", () => {
    assert.equal(detectSpeechLang("Les enfants ont appris leurs leçons en une heure.", { noteLang: "en" }), "fr");
  });
  it("the note's own lang decides an ambiguous line", () => {
    assert.equal(detectSpeechLang("grenouille", { noteLang: "fr" }), "fr");
    assert.equal(detectSpeechLang("hola amigo", { noteLang: "es-MX" }), "es");
  });
  it("a lone word takes the language of the sentence it was selected from", () => {
    assert.equal(detectSpeechLang("grenouille"), "en");
    assert.equal(detectSpeechLang("grenouille", { context: "La grenouille est dans le jardin de la maison." }), "fr");
  });
  it("a lone accented word is French", () => {
    assert.equal(detectSpeechLang("élève"), "fr");
    assert.equal(detectSpeechLang("naïveté"), "fr");
  });
  it("falls back to the site language, then English", () => {
    assert.equal(detectSpeechLang("ciao", { siteLang: "it" }), "it");
    assert.equal(detectSpeechLang("hello", { siteLang: "ar" }), "en");
    assert.equal(detectSpeechLang("hello"), "en");
  });
  // THE READER'S NOTE (3.36): a French lesson read aloud whole was read with
  // the English voice, because each sentence is its own request and a
  // heading like this one has no French word to count.
  const lesson = [
    "Décrire son quotidien",
    "",
    "C'est ma vie !",
    "",
    "Aujourd'hui, le témoignage de Julie. Je finis mon travail à 18 heures.",
    "",
    "Le matin",
    "",
    "Je me lève tôt et je prends le bus.",
  ].join("\n");
  it("a sentence with no French word of its own was English — the bug", () => {
    assert.equal(detectSpeechLang("Décrire son quotidien."), "en");
    assert.equal(detectSpeechLang("Le matin."), "en");
  });
  it("…and is French once the passage it is read in says so", () => {
    assert.equal(passageSpeechLang(lesson), "fr");
    assert.equal(detectSpeechLang("Décrire son quotidien.", { passage: "fr" }), "fr");
    assert.equal(detectSpeechLang("Le matin.", { passage: passageSpeechLang(lesson) }), "fr");
    // Every sentence of the lesson, as the player sends them.
    for (const s of splitSentencesIn(lesson)) {
      assert.equal(detectSpeechLang(s.text, { context: s.block, passage: passageSpeechLang(lesson) }), "fr", s.text);
    }
  });
  it("the passage is counted by line: an English note quoting one French line stays English", () => {
    const english = [
      "Notes from the meeting about the new library.",
      "We will open on Monday and close on Friday afternoons.",
      "The mayor said: « Je suis très content de cette bibliothèque. »",
      "Parking is free for the first hour of every visit.",
    ].join("\n");
    assert.equal(passageSpeechLang(english), null);
    assert.equal(detectSpeechLang("Parking is free.", { passage: passageSpeechLang(english) }), "en");
    // The French line itself is still French on its own evidence.
    assert.equal(detectSpeechLang("Je suis très content de cette bibliothèque."), "fr");
  });
  it("script and the note's own lang still come first", () => {
    assert.equal(detectSpeechLang("図書館", { passage: "fr" }), "ja");
    assert.equal(detectSpeechLang("hello there", { noteLang: "en", passage: "fr" }), "en");
    assert.equal(detectSpeechLang("hello", { passage: "de" }), "en", "a passage language we do not speak is no hint");
  });
  it("each sentence carries the paragraph it came from", () => {
    const got = splitSentencesIn("One. Two!\n\nThree");
    assert.deepEqual(got, [
      { text: "One.", block: "One. Two!" },
      { text: "Two!", block: "One. Two!" },
      { text: "Three", block: "Three" },
    ]);
  });
  it("the transcription language is not a hint: no setting of voice notes reaches the detector", () => {
    // detectSpeechLang takes its hints and nothing else — the "Voice notes:
    // transcription language" row cannot leak into what is read aloud.
    assert.equal(detectSpeechLang.length <= 2, true);
    assert.equal(detectSpeechLang("C'est ma vie !", { siteLang: "en" }), "fr");
  });
  it("reads lang tags and frontmatter", () => {
    assert.equal(speakLangOf("fr-CA"), "fr");
    assert.equal(speakLangOf("pt_BR"), "pt");
    assert.equal(speakLangOf("de"), null);
    assert.equal(frontmatterLang("title: x\nlang: fr\n"), "fr");
    assert.equal(frontmatterLang('language: "ja"'), "ja");
    assert.equal(frontmatterLang("title: x"), null);
  });
});

describe("splitSentences", () => {
  it("French: spaced ! and ?, guillemets, decimals and M. stay whole", () => {
    assert.deepEqual(
      splitSentences("Bonjour ! Comment allez-vous ? Très bien, merci. M. Dupont a fait 3,5 km et 3.5 miles. Il a dit « Allons-y. » Puis il est parti…"),
      ["Bonjour !", "Comment allez-vous ?", "Très bien, merci.", "M. Dupont a fait 3,5 km et 3.5 miles.", "Il a dit « Allons-y. »", "Puis il est parti…"],
    );
  });
  it("the narrow no-break space French sets before ? is not a sentence", () => {
    assert.deepEqual(splitSentences("Vraiment ? Oui !"), ["Vraiment ?", "Oui !"]);
  });
  it("Japanese: 。！？ end a sentence with no space after them", () => {
    assert.deepEqual(splitSentences("昨日、図書館へ行きました。本を三冊借りました！面白かったですか？はい。"), [
      "昨日、図書館へ行きました。",
      "本を三冊借りました！",
      "面白かったですか？",
      "はい。",
    ]);
  });
  it("Japanese: a closing bracket belongs to the sentence it ends", () => {
    assert.deepEqual(splitSentences("「行きましょう。」と彼は言った。"), ["「行きましょう。」", "と彼は言った。"]);
  });
  it("Arabic: the Arabic question mark ends a sentence, the Arabic comma does not", () => {
    assert.deepEqual(splitSentences("ذهبتُ إلى المكتبة. هل قرأتَ الكتاب؟ نعم، قرأته."), [
      "ذهبتُ إلى المكتبة.",
      "هل قرأتَ الكتاب؟",
      "نعم، قرأته.",
    ]);
  });
  it("English: abbreviations and initials are not boundaries; ellipses and ?! are", () => {
    assert.deepEqual(splitSentences("Dr. Smith met J. R. R. Tolkien in 1954. They talked, e.g. about trees... Really?! Yes."), [
      "Dr. Smith met J. R. R. Tolkien in 1954.",
      "They talked, e.g. about trees...",
      "Really?!",
      "Yes.",
    ]);
  });
  it("a blank line is a boundary, a single newline is a space", () => {
    assert.deepEqual(splitSentences("Heading\n\nLine two without stop\nstill two"), ["Heading", "Line two without stop still two"]);
  });
  it("drops pieces with no letters or digits", () => {
    assert.deepEqual(splitSentences("… . ! Word."), ["Word."]);
  });
  it("a sentence past the cap is cut where a reader breathes", () => {
    const long = Array.from({ length: 40 }, (_, i) => `clause number ${i}`).join(", ") + ".";
    const parts = splitSentences(long);
    assert.ok(parts.length > 1);
    for (const p of parts) assert.ok(p.length <= SENTENCE_MAX, p);
    assert.equal(parts.join(" "), long);
  });
});

describe("engines", () => {
  const both = new Set<SpeakEngineId>(["light", "natural"]);
  const light = new Set<SpeakEngineId>(["light"]);
  const none = new Set<SpeakEngineId>();
  it("the choice wins where both engines speak", () => {
    assert.equal(engineFor("fr", "light", both), "light");
    assert.equal(engineFor("fr", "natural", both), "natural");
    assert.equal(engineFor("en", "natural", light), "light");
  });
  it("Arabic is always Piper, Japanese always Kokoro", () => {
    assert.equal(engineFor("ar", "natural", both), "light");
    assert.equal(engineFor("ja", "light", both), "natural");
    assert.equal(engineFor("ja", "light", light), null);
    assert.equal(engineNeeded("ja", "light"), "natural");
    assert.equal(engineNeeded("ar", "natural"), "light");
    assert.equal(engineFor("en", "light", none), null);
  });
  it("a language an engine's self-test refused goes to the other engine, or names it", () => {
    const refused = { natural: ["fr"] as const };
    assert.equal(engineFor("fr", "natural", both, refused), "light");
    assert.equal(engineFor("fr", "natural", new Set<SpeakEngineId>(["natural"]), refused), null);
    assert.equal(engineNeeded("fr", "natural", refused), "light");
    assert.equal(engineFor("en", "natural", both, refused), "natural", "only the refused language moves");
    assert.deepEqual(
      refusalsOf({
        light: { check: { at: 1, langs: { fr: { ok: true } } } },
        natural: { check: { at: 1, langs: { ja: { ok: true }, fr: { ok: false, why: "english" }, es: { ok: false, why: "stopped" } } } },
      }),
      { natural: ["fr", "es"] },
    );
  });
  it("every built-in voice wears its gender, and French has a man's voice (Light's Pierre)", () => {
    for (const e of SPEAK_ENGINES) {
      for (const list of Object.values(SPEAK_VOICES[e])) for (const v of list ?? []) assert.ok(v.gender === "m" || v.gender === "f", v.id);
    }
    assert.ok(SPEAK_VOICES.light.fr?.some((v) => v.gender === "m"));
    assert.ok(!SPEAK_VOICES.natural.fr?.some((v) => v.gender === "m"), "Kokoro has no man's French voice — the picker says so");
    // Kokoro's own naming agrees with the table: the second letter is the gender.
    for (const list of Object.values(SPEAK_VOICES.natural)) for (const v of list ?? []) assert.equal(v.gender, v.id[1], v.id);
  });
  it("Pierre is one speaker of a model that downloads on choice; each language's first voice comes with Install", () => {
    const pierre = builtinVoice("fr_FR-upmc-medium#pierre");
    assert.deepEqual([pierre?.engine, pierre?.lang, pierre?.voice.file, pierre?.voice.speaker], ["light", "fr", "fr_FR-upmc-medium", 1]);
    assert.equal(builtinVoice("fr_FR-upmc-medium#jessica")?.voice.speaker, 0);
    assert.ok(isOnChoiceVoice("fr_FR-upmc-medium#pierre"));
    assert.ok(!isOnChoiceVoice("fr_FR-siwis-medium"));
    assert.ok(!isOnChoiceVoice("jm_kumo"), "a Kokoro voice is a row of the one voices file");
    assert.ok(isVoiceOf("fr", "fr_FR-upmc-medium#pierre"));
    // Not on disk yet: the language's first voice speaks meanwhile.
    assert.equal(voiceFor("light", "fr", "fr_FR-upmc-medium#pierre", () => false), "fr_FR-siwis-medium");
    assert.equal(voiceFor("light", "fr", "fr_FR-upmc-medium#pierre", () => true), "fr_FR-upmc-medium#pierre");
  });
  it("voices: the pick when the engine has it, else the first", () => {
    assert.equal(voiceFor("natural", "ja", "jm_kumo"), "jm_kumo");
    assert.equal(voiceFor("natural", "ja", "nope"), "jf_alpha");
    assert.equal(voiceFor("light", "ja"), null);
    assert.ok(isVoiceOf("en", "af_heart"));
    assert.ok(!isVoiceOf("fr", "af_heart"));
  });
  it("settings fill their defaults: Light, rate 1, not public", () => {
    assert.deepEqual(speakEffective(undefined), { engine: "light", rate: 1, voices: {}, public: false, voicesDir: null, external: null });
    assert.deepEqual(speakEffective({ engine: "natural", rate: 0.8, public: true, voices: { ja: "jm_kumo" } }), {
      engine: "natural",
      rate: 0.8,
      voices: { ja: "jm_kumo" },
      public: true,
      voicesDir: null,
      external: null,
    });
    assert.equal(speakEffective({ rate: 3 }).rate, 1);
    // This machine's two arrive from speak-local.json, not the settings.
    assert.equal(speakEffective(undefined, { voicesDir: "/v", external: null }).voicesDir, "/v");
  });
});

describe("what is spoken", () => {
  it("furigana is spoken as its base, once — never base and reading", () => {
    assert.equal(speakFurigana("{漢字|かん|じ}を読む"), "漢字を読む");
    assert.equal(speakFurigana("{東京|とうきょう}"), "東京");
    assert.equal(speakFurigana("no ruby"), "no ruby");
  });
  it("a note is read as prose: no frontmatter, code, markup or footnote marks", () => {
    const said = speechTextOfNote(
      "---\nlang: fr\n---\n# Title\n\nSome **bold** and [[Link|alias]] with {漢字|かん|じ} and `code`[^1].\n\n```js\nlet x = 1;\n```\n\n> [!note] Callout\n> body\n\n[^1]: the note\n",
    );
    assert.ok(!said.includes("lang:"));
    assert.ok(!said.includes("let x"));
    assert.ok(!said.includes("**"));
    assert.ok(!said.includes("[^1]"));
    assert.ok(!said.includes("[!note]"));
    assert.match(said, /Some bold and alias with 漢字 and/);
    assert.match(said, /Title/);
    assert.match(said, /Callout/);
  });
  it("closeSentence gives a bare word its language's full stop", () => {
    assert.equal(closeSentence("図書館", "ja"), "図書館。");
    assert.equal(closeSentence("grenouille", "fr"), "grenouille.");
    assert.equal(closeSentence("Déjà fini ?", "fr"), "Déjà fini ?");
    assert.equal(closeSentence("「はい」", "ja"), "「はい」");
    assert.equal(closeSentence("كتاب", "ar"), "كتاب.");
  });
});
