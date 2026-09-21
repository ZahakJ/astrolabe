// Linguistic twins: one note, two faces (shared/twins.ts, server/indexer.ts).
//
// The owner writes the same post in English and in Arabic and wants the pair
// to behave like one note that can be turned over. Everything about that rests
// on ONE frontmatter line, so these tests pin what that line means:
//
//   * what a declaration parses to — wikilink, bare path, list, junk;
//   * SYMMETRY: one declaration is enough, and the other note knows;
//   * the INCONSISTENCY rule: when both declare and disagree, each note keeps
//     the twin its own line names, and the pair says it disagrees;
//   * AT MOST ONE twin, whoever claims whom;
//   * the LINK-TIME SWAP: a link the reader's language cannot follow lands on
//     the face they can — and never, ever in the editor;
//   * the STALE rule: a minute of grace and then a dot;
//   * /api/posts under "follow": one face per reader, and both under "off".
//
// A face is not a translation: two faces of one note may be in ONE language
// (a long version and a short one), and the public-site half of the feature —
// the ع/EN switch, hreflang, one-face-per-reader — applies only when the two
// languages actually differ. That split is tested here too.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { graph, backlinks, initIndexer, posts, twinOf, twinFaceOf, twinPairs, twinSwapTable, twinLanguagesDiffer } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import {
  cleanTwinRef,
  defaultTwinName,
  facesDiffer,
  parseFace,
  parseTwinRef,
  readerFace,
  shortFace,
  twinFaceLabel,
  twinIsStale,
  twinSwapKey,
  TWIN_STALE_MS,
} from "../shared/twins.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

// Real prose, not lorem: the language filter counts Arabic letters against
// Latin ones in a note's PROSE, so a fixture written in placeholder text would
// be testing the placeholder.
const EN_BODY =
  "A quantum computer is not a faster Turing machine. It is a different bargain: you trade certainty for interference, and you get an answer that is only probably right.\n";
const AR_BODY =
  "الحاسوب الكمّي ليس آلة تورنغ أسرع. إنه مقايضة من نوع آخر: تتنازل عن اليقين مقابل التداخل، فتخرج بجواب صحيح على الأرجح لا غير.\n";
const EN_LONG =
  "The long version of the same argument, with the detour through the double slit that the short one leaves out, and the paragraph about measurement that nobody asked for.\n";

const data = makeDir();
const root = makeVault({
  // A bilingual pair. Only the ENGLISH side declares the twin — one line is
  // enough, and the Arabic side must know all the same.
  "Quantum.md": note({ publish: "true", date: "2026-01-02", twin: "[[الكم]]" }, EN_BODY),
  "الكم.md": note({ publish: "true", date: "2026-01-02" }, AR_BODY),
  // A same-language pair, both sides declaring, each naming itself.
  "Slit short.md": note({ publish: "true", date: "2026-02-02", twin: "[[Slit long]]", face: "short" }, EN_BODY),
  "Slit long.md": note({ publish: "true", date: "2026-02-02", twin: "[[Slit short]]", face: "long" }, EN_LONG),
  // A pair that disagrees: Left says Right, Right says Elsewhere.
  "Left.md": note({ publish: "true", twin: "[[Right]]" }, EN_BODY),
  "Right.md": note({ publish: "true", twin: "[[Elsewhere]]" }, EN_BODY),
  "Elsewhere.md": note({ publish: "true" }, EN_BODY),
  // A note linking the English face of the bilingual pair, from Arabic.
  "مقالة.md": note({ publish: "true", date: "2025-06-06" }, `${AR_BODY}\nانظر [[Quantum]] لتفصيل أوفى.\n`),
  // …and one linking it from English.
  "Reading list.md": note({ publish: "true", date: "2025-06-06" }, `${EN_BODY}\nSee [[Quantum]] for the long way round.\n`),
  "Untwinned.md": note({ publish: "true" }, EN_BODY),
});

before(async () => {
  initSite({ ASTROLABE_DATA: data, SITE_LANG: "en" });
  initVault(root);
  await initIndexer();
});

