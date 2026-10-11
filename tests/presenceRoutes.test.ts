// Discord presence through the Hono app (server/presenceRoutes.ts and
// server/presence/host.ts), over a throwaway vault, with a sink standing
// where the desktop parent would: what a tab reports, what the policy lets
// out, and what would have been handed to Discord. The opted-out note, the
// excluded tag and the activity-only mode are the privacy promises, proved
// end to end on the rendered card.

import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { Hono } from "hono";
import { initAuth } from "../server/auth.ts";
import { initIndexer } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { api } from "../server/api.ts";
import { patchSettings } from "../server/settings.ts";
import { initPresence, stopPresence } from "../server/presence/host.ts";
import type { DiscordActivity, PresenceStatus } from "../shared/presence/types.ts";
import type { MeData } from "../shared/types.ts";
import { makeDir, makeVault, note, removeVault } from "./helpers/vault.ts";

const data = makeDir();
const root = makeVault({
  "Books/Deep/Chapter 3.md": note({ title: "Chapter 3" }, "# Three\n\nWords.\n"),
  "Secret.md": note({ presence: "false" }, "# Secret\n\nShh.\n"),
  "Drafty.md": "# Drafty\n\nHalf done. #draft\n",
});
const app = new Hono();
app.route("/api", api);
const told: { clientId: string | null; activity: DiscordActivity | null }[] = [];
const last = () => told.at(-1);
const post = (body: unknown, headers: Record<string, string> = {}) =>
  app.request("/api/presence", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const HASH = {
  ADMIN_PASSWORD_HASH: "$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA",
  SESSION_SECRET: "relsecret0123456789abcdef0123456789",
};

before(async () => {
  initAuth({});
  initSite({ ASTROLABE_DATA: data });
  initVault(root);
  await initIndexer();
  patchSettings({ excludeTags: ["draft"], presence: { mode: "title", clientId: "123456789012345678" } });
  initPresence({ sink: (clientId, activity) => told.push({ clientId, activity }) });
});

beforeEach(() => {
  patchSettings({ presence: null });
  patchSettings({ presence: { mode: "title", clientId: "123456789012345678" } });
});

after(async () => {
  await stopPresence();
  initAuth({});
  removeVault(root);
  removeVault(data);
});

describe("POST /api/presence (the owner)", () => {
  it("renders the note's own title for the sink", async () => {
    const res = await post({ client: "tab-000001", kind: "writing", path: "Books/Deep/Chapter 3.md", idleMs: 0 });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(last()?.clientId, "123456789012345678");
    assert.equal(last()?.activity?.details, "Writing");
    assert.equal(last()?.activity?.state, "Chapter 3");
    assert.doesNotMatch(JSON.stringify(last()), /Books|Deep|\.md/, "no path leaves");
  });

  it("a note with presence: false shows the kind only", async () => {
    await post({ client: "tab-000001", kind: "writing", path: "Secret.md", idleMs: 0 });
    assert.equal(last()?.activity?.details, "Writing");
    assert.equal(last()?.activity?.state, undefined);
  });

  it("a note carrying an excluded tag shows the kind only", async () => {
    await post({ client: "tab-000001", kind: "reading", path: "Drafty.md", idleMs: 0 });
    assert.equal(last()?.activity?.details, "Reading");
    assert.equal(last()?.activity?.state, undefined);
  });

  it("activity mode never says the title", async () => {
    patchSettings({ presence: { mode: "activity" } });
    await post({ client: "tab-000001", kind: "writing", path: "Books/Deep/Chapter 3.md", idleMs: 0 });
    assert.equal(last()?.activity?.details, "Writing");
    assert.equal(last()?.activity?.state, undefined);
  });

  it("mode off tells the sink null, once", async () => {
    await post({ client: "tab-000001", kind: "drawing", path: "Books/Deep/Chapter 3.md", idleMs: 0 });
    assert.notEqual(last()?.activity, null);
    patchSettings({ presence: { mode: "off" } });
    const before = told.length;
    await post({ client: "tab-000001", kind: "writing", path: "Books/Deep/Chapter 3.md", idleMs: 0 });
    assert.deepEqual(last(), { clientId: null, activity: null });
    await post({ client: "tab-000001", kind: "library", idleMs: 0 });
    assert.equal(told.length, before + 1, "no change, no message");
  });

  it("a bad body is a 400 naming the problem", async () => {
    const res = await post({ client: "tab-000001", kind: "writing", path: "/etc/passwd", idleMs: 0 });
    assert.equal(res.status, 400);
    assert.match(JSON.stringify(await res.json()), /relative/);
    assert.equal((await post({ client: "x", kind: "writing", idleMs: 0 })).status, 400);
  });

  it("GET is the status row", async () => {
    await post({ client: "tab-000002", kind: "library", idleMs: 0 });
    const status = (await (await app.request("/api/presence")).json()) as PresenceStatus;
    assert.equal(status.enabled, true);
    assert.equal(status.mode, "title");
    assert.equal(status.applicationId, "set");
    assert.equal(status.host, "desktop", "a sink stands where the parent would");
    assert.equal(typeof status.connection, "string");
    assert.ok(status.clients >= 1);
    assert.equal(status.activity?.details, "In the library");
  });

  it("/api/me says presence is on, for the owner", async () => {
    const me = (await (await app.request("/api/me")).json()) as MeData;
    assert.equal(me.presence, true);
    patchSettings({ presence: { mode: "off" } });
    const off = (await (await app.request("/api/me")).json()) as MeData;
    assert.equal(off.presence, undefined);
  });
});

describe("/api/presence (the owner previewing as a visitor)", () => {
  it("is refused both ways, and /api/me does not say", async () => {
    const preview = { "x-astrolabe-preview": "visitor" };
    // The auth guard answers a previewing mutation before the route does.
    const res = await post({ client: "tab-000008", kind: "writing", idleMs: 0 }, preview);
    assert.ok(res.status === 401 || res.status === 404, `refused, got ${res.status}`);
    assert.equal((await app.request("/api/presence", { headers: preview })).status, 404);
    const me = (await (await app.request("/api/me", { headers: preview })).json()) as MeData;
    assert.equal(me.presence, undefined);
  });
});

describe("/api/presence (a visitor)", () => {
  before(() => initAuth(HASH));
  after(() => initAuth({}));

  it("GET is a 404, POST is refused, and /api/me never says", async () => {
    assert.equal((await app.request("/api/presence")).status, 404);
    const res = await post({ client: "tab-000009", kind: "writing", idleMs: 0 });
    assert.ok(res.status === 401 || res.status === 404, `refused, got ${res.status}`);
    const me = (await (await app.request("/api/me")).json()) as MeData;
    assert.equal(me.presence, undefined);
  });
});
