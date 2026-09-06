// PUBLIC FOLDERS — membership (frontmatter `folders:`) and the shapes that
// carry it (shared/publicFolders.ts).
//
// The feature's whole promise is that an author declares a folder ONCE, in
// settings, and then joins notes to it by typing one line in the note. That
// line is YAML, and YAML gives three different values for what an author reads
// as one list — the same trap `aliases:` fell into and the reason parseAliases
// is tolerant. So the cases below are driven through the real indexer and read
// off PostMeta, which is what the blog actually filters on: a test over the
// parser alone would pass while the field never reached the wire.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initIndexer, posts as postsRaw, publicFolderCounts } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import type { PostMeta } from "../shared/types.ts";
import {
  PUBLIC_FOLDERS_MAX,
  cleanPublicFolder,
  collectionsForPath,
  effectiveFolders,
  folderSlug,
  suggestSlug,
  vaultFolderPath,
} from "../shared/publicFolders.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

const files: Record<string, string> = {
  // The three spellings of one list, plus the singular key.
  "Flow.md": note({ publish: "true", folders: "[games, books]" }, "# Flow\n\nProse.\n"),
  "Block.md": `---\npublish: true\nfolders:\n  - games\n  - films\n---\n\n# Block\n\nProse.\n`,
  "Comma.md": note({ publish: "true", folders: "games, books" }, "# Comma\n\nProse.\n"),
  "Scalar.md": note({ publish: "true", folder: "books" }, "# Scalar\n\nProse.\n"),
  // Slugs are normalized on the way in: case, stray whitespace, a trailing
  // slash and a pasted `/folder/` prefix all mean the folder they name.
  "Sloppy.md": note({ publish: "true", folders: "[ Games , /folder/books/ ]" }, "# Sloppy\n\nProse.\n"),
  // Nothing usable: an empty value, a space inside, a traversal.
  "Junk.md": note({ publish: "true", folders: "[\"a b\", \"..\", \"\"]" }, "# Junk\n\nProse.\n"),
  "Bare.md": note({ publish: "true" }, "# Bare\n\nProse.\n"),
  // A .tex note joins from its COMMENT block — the readNoteFrontmatter path.
  "Paper.tex": "%---\n% publish: true\n% folders: [games, papers]\n%---%\n\\section{Paper}\nProse.\n",
  // Unpublished: a member of `games` that no visitor may count.
  "Draft.md": note({ folders: "games" }, "# Draft\n\nProse.\n"),
};

const data = makeDir();
const root = makeVault(files);
let byPath: Map<string, PostMeta>;

before(async () => {
  initSite({ VELLUM_DATA: data });
  initVault(root);
  await initIndexer();
  byPath = new Map(postsRaw(false, null).map((p) => [p.path, p]));
});

after(() => {
  removeVault(root);
  removeVault(data);
});

const folders = (path: string): string[] | undefined => {
  const meta = byPath.get(path);
  assert.ok(meta, `${path} is not in posts()`);
  return meta.folders;
};

describe("frontmatter folders:", () => {
  it("reads a flow list, a block list, a comma scalar and a bare scalar", () => {
    assert.deepEqual(folders("Flow.md"), ["games", "books"]);
    assert.deepEqual(folders("Block.md"), ["games", "films"]);
    assert.deepEqual(folders("Comma.md"), ["games", "books"]);
    // `folder:` (singular) is read too — one folder is the common case.
    assert.deepEqual(folders("Scalar.md"), ["books"]);
  });

  it("normalizes case, padding and a pasted /folder/ address", () => {
    assert.deepEqual(folders("Sloppy.md"), ["games", "books"]);
  });

  it("drops values that cannot be a slug, and keeps the key off a note with none", () => {
    assert.equal(folders("Junk.md"), undefined, "an unusable list became a membership");
    assert.equal(folders("Bare.md"), undefined, "a note with no key carries the field");
  });

  it("reads a .tex note's comment block, like every other frontmatter key", () => {
    assert.deepEqual(folders("Paper.tex"), ["games", "papers"]);
  });
});

describe("folder counts", () => {
  it("counts only PUBLISHED notes, and only the slugs asked for", () => {
    const counts = publicFolderCounts(["games", "books", "nobody"], false, null);
    // Flow, Block, Comma, Sloppy, Paper — Draft.md is unpublished.
    assert.equal(counts.get("games"), 5);
    assert.equal(counts.get("books"), 4);
    // A folder nobody has joined is zero, not absent: an empty collection is a
    // real card on the home band.
    assert.equal(counts.get("nobody"), 0);
    // `films` was never asked for, so it was never counted.
    assert.equal(counts.get("films"), undefined);
  });
});

