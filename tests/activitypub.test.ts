// The fediverse (server/activitypub.ts, server/activitypubRoutes.ts): the
// HTTP Signature round trip, the shapes Mastodon reads (WebFinger, NodeInfo,
// the actor, the outbox), and the inbox and deliveries against a remote
// actor served on 127.0.0.1 — a follow, a like, a boost, a reply, their
// undoing, and a Create delivered on publish, signed so the remote side can
// check it with the key the actor document publishes. The site's own address
// is https://blog.example and is never fetched.

import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  closeActivityPub,
  drainDeliveries,
  followerCount,
  initActivityPub,
  parseSignatureHeader,
  setDeliveryBackoffForTests,
  SignatureError,
  signRequest,
  verifySignature,
} from "../server/activitypub.ts";
import { activitypubPublic } from "../server/activitypubRoutes.ts";
import { initComments, listInteractions } from "../server/comments.ts";
import { closeFederation, reconcile } from "../server/federation.ts";
import { indexFile, initIndexer } from "../server/indexer.ts";
import { allowPrivateAddressesForTests } from "../server/safeFetch.ts";
import { patchSettings } from "../server/settings.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

const SITE = "https://blog.example";
const AP = "application/activity+json";
const remote = generateKeyPairSync("rsa", { modulusLength: 2048 });
const remotePrivate = remote.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
const remotePublic = remote.publicKey.export({ type: "spki", format: "pem" }) as string;

let server: Server;
let local = "";
let actorUrl = "";
const inbox: { path: string; headers: Record<string, string>; body: string }[] = [];
let root = "";
const data = makeDir();

async function get(pathname: string, accept = AP): Promise<Response> {
  return activitypubPublic.request(`${SITE}${pathname}`, { headers: { Accept: accept } });
}

async function post(activity: Record<string, unknown>, opts: { key?: string; tamper?: boolean } = {}): Promise<Response> {
  const body = JSON.stringify(activity);
  const signed = signRequest("POST", `${SITE}/actor/inbox`, body, `${actorUrl}#main-key`, opts.key ?? remotePrivate);
  return activitypubPublic.request(`${SITE}/actor/inbox`, {
    method: "POST",
    headers: { ...signed, "Content-Type": AP },
    body: opts.tamper ? body.replace("Like", "Announce") : body,
  });
}

