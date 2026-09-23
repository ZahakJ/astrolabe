// THE MICROPHONE, AND ONLY FOR THE VAULT (3.24.0, docs/capture.md "Voice").
//
// Electron's default answer to every permission request is YES — a session
// with no handler grants camera, microphone, geolocation, notifications and
// the rest to whatever page asks. That default was never a decision here, and
// voice notes are the first feature to need one of those grants on purpose, so
// the grant becomes a rule instead of an accident:
//
//   · the vault's OWN origin keeps every permission it had (the clipboard,
//     full screen, notifications — nothing that works today stops working);
//   · a `media` request from it is granted for AUDIO only — a voice note is a
//     microphone, and nothing in this app has any business with a camera;
//   · every other origin is refused everything. The window is fenced to its
//     origin already (windows.ts); this is the same fence for the one thing a
//     page can ask for without navigating.
//
// On macOS the OS asks as well: the first microphone request prompts through
// `systemPreferences.askForMediaAccess`, which reads the usage string the
// package declares (electron-builder.yml, NSMicrophoneUsageDescription).

import { systemPreferences, type Session } from "electron";

function sameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/** `origin` is asked per request: a respawned server may come back on another
 *  port (main.ts, onServerExit), and the fence must move with it. */
export function fencePermissions(ses: Session, origin: () => string): void {
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const from = details.requestingUrl || contents?.getURL() || "";
    if (!sameOrigin(from, origin())) {
      callback(false);
      return;
    }
    if (permission !== "media") {
      callback(true);
      return;
    }
    const kinds = (details as Electron.MediaAccessPermissionRequest).mediaTypes ?? [];
    if (kinds.length === 0 || kinds.some((kind) => kind !== "audio")) {
      callback(false);
      return;
    }
    if (process.platform === "darwin" && systemPreferences.getMediaAccessStatus("microphone") !== "granted") {
      void systemPreferences.askForMediaAccess("microphone").then(callback, () => callback(false));
      return;
    }
    callback(true);
  });
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) => {
    if (!sameOrigin(requestingOrigin, origin())) return false;
    if (permission !== "media") return true;
    const kind = (details as { mediaType?: string }).mediaType;
    return kind === undefined || kind === "audio";
  });
}
