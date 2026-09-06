import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanLibraryPath,
  compareLessons,
  compareUnits,
  guessLibraryKind,
  isLibraryLesson,
  libraryCoverPaths,
  libraryFolder,
  libraryFreshSlug,
  libraryLessonFolders,
  libraryList,
  libraryRowError,
  libraryRowForFolder,
  libraryTitleOf,
  libraryUrl,
  unitOfName,
} from "../shared/library.ts";

describe("library rules", () => {
  it("reads a unit's kind and number off its folder name, sorting prefix and all", () => {
    assert.deepEqual(unitOfName("B2| Chapter 40"), { name: "Chapter 40", kind: "chapter", number: 40 });
    assert.deepEqual(unitOfName("L3"), { name: "L3", kind: "lecture", number: 3 });
    assert.deepEqual(unitOfName("Lecture 12 Raft"), { name: "Lecture 12 Raft", kind: "lecture", number: 12 });
    assert.deepEqual(unitOfName("Week 02"), { name: "Week 02", kind: "week", number: 2 });
    assert.deepEqual(unitOfName("Part I"), { name: "Part I", kind: "unit", number: null });
    assert.deepEqual(unitOfName("Appendix"), { name: "Appendix", kind: "unit", number: null });
  });

  it("orders units by number, then name, numbered ones first", () => {
    const u = (key: string) => ({ key, ...unitOfName(key) });
    const sorted = [u("L10"), u("Appendix"), u("L2"), u("L1")].sort(compareUnits).map((x) => x.key);
    assert.deepEqual(sorted, ["L1", "L2", "L10", "Appendix"]);
  });

  it("puts a unit's hub note first and the rest in natural order", () => {
    const rows = [
      { title: "Part 10", path: "b" },
      { title: "Chapter 40", path: "hub" },
      { title: "Part 2", path: "a" },
    ].sort(compareLessons("Chapter 40"));
    assert.deepEqual(rows.map((r) => r.path), ["hub", "a", "b"]);
  });

  it("normalises a folder and refuses what cannot be one", () => {
    assert.equal(libraryFolder(" /1 - Source Material/Books/Feynman Lectures/ "), "1 - Source Material/Books/Feynman Lectures");
    assert.equal(libraryFolder("a\\b"), "a/b");
    assert.equal(libraryFolder(""), null);
    assert.equal(libraryFolder("../etc"), null);
    assert.equal(libraryFolder("a//b"), null);
  });

  it("judges a row by the same rule the server does", () => {
    assert.equal(libraryRowError({ title: "X", slug: "x", folder: "Books/X", kind: "book" }), null);
    assert.equal(libraryRowError({ title: "", slug: "x", folder: "Books/X", kind: "book" }), "title");
    assert.equal(libraryRowError({ title: "X", slug: "Bad Slug", folder: "Books/X", kind: "book" }), "slug");
    assert.equal(libraryRowError({ title: "X", slug: "x", folder: "", kind: "book" }), "folder");
    assert.equal(libraryRowError({ title: "X", slug: "x", folder: "Books/X", kind: "film" }), "kind");
    const clean = cleanLibraryPath(
      { title: " X ", slug: "X", folder: "Books/X/", kind: "course", blurb: " b ", cover: "c.png", source: "ftp://no", hidden: true },
      () => "id1",
    );
    assert.deepEqual(clean, { id: "id1", slug: "x", folder: "Books/X", kind: "course", title: "X", blurb: "b", cover: "c.png", hidden: true });
  });

  it("drops blank editor rows and trims the rest", () => {
    const list = libraryList([
      { id: "a", slug: "", folder: "", kind: "book", title: "" },
      { id: "b", slug: " Feyn ", folder: "/Books/F/", kind: "book", title: " Feynman " },
    ]);
    assert.deepEqual(list, [{ id: "b", slug: "feyn", folder: "Books/F", kind: "book", title: "Feynman" }]);
  });

  it("spells the three addresses", () => {
    assert.equal(libraryUrl(), "/library");
    assert.equal(libraryUrl("feynman"), "/library/feynman");
    assert.equal(libraryUrl("feynman", 7), "/library/feynman/7");
  });
});

