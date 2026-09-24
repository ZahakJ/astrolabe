// Webmentions, the pure half (shared/mentions.ts): reading a source page as
// microformats2, checking it links to the target, finding a site's endpoint,
// and listing a note's links to other sites the way the reading view renders
// them. No network: the fixtures under tests/fixtures/mentions are read from
// disk with the target's address written in.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { discoverEndpoint, linksTo, normalizeUrl, outboundLinks, parseMention, sameUrl } from "../shared/mentions.ts";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "mentions");
const TARGET = "https://blog.example/Essays/On%20Reading";
const SOURCE = "https://other.example/posts/1";
const fixture = (name: string): string => readFileSync(path.join(FIX, name), "utf8").replaceAll("{{TARGET}}", TARGET);

describe("reading a source as microformats2", () => {
  it("a u-like-of the target is a like, with the h-card author and its photo", () => {
    const m = parseMention(fixture("like.html"), SOURCE, TARGET);
    assert.equal(m.type, "like");
    assert.equal(m.author?.name, "Layla Reader");
    assert.equal(m.author?.url, "https://liker.example");
    assert.equal(m.author?.photo, "https://other.example/me.jpg");
    assert.equal(m.url, "https://other.example/likes/1");
  });

  it("a u-repost-of an h-cite whose u-url is the target is a repost", () => {
    const m = parseMention(fixture("repost.html"), SOURCE, TARGET);
    assert.equal(m.type, "repost");
    assert.equal(m.author?.name, "Omar");
    assert.equal(m.author?.url, "https://omar.example");
  });

  it("a u-in-reply-to the target is a reply, its e-content the summary", () => {
    const m = parseMention(fixture("reply.html"), SOURCE, TARGET);
    assert.equal(m.type, "reply");
    assert.equal(m.author?.name, "Sam Writer");
    assert.equal(m.summary, "I disagree with the second paragraph, kindly. The rest is right.");
    assert.equal(m.published, Date.parse("2026-09-01T10:00:00Z"));
  });

  it("an entry that only links is a mention; a nested entry's reply is not its own; the page's h-card is the author", () => {
    const m = parseMention(fixture("mention.html"), SOURCE, TARGET);
    assert.equal(m.type, "mention");
    assert.equal(m.name, "Links of the week");
    assert.equal(m.author?.name, "The Weekly");
  });

  it("a page with no h-entry is a mention named by its title", () => {
    const m = parseMention(fixture("plain.html"), SOURCE, TARGET);
    assert.equal(m.type, "mention");
    assert.equal(m.author, null);
    assert.equal(m.name, "Just a page");
  });

  it("a like of ANOTHER page is not a like of this one", () => {
    const html = fixture("like.html").replace(`class="u-like-of" href="${TARGET}"`, 'class="u-like-of" href="https://elsewhere.example/x"');
    assert.equal(parseMention(html, SOURCE, TARGET).type, "mention");
  });
});

describe("does the source link to the target", () => {
  it("an anchor counts, spelled with a trailing slash or a fragment or decoded", () => {
    assert.equal(linksTo(fixture("like.html"), SOURCE, [TARGET]), true);
    assert.equal(linksTo(`<a href="${TARGET}/#comments">x</a>`, SOURCE, [TARGET]), true);
    assert.equal(linksTo('<a href="https://blog.example/Essays/On Reading">x</a>', SOURCE, [TARGET]), true);
  });

  it("an address spelled out in words does not", () => {
    assert.equal(linksTo(fixture("nolink.html"), SOURCE, [TARGET]), false);
  });

  it("a relative link resolves against the source", () => {
    assert.equal(linksTo('<a href="/Essays/On%20Reading">x</a>', "https://blog.example/other", [TARGET]), true);
  });
});

describe("finding an endpoint", () => {
  const page = "https://site.example/a/post";
  it("the Link header wins, relative to the page", () => {
    assert.equal(discoverEndpoint('<https://x.example/other>; rel="other", </wm>; rel="webmention"', "", page), "https://site.example/wm");
    assert.equal(discoverEndpoint('<wm?x=1>; rel="webmention nofollow"', "", page), "https://site.example/a/wm?x=1");
  });

  it("then the first <link> or <a> with rel=webmention, in document order", () => {
    assert.equal(discoverEndpoint(null, '<a rel="webmention" href="/a-first">x</a><link rel="webmention" href="/second">', page), "https://site.example/a-first");
    assert.equal(discoverEndpoint(null, '<head><link rel="me" href="/x"><link rel="webmention" href="https://wm.example/e"></head>', page), "https://wm.example/e");
  });

  it("an empty href is the page itself; none is null", () => {
    assert.equal(discoverEndpoint(null, '<link rel="webmention" href="">', page), page);
    assert.equal(discoverEndpoint(null, "<p>nothing</p>", page), null);
    assert.equal(discoverEndpoint('<javascript:alert(1)>; rel="webmention"', "", page), null);
  });
});

describe("a note's links to other sites", () => {
  it("reads the renderer's three spellings and a raw anchor, once each", () => {
    const md = [
      "---",
      "source: https://front.example/matter",
      "---",
      "See [the essay](https://a.example/essay) and <https://b.example/auto>.",
      "Bare https://c.example/bare, then (https://d.example/paren).",
      '<a href="https://e.example/raw">raw</a> and again [twice](https://a.example/essay).',
      "![a picture](https://img.example/pic.png) is not a link.",
      "[[A wikilink]] is the vault's; `https://code.example/inline` is code.",
      "```",
      "https://code.example/fenced",
      "```",
    ].join("\n");
    assert.deepEqual(outboundLinks(md), [
      "https://a.example/essay",
      "https://b.example/auto",
      "https://c.example/bare",
      "https://d.example/paren",
      "https://e.example/raw",
    ]);
  });
});

describe("addresses", () => {
  it("normalise and compare", () => {
    assert.equal(normalizeUrl("HTTPS://Blog.Example/a/#x"), "https://blog.example/a");
    assert.equal(normalizeUrl("javascript:alert(1)"), null);
    assert.equal(sameUrl("https://blog.example/%D9%85", "https://blog.example/م"), true);
  });
});
