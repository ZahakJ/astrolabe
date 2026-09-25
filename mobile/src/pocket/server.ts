/**
 * THE POCKET SERVER — `/api/*`, answered inside the WebView.
 *
 * The web client in `client/` speaks to seventy-odd HTTP routes and knows
 * nothing about where they are served from. On a pocket vault there is no
 * server to serve them: the notes are a git working tree in the app's private
 * storage, and this is the thing that answers in the server's place.
 *
 * THREE RULES IT KEEPS.
 *
 *  1. It computes nothing of its own. Parsing, folding, scanning, stripping,
 *     the frontmatter writer, the SRS schedule — every one of those comes from
 *     `shared/`, which is where the server's copies now live too. A second
 *     implementation is a vault that disagrees with itself about its own
 *     contents depending on which machine opened it.
 *  2. What it cannot do, it REFUSES, with a reason. A 501 naming the thing
 *     that is missing ("Publishing needs a server") is a sentence a reader can
 *     act on; an empty list is a vault that looks broken.
 *  3. It never merges prose. Saves carry the same `baseMtimeMs` precondition
 *     the server's do and answer the same `409 code:"stale"`; a pull that
 *     diverges sets the phone's version down beside the remote one
 *     (pocket/conflict.ts) and says so.
 *
 * It is a plain function over a request, with the filesystem, git and the
 * clock injected — so its whole surface is testable under `node --test`
 * against an in-memory FS (tests/pocketServer.test.ts).
 */

import type { EffectiveSettings, MeData, NoteData, NoteRevision, PocketSyncStatus, SettingsData, SettingsResponse, TreeNode, VaultEvent } from "../../../shared/types.ts";
import { frontmatterKeyRefusal, setNoteProperty } from "../../../shared/frontmatterEdit.ts";
import type { PropertyValue } from "../../../shared/types.ts";
import { isNotePath, noteTitleOf } from "../../../shared/noteFormat.ts";
import { appendCaptured } from "../../../shared/capture.ts";
import type { DailyRule } from "../../../shared/noteDays.ts";
import { stripBidiControls } from "../../../shared/bidi.ts";
import {
  DAILY_FOLDER_DEFAULT,
  DAILY_FORMAT_DEFAULT,
  MONTHLY_FORMAT_DEFAULT,
  UNIQUE_FORMAT_DEFAULT,
  WEEKLY_FORMAT_DEFAULT,
  YEARLY_FORMAT_DEFAULT,
} from "../../../shared/periodic.ts";
import { editRoutinePlan, logEditFor, applyEdit, mergeEntry, parseRoutineLog } from "../../../shared/routine.ts";
import { editTrackerFence, setTrackerFields, setTrackerProgress, trackerFenceSpans } from "../../../shared/tracker.ts";
import { toggleTaskLine } from "../../../shared/tasks.ts";
import { restoreCardSchedule, writeCardSchedule } from "../../../shared/decks.ts";
import { review, type Grade, type Schedule } from "../../../shared/srs.ts";
import { PocketIndex, isNote } from "./index.ts";
import { contentTypeFor, isImagePath } from "../../../shared/attachments.ts";
import { parseByteRange } from "../../../shared/byteRange.ts";
import {
  appendBullet,
  isVoiceDate,
  isVoiceTime,
  planVoiceNote,
  sniffRecording,
  voiceAudioDir,
  voiceAudioPath,
  voiceInboxPath,
  voiceStamp,
  VOICE_MAX_BYTES,
  type VoiceJob,
} from "../../../shared/voice.ts";
import { localIsoDay } from "../../../shared/dates.ts";
import { lang as phoneLang, wordsIn, type Lang, type Sentence } from "../i18n.ts";
import { PocketVaultError } from "./vaultIo.ts";

// ── what a request and an answer are ────────────────────────────────────────

export interface PocketRequest {
  method: string;
  /** Absolute or root-relative; only the path and the query are read. */
  url: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array | null;
}

export interface PocketResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array | string | null;
}

// ── what the server needs under it ──────────────────────────────────────────

export interface PocketFile {
  path: string;
  size: number;
  mtimeMs: number;
}

/** The working tree. Paths are vault-relative, always POSIX. */
export interface PocketVaultIO {
  list(): Promise<PocketFile[]>;
  readText(path: string): Promise<string | null>;
  readBytes(path: string): Promise<Uint8Array | null>;
  writeText(path: string, content: string): Promise<number>;
  writeBytes(path: string, content: Uint8Array): Promise<number>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  makeFolder(path: string): Promise<void>;
  stat(path: string): Promise<PocketFile | null>;
}

/** The repository under the working tree. Everything here is local: the
 *  network half (fetch, push) belongs to pocket/sync.ts, which drives it. */
export interface PocketGit {
  /** Stage these paths and commit. Returns the new sha, or null when there
   *  was nothing to commit. */
  commit(message: string, paths: string[]): Promise<string | null>;
  /** `git log --follow` for one note. */
  history(path: string, limit: number): Promise<NoteRevision[]>;
  /** One note's bytes at one commit. */
  blobAt(path: string, sha: string): Promise<string | null>;
}

/** Device state that is NOT the vault: preferences and the workspace. On a
 *  server these live in ASTROLABE_DATA; a pocket vault has no such directory
 *  and putting them in the repository would push a phone's open tabs to the
 *  laptop. They stay on the device.
 *
 *  The INSTANCE SETTINGS used to live here too, and that was the bug: a site
 *  name or a calendar chosen on the phone was a fact about the vault, and it
 *  died on the phone. They live in `.astrolabe/settings.json` now — see
 *  `VAULT_SETTINGS` below. */
export interface PocketStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

/**
 * THE SHELL'S HALF OF A POCKET VAULT, when there is a shell.
 *
 * The pull, the push and the phone's memory of which repository this is belong
 * to `pocket/session.ts` and `pocket/store.ts`; the settings panel needs to SAY
 * what they are doing and to ask them to do it. It is optional because the
 * server is also run by `node --test` against an in-memory filesystem, where
 * there is no network and no Preferences — and a route that cannot be answered
 * answers a 501 with the reason, like every other thing a pocket cannot do.
 */
export interface PocketShell {
  /** The sync state the shell's own one-line strip is painted from. */
  syncState(): PocketSyncStatus;
  /** Pull, then push. Answers the state afterwards. */
  syncNow(): Promise<PocketSyncStatus>;
  /** Forget the repository choice and the token — the phone's next launch
   *  opens the connection screen. The CLONE is not deleted: leaving a vault
   *  is not a delete, and the same repository re-opened is a fresh clone
   *  anyway. */
  leave(): Promise<void>;
}

export interface PocketDeps {
  io: PocketVaultIO;
  git: PocketGit;
  store: PocketStore;
  index: PocketIndex;
  /** Named in every commit this server makes. */
  repo: { name: string; branch: string };
  /** The pull, the push and the phone's memory of this repository. Absent
   *  under `node --test`, and then `/api/pocket/*` refuses with a reason. */
  shell?: PocketShell;
  now?: () => number;
  /** Told about every write, so the shell's sync line and the client's
   *  EventSource both learn about it. */
  onEvent?: (event: VaultEvent) => void;
  /** Told when a note was committed, so the pusher can debounce. */
  onCommit?: () => void;
  /** The language a refusal is written in. Defaults to `readerLang()`. */
  lang?: () => Lang;
}

