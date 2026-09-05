import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findQuote, foldMap, foldSpace, quoteAt } from "../shared/textQuote.ts";

describe("text quote anchors", () => {
  it("folds whitespace and bidi controls so a rewrapped paragraph still matches", () => {
    assert.equal(foldSpace("  a  b\n\tc "), "a b c");
    assert.equal(foldSpace("a‎b⁦c⁩"), "abc");
  });

  it("builds an anchor with context either side", () => {
    const text = "The quick brown fox jumps over the lazy dog. The end.";
    const a = quoteAt(text, 16, 19);
    assert.equal(a.quote, "fox");
    assert.equal(a.prefix, "The quick brown");
    assert.equal(a.suffix, "jumps over the lazy dog. The end.");
  });

  it("finds a lone quote, and the right one of two by its surroundings", () => {
    const text = "Alpha beta gamma. Delta beta epsilon.";
    assert.deepEqual(findQuote(text, { quote: "gamma", prefix: "", suffix: "" }), { start: 11, end: 16 });
    const second = findQuote(text, { quote: "beta", prefix: "Delta", suffix: "epsilon" });
    assert.deepEqual(second, { start: 24, end: 28 });
    const first = findQuote(text, { quote: "beta", prefix: "Alpha", suffix: "gamma" });
    assert.deepEqual(first, { start: 6, end: 10 });
    assert.equal(findQuote(text, { quote: "omega", prefix: "", suffix: "" }), null);
  });

  it("survives the words being reflowed", () => {
    const anchor = quoteAt("one two three four", 4, 13);
    assert.equal(anchor.quote, "two three");
    assert.deepEqual(findQuote("one\n  two\tthree   four", anchor), { start: 4, end: 13 });
  });

  it("maps folded offsets back to raw ones", () => {
    const { folded, raw } = foldMap("  ab  cd ");
    assert.equal(folded, "ab cd");
    assert.deepEqual(raw, [2, 3, 6, 6, 7]);
  });
});
