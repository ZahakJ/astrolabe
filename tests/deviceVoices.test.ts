// Which of the device's own voices reads, when the app's cannot
// (client/speech/deviceVoices.ts) — driven with the voice lists real
// platforms hand a page.
//
// The Windows list is the one a reader reported: French (France) with
// Microsoft Paul chosen in Windows Settings → Speech, and the app reading with
// a woman's voice. Chromium enumerates the registry in order and marks the
// FIRST voice of the whole list `default` (speech_synthesis_impl.cc:
// `is_default = (i == 0)`), so the page is never told about Paul; what the app
// can do is choose predictably, name the voice, and remember the reader's ▾.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultMarkIsReal,
  localeName,
  pickVoice,
  primaryLang,
  voicesFor,
  voiceShortName,
  type VoiceLike,
} from "../client/speech/deviceVoices.ts";

const v = (name: string, lang: string, extra: Partial<VoiceLike> = {}): VoiceLike => ({
  name,
  lang,
  voiceURI: name,
  default: false,
  localService: true,
  ...extra,
});

// Chromium on Windows: OneCore voices by registry order; the first is marked.
const WINDOWS: VoiceLike[] = [
  v("Microsoft David - English (United States)", "en-US", { default: true }),
  v("Microsoft Mark - English (United States)", "en-US"),
  v("Microsoft Zira - English (United States)", "en-US"),
  v("Microsoft Hortense - French (France)", "fr-FR"),
  v("Microsoft Julie - French (France)", "fr-FR"),
  v("Microsoft Paul - French (France)", "fr-FR"),
  v("Microsoft Caroline - French (Canada)", "fr-CA"),
];

// Chrome on Android: Google's engine, locale-named voices, the system's
// default marked; some builds spell the tag with an underscore.
const ANDROID: VoiceLike[] = [
  v("English United States", "en-US", { voiceURI: "en-us-x-sfg-local" }),
  v("Français France", "fr-FR", { voiceURI: "fr-fr-x-frb-local" }),
  v("Français France 2", "fr_FR", { voiceURI: "fr-fr-x-frd-network", localService: false }),
  v("العربية", "ar", { voiceURI: "ar-xa-x-arz-local", default: true }),
  v("日本語 日本", "ja-JP", { voiceURI: "ja-jp-x-jab-local" }),
];

// Safari / Chrome on macOS: the system voice for the user's language is the
// marked one, and it is really the system's.
const MACOS: VoiceLike[] = [
  v("Samantha", "en-US"),
  v("Daniel", "en-GB"),
  v("Thomas", "fr-FR", { default: true }),
  v("Amélie", "fr-CA"),
  v("Kyoko", "ja-JP"),
  v("Majed", "ar-001"),
  v("Google français", "fr-FR", { localService: false }),
];

describe("the language of a voice", () => {
  it("is its primary subtag, whatever the spelling", () => {
    assert.equal(primaryLang("fr-FR"), "fr");
    assert.equal(primaryLang("fr_FR"), "fr");
    assert.equal(primaryLang("AR-001"), "ar");
    assert.equal(primaryLang("fil"), "fil");
  });

  it("lists a language's voices by locale, then name", () => {
    assert.deepEqual(
      voicesFor(WINDOWS, "fr").map((x) => voiceShortName(x)),
      ["Microsoft Caroline", "Microsoft Hortense", "Microsoft Julie", "Microsoft Paul"],
    );
    assert.deepEqual(voicesFor(WINDOWS, "ar"), []);
    assert.equal(voicesFor(ANDROID, "fr").length, 2, "fr_FR counts as French");
  });
});

