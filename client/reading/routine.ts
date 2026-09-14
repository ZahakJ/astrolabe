// THE ROUTINE CARD, DRAWN. One renderer, every surface — the tracker's rule
// (client/reading/tracker.ts), kept: the reading view, the blog article, a
// transclusion, the hover preview, the editor's block widget and the
// Routines page all draw a routine through this module, and there is no
// second skin.
//
// LOADED ON DEMAND, like the tracker card: render.ts reaches this through a
// dynamic import into a host already in the tree, so a note without a
// routine owes none of it.
//
// INERT BY DEFAULT. The checkboxes, the field inputs and the note box appear
// only when the caller passes `onLog` — the editor widget (which turns a
// patch into ONE document edit) and the Routines page (which posts it). A
// visitor's card is a picture: there is no write path for them, and controls
// that cannot work are furniture that lies.

import "./routine.css";
import type { FolderIcon } from "../../shared/folderIcons.ts";
import { FOLDER_ICON_HAND_PATHS } from "../../shared/folderIconsHand.ts";
import {
  dayStatus,
  isoDate,
  routineStats,
  shiftDate,
  tasksFor,
  weekOrder,
  weekStart,
  weekdayOfDate,
  type DayStatus,
  type EntryPatch,
  type RoutineEntry,
  type RoutineField,
  type RoutineKind,
  type RoutinePlan,
  type Weekday,
} from "../../shared/routine.ts";
import { siteDate } from "../dates.ts";
import { getTrackers, updateTracker } from "../api.ts";
import { foldKind } from "../../shared/tracker.ts";
import { KIND_UNIT, unitKey } from "../trackerUnits.ts";
import { autoDir, countPhrase, getLang, localeNum, t, tf, type I18nKey } from "../i18n.ts";
import { useStore } from "../state.ts";
import { el } from "./dom.ts";

export interface RoutineHooks {
  notePath: string;
  /** `notes: |` already rendered to HTML by the caller's inline pipeline. */
  notesHtml?: string;
  /** The day the card is about; today unless a caller says otherwise. */
  today?: string;
  /** Editor and Routines page only: record a change to one day. Its
   *  absence is what makes every other surface inert. */
  onLog?: (patch: EntryPatch) => void;
  /** Open the note the routine lives in — the Routines page's title door. */
  onOpen?: () => void;
  /** Called when the card's height changes after mount (a section opened). */
  onResize?: () => void;
  /** The page's own doors, drawn in the card's corner when given. */
  actions?: { label: string; onClick: () => void }[];
}

const KIND_LABEL: Record<RoutineKind, I18nKey> = {
  exercise: "routineKindExercise",
  habit: "routineKindHabit",
  prayer: "routineKindPrayer",
  sleep: "routineKindSleep",
  water: "routineKindWater",
  mood: "routineKindMood",
  reading: "routineKindReading",
  study: "routineKindStudy",
};

const STATUS_LABEL: Record<DayStatus, I18nKey> = {
  complete: "routineDayComplete",
  partial: "routineDayPartial",
  missed: "routineDayMissed",
  rest: "routineDayRest",
  none: "routineDayNone",
};

const WEEKDAY_LABEL: Record<Weekday, I18nKey> = {
  mon: "weekdayMon",
  tue: "weekdayTue",
  wed: "weekdayWed",
  thu: "weekdayThu",
  fri: "weekdayFri",
  sat: "weekdaySat",
  sun: "weekdaySun",
};

function glyph(icon: FolderIcon, size: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const d of FOLDER_ICON_HAND_PATHS[icon] ?? []) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

