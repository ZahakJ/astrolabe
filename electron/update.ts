// Software updates, without a framework — and without a will of their own.
//
// The desktop app learns about a new release the same way a reader would —
// GitHub's releases API — and, when the reader asks for it, applies it the
// same way `writeNote` replaces a note: download beside the current file,
// fsync, rename over, relaunch. One HTTPS request every few hours and one
// atomic rename is the entire mechanism, and that is the argument for not
// shipping electron-updater to do it: the framework would be the largest
// dependency in the desktop app, pulled in to perform a dance this codebase
// already performs on every autosave.
//
// WHAT IT PROMISES, precisely:
//   · NOTHING IS DOWNLOADED OR INSTALLED WITHOUT BEING ASKED. Until 3.15 a
//     newer release was fetched in the background the moment the check found
//     it, and a friend's Windows machine pulled 190 MB it had not asked for
//     ("def shouldn't be the case"). Now a check only LOOKS. A newer release
//     becomes the status bar's "3.x available" pill; clicking it (or the menu
//     item) downloads; "Restart to update" applies. Two clicks, both the
//     reader's — electron/updatePolicy.ts holds the rule and its test.
//   · The check is quiet. No dialog, no dock bounce — the pill, and one toast
//     per version per launch. Checked at launch and every six hours, so an app
//     that is never restarted still hears about releases; the six-hour timer
//     finding the same release again says nothing more.
//   · It can be turned OFF. `updates: "off"` in desktop.json (Settings → This
//     device → Software updates) stops the timer asking at all. The menu's
//     "Check for updates…" still works by hand, because off is about not being
//     interrupted, not about being refused an answer.
//   · A download the reader asked for is VERIFIED by size and by the release's
//     checksum file before it replaces anything; a truncated download can
//     never become the installed app.
//   · The swap is atomic and the old file's mode survives — the same four
//     rules server/vault.ts documents, one directory over. The Windows build
//     runs the release's NSIS installer silently (`/S --force-run`) while the
//     app quits; the installer relaunches it.
//   · A build that is neither (the deb, the pacman package, a dev checkout)
//     cannot replace itself in place, so "update" there opens the release
//     page instead of pretending.
//   · Nothing phones home beyond the releases endpoint of this repo, and the
//     manual "Check for updates…" menu item hits exactly the same code path —
//     it just reports "you are current" out loud where the timer stays silent.

import { app, shell } from "electron";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { get } from "node:https";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { loadPrefs, savePrefs } from "./store.ts";
import { decideUpdate, newer, type UpdatesPref } from "./updatePolicy.ts";

const REPO = "ZahakJ/astrolabe";
/** The repository's name before the rename. GitHub redirects the old name,
 *  but `node:https` follows no redirects, so the check asks the new name
 *  first and the old one when that fails — which is also the order that
 *  keeps a build shipped before the repo was renamed updating. */
const LEGACY_REPO = "ZahakJ/vellum";
const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const LEGACY_API_LATEST = `https://api.github.com/repos/${LEGACY_REPO}/releases/latest`;
/** Six hours: fast enough that "still on yesterday's build" is a short-lived
 *  state, slow enough that GitHub never sees this app as traffic. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

export interface UpdateState {
  /** "current" | "available" | "downloading" | "ready" | "failed" */
  phase: string;
  version: string;
  /** While downloading: bytes on disk so far, and the asset's size when the
   *  release named one — the status bar draws a bar from the two. */
  received?: number;
  total?: number;
  /** With "available": whether this build can take the release itself (an
   *  AppImage, a Windows install) — the pill offers "Download" — or only open
   *  the release page (a deb, a pacman package, a dev checkout). */
  installable?: boolean;
}

type Listener = (state: UpdateState) => void;
let listener: Listener = () => {};
export function onUpdateState(fn: Listener): void {
  listener = fn;
}
function notify(state: UpdateState): void {
  lastState = state;
  listener(state);
}

let timer: NodeJS.Timeout | null = null;
let busy = false;
/** The downloaded, verified AppImage waiting for a relaunch, if any. */
let staged: { file: string; version: string } | null = null;
/** The newer release the last check found — what "Download" fetches — so the
 *  click does not have to ask GitHub again for something it was just told. */
