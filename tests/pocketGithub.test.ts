// SIGNING IN TO GITHUB FROM A PHONE (mobile/src/pocket/github.ts), against a
// fake `http` — nothing here reaches github.com.
//
// Pinned: the device flow asks for one scope and nothing else; each answer the
// token endpoint can give is its own state, and a scripted run through them
// (pending → slow down → pending → token) is the loop the connection screen
// drives; a token is validated by asking who it belongs to; the repository
// list asks for all three affiliations and pages; the URL git clones from
// carries no credentials, and the token rides in a Basic header.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GITHUB_SCOPE,
  GitHubError,
  cloneUrlFor,
  gitAuthHeader,
  listBranches,
  listRepos,
  pollForToken,
  requestDeviceCode,
  whoAmI,
  type GitHubHttp,
} from "../mobile/src/pocket/github.ts";

type Req = Parameters<GitHubHttp>[0];

/** A fake GitHub: each request is recorded and answered by `reply`. */
function fake(reply: (req: Req, n: number) => { status: number; body: unknown }): GitHubHttp & { seen: Req[] } {
  const seen: Req[] = [];
  const http = (async (req: Req) => {
    seen.push(req);
    const { status, body } = reply(req, seen.length);
    return { status, text: typeof body === "string" ? body : JSON.stringify(body) };
  }) as GitHubHttp & { seen: Req[] };
  http.seen = seen;
  return http;
}

const formOf = (body: string | undefined): Record<string, string> => Object.fromEntries(new URLSearchParams(body ?? ""));

describe("the device code", () => {
  it("asks for the one scope a private vault needs, and reads the answer", async () => {
    const http = fake(() => ({
      status: 200,
      body: { device_code: "dc", user_code: "WDJB-MJHT", verification_uri: "https://github.com/login/device", expires_in: 600, interval: 7 },
    }));
    const code = await requestDeviceCode(http, "client-123");
    assert.deepEqual(code, { deviceCode: "dc", userCode: "WDJB-MJHT", verificationUri: "https://github.com/login/device", expiresInSeconds: 600, intervalSeconds: 7 });
    const [req] = http.seen;
    assert.equal(req.method, "POST");
    assert.equal(req.url, "https://github.com/login/device/code");
    assert.deepEqual(formOf(req.body), { client_id: "client-123", scope: "repo" });
    assert.equal(GITHUB_SCOPE, "repo");
  });

  it("fills GitHub's own defaults when it leaves the timings out", async () => {
    const code = await requestDeviceCode(fake(() => ({ status: 200, body: { device_code: "dc", user_code: "U" } })), "c");
    assert.equal(code.expiresInSeconds, 900);
    assert.equal(code.intervalSeconds, 5);
    assert.equal(code.verificationUri, "https://github.com/login/device");
  });

  it("is a GitHubError, with GitHub's own sentence, when there is no code", async () => {
    await assert.rejects(
      () => requestDeviceCode(fake(() => ({ status: 400, body: { error: "unauthorized_client", error_description: "The client is not set up for the device flow" } })), "c"),
      (err: unknown) => err instanceof GitHubError && err.code === "deviceCode" && /device flow/.test(err.message),
    );
    await assert.rejects(() => requestDeviceCode(fake(() => ({ status: 502, body: "<html>bad gateway</html>" })), "c"), GitHubError);
  });
});

