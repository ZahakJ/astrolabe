// THE MANUAL, ASSERTED. scripts/check-docs.mjs walks every link, anchor,
// image and "Settings → …" path in the docs, in both languages, and holds
// every page to having an Arabic twin with the same headings. This file runs
// the same function under `npm test`, so a pull request that renames a
// heading, moves a settings row or drops an Arabic page fails the suite
// rather than the reader — the gate and the suite are one implementation,
// driven from two doors, the way check-keymap and tests/keymap.test.ts are.
//
// The slug half is what makes the anchor check honest: `slugify` in
// scripts/build-docs.mjs is GitHub's rule, so an id the site gives a heading
// is the id GitHub gives it, and a link that resolves here resolves on both.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { headingIds, slugify } from "../scripts/build-docs.mjs";
import { checkDocs, checkStrings, FOREIGN_SETTINGS } from "../scripts/check-docs.mjs";

describe("the slug rule is GitHub's", () => {
  it("drops punctuation instead of hyphenating it", () => {
    assert.equal(slugify("Note direction & alignment"), "note-direction--alignment");
    assert.equal(slugify("`astrolabe.sty`"), "astrolabesty");
    assert.equal(slugify("Your editor&#39;s language is yours"), "your-editors-language-is-yours");
    assert.equal(slugify("1. Have a remote to push to"), "1-have-a-remote-to-push-to");
  });
  it("keeps Arabic letters and their harakat", () => {
    assert.equal(slugify("ماذا يمكن للسِّجِلّ؟"), "ماذا-يمكن-للسِّجِلّ");
    assert.equal(slugify("الخطوة 2: التنسيق"), "الخطوة-2-التنسيق");
  });
  it("numbers a repeated heading the way GitHub does", () => {
    const ids = headingIds("## Related\n\n## Related\n\n### Related\n").map((h) => h.id);
    assert.deepEqual(ids, ["related", "related-1", "related-2"]);
  });
  it("reads the rendered text of a heading, not its Markdown", () => {
    const ids = headingIds("## `npm run check-i18n` — the dictionary\n\n## [A link](x.md) and *emphasis*\n").map((h) => h.id);
    assert.deepEqual(ids, ["npm-run-check-i18n--the-dictionary", "a-link-and-emphasis"]);
  });
});

describe("the manual", () => {
  it("has no dead link, anchor, image or settings path, and every page in both languages", () => {
    const { errors } = checkDocs();
    assert.deepEqual(errors, []);
  });
});

// The interface's strings go through the same path rule (3.46.3): nine toasts
// and hints in each language still sent the reader to "Settings → Vault" and
// "Settings → Language & dates" pages that had been renamed.
describe("the interface's strings name real settings pages", () => {
  const entry = (en: string | null, ar: string | null) => ({ en, ar });
  it("fails a page that is gone, in either language", () => {
    const errors = checkStrings(new Map([
      ["stale", entry("Name one in Settings → Vault.", "حدّده في الإعدادات ← الخزانة.")],
      ...[...FOREIGN_SETTINGS.keys()].map((k) => [k, entry("Elsewhere: Settings → Somewhere", null)] as const),
    ]));
    assert.equal(errors.length, 2);
    assert.match(errors[0], /^client\/i18n\/en\.ts: stale: "Settings → Vault" names no settings tab/);
    assert.match(errors[1], /^client\/i18n\/ar\.ts: stale: "الإعدادات ← الخزانة" names no settings tab/);
  });
  it("fails a page name that runs on past the real one, and a row the page does not have", () => {
    const errors = checkStrings(new Map([
      ["merged", entry("(Settings → Language & dates → Read aloud)", null)],
      ["noRow", entry("Turn it on in Settings → Reading → Fonts.", null)],
      ...[...FOREIGN_SETTINGS.keys()].map((k) => [k, entry("Elsewhere: Settings → Somewhere", null)] as const),
    ]));
    assert.deepEqual(errors.map((e) => e.split(": ")[1]), ["merged", "noRow"]);
    assert.match(errors[0], /is not a page name \(the page is "Language"\)/);
    assert.match(errors[1], /names no row or group on the Reading tab/);
  });
  it("passes a page, a page and its row, and a page that runs on into prose", () => {
    const errors = checkStrings(new Map([
      ["page", entry("Name one in Settings → New notes & templates.", "حدّده في الإعدادات ← الملاحظات الجديدة والقوالب.")],
      ["row", entry("Turn it on in Settings → Reading → Feeds.", "شغّله من الإعدادات ← القراءة ← الخلاصات.")],
      ["prose", entry("Show them again in Settings → Writing.", null)],
      ...[...FOREIGN_SETTINGS.keys()].map((k) => [k, entry("Elsewhere: Settings → Somewhere", null)] as const),
    ]));
    assert.deepEqual(errors, []);
  });
  it("leaves another program's settings alone, and drops an exemption that has lost its reason", () => {
    const keys = [...FOREIGN_SETTINGS.keys()];
    const errors = checkStrings(new Map([
      [keys[0], entry("(Chrome: Settings → Languages → Spell check)", null)],
      ...keys.slice(1).map((k) => [k, entry("No path here any more.", null)] as const),
    ]));
    assert.equal(errors.length, keys.length - 1);
    for (const e of errors) assert.match(e, /carries no settings path; take it off FOREIGN_SETTINGS/);
  });
});
