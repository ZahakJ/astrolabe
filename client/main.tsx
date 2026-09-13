// FIRST: the browser's `vellum.*` preferences become `astrolabe.*` before
// any module reads one (see storageMigration.ts). Imports hoist, so this one
// has to be the first line.
import "./storageMigration.ts";
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

// `pullPrefs` never rejects; `finally` is belt and braces — the page paints
// whatever the vault answered, and a build target without top-level await
// is the reason this is a callback rather than a line.
void pullPrefs().finally(() => {
  // The writing column's width, before the first paint (client/editorWidth.ts).
  applyEditorWidth();
  createRoot(root).render(
    <React.StrictMode>
      {/* OUTSIDE StrictMode's child, INSIDE the root: a boundary the whole app
          renders under, so a throw anywhere in the tree becomes a card with a
          reload button instead of an empty <div id="root">. */}
      <ErrorBoundary>
        <App />
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
if (window.matchMedia("(pointer: coarse)").matches) {
  // Swallowed on purpose: a redeploy that rotates the chunk hash mid-session
  // makes this fetch 404, and a reader who then loses the swipe should lose
  // the SWIPE — the ☰ is still there — not get the safety net's crash card
  // from an unhandled rejection over a progressive enhancement.
  void import("./swipe.ts").then((mod) => mod.installSwipe()).catch(() => {});
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
