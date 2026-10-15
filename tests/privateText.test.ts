// What a visitor is sent of a published note (shared/privateText.ts): the
// author-only comments taken out, everything else where it was.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripPrivateComments } from "../shared/privateText.ts";

describe("stripPrivateComments", () => {
  it("takes out an HTML comment and a %% comment, inline and across lines", () => {
    assert.equal(stripPrivateComments("a <!-- plan --> b"), "a  b");
    assert.equal(stripPrivateComments("a %%note%% b"), "a  b");
    assert.equal(stripPrivateComments("one\n<!-- plan\nstill plan -->\ntwo"), "one\n\n\ntwo");
    assert.equal(stripPrivateComments("one\n%%\nhidden\n%%\ntwo"), "one\n\n\n\ntwo");
  });

  it("keeps every line where it was", () => {
    const src = "# T\n\n<!-- a\nb\nc -->\npara ^id\n";
    const out = stripPrivateComments(src);
    assert.equal(out.split("\n").length, src.split("\n").length);
    assert.equal(out.split("\n")[5], "para ^id");
  });

  it("leaves code alone: a fence and an inline span show the marker", () => {
    const fenced = "```html\n<!-- shown -->\n```\nafter <!-- gone -->";
    assert.equal(stripPrivateComments(fenced), "```html\n<!-- shown -->\n```\nafter ");
    assert.equal(stripPrivateComments("write `<!-- x -->` to hide"), "write `<!-- x -->` to hide");
    assert.equal(stripPrivateComments("a ``%% b %%`` c"), "a ``%% b %%`` c");
  });

  it("leaves the frontmatter alone", () => {
    const src = '---\ntitle: "<!-- not a comment -->"\n---\nbody <!-- c -->';
    assert.equal(stripPrivateComments(src), '---\ntitle: "<!-- not a comment -->"\n---\nbody ');
  });

  it("returns a note with no comments untouched", () => {
    const src = "# Plain\n\nNothing to hide.";
    assert.equal(stripPrivateComments(src), src);
  });

  it("takes an unclosed comment to the end, as a renderer would hide it", () => {
    assert.equal(stripPrivateComments("shown\n<!-- never closed\nhidden"), "shown\n\n");
  });
});
