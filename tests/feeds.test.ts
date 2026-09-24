// Feeds and read-later (docs/feeds.md): the list a note keeps
// (shared/feeds.ts), the three formats and discovery (server/feedParse.ts),
// the sanitiser (shared/feedHtml.ts), and the whole round against a LOCAL
// server serving the fixtures under tests/fixtures/feeds — nothing here
// touches the network beyond 127.0.0.1. Every fixture's own host is rewritten
// to the local origin as it is served, so an item's link, and the page Keep
// fetches for it, are local too.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FEEDS_DEFAULT_MINUTES, feedsCadenceMinutes, groupItems, keptNote, parseFeedList, READING_FOLDER } from "../shared/feeds.ts";
import { htmlExcerpt, sanitizeFeedHtml } from "../shared/feedHtml.ts";
import { discoverFeeds, parseFeed, parseFeedDate } from "../server/feedParse.ts";
import { closeFeeds, feedsState, initFeeds, keepItem, markRead, openItem, runRound } from "../server/feeds.ts";
import { decks, deckCards, indexFile, initIndexer, isNotePublished } from "../server/indexer.ts";
import { patchSettings } from "../server/settings.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "feeds");
const fixture = (name: string): string => readFileSync(path.join(FIX, name), "utf8");

describe("the list (shared/feeds.ts)", () => {
  it("reads addresses, folders and tags from every feeds fence, and nothing outside them", () => {
    const md = [
      "# Feeds",
      "",
      "https://outside.example/rss is prose, not a feed",
      "",
      "```feeds",
      "#reading",
      "https://a.example/feed.xml → Reading/Essays",
      "#essays #long-form",
      "// a comment line",
      "https://b.example/rss -> Clips/B",
      "",
      "https://c.example/atom",
      "```",
      "",
      "```js",
      "https://d.example/not-a-feed",
      "```",
      "",
      "```feeds",
      "https://a.example/feed.xml",
      "ftp://nope.example/",
      "https://e.example/x → ../escape",
      "```",
    ].join("\n");
    const { feeds, problems } = parseFeedList(md);
    assert.deepEqual(
      feeds.map((f) => [f.url, f.folder, f.tags]),
      [
        ["https://a.example/feed.xml", "Reading/Essays", ["reading", "essays", "long-form"]],
        ["https://b.example/rss", "Clips/B", ["reading"]],
        ["https://c.example/atom", READING_FOLDER, ["reading"]],
        ["https://e.example/x", READING_FOLDER, []],
      ],
    );
    assert.deepEqual(problems.map((p) => p.reason), ["duplicate", "notAnAddress", "badFolder"]);
    assert.equal(problems[0].line, 20);
  });

  it("an unclosed fence runs to the end; a heading is not a tag line", () => {
    const { feeds, problems } = parseFeedList("```feeds\nhttps://x.example/f\n# Not tags\n");
    assert.equal(feeds.length, 1);
    assert.deepEqual(problems.map((p) => p.reason), ["notAnAddress"]);
  });

  it("the cadence is sync's when sync runs on a timer, else the hour", () => {
    assert.equal(feedsCadenceMinutes({ enabled: true, remote: "git@x:y", intervalMinutes: 15 }), 15);
    assert.equal(feedsCadenceMinutes({ enabled: true, remote: null, intervalMinutes: 15 }), FEEDS_DEFAULT_MINUTES);
    assert.equal(feedsCadenceMinutes({ enabled: false, remote: "git@x:y", intervalMinutes: 15 }), FEEDS_DEFAULT_MINUTES);
  });

  it("a kept note names its source, feed, dates and tags, and carries no publish key", () => {
    const text = keptNote({
      title: "On: Things",
      url: "https://x.example/a",
      feed: 'The "Feed"',
      published: "2026-09-20",
      kept: "2026-09-23",
      tags: ["reading", "long-form", "2026", "true"],
      body: "# On: Things\n\nBody.",
    });
    assert.equal(
      text,
      '---\nsource: "https://x.example/a"\nfeed: "The \\"Feed\\""\npublished: 2026-09-20\nkept: 2026-09-23\ntags: [reading, long-form, "2026", "true"]\n---\n\n# On: Things\n\nBody.\n',
    );
    assert.doesNotMatch(text, /publish:/);
  });

  it("groups unread items by feed in the list's order, newest first", () => {
    const feed = (url: string) => ({ url, title: url, site: null, folder: "R", tags: [], unread: 0, checked: null, error: null });
    const item = (f: string, guid: string, published: number) => ({ feed: f, guid, title: guid, url: null, author: null, published, read: false, kept: null, excerpt: "" });
    const out = groupItems([feed("b"), feed("a"), feed("empty")], [item("a", "a1", 1), item("b", "b1", 1), item("a", "a2", 5)]);
    assert.deepEqual(out.map((g) => [g.feed.url, g.items.map((i) => i.guid)]), [["b", ["b1"]], ["a", ["a2", "a1"]]]);
  });
});

