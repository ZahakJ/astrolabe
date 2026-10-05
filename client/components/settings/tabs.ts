// THE PANEL'S PAGES — their groups, their order, their names and one sentence
// each, and the per-device memory of the last one shown. Read by both hosts:
// the desktop's dialog (SettingsModal.tsx) draws them as a two-level rail, the
// phone shell's Settings screen as headed lists of pushed pages. `check-docs`
// and scripts/settings-index.mjs read TABS out of this file as text (keep each
// entry on one line, `id` then `key` first); the index reads the render switch
// in ./TabBody.tsx for the rows.

import { scrollBehavior } from "../../a11y.ts";
import { localeNum, t, tf, type I18nKey } from "../../i18n.ts";

/** THE PAGES, IN FOUR GROUPS — a two-level rail (settings, round 2).
 *
 *  The purge (3.38.0) sorted the rows into nine sections by intent, and they
 *  still read as long mixed lists under ALL-CAPS subheads: "Your site" was
 *  identity, publishing, comments, mentions and the fediverse; "Writing" was
 *  launch, the toolbar, autocorrect, templates and a table of periodic notes.
 *  So the nine became eighteen short pages, each answering one question with
 *  at most ten rows in sight (`check-settings`), under four headings in the
 *  rail: what is YOURS (how it looks, speaks, writes and reads), YOUR SITE
 *  (what visitors meet), your DATA (where copies go, who answers), and the
 *  APP itself. contracts/settings-design.md is the page list and why each row
 *  is where it is; contracts/settings-audit.md is the row-by-row ledger.
 *
 *  Every row kept its key, its default and its behaviour; only its page moved,
 *  and the settings index (`settingsIndex.ts`) carries the map — each entry's
 *  page (`tab`) and group — so a search and `openSettingsAt` land on a row
 *  wherever it went. Each page opens with one sentence saying what it
 *  DECIDES; a page whose rows are all kept in this browser (`device`) says so
 *  once under it, instead of a mark on every row. */
export interface Group {
  id: "you" | "site" | "data" | "app";
  key: I18nKey;
}

export const GROUPS: Group[] = [
  { id: "you", key: "settingsGroupYou" },
  { id: "site", key: "settingsGroupSite" },
  { id: "data", key: "settingsGroupData" },
  { id: "app", key: "settingsGroupApp" },
];

export interface Tab {
  id: string;
  key: I18nKey;
  /** One-sentence intro under the page's heading. */
  intro: I18nKey;
  group: Group["id"];
  /** Every row on this page is kept in this browser and saves as it changes:
   *  the page says so once, and its rows wear no mark of their own. */
  device?: true;
}

export const TABS: Tab[] = [
  { id: "appearance", key: "tabAppearance", intro: "introAppearance", group: "you", device: true },
  { id: "type", key: "tabType", intro: "introType", group: "you" },
  { id: "language", key: "tabLanguage", intro: "introLanguage", group: "you" },
  { id: "dates", key: "tabDates", intro: "introDates", group: "you" },
  { id: "writing", key: "tabWriting", intro: "introWriting", group: "you" },
  { id: "notes", key: "tabNotes", intro: "introNotes", group: "you" },
  { id: "reading", key: "tabReading", intro: "introReading", group: "you" },
  { id: "speech", key: "tabSpeech", intro: "introSpeech", group: "you" },
  { id: "site", key: "tabSite", intro: "introSite", group: "site" },
  { id: "publishing", key: "tabPublishing", intro: "introPublishing", group: "site" },
  { id: "conversation", key: "tabConversation", intro: "introConversation", group: "site" },
  { id: "collections", key: "tabCollections", intro: "introCollections", group: "site" },
  { id: "library", key: "tabLibrary", intro: "introLibrary", group: "site" },
  { id: "sync", key: "groupSync", intro: "syncNote", group: "data" },
  { id: "versions", key: "tabVersions", intro: "introVersions", group: "data" },
  // Its own page: which models read the notes and answer about them is its
  // own question (docs/ask.md).
  { id: "ask", key: "tabAsk", intro: "introAsk", group: "data" },
  { id: "device", key: "tabDevice", intro: "introDevice", group: "app", device: true },
  { id: "about", key: "tabAbout", intro: "introAbout", group: "app" },
];

/** THE PAGES A POCKET VAULT HAS NOT GOT.
 *
 *  A repository cloned onto a phone has no visitors and no route that would
 *  serve them: the pocket server answers /api/collections and /api/library
 *  with a 501, refuses every publishing and conversation key in its `PATCH
 *  /api/settings`, and has no /api/ask to point a model at. (Site identity
 *  stays: its name, tagline and logo are the vault's own, and the rows a
 *  pocket cannot keep are drawn locked.)
 *
 *  They stay in TABS and in the settings index — they are real pages of this
 *  product. What keeps a SEARCH from landing on them is `mode: "instance"`,
 *  which scripts/settings-index.mjs reads off their `!pocket` render
 *  condition in TabBody.tsx. */
