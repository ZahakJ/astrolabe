// What the settings panel and the status bar say the public can find.
//
// The incident: the owner's site ran the language filter on "follow" with the
// visitor switch on — the bilingual configuration the docs recommend — and the
// status bar read "5/107 public" all day, with the Publishing tab saying "5 of
// your 107 published notes are discoverable right now". The 102 English notes
// (every book and lecture note in the vault) were reachable by any reader who
// tapped EN; the count had simply been taken at the site language and called
// the rest hidden. A per-reader setting has no single "visible" number, and
// these tests pin the shape that admits it.
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { initIndexer } from "../server/indexer.ts";
import { patchSettings } from "../server/settings.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { isReducingReach, visibilityFor } from "../server/visibility.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

const data = makeDir();
const root = makeVault({
  "Quantum Computers.md": note({ publish: "true" }, "A quantum computer is not a faster Turing machine.\n"),
  "The Hammer Speaks.md": note({ publish: "true" }, "Why so hard? the charcoal once said to the diamond.\n"),
  "Nature of Mathematics.md": note({ publish: "true" }, "Necessary truth is the subject-matter, not the reward.\n"),
  "مقالة.md": note({ publish: "true" }, "فقرة عربية كاملة تكفي لتصنيف اللغة بلا لبس.\n"),
  "Draft.md": note({}, "Unpublished, and counted nowhere.\n"),
});

before(async () => {
  initSite({ ASTROLABE_DATA: data, SITE_LANG: "ar" });
  initVault(root);
  await initIndexer();
});

after(() => {
  removeVault(root);
  removeVault(data);
});

beforeEach(() => {
  patchSettings({ languageFilter: null, languageToggle: null, language: null });
});

describe("visibilityFor", () => {
  it("counts the whole published set under off", () => {
    const v = visibilityFor({ languageFilter: "off" });
    assert.equal(v.published, 4);
    assert.equal(v.visible, 4);
    assert.equal(v.hiddenByLanguage, 0);
    assert.equal(v.perReader, false);
    assert.equal(isReducingReach(v), false);
  });

  it("a pin really hides the other language from every visitor", () => {
    const v = visibilityFor({ languageFilter: "ar" });
    assert.equal(v.visible, 1);
    assert.equal(v.hiddenByLanguage, 3);
    assert.equal(v.perReader, false);
    assert.equal(isReducingReach(v), true, "three English notes nobody can find is worth the pill");
  });

  it("follow with the visitor switch hides nothing from everyone", () => {
    patchSettings({ languageToggle: true, language: "ar" });
    const v = visibilityFor({ languageFilter: "follow" });
    // The site-language count is still reported — it is what a reader who
    // never touches the switch gets — but it is not "what visitors see".
    assert.equal(v.visible, 1);
    assert.equal(v.filterLang, "ar");
    assert.equal(v.perReader, true);
    assert.equal(v.hiddenByLanguage, 0, "the Arabic reader's 1 and the English reader's 3 are the same 4 notes");
    assert.deepEqual(v.census, { arabic: 1, latin: 3, neutral: 0 });
    assert.equal(isReducingReach(v), false, "no standing warning for a site that is entirely reachable");
  });

  it("follow without the switch is a pin to the site language, and says so", () => {
    patchSettings({ languageToggle: false, language: "ar" });
    const v = visibilityFor({ languageFilter: "follow" });
    assert.equal(v.perReader, false);
    assert.equal(v.hiddenByLanguage, 3);
    assert.equal(isReducingReach(v), true);
  });
});
