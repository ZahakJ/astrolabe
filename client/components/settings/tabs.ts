// THE PANEL'S TABS — their order, their names and one sentence each, and the
// per-device memory of the last one shown. Read by both hosts: the desktop's
// dialog (SettingsModal.tsx) draws them as a rail, the phone shell's Settings
// screen as a pushed list of sections. `check-docs` reads TABS out of this
// file; the settings index reads the render switch in ./TabBody.tsx.

import { localeNum, t, tf, type I18nKey } from "../../i18n.ts";

/** The sections. The rail used to scroll a single ~2,700px document, which
 *  made it a table of contents for a form nobody could see the end of; tabs
 *  make each one a short read and the rail navigation rather than a bookmark.
 *  Each opens with one sentence saying what it DECIDES. Their history, in
 *  brief: eight tabs split off "This device" (3.9) so rows that save on click
 *  stopped sitting among rows that wait for Save; Site and Collections were
 *  re-cut (3.15) because a tab of twenty-one rows is one nobody reaches the
 *  end of; and then the purge.
 *
 *  THE SETTINGS PURGE (after 3.37): nine sections, by the reader's intent.
 *
 *  The eight tabs before it were cut by the code's history: "This device" was
 *  a tab because its rows lived in localStorage, "Vault" because its rows
 *  named folders, and a reader looking for the theme had to know how the
 *  theme is STORED to know where to look. The audit
 *  (scratchpad/settings-purge/audit.md — a test reads it) walked all 110 rows
 *  and moved each to the question it answers: how it looks (Appearance), what
 *  it speaks (Language & dates), how you write (Writing), how you read and
 *  listen (Reading & speech), what visitors see (Your site, Collections),
 *  where copies are kept (Backup & sync), who answers (Ask), and what this
 *  is (About). The four a first-day reader comes for — theme, language,
 *  publishing, sync — open sections 1, 2, 5 and 7.
 *
 *  Every row kept its key, its default and its behaviour; only its home
 *  moved, and the settings index (`settingsIndex.ts`) carries the new map so a
 *  search and `openSettingsAt` land on a row wherever it went. A row that
 *  saves itself on this device now says so on its own label (Row's `device`
 *  mark) rather than by living on a tab named after the browser. */
export interface Tab {
  id: string;
  key: I18nKey;
  /** One-sentence intro under the section's heading. */
  intro: I18nKey;
}

export const TABS: Tab[] = [
  { id: "appearance", key: "tabAppearance", intro: "introAppearance" },
  { id: "language", key: "tabLanguage", intro: "introLanguage" },
  { id: "writing", key: "tabWriting", intro: "introWriting" },
  { id: "reading", key: "tabReading", intro: "introReading" },
  { id: "site", key: "tabSite", intro: "introSite" },
  { id: "collections", key: "tabCollections", intro: "introCollections" },
  { id: "sync", key: "groupSync", intro: "syncNote" },
  // Its own section: which models read the notes and answer about them is
  // its own question (docs/ask.md).
  { id: "ask", key: "tabAsk", intro: "introAsk" },
  { id: "about", key: "tabAbout", intro: "introAbout" },
];

/** THE SECTIONS A POCKET VAULT HAS NOT GOT.
 *
 *  A repository cloned onto a phone has no visitors and no route that would
 *  serve them: the pocket server answers /api/collections and /api/library
 *  with a 501, and every row of Collections is refused by its `PATCH
 *  /api/settings`. Ask needs Ollama on a computer, and the pocket has no
 *  /api/ask to point one at. (Your site stays: its name, tagline and logo
 *  are the vault's own, and the rows a pocket cannot keep are drawn locked
 *  or, for the publishing ones, not at all — `<InstanceOnly>` in SiteTab.)
 *
 *  They stay in TABS and in the settings index — they are real sections of
 *  this product. What keeps a SEARCH from landing on them is `mode:
 *  "instance"`, which scripts/settings-index.mjs reads off their `!pocket`
 *  render condition. */
export const POCKET_HIDDEN_TABS: ReadonlySet<string> = new Set(["collections", "ask"]);

/** The tab ids before the purge, and where their first rows went. A remembered
 *  tab from yesterday's build, a phone's restored history entry or an old
 *  link to `{ kind: "settings", section: "vault" }` lands on the section that
 *  now holds what it pointed at, instead of on nothing. */
const FORMER_TABS: Record<string, string> = {
  device: "appearance",
  vault: "writing",
  publishing: "site",
};

/** A section id as the panel knows it now: a current id unchanged, a former
 *  one mapped, anything else empty. */
export function sectionId(id: string): string {
  if (TABS.some((s) => s.id === id)) return id;
  return FORMER_TABS[id] ?? "";
}

/** A model id, not copy: machine text, like the branch field's "main". */
export const ANTHROPIC_MODEL_PLACEHOLDER = "claude-sonnet-5";

/** Automatic-sync periods. A closed set of sentences beats a free number with
 *  a decoder hint under it ("minutes; 0 = manual only"); a stored value from
 *  outside the set (hand-edited settings.json) is added rather than lost. */
export const SYNC_INTERVALS = [0, 15, 30, 60, 180, 360, 720, 1440];

/** Where the panel keeps the tab it last showed (per device, like a theme). */
export const TAB_STORAGE = "astrolabe:settings-tab";

export function rememberedTab(): string {
  try {
    const id = sectionId(localStorage.getItem(TAB_STORAGE) ?? "");
    if (id !== "") return id;
  } catch {
    // Storage can be sealed (private mode, a blocked origin); the first tab is
    // the right answer then.
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

/** The sentence under a tab's name. The sync tab's is about a SERVER pushing
 *  to a remote, which is not what Backup & sync means on a phone holding the
 *  repository itself. */
export function tabIntro(tab: string, pocket: boolean): I18nKey {
  return pocket && tab === "sync" ? "pocketSyncNote" : (TABS.find((s) => s.id === tab)?.intro ?? "introAppearance");
}

/** Bring one row into view and MARK it for a moment, inside `root`.
 *  Not one frame but up to a second of them: the desktop's rows under "This
 *  app" (settings/AboutTab.tsx) are drawn only once the bridge has answered,
 *  and an IPC round-trip is longer than a frame. A search that switched the
 *  section and then looked once found nothing there and scrolled to nothing —
 *  the exact failure the index exists to prevent.
 *
 *  A row behind a section's Advanced line is inside a closed `<details>`:
 *  the line is opened first, or the scroll lands on a row with no height. A
 *  PART folded into a row that is not drawn right now (the launch note while
 *  "Open on launch" names no note) has nothing to land on, so the host row
 *  it belongs to — `fallback` — is marked instead. */
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
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.classList.add("s-smodal__row--found");
    window.setTimeout(() => row.classList.remove("s-smodal__row--found"), 1600);
  };
  requestAnimationFrame(look);
}
