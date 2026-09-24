// Webmentions end to end (server/webmentions.ts, server/webmentionRoutes.ts):
// the receiver against source pages served on 127.0.0.1 with every h-entry
// variant, the moderator's "Verify again", and the sender's discovery and
// ledger against endpoints served the same way. Nothing here leaves the
// machine: the site's own address is https://blog.example (never fetched —
// it is only compared), and every page fetched is the local fixture server.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getComment, initComments, listAllComments, listInteractions, setCommentHidden } from "../server/comments.ts";
import { closeFederation, reconcile } from "../server/federation.ts";
import { indexFile, initIndexer } from "../server/indexer.ts";
import { allowPrivateAddressesForTests } from "../server/safeFetch.ts";
import { patchSettings } from "../server/settings.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { resetWebmentionRateForTests, webmentionHeadTags, webmentionLinkHeader, webmentionPublic } from "../server/webmentionRoutes.ts";
import { closeWebmentions, drainWebmentions, initWebmentions, sentMentions, setWebmentionBackoffForTests, verifyAgain } from "../server/webmentions.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "mentions");
const SITE = "https://blog.example";
const TARGET = `${SITE}/Essays/On%20Reading`;

let server: Server;
let local = "";
const pages = new Map<string, { status?: number; type?: string; body: string; link?: string }>();
const received: { path: string; source: string; target: string }[] = [];
const gets: string[] = [];
let endpointStatus = 202;
let root = "";
const data = makeDir();

function fixture(name: string): string {
  return readFileSync(path.join(FIX, name), "utf8").replaceAll("{{TARGET}}", TARGET);
}

async function mention(source: string, target = TARGET): Promise<Response> {
  return webmentionPublic.request("/webmention", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ source, target }).toString(),
  });
}

before(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString()));
      req.on("end", () => {
        const form = new URLSearchParams(body);
        received.push({ path: url, source: form.get("source") ?? "", target: form.get("target") ?? "" });
        res.writeHead(endpointStatus);
        res.end();
      });
      return;
    }
    gets.push(url);
    const page = pages.get(url);
    if (!page) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(page.status ?? 200, { "Content-Type": page.type ?? "text/html; charset=utf-8", ...(page.link ? { Link: page.link } : {}) });
    res.end(page.body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  allowPrivateAddressesForTests(true);
  for (const name of ["like", "repost", "reply", "mention", "plain", "nolink"]) pages.set(`/src/${name}`, { body: fixture(`${name}.html`) });
  pages.set("/to/header", { body: "<p>A page.</p>", link: '</wm/header>; rel="webmention"' });
  pages.set("/to/link", { body: '<html><head><link rel="webmention" href="/wm/link"></head><body>x</body></html>' });
  pages.set("/to/anchor", { body: '<p><a rel="webmention" href="/wm/anchor">endpoint</a></p>' });
  pages.set("/to/none", { body: "<p>No endpoint here.</p>" });
  root = makeVault({
    "Essays/On Reading.md": note({ publish: "true", date: "2026-09-01" }, "An essay on reading slowly.\n"),
    "Links.md": note({ publish: "false", date: "2026-09-02" }, "Nothing yet.\n"),
  });
  initSite({ ASTROLABE_DATA: data, SITE_URL: SITE });
  initVault(root);
  await initIndexer();
  initComments({ ASTROLABE_DATA: data });
  initWebmentions({ dbFile: path.join(data, "webmentions.db") });
  setWebmentionBackoffForTests([0, 0, 0]);
});

after(async () => {
  closeWebmentions();
  closeFederation();
  allowPrivateAddressesForTests(false);
  await new Promise<void>((r) => server.close(() => r()));
  removeVault(root);
  removeVault(data);
});

