// ROUTINES — a plan you follow by the day, and the log of what you did.
//
// The owner: "some sorta daily tracker. A way to add per-day details on
// specific activities, and just like media we can have templates for specific
// things to track, for example an exercise tracker". A ```tracker is a card
// about ONE WORK (a book, a game) and how far through it you are; a
// ```routine is a card about YOUR DAYS — what today asks of you, what you
// ticked, the streak, the week, the last twelve weeks as a heatmap.
//
// Two fences, one note, no store. The PLAN is a ```routine fence: a title, a
// kind, the columns of your week (`slots: morning, evening`), the things you
// do every day (`items:`), a plan per weekday, the numbers you want to keep
// per day (`fields: minutes:number, weight:number:kg, mood:scale:5`) and a
// weekly target. The LOG is a ```routine-log fence that the app writes right
// under the plan the first time you tick something — one line per day:
//
//     2026-09-13 | done: morning, evening | minutes: 62 | weight: 84.2 | Felt strong
//
// which is the same rule the tracker keeps ("the note IS the state"): tick a
// box and a line changes in your file; edit the line by hand and the card
// follows. Open the same vault in Obsidian and both fences are readable
// code blocks that say everything they say here.
//
// PURE, like shared/tracker.ts, and load-bearing twice for the same reasons:
// `node --test` (tests/routine.test.ts) and server/indexer.ts both load it,
// and neither has a DOM. Syntax is tolerant and line-based, deliberately not
// YAML: one `key: value` per line, a weekday's slots indented under it,
// unknown keys ignored, `notes: |` a block scalar.

import { closesFence, fenceOpener, sourceLines } from "./fences.ts";
import type { FolderIcon } from "./folderIcons.ts";

// ── Days of the week ────────────────────────────────────────────────────────

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** The words a plan may open a weekday line with, in both languages. */
const WEEKDAY_WORDS: Record<string, Weekday> = {
  mon: "mon", monday: "mon", "الاثنين": "mon", "الإثنين": "mon", "اثنين": "mon",
  tue: "tue", tues: "tue", tuesday: "tue", "الثلاثاء": "tue", "ثلاثاء": "tue",
  wed: "wed", wednesday: "wed", "الأربعاء": "wed", "الاربعاء": "wed", "أربعاء": "wed",
  thu: "thu", thur: "thu", thurs: "thu", thursday: "thu", "الخميس": "thu", "خميس": "thu",
  fri: "fri", friday: "fri", "الجمعة": "fri", "جمعة": "fri",
  sat: "sat", saturday: "sat", "السبت": "sat", "سبت": "sat",
  sun: "sun", sunday: "sun", "الأحد": "sun", "الاحد": "sun", "أحد": "sun",
};

export function weekdayOf(word: string): Weekday | null {
  return WEEKDAY_WORDS[word.trim().toLowerCase()] ?? null;
}

/** The weekday of an ISO date, read in UTC so the answer never depends on
 *  the machine's zone: 2026-09-13 is a Sunday everywhere. */