after(() => {
  removeVault(root);
  removeVault(data);
});

describe("the declaration", () => {
  it("unwraps a wikilink, an anchor and a pipe alias", () => {
    assert.equal(parseTwinRef({ twin: "[[Other Note]]" }), "Other Note");
    assert.equal(parseTwinRef({ twin: "[[Other Note|the Arabic one]]" }), "Other Note");
    assert.equal(parseTwinRef({ twin: "[[Other Note#Introduction]]" }), "Other Note");
    assert.equal(cleanTwinRef("  [[ Spaced ]]  "), "Spaced");
  });

  it("accepts a bare path, because that is what the tree hands you", () => {
    assert.equal(parseTwinRef({ twin: "posts/مقالة.md" }), "posts/مقالة.md");
  });

  it("takes the first item of a list — a note has at most one twin", () => {
    assert.equal(parseTwinRef({ twin: ["[[First]]", "[[Second]]"] }), "First");
  });

  it("answers null for everything that is not a name", () => {
    assert.equal(parseTwinRef({}), null);
    assert.equal(parseTwinRef({ twin: "" }), null);
    assert.equal(parseTwinRef({ twin: "   " }), null);
    assert.equal(parseTwinRef({ twin: true }), null);
    assert.equal(parseTwinRef({ twin: { path: "x" } }), null);
  });

  it("reads a face label, one line and bounded", () => {
    assert.equal(parseFace({ face: "  short " }), "short");
    assert.equal(parseFace({ face: "" }), null);
    assert.equal(parseFace({}), null);
    assert.equal(parseFace({ face: "a".repeat(200) })?.length, 24);
  });
});

describe("symmetry", () => {
  it("makes one declaration enough", () => {
    assert.equal(twinOf("Quantum.md")?.path, "الكم.md");
    // The Arabic side never said a word about it.
    assert.equal(twinOf("الكم.md")?.path, "Quantum.md");
    assert.equal(twinOf("الكم.md")?.inconsistent, false);
  });

  it("leaves a note with no twin alone", () => {
    assert.equal(twinOf("Untwinned.md"), null);
    assert.equal(twinFaceOf("Untwinned.md"), null);
  });

  it("carries the other face's language, label and title", () => {
    const face = twinFaceOf("Quantum.md");
    assert.equal(face?.path, "الكم.md");
    assert.equal(face?.lang, "ar");
    assert.equal(face?.differs, true);
    assert.equal(face?.face, null);
    const short = twinFaceOf("Slit short.md");
    assert.equal(short?.face, "long");
    assert.equal(short?.lang, "en");
    // Two English faces: the public site's language machinery stands down.
    assert.equal(short?.differs, false);
    assert.equal(twinLanguagesDiffer("Slit short.md"), false);
    assert.equal(twinLanguagesDiffer("Quantum.md"), true);
  });
});

describe("the inconsistency rule", () => {
  it("lets each note keep the twin its OWN line names", () => {
    // Left says Right; Right says Elsewhere. Neither is overruled.
    assert.equal(twinOf("Left.md")?.path, "Right.md");
    assert.equal(twinOf("Right.md")?.path, "Elsewhere.md");
  });

  it("says the pair disagrees, on both sides of the disagreement", () => {
    assert.equal(twinOf("Left.md")?.inconsistent, true);
    assert.equal(twinOf("Right.md")?.inconsistent, true);
  });

  it("gives the note NOBODY declares the one pointing at it", () => {
    assert.equal(twinOf("Elsewhere.md")?.path, "Right.md");
    assert.equal(twinOf("Elsewhere.md")?.inconsistent, false);
  });

  it("puts every twinned note in the wire table, both directions", () => {
    const paths = twinPairs().map((p) => p.path);
    assert.ok(paths.includes("Quantum.md"));
    assert.ok(paths.includes("الكم.md"));
    assert.ok(!paths.includes("Untwinned.md"));
    const row = twinPairs().find((p) => p.path === "Quantum.md");
    assert.equal(row?.twin, "الكم.md");
    assert.equal(row?.twinLang, "ar");
    assert.equal(row?.lang, "en");
  });
});

