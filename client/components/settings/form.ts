// THE SETTINGS FORM — the model every server tab edits, and the two pure
// functions that judge it: `validate` (what the Save button refuses) and
// `buildPatch` (the PATCH /api/settings body, only the keys that changed).
//
// Split out of SettingsModal.tsx (3.27.0) along the seam the 3.23 audit drew:
// the panel was 5,190 lines, and the phone shell's Settings screens need the
// same form, the same rules and the same patch without the dialog around
// them. Nothing here renders; nothing here knows which shell asked.

import { folderError, isAttachmentMode, type FolderProblem } from "../../../shared/attachments.ts";
import type { PublicFolderRef, SettingsPatch, SettingsResponse } from "../../../shared/types.ts";
import { folderSlug, FOLDER_DESC_MAX, FOLDER_TITLE_MAX, PUBLIC_FOLDERS_MAX } from "../../../shared/publicFolders.ts";
import { libraryList, libraryRootError, libraryRootNested, libraryRowError, LIBRARY_BLURB_MAX, LIBRARY_PATHS_MAX, LIBRARY_SITE_TITLE_MAX, LIBRARY_SOURCE_MAX, LIBRARY_TITLE_MAX, LIBRARY_ROOTS_MAX } from "../../../shared/library.ts";
import type { LibraryPathRef, LibraryRoot } from "../../../shared/types.ts";
import { countPhrase, localeNum, t, tf, type I18nKey } from "../../i18n.ts";
import { SYSTEM_FONT } from "../../../shared/fonts.ts";
import { DEFAULT_LAUNCH, isLaunchDoor } from "../../../shared/launch.ts";
import { isVoiceLanguage, isVoiceModelSetting } from "../../../shared/voice.ts";
import { isSpeakEngine, SPEAK_RATES } from "../../../shared/speech.ts";
import { isNotePath } from "../../../shared/noteFormat.ts";
import { isFediverseHandle } from "../../../shared/fediverse.ts";
import { isImagePath } from "../../../shared/fileKinds.ts";

export interface Form {
  siteName: string;
  tagline: string;
  footer: string;
  defaultTheme: string; // "" | theme
  publicLayout: string; // "" | "app" | "blog" | "designed"
  blogLocale: string;
  language: string;       // "" | "en" | "ar"
  /** "" (inherit LANGUAGE_FILTER) | "off" | "follow" | "ar" | "en". Four
   *  values where there used to be two, because the two could not express the
   *  thing the visitor switch needed ("follow") without also being the thing
   *  that silently hid a live site. */
  languageFilter: string;
  languageToggle: string; // "" | "on" | "off" (public EN/ع switch; default off)
  excludeTags: string;  // comma-separated
  authorSites: string;  // one per line: "https://url | optional title"
  comments: string;     // "" | "on" | "off"
  noteVersions: string; // "" | "on" | "off" (keep a version before every save; default on)
  share: string;        // "" | "on" | "off" (blog article share row; default on)
  ambient: string;      // "" | "on" | "off" (public masthead ambient layer; default off)
  pdfSearch: string;    // "" | "on" | "off" (the shelf's page text in the sidebar search; default on)
  favicon: string;      // vault path or ""
  logo: string;         // vault path / https URL or ""
  homeMode: string;     // "" | "note" | "dashboard"
  homeNote: string;
  homeBanner: string;
  // ── Attachments ──────────────────────────────────────────────────────────
  // Where an upload lands. Empty mode = inherit the pre-setting behaviour (one
  // fixed folder, ATTACHMENTS_DIR), so an upgrade changes nothing until the
  // admin says otherwise. `attachFolder` means different things per mode — a
  // vault-relative path under "specified", a bare folder NAME under
  // "subfolder" — and is ignored entirely by the other two.
  attachMode: string;   // "" | vault-root | same-folder | subfolder | specified
  attachFolder: string; // vault-relative folder (specified) / name (subfolder)
  // ── Templates ────────────────────────────────────────────────────────────
  // Both empty by default. An empty folder field does NOT mean "no templates"
  // — the server auto-detects an unambiguously named folder — so the row
  // prints what was detected rather than sitting blank beside a working
  // feature (the `inherited` note under it).
  templatesFolder: string;
  hadithFolder: string;
  drawingsFolder: string;
  defaultTemplate: string;
  dailyFolder: string;
  dailyFormat: string;
  dailyTemplate: string;
  weeklyFormat: string;
  weeklyTemplate: string;
  monthlyFormat: string;
  monthlyTemplate: string;
  yearlyFormat: string;
  yearlyTemplate: string;
  // ── Open on launch (shared/launch.ts) ────────────────────────────────────
  // A door, or "note" with the path in `launchNote`: the select and the
  // path field are two controls over one stored key.
  launch: string;
  launchNote: string;
  uniqueFolder: string;
  uniqueFormat: string;
  /** The quick-capture sheet's inbox note (docs/capture.md); empty = none. */
  captureInbox: string;
  // ── Voice notes (shared/voice.ts) ────────────────────────────────────────
  voiceModel: string;     // a model id, or "off"; the default when unset
  voiceLanguage: string;  // "auto" | "ar" | "en"
  voiceKeepAudio: string; // "on" | "off"
  // ── Feeds (shared/feeds.ts) ──────────────────────────────────────────────
  feedsFetch: string;     // "on" | "off" — off unless the owner says so
  feedsNote: string;      // the list's note; "" is the default Feeds.md
  // ── Read aloud (shared/speech.ts) ────────────────────────────────────────
  speakEngine: string;    // "light" | "natural"
  speakRate: string;      // "0.8" | "1" | "1.2"
  speakVoiceEn: string;   // a Natural English voice id; "" is the first
  speakVoiceJa: string;   // a Japanese voice id; "" is the first
  speakPublic: string;    // "on" | "off" — Readers may listen; off unless set
  // ── Webmentions and the fediverse (docs/webmentions.md) ──────────────────
  wmAccept: string;       // "on" | "off" — off unless the owner says so
  wmSend: string;         // "on" | "off"
  fediEnabled: string;    // "on" | "off"
  fediHandle: string;     // "" is the handle derived from the site name
  // ── Backup & sync (gitSync) ──────────────────────────────────────────────
  // These prefill from `effective` rather than from the stored keys: sync has
  // no env counterpart, so "inherit" is meaningless here — every control shows
  // the value in force.
  syncEnabled: string;   // "on" | "off"
  syncRemote: string;
  syncBranch: string;
  syncAuth: string;      // "ssh" | "token"
  syncPullFirst: string; // "on" | "off"
  syncInterval: string;  // whole minutes; "0" = manual only
  syncUser: string;      // username the token pairs with
  syncToken: string;     // WRITE-ONLY: never prefilled, never read back
  // ── Ask the vault (docs/ask.md) ──────────────────────────────────────────
  // Prefilled from `effective`, like sync: no env counterpart but OLLAMA_HOST.
  askProvider: string;       // "ollama" | "anthropic"
  askChatModel: string;
  askAnthropicModel: string;
  askEmbedModel: string;
  askTopK: string;
  askKey: string;            // WRITE-ONLY, like syncToken
  // ── Typography (fonts) ───────────────────────────────────────────────────
  // Catalog id or SYSTEM_FONT. Like sync, these prefill from `effective`: a
  // webfont choice has no env counterpart, so "inherit" would mean nothing.
  fontProse: string;
  fontUi: string;
  fontMono: string;
  fontArabic: string;
  /** Optical size match for the Arabic face, in percent; "" = the catalog's
   *  own measured value (or none, for an uploaded face). */
  fontSizeAdjust: string;
  // ── Localization ─────────────────────────────────────────────────────────
  // Like sync and typography, these prefill from `effective`: none of them has
  // an env counterpart, so "inherit" would name a fallback that does not
  // exist. Their defaults ARE the values that change nothing.
  dateCalendar: string;  // "gregorian" | "hijri" | "both"
  dateOrder: string;     // "auto" | "hijri-first" | "gregorian-first"
  dateSeparator: string; // "bar" | "dot" | "parens"
  textDirection: string; // "auto" | "ltr" | "rtl"
  textAlign: string;     // "start" | "left" | "right" | "center" | "justify"
  emptyPropsCard: string; // "on" | "off"
  tagsFolder: string;
  /** The tag-label table, as ROWS rather than as the wire map — the editor is
   *  a list the reader adds to and deletes from, and a map cannot hold a row
   *  that is being typed (its key is still empty). Never touched by `field()`,
   *  which is for string controls. */
  tagLabels: TagLabelRow[];
  // ── Public folders ───────────────────────────────────────────────────────
  // One master switch, two placement sub-options and the list. Like sync and
  // typography these prefill from `effective`: there is no env counterpart, so
  // "inherit" would name a fallback that does not exist. The LIST is rows, not
  // a string, for the reason `tagLabels` is (a table editor cannot hold a
  // half-typed row in a map) — and never touched by `field()`.
  publicFoldersOn: string;   // "on" | "off"
  publicFoldersHome: string; // "on" | "off"
  publicFoldersNav: string;  // "on" | "off"
  topicsMode: string;        // "tags" | "folders" — where the public categories come from
  publicFolderRows: PublicFolderRef[];
  // The library, on the same terms: a switch, two placements, a name and
  // the rows the editor holds.
  libraryOn: string;   // "on" | "off"
  libraryNav: string;  // "on" | "off"
  libraryHome: string; // "on" | "off"
  libraryTitle: string;
  libraryRoots: LibraryRoot[];
  libraryRows: LibraryPathRef[];
}

