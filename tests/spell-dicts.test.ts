// SPELLCHECK IN, in a browser (client/spellDicts.ts, shared/spellKnown.ts).
//
// The owner, on the dictionaries row: "for me it doesn't even show options I
// think? It just shows toggles." The row is one multi-select now, and what
// it offers is what the device can honestly check. In a browser — no app
// around the page — that is the four line languages the editor stamps,
// NONE checked until chosen (a page cannot see the browser's dictionaries),
// each named in the chrome's language. The desktop half is its own file
// (spell-dicts-desktop.test.ts): the module state is per process.

import "../client/i18n/both.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setLang } from "../client/i18n.ts";
import { DECLARABLE, dictionaryName, setBrowserDictionaries, spellOffer, storedDictionaries } from "../client/spellDicts.ts";
import { spellcheckKnown } from "../shared/spellKnown.ts";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});
const heard: unknown[] = [];
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { dispatchEvent: (e: CustomEvent) => heard.push(e.detail) },
});

/** THE REGRESSION: no chip without a name, in either chrome. A chip's words
 *  are its accessible name (it is a <button> with that text), so a chip
 *  whose label is empty, a bare code, or English in the Arabic chrome is an
 *  unlabelled control — the "just toggles" the owner saw. */
function assertNamed(codes: readonly string[]): void {
  for (const lang of ["en", "ar"] as const) {
    setLang(lang);
    for (const code of codes) {
      const name = dictionaryName(code as (typeof DECLARABLE)[number]);
      assert.ok(name.trim().length > 1, `${lang}: the ${code} chip has no name`);
      assert.notEqual(name.toLowerCase(), code, `${lang}: the ${code} chip is named by its code`);
      if (lang === "ar") assert.match(name, /[؀-ۿ]/, `ar: the ${code} chip is not named in Arabic ("${name}")`);
      else assert.doesNotMatch(name, /[؀-ۿ]/, `en: the ${code} chip is not named in English ("${name}")`);
    }
    const names = codes.map((c) => dictionaryName(c as (typeof DECLARABLE)[number]));
    assert.equal(new Set(names).size, names.length, `${lang}: two chips share a name`);
  }
  setLang("en");
}

describe("spellcheck in, in a browser", () => {
  it("offers the four line languages, each named in both chromes, none chosen yet", () => {
    const offer = spellOffer();
    assert.equal(offer.mode, "browser");
    assert.deepEqual(offer.offered, ["fr", "ar", "he", "fa"]);
    assert.deepEqual(offer.chosen, []);
    assertNamed(offer.offered);
    assert.equal(storedDictionaries(), null, "nothing stored until the reader chooses");
  });

  it("checks no line language until one is chosen", () => {
    for (const code of DECLARABLE) assert.equal(spellcheckKnown(code), false, `${code} is checked with nothing chosen`);
  });

  it("checks exactly the chosen ones, keeps the choice, and announces it", () => {
    setBrowserDictionaries(["fr", "ar"]);
    assert.equal(spellcheckKnown("fr"), true);
    assert.equal(spellcheckKnown("ar"), true);
    assert.equal(spellcheckKnown("he"), false);
    assert.deepEqual(storedDictionaries(), ["fr", "ar"]);
    assert.deepEqual(spellOffer().chosen, ["fr", "ar"]);
    assert.deepEqual(heard.at(-1), ["fr", "ar"]);
    // A language that is not a line language is never stored.
    setBrowserDictionaries(["fr", "xx", "ja"]);
    assert.deepEqual(storedDictionaries(), ["fr"]);
    // Unchoosing everything is a choice too — stored as empty, not forgotten.
    setBrowserDictionaries([]);
    assert.deepEqual(storedDictionaries(), []);
    assert.equal(spellcheckKnown("fr"), false);
  });
});
