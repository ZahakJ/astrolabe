// A wikilink written as code is an example, not a link (2026-11 purge, N5:
// "Write `![[Welcome]]` …" was a second backlink to Welcome).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseLinks } from "../shared/noteParse.ts";

const targets = (body: string) => parseLinks(body).map((l) => l.target);

describe("parseLinks and inline code", () => {
  it("skips a link inside a code span, keeps the ones around it", () => {
    assert.deepEqual(targets("Write `![[Welcome]]` and see [[Real]]"), ["Real"]);
    assert.deepEqual(targets("[[A]] `code` [[B]]"), ["A", "B"]);
    assert.deepEqual(targets("``a `[[X]]` b`` [[Y]]"), ["Y"]);
  });
  it("treats an unclosed backtick as text", () => {
    assert.deepEqual(targets("`unclosed [[Z]]"), ["Z"]);
  });
  it("still reads links in the app's own fences", () => {
    assert.deepEqual(targets("```sigil\nitems: read [[Kana]]\n```"), ["Kana"]);
  });
});
