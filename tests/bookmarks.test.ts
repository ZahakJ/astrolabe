import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addBookmark, isBookmarked, parseBookmarks, removeBookmark, reorderBookmarks } from "../shared/bookmarks.ts";

describe("Bookmarks.md", () => {
  const md = "# Bookmarks\n\n- [[Ledger]]\n- [[Books/Muqaddima|The Muqaddima]]\n\nNotes below the list.\n";
  it("reads the list lines and nothing else", () => {
    assert.deepEqual(parseBookmarks(md).map((b) => [b.target, b.label, b.line]), [["Ledger", null, 2], ["Books/Muqaddima", "The Muqaddima", 3]]);
  });
  it("adds after the last bookmark, once", () => {
    const next = addBookmark(md, "Journal/Today.md");
    assert.equal(next, "# Bookmarks\n\n- [[Ledger]]\n- [[Books/Muqaddima|The Muqaddima]]\n- [[Today]]\n\nNotes below the list.\n");
    assert.equal(addBookmark(next, "Journal/Today.md"), next);
    assert.equal(addBookmark("", "A.md"), "- [[A]]\n");
  });
  it("removes by path or title and keeps the prose", () => {
    assert.equal(removeBookmark(md, "Books/Muqaddima.md"), "# Bookmarks\n\n- [[Ledger]]\n\nNotes below the list.\n");
    assert.equal(isBookmarked(md, "Somewhere/Ledger.md"), true);
  });
  it("reorders the list lines in place, CRLF kept", () => {
    const crlf = "- [[A]]\r\n- [[B]]\r\n- [[C]]\r\n";
    assert.equal(reorderBookmarks(crlf, ["C", "A", "B"]), "- [[C]]\r\n- [[A]]\r\n- [[B]]\r\n");
  });
});