// ── answers ─────────────────────────────────────────────────────────────────

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): PocketResponse {
  return { status, headers: { ...JSON_HEADERS }, body: JSON.stringify(body) };
}

export function fail(status: number, error: string, code?: string): PocketResponse {
  return json(code === undefined ? { error } : { error, code }, status);
}

/**
 * What a pocket vault cannot do, said out loud.
 *
 * Every one of these needs something a phone holding a git clone does not
 * have: a public origin, a moderation queue, a font directory on disk, a
 * second instance to sync with. A 501 with the reason in it is the difference
 * between "Astrolabe cannot do this here" and "Astrolabe is broken".
 */
/**
 * WHY A POCKET KEEPS A VOICE NOTE AND DOES NOT TRANSCRIBE IT (3.24.0).
 *
 * Transcription is a model of half a gigabyte run on the owner's own machine
 * (server/voiceEngine.ts); a phone running a WebView is not that machine, and
 * a model downloaded into IndexedDB would be half a gigabyte of somebody's
 * phone spent on a feature the laptop already has. So `POST /api/voice` here
 * does the half it CAN do — the recording is written into the vault and linked
 * from the day's inbox, committed and pushed like any save — and the words are
 * the half it refuses, by name: the job answers `kept` with the code "pocket",
 * and asking after it (or after the engine) is a 501 with this sentence.
 *
 * It is NOT transcribed later when the repository is opened on an instance.
 * An instance that rewrote bullets in a note the owner last touched on a phone,
 * unasked, would be a server editing prose behind its owner's back — the one
 * thing the conflict rule below exists to refuse. The recording is linked, and
 * the owner can play it anywhere.
 */
/**
 * WHY A POCKET READS NO FEEDS (docs/feeds.md). A round of feeds is a server
 * asking other servers on a timer, and a phone WebView is asleep most of the
 * hour; the read flags live in the instance's own data directory, not in the
 * vault. What the owner KEPT is notes, and those are here like any note.
 */
/** An export is unpacked, converted and planned on a server's own disk
 *  (server/import/); a phone opens the vault that import produced.
 *
 *  Every refusal below is a KEY into the shell's dictionary
 *  (mobile/src/i18n.ts), not a sentence: the answer is written in the
 *  reader's language at the moment it is sent (`speak` in the router), and
 *  check-i18n holds the English and the Arabic to each other. */
const POCKET_NO_IMPORT: Sentence = "refuseImport";

const POCKET_NO_FEEDS: Sentence = "refuseFeeds";

/** Webmentions and the fediverse (docs/webmentions.md) are other sites
 *  talking to a public address, and a pocket vault has none: nobody can
 *  mention a page it does not serve, or follow an actor it cannot answer for. */
const POCKET_NO_FEDERATION: Sentence = "refuseFederation";

const POCKET_NO_TRANSCRIBER: Sentence = "refuseTranscriber";

const SERVER_ONLY: Record<string, Sentence> = {
  "/api/publish": "refusePublish",
  "/api/published": "refusePublish",
  "/api/posts": "refuseBlog",
  "/api/comments": "refuseMarginalia",
  "/api/comments/all": "refuseMarginalia",
  "/api/visibility": "refuseVisibility",
  "/api/collections": "refusePublicFolders",
  "/api/library": "refuseLibrary",
  "/api/clip/token": "refuseClipToken",
  "/api/clip/token/rotate": "refuseClipToken",
  "/api/fonts/upload": "refuseFontUpload",
  "/api/fonts/custom": "refuseFontUpload",
  "/api/sync/status": "refuseSyncStatus",
  "/api/sync/now": "refuseSyncDrive",
  "/api/sync/init": "refuseSyncInit",
  "/api/sync/launch": "refuseSyncDrive",
  "/api/sync/snapshot": "refuseSnapshot",
  "/api/sync/travel": "refuseTravel",
  "/api/design": "refuseDesigner",
  "/api/design/active": "refuseDesigner",
  "/api/design/docs": "refuseDesigner",
  "/api/design/themes": "refuseDesigner",
  "/api/export": "refuseExport",
  "/api/orbits/import": "refuseDeckImport",
  "/api/tags/rename": "refuseBulk",
  "/api/replace": "refuseBulk",
  "/api/attachment/rename": "refuseAttachmentRename",
  "/api/bulk/undo": "refuseBulk",
  "/api/links/heading-repair": "refuseBulk",
  "/api/annotations": "refuseAnnotations",
  "/api/books": "refuseBooks",
  "/api/hadith": "refuseScripture",
  "/api/seed": "refuseSeed",
  "/api/theme": "refuseSiteTheme",
  "/api/voice/engine": POCKET_NO_TRANSCRIBER,
};

/**
 * WHERE A POCKET VAULT'S SETTINGS LIVE: IN THE VAULT.
 *
 * The same file `server/configMirror.ts` mirrors out of every instance's data
 * directory, in the same shape, so a site name chosen on the phone is in the
 * repository within one push and is the laptop's site name the moment it
 * pulls. The first version of this server kept them in the phone's own
 * Preferences instead, and the friend who reported the bug was right about
 * the symptom and half right about the cause: the settings did not travel, and
 * the git-sync rows on top of them could not be saved AT ALL.
 *
 * `.astrolabe/` is a dot-directory: vaultIo.ts hides it from the index and the
 * tree exactly as the instance's vault.ts never lists it, so the settings file
 * is not an attachment in anybody's sidebar.
 */
const VAULT_SETTINGS = ".astrolabe/settings.json";

/** `/api/pocket/*` with no shell under it — `node --test`, and nothing else. */
const POCKET_NO_SHELL: Sentence = "refuseNoShell";

/**
 * WHAT A POCKET VAULT CANNOT KEEP, AND WHY — one sentence per key.
 *
 * Every one of these describes something a pocket vault has not got: a public
 * address with visitors at it, a data directory holding downloaded faces, a
 * server-side git to point at a remote, a corpus the installation ships. A
 * PATCH carrying one is REFUSED with the reason rather than written, because
 * the alternative is what the friend hit — a Save that says it saved, a panel
 * that snaps back, and a settings file quietly carrying a lie to the laptop.
 *
 * The client hides or greys the same rows (client/components/SettingsModal.tsx,
 * `pocket`), so in practice nobody meets these refusals; they are here because
 * the panel is not the only thing that can PATCH, and a rule enforced in one
 * place only is a rule with a hole in it.
 */
const POCKET_CANNOT_KEEP: Record<string, Sentence> = {
  gitSync: "keepGitSync",
  gitToken: "keepGitToken",
  gitUser: "keepGitUser",
  publicLayout: "keepPublicLayout",
  languageFilter: "keepLanguageFilter",
  languageToggle: "keepLanguageToggle",
  topics: "keepTopics",
  excludeTags: "keepExcludeTags",
  authorSites: "keepAuthorSites",
  commentsEnabled: "refuseMarginalia",
  shareButtons: "keepShareButtons",
  ambient: "keepAmbient",
  externalVideo: "keepExternalVideo",
  publicFolders: "refusePublicFolders",
  library: "refuseLibrary",
  defaultTheme: "keepDefaultTheme",
  adminTheme: "keepDefaultTheme",
  footer: "keepFooter",
  favicon: "keepFavicon",
  fonts: "keepFonts",
  noteVersions: "keepNoteVersions",
  pdfSearch: "keepPdfSearch",
  hadithFolder: "refuseScripture",
  voice: "keepVoice",
  feeds: "refuseFeeds",
  webmentions: "keepWebmentions",
  fediverse: "keepFediverse",
};

