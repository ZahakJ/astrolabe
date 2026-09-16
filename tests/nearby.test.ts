import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TERMS_PER_NOTE,
  TermTable,
  countTerms,
  documentFrequency,
  internTerms,
  nearest,
  similarity,
  weigh,
  type NearbyCandidate,
} from "../shared/nearby.ts";

/** A tiny vault: the notes tokenized, interned, weighed. */
function build(notes: Record<string, { text: string; tags?: string[] }>) {
  const table = new TermTable();
  const vectors = new Map(Object.entries(notes).map(([path, n]) => [path, internTerms(countTerms(n.text, n.tags ?? [], path), table)]));
  const df = documentFrequency(vectors.values(), table.size);
  const weighed = new Map([...vectors].map(([path, v]) => [path, weigh(v, df, vectors.size)]));
  const candidates = (except: string): NearbyCandidate[] =>
    [...weighed].filter(([p]) => p !== except).map(([path, vector]) => ({ path, title: path, vector }));
  return { table, weighed, candidates };
}

describe("countTerms", () => {
  it("folds, drops short words and bare numbers, and keeps marks with their letters", () => {
    const c = countTerms("A résumé, a Resume — 2024 — and «الْمُقَدِّمَة» beside «المقدمة».");
    assert.equal(c.get("resume"), 2);
    assert.equal(c.get("المقدمه"), 2); // ة folds to ه, as in search
    assert.equal(c.has("a"), false);
    assert.equal(c.has("«"), false);
    assert.equal(c.has("2024"), false);
    assert.equal(c.get("and"), 1);
  });
  it("hands back the author's first spelling of each folded term, case aside", () => {
    const spellings = new Map<string, string>();
    countTerms("«الْمُقَدِّمَة» then «المقدمة»; a Résumé and a resume.", ["#Book/History"], "", spellings);
    assert.equal(spellings.get("المقدمه"), "الْمُقَدِّمَة");
    assert.equal(spellings.get("resume"), "résumé");
    assert.equal(spellings.get("#book/history"), "#Book/History");
    assert.equal(spellings.get("#book"), "#Book");
  });
  it("weighs tags and titles more than a word, and a nested tag as its parent too", () => {
    const c = countTerms("plain words", ["#Book/History"], "Words of History");
    assert.equal(c.get("#book/history"), 4);
    assert.equal(c.get("#book"), 2);
    assert.equal(c.get("words"), 3); // once in the text, twice for the title
    assert.equal(c.get("history"), 2);
  });
  it("keeps the most frequent terms only, the author's first at a tie", () => {
    const many = Array.from({ length: TERMS_PER_NOTE + 50 }, (_, i) => `word${i}`).join(" ");
    const c = countTerms(`${many} word330 word330 word330`);
    assert.equal(c.size, TERMS_PER_NOTE);
    assert.equal([...c.keys()][0], "word330");
    assert.equal(c.has("word0"), true);
    assert.equal(c.has("word349"), false);
  });
});

describe("TermTable", () => {
  it("shows a term by its kept spelling and falls back to the folded name", () => {
    const table = new TermTable();
    const spellings = new Map<string, string>();
    const counts = countTerms("الْمُقَدِّمَة résumé plain", [], "", spellings);
    internTerms(counts, table, spellings);
    assert.equal(table.shownOf(table.idOf("المقدمه")), "الْمُقَدِّمَة");
    assert.equal(table.shownOf(table.idOf("resume")), "résumé");
    assert.equal(table.shownOf(table.idOf("plain")), "plain");
    // The first spelling offered wins; a later note cannot respell the word.
    table.spell("resume", "RESUME");
    assert.equal(table.shownOf(table.idOf("resume")), "résumé");
  });
  it("nearest names the ties by their spelling", () => {
    const table = new TermTable();
    const docs = { a: "الْمُقَدِّمَة العصبية كتاب", b: "المقدمة العصبية دولة", c: "خبز وماء" };
    const vectors = new Map(
      Object.entries(docs).map(([p, text]) => {
        const spellings = new Map<string, string>();
        return [p, internTerms(countTerms(text, [], "", spellings), table, spellings)];
      }),
    );
    const df = documentFrequency(vectors.values(), table.size);
    const weighed = new Map([...vectors].map(([p, v]) => [p, weigh(v, df, vectors.size)]));
    const hits = nearest(weighed.get("a")!, [{ path: "b", title: "b", vector: weighed.get("b")! }, { path: "c", title: "c", vector: weighed.get("c")! }], table);
    assert.equal(hits[0].path, "b");
    assert.deepEqual([...hits[0].terms].sort(), ["العصبية", "الْمُقَدِّمَة"].sort());
  });
});

