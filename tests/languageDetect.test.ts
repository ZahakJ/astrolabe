// What a note's language is judged on: the prose a reader reads, never the
// author's own comments, the math, or a link's address (2026-11 purge, P1: an
// English `%% … %%` note-to-self tipped a published Arabic essay to English
// and took it off the Arabic site).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectArabic } from "../server/indexer.ts";

const ar = "هذه جملة عربية قصيرة في مقالة منشورة.";
const longEnglish = "This is a long private reminder to myself about sources still to check and a plan for the next part of this essay.";

describe("detectArabic reads the prose only", () => {
  it("ignores %% comments, inline and as a block", () => {
    assert.equal(detectArabic(`${ar}\n\n%% ${longEnglish} %%\n`), true);
    assert.equal(detectArabic(`${ar}\n\n%%\n${longEnglish}\n${longEnglish}\n%%\n`), true);
  });
  it("ignores HTML comments as before", () => {
    assert.equal(detectArabic(`${ar}\n<!-- ${longEnglish} -->`), true);
  });
  it("ignores math and a wikilink's target behind its alias", () => {
    assert.equal(detectArabic(`${ar} $\\forall x\\, Provable(x) \\rightarrow True(x)$\n\n$$\n\\int_0^\\infty f(x)\\,dx\n$$`), true);
    assert.equal(detectArabic(`${ar} [[Gödel's Incompleteness Theorems and Their Consequences|غودل]]`), true);
  });
  it("still calls an English note English, and a comment-only note unjudged", () => {
    assert.equal(detectArabic(`${longEnglish} ${ar}`), false);
    assert.equal(detectArabic(`%% ${longEnglish} %%`), null);
  });
});
