import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { folderMetaOf, folderNoteCandidates, folderOfNote } from "../shared/folderNote.ts";

describe("folder notes", () => {
  it("knows which notes describe their folder", () => {
    assert.equal(folderOfNote("Books/Feynman Lectures/Feynman Lectures.md"), "Books/Feynman Lectures");
    assert.equal(folderOfNote("Books/Feynman Lectures/index.md"), "Books/Feynman Lectures");
    assert.equal(folderOfNote("Books/Feynman Lectures/README.md"), "Books/Feynman Lectures");
    assert.equal(folderOfNote("Books/Feynman Lectures/Vortex lines.md"), null);
    assert.equal(folderOfNote("index.md"), null);
    assert.equal(folderNoteCandidates("Books/GEB")[0], "Books/GEB/GEB.md");
  });
  it("reads the folder's facts and ignores what it cannot use", () => {
    const meta = folderMetaOf({ description: " Fields, flows and the odd vortex. ", icon: "atom", cover: "attachments/f.jpg", library: "course", source: "https://x", hidden: true, title: "Feynman" });
    assert.deepEqual(meta, { title: "Feynman", description: "Fields, flows and the odd vortex.", icon: "atom", cover: "attachments/f.jpg", source: "https://x", library: "course", hidden: true });
    assert.deepEqual(folderMetaOf({ blurb: "B", banner: "x.png", library: true, icon: "not-a-glyph" }), { description: "B", cover: "x.png", library: "book" });
    assert.deepEqual(folderMetaOf({ library: "poem", hidden: "yes" }), {});
  });
});
