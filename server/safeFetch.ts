// A FETCH FOR ADDRESSES A STRANGER CHOSE (docs/webmentions.md).
//
// A webmention names a `source` the receiver must go and read, an inbox
// names a key to fetch, and a published note names the sites whose endpoints
// the sender must discover. Every one of those addresses was written by
// somebody else, and a server that fetches whatever it is told is a proxy
// into its own network: `source=http://127.0.0.1:6801/api/...`, the router's
// admin page, the cloud's metadata address. So this module is the one door
// those features go out through, and it refuses:
//
//   · any scheme but http and https;
//   · any address that is not public — loopback, private ranges, link-local
//     (the metadata address), CGNAT, multicast, the unspecified address, and
//     their IPv6 spellings, IPv4-mapped included. The check runs on the
//     ADDRESS THE SOCKET CONNECTS TO (a `lookup` hook), not on the name, so a
//     name that resolves somewhere public for the check and somewhere private
//     for the connection (DNS rebinding) is refused at the connection;
//   · more than MAX_REDIRECTS hops, each hop checked the same way;
//   · more than `maxBytes` of body, or more than `timeoutMs` of waiting.
//
// Tests run their fixtures on 127.0.0.1 and turn the address check off with
// `allowPrivateAddressesForTests` — a function, not an environment variable,
// so no deployment can switch it off by accident.

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";

export const SAFE_FETCH_MAX_BYTES = 1024 * 1024;
export const SAFE_FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export const FEDERATION_USER_AGENT = "Astrolabe (+https://github.com/ZahakJ/astrolabe)";

let allowPrivate = false;

/** The tests' switch: their fixture servers listen on 127.0.0.1. */
export function allowPrivateAddressesForTests(on: boolean): void {
  allowPrivate = on;
}

export class FetchRefused extends Error {
  /** A refusal is never worth retrying: the address will not change. */
  readonly permanent = true;
}

function v4Parts(ip: string): number[] | null {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return parts;
}

function privateV4(ip: string): boolean {
  const p = v4Parts(ip);
  if (p === null) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, the metadata address
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && p[2] === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

/** True when `ip` is not an address on the public internet. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return privateV4(ip);
  if (kind !== 6) return true;
  const lower = ip.toLowerCase();
  // IPv4-mapped and IPv4-compatible spellings are judged as the IPv4 they carry.
  const mapped = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return privateV4(mapped[1]);
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hexMapped) {
    const hi = Number.parseInt(hexMapped[1], 16);
    const lo = Number.parseInt(hexMapped[2], 16);
    return privateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (lower === "::" || lower === "::1") return true;
  const first = Number.parseInt(lower.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xff00) === 0xff00 || // multicast
    (first === 0x2001 && lower.startsWith("2001:db8")) || // documentation
    first === 0 // ::/8 and friends
  );
}

/** The lookup every socket this module opens resolves through. */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 4);
    const list = (addresses as unknown as LookupAddress[]) ?? [];
    const allowed = allowPrivate ? list : list.filter((a) => !isPrivateAddress(a.address));
    if (allowed.length === 0) {
      return callback(new FetchRefused(`${hostname} is not a public address`), "", 4);
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, allowed);
    callback(null, allowed[0].address, allowed[0].family);
  });
};

export interface SafeResponse {
  status: number;
  /** Where the answer came from after redirects. */
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface SafeFetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  maxBytes?: number;
  timeoutMs?: number;
}

function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchRefused("not an address");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchRefused("only http and https are fetched");
  if (url.username || url.password) throw new FetchRefused("addresses with credentials are not fetched");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !allowPrivate && isPrivateAddress(host)) throw new FetchRefused(`${host} is not a public address`);
  if (!allowPrivate && /(^|\.)localhost$/i.test(host)) throw new FetchRefused("localhost is not fetched");
  return url;
}

function once(url: URL, opts: SafeFetchOptions, deadline: number): Promise<SafeResponse> {
  const maxBytes = opts.maxBytes ?? SAFE_FETCH_MAX_BYTES;
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const headers: Record<string, string> = { "User-Agent": FEDERATION_USER_AGENT, ...(opts.headers ?? {}) };
    if (opts.body !== undefined) headers["Content-Length"] = String(Buffer.byteLength(opts.body));
    const remaining = Math.max(1, deadline - Date.now());
    const req = lib.request(
      url,
      { method: opts.method ?? "GET", headers, lookup: guardedLookup, timeout: remaining },
      (res) => {
        const declared = Number(res.headers["content-length"] ?? "0");
        if (declared > maxBytes) {
          res.destroy();
          reject(new FetchRefused(`too large (${declared} bytes)`));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new FetchRefused(`too large (over ${maxBytes} bytes)`));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v !== undefined) flat[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
          }
          resolve({ status: res.statusCode ?? 0, url: url.href, headers: flat, body: Buffer.concat(chunks).toString("utf8") });
        });
        res.on("error", reject);
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("timed out")), remaining);
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.on("close", () => clearTimeout(timer));
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

/** One request to a stranger's address, bounded and refused where it must
 *  be (see the head of this file). Redirects are followed for GET only, and
 *  every hop is checked again. Throws `FetchRefused` for a refusal (never
 *  worth a retry) and an ordinary Error for a network failure (worth one). */
export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const deadline = Date.now() + (opts.timeoutMs ?? SAFE_FETCH_TIMEOUT_MS);
  let url = checkUrl(raw);
  for (let hop = 0; ; hop++) {
    const res = await once(url, opts, deadline);
    const location = res.headers.location;
    if ((opts.method ?? "GET") === "GET" && res.status >= 300 && res.status < 400 && location) {
      if (hop >= MAX_REDIRECTS) throw new FetchRefused("too many redirects");
      url = checkUrl(new URL(location, url).href);
      continue;
    }
    return res;
  }
}
