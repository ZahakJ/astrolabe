// Instance settings: ASTROLABE_DATA/settings.json — the runtime-editable side of
// site configuration, written by the admin UI via PATCH /api/settings and in
// effect at once (no restart). Every stored key OVERRIDES its env counterpart;
// an absent key falls back to env (site.ts getters do the merging). Env-only
// forever — never read from this file: ADMIN_PASSWORD_HASH, SESSION_SECRET,
// TRUSTED_PROXIES, PORT, HOST, ASTROLABE_VAULT, ASTROLABE_DATA, PUBLIC.
// Keys: siteName, tagline, footer, defaultTheme, adminTheme, publicLayout, blogLocale,
// language, languageFilter, languageToggle, excludeTags, commentsEnabled, shareButtons, pdfSearch,
// ambient, favicon, logo, home { mode, note, banner }, attachments { mode, folder },
// templatesFolder, hadithFolder, drawingsFolder, defaultTemplate, dailyFolder, dailyFormat, dailyTemplate,
// weeklyFormat, weeklyTemplate, monthlyFormat, monthlyTemplate, yearlyFormat, yearlyTemplate,
// uniqueFolder, uniqueFormat, captureInbox, voice { model, language, keepAudio }, feeds { fetch, note }, launch,
// webmentions { accept, send }, fediverse { enabled, handle }, speak { engine, rate, voices, public },
// dateCalendar, textDirection, textAlign,
// tagsFolder, tagLabels, folderIcons,
// publicFolders { enabled, nav, home, folders }.
// Unknown keys in the file are preserved verbatim on every write so external
// tooling (or future settings) can share the file safely; unknown keys in a
// PATCH are a 400 (strict allowlist).

import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { DAILY_FOLDER_DEFAULT, DAILY_FORMAT_DEFAULT, MONTHLY_FORMAT_DEFAULT, UNIQUE_FORMAT_DEFAULT, WEEKLY_FORMAT_DEFAULT, YEARLY_FORMAT_DEFAULT, type PeriodKind } from "../shared/periodic.ts";
import { DEFAULT_LAUNCH, isLaunchDoor, parseLaunch } from "../shared/launch.ts";
import path from "node:path";
import { isNotePath } from "../shared/noteFormat.ts";
import {
  ATTACHMENT_MODES,
  folderError,
  isAttachmentMode,
  normalizeFolder,
  type FolderProblem,
} from "../shared/attachments.ts";
import { isVoiceLanguage, isVoiceModelSetting, VOICE_MODEL_DEFAULT, voiceEffective, VOICE_MODELS, type VoiceSettings } from "../shared/voice.ts";
import { isSpeakEngine, isSpeakLang, isVoiceOf, SPEAK_ENGINE_DEFAULT, SPEAK_RATES, speakEffective, type SpeakSettings } from "../shared/speech.ts";
import { fetchableSiteUrl, warmAuthorSites } from "./authorSites.ts";
import { FEEDS_NOTE_DEFAULT } from "../shared/feeds.ts";
import { defaultFediverseHandle, isFediverseHandle } from "../shared/fediverse.ts";
import type {
  AboutInfo,
  AuthorSiteRef,
  AttachmentSettings,
  EffectiveSettings,
  FeedsEffective,
  FeedsSettings,
  FediverseEffective,
  FediverseSettings,
  WebmentionsEffective,
  WebmentionsSettings,
  InheritedSettings,
  FontSlotsEffective,
  HomeSettings,
  LanguageFilterMode,
  PublicFolderRef,
  PublicFoldersSettings,
  SettingsData,
  SettingsResponse,
  LibraryPathRef,
  LibraryRoot,
  LibrarySettings,
} from "../shared/types.ts";
// Public folders: the shapes are in types.ts, the RULES are here — one copy,
// shared with the settings editor's inline validation so a green field and a
// 400 can never disagree about what a legal folder is.
import {
  cleanPublicFolder,
  folderId,
  folderRowError,
  FOLDER_DESC_MAX,
  FOLDER_SLUG_MAX,
  FOLDER_TITLE_MAX,
  PUBLIC_FOLDERS_MAX,
  // Aliased: `FolderProblem` is already taken by the ATTACHMENTS folder
  // validator two imports up, and two different "which folder rule broke"
  // unions in one file is exactly the confusion an alias costs nothing to end.
  type FolderProblem as PublicFolderProblem,
} from "../shared/publicFolders.ts";
import {
  cleanLibraryPath,
  cleanLibraryRoot,
  libraryFolder,
  libraryPathId,
  libraryRootError,
  libraryRootNested,
  libraryRowError,
  LIBRARY_PATHS_MAX,
  LIBRARY_ROOTS_MAX,
  LIBRARY_SITE_TITLE_MAX,
  type LibraryRootProblem,
  type LibraryRowError,
} from "../shared/library.ts";
import { FOLLOW_THEME, THEMES as THEME_IDS } from "../shared/themes.ts";
// Localization: the calendar, the note-layout pair and the tag-label map.
// Shapes and validators live in shared/, so the client's editor and this
// file's PATCH handlers cannot drift on what a valid value is.
import { DEFAULT_DATE_CALENDAR, isDateCalendar, type DateCalendar, DEFAULT_DATE_ORDER, DEFAULT_DATE_SEPARATOR, isDateOrder, isDateSeparator, type DateOrder, type DateSeparator } from "../shared/dates.ts";
import {
  DEFAULT_TEXT_ALIGN,
  DEFAULT_TEXT_DIRECTION,
  isTextAlign,
  isTextDirection,
  TEXT_ALIGNS,
  TEXT_DIRECTIONS,
  type TextAlign,
  type TextDirection,
} from "../shared/textLayout.ts";
import {
  cleanLabelEntry,
  cleanTagLabels,
  DEFAULT_TAGS_FOLDER,
  tagKey,
  TAG_LABEL_MAX,
  type TagLabelMap,
} from "../shared/tagLabels.ts";
// The folder glyph set: one closed enum shared by the vault tree and the
// public site, so a PATCH cannot store a mark no renderer can draw.
import {
  cleanFolderIcons,
  FOLDER_ICONS,
  FOLDER_ICONS_MAX,
  folderIconKey,
  isFolderMark,
  type FolderMark,
} from "../shared/folderIcons.ts";
import { isCustomThemeId } from "../shared/customTheme.ts";
// The design store owns the custom themes `defaultTheme` may now name. The
// import is one-way (designs.ts asks site.ts for dataDir, never this module).
import { hasThemeChoice } from "./designs.ts";
import { envHomeNote } from "./auth.ts";
import { commentsEnabled, envCommentsEnabled } from "./comments.ts";
import { envPdfSearch, pdfSearchEnabled } from "./pdfText.ts";
// Backup & sync: the gitSync validators and the write-only credential store
// live in gitSync.ts (this import pair is circular and inert — both modules
// export functions only and neither calls the other at module top level).
import {
  applyStagedGitCredentials,
  cleanGitSyncPatch,
  discardStagedGitCredentials,
  gitSyncEffective,
  readGitSyncSettings,
  setGitToken,
  setGitUser,
} from "./gitSync.ts";
// Ask the vault: the same circular-and-inert pair, and the same write-only
// secret (the Anthropic key, in ASTROLABE_DATA/ask-credentials.json).
import {
  applyStagedAskKey,
  askEffective,
  cleanAskPatch,
  discardStagedAskKey,
  readAskSettings,
  stageAnthropicKey,
} from "./askSettings.ts";
import {
  attachmentLocation,
  blogLocale,
  dataDir,
  excludedTags,
  footerTemplate,
  LANGUAGE_FILTER_MODES,
  envLanguageFilterMode,
  envNoteVersions,
  envPublicLayout,
  envSiteLanguage,
  envThemePref,
  languageFilterMode,
  publicLayout,
  siteLanguage,
  siteName,
  tagline,
  themePref,
  visitorTheme,
} from "./site.ts";
import { customDir } from "./customFonts.ts";
import { catalogList, cleanFontSlots, readFontSlots, slotsAreSystem } from "./fonts.ts";
import {
  detectHadithFolder,
  detectTagsFolder,
  detectTemplatesFolder,
  listImageAttachments,
  publishedCounts,
  resolveImageRef,
  tags,
} from "./indexer.ts";
import { getVaultRoot, normalizeRel, safeAbs, VaultError } from "./vault.ts";
import { isImagePath } from "../shared/attachments.ts";

const SETTINGS_FILE = "settings.json";
const VALUE_MAX = 500; // same budget as a frontmatter banner value

// Per-key budgets (spec'd tighter than the generic VALUE_MAX).
const SITE_NAME_MAX = 80;
const TAGLINE_MAX = 160;
const FOOTER_MAX = 200;
const LOCALE_MAX = 35; // BCP47 tags are short; RFC 5646 recommends ≤ 35
const TAG_MAX = 50;
const TAGS_MAX = 200;
const FOLDER_MAX = 180; // attachments.folder — a vault-relative directory
const AUTHOR_SITES_MAX = 6;      // cards, not a blogroll
const AUTHOR_SITE_URL_MAX = 300;
const AUTHOR_SITE_TITLE_MAX = 80; // same budget as siteName

/** Why a public-folder row was refused, as the tail of the 400. Named per
 *  FIELD rather than as one "malformed row" sentence: the editor has four
 *  inputs per row and the owner has to be told which one to fix. */
const LIBRARY_PROBLEMS: Record<LibraryRowError, string> = {
  notObject: "is not an object",
  title: "has no title",
  titleLength: "has a title that is too long",
  slug: "has an address that is not a slug (lowercase letters, digits and hyphens)",
  folder: "names no vault folder",
  kind: "has a kind that is not book, course or series",
  blurbLength: "has a blurb that is too long",
  sourceLength: "has a source that is too long",
};

const LIBRARY_ROOT_PROBLEMS: Record<LibraryRootProblem, string> = {
  notObject: "is not an object",
  vault: "names the vault itself — a root has to be a folder inside it",
  folder: "names no vault folder",
  kind: "has a kind that is not book, course or series",
};

const FOLDER_PROBLEMS: Record<PublicFolderProblem, string> = {
  slug: `needs a slug of lowercase letters, digits and hyphens (≤ ${FOLDER_SLUG_MAX} characters) — it is the /folder/<slug> URL`,
  title: `needs a title (≤ ${FOLDER_TITLE_MAX} characters)`,
  icon: "names an icon that is not in the folder glyph set",
  description: `has a description that is too long (${FOLDER_DESC_MAX} characters max)`,
};

/** Why a folder value was refused, as the tail of the 400 message. */
const FOLDER_PROBLEM: Record<FolderProblem, string> = {
  traversal: "must stay inside the vault (no “..” segments)",
  absolute: "must be a vault-relative folder, not an absolute path",
  dotfolder: "must not be a dot-folder (those are invisible to the vault)",
  control: "must not contain control characters",
  tooLong: `is too long (${FOLDER_MAX} characters max)`,
};

/** The built-in themes. NOT a copy of the client's list — the same list:
 *  `shared/themes.ts` is the single definition both sides validate against,
 *  because at twenty-one ids a hand-kept mirror means the panel offers a theme
 *  the PATCH answers 400 to. */
const THEMES = new Set<string>(THEME_IDS);

/** A theme id this file may STORE: one of the built-ins, or a well-formed
 *  `custom:<name>`. Shape only — whether the custom theme still exists is
 *  asked on the PATCH path (which can afford the read) and again by /api/me,
 *  never on this read path, which must never throw and never touch a second
 *  file. A stored id whose theme was deleted then behaves exactly like a
 *  deleted built-in would: the client falls back to its own default. */
function isStoredTheme(value: string): boolean {
  return THEMES.has(value) || isCustomThemeId(value);
}

/** A default-theme PREFERENCE this file may store: a theme id (pin it), or
 *  the word "follow" — which is not a theme at all but "serve whatever the
 *  admin's editor is wearing", read from `adminTheme`. Shape only, same
 *  contract as isStoredTheme above. */
function isStoredThemePref(value: string): boolean {
  return value === FOLLOW_THEME || isStoredTheme(value);
}

/** Vault-image extensions a favicon/logo may carry (what /api/upload can
 *  produce, plus .ico for hand-placed favicons). */

// mtime-checked cache: external edits to settings.json (hand edits, another
// process) are picked up without a restart, but the common case is one cheap
// stat per read.
let cache: { raw: Record<string, unknown>; mtimeMs: number } | null = null;

function settingsPath(): string {
  return path.join(dataDir(), SETTINGS_FILE);
}

/** The parsed file as-is (unknown keys included), {} when absent/corrupt. */
function readRaw(): Record<string, unknown> {
  const file = settingsPath();
  let mtimeMs = -1;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    cache = { raw: {}, mtimeMs };
    return cache.raw;
  }
  if (cache && cache.mtimeMs === mtimeMs) return cache.raw;
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      raw = parsed as Record<string, unknown>;
    } else {
      console.warn("astrolabe: settings.json is not a JSON object — ignoring it (env defaults in effect)");
    }
  } catch (err) {
    console.warn("astrolabe: settings.json unreadable — ignoring it (env defaults in effect):", err);
  }
  cache = { raw, mtimeMs };
  return raw;
}

/** A settings string value: single-line, control-chars stripped, capped. */
function cleanValue(value: string, key: string, max = VALUE_MAX): string | null {
  const clean = value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (clean.length > max) {
    throw new VaultError(400, `Settings value "${key}" too long (${max} characters max)`);
  }
  return clean === "" ? null : clean;
}

/** True when a value looks like a valid BCP47 tag (Intl-canonicalizable). */
function isValidLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length > 0;
  } catch {
    return false;
  }
}

