import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addBookmark, bookmarkKey, isBookmarked, parseBookmarks, removeBookmark, reorderBookmarks } from "../shared/bookmarks.ts";

describe("Bookmarks.md", () => {
  const md = "# Bookmarks\n\n- [[Ledger]]\n- [[Books/Muqaddima|The Muqaddima]]\n\nNotes below the list.\n";
  it("reads the list lines and nothing else", () => {
    assert.deepEqual(parseBookmarks(md).map((b) => [b.kind, b.target, b.label, b.line]), [["note", "Ledger", null, 2], ["note", "Books/Muqaddima", "The Muqaddima", 3]]);
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

describe("Bookmarks.md: headings and searches", () => {
  const md = "## Reading\n\n- [[Ledger#April|April's ledger]]\n- `tag:physics before:2026` Physics, older\n- `is:published`\n\n## Notes\n\n- [[Ledger]]\n- `` (not a search)\n";
  it("reads a heading bookmark with its anchor", () => {
    const [h] = parseBookmarks(md);
    assert.deepEqual([h.kind, h.target, h.heading, h.label, h.line], ["note", "Ledger", "April", "April's ledger", 2]);
  });
  it("reads a code span as a search, with or without a label", () => {
    const items = parseBookmarks(md);
    assert.deepEqual([items[1].kind, items[1].target, items[1].label], ["search", "tag:physics before:2026", "Physics, older"]);
    assert.deepEqual([items[2].kind, items[2].target, items[2].label], ["search", "is:published", null]);
    // An empty span is nothing; a group heading is prose.
    assert.equal(items.length, 4);
    assert.equal(items[3].target, "Ledger");
  });
  it("a heading bookmark is not the whole note", () => {
    const only = "- [[Ledger#April]]\n";
    assert.equal(isBookmarked(only, "Ledger.md"), false);
    assert.equal(addBookmark(only, "Ledger.md"), "- [[Ledger#April]]\n- [[Ledger]]\n");
    assert.equal(removeBookmark(only, "Ledger.md"), only);
    assert.equal(isBookmarked(md, "Ledger.md"), true);
    assert.equal(removeBookmark(md, "Ledger.md"), "## Reading\n\n- [[Ledger#April|April's ledger]]\n- `tag:physics before:2026` Physics, older\n- `is:published`\n\n## Notes\n\n- `` (not a search)\n");
  });
  it("keys tell a heading, a search and a note apart, and reorder by them", () => {
    const items = parseBookmarks(md);
    assert.deepEqual(items.map(bookmarkKey), ["Ledger#April", "`tag:physics before:2026`", "`is:published`", "Ledger"]);
    const next = reorderBookmarks(md, ["Ledger", "`is:published`", "Ledger#April", "`tag:physics before:2026`"]);
    assert.equal(next, "## Reading\n\n- [[Ledger]]\n- `is:published`\n- [[Ledger#April|April's ledger]]\n\n## Notes\n\n- `tag:physics before:2026` Physics, older\n- `` (not a search)\n");
  });
});