export function weekdayOfDate(iso: string): Weekday {
  const d = new Date(`${iso}T00:00:00Z`);
  return (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[d.getUTCDay()];
}

/** A local calendar date as `YYYY-MM-DD` — the log's key. Local, like the
 *  daily note's path (client/daily.ts): a day is where the reader is. */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** `iso` moved by `days`, in UTC arithmetic (no DST surprises). */
export function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The first day of the week `iso` falls in. The week starts on Monday for
 *  an English instance and on Saturday for an Arabic one — the working week
 *  of each reader, not a fact about calendars. */
export function weekStart(iso: string, lang: "en" | "ar" = "en"): string {
  const order = weekOrder(lang);
  const offset = order.indexOf(weekdayOfDate(iso));
  return shiftDate(iso, -offset);
}

/** The seven weekdays in the order a reader of `lang` lays out a week. */
export function weekOrder(lang: "en" | "ar" = "en"): readonly Weekday[] {
  return lang === "ar" ? ["sat", "sun", "mon", "tue", "wed", "thu", "fri"] : WEEKDAYS;
}

// ── Kinds ───────────────────────────────────────────────────────────────────

/** The built-in kinds — each one is also a preset the form offers. Anything
 *  else keeps the author's word and gets the ✦ glyph, as tracker kinds do. */
export type RoutineKind = "exercise" | "habit" | "prayer" | "sleep" | "water" | "mood" | "reading" | "study";

export const ROUTINE_KINDS: Record<RoutineKind, FolderIcon> = {
  exercise: "heart",
  habit: "leaf",
  prayer: "star",
  sleep: "moon",
  water: "flask",
  mood: "sparkle",
  reading: "book",
  study: "scroll",
};

const KIND_WORDS: Record<string, RoutineKind> = {
  exercise: "exercise", workout: "exercise", fitness: "exercise", gym: "exercise", training: "exercise",
  "رياضة": "exercise", "تمرين": "exercise", "تمارين": "exercise",
  habit: "habit", habits: "habit", routine: "habit", "عادة": "habit", "عادات": "habit", "روتين": "habit",
  prayer: "prayer", prayers: "prayer", salah: "prayer", salat: "prayer", "صلاة": "prayer", "الصلاة": "prayer", "صلوات": "prayer",
  sleep: "sleep", "نوم": "sleep", "النوم": "sleep",
  water: "water", hydration: "water", "ماء": "water", "الماء": "water", "شرب": "water",
  mood: "mood", journal: "mood", feelings: "mood", "مزاج": "mood", "المزاج": "mood", "يوميات": "mood",
  reading: "reading", read: "reading", "قراءة": "reading", "القراءة": "reading",
  study: "study", learning: "study", "دراسة": "study", "مذاكرة": "study", "تعلم": "study",
};

export function foldRoutineKind(kind: string | null): RoutineKind | null {
  if (kind === null) return null;
  return KIND_WORDS[kind.trim().toLowerCase()] ?? null;
}

export function routineIcon(kind: string | null): FolderIcon {
  const key = foldRoutineKind(kind);
  return key ? ROUTINE_KINDS[key] : "sparkle";
}

// ── The model ───────────────────────────────────────────────────────────────

export type RoutineFieldType = "number" | "scale" | "text" | "check";

/** One value kept per day: `minutes:number`, `weight:number:kg`,
 *  `mood:scale:5`, `soreness:text`, `stretched:check`. */
export interface RoutineField {
  /** The key as written, which is also how the log names it. */
  key: string;
  type: RoutineFieldType;
  /** A unit for a number (`kg`), the ceiling for a scale (5), null else. */
  unit: string | null;
  max: number | null;
}

/** One thing a day's checklist asks for: an every-day item, or a slot of the
 *  weekday's plan. `key` is what the log's `done:` names. */
export interface RoutineTask {
  /** True for the reading task a `book:` line adds: its text and its nudge
   *  come from the tracker at render time. */
  book?: boolean;
  key: string;
  /** The plan text for a weekday slot ("60 min brisk walk"); null for a bare
   *  every-day item, whose key is its whole text. */
  text: string | null;
  /** The slot this came from, or null for an every-day item. */
  slot: string | null;
}

export interface RoutinePlan {
  title: string;
  kind: string | null;
  kindKey: RoutineKind | null;
  icon: FolderIcon;
  /** The declared columns of the week, in order; may be empty. */
  slots: string[];
  /** Every-day items, in order. */
  items: string[];
  /** The plan per weekday: slot → text, in the order written. A weekday with
   *  no entry is a rest day unless `items` says otherwise. */
  week: Record<Weekday, { slot: string; text: string }[]>;
  fields: RoutineField[];
  /** Days per week aimed for, or null. */
  target: number | null;
  /** `book:` — a tracked work (its tracker's title, `[[…]]` allowed). The
   *  day's checklist gains "Read N pages of it", N from the tracker's pace,
   *  and ticking it nudges the tracker (client/reading/routine.ts). */
  book: string | null;
  /** `notes: |` markdown, verbatim. */
  notes: string | null;
}

export interface RoutineEntry {
  date: string;
  done: string[];
  skipped: string[];
  /** Field key (as declared) → value as written. */
  values: Record<string, string>;
  note: string | null;
}

export type DayStatus = "complete" | "partial" | "missed" | "rest" | "none";

// ── Digits & small parsers ──────────────────────────────────────────────────

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export function foldDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (ch) => String(ARABIC_DIGITS.indexOf(ch)));
}

const FIELD_RE = /^(\s*)([^\s:][^:]*?)\s*:(.*)$/;

