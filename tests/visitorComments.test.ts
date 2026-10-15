// A published note's comments stay its author's (shared/privateText.ts): what
// a VISITOR's backlinks, search and line expansion can find and quote, against
// what the admin's can.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { backlinks, initIndexer, search, searchMatches } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

const data = makeDir();
const root = makeVault({
  "Target.md": note({ publish: "true" }, "# Target\n\nThe page itself.\n"),
  "Plan.md": note({ publish: "true" }, "Visible prose.\n\n<!-- marmalade: link [[Target]] later -->\n"),
  "Open.md": note({ publish: "true" }, "See [[Target]] for more.\n%% marmalade %%\n"),
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

describe("a visitor and the author's comments", () => {
  it("backlinks: a link only inside a comment is the admin's, not the visitor's", () => {
    const admin = backlinks("Target.md", false, null).map((h) => h.path).sort();
    const visitor = backlinks("Target.md", true, null).map((h) => h.path).sort();
    assert.deepEqual(admin, ["Open.md", "Plan.md"]);
    assert.deepEqual(visitor, ["Open.md"]);
    for (const h of backlinks("Target.md", true, null)) assert.ok(!h.context.includes("marmalade"), h.context);
  });

  it("search: a word only in comments finds nothing for a visitor and is never quoted", () => {
    assert.ok(search("marmalade", false, null).length > 0, "the admin still finds it");
    assert.deepEqual(search("marmalade", true, null), []);
    for (const hit of search("visible", true, null)) assert.ok(!hit.snippet.includes("marmalade"), hit.snippet);
  });

  it("search expansion: no line out of a comment", () => {
    assert.deepEqual(searchMatches("Plan.md", "marmalade", true, null), []);
    assert.ok(searchMatches("Plan.md", "marmalade", false, null).length > 0);
  });
});
