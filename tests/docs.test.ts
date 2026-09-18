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
import { checkDocs } from "../scripts/check-docs.mjs";

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