describe("the sanitiser (shared/feedHtml.ts)", () => {
  it("keeps prose, drops script and handlers, resolves and fences links and images", () => {
    const out = sanitizeFeedHtml(
      '<p onclick="x()">Hi <b>there</b><script>alert(1)</script></p><a href="javascript:alert(1)">bad</a> <a href="/ok" style="color:red">ok</a><img src="/i.png" onerror="x()"><img src="/i.svg"><iframe src="https://x"></iframe><form><input></form>',
      "https://site.example/post",
    );
    assert.equal(
      out,
      '<p>Hi <b>there</b></p>bad <a href="https://site.example/ok" target="_blank" rel="noopener noreferrer nofollow">ok</a><img src="https://site.example/i.png" loading="lazy" decoding="async" referrerpolicy="no-referrer">',
    );
  });

  it("escapes text and attribute values", () => {
    assert.equal(sanitizeFeedHtml('<p title="x">a &lt;b&gt; &amp; "c"</p><abbr title="&quot;q&quot;">q</abbr>', null), '<p>a &lt;b&gt; &amp; "c"</p><abbr title="&quot;q&quot;">q</abbr>');
  });

  it("an excerpt is the first words, plain", () => {
    assert.equal(htmlExcerpt("<p>One <b>two</b></p><p>three</p><script>x</script>"), "One two three");
    assert.match(htmlExcerpt(`<p>${"word ".repeat(100)}</p>`, 40), /…$/);
  });
});