/**
 * THE READER'S LANGUAGE, which is the client's and not the phone's.
 *
 * The client lives in this same page and writes its chrome language onto
 * `<html lang>` (client/state/dom.ts `applyLanguage`); a reader who chose
 * Arabic on an English phone reads Arabic refusals. Before the client has
 * booted, and under `node --test` where there is no document, it is the
 * shell's own pick from the phone's languages.
 */
export function readerLang(): Lang {
  const doc = (globalThis as { document?: { documentElement?: { lang?: string } } }).document;
  const tag = doc?.documentElement?.lang?.toLowerCase() ?? "";
  if (tag.startsWith("ar")) return "ar";
  if (tag.startsWith("en")) return "en";
  return phoneLang;
}

// ── the router ──────────────────────────────────────────────────────────────

export function createPocketServer(deps: PocketDeps): {
  handle(request: PocketRequest): Promise<PocketResponse>;
} {
  const now = deps.now ?? (() => Date.now());
  const { io, git, store, index } = deps;

  const emit = (event: VaultEvent): void => deps.onEvent?.(event);

  /** A refusal, in the reader's language at the moment it is sent. */
  const speak = (key: Sentence): string => wordsIn((deps.lang ?? readerLang)())[key];
  const refuse = (key: Sentence): PocketResponse => fail(501, speak(key), "pocket");

  /** THE LAST LARGE FILE SERVED, kept. The clone lives in IndexedDB, where a
   *  file is one stored value and cannot be read in part — so a film is read
   *  whole, and a player seeking through it asks for a range many times a
   *  minute. Holding the one most recently asked for (by path, size and
   *  mtime, so a changed file is read again) turns every seek after the
   *  first into a slice of memory already paid for. One entry: two films
   *  playing at once is not a case worth a second copy. */
  let held: { path: string; size: number; mtimeMs: number; bytes: Uint8Array } | null = null;
  async function mediaBytes(path: string): Promise<Uint8Array | null> {
    const stat = await io.stat(path);
    if (stat === null) return null;
    if (held !== null && held.path === path && held.size === stat.size && held.mtimeMs === stat.mtimeMs) return held.bytes;
    const bytes = await io.readBytes(path);
    if (bytes === null) return null;
    held = bytes.byteLength >= 1024 * 1024 ? { path, size: stat.size, mtimeMs: stat.mtimeMs, bytes } : held;
    return bytes;
  }

  /** One commit per save, named so a `git log` on the laptop reads as a list
   *  of what the phone did. */
  async function commit(message: string, paths: string[]): Promise<void> {
    const sha = await git.commit(message, paths);
    if (sha) deps.onCommit?.();
  }

  async function readNote(path: string): Promise<NoteData | null> {
    const content = await io.readText(path);
    if (content === null) return null;
    const stat = await io.stat(path);
    return { path, content, mtimeMs: stat?.mtimeMs ?? now() };
  }

  /** The write precondition, the same one server/vault.ts enforces: a save
   *  that would overwrite a version the writer never saw is refused, not
   *  merged. It is the whole reason two writers on one vault is survivable. */
  function assertFresh(path: string, base: number | null | undefined): PocketResponse | null {
    if (base === undefined || base === null) return null;
    const record = index.notes.get(path);
    if (!record) return null;
    if (Math.round(record.mtimeMs) === Math.round(base)) return null;
    return fail(409, `Note changed on disk: ${path}`, "stale");
  }

  /** Write a note, reindex it, announce it and commit it. */
  async function saveNote(path: string, content: string, verb: "created" | "changed"): Promise<NoteData> {
    const mtimeMs = await io.writeText(path, content);
    index.put(path, content, mtimeMs);
    emit({ kind: verb, path });
    await commit(`Astrolabe pocket: ${noteTitleOf(path)}`, [path]);
    return { path, content, mtimeMs };
  }

  async function bodyJson(request: PocketRequest): Promise<Record<string, unknown> | null> {
    const raw = request.body;
    if (raw === undefined || raw === null) return null;
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    if (!text.trim()) return null;
    try {
      const parsed: unknown = JSON.parse(text);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  /** A path the vault refuses (vaultIo.ts `safeVaultPath`) is the caller's
   *  mistake, answered as a 400 in the reader's language — the server's own
   *  `safeAbs` refusal — rather than a rejected fetch with English in it. */
  async function handle(request: PocketRequest): Promise<PocketResponse> {
    try {
      return await route(request);
    } catch (err) {
      if (err instanceof PocketVaultError) return fail(400, err.say(wordsIn((deps.lang ?? readerLang)())));
      throw err;
    }
  }

  async function route(request: PocketRequest): Promise<PocketResponse> {
    const url = new URL(request.url, "https://localhost");
    const route = url.pathname;
    const q = url.searchParams;
    const method = request.method.toUpperCase();

    const refusal = SERVER_ONLY[route] ?? (route.startsWith("/api/design/") ? SERVER_ONLY["/api/design"] : undefined)
      ?? (route.startsWith("/api/books/") ? SERVER_ONLY["/api/books"] : undefined)
      ?? (route.startsWith("/api/comments/") ? SERVER_ONLY["/api/comments"] : undefined)
      ?? (route.startsWith("/api/voice/") ? POCKET_NO_TRANSCRIBER : undefined)
      ?? (route === "/api/feeds" || route.startsWith("/api/feeds/") ? POCKET_NO_FEEDS : undefined)
      ?? (route === "/api/webmentions" || route.startsWith("/api/webmentions/") ? POCKET_NO_FEDERATION : undefined)
      ?? (route.startsWith("/api/import/") ? POCKET_NO_IMPORT : undefined);
    if (refusal !== undefined) return refuse(refusal);

    // ── the handlers that needed a name ─────────────────────────────────────

    /** A deleted note keeps a copy in `.trash/`, which is LOCAL: it is in the
     *  repository's exclude list, so a delete on the phone reaches the laptop
     *  as a deletion and the copy that can undo it stays on this device. The
     *  original path rides in a FLAT name with its separators
     *  percent-encoded, so `.trash/` stays one directory deep and a restore is
     *  a write rather than an archaeology of empty folders. */
    async function toTrash(path: string): Promise<string | null> {
      const bytes = await io.readBytes(path);
      if (bytes === null) return null;
      const name = encodeURIComponent(path);
      await io.writeBytes(`.trash/${name}`, bytes);
      return `.trash/${name}`;
    }

    /**
     * THE INSTANCE SETTINGS, ANSWERED IN FULL.
     *
     * `effective` is not decoration: the client reads the periodic-note
     * formats, the attachment folder, the typography slots and the localization
     * out of it AT BOOT, synchronously, and a missing field is not a missing
     * feature — it is `format.replace of undefined` inside the command palette
     * (shared/periodic.ts::formatPeriod). The harness found exactly that. So it
     * is built here, whole, typed as `SettingsResponse` so the compiler is the
     * thing that notices when the shape grows a field.
     *
     * The values are the product's own defaults, overlaid with whatever is
     * stored IN THE VAULT (`.astrolabe/settings.json` — the same file an
     * instance mirrors, so the two ends of one repository agree). A pocket
     * vault has no ASTROLABE_DATA to inherit from, so `inherited` is the
     * defaults too.
     *
     * The keys in `POCKET_CANNOT_KEEP` are answered as the fixed facts they
     * are, whatever the file says: a repository that has been open on a laptop
     * carries `commentsEnabled: true` and a `gitSync` block, and a phone that
     * echoed them back would be describing a site it is not.
     */
    /** Where this vault's daily notes live and how they are named — its
     *  `.astrolabe/settings.json`, the instance's rule on a phone. */
    async function dailyRule(): Promise<DailyRule> {
      const held = await heldSettings();
      const folder = held.dailyFolder ?? DAILY_FOLDER_DEFAULT;
      return { folder: folder === "/" ? "" : folder, format: held.dailyFormat ?? DAILY_FORMAT_DEFAULT };
    }

    async function heldSettings(): Promise<Partial<SettingsData>> {
      const text = await io.readText(VAULT_SETTINGS);
      if (text === null) return {};
      try {
        const parsed: unknown = JSON.parse(text);
        return typeof parsed === "object" && parsed !== null ? (parsed as Partial<SettingsData>) : {};
      } catch {
        // A half-written or hand-mangled file must never be the reason the
        // vault will not open: the defaults render, and the next save rewrites
        // it whole.
        return {};
      }
    }

    async function pocketSettings(): Promise<SettingsResponse> {
      const held = await heldSettings();
      const language = held.language === "ar" ? "ar" : "en";
      const effective: EffectiveSettings = {
        siteName: held.siteName ?? deps.repo.name,
        tagline: held.tagline ?? null,
        // The four below are answered as the FIXED facts a pocket vault has,
        // not from the file: a repository that has been open on a laptop
        // carries its public site's footer, theme and excluded tags, and a
        // phone echoing them back would be describing a site it is not.
        footer: null,
        defaultTheme: "follow",
        visitorTheme: null,
        publicLayout: "app",
        blogLocale: held.blogLocale ?? language,
        language,
        languageFilter: "off",
        languageToggle: false,
        topics: "tags",
        excludeTags: [],
        authorSites: [],
        commentsEnabled: false,
        noteVersions: true,
        shareButtons: false,
        ambient: false,
        externalVideo: false,
        pdfSearch: false,
        favicon: null,
        logo: held.logo ?? null,
        templatesFolder: held.templatesFolder ?? null,
        templatesFolderDetected: false,
        hadithFolder: null,
        hadithFolderDetected: false,
        drawingsFolder: held.drawingsFolder ?? null,
        defaultTemplate: held.defaultTemplate ?? null,
        dailyFolder: held.dailyFolder ?? DAILY_FOLDER_DEFAULT,
        dailyFormat: held.dailyFormat ?? DAILY_FORMAT_DEFAULT,
        dailyTemplate: held.dailyTemplate ?? null,
        weeklyFormat: held.weeklyFormat ?? WEEKLY_FORMAT_DEFAULT,
        weeklyTemplate: held.weeklyTemplate ?? null,
        monthlyFormat: held.monthlyFormat ?? MONTHLY_FORMAT_DEFAULT,
        monthlyTemplate: held.monthlyTemplate ?? null,
        yearlyFormat: held.yearlyFormat ?? YEARLY_FORMAT_DEFAULT,
        yearlyTemplate: held.yearlyTemplate ?? null,
        launch: held.launch ?? "resume",
        uniqueFolder: held.uniqueFolder ?? "",
        uniqueFormat: held.uniqueFormat ?? UNIQUE_FORMAT_DEFAULT,
        captureInbox: held.captureInbox ?? null,
        // A pocket runs no model and keeps every recording: the fixed facts,
        // not the file (a laptop's choice of model describes the laptop).
        voice: { model: "off", language: "auto", keepAudio: true },
        // Feeds are fetched by an instance on its own schedule; a pocket
        // fetches nothing. The list's note is still the vault's own.
        feeds: { fetch: false, note: held.feeds?.note ?? "Feeds.md" },
        // Nobody can mention or follow a site with no public address.
        webmentions: { accept: false, send: false },
        fediverse: { enabled: false, handle: held.fediverse?.handle ?? "blog" },
        home: { mode: "note", ...(held.home ?? {}) },
        publicFolders: { enabled: false, home: false, nav: false, folders: [] },
        library: { enabled: false, nav: false, home: false, title: "", roots: [], paths: [] },
        attachments: {
          mode: held.attachments?.mode ?? "vault-root",
          folder: held.attachments?.folder ?? "attachments",
        },
        // The vault IS the git sync here, and the shell owns it; the shape is
        // answered so the settings panel renders, and every route that would
        // act on it is a 501 with the reason in it.
        gitSync: {
          enabled: false,
          remote: null,
          branch: deps.repo.branch,
          intervalMinutes: 0,
          pullFirst: true,
          authMode: "token",
          tokenSet: true,
          gitUser: null,
        },
        // Ask the vault needs Ollama on a computer; a pocket vault has none,
        // and its /api/ask routes do not exist, so every door says so. The
        // shape is answered so the settings panel renders.
        ask: {
          provider: "ollama",
          chatModel: "qwen3.5:9b",
          anthropicModel: "claude-sonnet-5",
          embedModel: "embeddinggemma",
          topK: 6,
          keySet: false,
          ollamaUrl: "",
        },
        // Catalog faces are downloaded and served by an instance; the phone
        // ships no font directory, so every slot is the system stack.
        fonts: { prose: "system", ui: "system", mono: "system", arabic: "system" },
        dateCalendar: held.dateCalendar ?? "gregorian",
        dateOrder: held.dateOrder ?? "auto",
        dateSeparator: held.dateSeparator ?? "bar",
        textDirection: held.textDirection ?? "auto",
        textAlign: held.textAlign ?? "start",
        emptyPropsCard: held.emptyPropsCard ?? true,
        tagsFolder: held.tagsFolder ?? "tags",
        tagsFolderDetected: false,
        tagLabels: held.tagLabels ?? {},
        folderIcons: held.folderIcons ?? {},
      };
      // The STORED half of the answer, with the keys this vault cannot keep
      // taken out of it. They are in the file whenever the repository has also
      // been open on an instance, and the panel prefills its fields from here:
      // echoing a laptop's comment setting back would put a live-looking
      // switch on a screen that can do nothing with it.
      const stored: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(held)) {
        if (POCKET_CANNOT_KEEP[key] === undefined) stored[key] = value;
      }
      return {
        ...(stored as SettingsData),
        effective,
        inherited: {
          language,
          languageFilter: "off",
          publicLayout: "app",
          defaultTheme: "follow",
          homeMode: "note",
          attachmentsMode: "vault-root",
          languageToggle: false,
          commentsEnabled: false,
          noteVersions: true,
          shareButtons: false,
          ambient: false,
          externalVideo: false,
          pdfSearch: false,
        },
      };
    }

    async function editFrontmatter(body: Record<string, unknown> | null): Promise<PocketResponse> {
      const path = typeof body?.path === "string" ? body.path : null;
      const key = typeof body?.key === "string" ? body.key : null;
      if (!path || !key) return fail(400, 'Body fields "path" and "key" must be non-empty strings');
      const refusalText = frontmatterKeyRefusal(path, key);
      if (refusalText) return fail(400, refusalText);
      const note = await readNote(path);
      if (!note) return fail(404, `Note not found: ${path}`);
      const raw = body?.value;
      const value: PropertyValue | null =
        raw === null || raw === "" ? null : typeof raw === "string" ? { kind: "text", text: raw } : (raw as PropertyValue);
      const next = setNoteProperty(path, note.content, key, value);
      const stale = assertFresh(path, note.mtimeMs);
      if (stale) return stale;
      await saveNote(path, next, "changed");
      return json({ ok: true, path, key, value });
    }

    async function editTask(body: Record<string, unknown> | null): Promise<PocketResponse> {
      const path = typeof body?.path === "string" ? body.path : null;
      const line = Number(body?.line);
      if (!path || !Number.isFinite(line)) return fail(400, "A task needs a line");
      const note = await readNote(path);
      if (!note) return fail(404, `Note not found: ${path}`);
      const lines = note.content.split("\n");
      const raw = lines[line - 1];
      if (raw === undefined) return fail(409, "That task is gone", "stale");
      lines[line - 1] = toggleTaskLine(raw, body?.done === true, String(body?.today ?? isoToday(now())));
      await saveNote(path, lines.join("\n"), "changed");
      return json({ ok: true, path, line, done: body?.done === true });
    }

    async function editTracker(body: Record<string, unknown> | null): Promise<PocketResponse> {
      const path = typeof body?.path === "string" ? body.path : null;
      if (!path) return fail(400, 'Body field "path" must be a non-empty string');
      const note = await readNote(path);
      if (!note) return fail(404, `Note not found: ${path}`);
      const spans = trackerFenceSpans(note.content);
      const wanted = Number(body?.index ?? 0);
      if (!spans[wanted]) return fail(400, "That note carries no tracker fence");
      const delta = Number(body?.delta);
      const next = editTrackerFence(note.content, wanted, (fence) =>
        Number.isFinite(delta) && delta !== 0
          ? setTrackerProgress(fence, delta)
          : setTrackerFields(fence, (body?.set ?? {}) as Parameters<typeof setTrackerFields>[1]),
      );
      await saveNote(path, next, "changed");
      return json({ ok: true, path, index: wanted });
    }

    async function editRoutine(body: Record<string, unknown> | null): Promise<PocketResponse> {
      const path = typeof body?.path === "string" ? body.path : null;
      if (!path) return fail(400, 'Body field "path" must be a non-empty string');
      const note = await readNote(path);
      if (!note) return fail(404, `Note not found: ${path}`);
      const index0 = Number(body?.index ?? 0);
      if (typeof body?.plan === "string") {
        await saveNote(path, editRoutinePlan(note.content, index0, body.plan), "changed");
        return json({ ok: true, path, index: index0 });
      }
      const patch = body?.entry as Parameters<typeof mergeEntry>[1] | undefined;
      if (!patch) return fail(400, "A sigil write needs an entry or a plan");
      const record = index.notes.get(path);
      const block = record?.routines[index0];
      if (!block) return fail(400, "That note carries no sigil fence");
      const existing = parseRoutineLog("", block.plan.fields).find((e) => e.date === patch.date) ?? null;
      const edit = logEditFor(note.content, index0, mergeEntry(existing, patch));
      if (!edit) return fail(400, "That note carries no sigil fence");
      await saveNote(path, applyEdit(note.content, edit), "changed");
      return json({ ok: true, path, index: index0 });
    }

    async function reviewCard(body: Record<string, unknown> | null): Promise<PocketResponse> {
      const path = typeof body?.path === "string" ? body.path : null;
      const line = Number(body?.line);
      if (!path) return fail(400, 'Body field "path" must be a non-empty string');
      if (!Number.isFinite(line)) return fail(400, "A card needs a line");
      const dir = body?.dir === "rev" ? "rev" : "fwd";
      const note = await readNote(path);
      if (!note) return fail(409, "That card is gone", "stale");
      const record = index.notes.get(path);
      const star = (record?.deck?.cards ?? index.deckCards(path, null) ?? []).find(
        (card) => card.line === line && card.dir === dir,
      );
      if (!star) return fail(409, "That card is gone", "stale");

      if ("restore" in (body ?? {})) {
        const restore = body?.restore as Schedule | null;
        const next = restoreCardSchedule(note.content, star, restore);
        await saveNote(path, next, "changed");
        return json({ ok: true, path, line, dir, schedule: restore });
      }
      const grade = String(body?.grade) as Grade;
      if (!["again", "hard", "good", "easy"].includes(grade)) {
        return fail(400, "Grade one of again, hard, good, easy");
      }
      const schedule = review(star.schedule, grade, String(body?.today ?? isoToday(now())));
      await saveNote(path, writeCardSchedule(note.content, star, schedule), "changed");
      return json({ ok: true, path, line, dir, schedule });
    }

    switch (`${method} ${route}`) {
      // ── the session ───────────────────────────────────────────────────────
      case "GET /api/me": {
        const me: MeData = {
          admin: true,
          public: false,
          protected: false,
          // THE ONE THING THE CLIENT HAS TO KNOW ABOUT WHERE IT IS. Everything
          // else the pocket refuses, it refuses one route at a time, and the
          // client meets the refusal only after the reader has already acted.
          // The settings panel cannot work that way: a Backup & sync tab full
          // of a server's git rows is wrong BEFORE anything is pressed.
          pocket: true,
          siteName: deps.repo.name,
          version: pocketVersion(),
          // The vault is a git working tree and nothing else: there is no
          // published collection, no visitors, no public layout.
          published: { notes: 0, total: index.notes.size },
        };
        return json(me);
      }
      case "POST /api/login":
      case "POST /api/logout":
        return refuse("refuseSignIn");

      // ── the tree and the notes ────────────────────────────────────────────
      case "GET /api/tree":
        return json(index.tree() satisfies TreeNode);

      case "GET /api/note": {
        const path = q.get("path");
        if (!path) return fail(400, 'Missing query param: path');
        const note = await readNote(path);
        return note ? json(note) : fail(404, `Note not found: ${path}`);
      }

      case "PUT /api/note":
      case "POST /api/note/flush": {
        const body = await bodyJson(request);
        if (!body) return fail(400, "Invalid JSON body");
        const path = method === "PUT" ? q.get("path") : typeof body.path === "string" ? body.path : null;
        if (!path) return fail(400, 'Missing query param: path');
        if (typeof body.content !== "string") return fail(400, 'Body field "content" must be a string');
        const stale = assertFresh(path, body.baseMtimeMs as number | null | undefined);
        if (stale) return stale;
        const existed = index.notes.has(path);
        return json(await saveNote(path, body.content, existed ? "changed" : "created"));
      }

      case "POST /api/note": {
        const body = await bodyJson(request);
        const path = typeof body?.path === "string" ? body.path : null;
        if (!path) return fail(400, 'Body field "path" must be a non-empty string');
        if (index.notes.has(path)) return fail(409, `Note already exists: ${path}`, "exists");
        return json(await saveNote(path, "", "created"));
      }

      case "DELETE /api/note":
      case "DELETE /api/attachment": {
        const path = q.get("path");
        if (!path) return fail(400, 'Missing query param: path');
        if (!(await io.stat(path))) return fail(404, `Not found: ${path}`);
        const permanent = /^(1|true|yes|on)$/i.test(q.get("permanent") ?? "");
        const trashPath = permanent ? null : await toTrash(path);
        await io.remove(path);
        index.remove(path);
        emit({ kind: "deleted", path });
        await commit(`Astrolabe pocket: delete ${noteTitleOf(path)}`, [path]);
        return json(trashPath === null ? { ok: true } : { ok: true, trashPath });
      }

      case "GET /api/note/state": {
        const paths = q.getAll("path");
        if (paths.length === 0) return fail(400, 'Query parameter "path" is required');
        if (paths.length > 64) return fail(400, "Too many paths (64 max)");
        return json({
          states: paths.map((path) => ({ path, mtimeMs: index.notes.get(path)?.mtimeMs ?? null })),
        });
      }

      case "POST /api/rename": {
        const body = await bodyJson(request);
        const from = typeof body?.path === "string" ? body.path : null;
        const to = typeof body?.toPath === "string" ? body.toPath : null;
        if (!from || !to) return fail(400, 'Body fields "path" and "toPath" must be non-empty strings');
        if (!(await io.stat(from))) return fail(404, `Note not found: ${from}`);
        if (await io.stat(to)) return fail(409, `Target already exists: ${to}`, "exists");
        await io.rename(from, to);
        const content = (await io.readText(to)) ?? "";
        const stat = await io.stat(to);
        index.remove(from);
        if (isNote(to)) index.put(to, content, stat?.mtimeMs ?? now());
        else index.putAsset(to, stat?.size ?? 0, stat?.mtimeMs ?? now());
        emit({ kind: "renamed", path: from, toPath: to });
        await commit(`Astrolabe pocket: rename ${noteTitleOf(from)} → ${noteTitleOf(to)}`, [from, to]);
        return json({ ok: true });
      }

      case "POST /api/folder": {
        const body = await bodyJson(request);
        const path = typeof body?.path === "string" ? body.path : null;
        if (!path) return fail(400, 'Body field "path" must be a non-empty string');
        await io.makeFolder(path);
        emit({ kind: "created", path, dir: true });
        return json({ ok: true });
      }

      case "DELETE /api/folder": {
        const path = q.get("path");
        if (!path) return fail(400, 'Missing query param: path');
        const prefix = `${path}/`;
        const doomed = (await io.list()).filter((f) => f.path.startsWith(prefix)).map((f) => f.path);
        for (const one of doomed) {
          await io.remove(one);
          index.remove(one);
        }
        emit({ kind: "deleted", path, dir: true });
        await commit(`Astrolabe pocket: delete folder ${path}`, doomed);
        return json({ notes: doomed.filter(isNote).length });
      }

      // ── search, links, shelves ────────────────────────────────────────────
      case "GET /api/search":
        return json(index.search(q.get("q") ?? ""));
      case "GET /api/search/matches":
        return json(index.searchMatches(q.get("path") ?? "", q.get("q") ?? ""));
      case "GET /api/query":
        return json(
          index.queryNotes(
            q.get("q") ?? "",
            {
              key: (q.get("sort") ?? "date") as "date" | "modified" | "title" | "path" | "relevance",
              dir: (q.get("dir") ?? "desc") as "asc" | "desc",
            },
            Number(q.get("limit")) || 100,
          ),
        );
      case "GET /api/query/paths":
        return json(index.queryPaths(q.get("q") ?? ""));
      case "GET /api/backlinks":
        return json(index.backlinks(q.get("path") ?? ""));
      case "GET /api/graph": {
        const around = q.get("around");
        return json(around ? index.graphAround(around) : index.graph());
      }
      case "GET /api/tags":
        return json(index.tags());
      case "GET /api/props":
        return json(index.props());
      case "GET /api/tag-labels":
        return json({ labels: {} });
      case "GET /api/aliases":
        return json({ aliases: index.aliasEntries() });
      case "GET /api/resolve":
        return json({ path: index.resolve(q.get("name") ?? "") });
      case "GET /api/anchors": {
        const path = q.get("path") ?? "";
        const record = index.notes.get(path);
        if (!record) return fail(404, `Note not found: ${path}`);
        return json({ path, anchors: record.anchors });
      }
      case "GET /api/nearby":
        return json(index.nearby(q.get("path") ?? ""));
      case "GET /api/mentions":
        // Unlinked mentions are a whole-vault scan per note open. It is the
        // one read the pocket refuses on cost rather than on capability, and
        // it says so rather than answering an empty list that reads as "this
        // note is mentioned nowhere".
        return refuse("refuseMentions");
      case "GET /api/tasks":
        return json(index.tasks());
      // Today's "On this day" and the Timeline's notes (docs/today.md,
      // docs/timeline.md): the server's rules over the phone's own index.
      case "GET /api/onthisday":
        return json(index.onThisDay(q.get("date") ?? "", await dailyRule()));
      case "GET /api/timeline":
        return json(index.timeline(await dailyRule()));
      case "GET /api/trackers":
        return json(index.trackers());
      case "GET /api/routines":
        return json(index.routines());
      case "GET /api/twins":
        return json({ pairs: [], swap: {} });
      case "GET /api/attachments":
        return json([...index.assets.keys()].filter((p) => isImagePath(p)).sort((a, b) => a.localeCompare(b)));
      case "GET /api/attachments/unused": {
        const referenced = new Set<string>();
        for (const record of index.notes.values()) {
          for (const asset of record.assets) referenced.add(asset);
          for (const link of record.links) {
            const hit = index.resolveAsset(link.target);
            if (hit) referenced.add(hit);
          }
        }
        const files = [...index.assets.values()]
          .filter((a) => !referenced.has(a.path))
          .map((a) => ({ path: a.path, size: a.size, mtimeMs: a.mtimeMs }));
        return json({ files, total: files.length });
      }

      // ── orbits ────────────────────────────────────────────────────────────
      case "GET /api/orbits":
      case "GET /api/cards":
        return json(index.decks(q.get("today") ?? isoToday(now())));
      case "GET /api/orbits/cards": {
        const path = q.get("path");
        if (!path) return fail(400, "A deck needs a path");
        const cards = index.deckCards(path, q.get("section"));
        return cards === null ? fail(404, `Not a deck: ${path}`) : json(cards);
      }
      case "POST /api/orbits/card/review":
      case "POST /api/card/review":
        return reviewCard(await bodyJson(request));

      // ── writes into a note's text ─────────────────────────────────────────
      case "POST /api/frontmatter":
        return editFrontmatter(await bodyJson(request));
      case "POST /api/task":
        return editTask(await bodyJson(request));
      case "POST /api/tracker":
        return editTracker(await bodyJson(request));
      case "POST /api/routine":
        return editRoutine(await bodyJson(request));

      // ── device state ──────────────────────────────────────────────────────
      case "GET /api/prefs":
        return json({ keys: ((await store.get("prefs")) as Record<string, unknown>) ?? {} });
      case "PUT /api/prefs": {
        const body = await bodyJson(request);
        const incoming = (body?.keys ?? {}) as Record<string, { v: string | null; t: number }>;
        const held = (((await store.get("prefs")) as Record<string, { v: string | null; t: number }>) ?? {});
        for (const [key, entry] of Object.entries(incoming)) {
          if (!key.startsWith("astrolabe.") || typeof entry !== "object" || entry === null) continue;
          const mine = held[key];
          if (!mine || Number(entry.t) > Number(mine.t)) held[key] = { v: entry.v, t: Number(entry.t) || 0 };
        }
        await store.set("prefs", held);
        return json({ keys: held });
      }
      case "GET /api/state/workspace":
        return json({ workspace: (await store.get("workspace")) ?? null });
      case "PUT /api/state/workspace": {
        const body = await bodyJson(request);
        if (typeof body?.workspace !== "object" || body.workspace === null) return json({ ok: false });
        await store.set("workspace", body.workspace);
        return json({ ok: true });
      }
      case "GET /api/settings":
        return json(await pocketSettings());
      case "PATCH /api/settings": {
        // A SAVE THAT LANDS IN THE REPOSITORY, or a refusal that says why.
        //
        // The keys go into `.astrolabe/settings.json` — the same file every
        // instance mirrors — and the write is committed like a note save, so
        // the choice is on the laptop as soon as the push is. A key the pocket
        // cannot keep is refused with its reason and NOTHING is written: a
        // partial save whose other half was silently dropped is the failure
        // this whole round is about.
        const body = await bodyJson(request);
        const refused = Object.keys(body ?? {}).filter((key) => POCKET_CANNOT_KEEP[key] !== undefined);
        if (refused.length > 0) {
          const first = refused[0] as string;
          return json(
            { error: speak(POCKET_CANNOT_KEEP[first] as Sentence), code: "pocket", fields: refused },
            501,
          );
        }
        const held = (await heldSettings()) as Record<string, unknown>;
        for (const [key, value] of Object.entries(body ?? {})) {
          if (value === null) delete held[key];
          else held[key] = value;
        }
        await io.writeText(VAULT_SETTINGS, `${JSON.stringify(held, null, 2)}\n`);
        await commit("Astrolabe pocket: settings", [VAULT_SETTINGS]);
        return json(await pocketSettings());
      }

      // ── the pocket's own sync, which is the shell's ───────────────────────
      // `/api/sync/*` is a 501 here and stays one: it describes a server
      // driving git over a vault it can see. This is the other thing — the
      // phone's own pull and push, and the one line about them the shell
      // already paints — answered to the settings panel so the reader can SEE
      // it and ask for it without leaving the vault.
      case "GET /api/pocket/sync":
        return deps.shell
          ? json(deps.shell.syncState() satisfies PocketSyncStatus)
          : refuse(POCKET_NO_SHELL);
      case "POST /api/pocket/sync":
        return deps.shell
          ? json((await deps.shell.syncNow()) satisfies PocketSyncStatus)
          : refuse(POCKET_NO_SHELL);
      case "POST /api/pocket/leave": {
        if (!deps.shell) return refuse(POCKET_NO_SHELL);
        await deps.shell.leave();
        return json({ ok: true });
      }
      case "GET /api/layouts":
        return json({ layouts: ((await store.get("layouts")) as unknown) ?? {} });

      // ── versions: git IS the history ──────────────────────────────────────
      case "GET /api/history": {
        const path = q.get("path");
        if (!path) return fail(400, 'Missing query param: path');
        const revisions = await git.history(path, Number(q.get("limit")) || 100);
        return json({ repo: true, revisions, truncated: false });
      }
      case "GET /api/history/blob": {
        const path = q.get("path");
        const sha = q.get("sha");
        if (!path || !sha) return fail(400, 'Missing query param: path');
        const content = await git.blobAt(path, sha);
        return content === null ? fail(404, `No version of ${path} at ${sha}`) : json({ sha, path, content });
      }
      case "GET /api/versions": {
        // The server keeps timestamped copies in its data directory; here the
        // repository already holds every version, so the history IS the
        // version list and the two doors answer from one place.
        const path = q.get("path");
        if (!path) return fail(400, 'Missing query param: path');
        const revisions = await git.history(path, 100);
        return json({
          enabled: true,
          versions: revisions.map((rev) => ({
            at: Date.parse(rev.iso) || 0,
            mtimeMs: Date.parse(rev.iso) || 0,
            size: 0,
            reason: "autosave" as const,
          })),
        });
      }
      case "GET /api/versions/one": {
        const path = q.get("path");
        const at = Number(q.get("at"));
        if (!path || !Number.isFinite(at)) return fail(400, 'Query param "at" must be an epoch-ms integer');
        const revisions = await git.history(path, 100);
        const hit = revisions.find((rev) => (Date.parse(rev.iso) || 0) === at);
        if (!hit) return fail(404, `No version of ${path} at ${at}`);
        const content = await git.blobAt(path, hit.sha);
        return content === null ? fail(404, `No version of ${path} at ${at}`) : json({ path, at, content });
      }
      case "POST /api/versions/restore": {
        const body = await bodyJson(request);
        const path = typeof body?.path === "string" ? body.path : null;
        const at = Number(body?.at);
        if (!path || !Number.isFinite(at)) return fail(400, 'Body field "at" must be an epoch-ms integer');
        const revisions = await git.history(path, 100);
        const hit = revisions.find((rev) => (Date.parse(rev.iso) || 0) === at);
        const content = hit ? await git.blobAt(path, hit.sha) : null;
        if (content === null) return fail(404, `No version of ${path} at ${at}`);
        return json(await saveNote(path, content, "changed"));
      }

      // ── attachments ───────────────────────────────────────────────────────
      case "GET /api/file": {
        const path = q.get("path");
        if (!path) return fail(400, 'Missing query param: path');
        if (isNotePath(path)) return fail(400, "Notes are served via /api/note");
        const bytes = await mediaBytes(path);
        if (bytes === null) return fail(404, `Not found: ${path}`);
        return serveBytes(bytes, contentTypeFor(path), request.headers?.range ?? request.headers?.Range);
      }
      case "POST /api/voice": {
        // The web client sends a recording as base64 inside JSON (and the
        // Android shell's share sheet does too), which is the one body this
        // router reads without a multipart parser.
        const body = await bodyJson(request);
        const b64 = typeof body?.audio === "string" ? body.audio : "";
        if (b64 === "") return fail(400, 'Field "audio" (the recording, base64) is required', "voiceEmpty");
        let bytes: Uint8Array;
        try {
          bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
        } catch {
          return fail(400, 'Field "audio" is not base64', "voiceEmpty");
        }
        if (bytes.length > VOICE_MAX_BYTES) return fail(413, "Recording too large", "voiceTooLarge");
        const ext = sniffRecording(bytes);
        if (ext === null) return fail(415, "Not a recording this vault reads (WebM, Ogg or WAV)", "voiceFormat");
        const date = isVoiceDate(body?.date) ? body.date : isoToday(now());
        const at = new Date(now());
        const time = isVoiceTime(body?.time)
          ? body.time
          : `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
        // The pocket's own attachment setting, read the way its settings
        // answer (vault-root unless the vault says otherwise). Every
        // recording is kept: with no words to show for it, it is all there is.
        const held = await heldSettings();
        const dir = voiceAudioDir({ mode: held.attachments?.mode ?? "vault-root", folder: held.attachments?.folder ?? "attachments" });
        let audio = "";
        for (let n = 1; n < 1000 && audio === ""; n++) {
          const candidate = voiceAudioPath(dir, voiceStamp(date, time), ext, n);
          if (!(await io.stat(candidate))) audio = candidate;
        }
        if (audio === "") return fail(409, "No free name for the recording", "voiceNoFreeName");
        const audioMtime = await io.writeBytes(audio, bytes);
        index.putAsset(audio, bytes.length, audioMtime);
        emit({ kind: "created", path: audio });
        const plan = planVoiceNote({ transcript: null, audioPath: audio, date, time });
        if (plan.kind !== "bullet") return fail(500, "A recording with no words is always a bullet");
        const existing = await readNote(plan.path);
        const next = appendBullet(existing?.content ?? "", plan.bullet);
        const noteMtime = await io.writeText(plan.path, next);
        index.put(plan.path, next, noteMtime);
        emit({ kind: existing ? "changed" : "created", path: plan.path });
        await commit("Astrolabe pocket: voice note", [audio, plan.path]);
        const job: VoiceJob = { id: "", status: "kept", audio, notePath: plan.path, kind: "bullet", error: "pocket" };
        return json(job);
      }

      // ── capture (3.27.0) ──────────────────────────────────────────────────
      // Today's capture field, answered here as server/api.ts answers it: one
      // line under `## Captured` (shared/capture.ts appendCaptured — the same
      // bytes the server writes), stamped with the caller's `HH:MM`, in the
      // note the caller names — the client names today's daily note, made
      // through its own door with its template, or the pinned capture inbox
      // — and, when it names none, in the day's inbox `Inbox/YYYY-MM-DD.md`:
      // the note a pocket already files the share sheet's captures and its
      // kept voice notes under (mobile/src/capture.ts, shared/voice.ts), so a
      // line with no address lands where every other nameless line on this
      // phone does. The same precondition as every other write here:
      // a note that moved on disk since the index last read it (a sync pull
      // landed in between) is refused with 409, not appended over. One commit
      // per line, like a save.
      case "POST /api/capture": {
        const body = await bodyJson(request);
        const raw = typeof body?.text === "string" ? body.text : "";
        const text = stripBidiControls(raw).replace(/\r\n?/g, "\n").trim();
        if (text === "") return fail(400, "Nothing to capture", "captureEmpty");
        if (text.length > 20_000) return fail(413, "That is a note, not a line", "captureTooLong");
        const named = typeof body?.path === "string" && body.path !== "" ? body.path : null;
        if (named !== null && !isNotePath(named)) return fail(400, `Not a note path: ${named}`);
        const time = typeof body?.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.time) ? body.time : null;
        const at = new Date(now());
        const path = named ?? voiceInboxPath(isoToday(now()));
        const current = await readNote(path);
        if (current) {
          const stale = assertFresh(path, current.mtimeMs);
          if (stale) return stale;
        }
        const stamp = time ?? `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
        const next = appendCaptured(current?.content ?? "", text, stamp);
        await saveNote(path, next, current ? "changed" : "created");
        return json({ ok: true, path });
      }

      case "POST /api/upload":
        return refuse("refuseUpload");

      // ── the trash ─────────────────────────────────────────────────────────
      case "GET /api/trash": {
        const held = (await io.list()).filter((f) => f.path.startsWith(".trash/"));
        return json(
          held.map((f) => ({
            name: f.path.slice(".trash/".length),
            origin: null,
            kind: isNote(f.path) ? ("note" as const) : ("attachment" as const),
            deletedMs: f.mtimeMs,
            notes: isNote(f.path) ? 1 : 0,
            attachments: isNote(f.path) ? 0 : 1,
            bytes: f.size,
            originTaken: false,
          })),
        );
      }
      case "POST /api/trash/restore": {
        const body = await bodyJson(request);
        const name = typeof body?.name === "string" ? body.name : null;
        if (!name) return fail(400, 'Body field "name" must be a non-empty string');
        const from = `.trash/${name}`;
        const content = await io.readText(from);
        if (content === null) return fail(404, `Trash entry not found: ${name}`);
        const to = decodeURIComponent(name);
        if (await io.stat(to)) return fail(409, `Target already exists: ${to}`, "exists");
        await io.writeText(to, content);
        await io.remove(from);
        const stat = await io.stat(to);
        index.put(to, content, stat?.mtimeMs ?? now());
        emit({ kind: "created", path: to });
        await commit(`Astrolabe pocket: restore ${noteTitleOf(to)}`, [to]);
        return json({ ok: true, path: to, renamed: false });
      }
      case "DELETE /api/trash": {
        const name = q.get("name");
        if (!name) return fail(400, 'Missing query param: name');
        await io.remove(`.trash/${name}`);
        return json({ ok: true });
      }

      default:
        return fail(404, "Not found");
    }

  }

  return { handle };
}

// ── bytes ───────────────────────────────────────────────────────────────────

/** `/api/file`'s answer, ranges included. pdf.js asks for byte ranges as pages
 *  are reached, and a reader that cannot seek is a book that loads whole. */
function serveBytes(bytes: Uint8Array, type: string, range: string | undefined): PocketResponse {
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  };
  // SVG, PDF and HTML are documents, not pictures: served from the app's own
  // origin they would otherwise be same-origin script. The server sandboxes
  // them and so does this.
  if (/^(image\/svg|application\/pdf|text\/html)/.test(type)) headers["Content-Security-Policy"] = "sandbox";
  // shared/byteRange.ts — the server's /api/file asks the same parser.
  const size = bytes.byteLength;
  const asked = parseByteRange(range, size);
  if (asked === null) {
    return { status: 200, headers: { ...headers, "Content-Length": String(size) }, body: bytes };
  }
  if (asked === "unsatisfiable") {
    return { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` }, body: null };
  }
  const { start, end } = asked;
  return {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
    },
    body: bytes.slice(start, end + 1),
  };
}

/** The LOCAL day, in Western digits — a note's date is the writer's calendar
 *  day, and `toISOString` is the wrong one for anyone past their midnight. */
export function isoToday(ms: number): string {
  return localIsoDay(ms);
}

/** The shell's own version, stamped in at build time (mobile/vite.config.ts,
 *  mobile/scripts/build-pocket.mjs). The client compares it with its own to
 *  notice that the app moved on under it. Guarded because this module is also
 *  loaded by `node --test`, where nothing defines it and a crash inside
 *  `/api/me` would be the first thing every test met. */
declare const __POCKET_VERSION__: string | undefined;

function pocketVersion(): string {
  return typeof __POCKET_VERSION__ === "string" ? __POCKET_VERSION__ : "pocket";
}
