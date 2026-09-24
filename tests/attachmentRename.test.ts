// Renaming an attachment where it stands rewrites the notes that embed it
// (server/moveLinks.ts rewriteAttachmentRename, driven by
// POST /api/attachment/rename in server/renameRoutes.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rewriteAttachmentRename } from "../server/moveLinks.ts";

const always = (): boolean => true;

describe("rewriting the embeds of a renamed attachment", () => {
  it("rewrites basename embeds and links, widths and anchors intact", () => {
    const src = "![[old.png]]\n![[old.png|300]]\nsee [[old.png]]\n![[Old.PNG#x|200]]";
    assert.equal(
      rewriteAttachmentRename(src, "notes/n.md", "media/old.png", "media/new.png", always),
      "![[new.png]]\n![[new.png|300]]\nsee [[new.png]]\n![[new.png#x|200]]",
    );
  });

  it("keeps a path-form embed a path", () => {
    const src = "![[media/old.pdf#page=42|400]] and ![[other/old.pdf]]";
    assert.equal(
      rewriteAttachmentRename(src, "n.md", "media/old.pdf", "media/Book.pdf", always),
      "![[media/Book.pdf#page=42|400]] and ![[other/old.pdf]]",
    );
  });

  it("leaves a basename that meant a different file with the same name", () => {
    const src = "![[old.png]]";
    assert.equal(rewriteAttachmentRename(src, "n.md", "a/old.png", "a/new.png", () => false), src);
  });

  it("rewrites relative markdown destinations from the note's folder", () => {
    const src = '![alt](../media/old.png "t") and ![b](media/keep.png)';
    assert.equal(
      rewriteAttachmentRename(src, "notes/n.md", "media/old.png", "media/new.png", always),
      '![alt](../media/new.png "t") and ![b](media/keep.png)',
    );
  });

  it("touches nothing else", () => {
    const src = "# old.png\n![[older.png]] [[old]]";
    assert.equal(rewriteAttachmentRename(src, "n.md", "old.png", "new.png", always), src);
  });
});
