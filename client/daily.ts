// PERIODIC NOTES: today's note, this week's note, and the days around them.
//
// The daily note was `daily/YYYY-MM-DD.md` and nothing else. Now the folder,
// the format and the template are settings (Settings → Vault → Templates),
// a weekly note exists on the same terms, and the palette walks to
// yesterday's and tomorrow's. The FILENAME stays what the format says — ISO
// by default, Gregorian and Western digits always (shared/periodic.ts) —
// because a filename is an address; the Hijri date is printed beside it.
//
// Settings arrive asynchronously (one /api/settings fetch, cached by
// client/templates.ts). The synchronous readers below (the palette's hint,
// the sidebar's Hijri label) use the defaults until the first fetch lands
// and the cache is primed, which every door through here does first.

import { createNote } from "./api.ts";
import { getDateCalendar, siteDate } from "./dates.ts";
import { collectNotes } from "./editor/links.ts";
import { t } from "./i18n.ts";
import {
  DAILY_FOLDER_DEFAULT,
  DAILY_FORMAT_DEFAULT,
  WEEKLY_FORMAT_DEFAULT,
  periodicDateOf,
  periodicPath,
  weekMonday,
} from "../shared/periodic.ts";
import { useStore } from "./state.ts";
import { applyDefaultTemplate } from "./templateActions.ts";
import { templateSettings } from "./templates.ts";
import { toast } from "./toast.ts";

export type PeriodKind = "day" | "week";

interface Periodic {
  folder: string;
  dailyFormat: string;
  dailyTemplate: string | null;
  weeklyFormat: string | null;
  weeklyTemplate: string | null;
}

let cached: Periodic = { folder: DAILY_FOLDER_DEFAULT, dailyFormat: DAILY_FORMAT_DEFAULT, dailyTemplate: null, weeklyFormat: WEEKLY_FORMAT_DEFAULT, weeklyTemplate: null };

/** Prime the cache from the instance's settings; safe to call often. */
export async function loadPeriodic(): Promise<Periodic> {
  try {
    const s = await templateSettings();
    cached = {
      folder: s.dailyFolder ?? DAILY_FOLDER_DEFAULT,
      dailyFormat: s.dailyFormat ?? DAILY_FORMAT_DEFAULT,
      dailyTemplate: s.dailyTemplate,
      weeklyFormat: s.weeklyFormat,
      weeklyTemplate: s.weeklyTemplate,
    };
  } catch {
    // settings unreachable: the defaults stand, as they always did
  }
  return cached;
}

/** The daily note's path for `date`, in local time. */
export function dailyNotePath(date = new Date()): string {
  return periodicPath(cached.folder, cached.dailyFormat, date);
}

/** This week's note, or null when weekly notes are off (an empty format). */
export function weeklyNotePath(date = new Date()): string | null {
  if (!cached.weeklyFormat) return null;
  return periodicPath(cached.folder, cached.weeklyFormat, weekMonday(date));
}

/** The date a daily (or weekly) note path names, or null. Local noon, not
 *  UTC midnight: the filename was built from LOCAL date parts, so reading it
 *  back as UTC would shift the day for every reader off Greenwich — which
 *  for a Hijri rendering is a different month name, not a rounding error. */
export function dailyNoteDate(path: string): Date | null {
  return periodicDateOf(cached.folder, cached.dailyFormat, path) ?? (cached.weeklyFormat ? periodicDateOf(cached.folder, cached.weeklyFormat, path) : null);
}

/** What a daily note is CALLED on screen when the instance prints another
 *  calendar — "٢ صفر ١٤٤٨ هـ" for `daily/2026-08-16.md`. Null in gregorian
 *  mode, deliberately: there the filename already IS the date the reader
 *  asked for. Null for anything that is not a periodic note. */
export function dailyNoteLabel(path: string): string | null {
  if (getDateCalendar() === "gregorian") return null;
  const date = dailyNoteDate(path);
  if (!date) return null;
  return siteDate(date, useStore.getState().blogLocale, { dateStyle: "long" });
}

/** Open (or create) the periodic note for `kind`, `offset` periods from
 *  the reference date — today, unless the open note is itself a periodic
 *  note, in which case yesterday/tomorrow walk FROM it. */
export async function openPeriodicNote(kind: PeriodKind = "day", offset = 0): Promise<void> {
  await loadPeriodic();
  const store = useStore.getState();
  const from = (store.openPath && dailyNoteDate(store.openPath)) || new Date();
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  if (kind === "day") date.setDate(date.getDate() + offset);
  else date.setDate(date.getDate() + offset * 7);
  const path = kind === "day" ? dailyNotePath(date) : weeklyNotePath(date);
  if (path === null) {
    toast(t("weeklyNotesOff"));
    return;
  }
  const template = kind === "day" ? cached.dailyTemplate : cached.weeklyTemplate;
  const exists = collectNotes(store.tree).some((n) => n.path === path);
  if (!exists && !store.admin) {
    toast(t("noDailyNote"));
    return;
  }
  if (!exists) {
    try {
      await createNote(path);
      // THE TEMPLATE, before the note opens (the store's rule: the editor
      // must load the templated content, not an empty buffer it is told
      // about afterwards). The period's own template when one is set, else
      // the default template for new notes — the one hole this door used to
      // have. Called here rather than through `store.createNote`, which is
      // guarded and would swallow the 409 this function falls through on.
      await applyDefaultTemplate(path, template);
      await store.loadTree();
      if (store.readingMode) store.setReadingMode(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (!/exists/i.test(message)) {
        console.error(`astrolabe: creating periodic note ${path} failed`, err);
        toast(t("dailyNoteFailed"));
        return;
      }
    }
  }
  store.openNote(path);
}

/** Open today's daily note, creating it first if it doesn't exist yet. */
export function openDailyNote(): Promise<void> {
  return openPeriodicNote("day", 0);
}
