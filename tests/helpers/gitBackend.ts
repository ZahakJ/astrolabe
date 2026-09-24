// A git "remote" with no network under it, for the pocket's repository tests.
//
// The pocket speaks smart HTTP through isomorphic-git's `http` plugin, and on a
// phone the plugin's requests are performed natively (mobile/src/pocket/
// transport.ts). Here the same plugin interface is answered by running
// `git http-backend` — git's own smart-HTTP CGI — as a child process against a
// bare repository in a temporary directory: a request goes in on stdin, the
// CGI's answer comes back on stdout. No socket is opened, nothing leaves the
// machine, and the repository is one this helper made a moment ago.
//
// The "laptop" is a working clone of the same bare repository, driven with the
// git CLI, so a test can move the remote the way a second machine would.
// Every git invocation runs with the user's and the system's configuration
// shut out, so a signing key or a hook on the machine running the tests
// cannot change what they see.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { GitHttpClient, GitHttpRequest, GitHttpResponse } from "../../mobile/src/pocket/transport.ts";

const ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_NAME: "Laptop",
  GIT_AUTHOR_EMAIL: "laptop@example.invalid",
  GIT_COMMITTER_NAME: "Laptop",
  GIT_COMMITTER_EMAIL: "laptop@example.invalid",
};

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env: ENV, encoding: "utf8" }).trim();
}

async function collect(body: GitHttpRequest["body"]): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function* one(bytes: Uint8Array): AsyncIterableIterator<Uint8Array> {
  yield bytes;
}

export interface Remote {
  /** The bare repository's directory. */
  bare: string;
  /** A working clone standing in for the owner's laptop. */
  laptop: string;
  /** What the pocket clones from; the host is never resolved. */
  url: string;
  /** isomorphic-git's `http`, answered by `git http-backend`. */
  http: GitHttpClient;
  /** Every request the pocket made, for a test to count. */
  requests: { method: string; url: string; auth: string | undefined }[];
  /** Make the next request fail the way a phone with no signal does. */
  offline(on: boolean): void;
  /** Answer every request with this HTTP status (a revoked token is 401),
   *  or, with null, answer them properly again. */
  refuse(status: number | null): void;
  /** Write, commit and push from the laptop. */
  laptopCommit(files: Record<string, string | null>, message: string): string;
  /** The laptop fetches and resets to the remote's branch. */
  laptopPull(): void;
  /** A file as the remote's branch holds it. */
  remoteFile(file: string): string | null;
  remoteHead(): string;
  cleanup(): void;
}

/** A bare repository on `main` holding `seed`, in two commits (so a depth-1
 *  clone has something to leave behind), with a laptop clone of it. */
export function makeRemote(seed: Record<string, string>): Remote {
  const root = mkdtempSync(path.join(tmpdir(), "astrolabe-pocket-git-"));
  const bare = path.join(root, "vault.git");
  const laptop = path.join(root, "laptop");
  execFileSync("git", ["init", "--quiet", "--bare", "-b", "main", bare], { env: ENV });
  git(bare, "config", "http.receivepack", "true");
  execFileSync("git", ["clone", "--quiet", bare, laptop], { env: ENV });
  git(laptop, "checkout", "--quiet", "-b", "main");
  writeFileSync(path.join(laptop, "README.md"), "# The vault\n");
  git(laptop, "add", "-A");
  git(laptop, "commit", "--quiet", "-m", "The first commit");
  for (const [file, content] of Object.entries(seed)) {
    mkdirSync(path.dirname(path.join(laptop, file)), { recursive: true });
    writeFileSync(path.join(laptop, file), content);
  }
  git(laptop, "add", "-A");
  git(laptop, "commit", "--quiet", "-m", "The notes");
  git(laptop, "push", "--quiet", "origin", "main");

  const requests: Remote["requests"] = [];
  let down = false;
  let refusing: number | null = null;
  const url = "https://git.example.invalid/owner/vault.git";

  const http: GitHttpClient = {
    async request(request: GitHttpRequest): Promise<GitHttpResponse> {
      const method = request.method ?? "GET";
      const headers = Object.fromEntries(Object.entries(request.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
      requests.push({ method, url: request.url, auth: headers.authorization });
      if (down) throw new Error("Network request failed");
      if (refusing !== null) {
        return { url: request.url, method, statusCode: refusing, statusMessage: "Refused", headers: {}, body: one(new TextEncoder().encode("refused")) };
      }
      const u = new URL(request.url);
      const body = await collect(request.body);
      const out = spawnSync("git", ["http-backend"], {
        input: body,
        env: {
          ...ENV,
          GIT_PROJECT_ROOT: root,
          GIT_HTTP_EXPORT_ALL: "1",
          PATH_INFO: u.pathname.replace(/^\/owner/, ""),
          QUERY_STRING: u.search.replace(/^\?/, ""),
          REQUEST_METHOD: method,
          CONTENT_TYPE: headers["content-type"] ?? "",
          CONTENT_LENGTH: String(body.byteLength),
          GIT_PROTOCOL: headers["git-protocol"] ?? "",
          REMOTE_USER: "owner",
          REMOTE_ADDR: "127.0.0.1",
        },
        maxBuffer: 64 * 1024 * 1024,
      });
      if (out.status !== 0) throw new Error(`git http-backend: ${out.stderr.toString()}`);
      const raw = out.stdout;
      const split = raw.indexOf("\r\n\r\n");
      const head = raw.subarray(0, split).toString("utf8");
      const payload = raw.subarray(split + 4);
      const answerHeaders: Record<string, string> = {};
      let status = 200;
      let statusMessage = "OK";
      for (const line of head.split("\r\n")) {
        const at = line.indexOf(":");
        if (at < 0) continue;
        const name = line.slice(0, at).trim().toLowerCase();
        const value = line.slice(at + 1).trim();
        if (name === "status") {
          status = Number(value.split(" ")[0]);
          statusMessage = value.split(" ").slice(1).join(" ");
        } else answerHeaders[name] = value;
      }
      return { url: request.url, method, statusCode: status, statusMessage, headers: answerHeaders, body: one(new Uint8Array(payload)) };
    },
  };

  return {
    bare,
    laptop,
    url,
    http,
    requests,
    offline(on) {
      down = on;
    },
    refuse(status) {
      refusing = status;
    },
    laptopCommit(files, message) {
      git(laptop, "pull", "--quiet", "--ff-only", "origin", "main");
      for (const [file, content] of Object.entries(files)) {
        const at = path.join(laptop, file);
        if (content === null) unlinkSync(at);
        else {
          mkdirSync(path.dirname(at), { recursive: true });
          writeFileSync(at, content);
        }
      }
      git(laptop, "add", "-A");
      git(laptop, "commit", "--quiet", "-m", message);
      git(laptop, "push", "--quiet", "origin", "main");
      return git(laptop, "rev-parse", "HEAD");
    },
    laptopPull() {
      git(laptop, "fetch", "--quiet", "origin");
      git(laptop, "reset", "--quiet", "--hard", "origin/main");
    },
    remoteFile(file) {
      try {
        return execFileSync("git", ["show", `main:${file}`], { cwd: bare, env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        return null;
      }
    },
    remoteHead() {
      return git(bare, "rev-parse", "main");
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Read a file the laptop has, for assertions that compare both ends. */
export function readLaptop(remote: Remote, file: string): string {
  return readFileSync(path.join(remote.laptop, file), "utf8");
}
