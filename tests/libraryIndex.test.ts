// THE SHELF AS THE INDEX BUILDS IT — `libraryRefs()`, `libraryLessons()` and
// the cover allowlist, over a real fixture vault.
//
// tests/library.test.ts covers the RULES (what a legal row is, how a unit's
// name is read). This file covers the join to the index, which is where the
// publish-safety bugs live: what a visitor may fetch, what a folder note may
// put in an `href`, and how long resolving a forty-lesson book takes on the
// route an anonymous visitor hits for the door.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  initIndexer,
  isAllowedAttachment,
  libraryLessons,
  libraryRefs,
  posts,
  type FilterLang,
} from "../server/indexer.ts";
import { getSettings, moveLibraryFolders, patchSettings } from "../server/settings.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

const PNG = "\x89PNG\r\n\x1a\n0123";
const OFF: FilterLang = null;
const BOOKS = "1 - Source Material/Books";

/** A book with `lessons` published notes spread over four chapters — the shape
 *  the reading companion writes, and the shape the perf case needs. */
function book(name: string, lessons: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let n = 1; n <= lessons; n++) {
    const chapter = `Chapter ${1 + (n % 4)}`;
    out[`${BOOKS}/${name}/${chapter}/Idea ${n}.md`] = note(
      { publish: "true", date: "2025-03-03" },
      `A paragraph of English prose long enough to be classified and counted, number ${n}.\n`,
    );
  }
  return out;
}

const files: Record<string, string> = {
  // DECLARED IN THE VAULT, NOTHING PUBLISHED. Its cover must not be servable
  // and its `source:` must not survive the walk.
  [`${BOOKS}/Silent/Silent.md`]: note(
    { library: "book", cover: "covers/silent.jpg", source: "javascript:alert(1)" },
    "A book whose notes are all drafts.\n",
  ),
  [`${BOOKS}/Silent/Chapter 1/Draft.md`]: note({}, "Not published yet, not by anybody.\n"),
  // DECLARED IN THE VAULT WITH A PUBLISHED LESSON.
  [`${BOOKS}/Loud/Loud.md`]: note(
    { library: "book", cover: "covers/loud.jpg", source: "https://example.org/loud" },
    "A book with a lesson a visitor may read.\n",
  ),
  [`${BOOKS}/Loud/Chapter 1/First.md`]: note(
    { publish: "true", date: "2025-01-01" },
    "The first published lesson, a full English paragraph so the language filter can classify it.\n",
  ),
  "covers/silent.jpg": PNG,
  "covers/loud.jpg": PNG,
  ...book("Mechanics", 40),
  ...book("Optics", 40),
  ...book("Thermodynamics", 40),
  ...book("Relativity", 40),
  ...book("Statistics", 40),
};

const data = makeDir();
const root = makeVault(files);

const ROWS = ["Mechanics", "Optics", "Thermodynamics", "Relativity", "Statistics"].map((name, n) => ({
  id: `row${n}`,
  slug: name.toLowerCase(),
  folder: `${BOOKS}/${name}`,
  kind: "book" as const,
  title: name,
}));

before(async () => {
  initSite({ ASTROLABE_DATA: data });
  initVault(root);
  await initIndexer();
  patchSettings({ library: { enabled: true, paths: ROWS } });
});

after(() => {
  removeVault(root);
  removeVault(data);
});

describe("the cover allowlist asks whether anyone can reach the path", () => {
  it("serves the cover of a path with a published lesson", () => {
    assert.equal(isAllowedAttachment("covers/loud.jpg"), true);
  });

  it("refuses the cover of a declared path with nothing published", () => {
    // Before this rule, `library: book` plus `cover:` in a folder note handed
    // an anonymous caller a picture out of a folder every note of which is a
    // draft — and no page on the site linked to it, because the path with no
    // lesson is never sent.
    assert.equal(isAllowedAttachment("covers/silent.jpg"), false);
  });
});

