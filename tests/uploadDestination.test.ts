// A DROP ON THE TREE IS FILED WHERE IT WAS DROPPED; a paste into a note keeps
// the attachment setting. The owner dragged a PDF onto Library/ and found it
// in attachments/; later a friend dropped a folder of icons on a folder and
// found them all in attachments/ too. The location setting is for uploads
// that named no place. `uploadDestination` is that distinction as a function.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { uploadDestination, type AttachmentLocation } from "../shared/attachments.ts";

const specified: AttachmentLocation = { mode: "specified", folder: "attachments" };
const root: AttachmentLocation = { mode: "vault-root", folder: "" };
const sub: AttachmentLocation = { mode: "subfolder", folder: "_att" };

describe("uploadDestination", () => {
  it("files a dropped book in the folder it was dropped on, whatever the setting says", () => {
    for (const loc of [specified, root, sub]) {
      assert.equal(uploadDestination(loc, "Library", "pdf", true), "Library");
      assert.equal(uploadDestination(loc, "Books/Islamic", "pdf", true), "Books/Islamic");
    }
  });

  it("files a dropped image there too: the folder aimed at is the choice", () => {
    for (const loc of [specified, root, sub]) {
      assert.equal(uploadDestination(loc, "icons", "png", true), "icons");
      assert.equal(uploadDestination(loc, "Design/marks", "svg", true), "Design/marks");
    }
  });

  it("a file dropped on the tree's root is filed at the root", () => {
    assert.equal(uploadDestination(specified, "", "pdf", true), "");
    assert.equal(uploadDestination(specified, "", "png", true), "");
  });

  it("a paste into a note (not filed) keeps the attachment setting", () => {
    assert.equal(uploadDestination(specified, "Library", "png", false), "attachments");
    assert.equal(uploadDestination(specified, "Library", "pdf", false), "attachments");
    assert.equal(uploadDestination(root, "Library", "jpg", false), "");
    assert.equal(uploadDestination(sub, "Library", "webp", false), "Library/_att");
  });

  it("the context is tidied, never trusted, on the way to a folder", () => {
    assert.equal(uploadDestination(specified, "/icons/./", "png", true), "icons");
  });
});
