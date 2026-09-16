import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cacheName, cacheable, classify, isOurCache } from "../shared/offlinePolicy.ts";

describe("offline policy", () => {
  it("keeps the shell, the assets and a note's reads; bypasses everything else", () => {
    assert.equal(classify("GET", "/"), "shell");
    assert.equal(classify("GET", "/Books/Muqaddimah"), "shell");
    assert.equal(classify("GET", "/routines"), "shell");
    assert.equal(classify("GET", "/assets/index-abc123.js"), "asset");
    assert.equal(classify("GET", "/pdfjs/wasm/openjpeg.wasm"), "asset");
    assert.equal(classify("GET", "/favicon.svg"), "asset");
    // The manifest is generated from settings: kept, but never pinned.
    assert.equal(classify("GET", "/manifest.webmanifest"), "note");
    assert.equal(classify("GET", "/manifest-icon.svg"), "note");
    assert.equal(classify("GET", "/api/note?path=A.md"), "bypass"); // the worker strips the query first
    assert.equal(classify("GET", "/api/note"), "note");
    assert.equal(classify("GET", "/api/tree"), "note");
    assert.equal(classify("GET", "/api/me"), "note");
    assert.equal(classify("GET", "/api/search"), "bypass");
    assert.equal(classify("GET", "/api/file"), "bypass");
    assert.equal(classify("POST", "/api/note"), "bypass");
    assert.equal(classify("GET", "/sw.js"), "bypass");
    assert.equal(classify("GET", "/feed.xml"), "bypass");
  });
  it("names one cache per build and keeps only clean 200s", () => {
    assert.equal(cacheName("3.13.0"), "astrolabe-offline-3.13.0");
    assert.equal(isOurCache("astrolabe-offline-3.12.1"), true);
    assert.equal(isOurCache("workbox-precache"), false);
    assert.equal(cacheable(200, "basic"), true);
    assert.equal(cacheable(401, "basic"), false);
    assert.equal(cacheable(206, "basic"), false);
    assert.equal(cacheable(200, "opaque"), false);
  });
});
