import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { foldersOf } from "../client/collections/foldersOf.ts";

describe("the client's reading of frontmatter folders", () => {
  it("reads a flow list, a block list, a comma scalar, a bare scalar and the singular key", () => {
    assert.deepEqual(foldersOf("---\nfolders: [games, long-reads]\n---\nx"), ["games", "long-reads"]);
    assert.deepEqual(foldersOf("---\ntitle: T\nfolders:\n  - games\n  - books\ntags: [x]\n---\n"), ["games", "books"]);
    assert.deepEqual(foldersOf("---\nfolders: games, books\n---\n"), ["games", "books"]);
    assert.deepEqual(foldersOf("---\nfolder: Games\n---\n"), ["games"]);
    assert.deepEqual(foldersOf("no frontmatter"), []);
    assert.deepEqual(foldersOf("---\nfolders: [/folder/games/, \"books\", not a slug!]\n---\n"), ["games", "books"]);
  });
});