function sameKey(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** "Sunday, 13 September" in the site's calendar. */
function dayLabel(iso: string, locale: string): string {
  return siteDate(`${iso}T12:00:00`, locale, { weekday: "long", day: "numeric", month: "long" }) || iso;
}

function shortDay(iso: string, locale: string): string {
  return siteDate(`${iso}T12:00:00`, locale, { day: "numeric" }) || iso.slice(-2);
}

function kindLabel(plan: RoutinePlan): string {
  if (plan.kindKey) return t(KIND_LABEL[plan.kindKey]);
  return plan.kind ?? t("routineKindOwn");
}

// ── The card ────────────────────────────────────────────────────────────────

export function renderRoutineCard(plan: RoutinePlan, entries: RoutineEntry[], hooks: RoutineHooks): HTMLElement {
  const lang = getLang();
  const locale = useStore.getState().blogLocale;
  const today = hooks.today ?? isoDate(new Date());
  const interactive = hooks.onLog !== undefined;
  const entryOf = (iso: string): RoutineEntry | null => entries.find((e) => e.date === iso) ?? null;
  const stats = routineStats(plan, entries, today, lang);

  const card = el("section", "s-rv-routine");
  card.dir = autoDir(plan.title || kindLabel(plan));
  card.dataset.kind = plan.kindKey ?? "own";

  // ── Head ──
  const head = el("header", "s-rv-routine__head");
  const ident = el("div", "s-rv-routine__ident");
  const mark = el("span", "s-rv-routine__glyph");
  mark.appendChild(glyph(plan.icon, 18));
  ident.appendChild(mark);
  const names = el("div", "s-rv-routine__names");
  names.appendChild(el("span", "s-rv-routine__eyebrow", kindLabel(plan)));
  if (hooks.onOpen) {
    const btn = el("button", "s-rv-routine__title s-rv-routine__title--door", plan.title || t("routineUntitled"));
    btn.type = "button";
    btn.addEventListener("click", hooks.onOpen);
    names.appendChild(btn);
  } else names.appendChild(el("h3", "s-rv-routine__title", plan.title || t("routineUntitled")));
  ident.appendChild(names);
  head.appendChild(ident);

  const chips = el("div", "s-rv-routine__chips");
  const streak = el("span", `s-rv-routine__chip s-rv-routine__chip--streak${stats.streak > 0 ? " is-lit" : ""}`);
  streak.appendChild(el("span", "s-rv-routine__chipnum", localeNum(stats.streak)));
  streak.appendChild(el("span", "s-rv-routine__chiplabel", t("routineStreak")));
  streak.title = tf("routineStreakTitle", { n: localeNum(stats.streak) });
  chips.appendChild(streak);
  const week = el("span", "s-rv-routine__chip");
  week.appendChild(el("span", "s-rv-routine__chipnum", `${localeNum(stats.week.done)}/${localeNum(stats.week.of)}`));
  week.appendChild(el("span", "s-rv-routine__chiplabel", t("routineThisWeek")));
  week.title = tf("routineWeekTitle", { done: localeNum(stats.week.done), of: localeNum(stats.week.of) });
  chips.appendChild(week);
  if (stats.month.of > 0) {
    const month = el("span", "s-rv-routine__chip");
    month.appendChild(el("span", "s-rv-routine__chipnum", `${localeNum(Math.round((stats.month.done / stats.month.of) * 100))}%`));
    month.appendChild(el("span", "s-rv-routine__chiplabel", t("routineLastMonth")));
    month.title = tf("routineMonthTitle", { done: localeNum(stats.month.done), of: localeNum(stats.month.of) });
    chips.appendChild(month);
  }
  head.appendChild(chips);
  if (hooks.actions && hooks.actions.length > 0) {
    const actions = el("div", "s-rv-routine__actions");
    for (const a of hooks.actions) {
      const b = el("button", "s-rv-routine__action", a.label);
      b.type = "button";
      b.addEventListener("click", a.onClick);
      actions.appendChild(b);
    }
    head.appendChild(actions);
  }
  card.appendChild(head);

  // ── Today ──
  card.appendChild(renderDay(plan, entryOf(today), today, today, locale, interactive ? hooks.onLog : undefined));

  // ── Week strip ──
  const strip = el("div", "s-rv-routine__week");
  strip.setAttribute("role", "list");
  const start = weekStart(today, lang);
  for (let i = 0; i < 7; i++) {
    const iso = shiftDate(start, i);
    const status = dayStatus(plan, entryOf(iso), iso, today);
    const cell = el("div", `s-rv-routine__day s-rv-routine__day--${status}${iso === today ? " is-today" : ""}`);
    cell.setAttribute("role", "listitem");
    cell.title = `${dayLabel(iso, locale)} — ${t(STATUS_LABEL[status])}`;
    cell.appendChild(el("span", "s-rv-routine__dayname", t(WEEKDAY_LABEL[weekdayOfDate(iso)])));
    cell.appendChild(el("span", "s-rv-routine__daydot"));
    cell.appendChild(el("span", "s-rv-routine__daynum", shortDay(iso, locale)));
    strip.appendChild(cell);
  }
  card.appendChild(strip);

  // ── Heatmap: twelve weeks, oldest at the top ──
  const heat = el("div", "s-rv-routine__heat");
  heat.setAttribute("role", "img");
  heat.setAttribute("aria-label", tf("routineHeatAria", { done: localeNum(stats.month.done) }));
  const order = weekOrder(lang);
  const legend = el("div", "s-rv-routine__heatdays");
  for (const wd of order) legend.appendChild(el("span", "s-rv-routine__heatday", t(WEEKDAY_LABEL[wd]).slice(0, 1)));
  heat.appendChild(legend);
  const grid = el("div", "s-rv-routine__heatgrid");
  for (const row of stats.heat) {
    for (const cell of row) {
      const c = el("span", `s-rv-routine__cell s-rv-routine__cell--${cell.status}${cell.date === today ? " is-today" : ""}`);
      c.style.setProperty("--ratio", String(cell.ratio));
      c.title = `${dayLabel(cell.date, locale)} — ${t(STATUS_LABEL[cell.status])}`;
      if (cell.date > today) c.classList.add("is-future");
      grid.appendChild(c);
    }
  }
  heat.appendChild(grid);
  card.appendChild(heat);

  // ── The plan ──
  const hasWeek = plan.slots.length > 0 || Object.values(plan.week).some((d) => d.length > 0);
  if (hasWeek) {
    const details = el("details", "s-rv-routine__plan");
    details.appendChild(el("summary", "s-rv-routine__plansum", t("routinePlanTitle")));
    details.appendChild(renderPlanTable(plan, today, lang));
    details.addEventListener("toggle", () => hooks.onResize?.());
    card.appendChild(details);
  }

  if (hooks.notesHtml) {
    const notes = el("div", "s-rv-routine__notes");
    notes.innerHTML = hooks.notesHtml;
    card.appendChild(notes);
  }
  return card;
}

/** One day's checklist, fields and note: the card's heart, and the log's
 *  row when it is drawn per day. `onLog` present → controls; absent → text. */
function renderDay(
  plan: RoutinePlan,
  entry: RoutineEntry | null,
  iso: string,
  today: string,
  locale: string,
  onLog: ((patch: EntryPatch) => void) | undefined,
): HTMLElement {
  const box = el("div", "s-rv-routine__today");
  const status = dayStatus(plan, entry, iso, today);
  box.dataset.status = status;
  const head = el("div", "s-rv-routine__todayhead");
  head.appendChild(el("span", "s-rv-routine__todaylabel", iso === today ? t("routineToday") : ""));
  head.appendChild(el("span", "s-rv-routine__todaydate", dayLabel(iso, locale)));
  head.appendChild(el("span", `s-rv-routine__status s-rv-routine__status--${status}`, t(STATUS_LABEL[status])));
  box.appendChild(head);

  const tasks = tasksFor(plan, iso);
  const done = entry?.done ?? [];
  const skipped = entry?.skipped ?? [];
  if (tasks.length === 0) {
    box.appendChild(el("p", "s-rv-routine__rest", t("routineRestDay")));
  } else {
    const list = el("ul", "s-rv-routine__tasks");
    for (const task of tasks) {
      const isDone = done.some((d) => sameKey(d, task.key));
      const isSkipped = skipped.some((d) => sameKey(d, task.key));
      const li = el("li", `s-rv-routine__task${isDone ? " is-done" : ""}${isSkipped ? " is-skipped" : ""}`);
      const label = el("label", "s-rv-routine__tasklabel");
      const box2 = el("input", "s-rv-routine__check");
      box2.type = "checkbox";
      box2.checked = isDone;
      box2.disabled = !onLog;
      box2.setAttribute("aria-label", task.text ? `${task.key}: ${task.text}` : task.key);
      if (onLog) {
        box2.addEventListener("change", () => {
          const next = box2.checked ? [...done.filter((d) => !sameKey(d, task.key)), task.key] : done.filter((d) => !sameKey(d, task.key));
          onLog({ date: iso, done: next });
        });
      }
      label.appendChild(box2);
      const words = el("span", "s-rv-routine__taskwords");
      words.appendChild(el("span", "s-rv-routine__taskkey", task.book ? t("routineReadKey") : task.key));
      const textEl = el("span", "s-rv-routine__tasktext", task.text ?? "");
      if (task.text) words.appendChild(textEl);
      label.appendChild(words);
      if (task.book && task.text) {
        // THE BOOK'S DAY: the tracker names the pace ("20 pages a day") and
        // the tick moves it. Read from the shelf the trackers already keep;
        // a book with no pace still lists, as "Read <title>".
        const title = task.text;
        void getTrackers()
          .then((shelf) => {
            const meta = shelf.find((m) => m.title.trim().toLowerCase() === title.toLowerCase());
            if (!meta) return;
            const pace = meta.pace ?? meta.step;
            const known = unitKey(meta.unit);
            const kind = foldKind(meta.kind);
            const unitWord = known ? countPhrase(10, known).replace(/^[\d٠-٩٬,.\s]+/, "") : meta.unit ?? (kind ? countPhrase(10, KIND_UNIT[kind]).replace(/^[\d٠-٩٬,.\s]+/, "") : "");
            textEl.textContent = tf("routineReadTask", { n: localeNum(pace), unit: unitWord, title: meta.title });
            if (onLog) {
              box2.addEventListener("change", () => {
                // Ticked → the tracker moves by the day's pace; unticked → back.
                void updateTracker(meta.path, meta.index, null, box2.checked ? pace : -pace).catch(() => {});
              });
            }
          })
          .catch(() => {});
      }
      li.appendChild(label);
      if (onLog && !isDone) {
        const skip = el("button", `s-rv-routine__skip${isSkipped ? " is-on" : ""}`, isSkipped ? t("routineSkipped") : t("routineSkip"));
        skip.type = "button";
        skip.title = t("routineSkipTitle");
        skip.addEventListener("click", () => {
          const next = isSkipped ? skipped.filter((d) => !sameKey(d, task.key)) : [...skipped, task.key];
          onLog({ date: iso, skipped: next });
        });
        li.appendChild(skip);
      }
      list.appendChild(li);
    }
    box.appendChild(list);
  }

  if (plan.fields.length > 0) {
    const fields = el("div", "s-rv-routine__fields");
    for (const f of plan.fields) fields.appendChild(renderField(f, entry?.values[f.key] ?? "", iso, onLog));
    box.appendChild(fields);
  }

  // The note: an input when live, a line when not.
  if (onLog) {
    const note = el("input", "s-rv-routine__note");
    note.type = "text";
    note.placeholder = t("routineNotePlaceholder");
    note.value = entry?.note ?? "";
    note.setAttribute("aria-label", t("routineNotePlaceholder"));
    note.dir = "auto";
    const commit = (): void => {
      const value = note.value.trim();
      if (value === (entry?.note ?? "")) return;
      onLog({ date: iso, note: value === "" ? null : value });
    };
    note.addEventListener("change", commit);
    note.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
        note.blur();
      }
    });
    box.appendChild(note);
  } else if (entry?.note) {
    const p = el("p", "s-rv-routine__notetext", entry.note);
    p.dir = "auto";
    box.appendChild(p);
  }
  return box;
}

