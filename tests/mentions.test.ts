// Unlinked mentions and the query walk (server/indexer.ts mentions(),
// queryNotes(), the prop: filter) over a fixture vault.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { initIndexer, mentions, queryNotes, linkSpellingFor } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

const data = makeDir();
const root = makeVault({
  "Ledger.md": note({ aliases: "[the book of accounts]", status: "reading", author: "Ibn Sina" }, "A ledger.\n"),
  "Journal/Monday.md": "Read the Ledger today, then wrote in the book of accounts. `Ledger` in code does not count.\n\n```\nLedger in a fence\n```\n",
  "Journal/Tuesday.md": "Already linked: [[Ledger]] again. Ledgers (plural) do not count.\n",
  "Journal/Wednesday.md": note({ status: "done", date: "2024-01-05" }, "Nothing here.\n"),
  "Templates/Stencil.md": "Ledger stencil — templates are skipped.\n",
});

before(async () => {
  initSite({ ASTROLABE_DATA: data });
  initVault(root);
  await initIndexer();
});
after(() => {
  removeVault(root);
  removeVault(data);
});

describe("unlinked mentions", () => {
  it("finds the title and an alias as whole words, outside links, code and templates", () => {
    const rows = mentions("Ledger.md");
    const where = rows.map((r) => `${r.path}:${r.line}:${r.phrase}`);
    assert.deepEqual(where, ["Journal/Monday.md:1:Ledger"]);
    assert.equal(rows[0].start, 9);
    assert.equal(rows[0].end, 15);
  });
  it("spells the link by title when the basename is unique", () => {
    assert.equal(linkSpellingFor("Ledger.md"), "Ledger");
  });
});

describe("the query walk", () => {
  it("filters by frontmatter property and sorts as asked, uncapped by the sidebar's fifty", () => {
    const reading = queryNotes("prop:status=reading", false, null, { key: "title", dir: "asc" }, 100);
    assert.deepEqual(reading.map((h) => h.path), ["Ledger.md"]);
    assert.equal(reading[0].props.author, "Ibn Sina");
    const any = queryNotes("prop:status", false, null, { key: "title", dir: "asc" }, 100);
    assert.deepEqual(any.map((h) => h.path), ["Ledger.md", "Journal/Wednesday.md"]);
    const none = queryNotes("-prop:status", false, null, { key: "path", dir: "asc" }, 2);
    assert.equal(none.length, 2);
  });
});
