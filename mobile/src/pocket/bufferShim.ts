/**
 * `Buffer`, because isomorphic-git still asks for it.
 *
 * Its pkt-line reader throws `Missing Buffer dependency` the moment a clone
 * starts unless a global `Buffer` exists — the library's own comment says the
 * dependency is on its way out and is kept "until usage in bundlers is fixed"
 * (isomorphic-git#1855). Until then a browser has to supply one.
 *
 * It is the one Node global this app carries, it is imported by exactly one
 * module (pocket/git.ts) and it is set only when there is nothing there — so
 * a future isomorphic-git that has dropped the requirement, or a WebView that
 * grows a `Buffer` of its own, costs this file and nothing else.
 */

import { Buffer as BufferPolyfill } from "buffer";

const global = globalThis as { Buffer?: unknown };
if (typeof global.Buffer === "undefined") global.Buffer = BufferPolyfill;

export {};
