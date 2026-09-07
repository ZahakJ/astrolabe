// A renamed site keeps its old links (server/site.ts::legacyRedirectTarget).
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "https://astrolabe.example.com/";
process.env.LEGACY_HOSTS = "alchemy.example.com, Old.Example.com:8080";
const { initSite, legacyRedirectTarget } = await import("../server/site.ts");
initSite();

test("an old name is sent to the canonical origin with its path and query", () => {
  assert.equal(legacyRedirectTarget("alchemy.example.com", "/notes/x", "?a=1"), "https://astrolabe.example.com/notes/x?a=1");
  assert.equal(legacyRedirectTarget("OLD.example.com:443", "/", ""), "https://astrolabe.example.com/");
});

test("the canonical host, an unknown host and a missing header stay put", () => {
  assert.equal(legacyRedirectTarget("astrolabe.example.com", "/", ""), null);
  assert.equal(legacyRedirectTarget("someone-else.example.com", "/", ""), null);
  assert.equal(legacyRedirectTarget(undefined, "/", ""), null);
});