describe("the three formats (server/feedParse.ts)", () => {
  it("RSS 2.0: content:encoded over description, relative links resolved, a stable id for every item", () => {
    const feed = parseFeed(fixture("rss.xml"), "application/rss+xml", "https://marginal.example/rss.xml");
    assert.ok(feed);
    assert.equal(feed.kind, "rss");
    assert.equal(feed.title, "The Marginal Reader");
    assert.equal(feed.site, "https://marginal.example/");
    assert.equal(feed.items.length, 3);
    const [a, b, c] = feed.items;
    assert.equal(a.guid, "marginal-2026-09-20-commonplace");
    assert.equal(a.url, "https://marginal.example/essays/commonplace");
    assert.equal(a.author, "Ibn Muqla");
    assert.equal(a.published, Date.parse("2026-09-20T08:30:00Z"));
    assert.match(a.content ?? "", /commonplace book is a <strong>reader's<\/strong>/);
    assert.equal(a.summary, "A short teaser about commonplace books.");
    assert.equal(b.guid, "https://marginal.example/essays/marginalia");
    assert.equal(b.summary, null);
    assert.equal(c.guid, "https://marginal.example/notes/undated");
    assert.equal(c.published, null);
  });

  it("Atom: xhtml content printed back, html content unescaped, xml:base honoured", () => {
    const feed = parseFeed(fixture("atom.xml"), "application/atom+xml", "https://atlas.example/atom.xml");
    assert.ok(feed);
    assert.equal(feed.kind, "atom");
    assert.equal(feed.site, "https://atlas.example/");
    const [a, b] = feed.items;
    assert.equal(a.title, "The Astrolabe’s Rete");
    assert.equal(a.url, "https://atlas.example/posts/rete");
    assert.equal(a.author, "Maryam al-Ijliya");
    assert.match(a.content ?? "", /<p>The <em>rete<\/em> is the pierced plate/);
    assert.match(a.content ?? "", /<img src="img\/rete.png" alt="The rete">/);
    assert.equal(b.content, "<p>The sighting rule on the back.</p>");
    assert.equal(b.published, Date.parse("2026-09-19T08:00:00Z"));
  });

  it("JSON Feed: html and text content, a numeric id as a string, Arabic intact", () => {
    const feed = parseFeed(fixture("feed.json"), "application/feed+json", "https://daftar.example/feed.json");
    assert.ok(feed);
    assert.equal(feed.kind, "json");
    assert.equal(feed.title, "دفتر القراءة");
    const [a, b] = feed.items;
    assert.equal(a.title, "طوق الحمامة");
    assert.equal(a.author, "القارئ");
    assert.equal(b.guid, "42");
    assert.equal(b.content, "<p>First paragraph.</p><p>Second paragraph with &lt;angle> brackets.</p>");
  });

  it("an HTML page is not a feed, and names its feeds", () => {
    assert.equal(parseFeed(fixture("page.html"), "text/html", "https://marginal.example/"), null);
    assert.deepEqual(discoverFeeds(fixture("page.html"), "https://marginal.example/"), ["https://marginal.example/rss.xml", "https://marginal.example/atom.xml"]);
  });

  it("dates in the shapes generators write", () => {
    assert.equal(parseFeedDate("Tue, 10 Jun 2003 04:00:00 GMT"), Date.parse("2003-06-10T04:00:00Z"));
    assert.equal(parseFeedDate("2026-09-21T09:00:00Z"), Date.parse("2026-09-21T09:00:00Z"));
    assert.equal(parseFeedDate("lundi, 10 Jun 2003 04:00:00 GMT"), Date.parse("2003-06-10T04:00:00Z"));
    assert.equal(parseFeedDate("nonsense"), null);
    assert.equal(parseFeedDate(""), null);
  });
});

describe("a round, Keep, and the vault (server/feeds.ts, against a local server)", () => {
  const data = makeDir();
  let root = "";
  let server: Server;
  let origin = "";
  const hits: string[] = [];
  const revalidated: string[] = [];

  before(async () => {
    server = createServer((req, res) => {
      const url = req.url ?? "/";
      hits.push(url);
      const local = (text: string): string =>
        text.replaceAll("https://marginal.example", origin).replaceAll("https://atlas.example", origin).replaceAll("https://daftar.example", origin);
      const send = (type: string, body: string, etag?: string): void => {
        if (etag && req.headers["if-none-match"] === etag) {
          revalidated.push(url);
          res.writeHead(304, { ETag: etag });
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": type, ...(etag ? { ETag: etag } : {}) });
        res.end(body);
      };
      if (url === "/rss.xml") return send("application/rss+xml; charset=utf-8", local(fixture("rss.xml")), '"rss-1"');
      if (url === "/atom.xml") return send("application/atom+xml", local(fixture("atom.xml")));
      if (url === "/feed.json") return send("application/feed+json", local(fixture("feed.json")));
      if (url === "/blog/") return send("text/html", local(fixture("page.html")));
      if (url === "/essays/marginalia") return send("text/html; charset=utf-8", local(fixture("article.html")));
      if (url === "/broken.xml") return send("application/rss+xml", "<html><body>not a feed</body></html>");
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    root = makeVault({
      "Feeds.md": [
        "# Feeds",
        "",
        "```feeds",
        "#reading",
        `${origin}/rss.xml → Reading/Marginal`,
        `${origin}/atom.xml`,
        "#essays",
        `${origin}/feed.json → Arabic`,
        `${origin}/blog/ → Discovered`,
        `${origin}/broken.xml`,
        "```",
        "",
      ].join("\n"),
    });
    initSite({ ASTROLABE_DATA: data });
    initVault(root);
    await initIndexer();
    initFeeds({ dbFile: path.join(data, "feeds.db"), timer: false });
  });

  after(async () => {
    closeFeeds();
    await new Promise<void>((r) => server.close(() => r()));
    removeVault(root);
    removeVault(data);
  });

  it("while fetching is off, reading the surface asks nobody", async () => {
    const state = await feedsState();
    assert.equal(state.fetch, false);
    assert.equal(state.noteExists, true);
    assert.equal(state.feeds.length, 5);
    assert.equal(state.items.length, 0);
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(hits, []);
  });

  it("a round fetches every format, discovers the page's feed, and records the failure it met", async () => {
    patchSettings({ feeds: { fetch: true } });
    await runRound();
    const state = await feedsState();
    const by = new Map(state.feeds.map((f) => [f.url, f]));
    assert.equal(by.get(`${origin}/rss.xml`)?.title, "The Marginal Reader");
    assert.equal(by.get(`${origin}/rss.xml`)?.unread, 3);
    assert.equal(by.get(`${origin}/atom.xml`)?.unread, 2);
    assert.equal(by.get(`${origin}/feed.json`)?.unread, 2);
    // The page named /rss.xml first: discovered, followed, the same items.
    assert.equal(by.get(`${origin}/blog/`)?.unread, 3);
    assert.match(by.get(`${origin}/broken.xml`)?.error ?? "", /not a feed/);
    assert.equal(state.items.length, 10);
    assert.ok(hits.every((h) => !/^https?:/.test(h)), "every ask was local");
  });

  it("the next round revalidates with the ETag and brings nothing twice", async () => {
    await runRound();
    assert.ok(revalidated.includes("/rss.xml"), "If-None-Match was sent and answered 304");
    const state = await feedsState();
    assert.equal(state.items.length, 10);
  });

  it("an item opens sanitised; a full article is not a summary", () => {
    const full = openItem(`${origin}/rss.xml`, "marginal-2026-09-20-commonplace");
    assert.equal(full.summaryOnly, false);
    assert.doesNotMatch(full.html, /script|onclick|onerror|javascript:/);
    assert.match(full.html, new RegExp(`<img src="${origin}/img/page.jpg"[^>]*loading="lazy"`));
    const teaser = openItem(`${origin}/rss.xml`, `${origin}/essays/marginalia`);
    assert.equal(teaser.summaryOnly, true);
  });

  it("Keep writes the article from the feed into the feed's folder, with its facts, and never publishes it", async () => {
    const out = await keepItem(`${origin}/rss.xml`, "marginal-2026-09-20-commonplace");
    assert.equal(out.path, "Reading/Marginal/On Keeping a Commonplace Book.md");
    assert.equal(out.fetched, false);
    const text = readFileSync(path.join(root, out.path), "utf8");
    assert.match(text, new RegExp(`^---\\nsource: "${origin}/essays/commonplace"\\nfeed: "The Marginal Reader"\\npublished: 2026-09-2\\d\\nkept: \\d{4}-\\d\\d-\\d\\d\\ntags: \\[reading\\]\\n---\\n\\n# On Keeping a Commonplace Book\\n\\nA commonplace book is a \\*\\*reader's\\*\\* memory`));
    assert.doesNotMatch(text, /alert|steal/);
    assert.equal(isNotePublished(out.path), false);
    // Kept is read, and a second Keep is the same note.
    const again = await keepItem(`${origin}/rss.xml`, "marginal-2026-09-20-commonplace");
    assert.deepEqual(again, { path: out.path, fetched: false, already: true });
    const state = await feedsState();
    assert.ok(!state.items.some((i) => i.guid === "marginal-2026-09-20-commonplace" && i.feed === `${origin}/rss.xml`));
  });

  it("Keep of a teaser fetches the page and keeps its article, not its navigation", async () => {
    const out = await keepItem(`${origin}/rss.xml`, `${origin}/essays/marginalia`);
    assert.equal(out.fetched, true);
    assert.equal(out.path, "Reading/Marginal/Marginalia, Briefly.md");
    const text = readFileSync(path.join(root, out.path), "utf8");
    assert.match(text, /The margin is where a book talks back/);
    assert.match(text, /> A book is a machine to think with\./);
    assert.match(text, new RegExp(`\\[the commonplace book\\]\\(${origin}/essays/commonplace\\)`));
    assert.doesNotMatch(text, /Home|©/);
    assert.ok(hits.includes("/essays/marginalia"));
  });

  it("with fetching off, Keep keeps what the feed carried and asks nobody", async () => {
    patchSettings({ feeds: { fetch: false } });
    const before = hits.length;
    const out = await keepItem(`${origin}/atom.xml`, "tag:atlas.example,2026:alidade");
    assert.equal(out.fetched, false);
    assert.equal(hits.length, before);
    assert.match(readFileSync(path.join(root, out.path), "utf8"), /tags: \[reading, essays\]\n---\n\n# Alidade\n\nThe sighting rule on the back\.\n$/);
    patchSettings({ feeds: { fetch: true } });
  });

  it("a highlight made in a kept note is a card in Orbits' implicit deck", async () => {
    const rel = "Reading/Marginal/On Keeping a Commonplace Book.md";
    const abs = path.join(root, rel);
    writeFileSync(abs, readFileSync(abs, "utf8").replace("the heading is yours", "==the heading is yours=="));
    await indexFile(rel);
    const implicit = decks("2026-09-23").find((d) => d.implicit);
    assert.ok(implicit && implicit.counts.total >= 1);
    const cards = deckCards("*", null) ?? [];
    assert.ok(cards.some((c) => c.path === rel), "the kept note's highlight is in the implicit deck");
  });

  it("read and unread round-trip; an unknown item is a 404", async () => {
    markRead(`${origin}/feed.json`, "42", true);
    assert.ok(!(await feedsState()).items.some((i) => i.guid === "42"));
    markRead(`${origin}/feed.json`, "42", false);
    assert.ok((await feedsState()).items.some((i) => i.guid === "42"));
    assert.throws(() => markRead(`${origin}/feed.json`, "nope", true), /No such item/);
  });

  it("nothing of the feeds is in the vault but the kept notes", () => {
    assert.ok(existsSync(path.join(data, "feeds.db")));
    assert.ok(!existsSync(path.join(root, "feeds.db")));
  });
});
