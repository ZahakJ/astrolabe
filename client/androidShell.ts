// THE ANDROID SHELL, from the web client's side. The shell (mobile/) is a
// WebView that hands the whole display to an instance — this client, on the
// owner's host — and has exactly one thing the client cannot do for itself:
// bring the shell's own connection screen back. Until 3.22.1 nothing did
// (the owner: "when I sign out it signs me out of my site but it stays
// directed there. Should be a way to go back to the original setup menu").
//
// Two facts, both spelled once: the shell announces itself in the user agent
// (mobile/capacitor.config.ts appendUserAgent), and a navigation to
// SETUP_PATH on whatever host is caught by the shell's navigation gate
// (AstrolabePlugin.shouldOverrideLoad) before the instance ever sees it.
// Outside the shell the row is not drawn, and the path is nothing.

export const SETUP_PATH = "/__astrolabe/setup";

/** True inside the Android shell's WebView. */
export function inAndroidShell(): boolean {
  return typeof navigator !== "undefined" && /Astrolabe-Android/.test(navigator.userAgent);
}

/** Leave the vault for the shell's connection screen — change server, or
 *  open a vault from GitHub. Unsaved edits are the editor's business and it
 *  flushes on pagehide as for any navigation. */
export function returnToShell(): void {
  location.assign(SETUP_PATH);
}
