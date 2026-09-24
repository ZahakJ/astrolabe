// THE PANEL'S TABS — their order, their names and one sentence each, and the
// per-device memory of the last one shown. Read by both hosts: the desktop's
// dialog (SettingsModal.tsx) draws them as a rail, the phone shell's Settings
// screen as a pushed list of sections. `check-docs` reads TABS out of this
// file; the settings index reads the render switch in ./TabBody.tsx.

import { localeNum, t, tf, type I18nKey } from "../../i18n.ts";

/** The tabs. The rail used to scroll a single ~2,700px document, which made it
 *  a table of contents for a form nobody could see the end of; TABS make each
 *  one a short read and the rail navigation rather than a bookmark. Each tab
 *  opens with one sentence saying what it DECIDES, because "Language" and
 *  "Publishing" are category names, not explanations.
 *
 *  EIGHT, AND THE FIRST ONE IS THE POINT. Six of them held one long form under
 *  one Save button — and three rows inside that form were not part of it at
 *  all: your theme, your editor language and the sidebar's edge live in this
 *  browser's localStorage and commit on click. Nothing distinguished them from
 *  the thirty-seven server settings they sat between, so the panel's most
 *  common question was "did that save?" about rows that had already saved, and
 *  "why did nothing happen?" about rows that had not. The device preferences
 *  are their own tab now, and it opens first: this browser is what a reader
 *  can change without consequence to anyone else, and it is where vim, the
 *  floating toolbar and reading-view numbering — three preferences that were
 *  reachable only from a status-bar pill, a palette row and an outline button
 *  — are finally listed.
 *
 *  The rest split by the QUESTION each answers rather than by the machinery
 *  behind it: what the site is called and looks like (Site — its name and
 *  marks, the theme visitors land on, its type), what it speaks and how it
 *  writes dates (Language & dates), what a visitor may see (Publishing), how
 *  the public site groups notes (Collections — categories, hand-made
 *  collections, the library), which folders it writes into (Vault), how it is
 *  backed up (Backup), and what it IS (About). "Appearance & language" is gone
 *  as a name: half of it was this browser's and half of it was the site's,
 *  which is the confusion the split exists to end.
 *
 *  RE-CUT ONCE MORE (3.15): the eight were uneven — Identity five rows and
 *  Typography five, Publishing twenty-one — and a rail is a promise about
 *  where things are, which a tab nobody scrolls to the end of breaks. Identity
 *  and Typography are one tab (Site) because they answer one question; the
 *  back half of Publishing is its own tab (Collections) because it answered a
 *  different one. Every row kept its key, its default and its behaviour; only
 *  the tab it sits on moved, and the settings index (`settingsIndex.ts`)
 *  carries the new map so a search and `openSettingsAt` land on the row
 *  wherever it went. */
export interface Tab {
  id: string;
  key: I18nKey;
  /** One-sentence intro under the tab's heading. */
  intro: I18nKey;
}

export const TABS: Tab[] = [
  { id: "device", key: "tabDevice", intro: "introDevice" },
  { id: "site", key: "tabSite", intro: "introSite" },
  { id: "language", key: "tabLanguage", intro: "introLanguage" },
  { id: "publishing", key: "tabPublishing", intro: "introPublishing" },
  { id: "collections", key: "tabCollections", intro: "introCollections" },
  { id: "vault", key: "tabVault", intro: "introVault" },
  { id: "sync", key: "groupSync", intro: "syncNote" },
  // Its own tab rather than rows on Vault (14 rows already): which models
  // read the notes and answer about them is its own question (docs/ask.md).
  { id: "ask", key: "tabAsk", intro: "introAsk" },
  { id: "about", key: "tabAbout", intro: "introAbout" },
];

/** THE TWO TABS A POCKET VAULT HAS NOT GOT.
 *
 *  Both answer one question — what may a VISITOR see — and a repository cloned
 *  onto a phone has no visitors, no public address and no route that would
 *  serve one: the pocket server answers /api/publish, /api/posts, /api/design,
 *  /api/collections and /api/library with a 501 and the reason. Every row on
 *  them is refused by `PATCH /api/settings` there too, so drawing the tabs
 *  would be offering a form whose Save cannot succeed.
 *
 *  They stay in TABS and in the settings index — they are real tabs of this
 *  product, and the index is generated from the source rather than from a
 *  render. What keeps a SEARCH from landing on them is `mode: "instance"`,
 *  which scripts/settings-index.mjs reads off their `!pocket` render
 *  condition. */
export const POCKET_HIDDEN_TABS: ReadonlySet<string> = new Set(["publishing", "collections", "ask"]);
// (Ask joined them in 3.24: it needs Ollama on a computer, and a phone's
// pocket server has no /api/ask to point one at.)

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
    const id = localStorage.getItem(TAB_STORAGE);
    if (id !== null && TABS.some((s) => s.id === id)) return id;
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
  return pocket && tab === "sync" ? "pocketSyncNote" : (TABS.find((s) => s.id === tab)?.intro ?? "introDevice");
}

/** Bring one row into view and MARK it for a moment, inside `root`.
 *  Not one frame but up to a second of them: the desktop's rows under "This
 *  app" (settings/DeviceTab.tsx) are drawn only once the bridge has answered,
 *  and an IPC round-trip is longer than a frame. A search that switched the
 *  tab and then looked once found nothing there and scrolled to nothing — the
 *  exact failure the index exists to prevent. */
export function revealRow(root: HTMLElement | null, label: string): void {
  const deadline = performance.now() + 1000;
  const look = (): void => {
    const row = root?.querySelector<HTMLElement>(`[data-setting="${CSS.escape(label)}"]`);
    if (!row) {
      if (performance.now() < deadline) requestAnimationFrame(look);
      return;
    }
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.classList.add("s-smodal__row--found");
    window.setTimeout(() => row.classList.remove("s-smodal__row--found"), 1600);
  };
  requestAnimationFrame(look);
}