/** A vault-relative image path (favicon/logo): safe, non-markdown, image ext.
 *  Throws 400 with the offending key on anything else. */
function cleanVaultImage(value: string, key: string): string | null {
  const clean = cleanValue(value, key);
  if (clean === null) return null;
  let rel: string;
  try {
    rel = normalizeRel(clean);
    safeAbs(rel); // traversal / ignored-dir rejection
  } catch {
    throw new VaultError(400, `Settings value "${key}" is not a valid vault path`);
  }
  if (rel === "" || !isImagePath(rel)) {
    throw new VaultError(
      400,
      `Settings value "${key}" must be a vault image path (ico, png, svg, jpeg, gif, webp, avif, bmp)`,
    );
  }
  return rel;
}

/** An image reference that may travel to visitors' browsers (logo,
 *  home.banner): an https URL passes through; any other scheme (http:,
 *  javascript:, data:, …) is a clear 400 rather than falling through to
 *  path normalization (which would mangle "http://x/y.png" into a broken
 *  vault path); everything else must be a safe vault image path. */
function cleanImageRef(value: string, key: string): string | null {
  const clean = cleanValue(value, key);
  if (clean === null) return null;
  if (/^https:\/\//i.test(clean)) return clean;
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean)) {
    throw new VaultError(400, `Settings value "${key}" must be an https:// URL or a vault image path`);
  }
  return cleanVaultImage(clean, key);
}

/** One exclude tag: leading # tolerated, then a simple token (letters, digits,
 *  _ - and / for nested tags), ≤ 50 chars. Throws 400 otherwise. */
/** One authorSites entry, or null when malformed: a fetchable public http(s)
 *  URL and an optional short title. Shared by the read path (drop bad rows)
 *  and the PATCH path (refuse them out loud). */
function cleanAuthorSite(entry: unknown): AuthorSiteRef | null {
  if (entry === null || typeof entry !== "object") return null;
  const url = (entry as { url?: unknown }).url;
  const title = (entry as { title?: unknown }).title;
  if (typeof url !== "string" || url.length > AUTHOR_SITE_URL_MAX || !fetchableSiteUrl(url)) return null;
  const site: AuthorSiteRef = { url };
  if (typeof title === "string" && title.trim() !== "") {
    if (title.length > AUTHOR_SITE_TITLE_MAX) return null;
    site.title = title.trim();
  }
  return site;
}

