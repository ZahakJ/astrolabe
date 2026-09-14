// The export's link rewrite (shared/exportLinks.ts): wikilinks and embeds
// become relative Markdown links in the archive's COPIES, on exactly the
// terms the docs state — unresolvable targets stay as written, code is left
// alone, every other byte survives.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodeLinkPath, relativePath, rewriteWikilinks, type LinkResolver } from "../shared/exportLinks.ts";
import { wikilinkRegex } from "../server/indexer.ts";

/** A small vault: the resolver an export would build from the index. */
const VAULT: Record<string, string> = {
  other: "Other.md",
  "deep note": "Folder/Sub/Deep note.md",
  "cover.png": "Media/cover.png",
  "paper.pdf": "Media/paper.pdf",
  "فكرة": "ملاحظات/فكرة.md",
  self: "Folder/Self.md",
};
const resolve: LinkResolver = (target) => VAULT[target.toLowerCase()] ?? null;

describe("relativePath", () => {
  it("walks up and down between folders", () => {
    assert.equal(relativePath("Ideas.md", "Other.md"), "Other.md");
    assert.equal(relativePath("Ideas.md", "Media/cover.png"), "Media/cover.png");
    assert.equal(relativePath("Folder/Self.md", "Other.md"), "../Other.md");
    assert.equal(relativePath("Folder/Self.md", "Folder/Sub/Deep note.md"), "Sub/Deep note.md");
    assert.equal(relativePath("Folder/Sub/Deep note.md", "Media/cover.png"), "../../Media/cover.png");
    assert.equal(relativePath("Folder/Sub/Deep note.md", "Folder/Self.md"), "../Self.md");
  });
});

describe("encodeLinkPath", () => {
  it("encodes only what a link destination cannot carry bare", () => {
    assert.equal(encodeLinkPath("Folder/Sub/Deep note.md"), "Folder/Sub/Deep%20note.md");
    assert.equal(encodeLinkPath("a (b).md"), "a%20%28b%29.md");
    assert.equal(encodeLinkPath("100%.md"), "100%25.md");
    // Arabic stays readable: it is the whole point of the UTF-8 flag next door.
    assert.equal(encodeLinkPath("ملاحظات/فكرة.md"), "ملاحظات/فكرة.md");
  });
});

describe("rewriteWikilinks", () => {
  it("turns a wikilink into a relative Markdown link", () => {
    assert.equal(rewriteWikilinks("See [[Other]].", "Ideas.md", resolve), "See [Other](Other.md).");
    assert.equal(
      rewriteWikilinks("See [[Deep note|the deep one]].", "Ideas.md", resolve),
      "See [the deep one](Folder/Sub/Deep%20note.md).",
    );
    assert.equal(
      rewriteWikilinks("Up: [[Other]]", "Folder/Sub/Deep note.md", resolve),
      "Up: [Other](../../Other.md)",
    );
  });

  it("slugs a heading anchor the way the reading view ids it", () => {
    assert.equal(
      rewriteWikilinks("[[Other#My Heading!]]", "Ideas.md", resolve),
      "[Other#My Heading!](Other.md#my-heading)",
    );
    assert.equal(rewriteWikilinks("[[Other#My Heading|x]]", "Ideas.md", resolve), "[x](Other.md#my-heading)");
    // A block reference has no standard target; the link goes to the note.
    assert.equal(rewriteWikilinks("[[Other#^abc123]]", "Ideas.md", resolve), "[Other#^abc123](Other.md)");
    // Inside the same note only the anchor is needed.
    assert.equal(rewriteWikilinks("[[Self#Part two]]", "Folder/Self.md", resolve), "[Self#Part two](#part-two)");
  });

  it("keeps an embed an embed for a picture, and makes it a link for a note", () => {
    assert.equal(
      rewriteWikilinks("![[cover.png]]", "Ideas.md", resolve),
      "![cover.png](Media/cover.png)",
    );
    assert.equal(
      rewriteWikilinks("![[cover.png|The cover]]", "Folder/Self.md", resolve),
      "![The cover](../Media/cover.png)",
    );
    assert.equal(rewriteWikilinks("![[paper.pdf]]", "Ideas.md", resolve), "![paper.pdf](Media/paper.pdf)");
    assert.equal(rewriteWikilinks("![[Other]]", "Ideas.md", resolve), "[Other](Other.md)");
    assert.equal(rewriteWikilinks("![[Other#Part]]", "Ideas.md", resolve), "[Other#Part](Other.md#part)");
  });

  it("leaves an unresolvable target exactly as written", () => {
    const md = "A [[Nowhere]] and ![[missing.png]] and [[Other]].";
    assert.equal(rewriteWikilinks(md, "Ideas.md", resolve), "A [[Nowhere]] and ![[missing.png]] and [Other](Other.md).");
    assert.equal(rewriteWikilinks(md, "Ideas.md", () => null), md);
  });

  it("does not touch fences or inline code", () => {
    const md = [
      "Prose [[Other]] here.",
      "```md",
      "A fence with [[Other]] in it.",
      "```",
      "Inline `[[Other]]` stays, [[Other]] goes.",
      "~~~",
      "[[Other]]",
      "~~~",
      "````",
      "```",
      "[[Other]] still inside the four-tick fence",
      "````",
      "[[Other]]",
    ].join("\n");
    assert.equal(
      rewriteWikilinks(md, "Ideas.md", resolve),
      [
        "Prose [Other](Other.md) here.",
        "```md",
        "A fence with [[Other]] in it.",
        "```",
        "Inline `[[Other]]` stays, [Other](Other.md) goes.",
        "~~~",
        "[[Other]]",
        "~~~",
        "````",
        "```",
        "[[Other]] still inside the four-tick fence",
        "````",
        "[Other](Other.md)",
      ].join("\n"),
    );
  });

  it("keeps CRLF endings and every other byte", () => {
    const md = "---\r\ntitle: x\r\n---\r\n\r\nSee [[Other]]  \r\n\r\n  trailing\r\n";
    assert.equal(rewriteWikilinks(md, "Ideas.md", resolve), md.replace("[[Other]]", "[Other](Other.md)"));
  });

  it("keeps an Arabic path readable", () => {
    assert.equal(
      rewriteWikilinks("انظر [[فكرة]]", "Ideas.md", resolve),
      "انظر [فكرة](ملاحظات/فكرة.md)",
    );
  });

  it("matches the indexer's wikilink grammar", () => {
    // The two regexes are typed twice on purpose (shared/ must not import
    // server/); this pins them to the same answers on the shapes that matter.
    const cases = ["[[A]]", "[[A|b]]", "[[A#h]]", "[[A#h|b]]", "[[ A ]]", "[[A]] [[B]]", "[[]]", "[[A|b|c]]"];
    for (const text of cases) {
      const ours = [...text.matchAll(/(!?)\[\[([^[\]|#]+)(#[^[\]|]*)?(\|[^[\]]*)?\]\]/g)].map((m) => m[2]);
      const theirs = [...text.matchAll(wikilinkRegex())].map((m) => m[1]);
      assert.deepEqual(ours, theirs, text);
    }
  });
});
