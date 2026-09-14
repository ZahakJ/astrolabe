// THE ROUTINE FORM — a new routine from a template, or an edit of one.
//
// It writes a NOTE, as the Media form does: `Routines/<Title>.md` holding the
// title as frontmatter, the ```routine plan the draft composes
// (shared/routine.ts routineFenceBody) and an empty ```routine-log, so the
// shape is on the page before day one. An edit sends the plan's new body to
// POST /api/routine, which replaces the plan fence and nothing else — the
// log under it, the prose around it, all kept.
//
// TEMPLATES ARE TWO SHELVES. The built-in presets (the owner's exercise week,
// prayers, sleep, water, mood, reading, study, habits) and the vault's own:
// any note in the templates folder that carries a ```routine fence. "Save as
// template" writes the draft there, so a routine drawn up once can seed the
// next — the owner's ask: "ability to create custom templates".

import { useEffect, useMemo, useRef, useState } from "react";
import { useDialog } from "../a11y.ts";
import { putNote, updateRoutine } from "../api.ts";
import { NumberInput, SegmentedControl, TextInput } from "../components/controls/Fields.tsx";
import {
  ROUTINES_ROOTS,
  WEEKDAYS,
  draftOf,
  emptyDraft,
  foldRoutineKind,
  routineFenceBody,
  routineFileName,
  routineNoteContent,
  routineNotePath,
  routinesRootFor,
  weekOrder,
  type RoutineDraft,
  type RoutineKind,
  type Weekday,
} from "../../shared/routine.ts";
import { ROUTINE_PRESETS } from "../../shared/routinePresets.ts";
import type { RoutineMeta } from "../../shared/types.ts";
import { getLang, t, tf, type I18nKey } from "../i18n.ts";
import { treeHasFolder, treeHasPath } from "../media/mediaModel.ts";
import { useStore } from "../state.ts";
import { templateSettings } from "../templates.ts";
import { toast } from "../toast.ts";

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

const WEEKDAY_LABEL: Record<Weekday, I18nKey> = {
  mon: "weekdayMon",
  tue: "weekdayTue",
  wed: "weekdayWed",
  thu: "weekdayThu",
  fri: "weekdayFri",
  sat: "weekdaySat",
  sun: "weekdaySun",
};

const KINDS: RoutineKind[] = ["exercise", "habit", "prayer", "sleep", "water", "mood", "reading", "study"];

function listText(items: string[]): string {
  return items.join(", ");
}

