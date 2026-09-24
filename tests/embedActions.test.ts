// An embed you can pick up (shared/embedActions.ts): the line arithmetic of a
// drag, the insertion into another note, the copy strings and the menu's
// availability matrix.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyChanges,
  embedCopyStrings,
  embedMenuActions,
  embedSpanNear,
  embedSpansIn,
  findEmbedInLines,
  insertEmbedEdit,
  isStandaloneEmbed,
  landEmbed,
  moveEmbedEdit,
  rebaseEmbedSource,
  removeEmbedEdit,
  type EmbedMenuContext,
} from "../shared/embedActions.ts";

function spanOf(doc: string, source: string): { from: number; to: number } {
  const from = doc.indexOf(source);
  assert.notEqual(from, -1, `${source} is in the doc`);
  return { from, to: from + source.length };
}

describe("finding embeds in source", () => {
  it("reads both syntaxes, with widths, anchors and titles kept whole", () => {
    const line = 'a ![[pic.png|300]] b ![[Book.pdf#page=42]] c ![alt](media/x.png "t") d';
    const spans = embedSpansIn(line, 10);
    assert.deepEqual(spans.map((s) => s.source), ["![[pic.png|300]]", "![[Book.pdf#page=42]]", '![alt](media/x.png "t")']);
    assert.equal(spans[0].from, 12);
    assert.equal(spans[2].wiki, false);
  });

  it("picks the embed nearest a position on its line, narrowed by name", () => {
    const doc = "intro\n![[a.png]] and ![[b.png]]\nend";
    const at = doc.indexOf("![[b.png]]");
    assert.equal(embedSpanNear(doc, at)?.source, "![[b.png]]");
    assert.equal(embedSpanNear(doc, doc.indexOf("![[a.png]]"))?.source, "![[a.png]]");
    assert.equal(embedSpanNear(doc, at, "a.png")?.source, "![[a.png]]");
    assert.equal(embedSpanNear(doc, 1), null);
  });

  it("finds an embed by its text inside a block's lines", () => {
    const doc = "![[x.png]]\n\npara ![[x.png]] here\n";
    const hit = findEmbedInLines(doc, "![[x.png]]", 2, 2);
    assert.equal(hit?.from, doc.indexOf("para ") + 5);
    assert.equal(findEmbedInLines(doc, "![[y.png]]", 0, 3), null);
  });

  it("knows a standalone line from a mid-sentence embed", () => {
    const doc = "  ![[pic.png|300]] {.center}\nsee ![[b.png]] here";
    assert.equal(isStandaloneEmbed(doc, spanOf(doc, "![[pic.png|300]]")), true);
    assert.equal(isStandaloneEmbed(doc, spanOf(doc, "![[b.png]]")), false);
  });
});

