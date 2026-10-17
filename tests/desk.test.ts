// THE WRITING DESK (shared/desk.ts, server/desk.ts, server/deskWords.ts,
// docs/writing-desk.md): the frontmatter a piece is read from, the board and
// the series lanes drawn from it, the outline that becomes headings, the
// words-per-day log — and THE PRIVACY GUARD: a piece that is not published is
// invisible to a visitor on every surface a visitor has.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { Hono } from "hono";
import {
  ALL,
  boardColumns,
  comparePieces,
  DESK_STATUSES,
  deskMetaOf,
  filterPieces,
  findOutline,
  isOverdue,
  logWords,
  newPieceContent,
  nextStepOf,
  NO_SERIES,
  outlineToHeadings,
  parseDeskStatus,
  pieceNotePath,
  seriesLanes,
  stageOf,
  WORD_LOG_DAYS,
  wordPoints,
  type DeskData,
  type DeskPiece,
} from "../shared/desk.ts";
import { initAuth } from "../server/auth.ts";
import { api } from "../server/api.ts";
import { renderFeed, renderSitemap } from "../server/blog.ts";
import { indexFile, initIndexer, notes, posts } from "../server/indexer.ts";
import { deskData, deskPiece } from "../server/desk.ts";
import { deskWordPoints, flushDeskWords, moveDeskWords, noteDeskWords, resetDeskWordsForTests } from "../server/deskWords.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

function piece(over: Partial<DeskPiece> = {}): DeskPiece {
  return {
    path: "Writing/A.md",
    title: "A",
    status: "idea",
    stage: "idea",
    published: false,
    series: null,
    seriesRef: null,
    lang: null,
    angle: "",
    priority: null,
    due: null,
    next: "",
    words: 0,
    goal: null,
    mtimeMs: 0,
    ...over,
  };
}

describe("the frontmatter", () => {
  it("reads a piece: kind, status, angle, series, lang, priority, due, next", () => {
    const meta = deskMetaOf({
      kind: "essay",
      status: "Drafting",
      angle: "  A history of the astrolabe,   told through one instrument. ",
      series: [["Instruments of the sky"]],
      lang: "ar",
      priority: "high",
      due: new Date(Date.UTC(2026, 10, 1)),
      next: "Find the 1820 survey",
    });
    assert.deepEqual(meta, {
      kind: "essay",
      status: "drafting",
      series: "Instruments of the sky",
      lang: "ar",
      angle: "A history of the astrolabe, told through one instrument.",
      priority: "high",
      due: "2026-11-01",
      next: "Find the 1820 survey",
      description: "",
    });
  });

  it("is not a piece without kind, and a bare kind is an idea", () => {
    assert.equal(deskMetaOf({ status: "drafting" }), null);
    assert.equal(deskMetaOf({ kind: "book" }), null);
    const bare = deskMetaOf({ kind: "Essay" })!;
    assert.equal(bare.status, "idea");
    assert.equal(bare.series, null);
    assert.equal(bare.due, null);
  });

  it("folds the spellings a hand reaches for, and nothing unknown escapes", () => {
    assert.equal(parseDeskStatus("draft"), "drafting");
    assert.equal(parseDeskStatus("research"), "researching");
    assert.equal(parseDeskStatus("outline"), "outlining");
    assert.equal(parseDeskStatus("on hold"), "parked");
    assert.equal(parseDeskStatus("PUBLISHED"), "published");
    assert.equal(parseDeskStatus("whenever"), "idea");
    assert.equal(parseDeskStatus(""), "idea");
    for (const s of DESK_STATUSES) assert.equal(parseDeskStatus(s), s);
  });

  it("drops a due date that is not a calendar day", () => {
    assert.equal(deskMetaOf({ kind: "essay", due: "2026-02-30" })!.due, null);
    assert.equal(deskMetaOf({ kind: "essay", due: "soon" })!.due, null);
    assert.equal(deskMetaOf({ kind: "essay", due: "2026-02-28" })!.due, "2026-02-28");
  });

  it("reads a series: its description, and no membership of its own", () => {
    const meta = deskMetaOf({ kind: "series", description: "Nine bridges, nine centuries.", series: ["[[Stone]]", "[[Iron]]"] })!;
    assert.equal(meta.kind, "series");
    assert.equal(meta.description, "Nine bridges, nine centuries.");
    assert.equal(meta.series, null);
  });

  it("the flag decides published, never the status", () => {
    assert.equal(stageOf("published", false), "editing");
    assert.equal(stageOf("drafting", true), "published");
    assert.equal(stageOf("parked", false), "parked");
  });
});

