// THE SHELF, WORKED OUT IN THE PANEL (client/libraryShelf.ts).
//
// The settings panel has to answer three questions before the owner saves: which
// folders a root would claim, what each of them would be called, and which rows
// the root has made redundant. The third one decides whether a row is DELETED,
// so it is a rule about losing the owner's typing and it belongs under a test —
// the module shipped with none, and the one defect the browser found was on the
// exact boundary these cases guard: a row's cover counts as "said by the folder"
// only when something actually says it.
//
// Pure: no store, no fetch, no DOM.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addressProblem,
  leafOf,
  parentOf,
  publishedChildFolders,
  rootOf,
  rootOffers,
  rowIsFoldable,
} from "../client/libraryShelf.ts";
import type { LibraryPathRef, LibraryRoot } from "../shared/types.ts";

const BOOKS = "1 - Source Material/Books";
const LECTURES = "1 - Source Material/Lectures";

const row = (over: Partial<LibraryPathRef> & { folder: string }): LibraryPathRef => ({
  id: `l${over.folder.length}${over.slug ?? ""}`,
  slug: "",
  kind: "book",
  title: leafOf(over.folder),
  ...over,
});

describe("a folder split into its parent and its leaf", () => {
  it("keeps the leaf whole — eight books under one parent differ only there", () => {
    assert.equal(parentOf(`${BOOKS}/Calculus`), `${BOOKS}/`);
    assert.equal(leafOf(`${BOOKS}/Calculus`), "Calculus");
  });

  it("answers for a folder at the vault's top level", () => {
    assert.equal(parentOf("مكاتيب"), "");
    assert.equal(leafOf("مكاتيب"), "مكاتيب");
  });
});

describe("the children a root would claim", () => {
  const published = new Set([
    `${BOOKS}/Calculus/Chapter 1/One.md`,
    `${BOOKS}/Calculus/Chapter 2/Two.md`,
    `${BOOKS}/Zeno/Chapter 1/Three.md`,
    `${BOOKS}/A Reader.md`,
    `${LECTURES}/PLSC 114/L1/Four.md`,
  ]);

  it("is every immediate subfolder holding a published note, by title", () => {
    assert.deepEqual(publishedChildFolders(BOOKS, published), [`${BOOKS}/Calculus`, `${BOOKS}/Zeno`]);
  });

  it("leaves a note sitting directly in the root a post, not a path", () => {
    // `Books/A Reader.md` is a note in a folder the owner chose to hold books.
    assert.equal(publishedChildFolders(BOOKS, published).includes(`${BOOKS}/A Reader.md`), false);
  });

  it("does not answer a sibling whose name merely starts the same way", () => {
    // The boundary is the slash: `Books/Z` must never claim `Books/Zeno`.
    assert.deepEqual(publishedChildFolders(`${BOOKS}/Z`, published), []);
  });

  it("says nothing at all before the published set has loaded", () => {
    assert.deepEqual(publishedChildFolders(BOOKS, null), []);
    assert.deepEqual(publishedChildFolders("", published), []);
  });
});

describe("which root a folder hangs from", () => {
  const roots: LibraryRoot[] = [
    { id: "r1", folder: BOOKS, kind: "book" },
    { id: "r2", folder: LECTURES, kind: "course" },
  ];

  it("names the parent, for an immediate child only", () => {
    assert.equal(rootOf(`${BOOKS}/Calculus`, roots)?.id, "r1");
    assert.equal(rootOf(`${LECTURES}/PLSC 114`, roots)?.kind, "course");
    // A grandchild is a unit of a path, not a path of a root.
    assert.equal(rootOf(`${BOOKS}/Calculus/Chapter 1`, roots), null);
    assert.equal(rootOf("مكاتيب", roots), null);
  });
});

describe("why a folder the panel expected is not on the shelf", () => {
  it("says the title makes no address when it makes none", () => {
    assert.deepEqual(addressProblem(`${BOOKS}/التفكير العلمي`, new Map()), { kind: "noAddress" });
  });

  it("names the path holding the address it wanted", () => {
    const taken = new Map([["calculus", "Calculus (Michael Spivak)"]]);
    assert.deepEqual(addressProblem(`${BOOKS}/Calculus`, taken), {
      kind: "taken",
      by: "Calculus (Michael Spivak)",
    });
  });

  it("stays silent when it can prove nothing — a folder note may have hidden it", () => {
    assert.equal(addressProblem(`${BOOKS}/Calculus`, new Map()), null);
  });
});