describe("moving an embed within its note", () => {
  const doc = "# Title\n\nFirst paragraph.\n\n![[pic.png|300]] {.center}\n\nSecond paragraph.\n\nLast.";

  it("moves the whole line, width and marker intact, above the drop line", () => {
    const edit = moveEmbedEdit(doc, spanOf(doc, "![[pic.png|300]]"), { pos: doc.indexOf("First") });
    assert.ok(edit);
    const next = applyChanges(doc, edit.changes);
    assert.equal(next, "# Title\n\n![[pic.png|300]] {.center}\n\nFirst paragraph.\n\nSecond paragraph.\n\nLast.");
    assert.equal(next.slice(edit.at, edit.at + 16), "![[pic.png|300]]");
  });

  it("moves it below the drop line when the drop is in the line's second half", () => {
    const edit = moveEmbedEdit(doc, spanOf(doc, "![[pic.png|300]]"), { pos: doc.indexOf("Last.") + 5 });
    assert.ok(edit);
    const next = applyChanges(doc, edit.changes);
    assert.equal(next, "# Title\n\nFirst paragraph.\n\nSecond paragraph.\n\nLast.\n\n![[pic.png|300]] {.center}");
    assert.equal(next.slice(edit.at, edit.at + 16), "![[pic.png|300]]");
  });

  it("keeps a page anchor and moves to a line boundary from the reading view", () => {
    const d = "a\n\n![[Book.pdf#page=42|400]]\n\nb\n\nc";
    const edit = moveEmbedEdit(d, spanOf(d, "![[Book.pdf#page=42|400]]"), { line: 6, after: true });
    assert.ok(edit);
    assert.equal(applyChanges(d, edit.changes), "a\n\nb\n\nc\n\n![[Book.pdf#page=42|400]]");
  });

  it("does nothing for a drop on itself or on the boundary it already sits at", () => {
    const span = spanOf(doc, "![[pic.png|300]]");
    assert.equal(moveEmbedEdit(doc, span, { pos: span.from + 3 }), null);
    const lines = doc.split("\n");
    const own = lines.findIndex((l) => l.startsWith("![[pic"));
    assert.equal(moveEmbedEdit(doc, span, { line: own + 1, after: false }), null);
    assert.equal(moveEmbedEdit(doc, span, { line: own - 1, after: true }), null);
  });

  it("moves the last line of a note without leaving a stray newline", () => {
    const d = "one\ntwo\n![[z.png]]";
    const edit = moveEmbedEdit(d, spanOf(d, "![[z.png]]"), { pos: 0 });
    assert.ok(edit);
    assert.equal(applyChanges(d, edit.changes), "![[z.png]]\n\none\ntwo");
    assert.equal(edit.at, 0);
  });

  it("moves a mid-sentence embed as its own text, to the exact drop position", () => {
    const d = "see ![[b.png]] here and there";
    const drop = d.indexOf("there");
    const edit = moveEmbedEdit(d, spanOf(d, "![[b.png]]"), { pos: drop });
    assert.ok(edit);
    const next = applyChanges(d, edit.changes);
    assert.equal(next, "see  here and ![[b.png]]there");
    assert.equal(next.slice(edit.at, edit.at + 10), "![[b.png]]");
  });

  it("leaves one blank line where the paragraph was, and adds none twice", () => {
    const d = "A\n\n![[x.png]]\n\nB\n\nC\n";
    const span = spanOf(d, "![[x.png]]");
    const down = moveEmbedEdit(d, span, { line: 4, after: true });
    assert.ok(down);
    assert.equal(applyChanges(d, down.changes), "A\n\nB\n\n![[x.png]]\n\nC\n");
    const end = moveEmbedEdit(d, span, { line: 99, after: true });
    assert.ok(end);
    assert.equal(applyChanges(d, end.changes), "A\n\nB\n\nC\n\n![[x.png]]\n");
    // Before B is where it already is, a blank line away: nothing to do.
    assert.equal(moveEmbedEdit(d, span, { line: 4, after: false }), null);
  });

  it("is one change set against the original document", () => {
    const edit = moveEmbedEdit(doc, spanOf(doc, "![[pic.png|300]]"), { pos: 0 });
    assert.ok(edit);
    assert.equal(edit.changes.length, 2);
    assert.ok(edit.changes[0].from <= edit.changes[1].from, "sorted");
  });
});

describe("dropping an embed into another note", () => {
  it("inserts the reference as a paragraph of its own at the nearest boundary", () => {
    const d = "alpha\nbeta";
    const before = insertEmbedEdit(d, { pos: 0 }, "![[pic.png|300]]");
    assert.equal(applyChanges(d, before.changes), "![[pic.png|300]]\n\nalpha\nbeta");
    const after = insertEmbedEdit(d, { pos: d.length }, "![[pic.png|300]]");
    const next = applyChanges(d, after.changes);
    assert.equal(next, "alpha\nbeta\n\n![[pic.png|300]]");
    assert.equal(next.slice(after.at, after.at + 3), "![[");
  });

  it("lands on an empty line without doubling the blank lines, and fills an empty note", () => {
    const d = "alpha\n\nbeta";
    const e = insertEmbedEdit(d, { pos: 6 }, "![[x.pdf]]");
    assert.equal(applyChanges(d, e.changes), "alpha\n\n![[x.pdf]]\n\nbeta");
    assert.equal(applyChanges("", insertEmbedEdit("", { pos: 0 }, "![[x.pdf]]").changes), "![[x.pdf]]");
  });

  it("carries wikilink embeds as written and re-bases relative markdown paths", () => {
    assert.equal(rebaseEmbedSource("![[pic.png|300]]", "a/n.md", "b/m.md"), "![[pic.png|300]]");
    assert.equal(rebaseEmbedSource("![x](media/a.png)", "notes/n.md", "notes/m.md"), "![x](media/a.png)");
    assert.equal(rebaseEmbedSource("![x](media/a.png)", "notes/n.md", "other/deep/m.md"), "![x](../../notes/media/a.png)");
    assert.equal(rebaseEmbedSource("![x](../media/my%20pic.png)", "notes/n.md", "m.md"), "![x](media/my%20pic.png)");
    assert.equal(rebaseEmbedSource("![x](https://e.org/a.png)", "a/n.md", "m.md"), "![x](https://e.org/a.png)");
    assert.equal(rebaseEmbedSource("![x](/media/a.png)", "a/n.md", "m.md"), "![x](/media/a.png)");
  });
});

