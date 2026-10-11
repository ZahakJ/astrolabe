// The presence core (shared/presence/{reduce,policy,render}.ts): many tabs
// reduced to one activity, the privacy policy that decides what may leave the
// process, and the card Discord is handed. The policy is the product's
// promise — a path never leaves, an opted-out note never shows its title — so
// every refusal it makes is pinned here.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { presenceAsset, PRESENCE_STALE_MS } from "../shared/presence/config.ts";
import { cardsLeftPhrase } from "../shared/presence/copy.ts";
import { applyPolicy, titleOnly } from "../shared/presence/policy.ts";
import { holdReport, reduceReports, validateReport } from "../shared/presence/reduce.ts";
import { renderActivity, sameActivity, vaultNameOf, type RenderContext } from "../shared/presence/render.ts";
import { PRESENCE_DEFAULTS, type Activity, type PresenceEffective, type PresenceReport, type PublicActivity } from "../shared/presence/types.ts";

const T0 = 1_700_000_000_000;
const ON: PresenceEffective = { ...PRESENCE_DEFAULTS, mode: "title", clientId: "123456789012345678" };
const report = (over: Partial<PresenceReport> = {}): PresenceReport => ({ client: "tab-aaaaaa", kind: "writing", idleMs: 0, ...over });
const none = () => ({ optOut: false, excluded: false });

describe("reduceReports", () => {
  it("the most recently ACTIVE client wins, not the most recent post", () => {
    const busy = holdReport(report({ client: "tab-busy01", path: "A.md", idleMs: 1_000 }), T0);
    const heartbeat = holdReport(report({ client: "tab-bkgd01", kind: "library", idleMs: 300_000 }), T0 + 5_000);
    const a = reduceReports([busy, heartbeat], T0 + 6_000, ON, null, T0);
    assert.equal(a?.kind, "writing");
    assert.deepEqual(a?.subject, { path: "A.md", title: "A" });
  });

  it("drops a client silent for longer than the stale window; none left is null", () => {
    const old = holdReport(report({ path: "A.md" }), T0);
    assert.equal(reduceReports([old], T0 + PRESENCE_STALE_MS + 1, ON, null, T0), null);
    assert.equal(reduceReports([], T0, ON, null, T0), null);
  });

  it("idle: clear gives null, show gives Idle with no subject", () => {
    const h = holdReport(report({ path: "A.md", idleMs: 10 * 60_000 }), T0);
    assert.equal(reduceReports([h], T0, ON, null, T0), null);
    const idle = reduceReports([h], T0, { ...ON, idle: "show" }, null, T0);
    assert.deepEqual(idle, { kind: "idle", subject: null, cardsLeft: null, subjectSince: T0, sessionSince: T0 });
    const short = holdReport(report({ path: "A.md", idleMs: 2 * 60_000 }), T0);
    assert.equal(reduceReports([short], T0, { ...ON, idleMinutes: 2 }, null, T0), null);
    assert.equal(reduceReports([short], T0, { ...ON, idleMinutes: 3 }, null, T0)?.kind, "writing");
  });

  it("subjectSince is kept while the subject stays and reset when it moves; sessionSince never moves", () => {
    const first = reduceReports([holdReport(report({ path: "A.md", cardsLeft: 3 }), T0)], T0, ON, null, T0 - 99);
    assert.equal(first?.subjectSince, T0);
    const same = reduceReports([holdReport(report({ path: "A.md", cardsLeft: 2 }), T0 + 9)], T0 + 10, ON, first, T0 - 99);
    assert.equal(same?.subjectSince, T0);
    assert.equal(same?.cardsLeft, 2);
    const other = reduceReports([holdReport(report({ path: "B.md" }), T0 + 19)], T0 + 20, ON, same, T0 - 99);
    assert.equal(other?.subjectSince, T0 + 20);
    const kind = reduceReports([holdReport(report({ kind: "reading", path: "B.md" }), T0 + 29)], T0 + 30, ON, other, T0 - 99);
    assert.equal(kind?.subjectSince, T0 + 30, "the same note in another kind is a new subject");
    assert.equal(kind?.sessionSince, T0 - 99);
  });
});

