// A block says where it sits with a trailing `{.center}` (shared/blockAlign.ts).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockAlignOf, parseAlignMarker, stripAlignMarker, withAlignMarker } from "../shared/blockAlign.ts";

describe("block alignment markers", () => {
  it("reads the four words and their common spellings", () => {
    assert.deepEqual(parseAlignMarker("Hello {.center}"), { align: "center", start: 5 });
    assert.equal(parseAlignMarker("Hello {.centre}")?.align, "center");
    assert.equal(parseAlignMarker("Hello {.Centered}")?.align, "center");
    assert.equal(parseAlignMarker("Hello {.justified}")?.align, "justify");
    assert.equal(parseAlignMarker("Hello {.right}  ")?.align, "right");
    assert.equal(parseAlignMarker("Hello {.left}")?.align, "left");
    assert.equal(parseAlignMarker("Hello {.middle}"), null);
    assert.equal(parseAlignMarker("{.center} Hello"), null, "only at the end");
    assert.equal(parseAlignMarker("Hello {.center} more"), null);
  });

  it("strips and rewrites the marker without touching the words", () => {
    assert.equal(stripAlignMarker("عنوان {.right}"), "عنوان");
    assert.equal(withAlignMarker("Hello", "center"), "Hello {.center}");
    assert.equal(withAlignMarker("Hello {.left}", "right"), "Hello {.right}");
    assert.equal(withAlignMarker("Hello {.left}", null), "Hello");
    assert.equal(withAlignMarker("![[pic.png|300]]", "right"), "![[pic.png|300]] {.right}");
    assert.equal(withAlignMarker("", "center"), "{.center}");
  });

  it("a block takes its last line's marker, then its first line's", () => {
    assert.equal(blockAlignOf(["one", "two {.center}"]), "center");
    assert.equal(blockAlignOf(["one {.right}", "two"]), "right");
    assert.equal(blockAlignOf(["one {.right}", "two {.left}"]), "left");
    assert.equal(blockAlignOf(["one", "two"]), null);
    assert.equal(blockAlignOf([]), null);
  });
});
