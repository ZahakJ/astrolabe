// The fediverse handle's rules (docs/webmentions.md), in one place both the
// server's PATCH handler and the settings row's inline check read — so a
// green field and a 400 can never disagree about what a legal handle is.
//
// A handle is the part before the @ in `@handle@host`: what a Mastodon user
// types into search to find the blog. Mastodon's own rule for a username is
// letters, digits and underscores, at most thirty; this is that rule, in
// lower case, because WebFinger lookups are case-insensitive in practice and
// two spellings of one account are two accounts to a remote server's cache.

export const FEDIVERSE_HANDLE_MAX = 30;
const HANDLE_RE = /^[a-z0-9_]{1,30}$/;

/** True when `handle` is one this site may answer to. */
export function isFediverseHandle(handle: string): boolean {
  return HANDLE_RE.test(handle);
}

/** The handle a site gets when the owner never chose one: its name, folded to
 *  the handle alphabet — "Kitāb al-Ḥikma" → "kitab_al_hikma" — or `blog` when
 *  nothing of the name survives the fold (an Arabic-only name). */
export function defaultFediverseHandle(siteName: string): string {
  const folded = siteName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, FEDIVERSE_HANDLE_MAX)
    .replace(/_+$/g, "");
  return folded === "" ? "blog" : folded;
}

/** How the owner will be found: `@handle@host`. */
export function fediverseAddress(handle: string, host: string): string {
  return `@${handle}@${host}`;
}

/** Below this many characters of prose a post federates as a `Note` (what a
 *  Mastodon timeline shows whole); above, as an `Article` (a title and a
 *  link, the way a long piece should arrive). */
export const FEDIVERSE_NOTE_MAX = 500;