describe("the link-time swap", () => {
  it("leaves a link alone when there is no reader language", () => {
    const sides = {
      self: { path: "Quantum.md", arabic: false, reachable: true },
      twin: { path: "الكم.md", arabic: true, reachable: true },
    };
    assert.equal(readerFace(sides, null), "Quantum.md");
  });

  it("swaps to the face the reader can read", () => {
    const sides = {
      self: { path: "Quantum.md", arabic: false, reachable: true },
      twin: { path: "الكم.md", arabic: true, reachable: true },
    };
    assert.equal(readerFace(sides, "ar"), "الكم.md");
    assert.equal(readerFace(sides, "en"), "Quantum.md");
  });

  it("never swaps onto a face the reader cannot reach", () => {
    const sides = {
      self: { path: "Quantum.md", arabic: false, reachable: true },
      twin: { path: "الكم.md", arabic: true, reachable: false },
    };
    assert.equal(readerFace(sides, "ar"), "Quantum.md");
  });

  it("never swaps a SAME-LANGUAGE pair — neither face is more readable", () => {
    const sides = {
      self: { path: "Slit short.md", arabic: false, reachable: true },
      twin: { path: "Slit long.md", arabic: false, reachable: true },
    };
    assert.equal(readerFace(sides, "ar"), "Slit short.md");
    assert.equal(readerFace(sides, "en"), "Slit short.md");
  });

  it("treats a note with no prose letters as already right", () => {
    const sides = {
      self: { path: "Numbers.md", arabic: null, reachable: true },
      twin: { path: "الكم.md", arabic: true, reachable: true },
    };
    assert.equal(readerFace(sides, "en"), "Numbers.md");
  });

  it("reduces a target the way the resolver does", () => {
    assert.equal(twinSwapKey("Quantum"), "quantum");
    assert.equal(twinSwapKey("Quantum.md"), "quantum");
    assert.equal(twinSwapKey("Quantum#Heading"), "quantum");
    assert.equal(twinSwapKey("Quantum|shown"), "quantum");
    assert.equal(twinSwapKey("./posts/Quantum.md"), "posts/quantum");
  });

  it("builds a table for an Arabic reader and NONE for the editor", () => {
    const forArabic = twinSwapTable("ar");
    // The English face is hidden from this reader; its Arabic face is not.
    assert.equal(forArabic["quantum"], "الكم.md");
    assert.equal(forArabic["quantum.md"], undefined, "keys are extension-free");
    // Admin scope: no language, no swap, ever.
    assert.deepEqual(twinSwapTable(null), {});
    // An English reader needs no swap for a note they can already read.
    assert.equal(twinSwapTable("en")["quantum"], undefined);
  });
});

describe("the stale rule", () => {
  it("gives a minute of grace, then says so", () => {
    const now = Date.now();
    assert.equal(twinIsStale(now, now), false);
    assert.equal(twinIsStale(now, now - TWIN_STALE_MS), false);
    assert.equal(twinIsStale(now, now - TWIN_STALE_MS - 1), true);
    // The other way round is not stale: this face is the OLD one.
    assert.equal(twinIsStale(now - 86_400_000, now), false);
  });
});

