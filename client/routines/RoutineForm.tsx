// THE SIGIL FORM — a new sigil from a template, or an edit of one.
//
// It writes a NOTE, as the Media form does: `Sigils/<Title>.md` holding the
// title as frontmatter, the ```sigil plan the draft composes
// (shared/routine.ts routineFenceBody) and an empty ```sigil-log, so the
// shape is on the page before day one. An edit sends the plan's new body to
// POST /api/routine, which replaces the plan fence and nothing else — the
// log under it, the prose around it, all kept.
//
// A SHEET IN FOUR SECTIONS, each one a question a person can answer: what is
// it called and what does it look like; which days, and what does each ask;
// what do you want to write down each day; how many days a week are you
// aiming for. The first form was one column of labelled inputs and a
// textarea of `name:type` specs, and the owner's verdict was that it "needs
// to be much much better looking and should give you options to show
// everything … all those options should be chosen manually" and "clarify
// what each option does". So every field is now an explicit toggle with a
// sentence under it, a template only PRE-TICKS its suggestions, and Custom
// starts from nothing — the sheet says so.
//
// TEMPLATES ARE TWO SHELVES. The built-in presets (the owner's exercise week,
// mindfulness, sleep, water, mood, reading, study, habits) and the vault's own:
// any note in the templates folder that carries a ```sigil fence. "Save as
// template" writes the draft there, so a sigil drawn up once can seed the
// next — the owner's ask: "ability to create custom templates".

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useDialog } from "../a11y.ts";
import { putNote, updateRoutine, uploadAttachment } from "../api.ts";
import { NumberInput, SegmentedControl, TextInput } from "../components/controls/Fields.tsx";
import { PathInput } from "../components/controls/PathInput.tsx";
import { Select } from "../components/controls/Select.tsx";
import {
  ROUTINES_ROOTS,
  WEEKDAYS,
  cleanIcon,
  draftOf,
  emptyDraft,
  fieldSpec,
  foldRoutineKind,
  isoDate,
  parseField,
  parseRoutine,
  routineFenceBody,
  routineFileName,
  routineNoteContent,
  routineNotePath,
  routinesRootFor,
  weekOrder,
  type RoutineDraft,
  type RoutineField,
  type RoutineFieldType,
  type RoutineKind,
  type Weekday,
} from "../../shared/routine.ts";
import { courseFinish } from "../../shared/course.ts";
import { ROUTINE_PRESETS } from "../../shared/routinePresets.ts";
import { UPLOAD_MAX_MB } from "../../shared/limits.ts";
import type { RoutineMeta } from "../../shared/types.ts";
import { siteDate } from "../dates.ts";
import { countPhrase, getLang, localeNum, t, tf, type I18nKey } from "../i18n.ts";
import { treeHasFolder, treeHasPath } from "../media/mediaModel.ts";
import { parentDir } from "../move.ts";
import { KNOWN_FIELDS, fieldFromKnown, knownFieldOf, type KnownField } from "../routineFields.ts";
import { useStore } from "../state.ts";
import { templateSettings } from "../templates.ts";
import { toast } from "../toast.ts";

