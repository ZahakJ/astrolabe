/**
 * GIT TRANSPORT — isomorphic-git's `http` plugin, performed by the phone.
 *
 * GitHub's smart-HTTP endpoints answer no CORS preflight and send no
 * `Access-Control-Allow-Origin`, which is correct of them and fatal to a page.
 * The shell has met this wall once already — every call the capture sheet makes
 * goes through `CapacitorHttp` for the same reason — and the answer is the
 * same: perform the request on the native side, where there is no origin to be
 * cross to. No proxy stands between the owner's phone and the owner's
 * repository, which is the only arrangement worth having for a private vault.
 *
 * `CapacitorHttp` is not enough on its own: it moves a request body as a
 * STRING, and a push's body is a packfile. So the shell's own plugin carries
 * base64 in both directions (android/…/GitTransport.java).
 *
 * A second implementation is exported for the harness — the same interface over
 * plain `fetch`, which works against a loopback repository that DOES send CORS
 * headers. It is what `scratchpad/pocket/` drives in Chromium, and it is the
 * reason the whole flow can be verified without a phone.
 */

import type { HttpClient } from "isomorphic-git";
import { AstrolabeNative } from "../native.ts";

/** isomorphic-git's own `HttpClient`, spelled here so the two implementations
 *  below are held to it by the compiler rather than by hope. */
export type GitHttpClient = HttpClient;
export type GitHttpRequest = Parameters<HttpClient["request"]>[0];
export type GitHttpResponse = Awaited<ReturnType<HttpClient["request"]>>;

async function collect(body: GitHttpRequest["body"]): Promise<Uint8Array | null> {
  if (!body) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}

/** Base64 without a data: URL and without `FileReader` — the bodies here are
 *  megabytes and a chunked loop is what keeps the string builder from being
 *  the slow part of a clone. */
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function* one(bytes: Uint8Array): AsyncIterableIterator<Uint8Array> {
  yield bytes;
}

/** The shell's transport: every byte through the native plugin. */
export const nativeGitHttp: GitHttpClient = {
  async request(request: GitHttpRequest): Promise<GitHttpResponse> {
    const method = request.method ?? "GET";
    const body = await collect(request.body);
    const answer = await AstrolabeNative.gitRequest({
      url: request.url,
      method,
      headers: request.headers ?? {},
      ...(body === null ? {} : { bodyBase64: toBase64(body) }),
    });
    return {
      url: request.url,
      method,
      statusCode: answer.status,
      statusMessage: answer.statusText,
      headers: answer.headers,
      body: one(fromBase64(answer.bodyBase64)),
    };
  },
};

