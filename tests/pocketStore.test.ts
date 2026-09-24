// WHAT THE PHONE REMEMBERS (mobile/src/pocket/store.ts) and HOW ITS GIT
// BYTES TRAVEL (mobile/src/pocket/transport.ts), at unit level.
//
// The store is Capacitor Preferences; off a phone, Preferences is its own web
// implementation over `localStorage`, which a Map stands in for here. The
// transport's native half is a bridge a fake answers: what is pinned is the
// base64 round trip, that a request body gathered from isomorphic-git's
// chunks arrives whole, and that a body-less request sends no body at all.

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { createGitHttp, fromBase64, toBase64, type GitBridge } from "../mobile/src/pocket/transport.ts";

const held = new Map<string, string>();
const g = globalThis as Record<string, unknown>;

let store: typeof import("../mobile/src/pocket/store.ts");

before(async () => {
  g.localStorage = {
    getItem: (k: string) => (held.has(k) ? held.get(k)! : null),
    setItem: (k: string, v: string) => void held.set(k, String(v)),
    removeItem: (k: string) => void held.delete(k),
    clear: () => held.clear(),
    key: (i: number) => [...held.keys()][i] ?? null,
    get length() {
      return held.size;
    },
  };
  g.window ??= globalThis;
  store = await import("../mobile/src/pocket/store.ts");
});

describe("the store", () => {
  it("keeps the token, and a sign-out forgets the token and the account but not the repository", async () => {
    assert.equal(await store.readToken(), null);
    await store.writeToken("gho_x");
    await store.writeUser({ login: "owner", name: null, email: null });
    await store.writeRepo({ fullName: "owner/vault", branch: "main", cloneUrl: "https://github.com/owner/vault.git" });
    assert.equal(await store.readToken(), "gho_x");
    assert.deepEqual(await store.readUser(), { login: "owner", name: null, email: null });
    await store.forgetSignIn();
    assert.equal(await store.readToken(), null);
    assert.equal(await store.readUser(), null);
    assert.deepEqual(await store.readRepo(), { fullName: "owner/vault", branch: "main", cloneUrl: "https://github.com/owner/vault.git" });
    await store.forgetRepo();
    assert.equal(await store.readRepo(), null);
  });

  it("remembers the base commit and the door, and reads an unknown door as none", async () => {
    await store.writeBase("abc123");
    assert.equal(await store.readBase(), "abc123");
    assert.equal(await store.readDoor(), null);
    await store.writeDoor("pocket");
    assert.equal(await store.readDoor(), "pocket");
    await store.writeDoor("instance");
    assert.equal(await store.readDoor(), "instance");
    const doorKey = [...held.keys()].find((k) => k.endsWith("pocket.door"))!;
    held.set(doorKey, "somewhere");
    assert.equal(await store.readDoor(), null);
  });

  it("a half-written preference reads as nothing rather than a blank screen", async () => {
    await store.writeUser({ login: "owner", name: null, email: null });
    const userKey = [...held.keys()].find((k) => k.endsWith("pocket.user"))!;
    held.set(userKey, "{not json");
    assert.equal(await store.readUser(), null);
  });

  it("the device state is one JSON document of keys, and never the repository's", async () => {
    const state = store.createPocketStore();
    assert.equal(await state.get("workspace"), null);
    await state.set("workspace", { open: ["Welcome.md"] });
    await state.set("prefs", { theme: "dark" });
    assert.deepEqual(await state.get("workspace"), { open: ["Welcome.md"] });
    assert.deepEqual(await state.get("prefs"), { theme: "dark" });
    const stateKey = [...held.keys()].find((k) => k.endsWith("pocket.state"))!;
    assert.deepEqual(Object.keys(JSON.parse(held.get(stateKey)!)).sort(), ["prefs", "workspace"]);
  });
});

describe("the transport", () => {
  it("base64 round-trips every byte, past the chunk size", () => {
    const bytes = new Uint8Array(0x8000 * 2 + 17).map((_, i) => (i * 31) % 256);
    assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
    assert.equal(toBase64(new Uint8Array()), "");
    assert.equal(toBase64(new TextEncoder().encode("git")), "Z2l0");
  });

  async function* chunks(...parts: string[]): AsyncIterableIterator<Uint8Array> {
    for (const p of parts) yield new TextEncoder().encode(p);
  }

  const drain = async (body: AsyncIterableIterator<Uint8Array> | undefined): Promise<string> => {
    let out = "";
    for await (const c of body ?? []) out += new TextDecoder().decode(c);
    return out;
  };

  it("gathers a packfile from its chunks and sends it as one base64 body", async () => {
    const seen: Parameters<GitBridge["gitRequest"]>[0][] = [];
    const bridge: GitBridge = {
      async gitRequest(options) {
        seen.push(options);
        return { status: 200, statusText: "OK", headers: { "content-type": "application/x-git-receive-pack-result" }, bodyBase64: toBase64(new TextEncoder().encode("0000")) };
      },
    };
    const http = createGitHttp(bridge);
    const answer = await http.request({ url: "https://github.com/o/v.git/git-receive-pack", method: "POST", headers: { Authorization: "Basic x" }, body: chunks("PACK", "…bytes…") });
    assert.equal(seen.length, 1);
    assert.equal(new TextDecoder().decode(fromBase64(seen[0].bodyBase64!)), "PACK…bytes…");
    assert.equal(seen[0].headers.Authorization, "Basic x");
    assert.equal(answer.statusCode, 200);
    assert.equal(answer.statusMessage, "OK");
    assert.equal(answer.headers?.["content-type"], "application/x-git-receive-pack-result");
    assert.equal(await drain(answer.body), "0000");
  });

  it("a GET carries no body and defaults its method", async () => {
    const seen: Parameters<GitBridge["gitRequest"]>[0][] = [];
    const http = createGitHttp({
      async gitRequest(options) {
        seen.push(options);
        return { status: 401, statusText: "Unauthorized", headers: {}, bodyBase64: "" };
      },
    });
    const answer = await http.request({ url: "https://github.com/o/v.git/info/refs?service=git-upload-pack" });
    assert.equal(seen[0].method, "GET");
    assert.ok(!("bodyBase64" in seen[0]));
    assert.deepEqual(seen[0].headers, {});
    assert.equal(answer.statusCode, 401);
    assert.equal(await drain(answer.body), "");
  });
});
