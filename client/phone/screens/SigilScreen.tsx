// ONE SIGIL, as a screen: today's checklist first.
//
// The card is the reading renderer's own (client/reading/routine.ts) — the
// same one the note and the desktop's Sigils page draw — asked for in the
// PHONE'S ORDER (`layout: "phone"`): the day's checklist, then the week strip
// and the heat map, then the streak and month figures, and a course's units
// and projected dates open under them. Edit, open the note and delete live in
// the top bar's ⋯, not in the card's corner.
//
// A TICK IS IN PLACE. The box answers at once — the entry is merged here with
// the same `mergeEntry` the server applies, and the card is patched rather
// than redrawn (client/morph.ts) — and the write goes behind it through the
// same `POST /api/routine` every other surface uses. A failed write puts the
// card back and says so.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isoDate, mergeEntry, type EntryPatch } from "../../../shared/routine.ts";
import type { RoutineMeta } from "../../../shared/types.ts";
import { getRoutines, updateRoutine } from "../../api.ts";
import { confirmDeleteNote } from "../../components/deleteFlow.ts";
import { t, tf } from "../../i18n.ts";
import { RoutineForm } from "../../routines/RoutineForm.tsx";
import { morph } from "../../morph.ts";
import { renderRoutineCard } from "../../reading/routine.ts";
import { renderMarkdown } from "../../reading/render.ts";
import { decorateDeckTasks } from "../../routines/orbits.ts";
import { useStore } from "../../state.ts";
import { toast } from "../../toast.ts";
import { useActionSheet } from "../ActionSheet.tsx";
import { usePhone } from "../context.ts";
import { IconDots } from "../icons.tsx";
import RoutedLayer from "../RoutedLayer.tsx";
import TopBar from "../TopBar.tsx";
import { useVaultTick } from "../../vaultTick.ts";
import "../../styles/routines.css";


export default function SigilScreen({ path, index, onBack }: { path: string; index: number; onBack: () => void }) {
  const phone = usePhone();
  const actions = useActionSheet();
  const admin = useStore((s) => s.admin);
  useStore((s) => s.language);
  const tick = useVaultTick();
  const today = isoDate(new Date());
  const [all, setAll] = useState<RoutineMeta[] | null>(null);
  const [meta, setMeta] = useState<RoutineMeta | null | "gone">(null);
  const [view, setView] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const host = useRef<HTMLDivElement | null>(null);
  /** Writes still on their way: a vault tick must not redraw an older
   *  answer over a box the reader has just ticked. */
  const inFlight = useRef(0);

  const load = useCallback(() => {
    getRoutines()
      .then((list) => {
        if (inFlight.current > 0) return;
        setAll(list);
        setMeta(list.find((m) => m.path === path && m.index === index) ?? "gone");
      })
      .catch(() => setMeta((m) => m ?? "gone"));
  }, [path, index]);
  useEffect(load, [load, tick]);

  const metaRef = useRef(meta);
  metaRef.current = meta;
  const log = useCallback((patch: EntryPatch): void => {
    const current = metaRef.current;
    if (current === null || current === "gone") return;
    const was = current.entries.find((e) => e.date === patch.date) ?? null;
    const next = mergeEntry(was, patch);
    const entries = was ? current.entries.map((e) => (e === was ? next : e)) : [...current.entries, next].sort((a, b) => a.date.localeCompare(b.date));
    setMeta({ ...current, entries });
    inFlight.current += 1;
    updateRoutine(current.path, current.index, patch)
      .catch(() => {
        toast(tf("routinesSaveFailed", { title: current.plan.title }), "error");
        setMeta(current);
      })
      .finally(() => {
        inFlight.current -= 1;
      });
  }, []);

  // The author's notes go through the markdown pipeline once per text, not
  // once per tick: a tick changes the log, never the plan's notes.
  const notesSrc = meta && meta !== "gone" ? meta.plan.notes : null;
  const notesPath = meta && meta !== "gone" ? meta.path : "";
  const notesHtml = useMemo(
    () => (notesSrc ? renderMarkdown(notesSrc, { notePath: notesPath, tree: useStore.getState().tree }).innerHTML : undefined),
    [notesSrc, notesPath],
  );

  // The card, drawn by the renderer and patched in place on every change.
  useEffect(() => {
    const el = host.current;
    if (!el || meta === null || meta === "gone") return;
    const card = renderRoutineCard(meta.plan, meta.entries, {
      notePath: meta.path,
      notesHtml,
      today,
      onLog: admin ? log : undefined,
      view,
      onView: setView,
      layout: "phone",
    });
    decorateDeckTasks(card, meta, today, () => el.firstElementChild);
    const standing = el.firstElementChild;
    if (standing && standing.className === card.className) morph(standing, card);
    else el.replaceChildren(card);
  }, [meta, today, admin, log, view, notesHtml]);

  const templates = useMemo(() => (all ?? []).filter((m) => m.template), [all]);
  const title = meta && meta !== "gone" ? meta.plan.title || t("routineUntitled") : "";
  const menu = (): void => {
    if (!meta || meta === "gone") return;
    actions(title, [
      { label: t("routinesEdit"), onSelect: () => setEditing(true) },
      { label: t("phOpenNote"), onSelect: () => phone.open({ kind: "note", path: meta.path }, "push") },
      {
        label: t("routinesDelete"),
        danger: true,
        // The note's own delete — the same question, the same trash and Undo
        // as the tree's. Gone, the screen has nothing to show: back to the list.
        onSelect: () =>
          void confirmDeleteNote(meta.path)
            .then(() => getRoutines())
            .then((list) => {
              if (!list.some((m) => m.path === meta.path && m.index === meta.index)) phone.nav.popScreen();
            })
            .catch(() => {}),
      },
    ]);
  };

  return (
    <div className="s-ph-screen s-ph-sigil" data-screen="sigil" data-path={path}>
      <TopBar
        title={title}
        userTitle
        onBack={onBack}
        actions={
          admin && meta && meta !== "gone" ? (
            <button type="button" className="s-ph-icon" aria-label={t("phMore")} onClick={menu}>
              <IconDots />
            </button>
          ) : undefined
        }
      />
      <div className="s-ph-scroll">
        {meta === null && <p className="s-ph-empty">{t("loading")}</p>}
        {meta === "gone" && <p className="s-ph-empty">{t("phSigilGone")}</p>}
        <div ref={host} className="s-ph-sigil__card" />
      </div>
      {editing && meta && meta !== "gone" && (
        <RoutedLayer id="edit-sigil" onGone={() => setEditing(false)}>
          <RoutineForm
            editing={meta}
            templates={templates}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              load();
            }}
          />
        </RoutedLayer>
      )}
    </div>
  );
}
