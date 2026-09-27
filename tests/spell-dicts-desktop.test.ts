// SPELLCHECK IN, in the desktop app (client/spellDicts.ts, shared/spellKnown.ts).
//
// The desktop app used to draw no dictionaries row at all (`desktop() ===
// null` hid it) and enabled every dictionary it found behind the reader's
// back. Now the row lists exactly the line-language dictionaries Electron
// reports for this computer, all checked until the reader unticks one; and
// where there is nothing to choose — macOS, spelling switched off in the Edit
// menu, a computer with none of the four — it says so in one sentence and
// draws no control. The desktop's report is `setSpellcheckAvailable(tags,
// on)`, called from the hello in client/desktop/index.ts, fed here directly.

import "../client/i18n/both.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setLang } from "../client/i18n.ts";
import { dictionaryName, setBrowserDictionaries, spellOffer } from "../client/spellDicts.ts";
import { setSpellcheckAvailable, spellcheckKnown } from "../shared/spellKnown.ts";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});
Object.defineProperty(globalThis, "window", { configurable: true, value: { dispatchEvent: () => true } });

describe("spellcheck in, in the desktop app", () => {
  it("offers the dictionaries this computer has — by name, in both chromes — all checked until one is unticked", () => {
    // What Electron enabled on a Linux box: the instance's language and the
    // line languages it found (region-tagged, as Chromium names them).
    setSpellcheckAvailable(["en-US", "ar", "fr-FR", "de-DE"], true);
    const offer = spellOffer();
    assert.equal(offer.mode, "desktop");
    assert.deepEqual(offer.offered, ["fr", "ar"], "Hebrew and Persian have no dictionary here and are not offered");
    assert.deepEqual(offer.chosen, ["fr", "ar"]);
    for (const lang of ["en", "ar"] as const) {
      setLang(lang);
      for (const code of offer.offered) {
        const name = dictionaryName(code);
        assert.ok(name.trim().length > 1 && name.toLowerCase() !== code, `${lang}: the ${code} chip is unlabelled`);
      }
    }
    setLang("en");
    assert.equal(spellcheckKnown("fr"), true);
    assert.equal(spellcheckKnown("ar"), true);
    assert.equal(spellcheckKnown("he"), false, "no Hebrew dictionary: its lines are left alone");
  });

  it("stops checking a language the reader unticks, and remembers it", () => {
    setBrowserDictionaries(["fr"]);
    assert.equal(spellcheckKnown("fr"), true);
    assert.equal(spellcheckKnown("ar"), false);
    assert.deepEqual(spellOffer().chosen, ["fr"]);
    // A choice can never reach past what the computer has.
    setBrowserDictionaries(["fr", "he"]);
    assert.deepEqual(spellOffer().chosen, ["fr"]);
    assert.equal(spellcheckKnown("he"), false);
  });

  it("offers nothing, and says why, when there is nothing to choose", () => {
    setSpellcheckAvailable(["en-US"], true);
    assert.equal(spellOffer().mode, "none");
    setSpellcheckAvailable([], false);
    assert.equal(spellOffer().mode, "off");
    assert.equal(spellcheckKnown("fr"), false);
    setSpellcheckAvailable(["*"], true);
    assert.equal(spellOffer().mode, "system");
    assert.equal(spellcheckKnown("he"), true, "macOS: the system checker reads every line's lang");
    assert.deepEqual(spellOffer().offered, [], "no chips where the system decides");
  });
});