function cleanTag(value: unknown): string {
  if (typeof value !== "string") {
    throw new VaultError(400, 'Settings key "excludeTags" must be an array of strings');
  }
  const tag = value.trim().replace(/^#/, "");
  if (tag === "" || tag.length > TAG_MAX || !/^[\p{L}\p{N}][\p{L}\p{N}_/-]*$/u.test(tag)) {
    throw new VaultError(
      400,
      `Settings excludeTags entry ${JSON.stringify(value)} is not a simple tag (letters/digits/_-/, ≤ ${TAG_MAX} chars)`,
    );
  }
  return tag;
}

/** A stored `languageFilter` in either shape, normalized — or null when the
 *  key is absent or unusable.
 *
 *  The BOOLEAN branch is the upgrade path, and its choice is the whole reason
 *  the enum has both "follow" and pinned values. `true` used to mean "hide
 *  every note not written in the site language", which is precisely `"ar"` or
 *  `"en"` — so that is what it becomes. It deliberately does NOT become
 *  "follow", even though "follow" is the better setting for most sites:
 *  upgrading a live site must never change what its visitors can see. The
 *  owner opts into "follow" by clicking it, having read what it will do. */
function languageFilterFrom(value: unknown, raw: Record<string, unknown>): LanguageFilterMode | null {
  if (typeof value === "string") {
    const clean = value.trim().toLowerCase();
    return (LANGUAGE_FILTER_MODES as readonly string[]).includes(clean)
      ? (clean as LanguageFilterMode)
      : null;
  }
  if (typeof value === "boolean") return value ? rawSiteLanguage(raw) : "off";
  return null;
}

/** The site language, resolved from the RAW file plus the env default —
 *  deliberately not via siteLanguage().
 *
 *  This runs INSIDE getSettings(), and siteLanguage() calls getSettings(). The
 *  first version reached for the convenient getter and the server died at boot
 *  with "Maximum call stack size exceeded" the moment it met a real pre-enum
 *  settings.json — a migration path that could only fail on the exact files it
 *  existed for. It is the same two-layer merge siteLanguage() performs (stored
 *  key over SITE_LANG), done one level down where no cycle is possible. */
function rawSiteLanguage(raw: Record<string, unknown>): "en" | "ar" {
  return raw.language === "ar" || raw.language === "en" ? raw.language : envSiteLanguage();
}

/** One-time on-disk migration of the pre-enum boolean, run at startup.
 *
 *  Read-time coercion alone would have left the boolean in the file forever,
 *  and a stored `true` resolves through `siteLanguage()` — so an owner who
 *  later switched the site's chrome to English would have found their Arabic
 *  posts swapped for their English ones by a setting they had not touched.
 *  Freezing it at the language it means TODAY is the only stable reading.
 *  Idempotent, and silent unless it actually rewrote something. */
export function migrateSettings(): void {
  const raw = readRaw();
  if (typeof raw.languageFilter !== "boolean") return;
  const wasOn = raw.languageFilter;
  const mode = wasOn ? rawSiteLanguage(raw) : "off";
  console.log(
    `  migrated settings.languageFilter: ${String(wasOn)} → "${mode}" ` +
      (wasOn
        ? "(the language it already meant — visitors see exactly what they saw)"
        : "(it was off and stays off)"),
  );
  persist({ ...raw, languageFilter: mode });
}

/** The validated, client-facing view of the file (unknown keys dropped,
 *  malformed values dropped silently — reads never throw). */
export function getSettings(): SettingsData {
  const raw = readRaw();
  const out: SettingsData = {};
  const str = (key: "siteName" | "tagline" | "footer" | "blogLocale" | "logo" | "favicon", max: number): void => {
    const v = raw[key];
    if (typeof v === "string" && v.trim() !== "" && v.trim().length <= max) out[key] = v.trim();
  };
  str("siteName", SITE_NAME_MAX);
  str("tagline", TAGLINE_MAX);
  str("footer", FOOTER_MAX);
  // "follow" is a legal value here, not a theme id: it means "serve
  // adminTheme" (shared/themes.ts). Both live in this file and neither
  // overwrites the other — see the adminTheme note below.
  if (typeof raw.defaultTheme === "string" && isStoredThemePref(raw.defaultTheme)) {
    out.defaultTheme = raw.defaultTheme;
  }
  // The mirrored editor theme. Always a theme id (never "follow"): it is a
  // FACT about the admin's browser, not a policy, and it is kept even while a
  // pin is in force so that going back to following restores the right room
  // instead of the built-in default.
  if (typeof raw.adminTheme === "string" && isStoredTheme(raw.adminTheme)) {
    out.adminTheme = raw.adminTheme;
  }
  if (raw.publicLayout === "app" || raw.publicLayout === "blog" || raw.publicLayout === "designed") {
    out.publicLayout = raw.publicLayout;
  }
  if (typeof raw.blogLocale === "string" && raw.blogLocale.length <= LOCALE_MAX && isValidLocale(raw.blogLocale)) {
    out.blogLocale = raw.blogLocale;
  }
  if (Array.isArray(raw.excludeTags)) {
    const tags: string[] = [];
    for (const entry of raw.excludeTags) {
      try {
        tags.push(cleanTag(entry));
      } catch {
        // malformed entry — dropped on read
      }
    }
    // Presence of the key (even empty) is meaningful: it overrides EXCLUDE_TAGS.
    out.excludeTags = tags;
  }
  if (Array.isArray(raw.authorSites)) {
    const sites: AuthorSiteRef[] = [];
    for (const entry of raw.authorSites) {
      const site = cleanAuthorSite(entry);
      if (site !== null && sites.length < AUTHOR_SITES_MAX) sites.push(site);
    }
    if (sites.length > 0) out.authorSites = sites;
  }
  if (raw.language === "en" || raw.language === "ar") out.language = raw.language;
  {
    // Enum since 1.3, boolean before it. A stored boolean is COERCED on read
    // as well as rewritten on disk at startup (migrateSettings), so a file
    // this process has not migrated yet — one hand-edited, or restored from a
    // backup while the server ran — still behaves, and behaves the same way.
    const mode = languageFilterFrom(raw.languageFilter, raw);
    if (mode !== null) out.languageFilter = mode;
  }
  if (typeof raw.languageToggle === "boolean") out.languageToggle = raw.languageToggle;
  if (raw.topics === "tags" || raw.topics === "folders") out.topics = raw.topics;
  if (typeof raw.commentsEnabled === "boolean") out.commentsEnabled = raw.commentsEnabled;
  if (typeof raw.noteVersions === "boolean") out.noteVersions = raw.noteVersions;
  if (typeof raw.shareButtons === "boolean") out.shareButtons = raw.shareButtons;
  if (typeof raw.ambient === "boolean") out.ambient = raw.ambient;
  if (typeof raw.pdfSearch === "boolean") out.pdfSearch = raw.pdfSearch;
  str("favicon", VALUE_MAX);
  str("logo", VALUE_MAX);
  // ── Attachments ──────────────────────────────────────────────────────────
  const attachments = raw.attachments;
  if (typeof attachments === "object" && attachments !== null && !Array.isArray(attachments)) {
    const a = attachments as Record<string, unknown>;
    const as: AttachmentSettings = {};
    if (isAttachmentMode(a.mode)) as.mode = a.mode;
    if (typeof a.folder === "string") {
      const folder = normalizeFolder(a.folder);
      if (folder !== "" && folderError(folder) === null) as.folder = folder;
    }
    if (Object.keys(as).length > 0) out.attachments = as;
  }
  // ── Templates ────────────────────────────────────────────────────────────
  if (typeof raw.templatesFolder === "string" && raw.templatesFolder.trim() !== "") {
    out.templatesFolder = raw.templatesFolder.trim();
  }
  if (typeof raw.hadithFolder === "string" && raw.hadithFolder.trim() !== "") {
    out.hadithFolder = raw.hadithFolder.trim();
  }
  if (typeof raw.drawingsFolder === "string" && raw.drawingsFolder.trim() !== "") {
    out.drawingsFolder = raw.drawingsFolder.trim();
  }
  if (typeof raw.defaultTemplate === "string" && raw.defaultTemplate.trim() !== "") {
    out.defaultTemplate = raw.defaultTemplate.trim();
  }
  for (const key of ["dailyFolder", "dailyFormat", "dailyTemplate", "weeklyFormat", "weeklyTemplate", "monthlyFormat", "monthlyTemplate", "yearlyFormat", "yearlyTemplate", "uniqueFolder", "uniqueFormat", "captureInbox"] as const) {
    const v = raw[key];
    // The weekly, monthly and yearly formats keep an EMPTY string: it means
    // "that kind of note is off".
    if (typeof v === "string" && (v.trim() !== "" || OFFABLE_FORMATS.has(key))) out[key] = v.trim();
  }
  const launch = parseLaunch(raw.launch);
  if (launch !== null && launch !== DEFAULT_LAUNCH) out.launch = launch;
  // ── Voice notes ──────────────────────────────────────────────────────────
  const voice = raw.voice;
  if (typeof voice === "object" && voice !== null && !Array.isArray(voice)) {
    const v = voice as Record<string, unknown>;
    const vs: VoiceSettings = {};
    if (isVoiceModelSetting(v.model)) vs.model = v.model;
    if (isVoiceLanguage(v.language)) vs.language = v.language;
    if (typeof v.keepAudio === "boolean") vs.keepAudio = v.keepAudio;
    if (Object.keys(vs).length > 0) out.voice = vs;
  }
  // ── Feeds ────────────────────────────────────────────────────────────────
  const feeds = raw.feeds;
  if (typeof feeds === "object" && feeds !== null && !Array.isArray(feeds)) {
    const f = feeds as Record<string, unknown>;
    const fs: FeedsSettings = {};
    if (typeof f.fetch === "boolean") fs.fetch = f.fetch;
    if (typeof f.note === "string" && f.note.trim() !== "" && isNotePath(f.note.trim())) fs.note = f.note.trim();
    if (Object.keys(fs).length > 0) out.feeds = fs;
  }
  // ── Read aloud ───────────────────────────────────────────────────────────
  const speak = raw.speak;
  if (typeof speak === "object" && speak !== null && !Array.isArray(speak)) {
    const v = speak as Record<string, unknown>;
    const ss: SpeakSettings = {};
    if (isSpeakEngine(v.engine)) ss.engine = v.engine;
    if (typeof v.rate === "number" && SPEAK_RATES.includes(v.rate)) ss.rate = v.rate;
    if (typeof v.voices === "object" && v.voices !== null && !Array.isArray(v.voices)) {
      const voices: SpeakSettings["voices"] = {};
      for (const [lang, voice] of Object.entries(v.voices as Record<string, unknown>)) {
        if (isSpeakLang(lang) && isVoiceOf(lang, voice)) voices[lang] = voice as string;
      }
      if (Object.keys(voices).length > 0) ss.voices = voices;
    }
    if (v.public === true) ss.public = true;
    if (Object.keys(ss).length > 0) out.speak = ss;
  }
  // ── Webmentions and the fediverse ────────────────────────────────────────
  const wm = raw.webmentions;
  if (typeof wm === "object" && wm !== null && !Array.isArray(wm)) {
    const w = wm as Record<string, unknown>;
    const ws: WebmentionsSettings = {};
    if (typeof w.accept === "boolean") ws.accept = w.accept;
    if (typeof w.send === "boolean") ws.send = w.send;
    if (Object.keys(ws).length > 0) out.webmentions = ws;
  }
  const fedi = raw.fediverse;
  if (typeof fedi === "object" && fedi !== null && !Array.isArray(fedi)) {
    const f = fedi as Record<string, unknown>;
    const fs: FediverseSettings = {};
    if (typeof f.enabled === "boolean") fs.enabled = f.enabled;
    if (typeof f.handle === "string" && isFediverseHandle(f.handle)) fs.handle = f.handle;
    if (Object.keys(fs).length > 0) out.fediverse = fs;
  }
  const home = raw.home;
  if (typeof home === "object" && home !== null && !Array.isArray(home)) {
    const h = home as Record<string, unknown>;
    const hs: HomeSettings = {};
    if (h.mode === "note" || h.mode === "dashboard") hs.mode = h.mode;
    if (typeof h.note === "string" && h.note.trim() !== "") hs.note = h.note.trim();
    if (typeof h.banner === "string" && h.banner.trim() !== "") hs.banner = h.banner.trim();
    if (Object.keys(hs).length > 0) out.home = hs;
  }
  // ── Public folders ───────────────────────────────────────────────────────
  // Sub-object, read like `attachments` above: each sub-key on its own, a
  // malformed one simply absent. The LIST drops bad rows in silence rather
  // than losing the whole key with them — twelve folders is a page of the
  // owner's site, and one row naming a glyph this build does not have must not
  // take the other eleven off the air.
  const publicFolders = raw.publicFolders;
  if (typeof publicFolders === "object" && publicFolders !== null && !Array.isArray(publicFolders)) {
    const p = publicFolders as Record<string, unknown>;
    const pf: PublicFoldersSettings = {};
    if (typeof p.enabled === "boolean") pf.enabled = p.enabled;
    if (typeof p.nav === "boolean") pf.nav = p.nav;
    if (typeof p.home === "boolean") pf.home = p.home;
    if (Array.isArray(p.folders)) {
      const list: PublicFolderRef[] = [];
      const seen = new Set<string>();
      for (const entry of p.folders) {
        if (list.length >= PUBLIC_FOLDERS_MAX) break;
        const folder = cleanPublicFolder(entry, folderId);
        // A duplicate slug is dropped rather than kept: two rows answering the
        // same URL is a page that renders one of them at random.
        if (folder === null || seen.has(folder.slug)) continue;
        seen.add(folder.slug);
        list.push(folder);
      }
      if (list.length > 0) pf.folders = list;
    }
    if (Object.keys(pf).length > 0) out.publicFolders = pf;
  }
  // The library, on the publicFolders terms: a bad row drops rather than
  // taking the shelf down with it.
  const library = raw.library;
  if (typeof library === "object" && library !== null && !Array.isArray(library)) {
    const l = library as Record<string, unknown>;
    const lib: LibrarySettings = {};
    if (typeof l.enabled === "boolean") lib.enabled = l.enabled;
    if (typeof l.nav === "boolean") lib.nav = l.nav;
    if (typeof l.home === "boolean") lib.home = l.home;
    if (typeof l.title === "string" && l.title.trim() !== "" && l.title.trim().length <= LIBRARY_SITE_TITLE_MAX) {
      lib.title = l.title.trim();
    }
    if (Array.isArray(l.roots)) {
      const list: LibraryRoot[] = [];
      const folders = new Set<string>();
      for (const entry of l.roots) {
        if (list.length >= LIBRARY_ROOTS_MAX) break;
        const root = cleanLibraryRoot(entry, libraryPathId);
        if (root === null || folders.has(root.folder)) continue;
        folders.add(root.folder);
        list.push(root);
      }
      if (list.length > 0) lib.roots = list;
    }
    if (Array.isArray(l.paths)) {
      const list: LibraryPathRef[] = [];
      const seen = new Set<string>();
      for (const entry of l.paths) {
        if (list.length >= LIBRARY_PATHS_MAX) break;
        const path = cleanLibraryPath(entry, libraryPathId);
        if (path === null || seen.has(path.slug)) continue;
        seen.add(path.slug);
        list.push(path);
      }
      if (list.length > 0) lib.paths = list;
    }
    if (Object.keys(lib).length > 0) out.library = lib;
  }
  // Backup & sync (gitSync.ts validates; malformed values drop on read).
  const gitSync = readGitSyncSettings(raw.gitSync);
  if (gitSync) out.gitSync = gitSync;
  const ask = readAskSettings(raw.ask);
  if (ask) out.ask = ask;
  // Typography (fonts.ts validates; an unknown/wrongly-slotted id reads back
  // as "system" rather than throwing — reads never fail).
  if (raw.fonts !== undefined) {
    const fonts = readFontSlots(raw.fonts);
    if (!slotsAreSystem(fonts)) out.fonts = fonts;
  }
  // ── Localization: calendar, note layout, tag labels ──────────────────────
  // Reads never throw: a hand-edited settings.json naming a calendar nobody
  // implemented falls back to the default rather than taking the instance
  // down, exactly like an unknown theme id above.
  if (isDateCalendar(raw.dateCalendar)) out.dateCalendar = raw.dateCalendar;
  if (isDateOrder(raw.dateOrder)) out.dateOrder = raw.dateOrder;
  if (isDateSeparator(raw.dateSeparator)) out.dateSeparator = raw.dateSeparator;
  if (isTextDirection(raw.textDirection)) out.textDirection = raw.textDirection;
  if (isTextAlign(raw.textAlign)) out.textAlign = raw.textAlign;
  if (typeof raw.emptyPropsCard === "boolean") out.emptyPropsCard = raw.emptyPropsCard;
  if (typeof raw.tagsFolder === "string" && raw.tagsFolder.trim() !== "") {
    out.tagsFolder = raw.tagsFolder.trim();
  }
  if (raw.tagLabels !== undefined) {
    const labels = cleanTagLabels(raw.tagLabels);
    if (Object.keys(labels).length > 0) out.tagLabels = labels;
  }
  // Folder glyphs. Invalid rows are dropped rather than fatal for the reason
  // every read in this function is: a hand-edited file naming a glyph this
  // build does not have costs that one folder its mark, not the instance its
  // sidebar.
  if (raw.folderIcons !== undefined) {
    const icons = cleanFolderIcons(raw.folderIcons);
    if (Object.keys(icons).length > 0) out.folderIcons = icons;
  }
  return out;
}

/** The calendar every human-facing date on this instance is printed in.
 *  No env counterpart, for the same reason `languageToggle` has none: it is a
 *  runtime editorial decision whose default ("gregorian") is the one that
 *  changes nothing. */
export function dateCalendar(): DateCalendar {
  return getSettings().dateCalendar ?? DEFAULT_DATE_CALENDAR;
}

export function dateOrder(): DateOrder {
  return getSettings().dateOrder ?? DEFAULT_DATE_ORDER;
}

export function dateSeparator(): DateSeparator {
  return getSettings().dateSeparator ?? DEFAULT_DATE_SEPARATOR;
}

/** The SITE default direction/alignment for note prose. A note's own
 *  frontmatter `dir:`/`align:` beats both, and the client resolves that pair —
 *  the server only says what the site asked for. */
export function textDirection(): TextDirection {
  return getSettings().textDirection ?? DEFAULT_TEXT_DIRECTION;
}

export function textAlign(): TextAlign {
  return getSettings().textAlign ?? DEFAULT_TEXT_ALIGN;
}

/** The properties card on a note with no frontmatter: on unless turned off. */
export function emptyPropsCard(): boolean {
  return getSettings().emptyPropsCard ?? true;
}

/** The typography slots in effect (every slot present, "system" when unset).
 *  No env counterpart: a webfont choice is a runtime editorial decision, and
 *  its default — the built-in system stacks — is the "nothing is fetched,
 *  nothing is served" one. */
export function fontSlots(): FontSlotsEffective {
  return readFontSlots(readRaw().fonts);
}

/** The merged values the site is using right now: stored value when set, env
 *  default otherwise. This is what the settings panel prefills from. */
export function effectiveSettings(): EffectiveSettings {
  const s = getSettings();
  return {
    // site.ts getters already merge settings over env — reuse them so this
    // can never drift from what the routes actually serve.
    siteName: siteName(),
    tagline: tagline(),
    footer: footerTemplate(),
    // The PREFERENCE ("follow" or a pinned id) and, beside it, what that
    // actually serves a cookieless visitor right now — the panel prints the
    // second one, because "follow" alone tells an owner nothing about what
    // their readers are looking at.
    defaultTheme: themePref(),
    visitorTheme: visitorTheme(),
    publicLayout: publicLayout(),
    blogLocale: blogLocale(),
    language: siteLanguage(),
    languageFilter: languageFilterMode(),
    // No env counterpart: a visitor-facing switch is a runtime editorial
    // choice, and its default (off) is the "nothing changes" one.
    languageToggle: s.languageToggle ?? false,
    // Where the categories come from: tags unless the owner chose the
    // vault's folders (shared/types.ts TopicsMode).
    topics: s.topics === "folders" ? "folders" : "tags",
    excludeTags: [...excludedTags()],
    authorSites: (s.authorSites ?? []).map((site) => ({ ...site })),
    commentsEnabled: commentsEnabled(),
    noteVersions: noteVersionsEnabled(),
    shareButtons: s.shareButtons ?? true,
    // Decoration defaults OFF, unlike the share row above: a site that has
    // never heard of this feature must not start moving on upgrade.
    ambient: s.ambient ?? false,
    pdfSearch: pdfSearchEnabled(),
    favicon: s.favicon ?? null,
    logo: s.logo ?? null,
    // Always resolved: what the next upload will actually do.
    attachments: attachmentLocation(),
    templatesFolder: templatesFolder(),
    templatesFolderDetected: s.templatesFolder === undefined && templatesFolder() !== null,
    hadithFolder: hadithFolder(),
    hadithFolderDetected: s.hadithFolder === undefined && hadithFolder() !== null,
    drawingsFolder: drawingsFolder(),
    defaultTemplate: defaultTemplate(),
    dailyFolder: dailyFolder(),
    dailyFormat: s.dailyFormat ?? DAILY_FORMAT_DEFAULT,
    dailyTemplate: periodicTemplate(s.dailyTemplate),
    weeklyFormat: offableFormat(s.weeklyFormat, WEEKLY_FORMAT_DEFAULT),
    weeklyTemplate: periodicTemplate(s.weeklyTemplate),
    monthlyFormat: offableFormat(s.monthlyFormat, MONTHLY_FORMAT_DEFAULT),
    monthlyTemplate: periodicTemplate(s.monthlyTemplate),
    yearlyFormat: offableFormat(s.yearlyFormat, YEARLY_FORMAT_DEFAULT),
    yearlyTemplate: periodicTemplate(s.yearlyTemplate),
    launch: s.launch ?? DEFAULT_LAUNCH,
    uniqueFolder: uniqueFolder(),
    uniqueFormat: s.uniqueFormat ?? UNIQUE_FORMAT_DEFAULT,
    // The capture inbox is a note path on the daily template's terms: a
    // stored value that no longer names a note inside the vault reads as
    // unset, so the sheet offers today's note alone rather than a dead door.
    captureInbox: periodicTemplate(s.captureInbox),
    voice: voiceEffective(s.voice),
    // Feeds are fetched only when the owner says so: off unless set.
    feeds: feedsEffective(),
    speak: speakEffective(s.speak),
    // Webmentions and the fediverse: network access both ways, so off
    // unless the owner says so (docs/webmentions.md).
    webmentions: webmentionsEffective(),
    fediverse: fediverseEffective(),
    home: {
      mode: s.home?.mode ?? "note",
      ...(s.home?.note ?? envHomeNote() ? { note: s.home?.note ?? envHomeNote() ?? undefined } : {}),
      ...(s.home?.banner ? { banner: s.home.banner } : {}),
    },
    // Every default filled in. `home` defaults to TRUE (the band is the
    // discovery surface); the other two default to off, so an instance that
    // never touched this key reads back as "the feature is not on".
    publicFolders: {
      enabled: s.publicFolders?.enabled ?? false,
      nav: s.publicFolders?.nav ?? false,
      home: s.publicFolders?.home ?? true,
      folders: (s.publicFolders?.folders ?? []).map((folder) => ({ ...folder })),
    },
    // The library: the door is on by default once the feature is, the home
    // band is off by default — the blog stays the blog.
    library: {
      enabled: s.library?.enabled ?? false,
      nav: s.library?.nav ?? true,
      home: s.library?.home ?? false,
      title: s.library?.title ?? "",
      roots: (s.library?.roots ?? []).map((root) => ({ ...root })),
      paths: (s.library?.paths ?? []).map((path) => ({ ...path })),
    },
    // The stored token is never part of this: gitSyncEffective() answers
    // `tokenSet` (and the non-secret username) and nothing more.
    gitSync: gitSyncEffective(),
    // Likewise `keySet`, never the Anthropic key.
    ask: askEffective(),
    fonts: fontSlots(),
    // Localization. `tagLabels` is the STORED map only — the tag pages' own
    // labels are merged in by server/tagLabels.ts at read time and must never
    // be folded in here: the settings editor writes this key back whole, and
    // a prefill carrying a label the vault owns would copy that label into
    // settings.json the first time the panel is saved.
    dateCalendar: dateCalendar(),
    dateOrder: dateOrder(),
    dateSeparator: dateSeparator(),
    textDirection: textDirection(),
    textAlign: textAlign(),
    emptyPropsCard: emptyPropsCard(),
    tagsFolder: tagsFolder(),
    tagsFolderDetected: s.tagsFolder === undefined && detectTagsFolder() !== null,
    tagLabels: s.tagLabels ?? {},
    folderIcons: s.folderIcons ?? {},
  };
}

/** What each "Inherit" would land on — the value a row takes with its own
 *  stored key ABSENT and every other key left as it is. Not `effective`: that
 *  is the stored value whenever one is stored, and a panel that predicts an
 *  empty field with the value the field currently holds predicts nothing.
 *  The owner of an instance with `language: "ar"` saved and no SITE_LANG was
 *  shown "Inherit (ar)" — and would have got an English site by picking it. */
export function inheritedSettings(): InheritedSettings {
  return {
    language: envSiteLanguage(),
    languageFilter: envLanguageFilterMode(),
    publicLayout: envPublicLayout(),
    defaultTheme: envThemePref(),
    homeMode: "note",
    attachmentsMode: "specified",
    // Four rows with no env counterpart: their "inherit" is the built-in
    // default, and it is spelled here rather than in the panel so the panel
    // never has to know which rows have a variable behind them.
    languageToggle: false,
    commentsEnabled: envCommentsEnabled(),
    noteVersions: envNoteVersions(),
    shareButtons: true,
    ambient: false,
    pdfSearch: envPdfSearch(),
  };
}

/** Live merge: settings.noteVersions when set, else NOTE_VERSIONS. Read by
 *  the version store at EVERY write (server/versions.ts), so switching it in
 *  the panel takes effect on the next save with no restart. */
export function noteVersionsEnabled(): boolean {
  return getSettings().noteVersions ?? envNoteVersions();
}

/** GET/PATCH /api/settings payload: stored keys + the effective merge + what
 *  each empty field would inherit (plus the typography catalog the panel's
 *  selects are built from). */
export function settingsResponse(): SettingsResponse {
  return {
    ...getSettings(),
    effective: effectiveSettings(),
    inherited: inheritedSettings(),
    fontCatalog: catalogList(),
    about: aboutInfo(),
  };
}

/** package.json's version, read once. The file sits next to server/ in every
 *  layout this ships in (clone-and-run, no bundling on the server side). */
export const VERSION = ((): string => {
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const parsed: unknown = JSON.parse(raw);
    const value = (parsed as { version?: unknown }).version;
    return typeof value === "string" ? value : "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

/** The instance's own facts for the settings panel's About tab. Admin-only by
 *  construction — it rides GET /api/settings, which is 404 to visitors — which
 *  is why it is allowed to name absolute paths on the operator's disk. */
export function aboutInfo(): AboutInfo {
  const counts = publishedCounts();
  return {
    version: VERSION,
    node: process.version,
    vaultPath: getVaultRoot(),
    dataPath: dataDir(),
    settingsPath: settingsPath(),
    customFontsPath: customDir(),
    notes: counts.total,
    published: counts.notes,
    attachments: listImageAttachments().length,
    tags: tags(false, null).length,
  };
}

/** Vault-relative attachment paths named by settings (home banner, logo,
 *  favicon) — /api/file lets visitors fetch exactly these beyond the
 *  published-note allowlist, since the public shell must render them for
 *  everyone. (The favicon also rides /favicon.ico, but the panel preview
 *  and the shell fetch it via /api/file too.) */
export function settingsAssetPaths(): Set<string> {
  const out = new Set<string>();
  const s = getSettings();
  for (const value of [s.home?.banner, s.logo, s.favicon]) {
    if (!value || /^[a-z][a-z0-9+.-]*:/i.test(value)) continue; // URLs serve themselves
    try {
      out.add(normalizeRel(value));
    } catch {
      // malformed path — nothing to allow
    }
    // The value as WRITTEN and the file it RESOLVES to are two different
    // paths whenever the admin typed a bare filename ("mark.svg" for
    // "brand/mark.svg") — the same ladder every note banner climbs
    // (indexer.ts resolveImageRef). Allowlisting only the literal string is
    // how a logo the admin can see in the panel 404s for every visitor.
    const resolved = resolveImageRef(value);
    if (resolved !== null && !/^https:/i.test(resolved)) out.add(resolved);
  }
  return out;
}

// ── Templates ───────────────────────────────────────────────────────────────

/** The templates folder in force: the stored setting, else the unambiguous
 *  auto-detection (indexer.ts). Null when neither answers — and null is a
 *  real answer: the two template commands then say the folder is unset
 *  rather than offering an empty picker. */
export function templatesFolder(): string | null {
  const stored = getSettings().templatesFolder;
  if (stored) {
    try {
      const rel = normalizeRel(stored);
      safeAbs(rel);
      return rel === "" ? null : rel;
    } catch {
      return null; // stored garbage — fall back to nothing, never to a guess
    }
  }
  return detectTemplatesFolder();
}

/** The hadith corpus folder: the stored value when set, else the indexer's
 *  auto-detection, else null — `templatesFolder()`'s rule exactly, because it
 *  is the same promise (a folder the vault already names should just work,
 *  and a guess between two candidates would answer a callout from the wrong
 *  book). Null means `> [!hadith]` callouts all fall back to plain quotes. */
export function hadithFolder(): string | null {
  const stored = getSettings().hadithFolder;
  if (stored) {
    try {
      const rel = normalizeRel(stored);
      safeAbs(rel);
      return rel === "" ? null : rel;
    } catch {
      return null;
    }
  }
  return detectHadithFolder();
}

/** Where the sidebar's pencil starts a drawing: the stored folder, or null
 *  for the vault root. No auto-detection — a drawing is filed where the owner
 *  said, and "nowhere in particular" is the root. */
export function drawingsFolder(): string | null {
  const stored = getSettings().drawingsFolder;
  if (!stored) return null;
  try {
    const rel = normalizeRel(stored);
    safeAbs(rel);
    return rel === "" ? null : rel;
  } catch {
    return null;
  }
}

/** Where this instance's tag pages live: the stored setting, else the
 *  unambiguous auto-detection, else the documented `tags` default.
 *
 *  It resolves like `templatesFolder()` above and it sits here, beside it,
 *  rather than in `server/tagLabels.ts` where the first version of it lived —
 *  the two fields answer the same question about the same vault and a reader
 *  comparing them should not have to read two files to learn that only one of
 *  them looks. Unlike templates this one never answers null: an unlabelled
 *  chip is a correct chip, so falling back to the documented folder name costs
 *  nothing, while a null templates folder has to make the picker say so. */
export function tagsFolder(): string {
  const stored = getSettings().tagsFolder;
  if (stored) {
    try {
      const rel = normalizeRel(stored);
      safeAbs(rel);
      if (rel !== "") return rel;
    } catch {
      // stored garbage — fall through to detection, never to a crash
    }
  }
  return detectTagsFolder() ?? DEFAULT_TAGS_FOLDER;
}

/** The daily note's folder: the stored value, cleaned, else `daily`. The
 *  vault root is spelled "" or "/" and means the root. */
export function dailyFolder(): string {
  const stored = getSettings().dailyFolder;
  if (stored === undefined) return DAILY_FOLDER_DEFAULT;
  if (stored === "" || stored === "/") return "";
  try {
    const rel = normalizeRel(stored);
    safeAbs(rel);
    return rel;
  } catch {
    return DAILY_FOLDER_DEFAULT;
  }
}

/** The format keys that may hold an empty string meaning "off". The daily
 *  format is not one: there is no daily-notes-off, only a different name. */
const OFFABLE_FORMATS: ReadonlySet<string> = new Set(["weeklyFormat", "monthlyFormat", "yearlyFormat"]);

/** A weekly/monthly/yearly format in force: the default when unset, null
 *  when the owner turned that kind off (stored as ""). */
function offableFormat(stored: string | undefined, fallback: string): string | null {
  return stored === undefined ? fallback : stored === "" ? null : stored;
}

/** Where "New unique note" files its notes: the vault root unless a folder
 *  is set — the daily folder's rule, with the root as the default instead of
 *  `daily`, because a Zettelkasten-style stamp is a name for a note that has
 *  no home yet. */
/** The feeds key in force (shared/feeds.ts): fetching off unless set, the
 *  list in `Feeds.md` unless another note is named. */
export function feedsEffective(): FeedsEffective {
  const f = getSettings().feeds;
  return { fetch: f?.fetch === true, note: f?.note ?? FEEDS_NOTE_DEFAULT };
}

/** The webmentions key in force: accepting and sending both off unless set. */
export function webmentionsEffective(): WebmentionsEffective {
  const w = getSettings().webmentions;
  return { accept: w?.accept === true, send: w?.send === true };
}

/** The fediverse key in force: off unless set; the handle the owner chose,
 *  else the site name folded to a handle (shared/fediverse.ts). */
export function fediverseEffective(): FediverseEffective {
  const f = getSettings().fediverse;
  return { enabled: f?.enabled === true, handle: f?.handle ?? defaultFediverseHandle(siteName()) };
}

export function uniqueFolder(): string {
  const stored = getSettings().uniqueFolder;
  if (stored === undefined || stored === "" || stored === "/") return "";
  try {
    const rel = normalizeRel(stored);
    safeAbs(rel);
    return rel;
  } catch {
    return "";
  }
}

function periodicTemplate(stored: string | undefined): string | null {
  if (!stored) return null;
  try {
    const rel = normalizeRel(stored);
    safeAbs(rel);
    return isNotePath(rel) ? rel : null;
  } catch {
    return null;
  }
}

/** The template applied to new notes, or null (the default). */
export function defaultTemplate(): string | null {
  const stored = getSettings().defaultTemplate;
  if (!stored) return null;
  try {
    const rel = normalizeRel(stored);
    safeAbs(rel);
    return isNotePath(rel) ? rel : null;
  } catch {
    return null;
  }
}

/** The configured favicon as a safe vault-relative path, or null. */
export function faviconPath(): string | null {
  const value = getSettings().favicon;
  if (!value) return null;
  try {
    const rel = normalizeRel(value);
    safeAbs(rel);
    return rel;
  } catch {
    return null;
  }
}

type PatchHandler = (raw: Record<string, unknown>, value: unknown) => void;

/** Set raw[key] = clean(value), or delete raw[key] when the value clears
 *  (null / "" / clean() returning null). */
/** A period format must name a year and, for a day, a month and a day, or
 *  a week for the weekly one; `[literals]` and `/` are fine. The weekly
 *  format alone may be "off" (stored as ""), which turns weekly notes off. */
/** A period format, checked against the KIND of note it is for: every
 *  kind names the year; a day names the month and the day; a week names
 *  the week; a month names the month and nothing finer; a year names
 *  nothing finer than itself. A monthly format carrying `DD` would name a
 *  day, and the note it made would read back as a daily note — the format
 *  is the declaration (shared/periodic.ts), so the declaration is checked.
 *  The three optional kinds accept `off` and store "" for it. */
function periodFormat(v: string, key: string, kind: PeriodKind): string | null {
  const clean = cleanValue(v, key);
  if (clean === null) return null;
  if (kind !== "day" && /^(off|none|-)$/i.test(clean)) return "";
  if (clean === "") return null;
  if (/[\\:*?"<>|]/.test(clean) || clean.includes("..")) throw new VaultError(400, `Settings key "${key}" holds characters a file name cannot`);
  const bare = clean.replace(/\[[^\]]*\]/g, "");
  if (!/YYYY|YY/.test(bare)) throw new VaultError(400, `Settings key "${key}" must name the year (YYYY)`);
  const hasWeek = /ww|WW|w/.test(bare);
  const hasMonth = /MM|M/.test(bare);
  const hasDay = /DD|D/.test(bare);
  switch (kind) {
    case "day":
      if (!hasMonth || !hasDay) throw new VaultError(400, `Settings key "${key}" must name the month and the day (MM, DD)`);
      break;
    case "week":
      if (!hasWeek) throw new VaultError(400, `Settings key "${key}" must name the week (ww)`);
      break;
    case "month":
      if (!hasMonth || hasDay || hasWeek) throw new VaultError(400, `Settings key "${key}" must name the month (MM) and nothing finer`);
      break;
    case "year":
      if (hasMonth || hasDay || hasWeek) throw new VaultError(400, `Settings key "${key}" must name the year (YYYY) and nothing finer`);
      break;
  }
  return clean;
}

/** The unique note's name: the daily format's characters and its year, and
 *  at least one token finer than the day (the hour, the minute, the second)
 *  — a "unique" name that repeats every day is a collision waiting for the
 *  second idea of the morning. Clearing it returns the default. */
function uniqueFormat(v: string, key: string): string | null {
  const clean = cleanValue(v, key);
  if (clean === null || clean === "") return null;
  if (/[\\:*?"<>|]/.test(clean) || clean.includes("..")) throw new VaultError(400, `Settings key "${key}" holds characters a file name cannot`);
  const bare = clean.replace(/\[[^\]]*\]/g, "");
  if (!/YYYY|YY/.test(bare)) throw new VaultError(400, `Settings key "${key}" must name the year (YYYY)`);
  if (!/HH|mm|ss/.test(bare)) throw new VaultError(400, `Settings key "${key}" must name the hour, minute or second (HH, mm, ss) so two notes a day apart never share a name`);
  return clean;
}

function templateNote(v: string, key: string): string | null {
  const clean = cleanValue(v, key);
  if (clean === null) return null;
  const rel = vaultRel(clean, key);
  if (rel === "") return null;
  if (!isNotePath(rel)) throw new VaultError(400, `Settings key "${key}" must be a note path (.md, .tex or .latex)`);
  return rel;
}

function stringKey(
  key: string,
  clean: (value: string) => string | null,
): PatchHandler {
  return (raw, value) => {
    if (value === null || value === "") {
      delete raw[key];
      return;
    }
    if (typeof value !== "string") {
      throw new VaultError(400, `Settings key "${key}" must be a string or null`);
    }
    const cleaned = clean(value);
    if (cleaned === null) delete raw[key];
    else raw[key] = cleaned;
  };
}

/** A settings value that names a place INSIDE the vault → its relative path.
 *
 *  AN ABSOLUTE PATH IS REFUSED, NOT REWRITTEN. `normalizeRel()` strips a
 *  leading slash before `path.isAbsolute()` could ever see one, so
 *  `{"templatesFolder": "/etc"}` came back 200 and was stored as `etc`, and
 *  `{"defaultTemplate": "/etc/passwd.md"}` as `etc/passwd.md`. `safeAbs()`
 *  kept both inside the vault, so nothing escaped — but the admin who typed an
 *  absolute path silently got a DIFFERENT folder from the one they named,
 *  while `..`, a dotdir and a note-where-a-folder-belongs all answer with a
 *  clear 400. A path that cannot mean what it says is an error, not a hint. */
function vaultRel(clean: string, key: string): string {
  if (/^(?:[/\\]|[A-Za-z]:[/\\])/.test(clean)) {
    throw new VaultError(
      400,
      `Settings key "${key}" must be a path inside the vault, not an absolute one`,
    );
  }
  let rel: string;
  try {
    rel = normalizeRel(clean);
    safeAbs(rel); // traversal / ignored-dir rejection
  } catch {
    throw new VaultError(400, `Settings key "${key}" is not a valid vault path`);
  }
  return rel;
}

const PATCH_HANDLERS: Record<string, PatchHandler> = {
  siteName: stringKey("siteName", (v) => cleanValue(v, "siteName", SITE_NAME_MAX)),
  tagline: stringKey("tagline", (v) => cleanValue(v, "tagline", TAGLINE_MAX)),
  footer: stringKey("footer", (v) => cleanValue(v, "footer", FOOTER_MAX)),
  defaultTheme: stringKey("defaultTheme", (v) => {
    // Lowercased like `language` and `publicLayout`, and for a sharper reason
    // than symmetry: `DEFAULT_THEME` is lowercased by readEnvTheme() before it
    // is validated, so `DEFAULT_THEME=SOLAR` started the instance on solar
    // while `PATCH {"defaultTheme":"SOLAR"}` was a 400 — the same value
    // accepted through one door and refused at the other. Theme ids are a
    // closed lowercase enum, so there is one canonical form to coerce to.
    const clean = cleanValue(v, "defaultTheme")?.toLowerCase() ?? null;
    if (clean === null) return null;
    // "follow" joins the built-in ids: it is how the panel and the theme
    // picker say "unpin — visitors go back to my editor theme", and it has to
    // be storable rather than merely absent, because an instance with
    // DEFAULT_THEME set in its .env needs a way to override that pin.
    //
    // A custom theme is selectable everywhere a built-in is, and this is one
    // of those places — but only one that EXISTS. `hasThemeChoice` reads
    // designs.json, so the failure mode a bare shape check would leave (a
    // default theme naming a theme somebody deleted, and a public site quietly
    // painted in the fallback) is a 400 here instead.
    if (clean !== FOLLOW_THEME && !THEMES.has(clean) && !hasThemeChoice(clean)) {
      throw new VaultError(
        400,
        `Settings key "defaultTheme" must be "${FOLLOW_THEME}", one of: ${[...THEMES].join(", ")} — or a custom theme this instance has`,
      );
    }
    return clean;
  }),
  publicLayout: stringKey("publicLayout", (v) => {
    const clean = cleanValue(v, "publicLayout")?.toLowerCase() ?? null;
    if (clean === null) return null;
    if (clean !== "app" && clean !== "blog" && clean !== "designed") {
      throw new VaultError(400, 'Settings key "publicLayout" must be "app", "blog" or "designed"');
    }
    return clean;
  }),
  blogLocale: stringKey("blogLocale", (v) => {
    const clean = cleanValue(v, "blogLocale", LOCALE_MAX);
    if (clean === null) return null;
    if (!isValidLocale(clean)) {
      throw new VaultError(400, `Settings key "blogLocale" is not a valid BCP47 locale: ${clean}`);
    }
    return Intl.getCanonicalLocales(clean)[0];
  }),
  authorSites: (raw, value) => {
    if (value === null) {
      delete raw.authorSites;
      return;
    }
    if (!Array.isArray(value)) {
      throw new VaultError(400, 'Settings key "authorSites" must be an array of { url, title? } or null');
    }
    if (value.length > AUTHOR_SITES_MAX) {
      throw new VaultError(400, `Settings key "authorSites" holds too many sites (${AUTHOR_SITES_MAX} max)`);
    }
    const sites: AuthorSiteRef[] = [];
    for (const entry of value) {
      const site = cleanAuthorSite(entry);
      if (site === null) {
        throw new VaultError(
          400,
          `Settings authorSites entry ${JSON.stringify(entry)} is not a public http(s) URL (with an optional title ≤ ${AUTHOR_SITE_TITLE_MAX} chars)`,
        );
      }
      sites.push(site);
    }
    if (sites.length === 0) delete raw.authorSites;
    else raw.authorSites = sites;
    // The cards should be ready before the first visitor asks: start the
    // OpenGraph fetch now rather than on their request.
    warmAuthorSites(sites);
  },
  excludeTags: (raw, value) => {
    if (value === null) {
      delete raw.excludeTags;
      return;
    }
    if (!Array.isArray(value)) {
      throw new VaultError(400, 'Settings key "excludeTags" must be an array of strings or null');
    }
    if (value.length > TAGS_MAX) {
      throw new VaultError(400, `Settings key "excludeTags" holds too many tags (${TAGS_MAX} max)`);
    }
    const tags = [...new Set(value.map(cleanTag))];
    // An explicit empty array still clears back to env — "no exclusions at
    // all despite EXCLUDE_TAGS" has no use case worth the extra state.
    if (tags.length === 0) delete raw.excludeTags;
    else raw.excludeTags = tags;
  },
  language: stringKey("language", (v) => {
    const clean = cleanValue(v, "language")?.toLowerCase() ?? null;
    if (clean === null) return null;
    if (clean !== "en" && clean !== "ar") {
      throw new VaultError(400, 'Settings key "language" must be "en" or "ar"');
    }
    return clean;
  }),
  // Strict enum, no coercion beyond trim+lowercase (which `language` and
  // `publicLayout` already get, and which an enum has an obvious canonical
  // form for). "off" is spelled out rather than expressed as null: null clears
  // the key back to LANGUAGE_FILTER, which is a different thing from "this
  // site filters nothing".
  languageFilter: (raw, value) => {
    if (value === null) {
      delete raw.languageFilter;
      return;
    }
    const clean = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!(LANGUAGE_FILTER_MODES as readonly string[]).includes(clean)) {
      throw new VaultError(
        400,
        `Settings key "languageFilter" must be one of: ${LANGUAGE_FILTER_MODES.join(", ")}, or null`,
      );
    }
    raw.languageFilter = clean;
  },
  languageToggle: (raw, value) => {
    if (value === null) delete raw.languageToggle;
    else if (typeof value === "boolean") raw.languageToggle = value;
    else throw new VaultError(400, 'Settings key "languageToggle" must be a boolean or null');
  },
  topics: (raw, value) => {
    if (value === null) delete raw.topics;
    else if (value === "tags" || value === "folders") raw.topics = value;
    else throw new VaultError(400, 'Settings key "topics" must be "tags", "folders" or null');
  },
  commentsEnabled: (raw, value) => {
    if (value === null) delete raw.commentsEnabled;
    else if (typeof value === "boolean") raw.commentsEnabled = value;
    else throw new VaultError(400, 'Settings key "commentsEnabled" must be a boolean or null');
  },
  noteVersions: (raw, value) => {
    if (value === null) delete raw.noteVersions;
    else if (typeof value === "boolean") raw.noteVersions = value;
    else throw new VaultError(400, 'Settings key "noteVersions" must be a boolean or null');
  },
  shareButtons: (raw, value) => {
    if (value === null) delete raw.shareButtons;
    else if (typeof value === "boolean") raw.shareButtons = value;
    else throw new VaultError(400, 'Settings key "shareButtons" must be a boolean or null');
  },
  ambient: (raw, value) => {
    if (value === null) delete raw.ambient;
    else if (typeof value === "boolean") raw.ambient = value;
    else throw new VaultError(400, 'Settings key "ambient" must be a boolean or null');
  },
  pdfSearch: (raw, value) => {
    if (value === null) delete raw.pdfSearch;
    else if (typeof value === "boolean") raw.pdfSearch = value;
    else throw new VaultError(400, 'Settings key "pdfSearch" must be a boolean or null');
  },
  favicon: stringKey("favicon", (v) => cleanVaultImage(v, "favicon")),
  // A logo may be an https URL or a vault image path.
  logo: stringKey("logo", (v) => cleanImageRef(v, "logo")),
  // ── Templates ────────────────────────────────────────────────────────────
  // A FOLDER, not a note: no extension check, and clearing it hands the key
  // back to auto-detection rather than to "no templates at all".
  templatesFolder: stringKey("templatesFolder", (v) => {
    const clean = cleanValue(v, "templatesFolder");
    if (clean === null) return null;
    const rel = vaultRel(clean, "templatesFolder");
    if (rel === "") return null;
    if (isNotePath(rel)) {
      throw new VaultError(400, 'Settings key "templatesFolder" must be a folder, not a note');
    }
    return rel;
  }),
  // The hadith corpus folder, on the templates folder's terms: a folder, and
  // clearing it returns the key to auto-detection.
  hadithFolder: stringKey("hadithFolder", (v) => {
    const clean = cleanValue(v, "hadithFolder");
    if (clean === null) return null;
    const rel = vaultRel(clean, "hadithFolder");
    if (rel === "") return null;
    if (isNotePath(rel)) {
      throw new VaultError(400, 'Settings key "hadithFolder" must be a folder, not a note');
    }
    return rel;
  }),
  drawingsFolder: stringKey("drawingsFolder", (v) => {
    const clean = cleanValue(v, "drawingsFolder");
    if (clean === null) return null;
    const rel = vaultRel(clean, "drawingsFolder");
    if (rel === "") return null;
    if (isNotePath(rel)) {
      throw new VaultError(400, 'Settings key "drawingsFolder" must be a folder, not a note');
    }
    return rel;
  }),
  // ── Periodic notes ───────────────────────────────────────────────────────
  dailyFolder: stringKey("dailyFolder", (v) => {
    const clean = cleanValue(v, "dailyFolder");
    if (clean === null) return null;
    const rel = vaultRel(clean, "dailyFolder");
    if (isNotePath(rel)) throw new VaultError(400, 'Settings key "dailyFolder" must be a folder, not a note');
    // "" is the vault root and is stored as such: null would mean "default".
    return rel;
  }),
  dailyFormat: stringKey("dailyFormat", (v) => periodFormat(v, "dailyFormat", "day")),
  weeklyFormat: stringKey("weeklyFormat", (v) => periodFormat(v, "weeklyFormat", "week")),
  monthlyFormat: stringKey("monthlyFormat", (v) => periodFormat(v, "monthlyFormat", "month")),
  yearlyFormat: stringKey("yearlyFormat", (v) => periodFormat(v, "yearlyFormat", "year")),
  dailyTemplate: stringKey("dailyTemplate", (v) => templateNote(v, "dailyTemplate")),
  weeklyTemplate: stringKey("weeklyTemplate", (v) => templateNote(v, "weeklyTemplate")),
  monthlyTemplate: stringKey("monthlyTemplate", (v) => templateNote(v, "monthlyTemplate")),
  yearlyTemplate: stringKey("yearlyTemplate", (v) => templateNote(v, "yearlyTemplate")),
  // OPEN ON LAUNCH (shared/launch.ts): one of the four doors, or a note
  // path — checked as a path, not for existence, on the home note's terms
  // (a note renamed later is a warning at boot, not a settings error).
  // `resume` is the default and is stored as its absence.
  launch: stringKey("launch", (v) => {
    const clean = cleanValue(v, "launch");
    if (clean === null || clean === DEFAULT_LAUNCH) return null;
    if (isLaunchDoor(clean)) return clean;
    const rel = vaultRel(clean, "launch");
    if (!isNotePath(rel)) throw new VaultError(400, 'Settings key "launch" must be resume, sigils, orbits, today, or a note path (.md, .tex or .latex)');
    return rel;
  }),
  // The unique note (client/uniqueNote.ts): a folder on the daily folder's
  // terms, and a name format that must be finer than a day.
  uniqueFolder: stringKey("uniqueFolder", (v) => {
    const clean = cleanValue(v, "uniqueFolder");
    if (clean === null) return null;
    const rel = vaultRel(clean, "uniqueFolder");
    if (rel === "") return null; // the root is the default, and null IS the default
    if (isNotePath(rel)) throw new VaultError(400, 'Settings key "uniqueFolder" must be a folder, not a note');
    return rel;
  }),
  uniqueFormat: stringKey("uniqueFormat", (v) => uniqueFormat(v, "uniqueFormat")),
  // The second target of the quick-capture sheet (docs/capture.md): a note
  // pinned as the inbox. Validated like a template — a note path in the
  // vault, or nothing.
  captureInbox: stringKey("captureInbox", (v) => templateNote(v, "captureInbox")),
  defaultTemplate: stringKey("defaultTemplate", (v) => {
    const clean = cleanValue(v, "defaultTemplate");
    if (clean === null) return null;
    const rel = vaultRel(clean, "defaultTemplate");
    if (rel === "") return null;
    if (!isNotePath(rel)) {
      throw new VaultError(400, 'Settings key "defaultTemplate" must be a note path (.md, .tex or .latex)');
    }
    return rel;
  }),
  // Where new attachments land. Two sub-keys, patched together like `home`:
  // an unknown mode or an unusable folder rejects the WHOLE patch, so a typo
  // never half-lands and starts writing uploads somewhere unintended.
  attachments: (raw, value) => {
    if (value === null) {
      delete raw.attachments;
      return;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new VaultError(400, 'Settings key "attachments" must be an object or null');
    }
    const a = value as Record<string, unknown>;
    const current =
      typeof raw.attachments === "object" && raw.attachments !== null && !Array.isArray(raw.attachments)
        ? { ...(raw.attachments as Record<string, unknown>) }
        : {};
    for (const key of Object.keys(a)) {
      if (key !== "mode" && key !== "folder") {
        throw new VaultError(400, `Unknown settings key: attachments.${key}`);
      }
    }
    if ("mode" in a) {
      // "specified" IS the default; storing it would only pin the same
      // behaviour absence already gives.
      if (a.mode === null || a.mode === "" || a.mode === "specified") delete current.mode;
      else if (isAttachmentMode(a.mode)) current.mode = a.mode;
      else {
        throw new VaultError(
          400,
          `Settings key "attachments.mode" must be one of: ${ATTACHMENT_MODES.join(", ")}`,
        );
      }
    }
    if ("folder" in a) {
      if (a.folder === null || a.folder === "") delete current.folder;
      else if (typeof a.folder === "string") {
        // JUDGE THE RAW STRING FIRST. `cleanValue` REPAIRS control characters
        // (it replaces every run of them with a space), so by the time it had
        // run, "med\0ia" was the perfectly storable folder "med ia" and
        // `FOLDER_PROBLEM.control` was unreachable code — while CONTRACTS
        // says such a value is REFUSED. Nothing unsafe reached the disk either
        // way; the bug is that the API answered 200 and quietly stored a
        // folder the author never typed.
        const rawProblem = folderError(a.folder);
        if (rawProblem !== null) {
          throw new VaultError(400, `Settings key "attachments.folder" ${FOLDER_PROBLEM[rawProblem]}`);
        }
        const clean = cleanValue(a.folder, "attachments.folder", FOLDER_MAX);
        if (clean === null) delete current.folder;
        else {
          const problem = folderError(clean);
          if (problem !== null) {
            throw new VaultError(400, `Settings key "attachments.folder" ${FOLDER_PROBLEM[problem]}`);
          }
          const folder = normalizeFolder(clean);
          // Last word goes to the vault's own path rules (traversal, ignored
          // trees): the upload will be written through safeAbs, so a folder
          // that cannot survive it must not be storable in the first place.
          try {
            safeAbs(folder);
          } catch {
            throw new VaultError(400, 'Settings key "attachments.folder" is not a valid vault folder');
          }
          if (folder === "") delete current.folder;
          else current.folder = folder;
        }
      } else throw new VaultError(400, 'Settings key "attachments.folder" must be a string or null');
    }
    if (Object.keys(current).length === 0) delete raw.attachments;
    else raw.attachments = current;
  },
  // Voice notes (shared/voice.ts): the `attachments` shape — null deletes the
  // key, sub-keys merge, an unknown sub-key or value is a 400 naming it, and a
  // value equal to its default is DELETED rather than pinned.
  voice: (raw, value) => {
    if (value === null) {
      delete raw.voice;
      return;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new VaultError(400, 'Settings key "voice" must be an object or null');
    }
    const v = value as Record<string, unknown>;
    const current =
      typeof raw.voice === "object" && raw.voice !== null && !Array.isArray(raw.voice)
        ? { ...(raw.voice as Record<string, unknown>) }
        : {};
    for (const key of Object.keys(v)) {
      if (key !== "model" && key !== "language" && key !== "keepAudio") {
        throw new VaultError(400, `Unknown settings key: voice.${key}`);
      }
    }
    if ("model" in v) {
      if (v.model === null || v.model === "" || v.model === VOICE_MODEL_DEFAULT) delete current.model;
      else if (isVoiceModelSetting(v.model)) current.model = v.model;
      else {
        throw new VaultError(
          400,
          `Settings key "voice.model" must be one of: ${[...VOICE_MODELS.map((m) => m.id), "off"].join(", ")}`,
        );
      }
    }
    if ("language" in v) {
      if (v.language === null || v.language === "" || v.language === "auto") delete current.language;
      else if (isVoiceLanguage(v.language)) current.language = v.language;
      else throw new VaultError(400, 'Settings key "voice.language" must be one of: auto, ar, en');
    }
    if ("keepAudio" in v) {
      if (v.keepAudio === null || v.keepAudio === true) delete current.keepAudio;
      else if (v.keepAudio === false) current.keepAudio = false;
      else throw new VaultError(400, 'Settings key "voice.keepAudio" must be a boolean or null');
    }
    if (Object.keys(current).length === 0) delete raw.voice;
    else raw.voice = current;
  },
  // Feeds (shared/feeds.ts): the `voice` shape. `fetch` false is the
  // default and is stored as its absence; `note` is a note path in the vault,
  // and the default `Feeds.md` is its absence too.
  feeds: (raw, value) => {
    if (value === null) {
      delete raw.feeds;
      return;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new VaultError(400, 'Settings key "feeds" must be an object or null');
    }
    const v = value as Record<string, unknown>;
    const current =
      typeof raw.feeds === "object" && raw.feeds !== null && !Array.isArray(raw.feeds)
        ? { ...(raw.feeds as Record<string, unknown>) }
        : {};
    for (const key of Object.keys(v)) {
      if (key !== "fetch" && key !== "note") throw new VaultError(400, `Unknown settings key: feeds.${key}`);
    }
    if ("fetch" in v) {
      if (v.fetch === null || v.fetch === false) delete current.fetch;
      else if (v.fetch === true) current.fetch = true;
      else throw new VaultError(400, 'Settings key "feeds.fetch" must be a boolean or null');
    }
    if ("note" in v) {
      if (v.note === null || v.note === "") delete current.note;
      else if (typeof v.note !== "string") throw new VaultError(400, 'Settings key "feeds.note" must be a string or null');
      else {
        const rel = templateNote(v.note, "feeds.note");
        if (rel === null || rel === FEEDS_NOTE_DEFAULT) delete current.note;
        else current.note = rel;
      }
    }
    if (Object.keys(current).length === 0) delete raw.feeds;
    else raw.feeds = current;
  },
  // Webmentions (docs/webmentions.md): the `feeds` shape. Each switch's
  // default is off and is stored as its absence.
  // Read aloud (shared/speech.ts): the `feeds` shape. Every default (Light,
  // rate 1, the engine's first voice, not public) is stored as its absence.
  speak: (raw, value) => {
    if (value === null) {
      delete raw.speak;
      return;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new VaultError(400, 'Settings key "speak" must be an object or null');
    }
    const v = value as Record<string, unknown>;
    const current =
      typeof raw.speak === "object" && raw.speak !== null && !Array.isArray(raw.speak)
        ? { ...(raw.speak as Record<string, unknown>) }
        : {};
    for (const key of Object.keys(v)) {
      if (key !== "engine" && key !== "rate" && key !== "voices" && key !== "public") {
        throw new VaultError(400, `Unknown settings key: speak.${key}`);
      }
    }
    if ("engine" in v) {
      if (v.engine === null || v.engine === SPEAK_ENGINE_DEFAULT) delete current.engine;
      else if (isSpeakEngine(v.engine)) current.engine = v.engine;
      else throw new VaultError(400, 'Settings key "speak.engine" must be one of: light, natural');
    }
    if ("rate" in v) {
      if (v.rate === null || v.rate === 1) delete current.rate;
      else if (typeof v.rate === "number" && SPEAK_RATES.includes(v.rate)) current.rate = v.rate;
      else throw new VaultError(400, `Settings key "speak.rate" must be one of: ${SPEAK_RATES.join(", ")}`);
    }
    if ("voices" in v) {
      if (v.voices === null) delete current.voices;
      else if (typeof v.voices !== "object" || Array.isArray(v.voices)) {
        throw new VaultError(400, 'Settings key "speak.voices" must be an object or null');
      } else {
        const voices: Record<string, unknown> =
          typeof current.voices === "object" && current.voices !== null ? { ...(current.voices as Record<string, unknown>) } : {};
        for (const [lang, voice] of Object.entries(v.voices as Record<string, unknown>)) {
          if (!isSpeakLang(lang)) throw new VaultError(400, `Unknown language in speak.voices: ${lang}`);
          if (voice === null || voice === "") delete voices[lang];
          else if (isVoiceOf(lang, voice)) voices[lang] = voice;
          else throw new VaultError(400, `speak.voices.${lang} is not a voice of that language`);
        }
        if (Object.keys(voices).length === 0) delete current.voices;
        else current.voices = voices;
      }
    }
    if ("public" in v) {
      if (v.public === null || v.public === false) delete current.public;
      else if (v.public === true) current.public = true;
      else throw new VaultError(400, 'Settings key "speak.public" must be a boolean or null');
    }
    if (Object.keys(current).length === 0) delete raw.speak;
    else raw.speak = current;
  },
  webmentions: (raw, value) => {
    if (value === null) {
      delete raw.webmentions;
      return;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new VaultError(400, 'Settings key "webmentions" must be an object or null');
    }
    const v = value as Record<string, unknown>;
    const current =
      typeof raw.webmentions === "object" && raw.webmentions !== null && !Array.isArray(raw.webmentions)
        ? { ...(raw.webmentions as Record<string, unknown>) }
        : {};
    for (const key of Object.keys(v)) {
      if (key !== "accept" && key !== "send") throw new VaultError(400, `Unknown settings key: webmentions.${key}`);
      const flag = v[key];
      if (flag === null || flag === false) delete current[key];
      else if (flag === true) current[key] = true;
      else throw new VaultError(400, `Settings key "webmentions.${key}" must be a boolean or null`);
    }
    if (Object.keys(current).length === 0) delete raw.webmentions;
    else raw.webmentions = current;
  },
  // The fediverse (docs/webmentions.md): `enabled` off by default and stored
  // as its absence; `handle` must be shared/fediverse.ts's alphabet, and the
  // derived default is its absence too.
  fediverse: (raw, value) => {
    if (value === null) {
      delete raw.fediverse;
      return;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new VaultError(400, 'Settings key "fediverse" must be an object or null');
    }
    const v = value as Record<string, unknown>;
    const current =
      typeof raw.fediverse === "object" && raw.fediverse !== null && !Array.isArray(raw.fediverse)
        ? { ...(raw.fediverse as Record<string, unknown>) }
        : {};
    for (const key of Object.keys(v)) {
      if (key !== "enabled" && key !== "handle") throw new VaultError(400, `Unknown settings key: fediverse.${key}`);
    }
    if ("enabled" in v) {
      if (v.enabled === null || v.enabled === false) delete current.enabled;
      else if (v.enabled === true) current.enabled = true;
      else throw new VaultError(400, 'Settings key "fediverse.enabled" must be a boolean or null');
    }
    if ("handle" in v) {
      if (v.handle === null || v.handle === "") delete current.handle;
      else if (typeof v.handle !== "string" || !isFediverseHandle(v.handle.trim().toLowerCase())) {
        throw new VaultError(400, 'Settings key "fediverse.handle" must be 1–30 letters, digits or underscores', "badHandle");
      } else current.handle = v.handle.trim().toLowerCase();
    }
    if (Object.keys(current).length === 0) delete raw.fediverse;
    else raw.fediverse = current;
  },
  home: (raw, value) => {
    if (value === null) {
      delete raw.home;
      return;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new VaultError(400, 'Settings key "home" must be an object or null');
    }
    const h = value as Record<string, unknown>;
    const current =
      typeof raw.home === "object" && raw.home !== null && !Array.isArray(raw.home)
        ? { ...(raw.home as Record<string, unknown>) }
        : {};
    for (const key of Object.keys(h)) {
      if (key !== "mode" && key !== "note" && key !== "banner") {
        throw new VaultError(400, `Unknown settings key: home.${key}`);
      }
    }
    if ("mode" in h) {
      if (h.mode === null || h.mode === "note") delete current.mode; // note = default
      else if (h.mode === "dashboard") current.mode = "dashboard";
      else throw new VaultError(400, 'Settings key "home.mode" must be "note" or "dashboard"');
    }
    if ("note" in h) {
      if (h.note === null || h.note === "") delete current.note;
      else if (typeof h.note === "string") {
        const clean = cleanValue(h.note, "home.note");
        if (clean === null) delete current.note;
        else {
          const rel = vaultRel(clean, "home.note");
          if (!isNotePath(rel)) {
            throw new VaultError(400, 'Settings key "home.note" must be a note path (.md, .tex or .latex)');
          }
          current.note = rel;
        }
      } else throw new VaultError(400, 'Settings key "home.note" must be a string or null');
    }
    if ("banner" in h) {
      const banner = h.banner;
      if (banner === null || banner === "") delete current.banner;
      else if (typeof banner === "string") {
        // Same shape as the logo: an https URL or a safe vault image path —
        // never an arbitrary string (defense in depth for what lands in an
        // <img src> on every visitor's home page).
        const clean = cleanImageRef(banner, "home.banner");
        if (clean === null) delete current.banner;
        else current.banner = clean;
      } else throw new VaultError(400, 'Settings key "home.banner" must be a string or null');
    }
    if (Object.keys(current).length === 0) delete raw.home;
    else raw.home = current;
  },
  // ── Public folders ───────────────────────────────────────────────────────
  // The `attachments`/`home` shape: null deletes the whole key, sub-keys merge
  // with what is stored, an unknown sub-key is a 400 naming it, and a sub-value
  // equal to its default is DELETED rather than pinned.
  //
  // The LIST is the exception, and it is replaced WHOLE on the tagLabels terms:
  // the editor holds every row on screen, so a merging patch would make
  // deleting one impossible. Unlike tagLabels a bad row here is a 400 rather
  // than a silent drop — this list is twelve rows the owner typed one at a
  // time, and a folder that quietly failed to save is a page that quietly does
  // not exist.
  publicFolders: (raw, value) => {
    if (value === null) {
      delete raw.publicFolders;
      return;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new VaultError(400, 'Settings key "publicFolders" must be an object or null');
    }
    const p = value as Record<string, unknown>;
    const current =
      typeof raw.publicFolders === "object" && raw.publicFolders !== null && !Array.isArray(raw.publicFolders)
        ? { ...(raw.publicFolders as Record<string, unknown>) }
        : {};
    for (const key of Object.keys(p)) {
      if (key !== "enabled" && key !== "nav" && key !== "home" && key !== "folders") {
        throw new VaultError(400, `Unknown settings key: publicFolders.${key}`);
      }
    }
    // The three switches, each with its own default. `home` defaults to true,
    // so storing `true` there would pin the value absence already gives.
    const flag = (key: "enabled" | "nav" | "home", fallback: boolean): void => {
      if (!(key in p)) return;
      const v = p[key];
      if (v === null) {
        delete current[key];
        return;
      }
      if (typeof v !== "boolean") {
        throw new VaultError(400, `Settings key "publicFolders.${key}" must be a boolean or null`);
      }
      if (v === fallback) delete current[key];
      else current[key] = v;
    };
    flag("enabled", false);
    flag("nav", false);
    flag("home", true);
    if ("folders" in p) {
      const list = p.folders;
      if (list === null) delete current.folders;
      else if (!Array.isArray(list)) {
        throw new VaultError(400, 'Settings key "publicFolders.folders" must be an array or null');
      } else {
        if (list.length > PUBLIC_FOLDERS_MAX) {
          throw new VaultError(
            400,
            `Settings key "publicFolders.folders" holds too many folders (${PUBLIC_FOLDERS_MAX} max)`,
          );
        }
        const folders: PublicFolderRef[] = [];
        const seen = new Set<string>();
        for (const entry of list) {
          const problem = folderRowError(entry);
          if (problem !== null) {
            throw new VaultError(400, `Settings publicFolders entry ${FOLDER_PROBLEMS[problem]}`);
          }
          const folder = cleanPublicFolder(entry, folderId) as PublicFolderRef;
          // TWO ROWS, ONE URL. `/folder/games` can only render one of them, so
          // the second one is refused at the door rather than shadowing the
          // first for however long it takes the owner to notice.
          if (seen.has(folder.slug)) {
            throw new VaultError(
              400,
              `Settings publicFolders has two folders with the slug "${folder.slug}" — a slug is a URL and only one page can answer it`,
            );
          }
          seen.add(folder.slug);
          folders.push(folder);
        }
        if (folders.length === 0) delete current.folders;
        else current.folders = folders;
      }
    }
    if (Object.keys(current).length === 0) delete raw.publicFolders;
    else raw.publicFolders = current;
  },
  // The library, replaced whole on the publicFolders terms (the editor holds
  // every row on screen; a bad row is a 400, never a silent drop).
  library: (raw, value) => {
    if (value === null) {
      delete raw.library;
      return;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new VaultError(400, 'Settings key "library" must be an object or null');
    }
    const p = value as Record<string, unknown>;
    const current =
      typeof raw.library === "object" && raw.library !== null && !Array.isArray(raw.library)
        ? { ...(raw.library as Record<string, unknown>) }
        : {};
    for (const key of Object.keys(p)) {
      if (key !== "enabled" && key !== "nav" && key !== "home" && key !== "title" && key !== "roots" && key !== "paths") {
        throw new VaultError(400, `Unknown settings key: library.${key}`);
      }
    }
    const flag = (key: "enabled" | "nav" | "home", fallback: boolean): void => {
      if (!(key in p)) return;
      const v = p[key];
      if (v === null) {
        delete current[key];
        return;
      }
      if (typeof v !== "boolean") {
        throw new VaultError(400, `Settings key "library.${key}" must be a boolean or null`);
      }
      if (v === fallback) delete current[key];
      else current[key] = v;
    };
    flag("enabled", false);
    flag("nav", true);
    flag("home", false);
    if ("title" in p) {
      const title = p.title;
      if (title === null || (typeof title === "string" && title.trim() === "")) delete current.title;
      else if (typeof title !== "string") {
        throw new VaultError(400, 'Settings key "library.title" must be a string or null');
      } else if (title.trim().length > LIBRARY_SITE_TITLE_MAX) {
        throw new VaultError(400, `Settings key "library.title" is too long (${LIBRARY_SITE_TITLE_MAX} max)`);
      } else current.title = title.trim();
    }
    if ("paths" in p) {
      const list = p.paths;
      if (list === null) delete current.paths;
      else if (!Array.isArray(list)) {
        throw new VaultError(400, 'Settings key "library.paths" must be an array or null');
      } else {
        if (list.length > LIBRARY_PATHS_MAX) {
          throw new VaultError(400, `Settings key "library.paths" holds too many paths (${LIBRARY_PATHS_MAX} max)`);
        }
        const paths: LibraryPathRef[] = [];
        const seen = new Set<string>();
        for (const entry of list) {
          const problem = libraryRowError(entry);
          if (problem !== null) {
            throw new VaultError(400, `Settings library entry ${LIBRARY_PROBLEMS[problem]}`);
          }
          const path = cleanLibraryPath(entry, libraryPathId) as LibraryPathRef;
          if (seen.has(path.slug)) {
            throw new VaultError(
              400,
              `Settings library has two paths with the slug "${path.slug}" — a slug is a URL and only one page can answer it`,
            );
          }
          seen.add(path.slug);
          paths.push(path);
        }
        if (paths.length === 0) delete current.paths;
        else current.paths = paths;
      }
    }
    // AFTER `paths`, deliberately: a root may not sit inside a row's folder,
    // and the rows this patch is about to store are the ones to judge against —
    // not the ones that happened to be there before it.
    if ("roots" in p) {
      const list = p.roots;
      if (list === null) delete current.roots;
      else if (!Array.isArray(list)) {
        throw new VaultError(400, 'Settings key "library.roots" must be an array or null');
      } else {
        if (list.length > LIBRARY_ROOTS_MAX) {
          throw new VaultError(400, `Settings key "library.roots" holds too many roots (${LIBRARY_ROOTS_MAX} max)`);
        }
        const rowFolders = ((current.paths as LibraryPathRef[] | undefined) ?? []).map((row) => row.folder);
        const roots: LibraryRoot[] = [];
        for (const entry of list) {
          const problem = libraryRootError(entry);
          if (problem !== null) {
            throw new VaultError(400, `Settings library root ${LIBRARY_ROOT_PROBLEMS[problem]}`);
          }
          const root = cleanLibraryRoot(entry, libraryPathId) as LibraryRoot;
          if (libraryRootNested(root.folder, roots.map((r) => r.folder), rowFolders)) {
            throw new VaultError(
              400,
              `Settings library root "${root.folder}" sits inside another root or inside a path — one folder cannot have two owners`,
            );
          }
          roots.push(root);
        }
        if (roots.length === 0) delete current.roots;
        else current.roots = roots;
      }
    }
    if (Object.keys(current).length === 0) delete raw.library;
    else raw.library = current;
  },
  // ── Backup & sync ────────────────────────────────────────────────────────
  gitSync: (raw, value) => {
    const next = cleanGitSyncPatch(value, raw.gitSync);
    if (next === null) delete raw.gitSync;
    else raw.gitSync = next;
  },
  // WRITE-ONLY. Neither of these lands in settings.json: they go to
  // ASTROLABE_DATA/git-credentials.json (0600), and no read ever answers with the
  // token — only `effective.gitSync.tokenSet`.
  gitToken: (_raw, value) => setGitToken(value),
  gitUser: (_raw, value) => setGitUser(value),
  // ── Ask the vault (server/askSettings.ts) ────────────────────────────────
  ask: (raw, value) => {
    const next = cleanAskPatch(value, raw.ask);
    if (next === null) delete raw.ask;
    else raw.ask = next;
  },
  // WRITE-ONLY, and not into settings.json: ASTROLABE_DATA/ask-credentials.json.
  anthropicKey: (_raw, value) => stageAnthropicKey(value),
  // Typography. The ids are re-validated here (strict allowlist — an unknown
  // id or one the slot does not accept is a 400) even though the route
  // already validated them to download the faces: this handler is the only
  // thing that writes settings.json, so it owns the guarantee. The download
  // itself happens BEFORE this runs (api.ts), so a fetch failure 502s with
  // the file untouched.
  fonts: (raw, value) => {
    if (value === null) {
      delete raw.fonts;
      return;
    }
    const slots = cleanFontSlots(value, readFontSlots(raw.fonts));
    if (slotsAreSystem(slots)) delete raw.fonts; // all system = the default
    else raw.fonts = { ...slots };
  },
  // ── Localization: calendar, note layout, tag labels ──────────────────────
  // Three closed enums and one map. The enums are validated STRICTLY (an
  // unknown value is a 400, not a silent fallback) for the reason
  // `languageFilter` gives: a typo in a value the panel offers as a fixed set
  // of buttons is a mistake worth answering, and there is no ambiguity about
  // the canonical form to coerce to.
  dateCalendar: (raw, value) => {
    if (value === null || value === "") {
      delete raw.dateCalendar;
      return;
    }
    if (!isDateCalendar(value)) {
      throw new VaultError(400, 'Settings key "dateCalendar" must be "gregorian", "hijri" or "both"');
    }
    if (value === DEFAULT_DATE_CALENDAR) delete raw.dateCalendar; // the default stores nothing
    else raw.dateCalendar = value;
  },
  dateOrder: (raw, value) => {
    if (value === null || value === "" || value === DEFAULT_DATE_ORDER) {
      delete raw.dateOrder;
      return;
    }
    if (!isDateOrder(value)) {
      throw new VaultError(400, 'Settings key "dateOrder" must be "auto", "hijri-first" or "gregorian-first"');
    }
    raw.dateOrder = value;
  },
  dateSeparator: (raw, value) => {
    if (value === null || value === "" || value === DEFAULT_DATE_SEPARATOR) {
      delete raw.dateSeparator;
      return;
    }
    if (!isDateSeparator(value)) {
      throw new VaultError(400, 'Settings key "dateSeparator" must be "bar", "dot" or "parens"');
    }
    raw.dateSeparator = value;
  },
  textDirection: (raw, value) => {
    if (value === null || value === "") {
      delete raw.textDirection;
      return;
    }
    if (!isTextDirection(value)) {
      throw new VaultError(400, `Settings key "textDirection" must be one of: ${TEXT_DIRECTIONS.join(", ")}`);
    }
    if (value === DEFAULT_TEXT_DIRECTION) delete raw.textDirection;
    else raw.textDirection = value;
  },
  textAlign: (raw, value) => {
    if (value === null || value === "") {
      delete raw.textAlign;
      return;
    }
    if (!isTextAlign(value)) {
      throw new VaultError(400, `Settings key "textAlign" must be one of: ${TEXT_ALIGNS.join(", ")}`);
    }
    if (value === DEFAULT_TEXT_ALIGN) delete raw.textAlign;
    else raw.textAlign = value;
  },
  emptyPropsCard: (raw, value) => {
    if (value === null || value === true) delete raw.emptyPropsCard;
    else if (value === false) raw.emptyPropsCard = false;
    else throw new VaultError(400, 'Settings key "emptyPropsCard" must be a boolean or null');
  },
  tagsFolder: stringKey("tagsFolder", (v) => {
    const clean = cleanValue(v, "tagsFolder", VALUE_MAX);
    if (clean === null) return null;
    let rel: string;
    try {
      rel = normalizeRel(clean);
      safeAbs(rel); // traversal / ignored-tree rejection
    } catch {
      throw new VaultError(400, 'Settings key "tagsFolder" is not a valid vault path');
    }
    if (rel === "" || isNotePath(rel)) {
      throw new VaultError(400, 'Settings key "tagsFolder" must be a folder, not a note');
    }
    // Stored even when it equals the default: an operator who typed "tags"
    // meant to pin it, and a vault that later grows a `topics/` convention
    // must not silently inherit a changed default.
    return rel;
  }),
  // REPLACED WHOLE, never merged. The settings editor holds the entire map on
  // screen, so a merging PATCH would make deleting a row impossible — the row
  // would come back on the next read. Malformed entries are dropped rather
  // than 400ed for the same reason the excludeTags array drops them: this is a
  // bulk key-value editor, and one bad row must not lose the other forty.
  tagLabels: (raw, value) => {
    if (value === null) {
      delete raw.tagLabels;
      return;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new VaultError(400, 'Settings key "tagLabels" must be an object or null');
    }
    // A CAP ON THE MAP, not only on its keys and labels. Its sibling
    // `excludeTags` has capped its LENGTH at TAGS_MAX since the day it was
    // written; this one capped a key at 50 characters and a label at 60 and
    // then accepted as many of them as were sent. A 5,000-entry PATCH was
    // taken with a 200: settings.json grew to 378 KB and GET /api/settings to
    // 489 KB — a response the settings panel fetches every time it opens. No
    // visitor could see any of it (/api/tag-labels stayed at 46 bytes), which
    // makes this a self-inflicted wound rather than a hole, and the fix is
    // still the same number the sibling key already uses: a vault with more
    // than TAGS_MAX localized tags wants a tags FOLDER, which is the other
    // half of this feature.
    if (Object.keys(value).length > TAGS_MAX) {
      throw new VaultError(
        400,
        `Settings key "tagLabels" holds too many tags (${TAGS_MAX} max) — a tag with a page in the tags folder is named there instead`,
      );
    }
    const map: TagLabelMap = {};
    for (const [rawTag, rawLabels] of Object.entries(value as Record<string, unknown>)) {
      const tag = tagKey(rawTag);
      if (tag === "") continue;
      if (tag.length > TAG_LABEL_MAX || !/^[\p{L}\p{N}][\p{L}\p{N}_/-]*$/u.test(tag)) {
        throw new VaultError(
          400,
          `Settings tagLabels key ${JSON.stringify(rawTag)} is not a simple tag (letters/digits/_-/, ≤ ${TAG_LABEL_MAX} chars)`,
        );
      }
      const entry = cleanLabelEntry(rawLabels);
      if (Object.keys(entry).length > 0) map[tag] = entry;
    }
    if (Object.keys(map).length === 0) delete raw.tagLabels;
    else raw.tagLabels = map;
  },
  // REPLACED WHOLE, on the tagLabels terms above and for a sharper reason:
  // the picker's "None" cell CLEARS a folder's mark, and a merging PATCH
  // makes that impossible — the cleared row would come straight back on the
  // next read. The client sends the map it is holding; this is that map.
  //
  // Unlike tagLabels, a bad row here is a 400 rather than a silent drop. The
  // whole map is written by ONE picker click, so there is no "forty good rows
  // and one bad one" to protect: a refusal names the row and the click is
  // simply not applied, which is better than a folder quietly not taking the
  // glyph the owner just chose.
  folderIcons: (raw, value) => {
    if (value === null) {
      delete raw.folderIcons;
      return;
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new VaultError(400, 'Settings key "folderIcons" must be an object or null');
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > FOLDER_ICONS_MAX) {
      throw new VaultError(
        400,
        `Settings key "folderIcons" holds too many folders (${FOLDER_ICONS_MAX} max)`,
      );
    }
    const map: Record<string, FolderMark> = {};
    for (const [rawPath, icon] of entries) {
      const key = folderIconKey(rawPath);
      if (key === null) {
        throw new VaultError(
          400,
          `Settings folderIcons key ${JSON.stringify(rawPath)} is not a vault-relative folder path`,
        );
      }
      // …and the half of the refusal that needs the vault root: an absolute
      // path, a traversal, an ignored dot-directory. Same helper the
      // folder-shaped string keys use, so `{"/etc": "book"}` cannot be
      // rewritten into `etc` here any more than it can there.
      const rel = vaultRel(key, "folderIcons");
      if (isNotePath(rel)) {
        throw new VaultError(
          400,
          `Settings folderIcons key ${JSON.stringify(rawPath)} names a note, not a folder`,
        );
      }
      if (!isFolderMark(icon)) {
        throw new VaultError(
          400,
          `Settings folderIcons value for ${JSON.stringify(rawPath)} must be one of: ${FOLDER_ICONS.join(", ")}`,
        );
      }
      map[rel] = icon;
    }
    if (Object.keys(map).length === 0) delete raw.folderIcons;
    else raw.folderIcons = map;
  },
};

/** Carry (or retire) a folder's glyph when the folder itself moves.
 *
 *  WHY THIS IS A SERVER SEAM AND NOT A CLIENT CHORE. `folderIcons` is keyed by
 *  PATH, and a path is not stable: /api/folder/move renames and moves, and it
 *  is not the only door — a rename can arrive from git sync, from the desktop
 *  app, from a second browser. Doing the re-key where the move actually
 *  happens is the only version that is right for all of them. Doing it in the
 *  client would also mean an owner who renamed `Games` while a colleague's tab
 *  was open would have that tab PATCH yesterday's map back over it.
 *
 *  The subtree moves with the folder: marking `Games` and then dragging it
 *  into `Archive` must not orphan `Games/Finished`. Pass `to === null` for a
 *  delete, which prunes the folder and everything under it.
 *
 *  Silent no-op when nothing is marked (the overwhelmingly common case) — it
 *  does not touch the file, so it cannot bump an mtime that would invalidate
 *  the read cache for every other reader on every folder rename. */
export function moveFolderIcons(from: string, to: string | null): void {
  const stored = getSettings().folderIcons;
  if (!stored) return;
  const source = folderIconKey(from);
  if (source === null) return;
  const prefix = `${source}/`;
  const target = to === null ? null : folderIconKey(to);
  const next: Record<string, FolderMark> = {};
  let changed = false;
  for (const [key, icon] of Object.entries(stored)) {
    const under = key === source || key.startsWith(prefix);
    if (!under) {
      next[key] = icon;
      continue;
    }
    changed = true;
    if (target === null) continue; // deleted: the mark goes with the folder
    next[key === source ? target : `${target}/${key.slice(prefix.length)}`] = icon;
  }
  if (!changed) return;
  const raw = { ...readRaw() };
  if (Object.keys(next).length === 0) delete raw.folderIcons;
  else raw.folderIcons = next;
  persist(raw);
}

/** Carry (or retire) a library path's FOLDER when that folder is renamed,
 *  moved or deleted — `moveFolderIcons` one noun over, and for a worse
 *  failure than a lost glyph.
 *
 *  `settings.library.paths[].folder` and `settings.library.roots[].folder` are
 *  keyed by path, and /api/folder/move is where a folder's path changes. Until
 *  this ran, renaming `Books/Calculus` left the row naming a folder the vault
 *  no longer has: `resolveLibraryPath()` found zero lessons, returned null, and
 *  the path simply VANISHED from /library — while every published note inside
 *  it, no longer claimed by any lesson folder, flooded back into the blog home,
 *  the topics, the feed and the sitemap. A rename in the sidebar published a
 *  book's forty chapter notes as blog posts.
 *
 *  The subtree comes along, as it does for a glyph: a root on `Books` carries
 *  the rows under it, and a row on `Books/X/Z` is repointed by prefix when
 *  `Books/X` moves. `to === null` is a delete, and the row or the root goes
 *  with the folder — the alternative is a settings.json that accumulates a
 *  path for every folder the vault has ever had.
 *
 *  Silent no-op when nothing matches (the overwhelmingly common case): it does
 *  not touch the file, so it cannot bump an mtime the read cache watches. */
export function moveLibraryFolders(from: string, to: string | null): void {
  const stored = getSettings().library;
  if (!stored) return;
  const source = libraryFolder(from);
  if (source === null) return;
  const prefix = `${source}/`;
  const target = to === null ? null : libraryFolder(to);
  let changed = false;
  /** One folder, moved with its subtree — or null when it goes with a delete. */
  const next = (folder: string): string | null => {
    const under = folder === source || folder.startsWith(prefix);
    if (!under) return folder;
    changed = true;
    if (target === null) return null;
    return folder === source ? target : `${target}/${folder.slice(prefix.length)}`;
  };
  const paths: LibraryPathRef[] = [];
  for (const row of stored.paths ?? []) {
    const folder = next(row.folder);
    if (folder !== null) paths.push({ ...row, folder });
  }
  const roots: LibraryRoot[] = [];
  for (const root of stored.roots ?? []) {
    const folder = next(root.folder);
    if (folder !== null) roots.push({ ...root, folder });
  }
  if (!changed) return;
  const raw = { ...readRaw() };
  const lib: Record<string, unknown> =
    typeof raw.library === "object" && raw.library !== null && !Array.isArray(raw.library)
      ? { ...(raw.library as Record<string, unknown>) }
      : {};
  if (paths.length === 0) delete lib.paths;
  else lib.paths = paths;
  if (roots.length === 0) delete lib.roots;
  else lib.roots = roots;
  if (Object.keys(lib).length === 0) delete raw.library;
  else raw.library = lib;
  persist(raw);
}

/** Carry (or retire) a tag's localised label when the TAG itself is renamed.
 *
 *  Exactly the argument `moveFolderIcons` makes one function up, one noun over:
 *  `tagLabels` is keyed by the canonical tag, a tag rename changes that key, and
 *  the seam is the server because the rename is a server operation. Without
 *  this, renaming `software` to `code` left «برمجيات» attached to a tag no note
 *  carries any more — the Arabic chip silently reverted to the English word, and
 *  the only way back was to find the row in Settings → Language and retype it.
 *
 *  Nested labels come along for the same reason nested TAGS do: `zettel/seed` is
 *  a child of `zettel`, not a coincidence of spelling.
 *
 *  Returns the map as it was, so the caller can put it back — a tag rename is
 *  undoable and the label has to be undoable with it. Null when nothing moved,
 *  which is the common case and does not touch the file.
 *
 *  On a MERGE the destination's own label wins: it is the label of the tag that
 *  survives, and the reader chose to fold the other one into it. */
export function renameTagLabels(from: string, to: string): TagLabelMap | null {
  const stored = getSettings().tagLabels;
  if (!stored) return null;
  const source = tagKey(from);
  const target = tagKey(to);
  if (source === "" || target === "" || source === target) return null;
  const prefix = `${source}/`;
  const next: TagLabelMap = {};
  let changed = false;
  for (const [key, entry] of Object.entries(stored)) {
    if (key !== source && !key.startsWith(prefix)) {
      next[key] = entry;
      continue;
    }
    changed = true;
    const moved = key === source ? target : `${target}/${key.slice(prefix.length)}`;
    // Destination first: a label already written for the surviving tag is not
    // overwritten by the one being folded into it.
    next[moved] = { ...entry, ...(stored[moved] ?? {}) };
  }
  if (!changed) return null;
  const before = { ...stored };
  const raw = { ...readRaw() };
  if (Object.keys(next).length === 0) delete raw.tagLabels;
  else raw.tagLabels = next;
  persist(raw);
  return before;
}

/** Put a `tagLabels` map back exactly as `renameTagLabels` found it — the
 *  settings half of a tag rename's undo. */
export function restoreTagLabels(map: TagLabelMap): void {
  const raw = { ...readRaw() };
  if (Object.keys(map).length === 0) delete raw.tagLabels;
  else raw.tagLabels = map;
  persist(raw);
}

/** Apply a partial update (null clears a key back to its env default) and
 *  persist atomically. Throws VaultError(400) on anything malformed — the
 *  whole patch is rejected, nothing partial lands. Returns stored+effective. */
export function patchSettings(patch: Record<string, unknown>): SettingsResponse {
  // Note: when settings.json was externally corrupted, readRaw() is {} — the
  // patch below then rewrites the file from scratch, discarding whatever the
  // corrupt file held (it was unrecoverable anyway; availability wins).
  const raw = { ...readRaw() };
  // gitToken/gitUser write to a different file (ASTROLABE_DATA/git-credentials.json),
  // so they only VALIDATE below and are written after the whole patch is
  // accepted — a patch that 400s later must not have changed the credential.
  // Anything a previous failed patch staged is dropped here.
  discardStagedGitCredentials();
  discardStagedAskKey();
  const own = (key: string): boolean => Object.prototype.hasOwnProperty.call(PATCH_HANDLERS, key);
  for (const key of Object.keys(patch)) {
    // Own-property check, NOT `in`: inherited Object.prototype names
    // (__proto__, constructor, toString, …) must hit the strict-allowlist
    // 400 like any other unknown key, never resolve up the prototype chain.
    if (!own(key)) throw new VaultError(400, `Unknown settings key: ${key}`);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (!own(key)) continue; // unreachable after the loop above; belt-and-braces
    PATCH_HANDLERS[key](raw, value);
  }
  persist(raw);
  applyStagedGitCredentials();
  applyStagedAskKey();
  return settingsResponse();
}

/** Mirror the admin's editor theme into settings.json (POST /api/theme).
 *
 *  A SEPARATE DOOR FROM patchSettings ON PURPOSE. This is the one settings
 *  write the owner never asks for — it happens because they changed their own
 *  theme — so it touches exactly one key, refuses anything but a theme id, and
 *  cannot be the vehicle for any other change. It also SHORT-CIRCUITS when the
 *  value is already stored: the client debounces, but a debounce still fires
 *  once per settled pick, and re-picking the theme you already have should not
 *  rewrite a file (or bump its mtime, which invalidates the read cache for
 *  every other reader). Returns true when something actually changed. */
export function setAdminTheme(theme: unknown): boolean {
  // A custom theme is a theme: the picker offers them beside the built-ins, so
  // refusing them here would mean an owner editing in their own palette
  // silently stops mirroring anything at all. Shape check only — a custom
  // theme deleted later behaves like any stale id and falls back client-side.
  if (typeof theme !== "string" || !isStoredTheme(theme)) {
    throw new VaultError(400, `Theme must be one of: ${[...THEMES].join(", ")} — or a custom theme this instance has`);
  }
  const raw = { ...readRaw() };
  if (raw.adminTheme === theme) return false;
  raw.adminTheme = theme;
  persist(raw);
  return true;
}

function persist(raw: Record<string, unknown>): void {
  const file = settingsPath();
  mkdirSync(path.dirname(file), { recursive: true });
  // Write-then-rename so a crash mid-write never leaves a torn settings.json.
  const tmp = `${file}.tmp`;
  // Same treatment as the git credential file next door in ASTROLABE_DATA: this
  // file holds no secret by design, but it does hold operator-private
  // configuration (the backup remote, the branch), it is the file a pasted
  // token would land in if any validator ever let one through, and there is no
  // reader but this process. The mode argument is masked by umask and a
  // pre-existing file keeps its own mode, so chmod after the rename asserts it
  // rather than trusting either.
  writeFileSync(tmp, `${JSON.stringify(raw, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
  cache = null; // next read restats — the rename just changed mtime
}