function textList(raw: string): string[] {
  return raw
    .split(/[,،]/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
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
  const [error, setError] = useState<string | null>(null);
  const [slotsText, setSlotsText] = useState(() => listText(draft.slots));
  const [itemsText, setItemsText] = useState(() => listText(draft.items));
  const [fieldsText, setFieldsText] = useState(() => draft.fields.join("\n"));
  const panelRef = useRef<HTMLFormElement | null>(null);
  useDialog(panelRef, { onEscape: onClose });
  useEffect(() => setError(null), [draft.title]);

  const set = <K extends keyof RoutineDraft>(key: K, value: RoutineDraft[K]): void => setDraft((d) => ({ ...d, [key]: value }));

  const apply = (next: RoutineDraft, id: string): void => {
    setDraft(next);
    setSlotsText(listText(next.slots));
    setItemsText(listText(next.items));
    setFieldsText(next.fields.join("\n"));
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

  const composed = (): RoutineDraft => ({
    ...draft,
    slots,
    items: textList(itemsText),
    fields: fieldsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s !== ""),
  });

  const where = (): string => {
    const state = useStore.getState();
    return routinesRootFor(state.siteLanguage, ROUTINES_ROOTS.filter((root) => treeHasFolder(state.tree, root)));
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

  return (
    <div className="s-palette-overlay" onMouseDown={onClose}>
      <form
        ref={panelRef}
        className="s-mediaform s-routineform"
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

        <div className="s-mediaform__body">
          {!editing && (
            <div className="s-mediaform__row">
              <span className="s-mediaform__label">{t("routinesPresetsHead")}</span>
              <div className="s-routineform__presets" role="radiogroup" aria-label={t("routinesPresetsHead")}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={source === "blank"}
                  className={`s-routineform__preset${source === "blank" ? " is-on" : ""}`}
                  onClick={() => apply(emptyDraft(), "blank")}
                >
                  {t("routinesBlank")}
                </button>
                {ROUTINE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={source === p.id}
                    className={`s-routineform__preset${source === p.id ? " is-on" : ""}`}
                    onClick={() => apply(p.draft(lang), p.id)}
                  >
                    {t(KIND_LABEL[p.id])}
                  </button>
                ))}
              </div>
              {templates.length > 0 && (
                <>
                  <span className="s-mediaform__label s-routineform__sublabel">{t("routinesTemplatesHead")}</span>
                  <div className="s-routineform__presets" role="radiogroup" aria-label={t("routinesTemplatesHead")}>
                    {templates.map((m) => (
                      <button
                        key={`${m.path}::${m.index}`}
                        type="button"
                        role="radio"
                        aria-checked={source === m.path}
                        className={`s-routineform__preset${source === m.path ? " is-on" : ""}`}
                        title={m.path}
                        dir="auto"
                        onClick={() => apply(draftOf(m.plan), m.path)}
                      >
                        {m.plan.title || m.noteTitle}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <label className="s-mediaform__row">
            <span className="s-mediaform__label">{t("routineFormTitle")}</span>
            <TextInput value={draft.title} onChange={(v) => set("title", v)} placeholder={t("routineFormTitlePlaceholder")} label={t("routineFormTitle")} maxLength={200} dir="auto" />
          </label>

          {/* A preset already answers "what kind": the row repeats the same
              eight words a screen above it, so it shows for a blank sheet, an
              edit, or a template of the reader's own. */}
          {(source === "blank" || source === "edit" || !KINDS.includes(source as RoutineKind)) && (
          <div className="s-mediaform__row">
            <span className="s-mediaform__label">{t("routineFormKind")}</span>
            <SegmentedControl value={segmentValue} onChange={(v) => set("kind", v)} segments={segments} label={t("routineFormKind")} />
            <TextInput value={kindKey ? "" : draft.kind} onChange={(v) => set("kind", v)} placeholder={t("routineFormKindOwn")} label={t("routineFormKindOwn")} maxLength={40} dir="auto" />
          </div>
          )}

          <div className="s-mediaform__pair">
            <label className="s-mediaform__row">
              <span className="s-mediaform__label">{t("routineFormSlots")}</span>
              <TextInput value={slotsText} onChange={setSlotsText} placeholder={t("routineFormSlotsPlaceholder")} label={t("routineFormSlots")} maxLength={200} dir="auto" />
              <p className="s-mediaform__hint">{t("routineFormSlotsHint")}</p>
            </label>
            <label className="s-mediaform__row">
              <span className="s-mediaform__label">{t("routineFormTarget")} · {t("routineFormTargetUnit")}</span>
              <NumberInput value={draft.target === null ? "" : String(draft.target)} onChange={(v) => set("target", v.trim() === "" ? null : Math.max(1, Math.min(7, Math.round(Number(v)) || 1)))} unit="" min={1} max={7} label={t("routineFormTarget")} />
            </label>
          </div>

          <label className="s-mediaform__row">
            <span className="s-mediaform__label">{t("routineFormItems")}</span>
            <TextInput value={itemsText} onChange={setItemsText} label={t("routineFormItems")} maxLength={600} dir="auto" />
            <p className="s-mediaform__hint">{t("routineFormItemsHint")}</p>
          </label>

          <div className="s-mediaform__row">
            <span className="s-mediaform__label">{t("routineFormWeek")}</span>
            <div className="s-routineform__weekwrap">
              <table className="s-routineform__week">
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
                            className="s-routineform__cell"
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

          <label className="s-mediaform__row">
            <span className="s-mediaform__label">{t("routineFormFields")}</span>
            <textarea className="s-ctl s-ctl-input s-routineform__fields" rows={3} value={fieldsText} dir="auto" onChange={(e) => setFieldsText(e.target.value)} placeholder={"minutes:number\nweight:number:kg\nmood:scale:5"} />
            <p className="s-mediaform__hint">{t("routineFormFieldsHint")}</p>
          </label>

          <label className="s-mediaform__row">
            <span className="s-mediaform__label">{t("routineFormBook")}</span>
            <TextInput value={draft.book} onChange={(v) => set("book", v)} label={t("routineFormBook")} maxLength={200} dir="auto" />
            <p className="s-mediaform__hint">{t("routineFormBookHint")}</p>
          </label>

          <label className="s-mediaform__row">
            <span className="s-mediaform__label">{t("routineFormNotes")}</span>
            <textarea className="s-ctl s-ctl-input s-mediaform__notes" rows={3} value={draft.notes} dir="auto" onChange={(e) => set("notes", e.target.value)} />
          </label>

          {!editing && <p className="s-mediaform__hint">{tf("routineFormWhere", { folder: where() })}</p>}
          {error && <p className="s-mediaform__error" role="alert">{error}</p>}
        </div>

        <div className="s-mediaform__foot">
          <button type="button" className="s-btn" disabled={busy} onClick={() => void saveTemplate()}>
            {t("routinesSaveTemplate")}
          </button>
          <span className="s-routineform__spacer" />
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
