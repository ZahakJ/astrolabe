// ONE HEADING CONTRACT — the editor's `[[Note#` offers, the outline, the
// anchor table and the reading view's ids are the same list.
//
// shared/headings.ts is the rule; this file holds four consumers to it on one
// note built to hit every seam that used to split them: frontmatter holding a
// YAML `# comment`, an indented heading, a closed-ATX heading, an alignment
// marker, a furigana reading, inline markdown, a heading inside a fence, and a
// repeated title.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { findAnchor, markdownAnchors, noteAnchors } from "../shared/anchors.ts";
import { findHeadingLine, HEADING_RE, headingTitle, isHeadingLine, scanHeadings } from "../shared/headings.ts";
import { extractHeadings as outline } from "../client/reading/toc.ts";

const NOTE = [
  "---",
  "# a YAML comment, not a heading",
  "title: Contract",
  "tags: [a]",
  "---",
  "# Contract",
  "",
  "   ## Indented three",
  "",
  "## Closed ##",
  "",
  "## Centred {.center}",
  "",
  "## {漢字|かんじ} reading",
  "",
  "## **Bold** and `code`",
  "",
  "```md",
  "## Fenced, not a heading",
  "```",
  "",
  "    ## Four spaces is code",
  "",
  "## Repeat",
  "",
  "## Repeat",
  "",
  "#notatag heading",
  "",
].join("\n");

/** What the editor's `[[Note#` completion offers: the anchor table's heading
 *  ids (client/editor/autocomplete.ts). */
const editorOffers = (md: string): string[] =>
  markdownAnchors(md).filter((a) => a.kind === "heading").map((a) => a.id);

const TITLES = ["Contract", "Indented three", "Closed", "Centred", "漢字 reading", "Bold and code", "Repeat", "Repeat"];
const IDS = ["contract", "indented-three", "closed", "centred", "漢字-reading", "bold-and-code", "repeat", "repeat-1"];

describe("the heading contract (shared/headings.ts)", () => {
  it("the shared scan finds exactly the headings, with the reading view's ids", () => {
    const all = scanHeadings(NOTE);
    assert.deepEqual(all.map((h) => h.title), TITLES);
    assert.deepEqual(all.map((h) => h.id), IDS);
  });

  it("the editor offers exactly the ids the outline and the reading view use", () => {
    assert.deepEqual(editorOffers(NOTE), IDS);
    assert.deepEqual(outline(NOTE).map((h) => h.text), TITLES);
    assert.deepEqual(outline(NOTE).map((h) => h.slug), IDS);
  });

  it("the anchor table files the same titles under the same ids, on the same lines", () => {
    const anchors = markdownAnchors(NOTE).filter((a) => a.kind === "heading");
    assert.deepEqual(anchors.map((a) => a.title), TITLES);
    assert.deepEqual(anchors.map((a) => a.id), IDS);
    assert.deepEqual(anchors.map((a) => a.line), scanHeadings(NOTE).map((h) => h.line));
    assert.deepEqual(anchors.map((a) => a.line), outline(NOTE).map((h) => h.line));
  });

  it("every offer lands: the editor and the anchor table resolve it to one line", () => {
    const anchors = noteAnchors("Contract.md", NOTE);
    for (const offer of new Set(editorOffers(NOTE))) {
      const inEditor = findHeadingLine(NOTE, offer);
      const inReader = findAnchor(anchors, offer)?.line ?? null;
      assert.notEqual(inEditor, null, `editor cannot land on ${offer}`);
      assert.equal(inEditor, inReader, `#${offer}`);
    }
  });

  it("a YAML `# comment` is never a heading, in any view", () => {
    const comment = "a YAML comment, not a heading";
    assert.ok(!editorOffers(NOTE).some((t) => t.includes("yaml")));
    assert.equal(findHeadingLine(NOTE, comment), null);
    assert.equal(findAnchor(noteAnchors("Contract.md", NOTE), comment), null);
  });

  it("one line shape: indent up to three, a space after the hashes, seven is not a heading", () => {
    assert.ok(isHeadingLine("# a"));
    assert.ok(isHeadingLine("   ###### a"));
    assert.ok(isHeadingLine("##\ta"));
    assert.ok(!isHeadingLine("    # code"));
    assert.ok(!isHeadingLine("#tag"));
    assert.ok(!isHeadingLine("####### seven"));
    assert.equal(headingTitle("Title {.right}"), "Title");
    assert.equal(headingTitle("Closed ##"), "Closed");
  });

  it("the reading renderer and the outline import the shared rule rather than keeping a copy", () => {
    const render = readFileSync(new URL("../client/reading/render.ts", import.meta.url), "utf8");
    const toc = readFileSync(new URL("../client/reading/toc.ts", import.meta.url), "utf8");
    assert.match(render, /import \{ HEADING_RE \} from "..\/..\/shared\/headings.ts"/);
    assert.doesNotMatch(render, /const HEADING_RE =/);
    assert.doesNotMatch(toc, /const HEADING_RE =/);
    assert.equal(HEADING_RE.source, "^ {0,3}(#{1,6})[ \\t]+(.*)$");
  });
});
