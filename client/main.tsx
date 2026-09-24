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
import { PHONE_SHELL_QUERY, shellFor, type Shell } from "./shellQuery.ts";
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
  return shellFor(window.matchMedia(PHONE_SHELL_QUERY).matches);
}

function subscribeShell(cb: () => void): () => void {
  const mq = window.matchMedia(PHONE_SHELL_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
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

// ── Touch ───────────────────────────────────────────────────────────────────
// The reader's declared browser dictionaries, before any line is stamped.
applyBrowserDictionaries();

// THE DRAWER'S GESTURES ARE GONE (3.27.0). A finger here used to load the
// drawer's pan (swipe.ts) and the back-gesture guard (backGesture.ts) for the
// Classic phone layout; the phone shell owns history itself
// (client/phone/nav.ts) and has no drawer, and Classic was deleted. What a
// coarse pointer still loads is the one thing both shells want: the field the
// keyboard just covered (client/softKeyboard.ts), behind `import()` because a
// mouse never needs it.
if (window.matchMedia("(pointer: coarse)").matches) {
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