let found: { tag: string; assets: Asset[] } | null = null;
/** The version this launch has already said "available" about. The timer
 *  finding it again every six hours is not news, and a reminder that repeats
 *  is the "annoying reminder" the preference exists to switch off. */
let reminded: string | null = null;
/** What the renderer last heard, so a window opened later can draw the pill
 *  without a fresh check and without a second toast (main.ts hands it over
 *  in `hello`). */
let lastState: UpdateState | null = null;

export function currentUpdateState(): UpdateState | null {
  return lastState;
}

/** The reader's preference, read from desktop.json each time so a change
 *  made in the settings panel reaches the next tick without a restart. */
export function updatesPref(): UpdatesPref {
  return loadPrefs().updates;
}

/** Store the preference. Switching it ON runs one quiet check straight away:
 *  "tell me about updates" should not mean "in up to six hours". */
export function setUpdatesPref(pref: UpdatesPref): void {
  const prefs = loadPrefs();
  if (prefs.updates === pref) return;
  savePrefs({ ...prefs, updates: pref });
  if (pref === "notify") void checkForUpdates(false);
}

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = get(
      url,
      { headers: { "user-agent": `astrolabe-desktop/${app.getVersion()}`, accept: "application/vnd.github+json" } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`GET ${url}: HTTP ${res.statusCode}`));
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on("error", reject);
  });
}

/** Follow redirects by hand — GitHub asset downloads bounce through one — and
 *  stream to disk, resolving with the byte count actually written. */