describe("validateReport", () => {
  it("accepts a full report", () => {
    assert.deepEqual(validateReport({ client: "abcdefgh", kind: "orbits", path: "Decks/Kanji.md", cardsLeft: 12, idleMs: 0 }), {
      client: "abcdefgh",
      kind: "orbits",
      path: "Decks/Kanji.md",
      cardsLeft: 12,
      idleMs: 0,
    });
  });

  it("names the first problem", () => {
    const ok = { client: "abcdefgh", kind: "writing", idleMs: 0 };
    const bad: [unknown, RegExp][] = [
      [null, /object/],
      [[1], /object/],
      [{ ...ok, client: "short" }, /client/],
      [{ ...ok, client: "has space!" }, /client/],
      [{ ...ok, client: "x".repeat(65) }, /client/],
      [{ ...ok, kind: "idle" }, /kind/],
      [{ ...ok, path: "" }, /path/],
      [{ ...ok, path: "x".repeat(1001) }, /path/],
      [{ ...ok, path: "a\0b.md" }, /NUL/],
      [{ ...ok, path: "/etc/passwd" }, /relative/],
      [{ ...ok, path: "C:\\Users\\me.md" }, /relative/],
      [{ ...ok, path: "../out.md" }, /climb/],
      [{ ...ok, title: "t".repeat(201) }, /title/],
      [{ ...ok, cardsLeft: 1.5 }, /cardsLeft/],
      [{ ...ok, cardsLeft: 100_001 }, /cardsLeft/],
      [{ ...ok, cardsLeft: -1 }, /cardsLeft/],
      [{ ...ok, idleMs: -1 }, /idleMs/],
      [{ ...ok, idleMs: 2e9 }, /idleMs/],
      [{ client: "abcdefgh", kind: "writing" }, /idleMs/],
    ];
    for (const [body, re] of bad) {
      const got = validateReport(body);
      assert.equal(typeof got, "string", JSON.stringify(body));
      assert.match(got as string, re);
    }
  });
});

describe("applyPolicy", () => {
  const act = (over: Partial<Activity> = {}): Activity => ({
    kind: "writing",
    subject: { path: "Books/Deep/Chapter 3.md", title: "Chapter 3" },
    cardsLeft: null,
    subjectSince: T0 + 5,
    sessionSince: T0,
    ...over,
  });

  it("off → null, whatever the activity", () => {
    assert.equal(applyPolicy(act(), { ...ON, mode: "off" }, none), null);
    assert.equal(applyPolicy(null, ON, none), null);
  });

  it("title mode shows the title; activity mode strips it", () => {
    assert.equal(applyPolicy(act(), ON, none)?.title, "Chapter 3");
    assert.equal(applyPolicy(act(), { ...ON, mode: "activity" }, none)?.title, null);
  });

  it("an opted-out or excluded note loses its title and keeps its kind", () => {
    for (const f of [{ optOut: true, excluded: false }, { optOut: false, excluded: true }]) {
      const pub = applyPolicy(act(), ON, () => f);
      assert.deepEqual(pub, { kind: "writing", title: null, cardsLeft: null, since: T0 + 5 });
    }
  });

  it("a path never leaves: a title that IS a path is cut to its name", () => {
    const pub = applyPolicy(act({ subject: { path: "x.md", title: "Books/Deep/Chapter 3.md" } }), ON, none);
    assert.equal(pub?.title, "Chapter 3");
    assert.equal(titleOnly("Books/Deep/Chapter 3.md"), "Chapter 3");
    assert.equal(titleOnly("C:\\Vault\\Drafts\\Plan.tex"), "Plan");
    assert.equal(titleOnly("  Sketch.excalidraw.md "), "Sketch");
    assert.equal(titleOnly("book.EPUB"), "book");
    assert.equal(titleOnly("y".repeat(300)).length, 128);
    assert.equal(titleOnly("😀".repeat(100)).length, 128, "no half surrogate pair at the cut");
  });

  it("the timer follows `elapsed`, and counts pass through", () => {
    assert.equal(applyPolicy(act(), { ...ON, elapsed: "off" }, none)?.since, null);
    assert.equal(applyPolicy(act(), { ...ON, elapsed: "subject" }, none)?.since, T0 + 5);
    assert.equal(applyPolicy(act(), { ...ON, elapsed: "session" }, none)?.since, T0);
    assert.equal(applyPolicy(act({ kind: "orbits", cardsLeft: 7 }), ON, none)?.cardsLeft, 7);
  });
});

