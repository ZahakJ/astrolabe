// THE SHELF AS THE INDEX BUILDS IT — `libraryRefs()`, `libraryLessons()` and
// the cover allowlist, over a real fixture vault.
//
// tests/library.test.ts covers the RULES (what a legal row is, how a unit's
// name is read). This file covers the join to the index, which is where the
// publish-safety bugs live: what a visitor may fetch, what a folder note may
// put in an `href`, and how long resolving a forty-lesson book takes on the
// route an anonymous visitor hits for the door.

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  indexFile,
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
const LECTURES = "1 - Source Material/Lectures";

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
  // TWO ARABIC TITLES under the same parent. Neither makes an address, and
  // under the old rule they became `/library/path` and `/library/path-2`,
  // renumbered by whichever book existed that morning.
  [`${BOOKS}/التفكير العلمي/الفصل 1/بداية.md`]: note(
    { publish: "true", date: "2025-02-02" },
    "فقرة عربية كاملة تكفي لتصنيف اللغة وعدّ كلماتها في هذا الدرس الأول.\n",
  ),
  [`${BOOKS}/نقد الفكر الديني/الفصل 1/بداية.md`]: note(
    { publish: "true", date: "2025-02-03" },
    "فقرة عربية أخرى كاملة تكفي لتصنيف اللغة وعدّ كلماتها في هذا الدرس.\n",
  ),
  // Claimed by the root, then taken back off the shelf by its own folder note.
  [`${BOOKS}/Hushed/Hushed.md`]: note({ hidden: "true" }, "A book the owner is not showing yet.\n"),
  [`${BOOKS}/Hushed/Chapter 1/One.md`]: note(
    { publish: "true", date: "2025-05-05" },
    "A published note inside a folder whose own note says it is hidden.\n",
  ),
  // Under the root with nothing published: never a path.
  [`${BOOKS}/Unwritten/Chapter 1/Notes.md`]: note({}, "Nothing here is published yet, by anyone.\n"),
  // Directly inside the root: a post, not a path, and not a reason to make the
  // root itself a book.
  [`${BOOKS}/A reading list.md`]: note(
    { publish: "true", date: "2025-04-04" },
    "A published note sitting directly inside the folder that holds the books.\n",
  ),
  // A second parent whose every child IS named by a row — the shape the
  // invariance case needs.
  [`${LECTURES}/PLSC 114/L1/Opening.md`]: note(
    { publish: "true", date: "2025-06-06" },
    "The opening lecture of the course, in a full English paragraph.\n",
  ),
  [`${LECTURES}/6.036/L1/Opening.md`]: note(
    { publish: "true", date: "2025-06-07" },
    "The opening lecture of the other course, in a full English paragraph.\n",
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
    const ROUNDS = 25;
    const spent = (run: () => void): number => {
      const started = performance.now();
      for (let n = 0; n < ROUNDS; n++) run();
      return performance.now() - started;
    };
    const feedOnce = (): void => void posts(true, OFF);
    const bookOnce = (): void => void libraryLessons(`${BOOKS}/Mechanics`, true, OFF);
    feedOnce();
    bookOnce();
    // Many rounds, not one: both calls are sub-millisecond once the caches are
    // warm, and a single pair of readings on a machine running the rest of the
    // suite beside it measures the scheduler. Twenty-five of each averages the
    // jitter out and leaves the forty-fold signal untouched.
    const feed = Math.max(spent(feedOnce), 1);
    const bookCost = spent(bookOnce);
    assert.equal(libraryLessons(`${BOOKS}/Mechanics`, true, OFF).length, 40);
    assert.ok(
      bookCost < feed * 3,
      `forty lessons took ${bookCost.toFixed(1)} ms against a ${feed.toFixed(1)} ms feed over the whole vault, ${ROUNDS} rounds each`,
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

// ── Shelf roots ────────────────────────────────────────────────────────────

const ROOT_BOOKS = { id: "r1", folder: BOOKS, kind: "book" as const };

/** The ref for one folder leaf, or undefined. */
const refFor = (leaf: string) => libraryRefs().find((ref) => ref.folder.endsWith(`/${leaf}`));

describe("a shelf root claims every published folder inside it", () => {
  it("adds the children with published notes, and only those", () => {
    patchSettings({ library: { enabled: true, paths: [], roots: [ROOT_BOOKS] } });
    const folders = libraryRefs().map((ref) => ref.folder);
    assert.ok(folders.includes(`${BOOKS}/Mechanics`), "a child with published notes is a path");
    assert.ok(folders.includes(`${BOOKS}/Loud`), "a folder note under the root is still a path");
    assert.ok(!folders.includes(`${BOOKS}/Unwritten`), "a child with nothing published is not a path");
    assert.ok(!folders.includes(BOOKS), "a note directly in the root does not make the root a path");
  });

  it("gives a child the root's kind, and lets its folder note overrule", () => {
    patchSettings({ library: { enabled: true, paths: [], roots: [{ ...ROOT_BOOKS, kind: "course" }] } });
    assert.equal(refFor("Mechanics")?.kind, "course");
    // `Loud/Loud.md` says `library: book`, which is why a root is not the last
    // word about one folder.
    assert.equal(refFor("Loud")?.kind, "book");
  });

  it("lets a folder note take a claimed child back off the shelf", () => {
    patchSettings({ library: { enabled: true, paths: [], roots: [ROOT_BOOKS] } });
    assert.equal(refFor("Hushed")?.hidden, true);
  });

  it("orders a root's children by title, behind the rows", () => {
    patchSettings({
      library: {
        enabled: true,
        roots: [ROOT_BOOKS],
        paths: [{ id: "keep", slug: "optics", folder: `${BOOKS}/Optics`, kind: "book", title: "Optics" }],
      },
    });
    const refs = libraryRefs();
    assert.equal(refs[0].folder, `${BOOKS}/Optics`, "rows come first, in their own order");
    // The root's children by title; then `Silent`, which no root claims (it
    // has nothing published) and which reaches the shelf through its own
    // folder note, in the vault order that branch has always used.
    assert.deepEqual(refs.slice(1).map((ref) => ref.title), [
      "Hushed",
      "Loud",
      "Mechanics",
      "Relativity",
      "Statistics",
      "Thermodynamics",
      "Silent",
    ]);
  });
});

describe("a derived address is an address or it is nothing", () => {
  it("does not publish a folder whose title makes no address", () => {
    patchSettings({ library: { enabled: true, paths: [], roots: [ROOT_BOOKS] } });
    const slugs = libraryRefs().map((ref) => ref.slug);
    assert.ok(
      !slugs.some((slug) => slug === "path" || /^path-\d+$/.test(slug)),
      `no placeholder address survives: ${slugs.join(", ")}`,
    );
    assert.equal(refFor("التفكير العلمي"), undefined);
    assert.equal(refFor("نقد الفكر الديني"), undefined);
  });

  it("never displaces a row: the derived path stands down", () => {
    patchSettings({
      library: {
        enabled: true,
        roots: [ROOT_BOOKS],
        // A row PINNING the address the derived `Loud` would otherwise take.
        paths: [{ id: "pin", slug: "loud", folder: `${BOOKS}/Optics`, kind: "book", title: "Optics" }],
      },
    });
    const refs = libraryRefs();
    assert.equal(refs.filter((ref) => ref.slug === "loud").length, 1);
    assert.equal(refs.find((ref) => ref.slug === "loud")?.folder, `${BOOKS}/Optics`);
    assert.equal(refs.find((ref) => ref.folder === `${BOOKS}/Loud`), undefined);
  });

  it("publishes an Arabic-titled folder once its note carries a slug", async () => {
    // The vault-portable answer to "Needs an address": no settings row needed.
    const notePath = `${BOOKS}/التفكير العلمي/التفكير العلمي.md`;
    const abs = join(root, notePath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, note({ slug: "scientific-thinking" }, "ملاحظة المجلد نفسه، بلا عنوان جديد.\n"));
    await indexFile(notePath);
    patchSettings({ library: { enabled: true, paths: [], roots: [ROOT_BOOKS] } });
    assert.equal(refFor("التفكير العلمي")?.slug, "scientific-thinking");
    // And the OTHER one still waits: one address does not free the other.
    assert.equal(refFor("نقد الفكر الديني"), undefined);
  });
});

describe("adding a root over the rows that already name its children", () => {
  it("changes nothing a visitor sees", () => {
    const rows = [
      { id: "a", slug: "plsc-114", folder: `${LECTURES}/PLSC 114`, kind: "course" as const, title: "PLSC 114" },
      { id: "b", slug: "6-036", folder: `${LECTURES}/6.036`, kind: "course" as const, title: "6.036" },
    ];
    patchSettings({ library: { enabled: true, roots: [], paths: rows } });
    const before = JSON.stringify(libraryRefs());
    patchSettings({ library: { enabled: true, roots: [{ id: "r2", folder: LECTURES, kind: "course" }], paths: rows } });
    assert.equal(JSON.stringify(libraryRefs()), before, "a root over folders the rows already name adds nothing");

    // And folding a row that said nothing the folder does not leaves the path
    // where it was, with the address its title suggests.
    patchSettings({ library: { enabled: true, roots: [{ id: "r2", folder: LECTURES, kind: "course" }], paths: [rows[0]] } });
    const folded = libraryRefs().find((ref) => ref.folder === `${LECTURES}/6.036`);
    assert.equal(folded?.slug, "6-036");
    assert.equal(folded?.kind, "course");
  });
});

describe("what the PATCH handler refuses a root", () => {
  const refusal = (patch: Parameters<typeof patchSettings>[0]): string => {
    try {
      patchSettings(patch);
      return "";
    } catch (err) {
      return (err as Error).message;
    }
  };
  const roots = (list: unknown): Parameters<typeof patchSettings>[0] => ({
    library: { enabled: true, paths: [], roots: list as never },
  });

  it("refuses more than eight", () => {
    const many = Array.from({ length: 9 }, (_, n) => ({ id: `r${n}`, folder: `${BOOKS}/R${n}`, kind: "book" }));
    assert.match(refusal(roots(many)), /too many roots/);
  });

  it("refuses a root inside another root", () => {
    assert.match(
      refusal(roots([ROOT_BOOKS, { id: "r2", folder: `${BOOKS}/Mechanics`, kind: "book" }])),
      /sits inside another root or inside a path/,
    );
  });

  it("refuses the vault itself", () => {
    assert.match(refusal(roots([{ id: "r1", folder: "", kind: "book" }])), /names the vault itself/);
  });

  it("refuses a kind that is not a kind", () => {
    assert.match(refusal(roots([{ id: "r1", folder: BOOKS, kind: "film" }])), /kind that is not book, course or series/);
  });

  it("refuses a root inside a row's folder", () => {
    assert.match(
      refusal({
        library: {
          enabled: true,
          paths: [{ id: "a", slug: "mechanics", folder: `${BOOKS}/Mechanics`, kind: "book", title: "Mechanics" }],
          roots: [{ id: "r1", folder: `${BOOKS}/Mechanics/Chapter 1`, kind: "book" }],
        },
      }),
      /sits inside another root or inside a path/,
    );
  });
});
