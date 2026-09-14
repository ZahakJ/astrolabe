// The query fence's spec (shared/queryFence.ts) and the prop operator
// (shared/searchQuery.ts): what a fence body asks for.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseQueryFence, queryFenceKind } from "../shared/queryFence.ts";
import { parseSearchQuery } from "../shared/searchQuery.ts";

describe("a query fence", () => {
  it("separates the four keys from the query and defaults the rest", () => {
    const spec = parseQueryFence("tag:reading prop:status=reading\nshow: title, date, status\nsort: modified asc\nlimit: 12\nas: table\n");
    assert.equal(spec.q, "tag:reading prop:status=reading");
    assert.deepEqual(spec.show, ["title", "date", "status"]);
    assert.deepEqual(spec.sort, { key: "modified", dir: "asc" });
    assert.equal(spec.limit, 12);
    assert.equal(spec.as, "table");
  });
  it("treats an unknown key line as query text and caps the limit", () => {
    const spec = parseQueryFence("author: Ibn Sina\nlimit: 9999\n");
    assert.equal(spec.q, "author: Ibn Sina");
    assert.equal(spec.limit, 500);
    assert.equal(spec.as, "list");
    assert.deepEqual(spec.show, ["title", "excerpt"]);
  });
  it("sorts titles ascending by default and everything else descending", () => {
    assert.deepEqual(parseQueryFence("sort: title").sort, { key: "title", dir: "asc" });
    assert.deepEqual(parseQueryFence("sort: date").sort, { key: "date", dir: "desc" });
  });
  it("owns exactly the ```query language", () => {
    assert.equal(queryFenceKind("```query"), "query");
    assert.equal(queryFenceKind("~~~ Query "), "query");
    assert.equal(queryFenceKind("```queryx"), null);
  });
});

describe("the prop operator", () => {
  it("reads key=value, a bare key as presence, and negation", () => {
    const [eq] = parseSearchQuery("prop:Status=Reading").filters;
    assert.equal(eq.kind, "prop");
    assert.equal(eq.key, "status");
    assert.equal(eq.value, "reading");
    const [has] = parseSearchQuery("-prop:author").filters;
    assert.equal(has.key, "author");
    assert.equal(has.value, "");
    assert.equal(has.negated, true);
  });
});
