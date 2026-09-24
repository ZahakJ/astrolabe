import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { estimateImage, estimateTable, knownHeight, noteColumnWidth, rememberHeight } from "../client/editor/widgetHeight.ts";

// A widget that tells CodeMirror nothing is estimated as ONE LINE, and a long
// note's scroller grew 32.6% under three flings because thirty tables were
// taken for thirty lines (client/editor/widgetHeight.ts).
describe("widget height estimates", () => {
  const table = [
    "| Term | Meaning | Note |",
    "|---|---|---|",
    ...Array.from({ length: 6 }, (_, i) => `| r${i} | idea thread came keeps | one note reader idea thread moves |`),
  ].join("\n");

  it("never takes a table for a line", () => {
    noteColumnWidth(370); // a phone's column
    const h = estimateTable(table);
    // Measured on a Pixel 7: 522px (header 36, six wrapped rows of 71).
    assert.ok(h > 400 && h < 650, `phone estimate ${h}`);
  });

  it("gets shorter as the column gets wider", () => {
    noteColumnWidth(370);
    const phone = estimateTable(table);
    noteColumnWidth(900);
    const desk = estimateTable(table);
    assert.ok(desk < phone, `${desk} < ${phone}`);
    assert.ok(desk >= 36 + 6 * 36, "every row is at least one line");
  });

  it("prefers what it measured", () => {
    rememberHeight("table:a.md:x", 512.4);
    assert.equal(knownHeight("table:a.md:x"), 512);
    rememberHeight("img:y:", 2); // a picture not arrived yet is not a height
    assert.equal(knownHeight("img:y:"), undefined);
  });

  it("guesses a picture at most of the column, and a sized one by its width", () => {
    noteColumnWidth(370);
    assert.ok(estimateImage(null) > 150);
    assert.ok(estimateImage(200) < estimateImage(null) + 1);
  });

  it("says it does not know when there is no table", () => {
    assert.equal(estimateTable("| a |"), -1);
  });
});
