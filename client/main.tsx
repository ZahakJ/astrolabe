// FIRST: the browser's `vellum.*` preferences become `astrolabe.*` before
// any module reads one (see storageMigration.ts). Imports hoist, so this one
// has to be the first line.
import "./storageMigration.ts";
import { applyBrowserDictionaries } from "./spellDicts.ts";
import { installPrefsSync, pullPrefs } from "./prefsSync.ts";
import React from "react";
// Excalidraw reads its font base URL when its chunk EVALUATES, and rollup
// hoists a chunk's vendor imports above its own body — so the global has to be
// set from the entry, before any drawing is opened, or the fonts go to a CDN.
import "./drawing/assetPath.ts";
import { applyEditorWidth } from "./editorWidth.ts";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./ErrorBoundary.tsx";
import { reloadPrefsFromStorage, setPhoneShellMode, useStore } from "./state.ts";
import { lazySurface } from "./lazySurface.tsx";
import { PHONE_LAYOUT_EVENT, PHONE_SHELL_QUERY, readPhoneLayout, shellFor, type Shell } from "./shellQuery.ts";
import { installSafetyNet } from "./safety.ts";
import { applyEyeComfort } from "./eyeComfort.ts";

// PREFERENCES ARRIVE BEFORE ANYTHING READS THEM. The vault's own copy of this
// device's settings (theme, languages, editor width… client/prefsSync.ts) is
// pulled first and written into localStorage, so the modules below that read
// at import time see what the owner chose on their other machine. The patch on
// Storage goes in first so a value applied here is not pushed straight back.
// FIRST, before a single component mounts. Half of what this catches happens
// during bootstrap — a settings fetch that never answers, a rejected promise
// inside an effect on the first paint — and a net installed after the render
// is a net installed after the fall (v1.8 client-solidity audit, B2).
installSafetyNet();
installPrefsSync();
// The warm/dim sheet (client/eyeComfort.ts) is this device's own and never
// travels, so it goes up NOW rather than after the prefs pull: a reader who
// warmed the screen last night must not get a flash of blue-white first.
applyEyeComfort();

const root = document.getElementById("root");
if (!root) throw new Error("astrolabe: #root element missing");

// ── Which shell ─────────────────────────────────────────────────────────────
// TWO SHELLS, ONE QUESTION (client/shellQuery.ts). A phone, a tablet with no
// mouse, or a window narrower than 700px gets the phone shell
// (client/phone/PhoneShell.tsx) — its own chunk, its own stylesheet, never
// downloaded by a desktop; everything else gets App.tsx. The question is
// asked again on every `change` of the query, so a rotation, a foldable
// opening or a window dragged across 700px swaps the shell under the reader
// without a reload: both shells read the same store, and the store keeps the
// note that was open (state.ts `setPhoneShellMode`).
//
// A blog visitor is the one exception, in either shell: the public site has
// its own shell (App.tsx renders it), and a phone reads a blog the way a
// laptop does.
const PhoneShell = lazySurface(() => import("./phone/PhoneShell.tsx"));

function currentShell(): Shell {
  return shellFor(window.matchMedia(PHONE_SHELL_QUERY).matches, readPhoneLayout());
}

function subscribeShell(cb: () => void): () => void {
  const mq = window.matchMedia(PHONE_SHELL_QUERY);
  mq.addEventListener("change", cb);
  window.addEventListener(PHONE_LAYOUT_EVENT, cb);
  return () => {
    mq.removeEventListener("change", cb);
    window.removeEventListener(PHONE_LAYOUT_EVENT, cb);
  };
}

function Root() {
  const shell = React.useSyncExternalStore(subscribeShell, currentShell, () => "desktop" as Shell);
  const blogVisitor = useStore((s) => s.authReady && !s.admin && s.publicLayout !== "app");
  const phone = shell === "phone" && !blogVisitor;
  // Before any child's effect runs (layout effects precede passive ones), so
  // the store collapses and stops persisting the workspace before the phone
  // shell's first boot touches it — and hands the desktop its own layout back
  // the moment the shell swaps the other way.
  React.useLayoutEffect(() => setPhoneShellMode(phone), [phone]);
  return phone ? (
    <React.Suspense fallback={<div className="s-ph" />}>
      <PhoneShell />
    </React.Suspense>
  ) : (
    <App />
  );
}