describe("whether a row says anything the root and the folder would not", () => {
  const folder = `${BOOKS}/Twilight of the Idols`;
  const plain = row({ folder, slug: "twilight-of-the-idols", title: "Twilight of the Idols" });

  it("folds a row that is the folder's own name and the address it suggests", () => {
    assert.equal(rowIsFoldable(plain, "book", new Set()), true);
  });

  it("keeps a row whose title, address or kind is the owner's own word", () => {
    assert.equal(rowIsFoldable({ ...plain, title: "Twilight (Nietzsche)" }, "book", new Set()), false);
    assert.equal(rowIsFoldable({ ...plain, slug: "twilight" }, "book", new Set()), false);
    assert.equal(rowIsFoldable(plain, "course", new Set()), false);
  });

  it("keeps a row carrying a blurb, a source or a take-down", () => {
    assert.equal(rowIsFoldable({ ...plain, blurb: "Nietzsche in a hurry." }, "book", new Set()), false);
    assert.equal(rowIsFoldable({ ...plain, source: "https://example.org" }, "book", new Set()), false);
    assert.equal(rowIsFoldable({ ...plain, hidden: true }, "book", new Set()), false);
  });

  // THE ONE THE BROWSER CAUGHT. A cover counts as "said by the folder" only
  // when a Media tracker LENDS one, and the server lends only from a tracker
  // that has both a `folder:` and a `cover:`. A caller that fed in every
  // tracker with a folder made this row look foldable, folding it deleted the
  // row, and the book lost its picture on the public shelf.
  it("keeps a row whose cover nothing else supplies", () => {
    const withCover = { ...plain, cover: "Attachments/twilight.png" };
    assert.equal(rowIsFoldable(withCover, "book", new Set()), false);
    assert.equal(rowIsFoldable(withCover, "book", new Set([folder])), true);
    // And the lender has to be THIS folder.
    assert.equal(rowIsFoldable(withCover, "book", new Set([`${BOOKS}/Calculus`])), false);
  });
});

describe("the one offer the panel makes", () => {
  const rows: LibraryPathRef[] = [
    row({ folder: `${BOOKS}/Calculus`, slug: "calculus-spivak", title: "Calculus (Michael Spivak)" }),
    row({ folder: `${BOOKS}/Zeno`, slug: "zeno", title: "Zeno" }),
    row({ folder: `${BOOKS}/Twilight of the Idols`, slug: "twilight-of-the-idols", title: "Twilight of the Idols" }),
    row({ folder: `${LECTURES}/PLSC 114`, slug: "plsc-114", title: "PLSC 114", kind: "course" }),
  ];

  it("offers the parent holding the most rows, with the kind they mostly are", () => {
    const offer = rootOffers(rows, [], new Set());
    assert.equal(offer?.parent, BOOKS);
    assert.equal(offer?.kind, "book");
    assert.equal(offer?.rows.length, 3);
  });

  it("offers only the rows that say nothing — the hand-typed title stays", () => {
    const offer = rootOffers(rows, [], new Set());
    assert.deepEqual(offer?.foldable.map((r) => r.title), ["Zeno", "Twilight of the Idols"]);
  });

  it("says nothing about a parent that is already a root", () => {
    const offer = rootOffers(rows, [{ id: "r1", folder: BOOKS, kind: "book" }], new Set());
    // Lectures holds one row, and one row is not a shape worth a question.
    assert.equal(offer, null);
  });

  it("says nothing when no parent holds two rows", () => {
    assert.equal(rootOffers([rows[3]], [], new Set()), null);
    assert.equal(rootOffers([], [], new Set()), null);
  });

  it("never offers the vault itself as a root", () => {
    const top = [row({ folder: "مكاتيب", slug: "makatib" }), row({ folder: "Orbits", slug: "orbits" })];
    assert.equal(rootOffers(top, [], new Set()), null);
  });
});