function splitList(raw: string): string[] {
  return raw
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function parseField(spec: string): RoutineField | null {
  const parts = spec.split(":").map((p) => p.trim());
  const key = parts[0] ?? "";
  if (key === "") return null;
  const typeWord = (parts[1] ?? "text").toLowerCase();
  const extra = parts[2] ?? "";
  let type: RoutineFieldType = "text";
  if (["number", "num", "n", "رقم", "عدد"].includes(typeWord)) type = "number";
  else if (["scale", "rating", "مقياس", "تقييم"].includes(typeWord)) type = "scale";
  else if (["check", "bool", "yes", "تحقق"].includes(typeWord)) type = "check";
  else if (["text", "نص"].includes(typeWord)) type = "text";
  else if (/^\d+$/.test(foldDigits(typeWord))) {
    // `mood:5` — a bare ceiling is a scale.
    return { key, type: "scale", unit: null, max: Number(foldDigits(typeWord)) };
  } else if (typeWord !== "") {
    // `weight:kg` — a bare word after a key is a number's unit.
    return { key, type: "number", unit: typeWord, max: null };
  }
  if (type === "scale") {
    const max = Number(foldDigits(extra));
    return { key, type, unit: null, max: Number.isFinite(max) && max >= 2 ? Math.min(10, Math.round(max)) : 5 };
  }
  if (type === "number") return { key, type, unit: extra === "" ? null : extra, max: null };
  return { key, type, unit: null, max: null };
}

function parseTarget(raw: string): number | null {
  const m = /(\d+)/.exec(foldDigits(raw));
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 7 ? n : null;
}

// ── The plan ────────────────────────────────────────────────────────────────

function emptyWeek(): RoutinePlan["week"] {
  return { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
}

/** Parse a ```routine body. Null when it says nothing a card could draw: no
 *  title, no items and no weekday — the $$-math rule, so an unfinished fence
 *  reads as its own source rather than as an empty card. */
export function parseRoutine(body: string): RoutinePlan | null {
  const lines = body.split(/\r?\n/);
  let title: string | null = null;
  let kind: string | null = null;
  const slots: string[] = [];
  const items: string[] = [];
  const week = emptyWeek();
  const fields: RoutineField[] = [];
  let target: number | null = null;
  let book: string | null = null;
  let notes: string | null = null;
  let day: Weekday | null = null;
  let anyPlan = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const m = FIELD_RE.exec(line);
    if (!m) {
      // A bare line at the top is the title, as it is for a tracker.
      if (title === null && day === null && !/^\s/.test(line)) title = line.trim();
      continue;
    }
    const indent = m[1].length;
    const key = m[2].trim();
    const value = m[3].trim();
    const lower = key.toLowerCase();

    if (indent > 0 && day !== null) {
      // A slot of the open weekday.
      if (value !== "") {
        week[day].push({ slot: key, text: value });
        anyPlan = true;
      }
      continue;
    }
    day = null;
    const wd = weekdayOf(key);
    if (wd !== null) {
      day = wd;
      if (value !== "") {
        // `monday: 60 min walk` — one unnamed slot.
        week[wd].push({ slot: "", text: value });
        anyPlan = true;
      }
      continue;
    }
    switch (lower) {
      case "title":
      case "عنوان":
        title = value || title;
        break;
      case "kind":
      case "type":
      case "نوع":
        kind = value || null;
        break;
      case "slots":
      case "columns":
      case "فترات":
        for (const s of splitList(value)) if (!slots.includes(s)) slots.push(s);
        break;
      case "items":
      case "daily":
      case "every day":
      case "everyday":
      case "يوميًا":
      case "يوميا":
      case "بنود":
        for (const s of splitList(value)) if (!items.includes(s)) items.push(s);
        if (items.length > 0) anyPlan = true;
        break;
      case "fields":
      case "track":
      case "حقول":
        for (const spec of splitList(value)) {
          const f = parseField(spec);
          if (f && !fields.some((g) => g.key.toLowerCase() === f.key.toLowerCase())) fields.push(f);
        }
        break;
      case "target":
      case "goal":
      case "هدف":
        target = parseTarget(value);
        break;
      case "book":
      case "work":
      case "كتاب":
        book = value.replace(/^\[\[|\]\]$/g, "").split("|")[0].trim() || null;
        if (book) anyPlan = true;
        break;
      case "notes":
      case "ملاحظات":
        if (value === "|" || value === ">" || value === "") {
          const buf: string[] = [];
          let j = i + 1;
          for (; j < lines.length; j++) {
            if (lines[j].trim() !== "" && !/^\s/.test(lines[j])) break;
            buf.push(lines[j].replace(/^ {1,2}/, ""));
          }
          i = j - 1;
          const text = buf.join("\n").trim();
          notes = text === "" ? null : text;
        } else notes = value;
        break;
      default:
        break;
    }
  }
  if (title === null && !anyPlan) return null;
  // Slots the week uses but the header never declared still get a column,
  // in the order they first appear, so a plan without `slots:` lays out.
  for (const wd of WEEKDAYS) for (const s of week[wd]) if (s.slot !== "" && !slots.includes(s.slot)) slots.push(s.slot);
  return {
    title: title ?? "",
    kind,
    kindKey: foldRoutineKind(kind),
    icon: routineIcon(kind),
    slots,
    items,
    week,
    fields,
    target,
    book,
    notes,
  };
}

/** What `date` asks of the reader: the every-day items, then the weekday's
 *  slots. The key of a slot is the slot's name (`morning`); of an unnamed
 *  weekday line, the weekday itself; of an item, the item. */
export function tasksFor(plan: RoutinePlan, iso: string): RoutineTask[] {
  const out: RoutineTask[] = [];
  if (plan.book !== null) out.push({ key: "read", text: plan.book, slot: null, book: true });
  for (const item of plan.items) out.push({ key: item, text: null, slot: null });
  const wd = weekdayOfDate(iso);
  for (const s of plan.week[wd]) out.push({ key: s.slot === "" ? wd : s.slot, text: s.text, slot: s.slot === "" ? null : s.slot });
  return out;
}

function sameKey(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** How `date` went: every task ticked → complete; some → partial; a day with
 *  tasks and nothing ticked, in the past → missed; a day the plan asks
 *  nothing of → rest; today or the future with nothing yet → none. A day
 *  whose every task was SKIPPED on purpose is missed, not complete. */
export function dayStatus(plan: RoutinePlan, entry: RoutineEntry | null, iso: string, today: string): DayStatus {
  const tasks = tasksFor(plan, iso);
  if (tasks.length === 0) {
    // With no checklist the day is judged by whether anything was logged.
    if (entry && (Object.keys(entry.values).length > 0 || entry.note !== null || entry.done.length > 0)) return "complete";
    return "rest";
  }
  const done = tasks.filter((t) => entry?.done.some((d) => sameKey(d, t.key))).length;
  if (done === tasks.length) return "complete";
  if (done > 0) return "partial";
  if (iso < today) return "missed";
  return "none";
}

/** 0–1: the share of the day's tasks ticked; 1 for a logged rest day. */
export function dayRatio(plan: RoutinePlan, entry: RoutineEntry | null, iso: string): number {
  const tasks = tasksFor(plan, iso);
  if (tasks.length === 0) return entry && (entry.done.length > 0 || Object.keys(entry.values).length > 0 || entry.note !== null) ? 1 : 0;
  const done = tasks.filter((t) => entry?.done.some((d) => sameKey(d, t.key))).length;
  return done / tasks.length;
}

// ── The log ─────────────────────────────────────────────────────────────────

const DATE_RE = /^\s*(\d{4}-\d{2}-\d{2})\s*(?:\||$)/;

/** Parse one ```routine-log body against its plan's fields. Lines that do
 *  not open with a date are ignored (a comment, a heading someone typed);
 *  the LAST line for a date wins, so a hand-written duplicate is harmless. */
export function parseRoutineLog(body: string, fields: RoutineField[]): RoutineEntry[] {
  const byDate = new Map<string, RoutineEntry>();
  for (const raw of body.split(/\r?\n/)) {
    const entry = parseLogLine(raw, fields);
    if (entry) byDate.set(entry.date, entry);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function parseLogLine(raw: string, fields: RoutineField[]): RoutineEntry | null {
  const line = foldDigits(raw);
  const m = DATE_RE.exec(line);
  if (!m) return null;
  const entry: RoutineEntry = { date: m[1], done: [], skipped: [], values: {}, note: null };
  const rest = line.slice(m[0].length);
  const segments = rest.split("|").map((s) => s.trim()).filter((s) => s !== "");
  const notes: string[] = [];
  for (const seg of segments) {
    const colon = seg.indexOf(":");
    const key = colon === -1 ? "" : seg.slice(0, colon).trim().toLowerCase();
    const value = colon === -1 ? "" : seg.slice(colon + 1).trim();
    if (key === "done" || key === "did" || key === "تم" || key === "أنجزت") {
      for (const k of splitList(value)) if (!entry.done.some((d) => sameKey(d, k))) entry.done.push(k);
      continue;
    }
    if (key === "skipped" || key === "skip" || key === "تخطيت" || key === "تجاوزت") {
      for (const k of splitList(value)) if (!entry.skipped.some((d) => sameKey(d, k))) entry.skipped.push(k);
      continue;
    }
    if (key === "note" || key === "notes" || key === "ملاحظة") {
      if (value !== "") notes.push(value);
      continue;
    }
    const field = key === "" ? undefined : fields.find((f) => sameKey(f.key, key));
    if (field) {
      if (value !== "") entry.values[field.key] = value;
      continue;
    }
    notes.push(seg);
  }
  entry.note = notes.length === 0 ? null : notes.join(" | ");
  return entry;
}

/** One log line, in the order the parser reads: date, done, skipped, the
 *  fields in the plan's order, then the note. A note holding ` | ` would
 *  split on read, so its bars are softened to `/`. */
export function formatLogLine(entry: RoutineEntry, fields: RoutineField[]): string {
  const parts: string[] = [entry.date];
  if (entry.done.length > 0) parts.push(`done: ${entry.done.join(", ")}`);
  if (entry.skipped.length > 0) parts.push(`skipped: ${entry.skipped.join(", ")}`);
  const seen = new Set<string>();
  for (const f of fields) {
    const v = entry.values[f.key];
    if (v !== undefined && v !== "") {
      parts.push(`${f.key}: ${v.replace(/\|/g, "/")}`);
      seen.add(f.key);
    }
  }
  for (const [k, v] of Object.entries(entry.values)) {
    if (!seen.has(k) && v !== "") parts.push(`${k}: ${v.replace(/\|/g, "/")}`);
  }
  if (entry.note !== null && entry.note.trim() !== "") parts.push(entry.note.replace(/\|/g, "/").trim());
  return parts.join(" | ");
}

/** A change to one day, from a checkbox, a field or the note box. `done`
 *  toggles are expressed as the full lists; a field set to "" is removed. */
export interface EntryPatch {
  date: string;
  done?: string[];
  skipped?: string[];
  values?: Record<string, string | null>;
  note?: string | null;
}

export function mergeEntry(existing: RoutineEntry | null, patch: EntryPatch): RoutineEntry {
  const base: RoutineEntry = existing ?? { date: patch.date, done: [], skipped: [], values: {}, note: null };
  const next: RoutineEntry = {
    date: patch.date,
    done: patch.done !== undefined ? [...patch.done] : [...base.done],
    skipped: patch.skipped !== undefined ? [...patch.skipped] : [...base.skipped],
    values: { ...base.values },
    note: patch.note !== undefined ? (patch.note === null || patch.note.trim() === "" ? null : patch.note.trim()) : base.note,
  };
  for (const [k, v] of Object.entries(patch.values ?? {})) {
    if (v === null || v.trim() === "") delete next.values[k];
    else next.values[k] = v.trim();
  }
  // A task cannot be both ticked and skipped.
  next.skipped = next.skipped.filter((s) => !next.done.some((d) => sameKey(d, s)));
  return next;
}

/** True when an entry says nothing at all — its line can be dropped. */
export function entryIsEmpty(entry: RoutineEntry): boolean {
  return entry.done.length === 0 && entry.skipped.length === 0 && Object.keys(entry.values).length === 0 && entry.note === null;
}

/** `body` (a ```routine-log fence body) with `entry`'s line replaced, or
 *  appended in date order; an empty entry removes the line. Every other
 *  line survives byte for byte, CRLF included. */
export function upsertLogLine(body: string, entry: RoutineEntry, fields: RoutineField[]): string {
  const eol = /\r\n/.test(body) ? "\r\n" : "\n";
  const lines = body === "" ? [] : body.replace(/\r?\n$/, "").split(/\r?\n/);
  const text = entryIsEmpty(entry) ? null : formatLogLine(entry, fields);
  const out: string[] = [];
  let placed = false;
  for (const line of lines) {
    const m = DATE_RE.exec(foldDigits(line));
    if (m && m[1] === entry.date) {
      if (!placed && text !== null) out.push(text);
      placed = true;
      continue;
    }
    // Keep the log in date order: the new line goes before the first later
    // date, so a hand-kept ascending log stays ascending.
    if (!placed && text !== null && m && m[1] > entry.date) {
      out.push(text);
      placed = true;
    }
    out.push(line);
  }
  if (!placed && text !== null) out.push(text);
  return out.length === 0 ? "" : out.join(eol) + eol;
}

// ── Statistics ──────────────────────────────────────────────────────────────

export interface RoutineStats {
  /** Consecutive complete days ending today or yesterday; rest days do not
   *  break it, and a not-yet-logged today does not either. */
  streak: number;
  /** Complete days this week so far, and the week's plan-days or target. */
  week: { done: number; of: number };
  /** The last `weeks` weeks, oldest first, each a row of seven cells. */
  heat: { date: string; ratio: number; status: DayStatus }[][];
  /** Complete days in the last 30, and days the plan asked something of. */
  month: { done: number; of: number };
  /** Every date logged, count. */
  logged: number;
}

function entryMap(entries: RoutineEntry[]): Map<string, RoutineEntry> {
  const m = new Map<string, RoutineEntry>();
  for (const e of entries) m.set(e.date, e);
  return m;
}

export function routineStats(
  plan: RoutinePlan,
  entries: RoutineEntry[],
  today: string,
  lang: "en" | "ar" = "en",
  weeks = 12,
): RoutineStats {
  const map = entryMap(entries);
  // Days before the first entry were not tracked, and a plan that began
  // today must not open on twelve weeks of "missed": before `since` a day
  // is "none" — untracked — in the strip, the heat and the streak alike.
  const since = entries.length > 0 ? entries[0].date : today;
  const status = (iso: string): DayStatus => (iso < since ? "none" : dayStatus(plan, map.get(iso) ?? null, iso, today));

  // Streak: walk back from today; today counts if complete, is neutral if
  // not yet touched, and breaks it only if partial/missed.
  let streak = 0;
  let cursor = today;
  const todayStatus = status(today);
  if (todayStatus === "complete") streak++;
  else if (todayStatus === "partial") {
    // A half-done today neither adds nor breaks: the day is not over.
  }
  cursor = shiftDate(cursor, -1);
  for (let guard = 0; guard < 3660 && cursor >= since; guard++) {
    const s = status(cursor);
    if (s === "complete") streak++;
    else if (s === "rest") {
      // rest days are transparent
    } else break;
    cursor = shiftDate(cursor, -1);
  }

  // This week.
  const start = weekStart(today, lang);
  let weekDone = 0;
  let planDays = 0;
  for (let i = 0; i < 7; i++) {
    const iso = shiftDate(start, i);
    if (tasksFor(plan, iso).length > 0) planDays++;
    if (status(iso) === "complete") weekDone++;
  }
  const of = plan.target ?? planDays;

  // Heatmap: `weeks` rows ending with the current week.
  const heat: RoutineStats["heat"] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const rowStart = shiftDate(start, -7 * w);
    const row: RoutineStats["heat"][number] = [];
    for (let i = 0; i < 7; i++) {
      const iso = shiftDate(rowStart, i);
      row.push({ date: iso, ratio: dayRatio(plan, map.get(iso) ?? null, iso), status: status(iso) });
    }
    heat.push(row);
  }

  // Last 30 days.
  let monthDone = 0;
  let monthOf = 0;
  for (let i = 0; i < 30; i++) {
    const iso = shiftDate(today, -i);
    if (tasksFor(plan, iso).length > 0) monthOf++;
    if (status(iso) === "complete") monthDone++;
  }
  return { streak, week: { done: weekDone, of }, heat, month: { done: monthDone, of: monthOf }, logged: entries.length };
}

// ── Scanning a note ─────────────────────────────────────────────────────────

export type RoutineFenceKind = "routine" | "routine-log";

export function routineFenceKind(line: string): RoutineFenceKind | null {
  const m = /^\s*(?:`{3,}|~{3,})\s*([^\s`~]*)\s*$/.exec(line);
  if (!m) return null;
  const info = m[1].toLowerCase();
  return info === "routine" || info === "routine-log" ? info : null;
}

/** A plan and its log, paired: the log is the first ```routine-log after
 *  the plan and before the next plan. `index` counts plans only. */
export interface RoutineBlock {
  index: number;
  plan: RoutinePlan;
  entries: RoutineEntry[];
  /** True when the note carries a log fence for this plan. */
  hasLog: boolean;
}

/** Every routine in a note, in document order, each with its log. */
export function scanRoutines(md: string): RoutineBlock[] {
  const out: RoutineBlock[] = [];
  const lines = sourceLines(md);
  let open: RoutineBlock | null = null;
  for (let i = 0; i < lines.length; i++) {
    const fence = fenceOpener(lines[i]);
    if (!fence) continue;
    const kind = routineFenceKind(lines[i]);
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length && !closesFence(lines[j], fence); j++) body.push(lines[j]);
    if (kind === "routine") {
      const plan = parseRoutine(body.join("\n"));
      open = plan ? { index: out.length, plan, entries: [], hasLog: false } : null;
      if (open) out.push(open);
    } else if (kind === "routine-log" && open && !open.hasLog) {
      open.entries = parseRoutineLog(body.join("\n"), open.plan.fields);
      open.hasLog = true;
    }
    i = j;
  }
  return out;
}

// ── Editing a note's fences ─────────────────────────────────────────────────

function linesWithEol(body: string): string[] {
  return body.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

function splitEol(line: string): [string, string] {
  const eol = /(\r?\n)?$/.exec(line)?.[1] ?? "";
  return [line.slice(0, line.length - eol.length), eol];
}

export interface RoutineSpan {
  kind: RoutineFenceKind;
  /** Which plan this is, or belongs to (a log takes its plan's index). */
  index: number;
  /** Offsets of the whole fence: opener start → closer end (with its EOL). */
  start: number;
  end: number;
  /** Offsets of the body between the markers. */
  bodyStart: number;
  bodyEnd: number;
  body: string;
  /** The fence's own opener line, for re-use when a log is added. */
  opener: string;
  eol: string;
}

/** Where every routine and routine-log fence sits in a note's source. */
export function routineFenceSpans(md: string): RoutineSpan[] {
  const out: RoutineSpan[] = [];
  const lines = linesWithEol(md);
  let offset = 0;
  let planIndex = -1;
  let logged = false;
  for (let i = 0; i < lines.length; i++) {
    const [text, eol] = splitEol(lines[i]);
    const fence = fenceOpener(text);
    const start = offset;
    offset += lines[i].length;
    if (!fence) continue;
    const kind = routineFenceKind(text);
    const bodyStart = offset;
    let bodyEnd = bodyStart;
    let j = i + 1;
    for (; j < lines.length; j++) {
      const [t] = splitEol(lines[j]);
      if (closesFence(t, fence)) break;
      bodyEnd += lines[j].length;
    }
    const end = bodyEnd + (j < lines.length ? lines[j].length : 0);
    if (kind === "routine") {
      if (parseRoutine(md.slice(bodyStart, bodyEnd)) !== null) {
        planIndex++;
        logged = false;
        out.push({ kind, index: planIndex, start, end, bodyStart, bodyEnd, body: md.slice(bodyStart, bodyEnd), opener: text, eol: eol || "\n" });
      }
    } else if (kind === "routine-log" && planIndex >= 0 && !logged) {
      logged = true;
      out.push({ kind, index: planIndex, start, end, bodyStart, bodyEnd, body: md.slice(bodyStart, bodyEnd), opener: text, eol: eol || "\n" });
    }
    offset = end;
    i = j;
  }
  return out;
}

/** One text replacement: what to put where. Offsets are UTF-16 units, the
 *  same the editor counts in, so the widget dispatches it as it is. */
export interface TextEdit {
  from: number;
  to: number;
  insert: string;
}

/** The edit that records `patch` in the log of the `index`-th plan: the
 *  day's line replaced or added inside the existing log fence, or a whole
 *  new log fence written right under the plan when the note has none yet.
 *  Null when the note has no such plan, or nothing would change. */
export function logEditFor(md: string, index: number, patch: EntryPatch): TextEdit | null {
  const spans = routineFenceSpans(md);
  const plan = spans.find((s) => s.kind === "routine" && s.index === index);
  if (!plan) return null;
  const parsed = parseRoutine(plan.body);
  if (!parsed) return null;
  const log = spans.find((s) => s.kind === "routine-log" && s.index === index);
  const existing = log ? parseRoutineLog(log.body, parsed.fields) : [];
  const current = existing.find((e) => e.date === patch.date) ?? null;
  const merged = mergeEntry(current, patch);
  if (log) {
    const next = upsertLogLine(log.body, merged, parsed.fields);
    if (next === log.body) return null;
    return { from: log.bodyStart, to: log.bodyEnd, insert: next };
  }
  if (entryIsEmpty(merged)) return null;
  const eol = plan.eol;
  const marker = plan.opener.trim().startsWith("~") ? "~~~" : "```";
  const indent = /^\s*/.exec(plan.opener)?.[0] ?? "";
  const line = formatLogLine(merged, parsed.fields);
  // The plan's closer may be the last line of the file with no EOL; the log
  // then opens on its own line after one added.
  const closed = md.slice(plan.end - eol.length, plan.end) === eol;
  const insert = `${closed ? "" : eol}${eol}${indent}${marker}routine-log${eol}${indent}${line}${eol}${indent}${marker}${closed ? eol : ""}`;
  return { from: plan.end, to: plan.end, insert };
}

/** `md` with `edit` applied. */
export function applyEdit(md: string, edit: TextEdit): string {
  return md.slice(0, edit.from) + edit.insert + md.slice(edit.to);
}

/** `md` with the body of its `index`-th plan fence replaced. */
export function editRoutinePlan(md: string, index: number, body: string): string {
  const span = routineFenceSpans(md).find((s) => s.kind === "routine" && s.index === index);
  if (!span) return md;
  const eol = span.eol;
  const next = body.replace(/\r?\n/g, eol).replace(/\s+$/, "") + eol;
  if (next === span.body) return md;
  return md.slice(0, span.bodyStart) + next + md.slice(span.bodyEnd);
}

// ── Composing a plan ────────────────────────────────────────────────────────

/** The form's draft: everything a plan says, as strings a form holds. */
export interface RoutineDraft {
  title: string;
  kind: string;
  slots: string[];
  items: string[];
  week: Record<Weekday, Record<string, string>>;
  /** Field specs as the plan writes them: `minutes:number`, `mood:scale:5`. */
  fields: string[];
  target: number | null;
  book: string;
  notes: string;
}

export function emptyDraft(): RoutineDraft {
  return { title: "", kind: "", slots: [], items: [], week: { mon: {}, tue: {}, wed: {}, thu: {}, fri: {}, sat: {}, sun: {} }, fields: [], target: null, book: "", notes: "" };
}

export function fieldSpec(f: RoutineField): string {
  if (f.type === "number") return f.unit ? `${f.key}:number:${f.unit}` : `${f.key}:number`;
  if (f.type === "scale") return `${f.key}:scale:${f.max ?? 5}`;
  if (f.type === "check") return `${f.key}:check`;
  return `${f.key}:text`;
}

export function draftOf(plan: RoutinePlan): RoutineDraft {
  const week = emptyDraft().week;
  for (const wd of WEEKDAYS) for (const s of plan.week[wd]) week[wd][s.slot] = s.text;
  return {
    title: plan.title,
    kind: plan.kind ?? "",
    slots: [...plan.slots],
    items: [...plan.items],
    week,
    fields: plan.fields.map(fieldSpec),
    target: plan.target,
    book: plan.book ?? "",
    notes: plan.notes ?? "",
  };
}

/** The ```routine body a draft writes, in the order the docs list the keys. */
export function routineFenceBody(draft: RoutineDraft): string {
  const out: string[] = [];
  out.push(`title: ${draft.title.trim()}`);
  if (draft.kind.trim() !== "") out.push(`kind: ${draft.kind.trim()}`);
  const slots = draft.slots.map((s) => s.trim()).filter((s) => s !== "");
  if (slots.length > 0) out.push(`slots: ${slots.join(", ")}`);
  const items = draft.items.map((s) => s.trim()).filter((s) => s !== "");
  if (items.length > 0) out.push(`items: ${items.join(", ")}`);
  const fields = draft.fields.map((s) => s.trim()).filter((s) => s !== "");
  if (fields.length > 0) out.push(`fields: ${fields.join(", ")}`);
  if (draft.target !== null && draft.target >= 1) out.push(`target: ${draft.target}/week`);
  if (draft.book.trim() !== "") out.push(`book: ${draft.book.trim()}`);
  for (const wd of WEEKDAYS) {
    const day = draft.week[wd];
    const entries = Object.entries(day).filter(([, v]) => v.trim() !== "");
    if (entries.length === 0) continue;
    if (entries.length === 1 && entries[0][0] === "") {
      out.push(`${WEEKDAY_NAMES[wd]}: ${entries[0][1].trim()}`);
      continue;
    }
    out.push(`${WEEKDAY_NAMES[wd]}:`);
    // Declared slot order first, then whatever else the day names.
    const keys = [...slots.filter((s) => s in day), ...entries.map(([k]) => k).filter((k) => !slots.includes(k))];
    for (const k of keys) {
      const v = day[k];
      if (v === undefined || v.trim() === "") continue;
      out.push(`  ${k === "" ? "plan" : k}: ${v.trim()}`);
    }
  }
  if (draft.notes.trim() !== "") {
    out.push("notes: |");
    for (const l of draft.notes.trim().split(/\r?\n/)) out.push(`  ${l}`);
  }
  return out.join("\n") + "\n";
}

const WEEKDAY_NAMES: Record<Weekday, string> = {
  mon: "monday", tue: "tuesday", wed: "wednesday", thu: "thursday", fri: "friday", sat: "saturday", sun: "sunday",
};

/** The whole note a new routine becomes: the title as frontmatter, the plan
 *  fence, and an empty log fence so the shape is visible before day one. */
export function routineNoteContent(draft: RoutineDraft): string {
  const title = draft.title.trim().replace(/"/g, "'");
  return `---\ntitle: "${title}"\n---\n\n\`\`\`routine\n${routineFenceBody(draft)}\`\`\`\n\n\`\`\`routine-log\n\`\`\`\n`;
}

export const ROUTINES_ROOT = "Routines";
export const ROUTINES_ROOT_AR = "روتين";
export const ROUTINES_ROOTS: readonly string[] = [ROUTINES_ROOT, ROUTINES_ROOT_AR];

export function routinesRootFor(lang: "en" | "ar" | undefined, existing: readonly string[]): string {
  const own = lang === "ar" ? ROUTINES_ROOT_AR : ROUTINES_ROOT;
  const other = own === ROUTINES_ROOT ? ROUTINES_ROOT_AR : ROUTINES_ROOT;
  if (existing.includes(own)) return own;
  if (existing.includes(other)) return other;
  return own;
}

export function routineFileName(title: string): string {
  const clean = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return (clean || "Untitled").slice(0, 120);
}

export function routineNotePath(title: string, lang: "en" | "ar" | undefined, existing: readonly string[]): string {
  return `${routinesRootFor(lang, existing)}/${routineFileName(title)}.md`;
}