describe("the slug rule", () => {
  it("accepts the set the URL and the frontmatter share, and nothing else", () => {
    assert.equal(folderSlug("games"), "games");
    assert.equal(folderSlug("  Long-Reads "), "long-reads");
    assert.equal(folderSlug("2026"), "2026");
    for (const bad of ["-leading", "a b", "..", "a/b", "", "أ", "x".repeat(61), 7, null]) {
      assert.equal(folderSlug(bad), null, `accepted ${JSON.stringify(bad)}`);
    }
  });

  it("suggests a slug from a title, and suggests NOTHING when it cannot", () => {
    assert.equal(suggestSlug("Long Reads"), "long-reads");
    assert.equal(suggestSlug("Games & Play!"), "games-play");
    // An Arabic title leaves the field empty rather than filling it with
    // hyphens — the editor then waits for a slug instead of inventing one.
    assert.equal(suggestSlug("ألعاب"), "");
  });
});

describe("one stored row", () => {
  const id = (): string => "fixed";

  it("keeps what it can use and refuses what it cannot", () => {
    const good = cleanPublicFolder(
      { id: "abc", slug: "Games", title: "  Games  ", icon: "gamepad", description: " Play " },
      id,
    );
    assert.deepEqual(good, { id: "abc", slug: "games", title: "Games", icon: "gamepad", description: "Play" });
    // A row with no id gets one — the list is React keys and reorder.
    assert.equal(cleanPublicFolder({ slug: "a", title: "A", icon: "book" }, id)?.id, "fixed");
    for (const bad of [
      { slug: "a", title: "A", icon: "bookshelf" }, // not in the closed set
      { slug: "a b", title: "A", icon: "book" },
      { slug: "a", title: "", icon: "book" },
      { slug: "a", title: "A", icon: "book", description: "x".repeat(201) },
      null,
      "games",
    ]) {
      assert.equal(cleanPublicFolder(bad, id), null, `accepted ${JSON.stringify(bad)}`);
    }
  });

  it("carries `hidden` only when it is exactly true", () => {
    assert.equal(cleanPublicFolder({ slug: "a", title: "A", icon: "book", hidden: true }, id)?.hidden, true);
    assert.equal(
      cleanPublicFolder({ slug: "a", title: "A", icon: "book", hidden: "yes" }, id)?.hidden,
      undefined,
      "a truthy non-boolean took a folder off the site",
    );
  });

  it("caps the list at a number the nav row can actually carry", () => {
    assert.equal(PUBLIC_FOLDERS_MAX, 12);
  });
});

describe("folder-backed collections", () => {
  it("normalises a vault folder and refuses what cannot be one", () => {
    assert.equal(vaultFolderPath(" Books/Feynman/ "), "Books/Feynman");
    assert.equal(vaultFolderPath("Books\\Feynman"), "Books/Feynman");
    assert.equal(vaultFolderPath("/"), null);
    assert.equal(vaultFolderPath("a/../b"), null);
    assert.equal(vaultFolderPath(""), null);
    assert.equal(vaultFolderPath(42), null);
  });
  it("keeps a row's folder, dropping one that cannot name a folder", () => {
    const row = cleanPublicFolder({ slug: "games", title: "Games", icon: "gamepad", folder: "Play/Games/" }, () => "x");
    assert.equal(row?.folder, "Play/Games");
    const bare = cleanPublicFolder({ slug: "games", title: "Games", icon: "gamepad", folder: "../x" }, () => "x");
    assert.equal(bare?.folder, undefined);
  });
  it("puts a note in every collection whose folder holds it, boundary at the slash", () => {
    const rows = [
      { id: "a", slug: "games", title: "G", icon: "gamepad" as const, folder: "Play/Games" },
      { id: "b", slug: "play", title: "P", icon: "dice" as const, folder: "Play" },
      { id: "c", slug: "books", title: "B", icon: "book" as const },
    ];
    assert.deepEqual(collectionsForPath("Play/Games/elden.md", rows), ["games", "play"]);
    assert.deepEqual(collectionsForPath("Playground/x.md", rows), []);
    assert.deepEqual(effectiveFolders(["books", "games"], "Play/Games/elden.md", rows), ["books", "games", "play"]);
  });
});

describe("collections that are tags", () => {
  it("count a note that carries the tag as a member, and keep a row's tag", () => {
    const rows = [{ id: "t", slug: "games", title: "Games", icon: "gamepad" as const, tag: "games" }];
    assert.deepEqual(effectiveFolders([], "x/y.md", rows, ["life", "games"]), ["games"]);
    assert.deepEqual(effectiveFolders([], "x/y.md", rows, ["life"]), []);
    const row = cleanPublicFolder({ slug: "games", title: "Games", icon: "gamepad", tag: " #Games " }, () => "x");
    assert.equal(row?.tag, "games");
  });
});