function renderField(f: RoutineField, value: string, iso: string, onLog: ((patch: EntryPatch) => void) | undefined): HTMLElement {
  const wrap = el("label", `s-rv-routine__field s-rv-routine__field--${f.type}`);
  const name = el("span", "s-rv-routine__fieldname", f.key);
  wrap.appendChild(name);
  const set = (v: string | null): void => onLog?.({ date: iso, values: { [f.key]: v } });
  if (f.type === "scale") {
    const max = f.max ?? 5;
    const row = el("span", "s-rv-routine__scale");
    row.setAttribute("role", onLog ? "radiogroup" : "img");
    row.setAttribute("aria-label", f.key);
    const current = Number(value);
    for (let n = 1; n <= max; n++) {
      const b = el("button", `s-rv-routine__scalebtn${Number.isFinite(current) && n <= current ? " is-on" : ""}`, localeNum(n));
      b.type = "button";
      b.disabled = !onLog;
      b.setAttribute("aria-pressed", String(n === current));
      b.addEventListener("click", () => set(n === current ? null : String(n)));
      row.appendChild(b);
    }
    wrap.appendChild(row);
    return wrap;
  }
  if (f.type === "check") {
    const box = el("input", "s-rv-routine__check");
    box.type = "checkbox";
    box.checked = /^(yes|true|1|✓|نعم)$/i.test(value);
    box.disabled = !onLog;
    box.addEventListener("change", () => set(box.checked ? "yes" : null));
    wrap.insertBefore(box, name);
    return wrap;
  }
  if (!onLog) {
    wrap.appendChild(el("span", "s-rv-routine__fieldvalue", value === "" ? "—" : f.unit ? `${value} ${f.unit}` : value));
    return wrap;
  }
  const input = el("input", "s-rv-routine__input");
  input.type = f.type === "number" ? "number" : "text";
  if (f.type === "number") {
    input.step = "any";
    input.inputMode = "decimal";
    input.dir = "ltr";
  } else input.dir = "auto";
  input.value = value;
  input.setAttribute("aria-label", f.key);
  const commit = (): void => {
    const v = input.value.trim();
    if (v === value) return;
    set(v === "" ? null : v);
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      input.blur();
    }
  });
  wrap.appendChild(input);
  if (f.unit) wrap.appendChild(el("span", "s-rv-routine__unit", f.unit));
  return wrap;
}