describe("a Windows-shaped list", () => {
  const trustDefault = defaultMarkIsReal("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Electron/40");

  it("does not trust Chromium's default mark there", () => {
    assert.equal(trustDefault, false);
    assert.equal(defaultMarkIsReal("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)"), true);
    assert.equal(defaultMarkIsReal("Mozilla/5.0 (Linux; Android 15)"), true);
  });

  it("reads French in the reader's own locale, predictably — and says which", () => {
    const got = pickVoice(WINDOWS, "fr", { locales: ["fr-FR", "ar"], trustDefault });
    assert.equal(got?.lang, "fr-FR", "fr-FR over fr-CA for a reader in France");
    assert.equal(voiceShortName(got!), "Microsoft Hortense");
  });

  it("reads with Microsoft Paul once the reader chose him, and remembers it by URI or name", () => {
    assert.equal(pickVoice(WINDOWS, "fr", { chosen: "Microsoft Paul - French (France)", trustDefault })?.name, "Microsoft Paul - French (France)");
  });

  it("ignores a remembered voice that speaks another language, or is gone", () => {
    assert.equal(pickVoice(WINDOWS, "fr", { chosen: "Microsoft Mark - English (United States)", locales: ["fr-FR"], trustDefault })?.lang, "fr-FR");
    assert.equal(pickVoice(WINDOWS, "fr", { chosen: "Microsoft Nobody", locales: ["fr-FR"], trustDefault })?.lang, "fr-FR");
  });

  it("in the desktop app, reads with the voice Windows' Settings chose (read from the registry)", () => {
    const system = "Microsoft Paul - French (France)";
    assert.equal(voiceShortName(pickVoice(WINDOWS, "fr", { system, locales: ["fr-FR"], trustDefault })!), "Microsoft Paul");
    // Honoured for its own language only: English is still chosen as before.
    assert.equal(pickVoice(WINDOWS, "en", { system, locales: ["en-US"], trustDefault })?.lang, "en-US");
    // The reader's own choice still wins over the system's.
    assert.equal(voiceShortName(pickVoice(WINDOWS, "fr", { system, chosen: "Microsoft Julie - French (France)", trustDefault })!), "Microsoft Julie");
    // SAPI's name for a voice ("… Desktop - …") finds the OneCore one.
    assert.equal(voiceShortName(pickVoice(WINDOWS, "en", { system: "Microsoft Zira Desktop - English (United States)", trustDefault })!), "Microsoft Zira");
  });

  it("has no voice for Arabic or Japanese: state (c)", () => {
    assert.equal(pickVoice(WINDOWS, "ar", { trustDefault }), null);
    assert.equal(pickVoice(WINDOWS, "ja", { trustDefault }), null);
  });
});

describe("an Android-shaped list", () => {
  it("takes the marked default when it speaks the language", () => {
    assert.equal(pickVoice(ANDROID, "ar", { trustDefault: true })?.voiceURI, "ar-xa-x-arz-local");
  });

  it("prefers a voice on the device over a network one", () => {
    assert.equal(pickVoice(ANDROID, "fr", { locales: ["fr-FR"], trustDefault: true })?.voiceURI, "fr-fr-x-frb-local");
  });
});

describe("a macOS-shaped list", () => {
  it("takes the system's own voice for the language", () => {
    assert.equal(pickVoice(MACOS, "fr", { locales: ["en-US"], trustDefault: true })?.name, "Thomas");
  });

  it("with no mark, the reader's locale and then a local voice", () => {
    assert.equal(pickVoice(MACOS, "en", { locales: ["en-GB"], trustDefault: true })?.name, "Daniel");
    assert.equal(pickVoice(MACOS, "ar", { trustDefault: true })?.name, "Majed");
  });

  it("never picks the network voice while a local one speaks the language", () => {
    const got = pickVoice(MACOS.filter((x) => x.name !== "Thomas"), "fr", { locales: ["fr-FR"], trustDefault: true });
    assert.equal(got?.name, "Amélie");
  });
});

describe("no voices at all (a Linux desktop app)", () => {
  it("answers null for every language", () => {
    for (const lang of ["en", "fr", "ar", "ja"]) assert.equal(pickVoice([], lang), null);
    assert.deepEqual(voicesFor([], "fr"), []);
  });
});

describe("the names the player shows", () => {
  it("drops the language Windows appends, and leaves other names alone", () => {
    assert.equal(voiceShortName({ name: "Microsoft Paul - French (France)" }), "Microsoft Paul");
    assert.equal(voiceShortName({ name: "Microsoft Hortense Desktop - French" }), "Microsoft Hortense Desktop - French");
    assert.equal(voiceShortName({ name: "Thomas" }), "Thomas");
    assert.equal(voiceShortName({ name: "fr-fr-x-frb-local" }), "fr-fr-x-frb-local");
  });

  it("names a locale in the reader's language", () => {
    assert.equal(localeName("fr-FR", "en"), "French (France)");
    assert.equal(localeName("fr", "en"), "French");
    assert.match(localeName("fr", "ar"), /الفرنسية/);
  });
});