/** One row of the tag-label editor. `tag` is the CANONICAL tag; the other two
 *  are what the front end says instead, per language. */
export interface TagLabelRow {
  tag: string;
  en: string;
  ar: string;
}

/** The stored map → editor rows, sorted so the table does not reshuffle
 *  itself between saves. */
export function labelRows(map: Record<string, Record<string, string>> | undefined): TagLabelRow[] {
  return Object.entries(map ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, labels]) => ({ tag, en: labels.en ?? "", ar: labels.ar ?? "" }));
}

/** Editor rows → the wire map. Blank rows and blank languages drop out: a row
 *  whose labels are both empty is a row the reader emptied, which is how a
 *  label is deleted without a second gesture. */
export function labelMap(rows: TagLabelRow[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    const tag = row.tag.trim().replace(/^#/, "").toLowerCase();
    if (tag === "") continue;
    const entry: Record<string, string> = {};
    if (row.en.trim() !== "") entry.en = row.en.trim();
    if (row.ar.trim() !== "") entry.ar = row.ar.trim();
    if (Object.keys(entry).length > 0) out[tag] = entry;
  }
  return out;
}

export function formFrom(s: SettingsResponse): Form {
  return {
    siteName: s.siteName ?? "",
    tagline: s.tagline ?? "",
    footer: s.footer ?? "",
    defaultTheme: s.defaultTheme ?? "",
    publicLayout: s.publicLayout ?? "",
    blogLocale: s.blogLocale ?? "",
    language: s.language ?? "",
    languageFilter: s.languageFilter ?? "",
    languageToggle: s.languageToggle === undefined ? "" : s.languageToggle ? "on" : "off",
    excludeTags: (s.excludeTags ?? []).join(", "),
    authorSites: (s.authorSites ?? [])
      .map((site) => (site.title ? `${site.url} | ${site.title}` : site.url))
      .join("\n"),
    comments: s.commentsEnabled === undefined ? "" : s.commentsEnabled ? "on" : "off",
    noteVersions: s.noteVersions === undefined ? "" : s.noteVersions ? "on" : "off",
    share: s.shareButtons === undefined ? "" : s.shareButtons ? "on" : "off",
    ambient: s.ambient === undefined ? "" : s.ambient ? "on" : "off",
    pdfSearch: s.pdfSearch === undefined ? "" : s.pdfSearch ? "on" : "off",
    favicon: s.favicon ?? "",
    logo: s.logo ?? "",
    homeMode: s.home?.mode ?? "",
    homeNote: s.home?.note ?? "",
    homeBanner: s.home?.banner ?? "",
    attachMode: s.attachments?.mode ?? "",
    attachFolder: s.attachments?.folder ?? "",
    templatesFolder: s.templatesFolder ?? "",
    hadithFolder: s.hadithFolder ?? "",
    drawingsFolder: s.drawingsFolder ?? "",
    defaultTemplate: s.defaultTemplate ?? "",
    dailyFolder: s.dailyFolder ?? "",
    dailyFormat: s.dailyFormat ?? "",
    dailyTemplate: s.dailyTemplate ?? "",
    weeklyFormat: s.weeklyFormat ?? "",
    weeklyTemplate: s.weeklyTemplate ?? "",
    monthlyFormat: s.monthlyFormat ?? "",
    monthlyTemplate: s.monthlyTemplate ?? "",
    yearlyFormat: s.yearlyFormat ?? "",
    yearlyTemplate: s.yearlyTemplate ?? "",
    launch: s.launch === undefined ? DEFAULT_LAUNCH : isLaunchDoor(s.launch) ? s.launch : "note",
    launchNote: s.launch !== undefined && !isLaunchDoor(s.launch) ? s.launch : "",
    uniqueFolder: s.uniqueFolder ?? "",
    uniqueFormat: s.uniqueFormat ?? "",
    captureInbox: s.captureInbox ?? "",
    voiceModel: s.effective.voice.model,
    voiceLanguage: s.effective.voice.language,
    voiceKeepAudio: s.effective.voice.keepAudio ? "on" : "off",
    feedsFetch: s.effective.feeds.fetch ? "on" : "off",
    feedsNote: s.feeds?.note ?? "",
    speakEngine: s.effective.speak.engine,
    speakRate: String(s.effective.speak.rate),
    speakVoiceEn: s.effective.speak.voices.en ?? "",
    speakVoiceJa: s.effective.speak.voices.ja ?? "",
    speakPublic: s.effective.speak.public ? "on" : "off",
    wmAccept: s.effective.webmentions.accept ? "on" : "off",
    wmSend: s.effective.webmentions.send ? "on" : "off",
    fediEnabled: s.effective.fediverse.enabled ? "on" : "off",
    fediHandle: s.fediverse?.handle ?? "",
    syncEnabled: s.effective.gitSync.enabled ? "on" : "off",
    syncRemote: s.effective.gitSync.remote ?? "",
    syncBranch: s.effective.gitSync.branch,
    syncAuth: s.effective.gitSync.authMode,
    syncPullFirst: s.effective.gitSync.pullFirst ? "on" : "off",
    syncInterval: String(s.effective.gitSync.intervalMinutes),
    syncUser: s.effective.gitSync.gitUser ?? "",
    // The stored token never comes back from the server (only `tokenSet`
    // does), so this field always starts empty — typing into it REPLACES the
    // stored value, and leaving it empty leaves that value alone.
    syncToken: "",
    askProvider: s.effective.ask.provider,
    askChatModel: s.effective.ask.chatModel,
    askAnthropicModel: s.effective.ask.anthropicModel,
    askEmbedModel: s.effective.ask.embedModel,
    askTopK: String(s.effective.ask.topK),
    // The key never comes back, exactly like the git token.
    askKey: "",
    fontProse: s.effective.fonts?.prose ?? SYSTEM_FONT,
    fontUi: s.effective.fonts?.ui ?? SYSTEM_FONT,
    fontMono: s.effective.fonts?.mono ?? SYSTEM_FONT,
    fontArabic: s.effective.fonts?.arabic ?? SYSTEM_FONT,
    fontSizeAdjust:
      s.effective.fonts?.arabicSizeAdjust == null ? "" : String(s.effective.fonts.arabicSizeAdjust),
    dateCalendar: s.effective.dateCalendar ?? "gregorian",
    dateOrder: s.effective.dateOrder ?? "auto",
    dateSeparator: s.effective.dateSeparator ?? "bar",
    textDirection: s.effective.textDirection ?? "auto",
    textAlign: s.effective.textAlign ?? "start",
    emptyPropsCard: s.effective.emptyPropsCard === false ? "off" : "on",
    tagsFolder: s.tagsFolder ?? "",
    // The STORED map only. The tag pages' own labels are merged in by the
    // server at read time and deliberately never prefill this editor: a
    // prefill carrying a label the vault owns would copy it into settings.json
    // the first time the panel was saved, and the page would stop being the
    // source of truth for its own name.
    tagLabels: labelRows(s.tagLabels),
    publicFoldersOn: s.effective.publicFolders.enabled ? "on" : "off",
    publicFoldersHome: s.effective.publicFolders.home ? "on" : "off",
    publicFoldersNav: s.effective.publicFolders.nav ? "on" : "off",
    topicsMode: s.effective.topics,
    // Copied, never shared: the editor mutates rows and `initial` is the
    // snapshot the Save diff is measured against.
    publicFolderRows: s.effective.publicFolders.folders.map((folder) => ({ ...folder })),
    libraryOn: s.effective.library.enabled ? "on" : "off",
    libraryNav: s.effective.library.nav ? "on" : "off",
    libraryHome: s.effective.library.home ? "on" : "off",
    libraryTitle: s.effective.library.title,
    libraryRoots: s.effective.library.roots.map((root) => ({ ...root })),
    libraryRows: s.effective.library.paths.map((path) => ({ ...path })),
  };
}

/** Editor rows → the wire list. Rows the reader added and never typed into
 *  drop out (the tagLabels rule), and every field is trimmed here so the diff
 *  below compares what will actually be STORED rather than what was typed. */
export function folderList(rows: PublicFolderRef[]): PublicFolderRef[] {
  const out: PublicFolderRef[] = [];
  for (const row of rows) {
    const title = row.title.trim();
    const slug = folderSlug(row.slug);
    const desc = (row.description ?? "").trim();
    if (title === "" && slug === null && desc === "") continue; // an untouched new row
    const folder: PublicFolderRef = {
      id: row.id,
      slug: slug ?? row.slug.trim().toLowerCase(),
      title,
      icon: row.icon,
    };
    if (desc !== "") folder.description = desc;
    if (row.hidden) folder.hidden = true;
    out.push(folder);
  }
  return out;
}

export const FONT_KEYS = ["fontProse", "fontUi", "fontMono", "fontArabic", "fontSizeAdjust"] as const;

/** The band the server accepts for fonts.arabicSizeAdjust (server/fonts.ts). */
export const SIZE_ADJUST_MIN = 50;

export const SIZE_ADJUST_MAX = 300;

export const TAG_RE = /^[\p{L}\p{N}][\p{L}\p{N}_/-]*$/u;

export const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** Client mirror of the server's image-reference validators (favicon: vault
 *  image path only; logo / home banner: https URL or vault image path) —
 *  fires inline so an invalid value never reaches the save-time toast. */