describe("a folder note's source is judged like a row's", () => {
  it("drops a source that is not http(s)", () => {
    const silent = libraryRefs().find((ref) => ref.folder.endsWith("/Silent"));
    assert.ok(silent, "the declared path is on the shelf");
    assert.equal(silent.source, undefined);
  });

  it("keeps an https source", () => {
    const loud = libraryRefs().find((ref) => ref.folder.endsWith("/Loud"));
    assert.equal(loud?.source, "https://example.org/loud");
  });
});

describe("resolving a shelf costs one vault walk, not one per lesson", () => {
  it("resolves forty lessons for less than the whole feed costs", () => {
    // `postMeta()` defaults its collection rows to `collectionRowsNow()`,
    // which walks the whole vault. Called per lesson — which is what this
    // function used to do — a five-path shelf of forty-lesson books was two
    // hundred full walks, on every anonymous /api/me, which is the route that
    // asks whether the door should be drawn.
    //
    // The bound is RELATIVE, against `posts()`: one walk over the published
    // set plus a postMeta for each of two hundred notes. Forty lessons costing
    // more than that whole feed can only mean the walk is back inside the
    // loop, and a ratio calibrates itself to whatever machine is running it
    // where a millisecond count does not. Both are warmed first — postMeta
    // caches its excerpt and word count on the record, and measuring that
    // cache filling would be measuring the wrong thing.
    const spent = (run: () => void): number => {
      const started = performance.now();
      run();
      return performance.now() - started;
    };
    const feedOnce = (): void => void posts(true, OFF);
    const bookOnce = (): void => void libraryLessons(`${BOOKS}/Mechanics`, true, OFF);
    feedOnce();
    bookOnce();
    const feed = Math.max(spent(feedOnce), 0.05);
    const bookCost = spent(bookOnce);
    assert.equal(libraryLessons(`${BOOKS}/Mechanics`, true, OFF).length, 40);
    assert.ok(
      bookCost < feed * 2,
      `forty lessons took ${bookCost.toFixed(1)} ms against a ${feed.toFixed(1)} ms feed over the whole vault`,
    );
  });

  it("finds every lesson of every path on the shelf", () => {
    let total = 0;
    for (const row of ROWS) total += libraryLessons(row.folder, true, OFF).length;
    assert.equal(total, 200);
  });
});

describe("a folder's rename carries its library row", () => {
  it("repoints the row and its subtree, and drops it on a delete", () => {
    patchSettings({
      library: {
        enabled: true,
        paths: [
          { id: "a", slug: "mechanics", folder: `${BOOKS}/Mechanics`, kind: "book", title: "Mechanics" },
          { id: "b", slug: "nested", folder: `${BOOKS}/Mechanics/Chapter 1`, kind: "book", title: "Chapter one" },
          { id: "c", slug: "optics", folder: `${BOOKS}/Optics`, kind: "book", title: "Optics" },
        ],
      },
    });
    moveLibraryFolders(`${BOOKS}/Mechanics`, `${BOOKS}/Classical Mechanics`);
    const moved = getSettings().library?.paths ?? [];
    assert.deepEqual(
      moved.map((p) => p.folder),
      [`${BOOKS}/Classical Mechanics`, `${BOOKS}/Classical Mechanics/Chapter 1`, `${BOOKS}/Optics`],
    );
    // The address survives the rename: that is the whole point — reader
    // progress is keyed by slug, and a book does not move house.
    assert.deepEqual(moved.map((p) => p.slug), ["mechanics", "nested", "optics"]);

    moveLibraryFolders(`${BOOKS}/Classical Mechanics`, null);
    assert.deepEqual(
      (getSettings().library?.paths ?? []).map((p) => p.folder),
      [`${BOOKS}/Optics`],
    );
  });

  it("does not touch the file when no row is under the folder", () => {
    const before = JSON.stringify(getSettings().library);
    moveLibraryFolders(`${BOOKS}/Nothing Here`, `${BOOKS}/Still Nothing`);
    assert.equal(JSON.stringify(getSettings().library), before);
  });
});