function download(url: string, to: string, onProgress?: (bytes: number) => void, depth = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    if (depth > 4) {
      reject(new Error("too many redirects"));
      return;
    }
    const req = get(url, { headers: { "user-agent": `astrolabe-desktop/${app.getVersion()}` } }, (res: IncomingMessage) => {
      const where = res.headers.location;
      if (res.statusCode !== undefined && res.statusCode >= 300 && res.statusCode < 400 && where) {
        res.resume();
        resolve(download(where, to, onProgress, depth + 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`GET asset: HTTP ${res.statusCode}`));
        return;
      }
      const out = createWriteStream(to);
      let bytes = 0;
      res.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        onProgress?.(bytes);
      });
      res.pipe(out);
      out.on("finish", () => out.close(() => resolve(bytes)));
      out.on("error", reject);
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

/** The path of the running AppImage, or null when this build cannot replace
 *  itself (deb, pacman, a dev checkout). AppImage's own runtime sets this. */
function selfPath(): string | null {
  const p = process.env.APPIMAGE;
  return typeof p === "string" && p !== "" ? p : null;
}

/** How this build can take a release: as an AppImage swapped in place, as a
 *  Windows install re-run silently, or not at all. */
type InstallKind = "appimage" | "windows" | null;
function installKind(): InstallKind {
  if (selfPath() !== null) return "appimage";
  if (process.platform === "win32" && app.isPackaged) return "windows";
  return null;
}

/** Fetch a small text asset (the SHA256SUMS file), or null. */
function fetchText(url: string, depth = 0): Promise<string | null> {
  return new Promise((resolve) => {
    if (depth > 4) {
      resolve(null);
      return;
    }
    const req = get(url, { headers: { "user-agent": `astrolabe-desktop/${app.getVersion()}` } }, (res: IncomingMessage) => {
      const where = res.headers.location;
      if (res.statusCode !== undefined && res.statusCode >= 300 && res.statusCode < 400 && where) {
        res.resume();
        resolve(fetchText(where, depth + 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (text += chunk));
      res.on("end", () => resolve(text));
      res.on("error", () => resolve(null));
    });
    req.on("error", () => resolve(null));
  });
}

function sha256Of(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

/** The digest the release's SHA256SUMS file states for `name`, or null when
 *  the release carries no such file or no line for the name. */
async function expectedDigest(assets: Asset[], name: string): Promise<string | null> {
  const sums = assets.find((a) => typeof a.name === "string" && /^SHA256SUMS.*\.txt$/.test(a.name));
  if (!sums?.browser_download_url) return null;
  const text = await fetchText(sums.browser_download_url);
  if (text === null) return null;
  for (const line of text.split("\n")) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line.trim());
    if (m && m[2] === name) return m[1];
  }
  return null;
}

interface Asset {
  name?: string;
  size?: number;
  browser_download_url?: string;
}

/** Look, and only look.
 *
 *  Asks the releases endpoint and, when a newer release exists, says so —
 *  once per version per launch from the timer, every time from the menu. It
 *  never fetches an asset: `decideUpdate` answers `download: false` for every
 *  situation, and the byte-moving half lives in `downloadUpdate`, which only a
 *  click reaches. */
export async function checkForUpdates(manual = false): Promise<void> {
  if (busy) return;
  const current = app.getVersion();
  const pref = updatesPref();
  if (!decideUpdate({ pref, manual, current, latest: null, reminded }).check) return;
  busy = true;
  try {
    if (staged !== null) {
      // Already downloaded and waiting; the only news is the reminder.
      notify({ phase: "ready", version: staged.version });
      return;
    }
    const release = (await fetchJson(API_LATEST).catch(() => fetchJson(LEGACY_API_LATEST))) as { tag_name?: string; assets?: Asset[] };
    const tag = typeof release.tag_name === "string" ? release.tag_name : "";
    const decision = decideUpdate({ pref, manual, current, latest: tag || null, reminded });
    if (!tag || !newer(tag, current)) {
      // The timer stays silent about good news; the MENU says it out loud,
      // because a person who asked deserves an answer either way.
      if (manual) notify({ phase: "current", version: current });
      return;
    }
    found = { tag, assets: release.assets ?? [] };
    if (!decision.remind) return;
    reminded = tag;
    notify({ phase: "available", version: tag, installable: assetFor(found.assets) !== null });
  } catch (err) {
    console.error("astrolabe: update check failed", err);
    if (manual) notify({ phase: "failed", version: current });
  } finally {
    busy = false;
  }
}

/** The release asset this build can install, or null when the build cannot
 *  replace itself or the release carries nothing for it. */
function assetFor(assets: Asset[]): (Asset & { name: string; browser_download_url: string }) | null {
  const kind = installKind();
  if (kind === null) return null;
  for (const a of assets) {
    if (typeof a.name !== "string" || typeof a.browser_download_url !== "string") continue;
    if (kind === "appimage" ? a.name.endsWith(".AppImage") : /\.exe$/i.test(a.name)) {
      return { ...a, name: a.name, browser_download_url: a.browser_download_url };
    }
  }
  return null;
}

/** Fetch the release the last check found — the reader's first click.
 *
 *  Verified twice before it is called ready: the byte count against the
 *  asset's declared size, and the digest against the release's SHA256SUMS
 *  line when it carries one. A build that cannot replace itself (or a release
 *  with no asset for it) opens the release page instead, which is the answer
 *  the pill's own label already gave. */
export async function downloadUpdate(): Promise<void> {
  if (busy) return;
  if (staged !== null) {
    notify({ phase: "ready", version: staged.version });
    return;
  }
  const kind = installKind();
  const asset = found === null ? null : assetFor(found.assets);
  if (found === null || kind === null || asset === null) {
    void shell.openExternal(RELEASES_PAGE);
    return;
  }
  const { tag, assets } = found;
  busy = true;
  try {
    const total = typeof asset.size === "number" && asset.size > 0 ? asset.size : undefined;
    notify({ phase: "downloading", version: tag, received: 0, total });
    // Progress every 200 ms, not every chunk: the renderer redraws a bar per
    // message and a 190 MB download is tens of thousands of chunks.
    let lastTick = 0;
    const progress = (received: number): void => {
      const now = Date.now();
      if (now - lastTick < 200) return;
      lastTick = now;
      notify({ phase: "downloading", version: tag, received, total });
    };
    const self = selfPath();
    // An AppImage stages beside the target, dot-prefixed — the same
    // siblings-only rule the vault's atomic write follows, because /tmp may be
    // another filesystem and a cross-device rename is not a rename. The
    // Windows installer is its own file and runs from wherever it lands, so it
    // stages under the app's own data directory.
    const tmp =
      kind === "appimage" && self !== null
        ? path.join(path.dirname(self), `.${path.basename(self)}.${tag}.part`)
        : path.join(app.getPath("userData"), "updates", asset.name);
    try {
      await fs.mkdir(path.dirname(tmp), { recursive: true });
      const bytes = await download(asset.browser_download_url, tmp, progress);
      notify({ phase: "downloading", version: tag, received: bytes, total: total ?? bytes });
      if (typeof asset.size === "number" && asset.size > 0 && bytes !== asset.size) {
        throw new Error(`short download: ${bytes} of ${asset.size} bytes`);
      }
      // The release's own checksum file, when it carries one, is the second
      // lock: a download that is the right size and the wrong bytes never
      // becomes the installed app either.
      const want = await expectedDigest(assets, asset.name);
      if (want !== null) {
        const got = await sha256Of(tmp);
        if (got !== want) throw new Error(`checksum mismatch for ${asset.name}`);
      }
      if (kind === "appimage" && self !== null) {
        const mode = (await fs.stat(self)).mode & 0o777;
        await fs.chmod(tmp, mode || 0o755);
      }
      staged = { file: tmp, version: tag };
      notify({ phase: "ready", version: tag });
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  } catch (err) {
    console.error("astrolabe: update download failed", err);
    // A download the reader asked for is always answered, unlike the timer's
    // check — and the release stays `found`, so the pill's next click can try
    // again rather than waiting for the next tick to rediscover it.
    notify({ phase: "failed", version: tag });
  } finally {
    busy = false;
  }
}

/** Swap the staged AppImage over the running one and relaunch. The running
 *  process keeps executing from its open file handle — Linux is fine with the
 *  name moving underneath it — so the rename is safe at any moment. */
export async function applyStagedUpdate(): Promise<void> {
  const kind = installKind();
  if (staged === null || kind === null) {
    void shell.openExternal(RELEASES_PAGE);
    return;
  }
  if (kind === "windows") {
    // The installer runs on its own, silently, and relaunches the app when it
    // is done (`--force-run`); this process only has to get out of its way.
    const child = spawn(staged.file, ["/S", "--force-run", "--updated"], { detached: true, stdio: "ignore" });
    child.unref();
    staged = null;
    app.quit();
    return;
  }
  const self = selfPath();
  if (self === null) {
    void shell.openExternal(RELEASES_PAGE);
    return;
  }
  await fs.rename(staged.file, self);
  staged = null;
  relaunchAppImage(self);
  app.quit();
}

/** Start the AppImage again once this process is gone.
 *
 *  NOT `app.relaunch()`. Electron's relauncher is a helper run from the
 *  MOUNTED image, and the AppImage runtime unmounts that the moment the
 *  process exits; the instance it then started died with "fusermount: mount
 *  failed: Operation not permitted", which the owner met as "when I clicked
 *  restart it didn't restart on its own, I had to open the app again". A
 *  detached shell — its own session, nothing of ours left in its hands —
 *  waits for this pid to disappear and execs the file, with an environment
 *  scrubbed of the old mount and of the runtime's own variables, so the new
 *  runtime sets them for itself. */
function relaunchAppImage(self: string): void {
  const mount = path.dirname(process.execPath);
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") continue;
    if (["APPIMAGE", "APPDIR", "ARGV0", "OWD", "ELECTRON_RUN_AS_NODE"].includes(key)) continue;
    if (value.includes(mount)) continue;
    env[key] = value;
  }
  const child = spawn(
    "/bin/sh",
    ["-c", 'while kill -0 "$1" 2>/dev/null; do sleep 0.2; done; exec "$0"', self, String(process.pid)],
    { detached: true, stdio: "ignore", env, cwd: app.getPath("home") },
  );
  child.unref();
}

/** The desktop boot gate's hook (ASTROLABE_SELFTEST=relaunch): relaunch this
 *  AppImage exactly as an applied update would, so the mechanism is tested
 *  on a real file rather than believed. A no-op on any other install. */
export function relaunchForSelfTest(): boolean {
  const self = selfPath();
  if (self === null) return false;
  relaunchAppImage(self);
  app.quit();
  return true;
}

export function openReleasePage(): void {
  void shell.openExternal(RELEASES_PAGE);
}

/** Start the six-hour timer. The timer always runs; whether a tick ASKS is
 *  the preference's decision, read afresh each time (`checkForUpdates`), so
 *  turning updates off and on again needs no restart. */
export function installUpdater(): void {
  if (timer !== null) return;
  void checkForUpdates(false);
  timer = setInterval(() => void checkForUpdates(false), CHECK_EVERY_MS);
  timer.unref?.();
}