describe("a folder becoming a path", () => {
  it("guesses the kind from what is inside, then from the address", () => {
    assert.equal(guessLibraryKind("1 - Source Material/Lectures/6.824", ["L1", "L2", "L10"]), "course");
    assert.equal(guessLibraryKind("Books/Feynman", ["B2| Chapter 39", "B2| Chapter 40"]), "book");
    assert.equal(guessLibraryKind("Study/Algorithms", ["Week 1", "Week 2"]), "course");
    assert.equal(guessLibraryKind("Talks/Rich Hickey", []), "series");
    assert.equal(guessLibraryKind("Lectures/Physics", ["notes"]), "course");
    assert.equal(guessLibraryKind("Anything/Else", []), "book");
  });

  it("titles from the leaf folder with the sorting prefix gone", () => {
    assert.equal(libraryTitleOf("1 - Source Material/Books/B2| Feynman Lectures"), "Feynman Lectures");
    assert.equal(libraryTitleOf("Lectures/6.824"), "6.824");
  });

  it("gives a new row a fresh address that no row already holds", () => {
    const taken = [{ id: "a", slug: "feynman", folder: "x", kind: "book" as const, title: "Feynman" }];
    const row = libraryRowForFolder("Books/Feynman", ["Chapter 1"], taken);
    assert.equal(row.slug, "feynman-2");
    assert.equal(row.title, "Feynman");
    assert.equal(row.kind, "book");
    assert.equal(row.folder, "Books/Feynman");
    assert.equal(libraryFreshSlug("The Feynman Lectures", []), "the-feynman-lectures");
    assert.equal(libraryFreshSlug("محاضرات", []), "shelf");
  });
});

describe("a lesson is not a post", () => {
  it("names the lesson folders of an enabled library, visible paths only", () => {
    const lib = {
      enabled: true,
      paths: [
        { id: "a", slug: "a", folder: "Books/Feynman/", kind: "book" as const, title: "F" },
        { id: "b", slug: "b", folder: "Lectures/6.824", kind: "course" as const, title: "L", hidden: true },
        { id: "c", slug: "c", folder: "Books/Feynman", kind: "book" as const, title: "F again" },
      ],
    };
    assert.deepEqual(libraryLessonFolders(lib), ["Books/Feynman"]);
    assert.deepEqual(libraryLessonFolders({ ...lib, enabled: false }), []);
    assert.deepEqual(libraryLessonFolders(undefined), []);
  });
  it("draws the boundary at the slash", () => {
    const folders = ["Books/Feynman"];
    assert.equal(isLibraryLesson("Books/Feynman/Chapter 1/vortex.md", folders), true);
    assert.equal(isLibraryLesson("Books/Feynman Lectures/x.md", folders), false);
    assert.equal(isLibraryLesson("Books/Feynman.md", folders), false);
    assert.equal(isLibraryLesson("essays/x.md", []), false);
  });
});

describe("library covers a visitor may fetch", () => {
  it("lists vault covers of visible paths, never web ones or hidden paths", () => {
    const lib = {
      enabled: true,
      paths: [
        { id: "a", slug: "a", folder: "Books/A", kind: "book" as const, title: "A", cover: "attachments/a.jpg" },
        { id: "b", slug: "b", folder: "Books/B", kind: "book" as const, title: "B", cover: "https://x/y.jpg" },
        { id: "c", slug: "c", folder: "Books/C", kind: "book" as const, title: "C", cover: "attachments/c.jpg", hidden: true },
        { id: "d", slug: "d", folder: "Books/D", kind: "book" as const, title: "D" },
      ],
    };
    assert.deepEqual(libraryCoverPaths(lib), ["attachments/a.jpg"]);
    assert.deepEqual(libraryCoverPaths({ ...lib, enabled: false }), []);
  });
});