export const POCKET_HIDDEN_TABS: ReadonlySet<string> = new Set(["publishing", "conversation", "collections", "library", "ask"]);

/** The pages one kind of vault draws, in rail order. */
export function visiblePages(pocket: boolean): Tab[] {
  return pocket ? TABS.filter((s) => !POCKET_HIDDEN_TABS.has(s.id)) : TABS;
}

/** A page id from before this cut, and where most of what it held went. A
 *  remembered page from yesterday's build, a phone's restored history entry
 *  or an old link to `{ kind: "settings", section: "vault" }` lands on the
 *  page that now holds it, instead of on nothing. The purge's nine ids are
 *  all still pages; of the three before it, `device` and `publishing` are
 *  pages again and `vault` (templates, periodic notes, capture) is New notes. */
const FORMER_TABS: Record<string, string> = {
  vault: "notes",
};

/** A page id as the panel knows it now: a current id unchanged, a former one
 *  mapped, anything else empty. */
export function sectionId(id: string): string {
  if (TABS.some((s) => s.id === id)) return id;
  return FORMER_TABS[id] ?? "";
}

/** Whether a page keeps everything in this browser (see `Tab.device`). */
export function devicePage(id: string): boolean {
  return TABS.find((s) => s.id === id)?.device === true;
}

/** The page's name, for a heading, a result's second line or a top bar. */
export function pageName(id: string): string {
  const tab = TABS.find((s) => s.id === sectionId(id));
  return tab === undefined ? id : t(tab.key);
}

/** A model id, not copy: machine text, like the branch field's "main". */
export const ANTHROPIC_MODEL_PLACEHOLDER = "claude-sonnet-5";

/** Automatic-sync periods. A closed set of sentences beats a free number with
 *  a decoder hint under it ("minutes; 0 = manual only"); a stored value from
 *  outside the set (hand-edited settings.json) is added rather than lost. */
export const SYNC_INTERVALS = [0, 15, 30, 60, 180, 360, 720, 1440];

/** Where the panel keeps the page it last showed (per device, like a theme). */
export const TAB_STORAGE = "astrolabe:settings-tab";

export function rememberedTab(): string {
  try {
    const id = sectionId(localStorage.getItem(TAB_STORAGE) ?? "");
    if (id !== "") return id;
  } catch {
    // Storage can be sealed (private mode, a blocked origin); the first page
    // is the right answer then.
  }
  return TABS[0].id;
}

export function intervalLabel(minutes: number): string {
  if (minutes === 0) return t("syncIntervalManual");
  if (minutes < 60) return tf("syncIntervalMinutes", { count: localeNum(minutes) });
  if (minutes === 60) return t("syncIntervalHourly");
  if (minutes === 1440) return t("syncIntervalDaily");
  if (minutes % 60 === 0) return tf("syncIntervalHours", { count: localeNum(minutes / 60) });
  return tf("syncIntervalMinutes", { count: localeNum(minutes) });
}

/** The sentence under a page's name. The sync page's is about a SERVER
 *  pushing to a remote, which is not what Backup & sync means on a phone
 *  holding the repository itself. */
export function tabIntro(tab: string, pocket: boolean): I18nKey {
  return pocket && tab === "sync" ? "pocketSyncNote" : (TABS.find((s) => s.id === tab)?.intro ?? "introAppearance");
}

/** Bring one row into view and MARK it for a moment, inside `root`.
 *  Not one frame but up to a second of them: the desktop's rows on This
 *  device (settings/DeviceTab.tsx) are drawn only once the bridge has
 *  answered, and an IPC round-trip is longer than a frame. A search that
 *  switched the page and then looked once found nothing there and scrolled to
 *  nothing — the exact failure the index exists to prevent.
 *
 *  A row behind a page's Advanced line is inside a closed `<details>`: the
 *  line is opened first, or the scroll lands on a row with no height. A PART
 *  folded into a row that is not drawn right now (the launch note while "Open
 *  on launch" names no note) has nothing to land on, so the host row it
 *  belongs to — `fallback` — is marked instead. */
export function revealRow(root: HTMLElement | null, label: string, fallback?: string): void {
  const deadline = performance.now() + 1000;
  const find = (name: string): HTMLElement | null => root?.querySelector<HTMLElement>(`[data-setting="${CSS.escape(name)}"]`) ?? null;
  const look = (): void => {
    const row = find(label) ?? (performance.now() >= deadline - 500 && fallback ? find(fallback) : null);
    if (!row) {
      if (performance.now() < deadline) requestAnimationFrame(look);
      return;
    }
    for (let el = row.parentElement; el && el !== root; el = el.parentElement) {
      if (el instanceof HTMLDetailsElement) el.open = true;
    }
    // The reader who asked for reduced motion gets the jump, not the glide.
    row.scrollIntoView({ block: "center", behavior: scrollBehavior() });
    row.classList.add("s-smodal__row--found");
    window.setTimeout(() => row.classList.remove("s-smodal__row--found"), 1600);
  };
  requestAnimationFrame(look);
}