export function imageRefError(value: string, httpsOk: boolean): string | null {
  const v = value.trim();
  if (v === "") return null;
  if (/^https:\/\//i.test(v)) {
    return httpsOk ? null : t("errVaultImage");
  }
  if (SCHEME_RE.test(v)) {
    return t(httpsOk ? "errHttpsOrVault" : "errVaultImage");
  }
  if (v.split(/[\\/]/).includes("..")) return t("errDotDot");
  if (!isImagePath(v)) return t("errImageExt");
  return null;
}

/** One author site per line: "https://url" or "https://url | Display title". */
export function splitSites(value: string): { url: string; title?: string }[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const bar = line.indexOf("|");
      if (bar < 0) return { url: line };
      const url = line.slice(0, bar).trim();
      const title = line.slice(bar + 1).trim();
      return title === "" ? { url } : { url, title };
    });
}

export function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);
}

export function isValidLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length > 0;
  } catch {
    return false;
  }
}

/** A stored enum VALUE ("note", "blog") as the reader-facing label the option
 *  rows show — so the greyed "inherit (…)" row names the same choice the list
 *  below it does, in the same language. Unknown values pass through. */
export const ENUM_LABELS: Partial<Record<string, I18nKey>> = {
  note: "modeNote",
  dashboard: "modeDashboard",
  app: "layoutApp",
  blog: "layoutBlog",
  designed: "layoutDesigned",
  "vault-root": "locVaultRoot",
  "same-folder": "locSameFolder",
  subfolder: "locSubfolder",
  specified: "locSpecified",
};

