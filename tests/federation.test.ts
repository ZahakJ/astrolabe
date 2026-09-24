// NOTHING PRIVATE GOES OUT (the audit's test, 3.24 Part 3 item 6).
//
// Webmentions and the fediverse are the two features that talk to other
// servers about this site, and both are held to one rule
// (server/federation.ts::federablePosts): published, LISTED (not a template,
// not a library lesson), and not curated away by the language filter as the
// site speaks without a reader. This file builds a vault with one note of
// each kind that must never leave — a draft, a published template, a
// published library lesson, a published note the language filter hides —
// and one public note that LINKS to all of them, then turns every switch on
// and asks every door: may it be a webmention's target, does it send one,
// is it in the outbox, does its address answer as an object, does a like of
// it file anything, is a Create delivered for it. The answer is no, each
// time, for each. And with PUBLIC=false nothing at all is federable.

import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { closeActivityPub, drainDeliveries, handleActivity, initActivityPub, outbox, rememberActorForTests, type RemoteActor } from "../server/activitypub.ts";
import { activitypubPublic } from "../server/activitypubRoutes.ts";
import { initAuth } from "../server/auth.ts";
import { initComments, listInteractions } from "../server/comments.ts";
import { closeFederation, federablePosts, pathForUrl, reconcile } from "../server/federation.ts";
import { indexFile, initIndexer } from "../server/indexer.ts";
import { allowPrivateAddressesForTests } from "../server/safeFetch.ts";
import { patchSettings } from "../server/settings.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { acceptWebmention, closeWebmentions, drainWebmentions, initWebmentions, sentMentions, setWebmentionBackoffForTests } from "../server/webmentions.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

const SITE = "https://blog.example";
const ARABIC = "فقرة عربية كاملة تكفي لتصنيف اللغة بلا لبس، وتكفي أيضاً ليعرف الفلتر أنها ليست إنجليزية.";

let server: Server;
let local = "";
const posted: { path: string; body: string }[] = [];
let root = "";
const data = makeDir();

/** Every note that must never leave, by why. */
const HIDDEN: Record<string, string> = {
  private: "Draft.md",
  template: "Templates/Stencil.md",
  lesson: "Books/Optics/Chapter 1.md",
  filtered: "مقالة.md",
};
const PUBLIC = "Essay.md";
const url = (notePath: string): string => `${SITE}/${notePath.replace(/\.md$/, "").split("/").map(encodeURIComponent).join("/")}`;

const follower: RemoteActor = {
  id: "",
  inbox: "",
  sharedInbox: null,
  name: "Ada",
  url: null,
  icon: null,
  keyId: "",
  pem: generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }) as string,
};

before(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      if (req.method === "POST") posted.push({ path: req.url ?? "/", body });
      // Every page advertises an endpoint, so any send that was made would land.
      res.writeHead(req.method === "POST" ? 202 : 200, { "Content-Type": "text/html", Link: '</wm>; rel="webmention"' });
      res.end("<p>ok</p>");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  allowPrivateAddressesForTests(true);
  follower.id = `${local}/users/ada`;
  follower.inbox = `${local}/users/ada/inbox`;
  follower.keyId = `${follower.id}#main-key`;
  const external = (tag: string): string => `See [elsewhere](${local}/from/${tag}).\n`;
  root = makeVault({
    [PUBLIC]: note({ publish: "true", date: "2026-09-01" }, `A public essay. It links to [the draft](${url(HIDDEN.private)}), [the stencil](${url(HIDDEN.template)}), [the lesson](${url(HIDDEN.lesson)}) and [the Arabic](${url(HIDDEN.filtered)}).\n`),
    [HIDDEN.private]: note({ publish: "false" }, external("private")),
    [HIDDEN.template]: note({ publish: "true" }, external("template")),
    [HIDDEN.lesson]: note({ publish: "true" }, external("lesson")),
    [HIDDEN.filtered]: note({ publish: "true" }, `${ARABIC}\n\n${external("filtered")}`),
  });
  initSite({ ASTROLABE_DATA: data, SITE_URL: SITE });
  initVault(root);
  await initIndexer();
  patchSettings({
    languageFilter: "en",
    library: { enabled: true, paths: [{ id: "optics", slug: "optics", folder: "Books/Optics", kind: "book", title: "Optics" }] },
    webmentions: { accept: true, send: true },
    fediverse: { enabled: true },
  });
  initComments({ ASTROLABE_DATA: data });
  initWebmentions({ dbFile: path.join(data, "webmentions.db") });
  setWebmentionBackoffForTests([0, 0, 0]);
  initActivityPub({ dbFile: path.join(data, "activitypub.db"), keyFile: path.join(data, "activitypub-key.pem") });
  rememberActorForTests(follower);
  await handleActivity({ id: `${follower.id}#f`, type: "Follow", actor: follower.id, object: `${SITE}/actor` }, follower, SITE);
  // The baseline, taken with nothing published but the essay.
  for (const rel of [PUBLIC, ...Object.values(HIDDEN)]) {
    writeFileSync(path.join(root, rel), note({ publish: "false" }, "held back\n"));
    await indexFile(rel);
  }
  await reconcile();
  await drainDeliveries();
  posted.length = 0;
});