describe("receiving", () => {
  it("while Accept webmentions is off, the endpoint is not there and nothing is advertised", async () => {
    const res = await mention(`${local}/src/like`);
    assert.equal(res.status, 404);
    assert.deepEqual(webmentionHeadTags(SITE), []);
    assert.equal(webmentionLinkHeader(SITE), null);
  });

  it("switched on, the endpoint is advertised in the head and as a Link header", () => {
    patchSettings({ webmentions: { accept: true } });
    assert.deepEqual(webmentionHeadTags(SITE), [`<link rel="webmention" href="${SITE}/webmention" />`]);
    assert.equal(webmentionLinkHeader(SITE), `<${SITE}/webmention>; rel="webmention"`);
  });

  it("refuses what it can without the network: a target that is not a page here, a bad source, a body that is not a form", async () => {
    assert.equal((await mention(`${local}/src/like`, `${SITE}/Nope`)).status, 400);
    assert.equal((await mention(`${local}/src/like`, "https://elsewhere.example/Essays/On%20Reading")).status, 400);
    assert.equal((await mention("ftp://x.example/", TARGET)).status, 400);
    assert.equal((await mention(TARGET, TARGET)).status, 400);
    const json = await webmentionPublic.request("/webmention", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(json.status, 400);
  });

  it("queues, fetches, verifies and files each h-entry variant — hidden, awaiting moderation", async () => {
    for (const name of ["like", "repost", "reply", "mention", "plain"]) {
      assert.equal((await mention(`${local}/src/${name}`)).status, 202, name);
    }
    await drainWebmentions();
    const filed = listInteractions("Essays/On Reading.md", true);
    const byType = Object.fromEntries(filed.map((c) => [new URL(c.source!).pathname, c]));
    assert.equal(byType["/src/like"].type, "like");
    assert.equal(byType["/src/like"].author, "Layla Reader");
    assert.equal(byType["/src/like"].photo, `${local}/me.jpg`);
    assert.equal(byType["/src/repost"].type, "repost");
    assert.equal(byType["/src/reply"].type, "reply");
    assert.match(byType["/src/reply"].body, /second paragraph/);
    assert.equal(byType["/src/mention"].type, "mention");
    assert.equal(byType["/src/plain"].type, "mention");
    assert.ok(filed.every((c) => c.kind === "webmention" && c.hidden === true), "every one awaits moderation");
    // Visitors see none of them until the owner approves.
    assert.equal(listInteractions("Essays/On Reading.md").length, 0);
    // And the form's own list is untouched: nothing is shown twice.
    assert.ok(listAllComments(50).some((c) => c.kind === "webmention"));
  });

  it("a source that does not link to the target files nothing", async () => {
    const before = listInteractions("Essays/On Reading.md", true).length;
    assert.equal((await mention(`${local}/src/nolink`)).status, 202);
    await drainWebmentions();
    assert.equal(listInteractions("Essays/On Reading.md", true).length, before);
  });

  it("approved, it reaches visitors; the same pair again refreshes it in place", async () => {
    const reply = listInteractions("Essays/On Reading.md", true).find((c) => c.type === "reply")!;
    setCommentHidden(reply.id, false);
    assert.equal(listInteractions("Essays/On Reading.md").length, 1);
    pages.set("/src/reply", { body: fixture("reply.html").replace("I disagree", "I now agree") });
    await mention(`${local}/src/reply`);
    await drainWebmentions();
    const again = getComment(reply.id)!;
    assert.match(again.body, /I now agree/);
    assert.equal(again.hidden, false, "its moderation state is kept");
  });

  it("Verify again withdraws a mention whose source stopped linking, and one that is gone", async () => {
    const all = listInteractions("Essays/On Reading.md", true);
    const like = all.find((c) => c.type === "like")!;
    const repost = all.find((c) => c.type === "repost")!;
    const mentionRow = all.find((c) => c.type === "mention" && c.source?.endsWith("/src/mention"))!;
    assert.equal(await verifyAgain(mentionRow.id), "updated");
    pages.set("/src/like", { body: "<p>I took the link down.</p>" });
    assert.equal(await verifyAgain(like.id), "withdrawn");
    assert.equal(getComment(like.id), null);
    pages.set("/src/repost", { status: 410, body: "gone" });
    assert.equal(await verifyAgain(repost.id), "withdrawn");
    assert.equal(getComment(repost.id), null);
  });

  it("an address that is not public is refused, not fetched", async () => {
    allowPrivateAddressesForTests(false);
    try {
      const before = listInteractions("Essays/On Reading.md", true).length;
      assert.equal((await mention(`${local}/src/like?private`)).status, 202);
      await drainWebmentions();
      assert.equal(listInteractions("Essays/On Reading.md", true).length, before);
      assert.equal(gets.includes("/src/like?private"), false, "the socket never opened");
    } finally {
      allowPrivateAddressesForTests(true);
    }
  });

  it("the endpoint is rate-limited", async () => {
    resetWebmentionRateForTests();
    const answers: number[] = [];
    for (let i = 0; i < 25; i++) answers.push((await mention(`${local}/src/plain?n=${i}`, `${SITE}/Nope`)).status);
    assert.ok(answers.includes(429));
    resetWebmentionRateForTests();
  });
});

describe("sending", () => {
  it("turning Send on takes a baseline and sends nothing for what was already public", async () => {
    patchSettings({ webmentions: { send: true } });
    await reconcile();
    await drainWebmentions();
    assert.equal(received.length, 0);
  });

  it("on publish, each link to another site is sent to the endpoint it advertises", async () => {
    writeFileSync(
      path.join(root, "Links.md"),
      note(
        { publish: "true", date: "2026-09-02" },
        [
          `Header: [one](${local}/to/header). Link: <${local}/to/link>. Anchor: ${local}/to/anchor .`,
          `None: [none](${local}/to/none). Myself: [essay](${TARGET}).`,
          "",
        ].join("\n"),
      ),
    );
    await indexFile("Links.md");
    await reconcile();
    await drainWebmentions();
    const source = `${SITE}/Links`;
    assert.deepEqual(
      received.map((r) => r.path).sort(),
      ["/wm/anchor", "/wm/header", "/wm/link"],
    );
    assert.ok(received.every((r) => r.source === source));
    const sent = new Map(sentMentions().map((s) => [s.target, s]));
    assert.equal(sent.get(`${local}/to/header`)?.status, "sent");
    assert.equal(sent.get(`${local}/to/none`)?.status, "noEndpoint");
    assert.equal(sent.has(TARGET), false, "the site's own pages are never a target");
  });

  it("a republish of an unchanged page sends nothing; a changed one sends again, and tells a removed link", async () => {
    received.length = 0;
    await reconcile();
    await drainWebmentions();
    assert.equal(received.length, 0);
    writeFileSync(path.join(root, "Links.md"), note({ publish: "true", date: "2026-09-02" }, `Only [one](${local}/to/header) now.\n`));
    await indexFile("Links.md");
    await reconcile();
    await drainWebmentions();
    assert.deepEqual(received.map((r) => r.path).sort(), ["/wm/anchor", "/wm/header", "/wm/link"]);
  });

  it("an endpoint that fails is retried three more times, then recorded as failed", async () => {
    received.length = 0;
    endpointStatus = 503;
    writeFileSync(path.join(root, "Links.md"), note({ publish: "true", date: "2026-09-02" }, `Only [one](${local}/to/header), changed.\n`));
    await indexFile("Links.md");
    await reconcile();
    await drainWebmentions();
    endpointStatus = 202;
    assert.equal(received.filter((r) => r.path === "/wm/header").length, 4);
    assert.equal(sentMentions().find((s) => s.target === `${local}/to/header`)?.status, "failed");
  });

  it("the Sent panel holds the newest fifty with their status", () => {
    const sent = sentMentions();
    assert.ok(sent.length <= 50);
    assert.ok(sent.every((s) => ["queued", "sent", "noEndpoint", "failed", "skipped"].includes(s.status)));
  });
});