describe("renderActivity", () => {
  const ctx = (over: Partial<RenderContext> = {}): RenderContext => ({
    lang: "en",
    vaultName: "alchemy",
    siteUrl: "https://example.org",
    publicLayout: "blog",
    settings: ON,
    ...over,
  });
  const pub = (over: Partial<PublicActivity> = {}): PublicActivity => ({ kind: "writing", title: "Chapter 3", cardsLeft: null, since: T0, ...over });

  it("English: the kind, the title, the mark and the glyph, the timer", () => {
    assert.deepEqual(renderActivity(pub(), ctx()), {
      type: 0,
      details: "Writing",
      state: "Chapter 3",
      timestamps: { start: T0 },
      assets: {
        large_image: "https://zahakj.github.io/astrolabe/brand/presence/mark.png",
        small_image: "https://zahakj.github.io/astrolabe/brand/presence/pen.png",
        small_text: "Writing",
      },
    });
  });

  it("Arabic, with Western digits only", () => {
    const a = renderActivity(pub({ kind: "orbits", title: null, cardsLeft: 12 }), ctx({ lang: "ar" }));
    assert.equal(a.details, "يراجع البطاقات");
    assert.equal(a.state, "12 بطاقة متبقية");
    const all = JSON.stringify(a) + [0, 1, 2, 5, 10, 11, 250].map((n) => cardsLeftPhrase(n, "ar")).join(" ");
    assert.doesNotMatch(all, /[٠-٩۰-۹]/);
    assert.equal(cardsLeftPhrase(2, "ar"), "بطاقتان متبقيتان");
    assert.equal(cardsLeftPhrase(5, "ar"), "5 بطاقات متبقية");
    assert.equal(cardsLeftPhrase(1, "en"), "1 card left");
  });

  it("the second line falls back to the count, then the vault name when allowed", () => {
    assert.equal(renderActivity(pub({ title: null, cardsLeft: 3 }), ctx()).state, "3 cards left");
    assert.equal(renderActivity(pub({ title: null }), ctx()).state, undefined);
    const named = renderActivity(pub({ title: null }), ctx({ settings: { ...ON, vaultName: true } }));
    assert.equal(named.state, "alchemy");
    assert.equal(named.assets?.large_text, "alchemy");
    const both = renderActivity(pub({ kind: "orbits", cardsLeft: 4 }), ctx());
    assert.equal(both.state, "Chapter 3");
    assert.equal(both.assets?.small_text, "4 cards left", "the count moves to the glyph's tooltip");
  });

  it("one glyph per kind, uploaded keys when asked", () => {
    const glyphs = { writing: "pen", reading: "page", book: "book", orbits: "cards", drawing: "brush", library: "shelf", browsing: "compass", idle: "moon" } as const;
    for (const [kind, glyph] of Object.entries(glyphs)) {
      const a = renderActivity(pub({ kind: kind as PublicActivity["kind"] }), ctx({ settings: { ...ON, assets: "uploaded" } }));
      assert.equal(a.assets?.small_image, glyph);
      assert.equal(a.assets?.large_image, "mark");
    }
    assert.equal(presenceAsset("pen", "site"), "https://zahakj.github.io/astrolabe/brand/presence/pen.png");
  });

  it("no timer when since is null", () => {
    assert.equal(renderActivity(pub({ since: null }), ctx()).timestamps, undefined);
  });

  it("the button only with the setting, an https URL and a blog or designed layout", () => {
    const on = { ...ON, button: true };
    assert.deepEqual(renderActivity(pub(), ctx({ settings: on })).buttons, [{ label: "Read the blog", url: "https://example.org" }]);
    assert.deepEqual(renderActivity(pub(), ctx({ settings: on, lang: "ar", publicLayout: "designed" })).buttons?.[0].label, "اقرأ المدونة");
    assert.equal(renderActivity(pub(), ctx()).buttons, undefined);
    assert.equal(renderActivity(pub(), ctx({ settings: on, siteUrl: "http://example.org" })).buttons, undefined);
    assert.equal(renderActivity(pub(), ctx({ settings: on, siteUrl: null })).buttons, undefined);
    assert.equal(renderActivity(pub(), ctx({ settings: on, publicLayout: "app" })).buttons, undefined);
    assert.equal(renderActivity(pub(), ctx({ settings: on, siteUrl: `https://e.org/${"p".repeat(520)}` })).buttons, undefined);
  });

  it("every string within Discord's limits", () => {
    const a = renderActivity(pub({ title: "t".repeat(500) }), ctx({ vaultName: "v".repeat(500), settings: { ...ON, vaultName: true } }));
    assert.equal(a.state?.length, 128);
    assert.equal(a.assets?.large_text?.length, 128);
  });

  it("sameActivity ignores key order and sees real changes", () => {
    const a = renderActivity(pub(), ctx());
    const b = JSON.parse(JSON.stringify({ assets: a.assets, details: a.details, type: a.type, timestamps: a.timestamps, state: a.state }));
    assert.equal(sameActivity(a, b), true);
    assert.equal(sameActivity(a, renderActivity(pub({ title: "Chapter 4" }), ctx())), false);
    assert.equal(sameActivity(null, null), true);
    assert.equal(sameActivity(a, null), false);
  });

  it("vaultNameOf is the folder's name", () => {
    assert.equal(vaultNameOf("/home/me/Documents/alchemy"), "alchemy");
    assert.equal(vaultNameOf("/home/me/alchemy/"), "alchemy");
    assert.equal(vaultNameOf("C:\\Users\\me\\Vault"), "Vault");
  });
});
