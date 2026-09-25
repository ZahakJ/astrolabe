// THE VERSIONS THAT HAVE A "WHAT'S NEW" DECK — the light half of the feature.
//
// client/whatsnew/door.ts (first paint) compares these against the build's
// own version and the device's seen-mark to decide whether to open the deck;
// the deck's slides, visuals and prose live in releaseNotes.ts, a lazy chunk.
// Kept apart so the entry carries a list of strings and nothing else.
//
// THE RULE (scripts/check-whatsnew.mjs holds it): every MINOR release
// (x.Y.0) ships a deck. A patch (x.Y.z) inherits its minor's. Bump
// package.json to a new x.Y.0 without adding it here and to releaseNotes.ts,
// and the gate fails the build — the owner: "remind future sessions to make
// sure to create a new preview with every major change".
export const RELEASE_VERSIONS: readonly string[] = ["3.10.0", "3.11.0", "3.12.0", "3.13.0", "3.14.0", "3.15.0", "3.16.0", "3.17.0", "3.18.0", "3.19.0", "3.20.0", "3.21.0", "3.22.0", "3.23.0", "3.24.0", "3.25.0", "3.26.0", "3.27.0", "3.28.0", "3.29.0", "3.30.0", "3.31.0", "3.32.0", "3.33.0", "3.34.0"];

/** Semver-ish compare on the numeric triple; anything else is 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
