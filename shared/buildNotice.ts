// THE "SERVER MOVED ON" NOTICE, decided in one place so a test can walk it.
//
// Every /api/me carries the server's version; the client compares it with
// its own build. The two differ in exactly two situations, and they need
// different words:
//
//   1. A DEPLOY happened under an open tab: the page still runs last week's
//      build, the server has this week's. "Reload to catch up" is right, and
//      reloading fixes it.
//   2. The server's FILES are older than its version says: `git pull` moved
//      package.json but nobody ran `npm run build`, or a service worker is
//      still handing out a stale shell. Reloading brings the same old build
//      back, and the old notice then asked for a reload on every load, for
//      ever (the owner's friend: "it keeps telling me to update even though I
//      am on the latest version").
//
// The two are told apart by memory: the tab records which pair it reloaded
// for. Coming back from that reload with the SAME pair is case 2, said once
// per pair per device, with no reload button.

export type BuildNotice =
  | { kind: "reload"; server: string; build: string }
  | { kind: "stale"; server: string; build: string }
  | null;

/** The pair as the memory keys hold it. */
export function buildPair(server: string, build: string): string {
  return `${server}>${build}`;
}

/** What to say, given the server's version, this build's, the pair this tab
 *  last reloaded for (session memory) and the pair this device was already
 *  told is stale (device memory). */
export function decideBuildNotice(
  server: unknown,
  build: string,
  reloadedFor: string | null,
  staleTold: string | null,
): BuildNotice {
  if (build === "" || typeof server !== "string" || server === "" || server === build) return null;
  const pair = buildPair(server, build);
  if (reloadedFor === pair || staleTold === pair) {
    return staleTold === pair ? null : { kind: "stale", server, build };
  }
  return { kind: "reload", server, build };
}