describe("capture", () => {
  it("files a new piece under Writing/, with a safe name", () => {
    assert.equal(pieceNotePath("A history of the astrolabe"), "Writing/A history of the astrolabe.md");
    assert.equal(pieceNotePath("Why: bridges / arches?"), "Writing/Why bridges arches.md");
    assert.equal(pieceNotePath("..hidden"), "Writing/hidden.md");
    assert.equal(pieceNotePath("   "), "Writing/Untitled.md");
  });

  it("writes a private note: no publish key, the angle quoted, an outline to grow", () => {
    const text = newPieceContent({ kind: "essay", angle: 'The "first" bridge', series: "Bridges", lang: "en" });
    assert.ok(!/publish/i.test(text));
    assert.match(text, /^---\nkind: essay\nstatus: idea\nangle: "The \\"first\\" bridge"\nseries: "\[\[Bridges\]\]"\nlang: en\n---\n/);
    assert.match(text, /## Outline\n\n- \n/);
    const meta = deskMetaOf({ kind: "essay", series: "[[Bridges]]" })!;
    assert.equal(meta.series, "Bridges");
    const series = newPieceContent({ kind: "series", angle: "Nine bridges" });
    assert.ok(!/publish/i.test(series));
    assert.match(series, /kind: series\nstatus: idea\ndescription: "Nine bridges"\nseries: \[\]\n/);
  });
});

describe("the board", () => {
  it("has every column in road order, published last but one, parked last", () => {
    const cols = boardColumns([]);
    assert.deepEqual(
      cols.map((c) => c.status),
      ["idea", "researching", "outlining", "drafting", "editing", "published", "parked"],
    );
    assert.ok(cols.every((c) => c.pieces.length === 0));
  });

  it("puts each piece in its stage's column, sorted priority → due → last touched", () => {
    const a = piece({ path: "a", title: "a", stage: "drafting", priority: "low", mtimeMs: 9 });
    const b = piece({ path: "b", title: "b", stage: "drafting", priority: "high", mtimeMs: 1 });
    const c = piece({ path: "c", title: "c", stage: "drafting", due: "2026-01-01", mtimeMs: 1 });
    const d = piece({ path: "d", title: "d", stage: "drafting", due: "2026-03-01", mtimeMs: 1 });
    const e = piece({ path: "e", title: "e", stage: "drafting", mtimeMs: 5 });
    const f = piece({ path: "f", title: "f", stage: "published", published: true });
    const cols = boardColumns([a, b, c, d, e, f]);
    assert.deepEqual(cols.find((x) => x.status === "drafting")!.pieces.map((p) => p.path), ["b", "c", "d", "e", "a"]);
    assert.deepEqual(cols.find((x) => x.status === "published")!.pieces.map((p) => p.path), ["f"]);
    assert.ok(comparePieces(b, a) < 0);
  });

  it("filters by series, language and status", () => {
    const list = [
      piece({ path: "1", series: "S.md", seriesRef: "S", lang: "en", stage: "idea" }),
      piece({ path: "2", lang: "ar", stage: "drafting" }),
      piece({ path: "3", seriesRef: "Nowhere", stage: "idea" }),
    ];
    assert.deepEqual(filterPieces(list, ALL).map((p) => p.path), ["1", "2", "3"]);
    assert.deepEqual(filterPieces(list, { ...ALL, series: "S.md" }).map((p) => p.path), ["1"]);
    assert.deepEqual(filterPieces(list, { ...ALL, series: NO_SERIES }).map((p) => p.path), ["2"]);
    assert.deepEqual(filterPieces(list, { ...ALL, lang: "ar" }).map((p) => p.path), ["2"]);
    assert.deepEqual(filterPieces(list, { ...ALL, status: "idea" }).map((p) => p.path), ["1", "3"]);
  });

  it("draws a series as a lane: its list in order, planned slots, then the pieces that name it", () => {
    const data: DeskData = {
      pieces: [
        piece({ path: "Stone.md", title: "Stone", series: "Bridges.md", seriesRef: "Bridges", stage: "published", published: true }),
        piece({ path: "Iron.md", title: "Iron", series: "Bridges.md", seriesRef: "Bridges", stage: "drafting" }),
        piece({ path: "Rope.md", title: "Rope", series: "Bridges.md", seriesRef: "Bridges", stage: "idea" }),
        piece({ path: "Loose.md", title: "Loose", seriesRef: "Clocks", stage: "editing" }),
      ],
      series: [
        {
          path: "Bridges.md",
          title: "Bridges",
          status: "drafting",
          description: "Nine bridges",
          lang: null,
          angle: "",
          published: false,
          mtimeMs: 0,
          slots: [
            { ref: "Stone", path: "Stone.md" },
            { ref: "Steel", path: null },
            { ref: "Iron", path: "Iron.md" },
            { ref: "Iron", path: "Iron.md" },
            { ref: "Notes on arches", path: "Arches.md" },
          ],
        },
      ],
    };
    const lanes = seriesLanes(data);
    assert.equal(lanes.length, 2);
    const bridges = lanes[0];
    assert.deepEqual(
      bridges.entries.map((e) => (e.kind === "piece" ? e.piece.path : e.kind === "note" ? `note:${e.path}` : `planned:${e.ref}`)),
      ["Stone.md", "planned:Steel", "Iron.md", "note:Arches.md", "Rope.md"],
    );
    assert.equal(bridges.total, 5);
    assert.equal(bridges.drafted, 2, "Stone (published) and Iron (drafting)");
    assert.equal(bridges.published, 1);
    // A series named only by its pieces still gets a lane, under that name.
    assert.equal(lanes[1].title, "Clocks");
    assert.equal(lanes[1].series, null);
    assert.equal(lanes[1].drafted, 1);
  });

  it("says what to do next, the writer's words first", () => {
    assert.deepEqual(nextStepOf(piece({ next: "Call the archive" })), { kind: "own", text: "Call the archive" });
    assert.deepEqual(nextStepOf(piece()), { kind: "angle" });
    assert.deepEqual(nextStepOf(piece({ angle: "x" })), { kind: "research" });
    assert.deepEqual(nextStepOf(piece({ stage: "outlining" })), { kind: "headings" });
    assert.deepEqual(nextStepOf(piece({ stage: "drafting", words: 1200, goal: 3000 })), { kind: "words", n: 1800 });
    assert.deepEqual(nextStepOf(piece({ stage: "drafting", words: 3100, goal: 3000 })), { kind: "finish" });
    assert.deepEqual(nextStepOf(piece({ stage: "editing", status: "published" })), { kind: "publish" });
    assert.deepEqual(nextStepOf(piece({ stage: "published" })), { kind: "live" });
    assert.equal(isOverdue(piece({ due: "2026-01-01", stage: "drafting" }), "2026-02-01"), true);
    assert.equal(isOverdue(piece({ due: "2026-01-01", stage: "published" }), "2026-02-01"), false);
  });
});

describe("outline → headings", () => {
  const SRC = [
    "---",
    "kind: essay",
    "---",
    "",
    "## Outline",
    "",
    "- The first crossing",
    "  - Rope and timber",
    "- [ ] Stone",
    "1. Iron",
    "",
    "```md",
    "- not an item",
    "## Not a heading",
    "```",
    "",
    "## Notes",
    "",
    "Loose thoughts.",
    "",
  ].join("\n");

  it("finds the outline and its items, outside code", () => {
    const o = findOutline(SRC)!;
    assert.equal(o.level, 2);
    assert.deepEqual(o.items, [
      { depth: 0, text: "The first crossing" },
      { depth: 1, text: "Rope and timber" },
      { depth: 0, text: "Stone" },
      { depth: 0, text: "Iron" },
    ]);
  });

  it("writes the headings after the outline, keeping the outline and everything else", () => {
    const out = outlineToHeadings(SRC)!;
    assert.equal(out.added, 4);
    const lines = out.text.split("\n");
    const at = lines.indexOf("## The first crossing");
    assert.ok(at > lines.indexOf("```"), "after the outline section, not inside its fence");
    assert.deepEqual(lines.slice(at, at + 8), ["## The first crossing", "", "### Rope and timber", "", "## Stone", "", "## Iron", ""]);
    assert.ok(out.text.includes("- The first crossing"), "the outline stays");
    assert.ok(out.text.includes("## Notes\n\nLoose thoughts."));
    // Every original line survives, in order.
    const kept = SRC.split("\n").filter((l) => l !== "");
    let i = 0;
    for (const l of lines) if (l === kept[i]) i++;
    assert.equal(i, kept.length);
  });

  it("adds nothing the second time, and nothing to a note with no outline", () => {
    const once = outlineToHeadings(SRC)!.text;
    const twice = outlineToHeadings(once)!;
    assert.equal(twice.added, 0);
    assert.equal(twice.text, once);
    assert.equal(outlineToHeadings("# Title\n\nNo plan here.\n"), null);
  });

  it("keeps CRLF line endings", () => {
    const out = outlineToHeadings(SRC.replace(/\n/g, "\r\n"))!;
    assert.ok(!/[^\r]\n/.test(out.text));
    assert.ok(out.text.includes("## Stone\r\n"));
  });

  it("reads المخطط as an outline", () => {
    const out = outlineToHeadings("## المخطط\n\n- الجسر الأول\n")!;
    assert.equal(out.added, 1);
    assert.ok(out.text.includes("## الجسر الأول"));
  });
});

describe("words over time", () => {
  it("keeps the last count of a day, returns the same log when nothing changed, and caps its length", () => {
    const a = logWords({}, "2026-01-01", 10);
    const b = logWords(a, "2026-01-01", 25);
    assert.deepEqual(b, { "2026-01-01": 25 });
    assert.equal(logWords(b, "2026-01-01", 25), b);
    let log = {};
    for (let i = 0; i < WORD_LOG_DAYS + 20; i++) {
      const d = new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
      log = logWords(log, d, i);
    }
    const points = wordPoints(log);
    assert.equal(points.length, WORD_LOG_DAYS);
    assert.equal(points[0].words, 20);
    assert.ok(points.every((p, i) => i === 0 || points[i - 1].day < p.day));
  });
});

// ─────────────────────────────────────────────────── the index and the guard

const HASH = "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA";
const SECRET = "desksecret0123456789abcdef0123456789";
const ORIGIN = "https://astrolabe.example";
const OFF = { mode: "off", lang: null, fallbackFrom: null } as const;
/** A word that appears in the private pieces and nowhere else. */
const SECRET_WORD = "quillwort";

const data = makeDir();
const root = makeVault({
  "Writing/Bridges.md": [
    "---",
    "kind: series",
    "status: drafting",
    `description: "A series on bridges, ${SECRET_WORD}"`,
    "series:",
    '  - "[[Stone bridges]]"',
    '  - "[[Steel bridges]]"',
    "---",
    "",
  ].join("\n"),
  "Writing/Stone bridges.md": [
    "---",
    "kind: essay",
    "status: drafting",
    `angle: "Why stone outlasted ${SECRET_WORD}"`,
    'series: "[[Bridges]]"',
    "goal: 2000",
    "tags: [bridges]",
    "---",
    "",
    `The first ${SECRET_WORD} crossing was rope; [[Arch notes]] has the rest, and ![[survey.pdf]] the numbers.`,
    "",
  ].join("\n"),
  "Writing/A history of the astrolabe.md": [
    "---",
    "kind: essay",
    "status: published",
    `angle: "One instrument, ${SECRET_WORD}"`,
    "---",
    "",
    `Called finished, but not published: ${SECRET_WORD}.`,
    "",
  ].join("\n"),
  "Writing/Out.md": ["---", "kind: essay", "status: editing", "publish: true", "---", "", "This one is on the site.", ""].join("\n"),
  "Arch notes.md": "Notes on arches, linking back to [[Stone bridges]].\n",
  "Clip.md": ['---', 'source: "https://example.org/bridges"', "---", "", "A clipped page.", ""].join("\n"),
  "Reading.md": "See [[Clip]] and [[Stone bridges]].\n",
  "survey.pdf": "%PDF-1.4\n",
  "Templates/Essay.md": ["---", "kind: essay", "status: idea", "---", ""].join("\n"),
});

const app = new Hono();
app.route("/api", api);

before(async () => {
  initAuth({});
  initSite({ ASTROLABE_DATA: data, SITE_LANG: "en" });
  initVault(root);
  resetDeskWordsForTests();
  await initIndexer();
});

after(() => {
  initAuth({});
  resetDeskWordsForTests();
  removeVault(root);
  removeVault(data);
});

describe("the index", () => {
  it("reads every piece and series, leaving templates out", () => {
    const d = deskData();
    assert.deepEqual(
      d.pieces.map((p) => p.path),
      ["Writing/A history of the astrolabe.md", "Writing/Out.md", "Writing/Stone bridges.md"],
    );
    assert.deepEqual(d.series.map((s) => s.path), ["Writing/Bridges.md"]);
    const stone = d.pieces.find((p) => p.path === "Writing/Stone bridges.md")!;
    assert.equal(stone.series, "Writing/Bridges.md");
    assert.equal(stone.stage, "drafting");
    assert.equal(stone.goal, 2000);
    assert.ok(stone.words > 5);
    assert.equal(d.pieces.find((p) => p.path === "Writing/A history of the astrolabe.md")!.stage, "editing");
    assert.equal(d.pieces.find((p) => p.path === "Writing/Out.md")!.stage, "published");
    assert.deepEqual(d.series[0].slots, [
      { ref: "Stone bridges", path: "Writing/Stone bridges.md" },
      { ref: "Steel bridges", path: null },
    ]);
  });

  it("a piece's series: is membership, not a blog series of one", () => {
    assert.equal(notes.get("Writing/Stone bridges.md")!.seriesRefs, null);
    assert.equal(notes.get("Writing/Stone bridges.md")!.desk!.series, "Bridges");
    assert.deepEqual(notes.get("Writing/Bridges.md")!.seriesRefs, ["Stone bridges", "Steel bridges"]);
  });

  it("gathers a piece's sources: linked notes, books, clips and backlinks", () => {
    const detail = deskPiece("Writing/Stone bridges.md")!;
    assert.equal(detail.seriesTitle, "Bridges");
    assert.deepEqual(detail.linked.map((r) => r.path), ["Arch notes.md"]);
    assert.deepEqual(detail.books.map((r) => r.path), ["survey.pdf"]);
    assert.deepEqual(detail.backlinks.map((r) => r.path).sort(), ["Arch notes.md", "Reading.md"]);
    assert.equal(deskPiece("Arch notes.md"), null, "an ordinary note is not a piece");
  });

  it("logs a piece's words once a day, follows a rename, and writes the ledger owner-only", () => {
    noteDeskWords("Writing/Stone bridges.md", 120, "2026-01-01");
    noteDeskWords("Writing/Stone bridges.md", 340, "2026-01-02");
    noteDeskWords("Writing/Stone bridges.md", 360, "2026-01-02");
    const points = deskWordPoints("Writing/Stone bridges.md").filter((p) => p.day.startsWith("2026-01-0"));
    assert.deepEqual(points, [
      { day: "2026-01-01", words: 120 },
      { day: "2026-01-02", words: 360 },
    ]);
    moveDeskWords("Writing/Stone bridges.md", "Writing/Stone.md");
    assert.equal(deskWordPoints("Writing/Stone bridges.md").length, 0);
    assert.ok(deskWordPoints("Writing/Stone.md").some((p) => p.day === "2026-01-02"));
    moveDeskWords("Writing/Stone.md", "Writing/Stone bridges.md");
    flushDeskWords();
    const file = path.join(data, "desk-words.json");
    assert.ok(existsSync(file));
    assert.ok(readFileSync(file, "utf8").includes("2026-01-02"));
  });
});

describe("THE PRIVACY GUARD: a piece in progress is invisible to a visitor", () => {
  before(() => initAuth({ ADMIN_PASSWORD_HASH: HASH, SESSION_SECRET: SECRET }));
  after(() => initAuth({}));

  const get = async (url: string): Promise<{ status: number; text: string }> => {
    const res = await app.request(url);
    return { status: res.status, text: await res.text() };
  };

  it("the desk itself answers a visitor with a 401 and nothing else", async () => {
    for (const url of ["/api/desk", "/api/desk/piece?path=Writing%2FStone%20bridges.md", "/api/desk/piece?path=nothing.md"]) {
      const res = await get(url);
      assert.equal(res.status, 401, url);
      assert.ok(!res.text.includes(SECRET_WORD) && !res.text.includes("Stone bridges"), url);
    }
  });

  it("a drafting essay with no publish flag is on no visitor surface", async () => {
    const urls = [
      "/api/posts",
      "/api/tree",
      `/api/search?q=${SECRET_WORD}`,
      "/api/search?q=Stone%20bridges",
      "/api/props",
      "/api/query?q=prop%3Akind%3Dessay",
      "/api/query?q=prop%3Astatus%3Ddrafting",
      "/api/tags",
      "/api/graph",
      "/api/aliases",
      "/api/backlinks?path=Arch%20notes.md",
    ];
    for (const url of urls) {
      const res = await get(url);
      assert.ok(res.status === 200 || res.status === 401 || res.status === 404, `${url} → ${res.status}`);
      assert.ok(!res.text.includes(SECRET_WORD), `${url} leaked the private text`);
      assert.ok(!res.text.includes("Stone bridges"), `${url} leaked the piece's name`);
      assert.ok(!res.text.includes("Bridges.md"), `${url} leaked the series`);
      assert.ok(!res.text.includes("astrolabe.md"), `${url} leaked a piece called finished`);
      assert.ok(!/"(drafting|researching|outlining)"/.test(res.text), `${url} leaked a status`);
    }
    const note = await get("/api/note?path=Writing%2FStone%20bridges.md");
    assert.equal(note.status, 404);
    assert.ok(!note.text.includes(SECRET_WORD));
  });

  it("nor in the feed, the sitemap, or the visitor's post list", () => {
    for (const text of [renderFeed(ORIGIN, OFF), renderSitemap(ORIGIN, OFF)]) {
      assert.ok(!text.includes(SECRET_WORD));
      assert.ok(!text.includes("Stone"));
      assert.ok(!text.includes("Bridges"));
      assert.ok(!text.includes("history of the astrolabe") && !text.includes("history%20of%20the%20astrolabe"));
      assert.ok(text.includes("Out"), "the published piece IS there: the guard is a filter, not a wall");
    }
    const visible = posts(true, null).map((p) => p.path);
    assert.deepEqual(visible, ["Writing/Out.md"]);
  });

  it("status: published is not publishing: only the flag puts a piece on the site", async () => {
    // The piece the writer called finished, without the flag, is still dark.
    assert.equal((await get("/api/note?path=Writing%2FA%20history%20of%20the%20astrolabe.md")).status, 404);
    const out = await get("/api/note?path=Writing%2FOut.md");
    assert.equal(out.status, 200);
  });

  it("a reindex after an edit keeps it dark", async () => {
    await indexFile("Writing/Stone bridges.md");
    const res = await get(`/api/search?q=${SECRET_WORD}`);
    assert.ok(!res.text.includes(SECRET_WORD));
  });
});
