// TODAY'S DATA — one source for both shells (docs/today.md).
//
// The phone's home tab and the desktop's `~today` surface draw different
// chrome over the SAME reads and the same writes, and they live here so that
// a rule ("a tick is optimistic and put back on failure", "the reflection is
// appended through the section door") is written once. What each hook
// fetches is what the pages that own the data already fetch — /api/routines,
// /api/orbits, /api/tasks, /api/onthisday, the daily note — and every write
// goes through an existing door:
//
//   · a Sigil tick → `POST /api/routine`, the Sigil card's own edit;
//   · a task → `POST /api/task`, the ```tasks fence's toggle (the line's box
//     and its ✅ stamp, shared/tasks.ts `toggleTaskLine`);
//   · a captured line → client/capture.ts (the daily door, the flush, the
//     append, the adoption);
//   · the reflection → the daily door, then client/sectionActions.ts
//     `applyNoteContent`, which writes through the open editor when one
//     holds the note (one undoable transaction) and through the API when
//     none does.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeckMeta } from "../../shared/decks.ts";
import { noteTitleOf } from "../../shared/noteFormat.ts";
import { appendReflection } from "../../shared/reflection.ts";
import { isoDate } from "../../shared/routine.ts";
import type { OnThisDayHit, RoutineMeta, TaskMeta } from "../../shared/types.ts";
import { getDecks, getNote, getOnThisDay, getRoutines, getTasks, toggleTask as postTask, updateRoutine, voiceEngine } from "../api.ts";
import { capture } from "../capture.ts";
import { dailyNoteLabel, dailyNotePath, ensurePeriodicNoteAt, loadPeriodic, usePeriodic } from "../daily.ts";
import { collectNotes } from "../editor/links.ts";
import { t, tf } from "../i18n.ts";
import { recentNotes } from "../recents.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { actionToast } from "../undoToast.ts";
import { useVaultTick } from "../vaultTick.ts";
import { micSupport } from "../voice/micSupport.ts";
import {
  decksDue,
  dueTasks,
  onThisDayRows,
  reflectionState,
  sigilRows,
  toggledSigil,
  type DueTaskRow,
  type ReflectionState,
  type SigilTaskRow,
} from "./model.ts";

/** A clock that moves once a minute — enough to turn the day at midnight
 *  and to raise the evening's question at six without a reload. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export interface TodayRecent {
  path: string;
  title: string;
}

export interface TodayData {
  admin: boolean;
  /** `YYYY-MM-DD`, the reader's day. */
  today: string;
  now: Date;
  dailyPath: string;
  dailyExists: boolean;
  /** The daily note's text once read; null while it is not there (or not
   *  read yet). */
  dailyContent: string | null;
  sigils: SigilTaskRow[];
  /** False until the sigils have answered once. */
  sigilsLoaded: boolean;
  decks: DeckMeta[];
  tasks: DueTaskRow[];
  onThisDay: OnThisDayHit[];
  recents: TodayRecent[];
  reflection: ReflectionState;
  toggleSigil(row: SigilTaskRow): void;
  toggleTask(row: DueTaskRow): void;
  /** Append the evening's answer. Resolves true when it landed. */
  reflect(text: string): Promise<boolean>;
}

