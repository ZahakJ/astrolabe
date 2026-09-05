import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanLibraryPath,
  compareLessons,
  compareUnits,
  libraryFolder,
  libraryList,
  libraryRowError,
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
