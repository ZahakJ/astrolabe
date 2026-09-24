// What each screen is called — in its top bar and in the document title, the
// latter being what a phone's task switcher and a screen reader announce on
// every navigation. One function per shape, so the bar and the tab agree.

import { noteLabelOf } from "../../shared/noteFormat.ts";
import { t, type I18nKey } from "../i18n.ts";
import { isBookPath, isGraphTab, isMediaTab, isOrbitsTab, isReviewWeekTab, isRoutinesTab, orbitsSessionOf } from "../workspace.ts";
import type { Screen, TabId } from "./nav.ts";
import { TABS } from "../components/settings/tabs.ts";

export const TAB_LABEL: Record<TabId, I18nKey> = {
  today: "phTabToday",
  notes: "phTabNotes",
  search: "phTabSearch",
  calendar: "calendar",
  more: "phTabMore",
};

function base(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** What a surface is called in its top bar, and whether that name is the
 *  reader's own words (a note, a book) rather than chrome. */
export function surfaceTitle(tab: string): { title: string; user: boolean } {
  if (tab === "~library") return { title: t("bookLibrary"), user: false };
  if (isGraphTab(tab)) return { title: t("docTitleGraph"), user: false };
  if (isMediaTab(tab)) return { title: t("media"), user: false };
  if (isRoutinesTab(tab)) return { title: t("routines"), user: false };
  if (isReviewWeekTab(tab)) return { title: t("reviewWeek"), user: false };
  if (isOrbitsTab(tab)) {
    const session = orbitsSessionOf(tab);
    if (session === null) return { title: t("orbits"), user: false };
    if (session.path === "*") return { title: t("orbitsEverything"), user: false };
    return { title: noteLabelOf(base(session.path)), user: true };
  }
  return { title: isBookPath(tab) ? base(tab) : noteLabelOf(base(tab)), user: true };
}

export function screenTitle(screen: Screen): string {
  switch (screen.kind) {
    case "root":
      return t(TAB_LABEL[screen.tab]);
    case "note":
      return noteLabelOf(base(screen.path));
    case "folder":
      return base(screen.path);
    case "tag":
      return `#${screen.tag}`;
    case "surface":
      return surfaceTitle(screen.tab).title;
    case "settings":
      return settingsTitle(screen.section);
    case "deck":
    case "sigil":
    case "tracker":
      return noteLabelOf(base(screen.path));
  }
}

/** Settings, or one of its sections by the name the rail gives it. */
export function settingsTitle(section: string): string {
  const tab = TABS.find((s) => s.id === section);
  return tab ? t(tab.key) : t("siteSettings");
}