// The store is told before the first render, too: bootstrap restores the
// workspace, and on a phone that restore must already be the phone's.
setPhoneShellMode(currentShell() === "phone");

// `pullPrefs` never rejects; `finally` is belt and braces — the page paints
// whatever the vault answered, and a build target without top-level await
// is the reason this is a callback rather than a line.
//
// THE STORE READ ITS PREFERENCES BEFORE THE PULL. `./App.tsx` above imports
// client/state.ts, and a module's body runs when it is imported — so vim, the
// sidebar's side, reading mode, the editor language and the theme were read
// from localStorage before a byte of /api/prefs had arrived, and a fresh
// device painted its own defaults once and the vault's from the second load
// on. When the pull changed anything, the store re-reads those keys now,
// before anything renders (client/state.ts::reloadPrefsFromStorage).
void pullPrefs()
  .then((changed) => {
    if (changed.length > 0) reloadPrefsFromStorage();
  })
  .catch(() => {
    // a preference is never worth a blank page
  })
  .finally(() => {
  // The writing column's width, before the first paint (client/editorWidth.ts).
  applyEditorWidth();
  createRoot(root).render(
    <React.StrictMode>
      {/* OUTSIDE StrictMode's child, INSIDE the root: a boundary the whole app
          renders under, so a throw anywhere in the tree becomes a card with a
          reload button instead of an empty <div id="root">. */}
      <ErrorBoundary>
        <Root />
      </ErrorBoundary>
    </React.StrictMode>,
  );
});

// ── Touch gestures ──────────────────────────────────────────────────────────
// The phone's primary navigation: swipe the notes drawer in and out instead of
// hunting the ☰. Split behind the same media query that decides the rest of
// the mobile shell (app.css keys its 44px targets off `(pointer: coarse)`),
// for the reason spelled out above — the entry chunk has about a kilobyte of
// headroom and a mouse cannot use any of this. Evaluated once at boot, which
// is when a device's pointer is settled; the module itself re-checks the
// drawer breakpoint on every touch, so a rotated tablet is never stale.
// The reader's declared browser dictionaries, before any line is stamped.
applyBrowserDictionaries();

if (window.matchMedia("(pointer: coarse)").matches) {
  // THE DRAWER'S GESTURES BELONG TO THE CLASSIC SHELL. The phone shell owns
  // history itself (client/phone/nav.ts: a stack synced to history, every
  // sheet an entry) and has no drawer to pan, so the drawer's swipe and the
  // back-gesture guard are loaded only for a reader who chose Classic — the
  // drawer shell exists nowhere else on a finger (PHONE_SHELL_QUERY contains
  // DRAWER_QUERY). Switching the layout reloads the page (settings/
  // DeviceTab.tsx), so these never run beside the phone shell's own history.
  if (readPhoneLayout() === "classic") {
    // Swallowed on purpose: a redeploy that rotates the chunk hash mid-session
    // makes this fetch 404, and a reader who then loses the swipe should lose
    // the SWIPE — the ☰ is still there — not get the safety net's crash card
    // from an unhandled rejection over a progressive enhancement.
    void import("./swipe.ts").then((mod) => mod.installSwipe()).catch(() => {});
    // The hardware back button, which on this device is a layer's way out
    // before it is a page's (client/backGesture.ts). Same chunk-splitting
    // bargain and the same swallowed rejection: a reader who loses it still has
    // Escape, the scrim and every ✕.
    void import("./backGesture.ts").then((mod) => mod.installBackGesture()).catch(() => {});
  }
  // …and the field the keyboard just covered (client/softKeyboard.ts).
  void import("./softKeyboard.ts").then((mod) => mod.installSoftKeyboard()).catch(() => {});
}

// ── The desktop app ─────────────────────────────────────────────────────────
// Electron stamps `Electron/<version>` into the user-agent and nothing else
// does — the same test client/components/ShortcutsHelp.tsx already uses to
// decide whether a desktop-only shortcut row exists. Behind `import()` on
// purpose: `npm run check-bundle` holds the entry chunk to a budget with a
// couple of kilobytes of headroom, and a browser must not download the native
// menu's dispatch table, the find bar and the spelling menu to not use them.
if (/\bElectron\//.test(navigator.userAgent)) {
  void import("./desktop/index.ts").then((mod) => mod.mountDesktop());
}
