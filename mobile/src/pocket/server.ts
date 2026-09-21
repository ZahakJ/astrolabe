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

import type { EffectiveSettings, MeData, NoteData, NoteRevision, SettingsData, SettingsResponse, TreeNode, VaultEvent } from "../../../shared/types.ts";
import { frontmatterKeyRefusal, setNoteProperty } from "../../../shared/frontmatterEdit.ts";
import type { PropertyValue } from "../../../shared/types.ts";
import { isNotePath, noteTitleOf } from "../../../shared/noteFormat.ts";
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
import { PocketIndex, contentTypeFor, isNote } from "./index.ts";

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

/** Device state that is NOT the vault: preferences, the workspace, the
 *  instance settings. On a server these live in ASTROLABE_DATA; a pocket vault
 *  has no such directory and putting them in the repository would push a
 *  phone's open tabs to the laptop. They stay on the device. */
export interface PocketStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export interface PocketDeps {
  io: PocketVaultIO;
  git: PocketGit;
  store: PocketStore;
  index: PocketIndex;
  /** Named in every commit this server makes. */
  repo: { name: string; branch: string };
  now?: () => number;
  /** Told about every write, so the shell's sync line and the client's
   *  EventSource both learn about it. */
  onEvent?: (event: VaultEvent) => void;
  /** Told when a note was committed, so the pusher can debounce. */
  onCommit?: () => void;
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
const SERVER_ONLY: Record<string, string> = {
  "/api/publish": "Publishing needs a server with a public address; a pocket vault has no visitors.",
  "/api/published": "Publishing needs a server with a public address; a pocket vault has no visitors.",
  "/api/posts": "The blog is the public half of an instance, and a pocket vault has no public half.",
  "/api/comments": "Marginalia are written by visitors to a public site; a pocket vault has none.",
  "/api/comments/all": "Marginalia are written by visitors to a public site; a pocket vault has none.",
  "/api/visibility": "There is nothing to be visible to: a pocket vault is read by its owner alone.",
  "/api/collections": "Public folders are a shape of the published site, which a pocket vault has not got.",
  "/api/library": "The library shelf is part of the published site, which a pocket vault has not got.",
  "/api/clip/token": "The clipper's token authorises a browser to write to a server over the network.",
  "/api/clip/token/rotate": "The clipper's token authorises a browser to write to a server over the network.",
  "/api/fonts/upload": "Uploaded fonts are served from the instance's data directory, which lives on a server.",
  "/api/fonts/custom": "Uploaded fonts are served from the instance's data directory, which lives on a server.",
  "/api/sync/status": "There is no server-side git to ask about: the pocket vault IS the repository, and its state is the shell's own sync line.",
  "/api/sync/now": "There is no server-side git to drive: in a pocket vault the pull and the push belong to the shell, not to the client.",
  "/api/sync/init": "There is no server-side git to set up: a pocket vault is a clone of the repository you already chose.",
  "/api/sync/launch": "There is no server-side git to drive: in a pocket vault the pull and the push belong to the shell, not to the client.",
  "/api/sync/snapshot": "Every save in a pocket vault is already a commit in the repository, so there is no snapshot left to take.",
  "/api/sync/travel": "Travel copies an instance's data directory; a pocket vault has no data directory.",
  "/api/design": "The site designer composes a public site, which a pocket vault has not got.",
  "/api/design/active": "The site designer composes a public site, which a pocket vault has not got.",
  "/api/design/docs": "The site designer composes a public site, which a pocket vault has not got.",
  "/api/design/themes": "The site designer composes a public site, which a pocket vault has not got.",
  "/api/export": "An export is a ZIP built on a server; on a phone the vault is already a git clone.",
  "/api/orbits/import": "Importing a deck reads an uploaded .apkg on a server's disk.",
  "/api/tags/rename": "The bulk rewriter runs over the whole vault on a server, with an undo log behind it.",
  "/api/replace": "The bulk rewriter runs over the whole vault on a server, with an undo log behind it.",
  "/api/bulk/undo": "The bulk rewriter runs over the whole vault on a server, with an undo log behind it.",
  "/api/links/heading-repair": "The bulk rewriter runs over the whole vault on a server, with an undo log behind it.",
  "/api/annotations": "PDF annotations are kept in the instance's data directory, which lives on a server.",
  "/api/books": "The book shelf reads PDFs page by page on a server; a pocket vault opens a book file directly.",
  "/api/hadith": "Scripture lookup reads a corpus the server ships; the pocket carries only your vault.",
  "/api/seed": "The starter vault is copied by a server from its own installation.",
  "/api/theme": "The public site's theme describes visitors, and a pocket vault has none.",
};

// ── the router ──────────────────────────────────────────────────────────────

export function createPocketServer(deps: PocketDeps): {
  handle(request: PocketRequest): Promise<PocketResponse>;
} {
  const now = deps.now ?? (() => Date.now());
  const { io, git, store, index } = deps;

  const emit = (event: VaultEvent): void => deps.onEvent?.(event);

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

  async function handle(request: PocketRequest): Promise<PocketResponse> {
    const url = new URL(request.url, "https://localhost");
    const route = url.pathname;
    const q = url.searchParams;
    const method = request.method.toUpperCase();

    const refusal = SERVER_ONLY[route] ?? (route.startsWith("/api/design/") ? SERVER_ONLY["/api/design"] : undefined)
      ?? (route.startsWith("/api/books/") ? SERVER_ONLY["/api/books"] : undefined)
      ?? (route.startsWith("/api/comments/") ? SERVER_ONLY["/api/comments"] : undefined);
    if (refusal !== undefined) return fail(501, refusal, "pocket");

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
     * The values are the product's own defaults, overlaid with whatever the
     * owner has changed on this device. A pocket vault has no ASTROLABE_DATA to
     * inherit from, so `inherited` is the defaults too.
     */
    async function pocketSettings(): Promise<SettingsResponse> {
      const held = (((await store.get("settings")) as Partial<SettingsData>) ?? {});
      const language = held.language === "ar" ? "ar" : "en";
      const effective: EffectiveSettings = {
        siteName: held.siteName ?? deps.repo.name,
        tagline: held.tagline ?? null,
        footer: held.footer ?? null,
        defaultTheme: held.defaultTheme ?? "follow",
        visitorTheme: null,
        publicLayout: "app",
        blogLocale: held.blogLocale ?? language,
        language,
        languageFilter: "off",
        languageToggle: false,
        topics: "tags",
        excludeTags: held.excludeTags ?? [],
        authorSites: [],
        commentsEnabled: false,
        noteVersions: true,
        shareButtons: false,
        ambient: held.ambient ?? false,
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
        fonts: {
          prose: held.fonts?.prose ?? "system",
          ui: held.fonts?.ui ?? "system",
          mono: held.fonts?.mono ?? "system",
          arabic: held.fonts?.arabic ?? "system",
        },
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
      return {
        ...(held as SettingsData),
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
        return fail(501, "A pocket vault is opened by its owner's phone; there is nobody else to sign in as.", "pocket");

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
        return fail(501, "Unlinked mentions scan the whole vault per note; the pocket does not run that on a phone.", "pocket");
      case "GET /api/tasks":
        return json(index.tasks());
      case "GET /api/trackers":
        return json(index.trackers());
      case "GET /api/routines":
        return json(index.routines());
      case "GET /api/twins":
        return json({ pairs: [], swap: {} });
      case "GET /api/attachments":
        return json([...index.assets.keys()].filter((p) => contentTypeFor(p).startsWith("image/")));
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
        const body = await bodyJson(request);
        const held = (((await store.get("settings")) as Record<string, unknown>) ?? {});
        for (const [key, value] of Object.entries(body ?? {})) {
          if (value === null) delete held[key];
          else held[key] = value;
        }
        await store.set("settings", held);
        return json(await pocketSettings());
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
        const bytes = await io.readBytes(path);
        if (bytes === null) return fail(404, `Not found: ${path}`);
        return serveBytes(bytes, contentTypeFor(path), request.headers?.range ?? request.headers?.Range);
      }
      case "POST /api/upload":
        return fail(
          501,
          "Uploading needs a multipart parser and a place to put bytes; the pocket takes attachments through the repository instead.",
          "pocket",
        );

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
  if (!range || !/^bytes=/.test(range)) {
    return { status: 200, headers: { ...headers, "Content-Length": String(bytes.byteLength) }, body: bytes };
  }
  const spec = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!spec) {
    return { status: 416, headers: { ...headers, "Content-Range": `bytes */${bytes.byteLength}` }, body: null };
  }
  const size = bytes.byteLength;
  let start: number;
  let end: number;
  if (spec[1] === "") {
    const suffix = Number(spec[2]);
    if (!Number.isFinite(suffix) || suffix <= 0) {
      return { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` }, body: null };
    }
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(spec[1]);
    end = spec[2] === "" ? size - 1 : Math.min(Number(spec[2]), size - 1);
  }
  if (!(start >= 0 && start <= end && end < size)) {
    return { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` }, body: null };
  }
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
  const at = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
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