/** Everything Today shows. `recentsShown` is the shell's own measure. */
export function useToday(recentsShown: number): TodayData {
  const admin = useStore((s) => s.admin);
  const tree = useStore((s) => s.tree);
  const tick = useVaultTick();
  const now = useMinuteClock();
  const today = isoDate(now);
  const periodic = usePeriodic();
  const [dailyPath, setDailyPath] = useState(() => dailyNotePath());
  const [routines, setRoutines] = useState<RoutineMeta[] | null>(null);
  const [decks, setDecks] = useState<DeckMeta[]>([]);
  const [tasks, setTasks] = useState<TaskMeta[]>([]);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [onThisDay, setOnThisDay] = useState<OnThisDayHit[]>([]);
  const [dailyContent, setDailyContent] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadPeriodic().then(() => live && setDailyPath(dailyNotePath(new Date())));
    return () => {
      live = false;
    };
  }, [today, periodic]);

  const dailyExists = useMemo(() => (tree ? collectNotes(tree).some((n) => n.path === dailyPath) : false), [tree, dailyPath]);

  // The lists, re-read when the vault moves (a tick on the desktop reaches
  // the phone without a pull) and when the day turns.
  useEffect(() => {
    if (!admin) return;
    let live = true;
    getRoutines()
      .then((list) => live && setRoutines(list))
      .catch(() => live && setRoutines([]));
    getDecks(today)
      .then((list) => live && setDecks(decksDue(list)))
      .catch(() => {});
    getTasks()
      .then((list) => {
        if (!live) return;
        setTasks(list);
        setTicked(new Set());
      })
      .catch(() => {});
    getOnThisDay(today)
      .then((list) => live && setOnThisDay(onThisDayRows(list)))
      .catch(() => live && setOnThisDay([]));
    return () => {
      live = false;
    };
  }, [admin, today, tick]);

  // The daily note's own text: what the desktop renders in place, and where
  // the evening's answer is looked for.
  useEffect(() => {
    if (!admin || !dailyExists) {
      setDailyContent(null);
      return;
    }
    let live = true;
    getNote(dailyPath)
      .then((note) => live && setDailyContent(note.content))
      .catch(() => live && setDailyContent(null));
    return () => {
      live = false;
    };
  }, [admin, dailyExists, dailyPath, tick]);

  const sigils = useMemo(() => sigilRows(routines ?? [], today), [routines, today]);
  const due = useMemo(() => {
    const rows = dueTasks(tasks, today);
    // A ticked task stays in the list, struck, until the vault's next read:
    // a row that vanished under the finger would read as a mis-tap.
    return rows.map((r) => (ticked.has(`${r.path}#${r.task.line}`) ? { ...r, task: { ...r.task, done: true } } : r));
  }, [tasks, today, ticked]);

  const recents = useMemo(() => {
    if (!tree) return [];
    const titles = new Map(collectNotes(tree).map((n) => [n.path, n.title]));
    return recentNotes(tree, { limit: recentsShown }).map((path) => ({ path, title: titles.get(path) ?? path }));
  }, [tree, recentsShown]);

  // A tick is answered on screen at once and written behind it; a failed
  // write puts the box back and says so.
  const toggleSigil = useCallback(
    (row: SigilTaskRow): void => {
      const { meta, done } = toggledSigil(row, today);
      const same = (m: RoutineMeta): boolean => m.path === row.meta.path && m.index === row.meta.index;
      setRoutines((list) => (list ?? []).map((m) => (same(m) ? meta : m)));
      updateRoutine(row.meta.path, row.meta.index, { date: today, done }).catch(() => {
        toast(tf("routinesSaveFailed", { title: row.meta.plan.title }), "error");
        setRoutines((list) => (list ?? []).map((m) => (same(m) ? row.meta : m)));
      });
    },
    [today],
  );

  const toggleTask = useCallback(
    (row: DueTaskRow): void => {
      const key = `${row.path}#${row.task.line}`;
      const on = !row.task.done;
      setTicked((was) => {
        const next = new Set(was);
        if (on) next.add(key);
        else next.delete(key);
        return next;
      });
      postTask(row.path, row.task.line, on, today).catch(() => {
        toast(t("todayTaskFailed"), "error");
        setTicked((was) => {
          const next = new Set(was);
          next.delete(key);
          return next;
        });
      });
    },
    [today],
  );

  const reflect = useCallback(async (text: string): Promise<boolean> => {
    if (text.trim() === "") return false;
    const ensured = await ensurePeriodicNoteAt("day", new Date());
    if (ensured === null) return false;
    try {
      // The section door is reached by import(): it carries the outline's
      // section surgery, and the phone's first screen asks for it only when
      // an evening's answer is sent.
      const { applyNoteContent, noteContent } = await import("../sectionActions.ts");
      const next = appendReflection(await noteContent(ensured.path), text);
      await applyNoteContent(ensured.path, next);
      setDailyContent(next);
      return true;
    } catch (err) {
      console.error("astrolabe: the reflection could not be written", err);
      toast(t("todayReflectFailed"), "error");
      return false;
    }
  }, []);

  return {
    admin,
    today,
    now,
    dailyPath,
    dailyExists,
    dailyContent,
    sigils,
    sigilsLoaded: routines !== null,
    decks,
    tasks: due,
    onThisDay,
    recents,
    reflection: reflectionState(dailyContent, now),
    toggleSigil,
    toggleTask,
    reflect,
  };
}

/** The capture line at the top of Today: a field, and the flow the capture
 *  sheet runs (client/capture.ts), with the toast that names where it went. */
export function useCaptureLine(): { text: string; setText: (text: string) => void; busy: boolean; send: () => Promise<void> } {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = useCallback(async (): Promise<void> => {
    const line = text.trim();
    if (line === "" || busy) return;
    setBusy(true);
    try {
      const path = await capture(line, "daily");
      if (path === null) return;
      setText("");
      actionToast(tf("capturedTo", { name: dailyNoteLabel(path) ?? noteTitleOf(path) }), t("captureOpenNote"), () => useStore.getState().openNote(path));
    } catch {
      toast(t("captureFailed"), "error");
    } finally {
      setBusy(false);
    }
  }, [text, busy]);
  return { text, setText, busy, send };
}

/** Whether Today offers the microphone beside the capture line: this device
 *  can record (client/voice/recorder.ts), and the vault keeps recordings —
 *  a server that answers its voice engine (transcribing or not, it keeps the
 *  audio), or a pocket vault, which keeps and links them (3.24.0). */
export function useVoiceReady(): boolean {
  const pocket = useStore((s) => s.pocket);
  const admin = useStore((s) => s.admin);
  const [server, setServer] = useState(false);
  useEffect(() => {
    if (!admin || pocket || micSupport() !== null) return;
    let live = true;
    voiceEngine()
      .then(() => live && setServer(true))
      .catch(() => live && setServer(false));
    return () => {
      live = false;
    };
  }, [admin, pocket]);
  if (!admin || micSupport() !== null) return false;
  return pocket || server;
}
