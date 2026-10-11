// THE PRESENCE REPORTER — what this tab tells its own server about what the
// reader is doing, so the server can tell Discord (docs/presence.md).
//
// A LAZY CHUNK, loaded by client/main.tsx only while /api/me says presence is
// on for an admin session: a visitor, and an owner who never switched it on,
// download none of it. `mountPresence` starts it and returns the stop.
//
// Two kinds of post, both to POST /api/presence:
//   · a CHANGE — the kind, the path or the cards left moved — sent once it has
//     held for a second, so flicking through three tabs on the way to the
//     fourth is one report and not four;
//   · a HEARTBEAT every PRESENCE_HEARTBEAT_MS while nothing changes, carrying
//     how long this tab has gone without input. The server decides idle from
//     it (most recently ACTIVE tab wins), which is why the tab never decides
//     idle itself.
// Quiet on failure. A 401/403/404 means this session may not report (signed
// out, previewing as a visitor, presence switched off on the server) and the
// reporter stops until it is mounted again; anything else is a network
// hiccup and the next heartbeat tries again.

import { PRESENCE_HEARTBEAT_MS } from "../../shared/presence/config.ts";
import type { PresenceReport } from "../../shared/presence/types.ts";
import { ApiError } from "../api.ts";
import { useStore } from "../state.ts";
import { deriveReport, mintClientId, sameSubject } from "./derive.ts";
import { reportPresence } from "./api.ts";
import { getOrbitsLeft, onOrbitsLeft } from "./orbitsLeft.ts";

export { deriveReport } from "./derive.ts";

const CLIENT_KEY = "astrolabe:presence-client";
/** A change must hold this long before it is sent. */
const SETTLE_MS = 1_000;
const INPUT_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "focus"] as const;

/** This tab's id, minted once and kept for the tab's life. sessionStorage is
 *  per TAB, which is the unit the server keys on: two tabs are two readers'
 *  worth of evidence, and a reload is the same tab. Sealed storage gets an id
 *  for this page's life instead, which costs only a duplicate row on reload
 *  that goes stale in PRESENCE_STALE_MS. */
function clientId(): string {
  try {
    const kept = sessionStorage.getItem(CLIENT_KEY);
    if (kept !== null && /^[A-Za-z0-9]{16}$/.test(kept)) return kept;
  } catch {
    // fall through to a fresh id
  }
  const id = mintClientId(crypto.getRandomValues(new Uint8Array(16)));
  try {
    sessionStorage.setItem(CLIENT_KEY, id);
  } catch {
    // an id for this page's life only
  }
  return id;
}

export function mountPresence(): () => void {
  const client = clientId();
  let lastInput = Date.now();
  let hiddenAt: number | null = document.visibilityState === "hidden" ? Date.now() : null;
  let sent: PresenceReport | null = null;
  let settle: number | undefined;
  let stopped = false;

  const current = (): PresenceReport => {
    const s = useStore.getState();
    return deriveReport({ workspace: s.workspace, readingMode: s.readingMode, client, cardsLeft: getOrbitsLeft(), hiddenAt }, lastInput, Date.now());
  };

  const send = (): void => {
    if (stopped) return;
    const report = current();
    sent = report;
    reportPresence(report).catch((err: unknown) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404)) stop();
    });
  };

  const changed = (): void => {
    if (stopped || sameSubject(sent, current())) return;
    window.clearTimeout(settle);
    settle = window.setTimeout(() => {
      if (!sameSubject(sent, current())) send();
    }, SETTLE_MS);
  };

  const onInput = (): void => {
    lastInput = Date.now();
  };
  const onVisibility = (): void => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      // Said at once rather than at the next heartbeat: the tab that went to
      // the back is no longer the most recently active one, and another tab
      // or the desktop window may be.
      send();
    } else {
      hiddenAt = null;
      lastInput = Date.now();
      send();
    }
  };

  const opts: AddEventListenerOptions = { passive: true, capture: true };
  for (const name of INPUT_EVENTS) window.addEventListener(name, onInput, opts);
  document.addEventListener("visibilitychange", onVisibility, opts);
  const unsubStore = useStore.subscribe((s, prev) => {
    if (s.workspace !== prev.workspace || s.readingMode !== prev.readingMode) changed();
  });
  const unsubLeft = onOrbitsLeft(changed);
  const heartbeat = window.setInterval(send, PRESENCE_HEARTBEAT_MS);
  send();

  function stop(): void {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(settle);
    window.clearInterval(heartbeat);
    for (const name of INPUT_EVENTS) window.removeEventListener(name, onInput, opts);
    document.removeEventListener("visibilitychange", onVisibility, opts);
    unsubStore();
    unsubLeft();
  }
  return stop;
}
