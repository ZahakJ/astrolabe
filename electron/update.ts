// Software updates, without a framework.
//
// The desktop app learns about a new release the same way a reader would —
// GitHub's releases API — and, when it is running as an AppImage, applies it
// the same way `writeNote` replaces a note: download beside the current file,
// fsync, rename over, relaunch. One HTTPS request every few hours and one
// atomic rename is the entire mechanism, and that is the argument for not
// shipping electron-updater to do it: the framework would be the largest
// dependency in the desktop app, pulled in to perform a dance this codebase
// already performs on every autosave.
//
// WHAT IT PROMISES, precisely:
//   · The check is quiet. No dialog, no dock bounce — a toast in the app's own
//     voice when a release is genuinely newer, and silence otherwise. Checked
//     at launch and every six hours, so an app that is never restarted still
//     hears about releases ("if we didn't restart it between releases").
//   · The download is background and VERIFIED by size before it replaces
//     anything; a truncated download can never become the installed app.
//   · The swap is atomic and the old file's mode survives — the same four
//     rules server/vault.ts documents, one directory over.
//   · THE WINDOWS BUILD UPDATES ITSELF TOO (3.4.0): the release's NSIS
//     installer is downloaded, verified against the release's SHA256SUMS file,
//     and on "Restart now" run silently (`/S --force-run`, the flags the
//     installer honours) while the app quits; the installer relaunches it.
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
}

type Listener = (state: UpdateState) => void;
let notify: Listener = () => {};
export function onUpdateState(fn: Listener): void {
  notify = fn;
}

let timer: NodeJS.Timeout | null = null;
let busy = false;
/** The downloaded, verified AppImage waiting for a relaunch, if any. */
let staged: { file: string; version: string } | null = null;

/** `1.6.0` vs `1.7.0`, numerically per part — enough for this repo's own tags,
 *  which is the only versioning this has to understand. */
function newer(remote: string, local: string): boolean {
  const a = remote.replace(/^v/, "").split(".").map(Number);
  const b = local.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
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

export async function checkForUpdates(manual = false): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    if (staged !== null) {
      // Already downloaded and waiting; the only news is the reminder.
      notify({ phase: "ready", version: staged.version });
      return;
    }
    const release = (await fetchJson(API_LATEST).catch(() => fetchJson(LEGACY_API_LATEST))) as { tag_name?: string; assets?: Asset[] };
    const tag = typeof release.tag_name === "string" ? release.tag_name : "";
    if (!tag || !newer(tag, app.getVersion())) {
      // The timer stays silent about good news; the MENU says it out loud,
      // because a person who asked deserves an answer either way.
      if (manual) notify({ phase: "current", version: app.getVersion() });
      return;
    }
    const kind = installKind();
    if (kind === null) {
      // Not self-replaceable: say a release exists and open the page on
      // request. Pretending otherwise is how updaters break packages that a
      // package manager owns.
      notify({ phase: "available", version: tag });
      return;
    }
    const assets = release.assets ?? [];
    const asset = assets.find(
      (a) => typeof a.name === "string" && (kind === "appimage" ? a.name.endsWith(".AppImage") : /\.exe$/i.test(a.name)),
    );
    if (!asset?.browser_download_url || typeof asset.name !== "string") {
      notify({ phase: "available", version: tag });
      return;
    }
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
    console.error("astrolabe: update check failed", err);
    if (manual) notify({ phase: "failed", version: app.getVersion() });
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
  app.relaunch();
  app.quit();
}

export function openReleasePage(): void {
  void shell.openExternal(RELEASES_PAGE);
}

export function installUpdater(): void {
  if (timer !== null) return;
  void checkForUpdates(false);
  timer = setInterval(() => void checkForUpdates(false), CHECK_EVERY_MS);
  timer.unref?.();
}