describe("what the pill says", () => {
  const titles = { here: "Quantum", there: "الكم" };

  it("says the two languages when they differ and neither face is named", () => {
    const opts = { named: false, langsDiffer: true };
    assert.equal(twinFaceLabel(null, "en", titles.here, opts), "EN");
    assert.equal(twinFaceLabel(null, "ar", titles.there, opts), "ع");
  });

  it("prefers the faces' own labels once either side names itself", () => {
    const opts = { named: true, langsDiffer: false };
    assert.equal(twinFaceLabel("short", "en", "Slit short", opts), "short");
    assert.equal(twinFaceLabel("long", "en", "Slit long", opts), "long");
  });

  it("falls back to the titles when nothing else tells them apart", () => {
    const opts = { named: false, langsDiffer: false };
    assert.equal(twinFaceLabel(null, "en", "Slit short", opts), "Slit short");
  });

  it("keeps a long title inside a pill", () => {
    assert.equal(shortFace("Quantum"), "Quantum");
    assert.ok(shortFace("A very long note title that nobody would put in a bar").length <= 25);
  });

  it("knows when two faces are in one language", () => {
    assert.equal(facesDiffer("en", "ar"), true);
    assert.equal(facesDiffer("en", "en"), false);
    assert.equal(facesDiffer(null, "ar"), false);
  });
});

describe("the default name Create twin offers", () => {
  it("suffixes the other language, once", () => {
    assert.equal(defaultTwinName("Quantum", "ar"), "Quantum — ar");
    assert.equal(defaultTwinName("Quantum — ar", "ar"), "Quantum — ar");
    assert.equal(defaultTwinName("الكم", "en"), "الكم — en");
  });
});

describe("the public lists", () => {
  it("shows ONE face of a bilingual pair to each reader under follow", () => {
    const ar = posts(true, "ar").map((p) => p.path);
    const en = posts(true, "en").map((p) => p.path);
    assert.ok(ar.includes("الكم.md"));
    assert.ok(!ar.includes("Quantum.md"), "the English face is not this reader's");
    assert.ok(en.includes("Quantum.md"));
    assert.ok(!en.includes("الكم.md"));
  });

  it("shows BOTH under off — they are two files, and that is honest", () => {
    const all = posts(true, null).map((p) => p.path);
    assert.ok(all.includes("Quantum.md"));
    assert.ok(all.includes("الكم.md"));
  });

  it("lists BOTH faces of a same-language pair to the same reader", () => {
    const en = posts(true, "en").map((p) => p.path);
    assert.ok(en.includes("Slit short.md"));
    assert.ok(en.includes("Slit long.md"));
  });

  it("carries the other face on the post, unfiltered", () => {
    // The whole point: an Arabic reader's copy of the Arabic post still names
    // the English face, because that is where ع/EN has to be able to send an
    // English reader who lands on it.
    const arabic = posts(true, "ar").find((p) => p.path === "الكم.md");
    assert.equal(arabic?.twin?.path, "Quantum.md");
    assert.equal(arabic?.twin?.lang, "en");
  });
});

describe("the graph and the backlinks panel", () => {
  it("draws a bilingual pair as ONE node for a visitor", () => {
    const ar = graph(true, "ar");
    const ids = ar.nodes.map((n) => n.id);
    assert.ok(ids.includes("الكم.md"), "labelled by the reader's own face");
    assert.ok(!ids.includes("Quantum.md"));
    const en = graph(true, "en");
    const enIds = en.nodes.map((n) => n.id);
    assert.ok(enIds.includes("Quantum.md"));
    assert.ok(!enIds.includes("الكم.md"));
  });

  it("keeps both files in the ADMIN graph — there it is a map of files", () => {
    const ids = graph(false, null).nodes.map((n) => n.id);
    assert.ok(ids.includes("Quantum.md"));
    assert.ok(ids.includes("الكم.md"));
  });

  it("shows either face the links to BOTH — the pair is one idea", () => {
    const sources = backlinks("الكم.md", false, null).map((b) => b.path);
    // مقالة links the Arabic face's twin; Reading list links it in English.
    assert.ok(sources.includes("Reading list.md"), "an English link reaches the Arabic face");
    assert.ok(sources.includes("مقالة.md"));
    // …and the same set from the other side.
    const other = backlinks("Quantum.md", false, null).map((b) => b.path);
    assert.deepEqual(new Set(other), new Set(sources));
  });

  it("never reports a face as its own backlink", () => {
    for (const hit of backlinks("Quantum.md", false, null)) {
      assert.notEqual(hit.path, "الكم.md");
      assert.notEqual(hit.path, "Quantum.md");
    }
  });
});