const KIND_LABEL: Record<RoutineKind, I18nKey> = {
  exercise: "routineKindExercise",
  habit: "routineKindHabit",
  mind: "routineKindMind",
  sleep: "routineKindSleep",
  water: "routineKindWater",
  mood: "routineKindMood",
  reading: "routineKindReading",
  study: "routineKindStudy",
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

const KINDS: RoutineKind[] = ["exercise", "habit", "mind", "sleep", "water", "mood", "reading", "study"];

/** The kinds of value a field of the reader's own can hold, with the words
 *  for each. `check` is last: it is the one that is not a number or a line. */
const FIELD_TYPES: { value: RoutineFieldType; label: I18nKey; hint: I18nKey }[] = [
  { value: "number", label: "routineFieldTypeNumber", hint: "routineFieldTypeNumberHint" },
  { value: "count", label: "routineFieldTypeCount", hint: "routineFieldTypeCountHint" },
  { value: "scale", label: "routineFieldTypeScale", hint: "routineFieldTypeScaleHint" },
  { value: "text", label: "routineFieldTypeText", hint: "routineFieldTypeTextHint" },
  { value: "check", label: "routineFieldTypeCheck", hint: "routineFieldTypeCheckHint" },
];

/** The picker's shelf: forty glyphs that fit the things people keep a sigil for — the
 *  body, the table, the night, the book, the quiet, the house. A free
 *  field beside it takes anything else. */
/** A standard shelf: the body, the table, the day, the mind, the hands, the
 *  home — nothing that names a faith or a flag (the owner: "it's kinda
 *  targeted"). Anything else is one keystroke away in the field beside it,
 *  where the system's own emoji picker works. */
const EMOJI: readonly string[] = [
  "🏃", "🚶", "🚴", "🏋️", "🧘", "🏊", "🧗", "⚽", "🎾",
  "🥗", "🍎", "💧", "☕", "🍵", "🥛", "🍳", "🚭", "🍫",
  "🌙", "😴", "☀️", "🌅", "⏰", "🛏️", "🌱", "🌳", "🌊",
  "📖", "📚", "✍️", "🎓", "🧠", "💻", "🎯", "⭐", "🧩",
  "🎵", "🎹", "🎸", "🎨", "📷", "🗣️", "🌍", "✈️", "💰",
  "🧹", "🧺", "🐕", "🌻", "🛠️", "🚗", "💊", "🩺", "❤️",
];

function listText(items: string[]): string {
  return items.join(", ");
}

function textList(raw: string): string[] {
  return raw
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function sameKey(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The draft's `name:type` specs as fields the sheet can show as parts. */
function fieldsOf(draft: RoutineDraft): RoutineField[] {
  return draft.fields.map(parseField).filter((f): f is RoutineField => f !== null);
}

/** A field's name or unit with the characters the fence cannot carry taken
 *  out. The `fields:` line is `name:type:unit` entries with commas between
 *  them and the log is `key: value` segments with bars between them, so a
 *  colon, a comma or a bar typed into a name would split it into two fields
 *  or two segments — "a:b, c" came back as `a:number:b` and a field `c`. */
function fieldWord(raw: string): string {
  return raw.replace(/[:,|]/g, "");
}
/** …and a unit on those terms, null when nothing is left. */
function unitWord(raw: string): string | null {
  const unit = fieldWord(raw).trim();
  return unit === "" ? null : unit;
}

export function RoutineForm({
  editing,
  templates,
  onClose,
  onSaved,
}: {
  editing: RoutineMeta | null;
  templates: RoutineMeta[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const lang = getLang();
  const [draft, setDraft] = useState<RoutineDraft>(() => (editing ? draftOf(editing.plan) : emptyDraft()));
  const [source, setSource] = useState<string>(editing ? "edit" : "blank");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotsText, setSlotsText] = useState(() => listText(draft.slots));
  const [itemsText, setItemsText] = useState(() => listText(draft.items));
  // The fields as PARTS, in the plan's order: a known suggestion's toggle is
  // "is a field with its key in here", and the reader's own rows are the
  // rest. Composing writes them back as specs in the same order, which is
  // what lets a plan opened and saved untouched come back byte for byte.
  const [fields, setFields] = useState<RoutineField[]>(() => fieldsOf(draft));
  const panelRef = useRef<HTMLFormElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  useDialog(panelRef, { onEscape: onClose });
  useEffect(() => setError(null), [draft.title]);

  const set = <K extends keyof RoutineDraft>(key: K, value: RoutineDraft[K]): void => setDraft((d) => ({ ...d, [key]: value }));

  const apply = (next: RoutineDraft, id: string): void => {
    setDraft(next);
    setSlotsText(listText(next.slots));
    setItemsText(listText(next.items));
    setFields(fieldsOf(next));
    setSource(id);
  };

  const kindKey = foldRoutineKind(draft.kind);
  const segments = useMemo(() => {
    const rows: { value: string; label: string }[] = KINDS.map((k) => ({ value: k, label: t(KIND_LABEL[k]) }));
    const own = draft.kind.trim();
    if (own !== "" && foldRoutineKind(own) === null) rows.push({ value: own, label: own });
    return rows;
  }, [draft.kind]);
  const segmentValue = kindKey ?? draft.kind.trim();

  const slots = textList(slotsText);
  const columns = slots.length > 0 ? slots : [""];
  const order = weekOrder(lang);

  const setCell = (wd: Weekday, slot: string, value: string): void =>
    setDraft((d) => ({ ...d, week: { ...d.week, [wd]: { ...d.week[wd], [slot]: value } } }));

  // ── Fields ──
  const knownOn = (k: KnownField): RoutineField | null => fields.find((f) => sameKey(f.key, k.key.en) || sameKey(f.key, k.key.ar)) ?? null;
  const toggleKnown = (k: KnownField, on: boolean): void => {
    setFields((list) => {
      const present = list.find((f) => sameKey(f.key, k.key.en) || sameKey(f.key, k.key.ar));
      if (on && !present) return [...list, fieldFromKnown(k, lang)];
      if (!on && present) return list.filter((f) => f !== present);
      return list;
    });
  };
  const patchField = (target: RoutineField, patch: Partial<RoutineField>): void =>
    setFields((list) => list.map((f) => (f === target ? { ...f, ...patch } : f)));
  const removeField = (target: RoutineField): void => setFields((list) => list.filter((f) => f !== target));
  const addField = (): void => setFields((list) => [...list, { key: "", type: "number", unit: null, max: null }]);
  const ownFields = fields.filter((f) => knownFieldOf(f) === null);

  // ── A course ──
  const course = draft.mode === "course";
  const toggleDay = (wd: Weekday, on: boolean): void =>
    setDraft((d) => ({ ...d, daysWritten: true, days: on ? [...d.days, wd] : d.days.filter((x) => x !== wd) }));

  // WHAT THE COURSE WILL SAY, read back from the plan the sheet is about to
  // WRITE. The count, the units and the finish date all come out of the same
  // parser and the same projection the card uses, so the sheet can never
  // promise a shape the note does not hold.
  const preview = useMemo(() => {
    if (draft.mode !== "course") return null;
    const plan = parseRoutine(
      routineFenceBody({ ...emptyDraft(), title: draft.title.trim() || "—", mode: "course", days: draft.days, daysWritten: draft.daysWritten, capacity: draft.capacity, steps: draft.steps }),
    );
    if (plan?.course == null) return null;
    return {
      steps: plan.course.steps.length,
      units: new Set(plan.course.steps.map((s) => s.unit)).size,
      finish: courseFinish(plan, [], isoDate(new Date())),
    };
  }, [draft.mode, draft.title, draft.days, draft.daysWritten, draft.capacity, draft.steps]);

  const composed = (): RoutineDraft => ({
    ...draft,
    // The icon as the card will READ it: a paragraph typed into the free
    // field is not an icon (shared/routine.ts cleanIcon), and writing it
    // would leave an `icon:` line that draws nothing and vanishes on the
    // next edit. The preview beside the field shows the same reading.
    icon: cleanIcon(draft.icon) ?? "",
    slots,
    items: textList(itemsText),
    fields: fields.filter((f) => f.key.trim() !== "").map(fieldSpec),
  });

  const where = (): string => {
    const state = useStore.getState();
    return routinesRootFor(state.siteLanguage, ROUTINES_ROOTS.filter((root) => treeHasFolder(state.tree, root)));
  };

  const upload = (file: File): void => {
    if (file.size > UPLOAD_MAX_MB * 1024 * 1024) {
      toast(tf("mediaCoverTooBig", { mb: localeNum(UPLOAD_MAX_MB) }), "error");
      return;
    }
    setUploading(true);
    // The sigil note's folder is the upload's context, as it is for a
    // tracker's cover: under the "same folder" and "subfolder" attachment
    // modes the banner lands beside the note it decorates — the folder the
    // note WILL take when it is not saved yet.
    const context = editing ? parentDir(editing.path) : where();
    uploadAttachment(file, true, context)
      .then((res) => set("banner", res.path))
      .catch(() => toast(tf("routinesSaveFailed", { title: file.name }), "error"))
      .finally(() => setUploading(false));
  };

  const save = async (): Promise<void> => {
    const final = composed();
    const title = final.title.trim();
    if (title === "") {
      setError(t("routinesTitleRequired"));
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await updateRoutine(editing.path, editing.index, null, routineFenceBody(final));
        toast(tf("routinesSaved", { title }));
      } else {
        const state = useStore.getState();
        const path = routineNotePath(title, state.siteLanguage, ROUTINES_ROOTS.filter((root) => treeHasFolder(state.tree, root)));
        if (treeHasPath(state.tree, path)) {
          setError(tf("routinesExists", { path }));
          setBusy(false);
          return;
        }
        await putNote(path, routineNoteContent(final));
        toast(tf("routinesAdded", { title }));
      }
      onSaved();
    } catch {
      setError(tf("routinesSaveFailed", { title }));
      setBusy(false);
    }
  };

  const saveTemplate = async (): Promise<void> => {
    const final = composed();
    const title = final.title.trim();
    if (title === "") {
      setError(t("routinesTitleRequired"));
      return;
    }
    setBusy(true);
    try {
      const settings = await templateSettings();
      const folder = settings.folder ?? (lang === "ar" ? "قوالب" : "Templates");
      const path = `${folder}/${routineFileName(title)}.md`;
      if (treeHasPath(useStore.getState().tree, path)) {
        setError(tf("routinesExists", { path }));
        setBusy(false);
        return;
      }
      await putNote(path, routineNoteContent(final));
      toast(tf("routinesTemplateSaved", { title, folder }));
      setBusy(false);
    } catch {
      setError(tf("routinesSaveFailed", { title }));
      setBusy(false);
    }
  };

  const heading = editing ? tf("routineFormEdit", { title: editing.plan.title }) : t("routineFormNew");
  const iconValue = cleanIcon(draft.icon) ?? "";
  const iconOnShelf = EMOJI.includes(iconValue);
  // THE SHELF IS ONE TAB STOP. Forty-one radios that each took a Tab put
  // the banner field forty-one presses away from the name; a radiogroup's
  // rule is one stop and arrows within it, which the kind's segments beside
  // it already follow. The horizontal arrows name a physical direction and
  // the shelf is laid out by the inline one, so in an Arabic sheet
  // ArrowRight walks backward — the finger and the ring must move the same
  // way; the vertical pair skips a row of the grid.
  const shelf = ["", ...EMOJI];
  const shelfStop = iconOnShelf ? iconValue : "";
  const shelfKey = (e: KeyboardEvent<HTMLButtonElement>): void => {
    // A row is however many squares the grid fitted on the first line —
    // read off the layout rather than divided out of widths and gaps.
    const squares = Array.from(e.currentTarget.parentElement!.children) as HTMLElement[];
    const row = Math.max(1, squares.filter((b) => b.offsetTop === squares[0].offsetTop).length);
    const rtl = e.currentTarget.closest("[dir]")?.getAttribute("dir") === "rtl";
    const step =
      e.key === "ArrowDown" ? row
      : e.key === "ArrowUp" ? -row
      : e.key === "ArrowRight" ? (rtl ? -1 : 1)
      : e.key === "ArrowLeft" ? (rtl ? 1 : -1)
      : 0;
    if (step === 0) return;
    e.preventDefault();
    const at = shelf.indexOf(shelfStop);
    const next = (at + step + shelf.length) % shelf.length;
    set("icon", shelf[next]);
    (e.currentTarget.parentElement!.children[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <div className="s-palette-overlay" onMouseDown={onClose}>
      <form
        ref={panelRef}
        className="s-mediaform s-sigilform"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="s-mediaform__head">
          <h2 className="s-mediaform__title" dir="auto">{heading}</h2>
          <button type="button" className="s-mediaform__close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>

        <div className="s-mediaform__body s-sigilform__body">
          {!editing && (
            <div className="s-sigilform__start">
              <span className="s-mediaform__label">{t("routinesPresetsHead")}</span>
              <div className="s-sigilform__presets" role="radiogroup" aria-label={t("routinesPresetsHead")}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={source === "blank"}
                  className={`s-sigilform__preset s-sigilform__preset--custom${source === "blank" ? " is-on" : ""}`}
                  onClick={() => apply(emptyDraft(), "blank")}
                >
                  <span className="s-sigilform__presetglyph" aria-hidden="true">✦</span>
                  {t("routinesCustom")}
                </button>
                {ROUTINE_PRESETS.map((p) => {
                  const d = p.draft(lang);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={source === p.id}
                      className={`s-sigilform__preset${source === p.id ? " is-on" : ""}`}
                      onClick={() => apply(d, p.id)}
                    >
                      <span className="s-sigilform__presetglyph" aria-hidden="true">{d.icon}</span>
                      {t(KIND_LABEL[p.id])}
                    </button>
                  );
                })}
              </div>
              {templates.length > 0 && (
                <>
                  <span className="s-mediaform__label s-sigilform__sublabel">{t("routinesTemplatesHead")}</span>
                  <div className="s-sigilform__presets" role="radiogroup" aria-label={t("routinesTemplatesHead")}>
                    {templates.map((m) => (
                      <button
                        key={`${m.path}::${m.index}`}
                        type="button"
                        role="radio"
                        aria-checked={source === m.path}
                        className={`s-sigilform__preset${source === m.path ? " is-on" : ""}`}
                        title={m.path}
                        dir="auto"
                        onClick={() => apply(draftOf(m.plan), m.path)}
                      >
                        {m.plan.emoji && <span className="s-sigilform__presetglyph" aria-hidden="true">{m.plan.emoji}</span>}
                        {m.plan.title || m.noteTitle}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="s-mediaform__hint">{t("routineFormStartHint")}</p>
            </div>
          )}

          {/* ── 1 · Name and look ── */}
          <section className="s-sigilform__section" aria-labelledby="s-sigilform-s1">
            <header className="s-sigilform__sechead">
              <span className="s-sigilform__secnum" aria-hidden="true">1</span>
              <h3 className="s-sigilform__sectitle" id="s-sigilform-s1">{t("routineFormSectionName")}</h3>
            </header>

            <label className="s-mediaform__row">
              <span className="s-mediaform__label">{t("routineFormTitle")}</span>
              <TextInput value={draft.title} onChange={(v) => set("title", v)} placeholder={t("routineFormTitlePlaceholder")} label={t("routineFormTitle")} maxLength={200} dir="auto" />
            </label>

            <div className="s-mediaform__row">
              <span className="s-mediaform__label">{t("routineFormKind")}</span>
              <SegmentedControl value={segmentValue} onChange={(v) => set("kind", v)} segments={segments} label={t("routineFormKind")} />
              <TextInput value={kindKey ? "" : draft.kind} onChange={(v) => set("kind", v)} placeholder={t("routineFormKindOwn")} label={t("routineFormKindOwn")} maxLength={40} dir="auto" />
              <p className="s-mediaform__hint">{t("routineFormKindHint")}</p>
            </div>

            <div className="s-mediaform__row">
              <span className="s-mediaform__label">{t("routineFormIcon")}</span>
              <div className="s-sigilform__iconrow">
                <div className="s-sigilform__emoji" role="radiogroup" aria-label={t("routineFormIcon")}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={iconValue === ""}
                    className={`s-sigilform__emojibtn s-sigilform__emojibtn--none${iconValue === "" ? " is-on" : ""}`}
                    title={t("routineFormIconNone")}
                    tabIndex={shelfStop === "" ? 0 : -1}
                    onKeyDown={shelfKey}
                    onClick={() => set("icon", "")}
                  >
                    <span className="s-sigilform__emojinone">{t("routineFormIconNone")}</span>
                  </button>
                  {EMOJI.map((e) => (
                    <button
                      key={e}
                      type="button"
                      role="radio"
                      aria-checked={iconValue === e}
                      aria-label={e}
                      className={`s-sigilform__emojibtn${iconValue === e ? " is-on" : ""}`}
                      tabIndex={shelfStop === e ? 0 : -1}
                      onKeyDown={shelfKey}
                      onClick={() => set("icon", e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <div className="s-sigilform__iconown">
                  <span className={`s-sigilform__iconpreview${iconValue === "" ? " is-empty" : ""}`} aria-hidden="true">
                    {iconValue || "·"}
                  </span>
                  <TextInput value={iconOnShelf ? "" : draft.icon} onChange={(v) => set("icon", v)} placeholder={t("routineFormIconOwn")} label={t("routineFormIconOwn")} maxLength={8} dir="auto" />
                </div>
              </div>
              <p className="s-mediaform__hint">{t("routineFormIconHint")}</p>
            </div>

            <div className="s-mediaform__row">
              <span className="s-mediaform__label">{t("routineFormBanner")}</span>
              <div className="s-mediaform__coverrow">
                <PathInput id="s-sigilform-banner" value={draft.banner} onChange={(v) => set("banner", v)} kind="image" placeholder={t("routineFormBannerPlaceholder")} label={t("routineFormBanner")} />
                <button type="button" className="s-btn s-mediaform__upload" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? t("mediaFormUploading") : t("routineFormBannerChoose")}
                </button>
                {draft.banner.trim() !== "" && (
                  <button type="button" className="s-btn s-mediaform__upload" onClick={() => set("banner", "")} title={t("routineFormBannerRemove")}>
                    ×
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) upload(file);
                    e.target.value = "";
                  }}
                />
              </div>
              <p className="s-mediaform__hint">{t("routineFormBannerHint")}</p>
            </div>
          </section>

          {/* ── 2 · A week, or a course ── */}
          <section className="s-sigilform__section" aria-labelledby="s-sigilform-s2">
            <header className="s-sigilform__sechead">
              <span className="s-sigilform__secnum" aria-hidden="true">2</span>
              <h3 className="s-sigilform__sectitle" id="s-sigilform-s2">{course ? t("routineFormSectionCourse") : t("routineFormSectionDays")}</h3>
            </header>

            {/* THE MODE IS THE FIRST QUESTION OF THIS SECTION, because every
                control under it is the answer to it: a week has parts and a
                table, a course has days, a budget and a list of steps. */}
            <div className="s-mediaform__row">
              <span className="s-mediaform__label">{t("routineFormMode")}</span>
              <SegmentedControl
                value={draft.mode}
                onChange={(v) => set("mode", v as RoutineDraft["mode"])}
                segments={[
                  { value: "week", label: t("routineFormModeWeek") },
                  { value: "course", label: t("routineFormModeCourse") },
                ]}
                label={t("routineFormMode")}
              />
              <p className="s-mediaform__hint">{t("routineFormModeHint")}</p>
            </div>

            {!course && (
              <label className="s-mediaform__row">
                <span className="s-mediaform__label">{t("routineFormSlots")}</span>
                <TextInput value={slotsText} onChange={setSlotsText} placeholder={t("routineFormSlotsPlaceholder")} label={t("routineFormSlots")} maxLength={200} dir="auto" />
                <p className="s-mediaform__hint">{t("routineFormSlotsHint")}</p>
              </label>
            )}

            {course && (
              <div className="s-mediaform__row">
                <span className="s-mediaform__label" id="s-sigilform-days">{t("routineFormDays")}</span>
                <div className="s-sigilform__days" role="group" aria-labelledby="s-sigilform-days">
                  {order.map((wd) => (
                    <label key={wd} className={`s-sigilform__day${draft.days.includes(wd) ? " is-on" : ""}`}>
                      <input type="checkbox" checked={draft.days.includes(wd)} onChange={(e) => toggleDay(wd, e.target.checked)} />
                      <span>{t(WEEKDAY_LABEL[wd])}</span>
                    </label>
                  ))}
                </div>
                <p className="s-mediaform__hint">{t("routineFormDaysHint")}</p>
              </div>
            )}

            {course && (
              <label className="s-mediaform__row">
                <span className="s-mediaform__label">{t("routineFormCapacity")}</span>
                <TextInput value={draft.capacity} onChange={(v) => set("capacity", v)} placeholder={t("routineFormCapacityPlaceholder")} label={t("routineFormCapacity")} maxLength={200} dir="auto" />
                <p className="s-mediaform__hint">{t("routineFormCapacityHint")}</p>
              </label>
            )}

            <label className="s-mediaform__row">
              <span className="s-mediaform__label">{t("routineFormItems")}</span>
              <TextInput value={itemsText} onChange={setItemsText} label={t("routineFormItems")} maxLength={600} dir="auto" />
              <p className="s-mediaform__hint">{t("routineFormItemsHint")}</p>
            </label>

            {course ? (
              <label className="s-mediaform__row">
                <span className="s-mediaform__label">{t("routineFormSteps")}</span>
                <textarea
                  className="s-ctl s-ctl-input s-sigilform__steps"
                  rows={12}
                  value={draft.steps}
                  dir="auto"
                  aria-label={t("routineFormSteps")}
                  onChange={(e) => set("steps", e.target.value)}
                />
                {/* The count and the finish date, each its own span so the
                    middle dot between them is DRAWN (routines.css) rather
                    than typed — a separator in the copy would sit at the
                    wrong end of an Arabic line. */}
                <p className="s-sigilform__stepcount" aria-live="polite">
                  {preview === null || preview.steps === 0 ? (
                    <span>{t("routineFormStepsNone")}</span>
                  ) : (
                    <>
                      <span>{tf("routineFormStepsCount", { steps: countPhrase(preview.steps, "steps"), units: countPhrase(preview.units, "units") })}</span>
                      {preview.finish !== null && (
                        <span>
                          {tf("routineFormStepsFinish", {
                            date: siteDate(`${preview.finish}T12:00:00`, useStore.getState().blogLocale, { day: "numeric", month: "long", year: "numeric" }) || preview.finish,
                          })}
                        </span>
                      )}
                    </>
                  )}
                </p>
                <p className="s-mediaform__hint">{t("routineFormStepsHint")}</p>
              </label>
            ) : (
              <div className="s-mediaform__row">
                <span className="s-mediaform__label">{t("routineFormWeek")}</span>
                <div className="s-sigilform__weekwrap">
                  <table className="s-sigilform__week">
                    <thead>
                      <tr>
                        <th>{t("routineDay")}</th>
                        {columns.map((c) => (
                          <th key={c || "plan"} dir="auto">{c || t("routinePlanTitle")}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {order.map((wd) => (
                        <tr key={wd}>
                          <th>{t(WEEKDAY_LABEL[wd])}</th>
                          {columns.map((c) => (
                            <td key={c || "plan"}>
                              <textarea
                                className="s-sigilform__cell"
                                rows={2}
                                value={draft.week[wd][c] ?? ""}
                                dir="auto"
                                aria-label={`${t(WEEKDAY_LABEL[wd])} ${c}`}
                                onChange={(e) => setCell(wd, c, e.target.value)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="s-mediaform__hint">{t("routineFormWeekHint")}</p>
              </div>
            )}
          </section>

          {/* ── 3 · What to record each day ── */}
          <section className="s-sigilform__section" aria-labelledby="s-sigilform-s3">
            <header className="s-sigilform__sechead">
              <span className="s-sigilform__secnum" aria-hidden="true">3</span>
              <h3 className="s-sigilform__sectitle" id="s-sigilform-s3">{t("routineFormSectionFields")}</h3>
            </header>
            <p className="s-mediaform__hint s-sigilform__lead">{t("routineFormFieldsHint")}</p>

            <div className="s-sigilform__opts">
              {KNOWN_FIELDS.map((k) => {
                const on = knownOn(k);
                return (
                  <div key={k.id} className={`s-sigilform__opt${on ? " is-on" : ""}`}>
                    <label className="s-sigilform__optlabel">
                      <input
                        type="checkbox"
                        className="s-sigilform__optbox"
                        checked={on !== null}
                        data-field={k.id}
                        onChange={(e) => toggleKnown(k, e.target.checked)}
                      />
                      <span className="s-sigilform__optwords">
                        <span className="s-sigilform__optname">
                          {t(k.label)}
                          <span className="s-sigilform__optkey" dir="ltr">{on ? on.key : k.key[lang]}</span>
                        </span>
                        <span className="s-sigilform__opthelp">{t(k.help)}</span>
                      </span>
                    </label>
                    {on && (on.type === "number" || on.type === "count") && (
                      <label className="s-sigilform__optextra">
                        <span className="s-sigilform__optextralabel">{t("routineFormFieldUnit")}</span>
                        <TextInput value={on.unit ?? ""} onChange={(v) => patchField(on, { unit: unitWord(v) })} label={t("routineFormFieldUnit")} maxLength={20} dir="auto" />
                      </label>
                    )}
                    {on && on.type === "scale" && (
                      <label className="s-sigilform__optextra">
                        <span className="s-sigilform__optextralabel">{t("routineFormFieldMax")}</span>
                        <NumberInput value={String(on.max ?? 5)} onChange={(v) => patchField(on, { max: Math.max(2, Math.min(10, Math.round(Number(v)) || 5)) })} unit="" min={2} max={10} label={t("routineFormFieldMax")} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="s-sigilform__own">
              <span className="s-mediaform__label">{t("routineFormFieldsCustomHead")}</span>
              <p className="s-mediaform__hint">{t("routineFormFieldsCustomHint")}</p>
              {ownFields.map((f, i) => (
                <div key={i} className="s-sigilform__ownrow">
                  <TextInput value={f.key} onChange={(v) => patchField(f, { key: fieldWord(v) })} placeholder={t("routineFormFieldName")} label={t("routineFormFieldName")} maxLength={40} dir="auto" />
                  <Select
                    value={f.type}
                    onChange={(v) => patchField(f, { type: v as RoutineFieldType, unit: v === "number" || v === "count" ? f.unit : null, max: v === "scale" ? (f.max ?? 5) : null })}
                    options={FIELD_TYPES.map((ft) => ({ value: ft.value, label: t(ft.label), note: t(ft.hint) }))}
                    label={t("routineFormFieldType")}
                  />
                  {(f.type === "number" || f.type === "count") && (
                    <TextInput value={f.unit ?? ""} onChange={(v) => patchField(f, { unit: unitWord(v) })} placeholder={t("routineFormFieldUnit")} label={t("routineFormFieldUnit")} maxLength={20} dir="auto" />
                  )}
                  {f.type === "scale" && (
                    <NumberInput value={String(f.max ?? 5)} onChange={(v) => patchField(f, { max: Math.max(2, Math.min(10, Math.round(Number(v)) || 5)) })} unit="" min={2} max={10} label={t("routineFormFieldMax")} />
                  )}
                  <button type="button" className="s-btn s-sigilform__ownremove" onClick={() => removeField(f)} aria-label={t("routineFormFieldRemove")} title={t("routineFormFieldRemove")}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="s-btn s-sigilform__addfield" onClick={addField}>
                + {t("routineFormFieldAdd")}
              </button>
            </div>
          </section>

          {/* ── 4 · Target and notes ── */}
          <section className="s-sigilform__section" aria-labelledby="s-sigilform-s4">
            <header className="s-sigilform__sechead">
              <span className="s-sigilform__secnum" aria-hidden="true">4</span>
              <h3 className="s-sigilform__sectitle" id="s-sigilform-s4">{t("routineFormSectionGoal")}</h3>
            </header>

            <label className="s-mediaform__row s-sigilform__target">
              <span className="s-mediaform__label">{t("routineFormTarget")}</span>
              <NumberInput value={draft.target === null ? "" : String(draft.target)} onChange={(v) => set("target", v.trim() === "" ? null : Math.max(1, Math.min(7, Math.round(Number(v)) || 1)))} unit={t("routineFormTargetUnit")} min={1} max={7} label={t("routineFormTarget")} />
              <p className="s-mediaform__hint">{t("routineFormTargetHint")}</p>
            </label>

            <label className="s-mediaform__row">
              <span className="s-mediaform__label">{t("routineFormBook")}</span>
              <TextInput value={draft.book} onChange={(v) => set("book", v)} label={t("routineFormBook")} maxLength={200} dir="auto" />
              <p className="s-mediaform__hint">{t("routineFormBookHint")}</p>
            </label>

            <label className="s-mediaform__row">
              <span className="s-mediaform__label">{t("routineFormNotes")}</span>
              <textarea className="s-ctl s-ctl-input s-mediaform__notes" rows={3} value={draft.notes} dir="auto" onChange={(e) => set("notes", e.target.value)} />
              <p className="s-mediaform__hint">{t("routineFormNotesHint")}</p>
            </label>
          </section>

          {!editing && <p className="s-mediaform__hint">{tf("routineFormWhere", { folder: where() })}</p>}
          {error && <p className="s-mediaform__error" role="alert">{error}</p>}
        </div>

        <div className="s-mediaform__foot">
          <button type="button" className="s-btn" disabled={busy} onClick={() => void saveTemplate()}>
            {t("routinesSaveTemplate")}
          </button>
          <span className="s-sigilform__spacer" />
          <button type="button" className="s-btn" onClick={onClose}>
            {t("routineFormCancel")}
          </button>
          <button type="submit" className="s-btn s-btn--accent" disabled={busy}>
            {t("routineFormSave")}
          </button>
        </div>
      </form>
    </div>
  );
}
