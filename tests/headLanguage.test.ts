// The served head speaks for the POST, whatever its language (server/blog.ts
// injectHead).
//
// The head is built with no reader behind it, and it used to match the post in
// the SITE's language scope. On an Arabic site under "follow" an English post is
// not in that scope, so its permalink came back with the site's name as <title>
// and og:title, the tagline as description and no article meta at all: every
// English link shared from an Arabic site carried the wrong card. Under
// "follow" both languages are on the site (each reader gets their own), so the
// head matches across both. A PINNED filter ("ar"/"en") curates the other
// language off the site, and the head keeps hiding it.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { HEAD_PLACEHOLDER, injectHead, renderFeed } from "../server/blog.ts";
import { initIndexer } from "../server/indexer.ts";
import { patchSettings } from "../server/settings.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

const ORIGIN = "https://astrolabe.example";
const SHELL = `<html lang="en"><head><title>x</title>${HEAD_PLACEHOLDER}</head><body></body></html>`;

const data = makeDir();
const root = makeVault({
  "Sloppy evolution.md": note(
    { publish: "true", date: "2026-05-04" },
    "Evolution is sloppy, and the fossil record shows it on every page.\n",
  ),
  "مقالة.md": note({ publish: "true", date: "2026-05-03" }, "فقرة عربية كاملة تكفي لتصنيف اللغة في هذا الاختبار.\n"),
});

const meta = (html: string, property: string): string | null =>
  html.match(new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)"`))?.[1] ?? null;
const title = (html: string): string | null => html.match(/<title>([^<]*)<\/title>/)?.[1] ?? null;

before(async () => {
  initSite({ ASTROLABE_DATA: data });
  initVault(root);
  await initIndexer();
  patchSettings({ siteName: "أسطرلاب", language: "ar", languageFilter: "follow" });
});

after(() => {
  removeVault(root);
  removeVault(data);
});

describe("injectHead on an Arabic site under follow", () => {
  it("an English post gets its own title, description, type and locale", () => {
    const html = injectHead(SHELL, ORIGIN, "/Sloppy%20evolution");
    assert.equal(title(html), "Sloppy Evolution — أسطرلاب");
    assert.equal(meta(html, "og:title"), "Sloppy Evolution — أسطرلاب");
    assert.match(meta(html, "description") ?? "", /^Evolution is sloppy/);
    assert.match(meta(html, "og:description") ?? "", /^Evolution is sloppy/);
    assert.equal(meta(html, "og:type"), "article");
    assert.equal(meta(html, "og:locale"), "en_US");
  });

  it("an Arabic post gets its own head and the Arabic locale", () => {
    const html = injectHead(SHELL, ORIGIN, `/${encodeURIComponent("مقالة")}`);
    assert.equal(title(html), "مقالة — أسطرلاب");
    assert.match(meta(html, "og:description") ?? "", /^فقرة عربية/);
    assert.equal(meta(html, "og:locale"), "ar_AR");
  });

  it("a non-post page keeps the site's meta in the site's locale", () => {
    const html = injectHead(SHELL, ORIGIN, "/");
    assert.equal(title(html), "أسطرلاب");
    assert.equal(meta(html, "og:type"), "website");
    assert.equal(meta(html, "og:locale"), "ar_AR");
  });
});

describe("injectHead under a pinned filter", () => {
  it("keeps a post the filter curates off the site out of the head", () => {
    patchSettings({ languageFilter: "ar" });
    try {
      const html = injectHead(SHELL, ORIGIN, "/Sloppy%20evolution");
      assert.equal(title(html), "أسطرلاب");
      assert.equal(meta(html, "og:type"), "website");
    } finally {
      patchSettings({ languageFilter: "follow" });
    }
  });
});

describe("the other language's feed on an Arabic site (2026-11 purge, P4)", () => {
  it("/feed.xml?lang=en declares English and points rel=self at itself", () => {
    const feed = renderFeed(ORIGIN, { mode: "follow", lang: "en", fallbackFrom: null });
    assert.match(feed, /<language>en<\/language>/);
    assert.match(feed, /<atom:link href="https:\/\/astrolabe\.example\/feed\.xml\?lang=en" rel="self"/);
    assert.match(feed, /Sloppy Evolution/);
  });
  it("the site's own feed keeps its locale and plain address", () => {
    const feed = renderFeed(ORIGIN, { mode: "follow", lang: "ar", fallbackFrom: null });
    assert.match(feed, /<language>ar<\/language>/);
    assert.match(feed, /<atom:link href="https:\/\/astrolabe\.example\/feed\.xml" rel="self"/);
  });
});