describe("weigh", () => {
  it("a word in every note weighs nothing; a rare word weighs more than a common one", () => {
    const { table, weighed } = build({
      a: { text: "the cat sat on the mat" },
      b: { text: "the dog sat on the log" },
      c: { text: "the bird sang" },
    });
    const a = weighed.get("a")!;
    const names = [...a.ids].map((id) => table.names[id]);
    assert.equal(names.includes("the"), false);
    const weightOf = (term: string) => a.weights[names.indexOf(term)];
    assert.ok(weightOf("cat") > weightOf("sat"), "cat (in 1 note) outweighs sat (in 2)");
    assert.ok(a.norm > 0);
  });
});

describe("similarity and nearest", () => {
  const vault = {
    "Physics/Entropy": { text: "Entropy counts the microstates of a system; the second law says entropy never falls in an isolated system.", tags: ["physics"] },
    "Physics/Heat": { text: "Heat flows from hot to cold, and the entropy of the isolated system rises as it does. Carnot bounded every engine.", tags: ["physics"] },
    "Kitchen/Bread": { text: "Flour, water, salt, and time. The dough proves overnight and bakes in a hot oven.", tags: ["recipes"] },
    "Kitchen/Soup": { text: "Onions sweat slowly in butter; add stock, simmer, and salt at the end.", tags: ["recipes"] },
    "Journal/Monday": { text: "Woke late. Read a little about entropy on the train, then made soup.", tags: [] },
  };
  it("ranks the note that shares rare words and a tag first, with the terms that tie them", () => {
    const { table, weighed, candidates } = build(vault);
    const hits = nearest(weighed.get("Physics/Entropy")!, candidates("Physics/Entropy"), table);
    assert.equal(hits[0].path, "Physics/Heat");
    assert.deepEqual(hits[0].terms.length, 2);
    assert.ok(hits[0].terms.every((t) => ["#physics", "physics", "entropy", "isolated", "system"].includes(t)), hits[0].terms.join(","));
    assert.ok(hits.every((h) => h.path !== "Physics/Entropy"));
    assert.ok(hits.every((h, i) => i === 0 || hits[i - 1].score >= h.score));
  });
  it("is symmetric and bounded", () => {
    const { weighed } = build(vault);
    const ab = similarity(weighed.get("Kitchen/Bread")!, weighed.get("Kitchen/Soup")!);
    const ba = similarity(weighed.get("Kitchen/Soup")!, weighed.get("Kitchen/Bread")!);
    assert.ok(Math.abs(ab.score - ba.score) < 1e-6);
    assert.ok(ab.score > 0 && ab.score <= 1);
    assert.equal(similarity(weighed.get("Kitchen/Bread")!, weighed.get("Kitchen/Bread")!).score > 0.999, true);
  });
  it("leaves strangers out and honours the limit", () => {
    const { table, weighed, candidates } = build(vault);
    const all = nearest(weighed.get("Kitchen/Bread")!, candidates("Kitchen/Bread"), table, 10, 0);
    assert.equal(all.length, 4);
    const two = nearest(weighed.get("Kitchen/Bread")!, candidates("Kitchen/Bread"), table, 2, 0);
    assert.equal(two.length, 2);
    // A high bar leaves the cooking notes and drops the physics.
    const near = nearest(weighed.get("Kitchen/Bread")!, candidates("Kitchen/Bread"), table, 10, 0.1);
    assert.ok(near.every((h) => h.path.startsWith("Kitchen/") || h.path.startsWith("Journal/")), near.map((h) => h.path).join(","));
  });
  it("an empty note is nobody's neighbour", () => {
    const { table, weighed, candidates } = build({ ...vault, "Empty": { text: "" } });
    assert.deepEqual(nearest(weighed.get("Empty")!, candidates("Empty"), table), []);
  });
});
