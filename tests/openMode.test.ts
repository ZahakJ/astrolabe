// Open local mode (no ADMIN_PASSWORD_HASH): every visitor is an admin, so the
// server itself must keep other websites out (server/auth.ts, "open local
// mode"). A page elsewhere must not write to the vault through the reader's
// browser (a "simple" cross-site POST/PUT needs no CORS preflight), and must
// not read it by DNS rebinding. Same-origin pages, scripts and the apps keep
// working; a password-protected instance is unchanged.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { Hono } from "hono";
import { initAuth, openModeGuard } from "../server/auth.ts";
import { api } from "../server/api.ts";
import { ensureClipToken } from "../server/clip.ts";
import { initIndexer } from "../server/indexer.ts";
import { initSite } from "../server/site.ts";
import { initVault } from "../server/vault.ts";
import { makeDir, makeVault, removeVault } from "./helpers/vault.ts";

const root = makeVault({ "Home.md": "# Home\n" });
const data = makeDir();

const app = new Hono();
app.use("*", openModeGuard);
app.route("/api", api);

const BASE = "http://localhost:6801";
const put = (note: string, headers: Record<string, string>, content = "written") =>
  app.request(`${BASE}/api/note?path=${encodeURIComponent(note)}`, {
    method: "PUT",
    headers: { Host: "localhost:6801", ...headers },
    body: JSON.stringify({ content }),
  });
const onDisk = (note: string) => existsSync(path.join(root, note));

before(async () => {
  initAuth({});
  initSite({ ASTROLABE_DATA: data, SITE_LANG: "en" });
  initVault(root);
  await initIndexer();
});

after(() => {
  initAuth({});
  removeVault(root);
  removeVault(data);
});

describe("open local mode: writes come only from the instance's own pages", () => {
  it("refuses a cross-site write, by Sec-Fetch-Site or by Origin, whatever its body type", async () => {
    for (const headers of [
      { "Content-Type": "text/plain", "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example" },
      { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example" },
      { "Content-Type": "text/plain", "Sec-Fetch-Site": "same-site", Origin: "http://other.localhost:6801" },
      { "Content-Type": "text/plain", Origin: "https://evil.example" },
      { "Content-Type": "text/plain", Origin: "null" },
    ] as Record<string, string>[]) {
      const res = await put("Evil.md", headers);
      assert.equal(res.status, 403, JSON.stringify(headers));
    }
    const del = await app.request(`${BASE}/api/note?path=Home.md`, {
      method: "DELETE",
      headers: { Host: "localhost:6801", "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example" },
    });
    assert.equal(del.status, 403);
    assert.equal(onDisk("Evil.md"), false);
    assert.equal(onDisk("Home.md"), true);
  });

  it("refuses a same-origin write that is not JSON (a form or text/plain)", async () => {
    for (const type of ["text/plain;charset=UTF-8", "application/x-www-form-urlencoded"]) {
      const res = await put("Plain.md", { "Content-Type": type, "Sec-Fetch-Site": "same-origin" });
      assert.equal(res.status, 415, type);
    }
    assert.equal(onDisk("Plain.md"), false);
  });

  it("takes the app's own JSON writes, and a script's", async () => {
    const own = await put("Own.md", { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin", Origin: BASE });
    assert.equal(own.status, 200);
    assert.equal(readFileSync(path.join(root, "Own.md"), "utf8"), "written");
    // An older browser: no Sec-Fetch-Site, an Origin that names this host.
    const older = await put("Older.md", { "Content-Type": "application/json", Origin: BASE });
    assert.equal(older.status, 200);
    // curl or a script: neither header.
    const script = await put("Script.md", { "Content-Type": "application/json" });
    assert.equal(script.status, 200);
  });

  it("the clipper takes a cross-site clip only with its token", async () => {
    const clip = (headers: Record<string, string>) =>
      app.request(`${BASE}/api/clip`, {
        method: "POST",
        headers: { Host: "localhost:6801", "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ text: "a thought from elsewhere" }),
      });
    assert.equal((await clip({ "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example" })).status, 401);
    const token = ensureClipToken();
    const withToken = await clip({ "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example", Authorization: `Bearer ${token}` });
    assert.equal(withToken.status, 200);
    assert.equal((await clip({ "Sec-Fetch-Site": "same-origin" })).status, 200);
  });
});

describe("open local mode: answers only to its own host names (DNS rebinding)", () => {
  const me = (host: string) => app.request(`http://${host}/api/me`, { headers: { Host: host } });

  it("refuses a name it was not given, and reads nothing for it", async () => {
    const res = await me("attacker.example:6801");
    assert.equal(res.status, 403);
    assert.ok(!(await res.text()).includes("Home"));
  });

  it("answers localhost, an IP address, SITE_URL's host and ALLOWED_HOSTS", async () => {
    for (const host of ["localhost:6801", "127.0.0.1:6801", "[::1]:6801", "192.168.1.20:6801", "app.localhost:6801"]) {
      assert.equal((await me(host)).status, 200, host);
    }
    assert.equal((await me("mybox.local:6801")).status, 403);
    initAuth({ ALLOWED_HOSTS: "mybox.local, notes.lan" });
    try {
      assert.equal((await me("mybox.local:6801")).status, 200);
      assert.equal((await me("NOTES.LAN")).status, 200);
    } finally {
      initAuth({});
    }
    initSite({ ASTROLABE_DATA: data, SITE_LANG: "en", SITE_URL: "https://notes.example.org" });
    try {
      assert.equal((await me("notes.example.org")).status, 200);
    } finally {
      initSite({ ASTROLABE_DATA: data, SITE_LANG: "en" });
    }
  });
});

describe("with a password nothing here applies", () => {
  // A syntactically valid argon2id hash nobody knows the password to.
  const HASH = "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRzb21lc2FsdA$4a3m3QkYb0kq3d3QZcV7mDcXo2y5x1HTTq4lYqfQ3ZQ";
  before(() => initAuth({ ADMIN_PASSWORD_HASH: HASH, SESSION_SECRET: "x".repeat(64) }));
  after(() => initAuth({}));

  it("any host name is served, and an anonymous write is a 401 as before", async () => {
    const res = await app.request("http://notes.example.com/api/me", { headers: { Host: "notes.example.com" } });
    assert.equal(res.status, 200);
    const write = await put("Anon.md", { "Content-Type": "application/json" });
    assert.equal(write.status, 401);
  });
});

describe("the bind address", () => {
  it("defaults to loopback; the network is opt-in through HOST", () => {
    const src = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");
    assert.match(src, /const host = process\.env\.HOST\?\.trim\(\) \|\| "127\.0\.0\.1";/);
  });
});