describe("the poll, one answer per state", () => {
  const poll = (body: unknown) => pollForToken(fake(() => ({ status: 200, body })), "client", "dc");

  it("sends the device grant", async () => {
    const http = fake(() => ({ status: 200, body: { error: "authorization_pending" } }));
    await pollForToken(http, "client", "dc");
    assert.equal(http.seen[0].url, "https://github.com/login/oauth/access_token");
    assert.deepEqual(formOf(http.seen[0].body), { client_id: "client", device_code: "dc", grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
  });

  it("maps every answer the token endpoint gives", async () => {
    assert.deepEqual(await poll({ access_token: "gho_x", token_type: "bearer" }), { kind: "token", token: "gho_x" });
    assert.deepEqual(await poll({ error: "authorization_pending" }), { kind: "pending" });
    assert.deepEqual(await poll({ error: "slow_down", interval: 15 }), { kind: "slow-down", intervalSeconds: 15 });
    assert.deepEqual(await poll({ error: "slow_down" }), { kind: "slow-down", intervalSeconds: 10 });
    assert.deepEqual(await poll({ error: "expired_token" }), { kind: "expired" });
    assert.deepEqual(await poll({ error: "access_denied" }), { kind: "denied" });
    assert.deepEqual(await poll({ error: "incorrect_device_code", error_description: "That code is not one we gave out" }), { kind: "error", message: "That code is not one we gave out" });
    assert.deepEqual(await poll("not json"), { kind: "error", message: "GitHub refused the sign-in" });
  });

  it("runs pending → slow down → pending → token, the way the connection screen drives it", async () => {
    const script = [{ error: "authorization_pending" }, { error: "slow_down", interval: 10 }, { error: "authorization_pending" }, { access_token: "gho_done" }];
    const http = fake((_req, n) => ({ status: 200, body: script[n - 1] }));
    let interval = 5;
    const waited: number[] = [];
    let token: string | null = null;
    for (let turn = 0; turn < 10 && token === null; turn++) {
      waited.push(interval);
      const answer = await pollForToken(http, "client", "dc");
      if (answer.kind === "token") token = answer.token;
      else if (answer.kind === "slow-down") interval = answer.intervalSeconds;
      else assert.equal(answer.kind, "pending");
    }
    assert.equal(token, "gho_done");
    assert.equal(http.seen.length, 4);
    assert.deepEqual(waited, [5, 5, 10, 10], "a slow_down lengthens every poll after it");
  });
});

describe("a token, validated", () => {
  it("is whoever GitHub says it belongs to", async () => {
    const http = fake(() => ({ status: 200, body: { login: "owner", name: "The Owner", email: null } }));
    assert.deepEqual(await whoAmI(http, "gho_x"), { login: "owner", name: "The Owner", email: null });
    const [req] = http.seen;
    assert.equal(req.url, "https://api.github.com/user");
    assert.equal(req.headers.Authorization, "Bearer gho_x");
    assert.equal(req.headers.Accept, "application/vnd.github+json");
  });

  it("and a token GitHub does not know is refused, not trusted", async () => {
    await assert.rejects(() => whoAmI(fake(() => ({ status: 401, body: { message: "Bad credentials" } })), "bad"), (err: unknown) => err instanceof GitHubError && err.code === "unauthorized");
  });
});

describe("the repositories", () => {
  const row = (i: number) => ({ full_name: `owner/r${i}`, name: `r${i}`, owner: { login: "owner" }, private: i % 2 === 0, default_branch: "main", pushed_at: "2026-01-01T00:00:00Z", clone_url: `https://github.com/owner/r${i}.git` });

  it("asks for every affiliation, reads the rows, and pages until a short page", async () => {
    const http = fake((req) => {
      const page = Number(new URL(req.url).searchParams.get("page"));
      return { status: 200, body: page === 1 ? Array.from({ length: 100 }, (_, i) => row(i)) : [row(100)] };
    });
    const repos = await listRepos(http, "gho_x");
    assert.equal(repos.length, 101);
    assert.equal(http.seen.length, 2);
    const q = new URL(http.seen[0].url).searchParams;
    assert.equal(q.get("affiliation"), "owner,collaborator,organization_member");
    assert.equal(q.get("sort"), "updated");
    assert.deepEqual(repos[0], { fullName: "owner/r0", name: "r0", owner: "owner", private: true, defaultBranch: "main", updatedAt: "2026-01-01T00:00:00Z", cloneUrl: "https://github.com/owner/r0.git" });
  });

  it("stops at the page limit, and a refusal is a GitHubError", async () => {
    const http = fake(() => ({ status: 200, body: Array.from({ length: 100 }, (_, i) => row(i)) }));
    assert.equal((await listRepos(http, "t", 2)).length, 200);
    assert.equal(http.seen.length, 2);
    await assert.rejects(() => listRepos(fake(() => ({ status: 403, body: {} })), "t"), (err: unknown) => err instanceof GitHubError && err.code === "repos");
  });

  it("lists a repository's branches, and none when GitHub will not say", async () => {
    const http = fake(() => ({ status: 200, body: [{ name: "main" }, { name: "drafts" }] }));
    assert.deepEqual(await listBranches(http, "t", "owner/vault"), ["main", "drafts"]);
    assert.equal(http.seen[0].url, "https://api.github.com/repos/owner/vault/branches?per_page=100");
    assert.deepEqual(await listBranches(fake(() => ({ status: 404, body: {} })), "t", "owner/gone"), []);
  });
});

describe("what git is given", () => {
  it("a clone URL with no credentials, and the token as HTTP Basic", () => {
    assert.equal(cloneUrlFor("owner/vault"), "https://github.com/owner/vault.git");
    const { Authorization } = gitAuthHeader("gho_secret");
    assert.match(Authorization, /^Basic /);
    assert.equal(atob(Authorization.slice(6)), "gho_secret:x-oauth-basic");
  });
});