describe("landing a lifted embed", () => {
  it("moves within the note it came from, found by the reading view's block lines", () => {
    const d = "# T\n\n![[a.png]]\n\nText.\n";
    const edit = landEmbed(d, "n.md", { note: "n.md", source: "![[a.png]]", span: null, lines: [2, 2] }, { line: 4, after: true });
    assert.ok(edit);
    assert.equal(applyChanges(d, edit.changes), "# T\n\nText.\n\n![[a.png]]\n");
  });

  it("finds a stale editor span by the text, and inserts into another note re-based", () => {
    const d = "x\n\n![a](m/a.png)\n";
    const stale = landEmbed(d, "n/n.md", { note: "n/n.md", source: "![a](m/a.png)", span: { from: 0, to: 3 }, lines: null }, { pos: 0 });
    assert.ok(stale);
    assert.equal(applyChanges(d, stale.changes), "![a](m/a.png)\n\nx\n");
    const other = "Other note.";
    const ins = landEmbed(other, "o.md", { note: "n/n.md", source: "![a](m/a.png)", span: null, lines: null }, { pos: other.length });
    assert.ok(ins);
    assert.equal(applyChanges(other, ins.changes), "Other note.\n\n![a](n/m/a.png)");
  });
});

describe("removing an embed", () => {
  it("takes the line when the embed stood alone, one space when it did not", () => {
    const d = "a\n![[x.png]] {.center}\nb";
    assert.equal(applyChanges(d, removeEmbedEdit(d, spanOf(d, "![[x.png]]")).changes), "a\nb");
    const p = "a\n\n![[x.png]]\n\nb";
    assert.equal(applyChanges(p, removeEmbedEdit(p, spanOf(p, "![[x.png]]")).changes), "a\n\nb");
    const s = "see ![[x.png]] here";
    assert.equal(applyChanges(s, removeEmbedEdit(s, spanOf(s, "![[x.png]]")).changes), "see here");
  });
});

describe("the copy strings", () => {
  it("is the source exactly, the vault path, and the absolute file URL", () => {
    const got = embedCopyStrings("![[My pic.png|300]]", "media/My pic.png", "http://127.0.0.1:4000/");
    assert.equal(got.markdown, "![[My pic.png|300]]");
    assert.equal(got.path, "media/My pic.png");
    assert.equal(got.link, "http://127.0.0.1:4000/api/file?path=media%2FMy%20pic.png");
    assert.deepEqual(embedCopyStrings("![[gone.png]]", null, "http://x"), { markdown: "![[gone.png]]", path: null, link: null });
  });
});

describe("the menu's availability matrix", () => {
  const owner: EmbedMenuContext = {
    kind: "image",
    admin: true,
    resolved: true,
    clipboardImage: true,
    clipboardText: true,
    canEdit: true,
    touch: false,
  };

  it("offers the owner every row a picture has, grouped", () => {
    assert.deepEqual(embedMenuActions(owner), [
      "copyImage", "copyLink", "copyMarkdown", "copyPath", null,
      "open", "reveal", "saveAs", null,
      "rename", null,
      "remove",
    ]);
  });

  it("gives a PDF page its Go to page, and a file card no Copy image", () => {
    assert.ok(embedMenuActions({ ...owner, kind: "pdfpage" }).includes("goToPage"));
    const card = embedMenuActions({ ...owner, kind: "file" });
    assert.ok(!card.includes("copyImage"));
    assert.ok(!card.includes("goToPage"));
    assert.ok(card.includes("copyLink"));
  });

  it("shows a visitor only Copy link, Open and Save as", () => {
    const rows = embedMenuActions({ ...owner, admin: false, canEdit: false }).filter((r) => r !== null);
    assert.deepEqual(rows, ["copyLink", "open", "saveAs"]);
  });

  it("drops what the platform cannot do", () => {
    const noImage = embedMenuActions({ ...owner, clipboardImage: false });
    assert.ok(!noImage.includes("copyImage"));
    const noClip = embedMenuActions({ ...owner, clipboardImage: false, clipboardText: false });
    assert.ok(!noClip.some((r) => r !== null && r.startsWith("copy")));
  });

  it("keeps Remove and Copy as Markdown for a broken embed, and nothing that needs the file", () => {
    const rows = embedMenuActions({ ...owner, resolved: false }).filter((r) => r !== null);
    assert.deepEqual(rows, ["copyMarkdown", "remove"]);
  });

  it("gives a finger Move… and no Reveal, and never renames a drawing", () => {
    const phone = embedMenuActions({ ...owner, touch: true });
    assert.ok(phone.includes("move"));
    assert.ok(!phone.includes("reveal"));
    assert.ok(!embedMenuActions({ ...owner, kind: "drawing" }).includes("rename"));
    assert.ok(!embedMenuActions({ ...owner, canEdit: false }).includes("remove"));
  });

  it("never starts or ends on a separator, nor doubles one", () => {
    for (const kind of ["image", "file", "pdfpage", "drawing", "audio"] as const) {
      for (const admin of [true, false]) {
        const rows = embedMenuActions({ ...owner, kind, admin });
        assert.notEqual(rows[0], null);
        assert.notEqual(rows[rows.length - 1], null);
        for (let i = 1; i < rows.length; i++) assert.ok(!(rows[i] === null && rows[i - 1] === null));
      }
    }
  });
});