after(async () => {
  closeWebmentions();
  closeActivityPub();
  closeFederation();
  allowPrivateAddressesForTests(false);
  await new Promise<void>((r) => server.close(() => r()));
  removeVault(root);
  removeVault(data);
});

describe("nothing private, unlisted or filtered by language is ever a source or a target", () => {
  before(async () => {
    // Now publish them all at once, the way a git pull would.
    const external = (tag: string): string => `See [elsewhere](${local}/from/${tag}).\n`;
    const files: Record<string, string> = {
      [PUBLIC]: note({ publish: "true", date: "2026-09-01" }, `A public essay. It links to [the draft](${url(HIDDEN.private)}), [the stencil](${url(HIDDEN.template)}), [the lesson](${url(HIDDEN.lesson)}), [the Arabic](${url(HIDDEN.filtered)}) and [a friend](${local}/from/public).\n`),
      [HIDDEN.private]: note({ publish: "false" }, external("private")),
      [HIDDEN.template]: note({ publish: "true" }, external("template")),
      [HIDDEN.lesson]: note({ publish: "true" }, external("lesson")),
      [HIDDEN.filtered]: note({ publish: "true" }, `${ARABIC}\n\n${external("filtered")}`),
    };
    for (const [rel, text] of Object.entries(files)) {
      writeFileSync(path.join(root, rel), text);
      await indexFile(rel);
    }
    await reconcile();
    await drainWebmentions();
    await drainDeliveries();
  });

  it("the federable set is the public essay alone", () => {
    assert.deepEqual(federablePosts().map((p) => p.path), [PUBLIC]);
  });

  for (const [why, rel] of Object.entries(HIDDEN)) {
    it(`the ${why} note is no webmention target, and no Like of it files`, async () => {
      assert.equal(pathForUrl(url(rel), SITE), null);
      assert.equal(acceptWebmention(`${local}/src`, url(rel), SITE), "badTarget");
      await handleActivity({ id: `${follower.id}#like-${why}`, type: "Like", actor: follower.id, object: url(rel) }, follower, SITE);
      assert.equal(listInteractions(rel, true).length, 0);
    });

    it(`the ${why} note sends no webmention, and none is sent to it`, () => {
      const sent = sentMentions(500);
      assert.equal(sent.some((s) => s.notePath === rel), false);
      assert.equal(sent.some((s) => s.target === url(rel)), false);
      assert.equal(posted.some((p) => p.body.includes(encodeURIComponent(`/from/${why}`))), false);
    });

    it(`the ${why} note is in no outbox, answers as no object, and no follower is told of it`, async () => {
      const page = await outbox(SITE, 1);
      assert.equal(JSON.stringify(page).includes(url(rel)), false);
      const res = await activitypubPublic.request(url(rel), { headers: { Accept: "application/activity+json" } });
      assert.equal(res.status, 404);
      assert.equal(posted.some((p) => p.body.includes(url(rel))), false);
    });
  }

  it("the public essay does all of it: sends its one outside link, is delivered, is in the outbox", async () => {
    const sent = sentMentions(500);
    assert.deepEqual(sent.map((s) => s.target), [`${local}/from/public`]);
    assert.ok(posted.some((p) => p.path === "/users/ada/inbox" && JSON.parse(p.body).type === "Create"));
    assert.ok(JSON.stringify(await outbox(SITE, 1)).includes(url(PUBLIC)));
  });

  it("the set follows the setting: a page the filter now hides is deleted from followers and sends nothing more", async () => {
    posted.length = 0;
    const sentBefore = sentMentions(500).length;
    patchSettings({ languageFilter: "ar" });
    await reconcile();
    await drainWebmentions();
    await drainDeliveries();
    const bodies = posted.filter((p) => p.path.startsWith("/users/")).map((p) => JSON.parse(p.body) as { type?: string; object?: { id?: string } });
    assert.ok(bodies.some((a) => a.type === "Delete" && a.object?.id === url(PUBLIC)), "the essay is deleted from the fediverse");
    assert.equal(bodies.some((a) => a.object?.id === url(PUBLIC) && a.type !== "Delete"), false);
    // …and the Arabic note, which the filter now shows, is public — and
    // announced as what it is.
    assert.ok(bodies.some((a) => a.type === "Create" && a.object?.id === url(HIDDEN.filtered)));
    assert.equal(sentMentions(500).filter((s) => s.notePath === PUBLIC).length, 1, "the essay sent nothing on its way out");
    assert.ok(sentMentions(500).length >= sentBefore);
    patchSettings({ languageFilter: "en" });
  });

  it("with PUBLIC=false nothing at all is federable", () => {
    initAuth({ PUBLIC: "false", ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA", SESSION_SECRET: "relsecret0123456789abcdef0123456789" });
    try {
      assert.deepEqual(federablePosts(), []);
      assert.equal(pathForUrl(url(PUBLIC), SITE), null);
    } finally {
      initAuth({});
    }
  });
});