/** The server's folder rules, spoken in the reader's language. The same
 *  refusals the 400 would carry — said inline instead, before the save.
 *  "tooLong" is not here: it is a budget, so it uses the shared maxChars copy
 *  every other length-capped field uses. */
export const FOLDER_ERRORS: Partial<Record<FolderProblem, I18nKey>> = {
  traversal: "errFolderTraversal",
  absolute: "errFolderAbsolute",
  dotfolder: "errFolderDotfolder",
  control: "errFolderControl",
};

export const FOLDER_MAX = 180; // mirrors server settings.ts

export function enumLabel(value: string): string {
  const key = ENUM_LABELS[value];
  return key ? t(key) : value;
}

/** "80 chars max" / "80 حرفا كحد أقصى" — the count goes through countPhrase so
 *  the Arabic unit agrees with the number at every budget (a 3–10 budget wants
 *  "أحرف", not the "حرفا" that only reads right from 11 up). */
export function maxChars(n: number): string {
  return tf("errMaxChars", { count: countPhrase(n, "chars") });
}

/** Client-side mirror of the server validators — inline row errors. */
export function validate(f: Form): Partial<Record<keyof Form, string>> {
  const errors: Partial<Record<keyof Form, string>> = {};
  if (f.siteName.trim().length > 80) errors.siteName = maxChars(80);
  if (f.tagline.trim().length > 160) errors.tagline = maxChars(160);
  if (f.footer.trim().length > 200) errors.footer = maxChars(200);
  if (f.blogLocale.trim() !== "" && (f.blogLocale.trim().length > 35 || !isValidLocale(f.blogLocale.trim()))) {
    errors.blogLocale = t("errLocale");
  }
  const badSite = splitSites(f.authorSites).find(
    (site) => !/^https?:\/\/[^\s|]+$/i.test(site.url) || (site.title ?? "").length > 80,
  );
  if (badSite !== undefined) errors.authorSites = tf("errAuthorSite", { url: badSite.url });
  if (splitSites(f.authorSites).length > 6) errors.authorSites = t("errAuthorSitesMax");
  const handle = f.fediHandle.trim().toLowerCase();
  if (handle !== "" && !isFediverseHandle(handle)) errors.fediHandle = t("errFediHandle");
  const badTag = splitTags(f.excludeTags).find((tag) => tag.length > 50 || !TAG_RE.test(tag));
  if (badTag !== undefined) errors.excludeTags = tf("errNotSimpleTag", { tag: badTag });
  if (f.homeNote.trim() !== "" && !isNotePath(f.homeNote.trim())) {
    errors.homeNote = t("errMdPath");
  }
  if (/^http:\/\//i.test(f.logo.trim())) {
    errors.logo = t("errMixedContent");
  } else {
    const e = imageRefError(f.logo, true);
    if (e) errors.logo = e;
  }
  if (/^http:\/\//i.test(f.homeBanner.trim())) {
    errors.homeBanner = t("errMixedContent");
  } else {
    const e = imageRefError(f.homeBanner, true);
    if (e) errors.homeBanner = e;
  }
  const faviconError = imageRefError(f.favicon, false);
  if (faviconError) errors.favicon = faviconError;
  // Backup & sync — the same three rules the server enforces, inline.
  const remote = f.syncRemote.trim();
  if (remote !== "") {
    if (remote.length > 300) errors.syncRemote = maxChars(300);
    else if (UNSAFE_REMOTE.test(remote) || remote.startsWith("-")) errors.syncRemote = t("errRemoteChars");
    // Mirrors the server exactly: a password is refused on either scheme, a
    // bare `user@` only on https:// (where it is how a pasted token looks).
    // `ssh://git@host/you/vault.git` is a normal ssh remote and passes.
    else if (/^https:\/\/[^/]*@/i.test(remote) || /^[a-z][a-z0-9+.-]*:\/\/[^/@]*:[^/@]*@/i.test(remote)) {
      errors.syncRemote = t("errRemoteCreds");
    }
    else if (!REMOTE_RE.test(remote)) errors.syncRemote = t("errRemoteScheme");
  }
  const branch = f.syncBranch.trim();
  const badBranch =
    !BRANCH_RE.test(branch) ||
    branch.includes("..") ||
    branch.includes("//") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.endsWith(".lock");
  if (branch !== "" && badBranch) errors.syncBranch = t("errBranchName");
  const interval = f.syncInterval.trim();
  if (interval !== "" && !/^\d{1,4}$/.test(interval)) errors.syncInterval = t("errInterval");
  else if (Number(interval || "0") > 1440) errors.syncInterval = t("errInterval");
  if (/\s/.test(f.syncToken)) errors.syncToken = t("errTokenSpaces");
  if (/\s/.test(f.askKey)) errors.askKey = t("errTokenSpaces");
  for (const key of ["askChatModel", "askAnthropicModel", "askEmbedModel"] as const) {
    const v = f[key].trim();
    if (v !== "" && (!/^[A-Za-z0-9][\w.\-/:]*$/.test(v) || v.includes("..") || v.length > 120)) errors[key] = t("errAskModel");
  }
  const topK = f.askTopK.trim();
  if (topK !== "" && (!/^\d{1,2}$/.test(topK) || Number(topK) < 2 || Number(topK) > 12)) {
    errors.askTopK = tf("errAskTopK", { min: localeNum(2), max: localeNum(12) });
  }
  const adjust = f.fontSizeAdjust.trim();
  if (adjust !== "") {
    const n = Number(adjust);
    if (!/^\d{1,3}$/.test(adjust) || n < SIZE_ADJUST_MIN || n > SIZE_ADJUST_MAX) {
      errors.fontSizeAdjust = tf("errSizeAdjust", {
        min: localeNum(SIZE_ADJUST_MIN),
        max: localeNum(SIZE_ADJUST_MAX),
      });
    }
  }
  // The attachment folder, judged by the SAME function the server judges it
  // with (shared/attachments.ts) so the inline error and the 400 can never
  // disagree about what a legal folder is.
  const folder = f.attachFolder.trim();
  if (folder.length > FOLDER_MAX) errors.attachFolder = maxChars(FOLDER_MAX);
  else {
    const problem = folderError(folder);
    const key = problem && FOLDER_ERRORS[problem];
    if (key) errors.attachFolder = t(key);
  }
  // Public folders, judged by the SAME slug rule the server uses
  // (shared/publicFolders.ts) so the inline error and the 400 cannot disagree.
  // One message per table, not per row: the row that broke is named in it.
  const rows = folderList(f.publicFolderRows);
  if (rows.length > PUBLIC_FOLDERS_MAX) {
    errors.publicFolderRows = tf("errFoldersMax", { max: localeNum(PUBLIC_FOLDERS_MAX) });
  } else {
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.title === "") {
        errors.publicFolderRows = t("errFolderTitle");
        break;
      }
      if (row.title.length > FOLDER_TITLE_MAX) {
        errors.publicFolderRows = maxChars(FOLDER_TITLE_MAX);
        break;
      }
      if (folderSlug(row.slug) === null) {
        errors.publicFolderRows = tf("errFolderSlug", { slug: row.slug || row.title });
        break;
      }
      if (seen.has(row.slug)) {
        // A slug IS a URL, and only one page can answer one URL.
        errors.publicFolderRows = tf("errFolderDupSlug", { slug: row.slug });
        break;
      }
      seen.add(row.slug);
      if ((row.description ?? "").length > FOLDER_DESC_MAX) {
        errors.publicFolderRows = maxChars(FOLDER_DESC_MAX);
        break;
      }
    }
  }
  // The library's rows, judged by shared/library.ts so the field and the 400
  // agree. The message does NOT go in the Row's error slot: it goes in the
  // card that holds the offending field, beside the field, which is what
  // "Fix the marked fields" in the footer has been promising all along.
  const rowProblem = libraryRowsProblem(f.libraryRows);
  if (rowProblem !== null) errors.libraryRows = rowProblem.message;
  const rootProblem = libraryRootsProblem(f.libraryRoots, f.libraryRows);
  if (rootProblem !== null) errors.libraryRoots = rootProblem;
  if (f.libraryTitle.trim().length > LIBRARY_SITE_TITLE_MAX) errors.libraryTitle = maxChars(LIBRARY_SITE_TITLE_MAX);
  return errors;
}

