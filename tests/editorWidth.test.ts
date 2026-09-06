// The custom writing-column width (client/editorWidth.ts normalizeCustomWidth).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCustomWidth } from "../client/editorWidth.ts";

describe("a custom column width", () => {
  it("reads pixels, with or without the unit, inside 320–2400", () => {
    assert.equal(normalizeCustomWidth("900"), "900px");
    assert.equal(normalizeCustomWidth(" 1000px "), "1000px");
    assert.equal(normalizeCustomWidth("100"), null);
    assert.equal(normalizeCustomWidth("5000"), null);
  });
  it("reads a share of the pane inside 30–100 %", () => {
    assert.equal(normalizeCustomWidth("70%"), "70%");
    assert.equal(normalizeCustomWidth("100 %"), "100%");
    assert.equal(normalizeCustomWidth("10%"), null);
  });
  it("refuses anything else", () => {
    assert.equal(normalizeCustomWidth("wide"), null);
    assert.equal(normalizeCustomWidth("50em"), null);
    assert.equal(normalizeCustomWidth(""), null);
  });
});
