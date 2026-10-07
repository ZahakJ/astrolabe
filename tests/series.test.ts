// SERIES (shared/series.ts, server/indexer/series.ts): a published note that
// declares its parts in frontmatter. Lists show the series as one card; the
// feed, the sitemap and ActivityPub enumerate every part.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { indexFile, initIndexer, posts } from "../server/indexer.ts";
import { renderFeed, renderSitemap } from "../server/blog.ts";
import { renameWithLinkRewrite } from "../server/api.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { parseSeriesRefs } from "../shared/series.ts";
import type { PostMeta } from "../shared/types.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

const EN = "Tracing is the art of asking a running program what it is doing without stopping it to ask.\n";
const AR = "التتبع هو فن سؤال البرنامج الجاري عما يفعله من غير أن توقفه لتسأله، وهذا أصعب مما يبدو.\n";

function md(fm: string, body: string): string {
  return `---\n${fm}\n---\n${body}`;
}

const data = makeDir();
const root = makeVault({
  "Tracing.md": md(
    [
      "publish: true",
      "date: 2026-01-01",
      "tags: [tracing]",
      "series:",
      '  - "[[Six ways]]"',
      "  - [[strace]]", // unquoted: YAML makes this [["strace"]]
      "  - tracing/ftrace.md", // a vault path
      '  - "[[Draft part]]"', // unpublished
      '  - "[[Nowhere]]"', // resolves to nothing
      '  - "[[Tracing]]"', // itself
      '  - "[[Zeta series]]"', // a series inside a series
      '  - "[[تتبع]]"', // Arabic part
    ].join("\n"),
    EN,
  ),
  "Six ways.md": md("publish: true\ndate: 2026-01-02\ntags: [perf]", EN),
  "strace.md": md("publish: true\ndate: 2026-01-03", EN),
  "tracing/ftrace.md": md("publish: true\ndate: 2026-01-04", EN),
  "Draft part.md": md("date: 2026-05-01", EN),
  "تتبع.md": md("publish: true\ndate: 2026-01-05", AR),
  "Zeta series.md": md('publish: true\ndate: 2025-06-01\nseries:\n  - "[[strace]]"\n  - "[[Lonely]]"', EN),
  "Lonely.md": md("publish: true\ndate: 2025-06-02", EN),
  "Ordinary.md": md("publish: true\ndate: 2026-02-01", EN),
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

const byPath = (list: PostMeta[]) => new Map(list.map((p) => [p.path, p]));
const paths = (list: PostMeta[]) => list.map((p) => p.path);

describe("the declaration", () => {
  it("reads quoted, unquoted and path entries, cleaning brackets", () => {
    assert.deepEqual(parseSeriesRefs({ series: ["[[A]]", [["B"]], "x/c.md", "[[D|alias]]"] }), ["A", "B", "x/c.md", "D"]);
    assert.equal(parseSeriesRefs({}), null);
    assert.equal(parseSeriesRefs({ series: [] }), null);
  });
});

describe("lists hide parts", () => {
  it("shows the series as one card, parts in series order", () => {
    const list = posts(true, null);
    const ps = paths(list);
    for (const part of ["Six ways.md", "strace.md", "tracing/ftrace.md", "تتبع.md"]) {
      assert.equal(ps.includes(part), false, `${part} leaked into the list`);
    }
    const series = byPath(list).get("Tracing.md")!;
    assert.equal(series.parts, 4);
    assert.deepEqual(paths(series.partList ?? []), ["Six ways.md", "strace.md", "tracing/ftrace.md", "تتبع.md"]);
    assert.deepEqual(series.partList!.map((p) => p.series!.index), [1, 2, 3, 4]);
    assert.equal(series.partList![2].series!.count, 4);
    assert.equal(series.partList![0].series!.title, "Tracing");
  });

  it("dates the series by its newest visible part and sorts it by that date", () => {
    const series = byPath(posts(true, null)).get("Tracing.md")!;
    assert.equal(series.date.slice(0, 10), "2026-01-05");
    // Unpublished Draft part (May) does not move the date.
    const list = paths(posts(true, null));
    assert.ok(list.indexOf("Ordinary.md") < list.indexOf("Tracing.md"));
  });

  it("lists the series under its parts' tags", () => {
    const series = byPath(posts(true, null)).get("Tracing.md")!;
    assert.deepEqual(series.partTags, ["perf"]);
  });

  it("ignores a series inside a series, and the first series claims a shared part", () => {
    const list = byPath(posts(true, null));
    const zeta = list.get("Zeta series.md")!;
    const tracing = list.get("Tracing.md")!;
    // Tracing lists "Zeta series", which is a series: ignored, never a part.
    assert.equal(tracing.partList!.some((p) => p.path === "Zeta series.md"), false);
    // Both list strace; "Tracing.md" sorts first and keeps it.
    assert.deepEqual(paths(zeta.partList ?? []), ["Lonely.md"]);
    const plan = byPath(posts(false, null)).get("Zeta series.md")!.seriesPlan!;
    assert.equal(plan.find((e) => e.ref === "strace")!.status, "claimed");
  });
});

describe("enumerations show parts", () => {
  it("posts(…, { parts: 'show' }) holds every part, carrying its series", () => {
    const all = byPath(posts(true, null, false, { parts: "show" }));
    assert.ok(all.has("strace.md") && all.has("Tracing.md") && all.has("تتبع.md"));
    assert.equal(all.get("Six ways.md")!.series!.path, "Tracing.md");
    assert.equal(all.get("Tracing.md")!.date.slice(0, 10), "2026-01-05");
    assert.equal(all.get("Tracing.md")!.partList, undefined);
  });

  it("the feed and the sitemap name every part", () => {
    const scope = { lang: null } as Parameters<typeof renderFeed>[1];
    const feed = renderFeed("https://example.org", scope);
    const map = renderSitemap("https://example.org", scope);
    for (const doc of [feed, map]) {
      assert.ok(doc.includes("Six%20ways") || doc.includes("Six ways"), "part missing");
      assert.ok(doc.includes("/Tracing"), "series missing");
    }
  });

  it("parity: the default list (what /api/posts serves) never holds a part", () => {
    for (const lang of [null, "en", "ar"] as const) {
      for (const visitor of [true, false]) {
        const list = posts(visitor, lang);
        const shown = new Set(paths(posts(visitor, lang, false, { parts: "show" })).filter((p) => !list.some((q) => q.path === p)));
        for (const post of list) assert.equal(post.series, undefined, `${post.path} is a part in a list`);
        // Everything the list left out is a part, reachable through a card.
        const carried = new Set(list.flatMap((p) => paths(p.partList ?? [])));
        for (const p of shown) assert.ok(carried.has(p), `${p} vanished from the list without a card`);
      }
    }
  });
});

describe("the language filter", () => {
  it("counts and dates only the parts this reader may see", () => {
    const en = byPath(posts(true, "en")).get("Tracing.md")!;
    assert.equal(en.parts, 3);
    assert.equal(en.date.slice(0, 10), "2026-01-04");
    assert.equal(en.partList!.some((p) => p.path === "تتبع.md"), false);
  });

  it("a series whose parts are all filtered away is an ordinary post", () => {
    const ar = byPath(posts(true, "ar"));
    // The English series note itself is filtered for an Arabic reader, so its
    // Arabic part is an ordinary post to them.
    assert.equal(ar.has("Tracing.md"), false);
    assert.equal(ar.get("تتبع.md")?.series, undefined);
  });
});

describe("admin vs visitor", () => {
  it("only the admin list carries the plan, with reasons", () => {
    const visitor = byPath(posts(true, null)).get("Tracing.md")!;
    assert.equal(visitor.seriesPlan, undefined);
    const admin = byPath(posts(false, null)).get("Tracing.md")!;
    const status = Object.fromEntries(admin.seriesPlan!.map((e) => [e.ref, e.status]));
    assert.equal(status["Draft part"], "unpublished");
    assert.equal(status["Nowhere"], "missing");
    assert.equal(status["Tracing"], "self");
    assert.equal(status["Zeta series"], "nested");
    assert.equal(status["strace"], "published");
  });
});

describe("live updates and rename", () => {
  it("publishing a part moves it into the series and the series date up", async () => {
    writeFileSync(path.join(root, "Draft part.md"), md("publish: true\ndate: 2026-05-01", EN));
    await indexFile("Draft part.md");
    const series = byPath(posts(true, null)).get("Tracing.md")!;
    assert.equal(series.parts, 5);
    assert.equal(series.date.slice(0, 10), "2026-05-01");
    assert.equal(paths(posts(true, null)).includes("Draft part.md"), false);
  });

  it("renaming a part rewrites the series entry", async () => {
    await renameWithLinkRewrite("strace.md", "strace deep dive.md");
    const src = readFileSync(path.join(root, "Tracing.md"), "utf8");
    assert.ok(src.includes("[[strace deep dive]]"), src);
    await indexFile("Tracing.md");
    const series = byPath(posts(true, null)).get("Tracing.md")!;
    assert.ok(paths(series.partList ?? []).includes("strace deep dive.md"));
  });
});