/** Which FIELD of which row is wrong, and what to say about it. One at a
 *  time: the reader fixes one and the next appears, which is how every other
 *  table on this panel behaves, and a card showing six red messages at once
 *  teaches nothing about which one to start with. */
export interface LibraryRowProblem {
  index: number;
  field: "title" | "slug" | "folder" | "blurb" | "source";
  message: string;
}

export function libraryRowsProblem(rows: readonly LibraryPathRef[]): LibraryRowProblem | null {
  const paths = libraryList(rows);
  if (paths.length > LIBRARY_PATHS_MAX) {
    return { index: 0, field: "title", message: tf("errLibraryMax", { max: localeNum(LIBRARY_PATHS_MAX) }) };
  }
  const seen = new Set<string>();
  for (let i = 0; i < paths.length; i++) {
    const row = paths[i];
    const problem = libraryRowError(row);
    if (problem === "title") return { index: i, field: "title", message: t("errLibraryTitle") };
    if (problem === "titleLength") return { index: i, field: "title", message: maxChars(LIBRARY_TITLE_MAX) };
    if (problem === "slug") return { index: i, field: "slug", message: tf("errLibrarySlug", { slug: row.slug || row.title }) };
    if (problem === "folder") return { index: i, field: "folder", message: tf("errLibraryFolder", { title: row.title }) };
    if (problem === "blurbLength") return { index: i, field: "blurb", message: maxChars(LIBRARY_BLURB_MAX) };
    if (problem === "sourceLength") return { index: i, field: "source", message: maxChars(LIBRARY_SOURCE_MAX) };
    if (seen.has(row.slug)) return { index: i, field: "slug", message: tf("errLibraryDupSlug", { slug: row.slug }) };
    seen.add(row.slug);
  }
  return null;
}