function renderPlanTable(plan: RoutinePlan, today: string, lang: "en" | "ar"): HTMLElement {
  const table = el("table", "s-rv-routine__table");
  const slots = plan.slots.length > 0 ? plan.slots : [""];
  const thead = el("thead", "");
  const hr = el("tr", "");
  hr.appendChild(el("th", "", t("routineDay")));
  for (const s of slots) hr.appendChild(el("th", "", s === "" ? t("routinePlanTitle") : s));
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = el("tbody", "");
  const todayWd = weekdayOfDate(today);
  for (const wd of weekOrder(lang)) {
    const tr = el("tr", wd === todayWd ? "is-today" : "");
    tr.appendChild(el("th", "", t(WEEKDAY_LABEL[wd])));
    const entries = plan.week[wd];
    for (const s of slots) {
      const cell = entries.find((e) => (s === "" ? e.slot === "" : sameKey(e.slot, s)));
      const td = el("td", cell ? "" : "is-empty", cell ? cell.text : "—");
      if (cell) td.dir = autoDir(cell.text);
      tr.appendChild(td);
    }
    // Slots the header does not know still show, in their own cells.
    for (const e of entries) if (e.slot !== "" && !slots.some((s) => sameKey(s, e.slot))) tr.appendChild(el("td", "", `${e.slot}: ${e.text}`));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const wrap = el("div", "s-rv-routine__tablewrap");
  wrap.appendChild(table);
  return wrap;
}

// ── The log ─────────────────────────────────────────────────────────────────

/** A ```routine-log fence: the days, newest first, as a table. */
export function renderRoutineLog(plan: RoutinePlan | null, entries: RoutineEntry[], hooks: Pick<RoutineHooks, "today">): HTMLElement {
  const locale = useStore.getState().blogLocale;
  const today = hooks.today ?? isoDate(new Date());
  const box = el("section", "s-rv-routinelog");
  box.appendChild(el("h4", "s-rv-routinelog__title", plan ? tf("routineLogTitle", { title: plan.title || t("routineUntitled") }) : t("routineLogTitleBare")));
  if (entries.length === 0) {
    box.appendChild(el("p", "s-rv-routinelog__empty", t("routineLogEmpty")));
    return box;
  }
  const fields = plan?.fields ?? [];
  const table = el("table", "s-rv-routinelog__table");
  const thead = el("thead", "");
  const hr = el("tr", "");
  hr.appendChild(el("th", "", t("routineDay")));
  hr.appendChild(el("th", "", t("routineDone")));
  for (const f of fields) hr.appendChild(el("th", "", f.key));
  hr.appendChild(el("th", "", t("routineNote")));
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = el("tbody", "");
  for (const e of [...entries].reverse()) {
    const status = plan ? dayStatus(plan, e, e.date, today) : "none";
    const tr = el("tr", `s-rv-routinelog__row--${status}`);
    const th = el("th", "");
    th.appendChild(el("span", `s-rv-routine__daydot s-rv-routine__day--${status}`));
    th.appendChild(el("span", "", siteDate(`${e.date}T12:00:00`, locale, { dateStyle: "medium" }) || e.date));
    tr.appendChild(th);
    const doneText = [...e.done, ...e.skipped.map((s) => `${s} ✗`)].join(" · ");
    const doneCell = el("td", "", doneText || "—");
    doneCell.dir = "auto";
    tr.appendChild(doneCell);
    for (const f of fields) {
      const v = e.values[f.key];
      tr.appendChild(el("td", v === undefined ? "is-empty" : "", v === undefined ? "—" : f.unit ? `${v} ${f.unit}` : v));
    }
    const note = el("td", "s-rv-routinelog__note", e.note ?? "");
    note.dir = "auto";
    tr.appendChild(note);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  const wrap = el("div", "s-rv-routine__tablewrap");
  wrap.appendChild(table);
  box.appendChild(wrap);
  return box;
}