before(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (req.method === "POST") {
      let body = "";
      req.on("data", (c: Buffer) => (body += c.toString()));
      req.on("end", () => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers[k] = v;
        inbox.push({ path: url, headers, body });
        res.writeHead(202);
        res.end();
      });
      return;
    }
    if (url === "/users/ada") {
      res.writeHead(200, { "Content-Type": AP });
      res.end(
        JSON.stringify({
          "@context": ["https://www.w3.org/ns/activitystreams"],
          id: actorUrl,
          type: "Person",
          preferredUsername: "ada",
          name: "Ada Reader",
          url: `${local}/@ada`,
          icon: { type: "Image", url: `${local}/ada.png` },
          inbox: `${actorUrl}/inbox`,
          endpoints: { sharedInbox: `${local}/inbox` },
          publicKey: { id: `${actorUrl}#main-key`, owner: actorUrl, publicKeyPem: remotePublic },
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  actorUrl = `${local}/users/ada`;
  allowPrivateAddressesForTests(true);
  root = makeVault({
    "Essays/On Reading.md": note({ publish: "true", date: "2026-09-01", tags: "[reading]" }, "An essay on reading slowly.\n"),
    "Draft.md": note({ publish: "false" }, "Not yet.\n"),
  });
  initSite({ ASTROLABE_DATA: data, SITE_URL: SITE, SITE_NAME: "Kitāb al-Ḥikma" });
  initVault(root);
  await initIndexer();
  initComments({ ASTROLABE_DATA: data });
  initActivityPub({ dbFile: path.join(data, "activitypub.db"), keyFile: path.join(data, "activitypub-key.pem") });
  setDeliveryBackoffForTests([0, 0, 0]);
});

after(async () => {
  closeActivityPub();
  closeFederation();
  allowPrivateAddressesForTests(false);
  await new Promise<void>((r) => server.close(() => r()));
  removeVault(root);
  removeVault(data);
});

describe("HTTP Signatures", () => {
  const url = "https://x.example/inbox?y=1";
  const body = '{"type":"Like"}';
  const lower = (h: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));

  it("a signed request verifies with the signer's public key", () => {
    const headers = lower(signRequest("POST", url, body, "k", remotePrivate));
    const sig = parseSignatureHeader(headers.signature)!;
    assert.deepEqual(sig.headers, ["(request-target)", "host", "date", "digest"]);
    verifySignature(sig, "POST", "/inbox?y=1", headers, body, remotePublic);
  });

  it("a changed body, path, key or an old date does not", () => {
    const headers = lower(signRequest("POST", url, body, "k", remotePrivate));
    const sig = parseSignatureHeader(headers.signature)!;
    assert.throws(() => verifySignature(sig, "POST", "/inbox?y=1", headers, '{"type":"Announce"}', remotePublic), SignatureError);
    assert.throws(() => verifySignature(sig, "POST", "/other", headers, body, remotePublic), SignatureError);
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki", format: "pem" }) as string;
    assert.throws(() => verifySignature(sig, "POST", "/inbox?y=1", headers, body, other), SignatureError);
    const old = lower(signRequest("POST", url, body, "k", remotePrivate, new Date(Date.now() - 48 * 3600_000)));
    assert.throws(() => verifySignature(parseSignatureHeader(old.signature)!, "POST", "/inbox?y=1", old, body, remotePublic), SignatureError);
  });
});

describe("while the switch is off", () => {
  it("nothing answers: WebFinger 404, the inbox 404, the actor falls through", async () => {
    assert.equal((await get("/.well-known/webfinger?resource=acct:kitab_al_hikma@blog.example")).status, 404);
    assert.equal((await post({ type: "Follow" })).status, 404);
    assert.equal((await get("/actor")).status, 404);
  });
});

describe("what Mastodon reads", () => {
  before(() => patchSettings({ fediverse: { enabled: true } }));

  it("WebFinger resolves the handle derived from the site name", async () => {
    const res = await get("/.well-known/webfinger?resource=acct:kitab_al_hikma@blog.example");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/jrd\+json/);
    const jrd = (await res.json()) as { subject: string; links: { rel: string; type?: string; href: string }[] };
    assert.equal(jrd.subject, "acct:kitab_al_hikma@blog.example");
    assert.deepEqual(jrd.links.find((l) => l.rel === "self"), { rel: "self", type: AP, href: `${SITE}/actor` });
    assert.equal((await get("/.well-known/webfinger?resource=acct:someone@blog.example")).status, 404);
  });

  it("a chosen handle replaces it", async () => {
    patchSettings({ fediverse: { handle: "hikma" } });
    assert.equal((await get("/.well-known/webfinger?resource=acct:hikma@blog.example")).status, 200);
    assert.equal((await get("/.well-known/webfinger?resource=acct:kitab_al_hikma@blog.example")).status, 404);
  });

  it("NodeInfo names the software and one user", async () => {
    const links = (await (await get("/.well-known/nodeinfo")).json()) as { links: { href: string }[] };
    assert.equal(links.links[0].href, `${SITE}/nodeinfo/2.1`);
    const info = (await (await get("/nodeinfo/2.1")).json()) as Record<string, any>;
    assert.equal(info.software.name, "astrolabe");
    assert.deepEqual(info.protocols, ["activitypub"]);
    assert.equal(info.usage.users.total, 1);
    assert.equal(info.usage.localPosts, 1);
  });

  it("the actor carries its inbox, outbox, followers and public key; a browser falls through", async () => {
    const res = await get("/actor");
    assert.match(res.headers.get("content-type") ?? "", /application\/activity\+json/);
    const actor = (await res.json()) as Record<string, any>;
    assert.equal(actor.id, `${SITE}/actor`);
    assert.equal(actor.type, "Person");
    assert.equal(actor.preferredUsername, "hikma");
    assert.equal(actor.name, "Kitāb al-Ḥikma");
    assert.equal(actor.inbox, `${SITE}/actor/inbox`);
    assert.equal(actor.outbox, `${SITE}/actor/outbox`);
    assert.equal(actor.followers, `${SITE}/actor/followers`);
    assert.equal(actor.publicKey.owner, `${SITE}/actor`);
    assert.match(actor.publicKey.publicKeyPem, /BEGIN PUBLIC KEY/);
    assert.equal((await get("/actor", "text/html")).status, 404);
  });

  it("the outbox pages Create activities of the published posts only, with their language", async () => {
    const coll = (await (await get("/actor/outbox")).json()) as Record<string, any>;
    assert.equal(coll.type, "OrderedCollection");
    assert.equal(coll.totalItems, 1);
    const page = (await (await get("/actor/outbox?page=1")).json()) as Record<string, any>;
    assert.equal(page.type, "OrderedCollectionPage");
    const create = page.orderedItems[0];
    assert.equal(create.type, "Create");
    assert.equal(create.object.id, `${SITE}/Essays/On%20Reading`);
    assert.equal(create.object.type, "Note");
    assert.deepEqual(Object.keys(create.object.contentMap), ["en"]);
    assert.deepEqual(create.object.to, ["https://www.w3.org/ns/activitystreams#Public"]);
    assert.deepEqual(create.object.tag.map((t: { name: string }) => t.name), ["#reading"]);
  });

  it("a page's own address answers with its object for an ActivityPub Accept", async () => {
    const res = await get("/Essays/On%20Reading");
    assert.equal(((await res.json()) as { id: string }).id, `${SITE}/Essays/On%20Reading`);
    assert.equal((await get("/Draft")).status, 404);
  });
});