/** The roots, judged by the same three rules the PATCH handler applies. */
export function libraryRootsProblem(roots: readonly LibraryRoot[], rows: readonly LibraryPathRef[]): string | null {
  if (roots.length > LIBRARY_ROOTS_MAX) return tf("errLibraryRootsMax", { max: localeNum(LIBRARY_ROOTS_MAX) });
  const rowFolders = rows.map((row) => row.folder);
  const accepted: string[] = [];
  for (const root of roots) {
    const problem = libraryRootError(root);
    if (problem === "vault") return t("errLibraryRootVault");
    if (problem !== null) return tf("errLibraryFolder", { title: root.folder });
    if (libraryRootNested(root.folder, accepted, rowFolders)) return t("errLibraryRootNested");
    accepted.push(root.folder);
  }
  return null;
}

/** Mirrors of the server's gitSync validators (server/gitSync.ts). */
export const UNSAFE_REMOTE = /[\s`$;&|<>(){}[\]'"\\^*?!#]/;

export const REMOTE_RE = /^(https:\/\/|ssh:\/\/)\S+$|^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:[^:]+$/;

export const BRANCH_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

/** The PATCH: only keys whose form value differs from the loaded snapshot. */
export function buildPatch(initial: Form, f: Form): SettingsPatch {
  const patch: SettingsPatch = {};
  const str = (
    key:
      | "siteName"
      | "tagline"
      | "footer"
      | "defaultTheme"
      | "blogLocale"
      | "favicon"
      | "logo"
      | "templatesFolder"
      | "hadithFolder"
      | "drawingsFolder"
      | "defaultTemplate"
      | "dailyFolder"
      | "dailyFormat"
      | "dailyTemplate"
      | "weeklyFormat"
      | "weeklyTemplate"
      | "monthlyFormat"
      | "monthlyTemplate"
      | "yearlyFormat"
      | "yearlyTemplate"
      | "uniqueFolder"
      | "uniqueFormat"
      | "captureInbox",
  ): void => {
    const value = f[key].trim();
    if (value !== initial[key].trim()) patch[key] = value === "" ? null : value;
  };
  // The launch key is one stored value behind two controls: the door, or
  // the note's path when the door is "note". An empty path under "note" is
  // no choice yet, and clears the key rather than storing a blank.
  const launchOf = (form: Form): string | null => {
    const door = form.launch === "note" ? form.launchNote.trim() : form.launch;
    return door === "" || door === DEFAULT_LAUNCH ? null : door;
  };
  if (launchOf(f) !== launchOf(initial)) patch.launch = launchOf(f);
  str("siteName");
  str("tagline");
  str("footer");
  str("defaultTheme");
  str("blogLocale");
  str("favicon");
  str("logo");
  str("templatesFolder");
  str("hadithFolder");
  str("drawingsFolder");
  str("defaultTemplate");
  str("dailyFolder");
  str("dailyFormat");
  str("dailyTemplate");
  str("weeklyFormat");
  str("weeklyTemplate");
  str("monthlyFormat");
  str("monthlyTemplate");
  str("yearlyFormat");
  str("yearlyTemplate");
  str("uniqueFolder");
  str("uniqueFormat");
  str("captureInbox");
  if (f.language !== initial.language) {
    patch.language = f.language === "en" || f.language === "ar" ? f.language : null;
  }
  if (f.languageFilter !== initial.languageFilter) {
    // "" clears the key back to LANGUAGE_FILTER; the four enum values are sent
    // verbatim. "off" is a stored value, not a cleared key — "this site
    // filters nothing" and "this site takes the env default" are different
    // statements and the panel can now make either.
    patch.languageFilter =
      f.languageFilter === "" ? null : (f.languageFilter as NonNullable<SettingsPatch["languageFilter"]>);
  }
  if (f.languageToggle !== initial.languageToggle) {
    patch.languageToggle = f.languageToggle === "" ? null : f.languageToggle === "on";
  }
  if (f.publicLayout !== initial.publicLayout) {
    patch.publicLayout =
      f.publicLayout === "app" || f.publicLayout === "blog" || f.publicLayout === "designed"
        ? f.publicLayout
        : null;
  }
  if (f.authorSites.trim() !== initial.authorSites.trim()) {
    const sites = splitSites(f.authorSites);
    patch.authorSites = sites.length > 0 ? sites : null;
  }
  if (f.excludeTags.trim() !== initial.excludeTags.trim()) {
    const tags = splitTags(f.excludeTags);
    patch.excludeTags = tags.length > 0 ? tags : null;
  }
  if (f.comments !== initial.comments) {
    patch.commentsEnabled = f.comments === "" ? null : f.comments === "on";
    patch.shareButtons = f.share === "" ? null : f.share === "on";
  }
  if (f.ambient !== initial.ambient) {
    patch.ambient = f.ambient === "" ? null : f.ambient === "on";
  }
  if (f.noteVersions !== initial.noteVersions) {
    patch.noteVersions = f.noteVersions === "" ? null : f.noteVersions === "on";
  }
  if (f.pdfSearch !== initial.pdfSearch) {
    patch.pdfSearch = f.pdfSearch === "" ? null : f.pdfSearch === "on";
  }
  if (
    f.attachMode !== initial.attachMode ||
    f.attachFolder.trim() !== initial.attachFolder.trim()
  ) {
    patch.attachments = {
      // "specified" is the default, so choosing it clears the key rather than
      // pinning the same behaviour absence already gives.
      mode: isAttachmentMode(f.attachMode) && f.attachMode !== "specified" ? f.attachMode : null,
      folder: f.attachFolder.trim() === "" ? null : f.attachFolder.trim(),
    };
  }
  if (
    f.voiceModel !== initial.voiceModel ||
    f.voiceLanguage !== initial.voiceLanguage ||
    f.voiceKeepAudio !== initial.voiceKeepAudio
  ) {
    // Only what moved: the server deletes a sub-key set to its default, so
    // sending the untouched two would be harmless but would read as a choice.
    const voice: NonNullable<SettingsPatch["voice"]> = {};
    if (f.voiceModel !== initial.voiceModel && isVoiceModelSetting(f.voiceModel)) voice.model = f.voiceModel;
    if (f.voiceLanguage !== initial.voiceLanguage && isVoiceLanguage(f.voiceLanguage)) voice.language = f.voiceLanguage;
    if (f.voiceKeepAudio !== initial.voiceKeepAudio) voice.keepAudio = f.voiceKeepAudio === "on";
    if (Object.keys(voice).length > 0) patch.voice = voice;
  }
  if (f.wmAccept !== initial.wmAccept || f.wmSend !== initial.wmSend) {
    const wm: NonNullable<SettingsPatch["webmentions"]> = {};
    if (f.wmAccept !== initial.wmAccept) wm.accept = f.wmAccept === "on";
    if (f.wmSend !== initial.wmSend) wm.send = f.wmSend === "on";
    patch.webmentions = wm;
  }
  if (f.fediEnabled !== initial.fediEnabled || f.fediHandle.trim() !== initial.fediHandle.trim()) {
    const fedi: NonNullable<SettingsPatch["fediverse"]> = {};
    if (f.fediEnabled !== initial.fediEnabled) fedi.enabled = f.fediEnabled === "on";
    if (f.fediHandle.trim() !== initial.fediHandle.trim()) fedi.handle = f.fediHandle.trim() === "" ? null : f.fediHandle.trim().toLowerCase();
    patch.fediverse = fedi;
  }
  if (
    f.speakEngine !== initial.speakEngine ||
    f.speakRate !== initial.speakRate ||
    f.speakVoiceEn !== initial.speakVoiceEn ||
    f.speakVoiceJa !== initial.speakVoiceJa ||
    f.speakPublic !== initial.speakPublic
  ) {
    // Only what moved, like `voice`: a default is stored as its absence.
    const speak: NonNullable<SettingsPatch["speak"]> = {};
    if (f.speakEngine !== initial.speakEngine && isSpeakEngine(f.speakEngine)) speak.engine = f.speakEngine;
    if (f.speakRate !== initial.speakRate && SPEAK_RATES.includes(Number(f.speakRate))) speak.rate = Number(f.speakRate);
    const voices: Partial<Record<"en" | "ja", string | null>> = {};
    if (f.speakVoiceEn !== initial.speakVoiceEn) voices.en = f.speakVoiceEn === "" ? null : f.speakVoiceEn;
    if (f.speakVoiceJa !== initial.speakVoiceJa) voices.ja = f.speakVoiceJa === "" ? null : f.speakVoiceJa;
    if (Object.keys(voices).length > 0) speak.voices = voices;
    if (f.speakPublic !== initial.speakPublic) speak.public = f.speakPublic === "on";
    if (Object.keys(speak).length > 0) patch.speak = speak;
  }
  if (f.feedsFetch !== initial.feedsFetch || f.feedsNote.trim() !== initial.feedsNote.trim()) {
    const feeds: NonNullable<SettingsPatch["feeds"]> = {};
    if (f.feedsFetch !== initial.feedsFetch) feeds.fetch = f.feedsFetch === "on";
    if (f.feedsNote.trim() !== initial.feedsNote.trim()) feeds.note = f.feedsNote.trim() === "" ? null : f.feedsNote.trim();
    patch.feeds = feeds;
  }
  if (
    f.homeMode !== initial.homeMode ||
    f.homeNote.trim() !== initial.homeNote.trim() ||
    f.homeBanner.trim() !== initial.homeBanner.trim()
  ) {
    patch.home = {
      mode: f.homeMode === "dashboard" ? "dashboard" : null,
      note: f.homeNote.trim() === "" ? null : f.homeNote.trim(),
      banner: f.homeBanner.trim() === "" ? null : f.homeBanner.trim(),
    };
  }
  // ── Backup & sync ────────────────────────────────────────────────────────
  const git: NonNullable<SettingsPatch["gitSync"]> = {};
  if (f.syncEnabled !== initial.syncEnabled) git.enabled = f.syncEnabled === "on";
  if (f.syncRemote.trim() !== initial.syncRemote.trim()) {
    git.remote = f.syncRemote.trim() === "" ? null : f.syncRemote.trim();
  }
  if (f.syncBranch.trim() !== initial.syncBranch.trim()) {
    git.branch = f.syncBranch.trim() === "" ? null : f.syncBranch.trim();
  }
  if (f.syncAuth !== initial.syncAuth) git.authMode = f.syncAuth === "token" ? "token" : "ssh";
  if (f.syncPullFirst !== initial.syncPullFirst) git.pullFirst = f.syncPullFirst === "on";
  if (f.syncInterval.trim() !== initial.syncInterval.trim()) {
    git.intervalMinutes = Number(f.syncInterval.trim() || "0");
  }
  if (Object.keys(git).length > 0) patch.gitSync = git;
  // Write-only: an empty field means "leave the stored token alone", never
  // "clear it" — clearing is its own explicit button.
  if (f.syncToken !== "") patch.gitToken = f.syncToken;
  if (f.syncUser.trim() !== initial.syncUser.trim()) {
    patch.gitUser = f.syncUser.trim() === "" ? null : f.syncUser.trim();
  }
  // ── Ask the vault ────────────────────────────────────────────────────────
  // An emptied model field means "the default", which the server stores as
  // nothing at all.
  const ask: NonNullable<SettingsPatch["ask"]> = {};
  if (f.askProvider !== initial.askProvider) ask.provider = f.askProvider === "anthropic" ? "anthropic" : "ollama";
  if (f.askChatModel.trim() !== initial.askChatModel.trim()) ask.chatModel = f.askChatModel.trim() || null;
  if (f.askAnthropicModel.trim() !== initial.askAnthropicModel.trim()) ask.anthropicModel = f.askAnthropicModel.trim() || null;
  if (f.askEmbedModel.trim() !== initial.askEmbedModel.trim()) ask.embedModel = f.askEmbedModel.trim() || null;
  if (f.askTopK.trim() !== initial.askTopK.trim()) ask.topK = f.askTopK.trim() === "" ? null : Number(f.askTopK.trim());
  if (Object.keys(ask).length > 0) patch.ask = ask;
  // Write-only, like the git token: empty leaves the stored key alone.
  if (f.askKey !== "") patch.anthropicKey = f.askKey;
  // ── Typography ───────────────────────────────────────────────────────────
  // All four slots travel together: the server needs the whole set to know
  // which families to have on disk before it writes the file.
  if (FONT_KEYS.some((key) => f[key] !== initial[key])) {
    const adjust = f.fontSizeAdjust.trim();
    patch.fonts = {
      prose: f.fontProse,
      ui: f.fontUi,
      mono: f.fontMono,
      arabic: f.fontArabic,
      // Empty = "no override": the catalog's measured value comes back, and an
      // uploaded face goes back to none. null is how the server spells that.
      arabicSizeAdjust: adjust === "" ? null : Number(adjust),
    };
  }
  // ── Localization ─────────────────────────────────────────────────────────
  if (f.dateCalendar !== initial.dateCalendar) {
    patch.dateCalendar = f.dateCalendar === "hijri" || f.dateCalendar === "both" ? f.dateCalendar : null;
  }
  if (f.dateOrder !== initial.dateOrder) {
    patch.dateOrder = f.dateOrder === "hijri-first" || f.dateOrder === "gregorian-first" ? f.dateOrder : null;
  }
  if (f.dateSeparator !== initial.dateSeparator) {
    patch.dateSeparator = f.dateSeparator === "dot" || f.dateSeparator === "parens" ? f.dateSeparator : null;
  }
  if (f.textDirection !== initial.textDirection) {
    patch.textDirection = f.textDirection === "ltr" || f.textDirection === "rtl" ? f.textDirection : null;
  }
  if (f.emptyPropsCard !== initial.emptyPropsCard) {
    patch.emptyPropsCard = f.emptyPropsCard === "off" ? false : null;
  }
  if (f.textAlign !== initial.textAlign) {
    patch.textAlign =
      f.textAlign === "left" || f.textAlign === "right" || f.textAlign === "center" || f.textAlign === "justify"
        ? f.textAlign
        : null;
  }
  if (f.tagsFolder.trim() !== initial.tagsFolder.trim()) {
    patch.tagsFolder = f.tagsFolder.trim() === "" ? null : f.tagsFolder.trim();
  }
  // The map travels WHOLE, never merged — the editor holds all of it on
  // screen, so a merging PATCH would make deleting a row impossible.
  const nextLabels = labelMap(f.tagLabels);
  if (JSON.stringify(nextLabels) !== JSON.stringify(labelMap(initial.tagLabels))) {
    patch.tagLabels = Object.keys(nextLabels).length > 0 ? nextLabels : null;
  }
  // ── Public folders ───────────────────────────────────────────────────────
  // The whole sub-object travels whenever any part of it moved: the three
  // switches merge server-side, and the LIST is replaced whole (the tagLabels
  // rule — the editor holds every row on screen, so a merging patch would make
  // deleting one impossible). The list is sent even when the master switch is
  // going OFF: turning the feature off is a take-down, not a delete.
  const nextFolders = folderList(f.publicFolderRows);
  if (
    f.publicFoldersOn !== initial.publicFoldersOn ||
    f.publicFoldersHome !== initial.publicFoldersHome ||
    f.publicFoldersNav !== initial.publicFoldersNav ||
    JSON.stringify(nextFolders) !== JSON.stringify(folderList(initial.publicFolderRows))
  ) {
    patch.publicFolders = {
      enabled: f.publicFoldersOn === "on",
      home: f.publicFoldersHome === "on",
      nav: f.publicFoldersNav === "on",
      folders: nextFolders.length > 0 ? nextFolders : null,
    };
  }
  if (f.topicsMode !== initial.topicsMode) patch.topics = f.topicsMode === "folders" ? "folders" : "tags";
  const nextPaths = libraryList(f.libraryRows);
  if (
    f.libraryOn !== initial.libraryOn ||
    f.libraryNav !== initial.libraryNav ||
    f.libraryHome !== initial.libraryHome ||
    f.libraryTitle.trim() !== initial.libraryTitle.trim() ||
    JSON.stringify(f.libraryRoots) !== JSON.stringify(initial.libraryRoots) ||
    JSON.stringify(nextPaths) !== JSON.stringify(libraryList(initial.libraryRows))
  ) {
    patch.library = {
      enabled: f.libraryOn === "on",
      nav: f.libraryNav === "on",
      home: f.libraryHome === "on",
      title: f.libraryTitle.trim() === "" ? null : f.libraryTitle.trim(),
      roots: f.libraryRoots.length > 0 ? f.libraryRoots : null,
      paths: nextPaths.length > 0 ? nextPaths : null,
    };
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Consequence lines: what a visitor-facing setting will actually cost, in
// notes from THIS vault, before the save.
//
// Four controls on this panel can shrink the public site — the language
// filter, excluded tags, the blog front door, and (env-only, but it belongs in
// the same sentence) PUBLIC. Every one of them used to be a switch with a name
// and no stated consequence, and the language one took a real site from twenty
// published posts to two on a single click, silently. The server holds the
// only numbers that can answer "what will this do"; this asks it, live, as the
// controls move.
// ---------------------------------------------------------------------------