describe("the inbox", () => {
  const page = `${SITE}/Essays/On%20Reading`;

  it("refuses an unsigned or a badly signed activity", async () => {
    const unsigned = await activitypubPublic.request(`${SITE}/actor/inbox`, { method: "POST", headers: { "Content-Type": AP }, body: "{}" });
    assert.equal(unsigned.status, 401);
    assert.equal((await post({ id: `${actorUrl}#l0`, type: "Like", actor: actorUrl, object: page }, { tamper: true })).status, 401);
  });

  it("accepts a Follow at once, keeps the follower and delivers the Accept, signed", async () => {
    const res = await post({ id: `${actorUrl}#follow-1`, type: "Follow", actor: actorUrl, object: `${SITE}/actor` });
    assert.equal(res.status, 202);
    assert.equal(followerCount(), 1);
    await drainDeliveries();
    const accept = inbox.find((m) => JSON.parse(m.body).type === "Accept");
    assert.ok(accept, "an Accept was delivered");
    assert.equal(accept.path, "/users/ada/inbox");
    const actor = (await (await get("/actor")).json()) as { publicKey: { publicKeyPem: string } };
    verifySignature(parseSignatureHeader(accept.headers.signature)!, "POST", accept.path, accept.headers, accept.body, actor.publicKey.publicKeyPem);
  });

  it("a Like and an Announce are filed as like and repost, shown at once; a reply awaits moderation", async () => {
    assert.equal((await post({ id: `${actorUrl}#like-1`, type: "Like", actor: actorUrl, object: page })).status, 202);
    assert.equal((await post({ id: `${actorUrl}#boost-1`, type: "Announce", actor: actorUrl, object: page })).status, 202);
    const reply = { id: `${actorUrl}/notes/1`, type: "Note", attributedTo: actorUrl, inReplyTo: page, content: "<p>Lovely &amp; slow.</p>", url: `${local}/@ada/1` };
    assert.equal((await post({ id: `${actorUrl}/notes/1/activity`, type: "Create", actor: actorUrl, object: reply })).status, 202);
    const all = listInteractions("Essays/On Reading.md", true);
    assert.deepEqual(all.map((c) => [c.kind, c.type, c.hidden]), [
      ["activitypub", "like", false],
      ["activitypub", "repost", false],
      ["activitypub", "reply", true],
    ]);
    assert.equal(all[0].author, "Ada Reader");
    assert.equal(all[0].photo, `${local}/ada.png`);
    assert.equal(all[2].body, "Lovely & slow.");
    assert.equal(listInteractions("Essays/On Reading.md").length, 2, "visitors see the like and the boost");
  });

  it("an activity about a page that is not public files nothing", async () => {
    await post({ id: `${actorUrl}#like-draft`, type: "Like", actor: actorUrl, object: `${SITE}/Draft` });
    assert.equal(listInteractions("Draft.md", true).length, 0);
  });

  it("Undo and Delete remove what that actor's activity filed, and only that", async () => {
    await post({ id: `${actorUrl}#undo-1`, type: "Undo", actor: actorUrl, object: { id: `${actorUrl}#like-1`, type: "Like", actor: actorUrl, object: page } });
    await post({ id: `${actorUrl}/notes/1#delete`, type: "Delete", actor: actorUrl, object: { id: `${actorUrl}/notes/1`, type: "Tombstone" } });
    assert.deepEqual(listInteractions("Essays/On Reading.md", true).map((c) => c.type), ["repost"]);
  });
});

describe("deliveries", () => {
  it("publishing delivers a Create to the follower's shared inbox; a republish an Update; unpublishing a Delete", async () => {
    await reconcile(); // the baseline: the essay was already public
    inbox.length = 0;
    writeFileSync(path.join(root, "Draft.md"), note({ publish: "true", date: "2026-09-03" }, "Now it is out.\n"));
    await indexFile("Draft.md");
    await reconcile();
    await drainDeliveries();
    const create = inbox.map((m) => ({ path: m.path, a: JSON.parse(m.body) })).find((m) => m.a.type === "Create");
    assert.ok(create);
    assert.equal(create.path, "/inbox", "the shared inbox");
    assert.equal(create.a.object.id, `${SITE}/Draft`);

    writeFileSync(path.join(root, "Draft.md"), note({ publish: "true", date: "2026-09-03" }, "Now it is out, and edited.\n"));
    await indexFile("Draft.md");
    await reconcile();
    await drainDeliveries();
    assert.ok(inbox.some((m) => JSON.parse(m.body).type === "Update"));

    writeFileSync(path.join(root, "Draft.md"), note({ publish: "false" }, "Back in the drawer.\n"));
    await indexFile("Draft.md");
    await reconcile();
    await drainDeliveries();
    const del = inbox.map((m) => JSON.parse(m.body)).find((a) => a.type === "Delete");
    assert.equal(del?.object.id, `${SITE}/Draft`);
    assert.equal(del?.object.type, "Tombstone");
  });

  it("Undo Follow forgets the follower", async () => {
    await post({ id: `${actorUrl}#undo-follow`, type: "Undo", actor: actorUrl, object: { id: `${actorUrl}#follow-1`, type: "Follow", actor: actorUrl, object: `${SITE}/actor` } });
    assert.equal(followerCount(), 0);
  });
});
