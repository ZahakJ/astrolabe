// THE SIGILS PAGE. Every ```sigil in the vault, as today's checklists.
//
// A workspace TAB like the Media page (`ROUTINES_TAB` in client/workspace.ts)
// and a lazy chunk with its own stylesheet. It is a second drawing of the
// card the note already draws — the same renderer (client/reading/routine.ts)
// mounted into React, one card per plan — plus a form that writes a new
// sigil as a note of its own under `Sigils/`. A tick here goes to
// `POST /api/routine`, which records the day in the note's log fence with
// the same pure edit the editor's widget dispatches into its buffer.
//
// Reads `GET /api/routines`; re-reads on the window's `astrolabe:vault`
// event, because a box ticked in the editor is still this page's business.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { morph } from "../morph.ts";
import SiteMark from "../components/SiteMark.tsx";
import type { RoutineMeta, TrackerMeta } from "../../shared/types.ts";
import { dayStatus, isoDate, weekOrder, weekdayOfDate, type EntryPatch } from "../../shared/routine.ts";
import { getDecks, getRoutines, getTasks, getTrackers, updateRoutine } from "../api.ts";
import { siteDate } from "../dates.ts";
import { countPhrase, getLang, localeNum, t, tf } from "../i18n.ts";
import { confirmDeleteNote } from "../components/deleteFlow.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import { renderRoutineCard } from "../reading/routine.ts";
import { renderMarkdown, renderTasksBlock } from "../reading/render.ts";
import { filterTasks, parseTasksFence, shift } from "../../shared/tasks.ts";
import { RoutineForm } from "./RoutineForm.tsx";
import { decorateDeckTasks } from "./orbits.ts";
import { OnThisDayList, useOnThisDay } from "../components/OnThisDayPanel.tsx";
import { collectNotes } from "../editor/links.ts";
import { recentNotes } from "../recents.ts";
import "../styles/routines.css";

export const VAULT_EVENT = "astrolabe:vault";

/** The reading renderer's card, mounted in React. Rebuilt whenever the meta
 *  changes (a tick answered by the server, a hand edit heard on the vault
 *  event); the card holds no state of its own, so a rebuild is the truth. */
function RoutineCard({
  meta,
  today,
  onLog,
  onOpen,
  onEdit,
  onDelete,
  view,
  onView,
}: {
  meta: RoutineMeta;
  today: string;
  onLog: (patch: EntryPatch) => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  view: string | null;
  onView: (iso: string | null) => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    // The author's notes go through the markdown pipeline, as the reading
    // view's fence branch does it (render.ts routineBlock).
    const notesHtml = meta.plan.notes ? renderMarkdown(meta.plan.notes, { notePath: meta.path, tree: useStore.getState().tree }).innerHTML : undefined;
    const card = renderRoutineCard(meta.plan, meta.entries, {
      notePath: meta.path,
      notesHtml,
      today,
      onLog,
      onOpen,
      view,
      onView,
      actions: [
        { label: t("routinesEdit"), onClick: onEdit },
        { label: t("routinesDelete"), onClick: onDelete },
      ],
    });
    // A slot that wikilinks a deck gets its "N due · Study" chip
    // (client/routines/orbits.ts) — after the draw, on the drawn card.
    decorateDeckTasks(card, meta, today);
    // A card that already stands is patched, not replaced: a tick moves one
    // checkbox and a number, the banner does not reload, the folded plan
    // stays as the reader left it (client/morph.ts).
    const standing = el.firstElementChild;
    if (standing && standing.className === card.className) morph(standing, card);
    else el.replaceChildren(card);
    return () => {
      // Torn down only when the card leaves for good, not between ticks.
      if (!el.isConnected) el.replaceChildren();
    };
  }, [meta, today, onLog, onOpen, onEdit, onDelete, view, onView]);
  return <div ref={host} className="s-routines__card" />;
}

/** Open tasks due by today, live: the day's dashboard is where a to-do
 *  with a date belongs, next to the routines that carry no dates. The rows
 *  are fetched HERE and handed to the block, so the page can count them for
 *  the "N due" line without the block fetching them a second time. */
function DueTasks({ today, onCount }: { today: string; onCount: (n: number) => void }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    // Every vault frame would re-fetch every task in the vault; a burst of
    // autosaves is one re-read, a beat after the last of them.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setTick((n) => n + 1), 400);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    return () => {
      window.removeEventListener(VAULT_EVENT, onVault);
      if (timer) clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let alive = true;
    const spec = parseTasksFence(`not done\ndue before ${shift(today, 1)}`, today);
    getTasks()
      .then((rows) => {
        if (!alive || !host.current) return;
        onCount(filterTasks(rows, spec).length);
        host.current.replaceChildren(renderTasksBlock(spec, { notePath: "", tree: useStore.getState().tree }, { live: true, rows }));
      })
      .catch(() => {
        // The block draws its own failure state from its own fetch.
        if (alive && host.current) host.current.replaceChildren(renderTasksBlock(spec, { notePath: "", tree: useStore.getState().tree }, { live: true }));
      });
    return () => {
      alive = false;
      el.replaceChildren();
    };
  }, [today, tick, onCount]);
  return <div ref={host} className="s-routines__tasks" />;
}

/** How many cards are due today across every deck, and how many tasks —
 *  one line with a door to the Orbits shelf, because the morning's checklist
 *  is where the day's cards belong. The card count is the shelf's own
 *  (`counts.due`, summed), so the two pages never disagree: the old cards
 *  route counted a never-seen card as due, and this line said "1 due" over
 *  a shelf that said nothing was. The task count is the "Due by today" list's
 *  own (DueTasks hands it up), so the line says what the day owes in full
 *  rather than the cards alone over a list of tasks. */
function CardsDue({ today, onCount, tasksDue }: { today: string; onCount: (n: number) => void; tasksDue: number }) {
  const [due, setDue] = useState(0);
  const openOrbits = useStore((s) => s.openOrbits);
  useEffect(() => {
    let alive = true;
    const read = (): void => {
      getDecks(today)
        .then((list) => {
          if (!alive) return;
          const n = list.reduce((sum, m) => sum + m.counts.due, 0);
          setDue(n);
          onCount(n);
        })
        .catch(() => {});
    };
    read();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(read, 400);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    return () => {
      alive = false;
      window.removeEventListener(VAULT_EVENT, onVault);
      if (timer) clearTimeout(timer);
    };
  }, [today, onCount]);
  if (due === 0 && tasksDue === 0) return null;
  const what =
    due > 0 && tasksDue > 0
      ? tf("routinesDueBoth", { cards: countPhrase(due, "orbits"), tasks: countPhrase(tasksDue, "tasks") })
      : due > 0
        ? countPhrase(due, "orbits")
        : countPhrase(tasksDue, "tasks");
  return (
    <section className="s-routines__cards" data-testid="routines-cards-due">
      <span className="s-routines__cardstext">{tf("routinesOrbitsDue", { n: what })}</span>
      {due > 0 && (
        <button type="button" className="s-btn s-btn--accent" onClick={() => openOrbits(null)}>
          {t("orbits")}
        </button>
      )}
    </section>
  );
}

/** How many recently-read notes the row offers: a hand's worth. */
const RECENTS_SHOWN = 6;

/** RECENTLY READ, at the top of the page when nothing is due there: a day
 *  with no checklist asking and no cards waiting is a day to pick up where
 *  you were, and the palette's own memory (client/recents.ts, frecency,
 *  pruned against the live tree) is the list of where that was. */
function RecentlyRead() {
  const tree = useStore((s) => s.tree);
  const openNote = useStore((s) => s.openNote);
  const setView = useStore((s) => s.setView);
  const rows = useMemo(() => {
    if (tree === null) return [];
    const titles = new Map(collectNotes(tree).map((n) => [n.path, n.title]));
    return recentNotes(tree, { limit: RECENTS_SHOWN }).map((path) => ({ path, title: titles.get(path) ?? path }));
  }, [tree]);
  if (rows.length === 0) return null;
  return (
    <section className="s-routines__recent" aria-label={t("recentlyRead")} data-testid="routines-recent">
      <h2 className="s-routines__otdhead">{t("recentlyRead")}</h2>
      <ul className="s-routines__recentlist">
        {rows.map((r) => (
          <li key={r.path}>
            <button
              type="button"
              className="s-routines__recentnote"
              dir="auto"
              title={r.path}
              onClick={() => {
                openNote(r.path);
                setView("editor");
              }}
            >
              {r.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** On the site's last weekday — Sunday for an English instance, Friday for
 *  an Arabic one — a line offering the weekly review, where the week's
 *  sigils, pages, cards and notes are added up. Nothing on the other six
 *  days: the page is the morning's checklist, and the review is a door the
 *  palette holds every day of the week. */
function ReviewWeekRow({ today }: { today: string }) {
  const setView = useStore((s) => s.setView);
  // The chrome's language, as the card reckons its week (renderRoutineCard).
  if (weekdayOfDate(today) !== weekOrder(getLang())[6]) return null;
  return (
    <section className="s-routines__cards" data-testid="routines-review-week">
      <span className="s-routines__cardstext">{t("routinesReviewWeek")}</span>
      <button type="button" className="s-btn s-btn--accent" onClick={() => setView("review-week")}>
        {t("cmdReviewWeek")}
      </button>
    </section>
  );
}

/** MASONRY, THE HONEST WAY. A row grid made every row as tall as its
 *  tallest card, so a short card left a hole above the card below it (the
 *  owner: "a whole gap between the top-left sigil and the one below it").
 *  CSS columns would close the hole but reflow every card the moment one
 *  expands, so a folded plan opening on the left would send a card to the
 *  right. This places cards once: in title order, each into the shortest
 *  column, by measured height — and moves nothing afterwards unless the
 *  column count or the set of cards changes. Heights are read from the
 *  rendered cards through one ResizeObserver; the first paint is a
 *  round-robin guess that the measurement corrects a frame later. */
function useMasonry(keys: string[], columns: number, hostRef: React.RefObject<HTMLDivElement | null>): Map<string, number> {
  const heights = useRef(new Map<string, number>());
  const [placed, setPlaced] = useState<Map<string, number>>(new Map());
  const signature = `${columns}|${keys.join("\u0000")}`;
  const place = useCallback((): void => {
    const tall = Array.from({ length: columns }, () => 0);
    const next = new Map<string, number>();
    keys.forEach((key, i) => {
      const h = heights.current.get(key);
      const col = h === undefined ? i % columns : tall.indexOf(Math.min(...tall));
      next.set(key, col);
      tall[col] += (h ?? 320) + 18;
    });
    setPlaced(next);
  }, [keys, columns]);
  useEffect(() => {
    place();
  }, [signature, place]);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let pending = false;
    const ro = new ResizeObserver((entries) => {
      let changed = false;
      for (const e of entries) {
        const key = (e.target as HTMLElement).dataset.key;
        if (!key) continue;
        const h = e.contentRect.height;
        if (heights.current.get(key) === undefined) changed = true;
        heights.current.set(key, h);
      }
      // Only a card measured for the FIRST time re-places the set — a card
      // that merely grew (a fold opened) stays where it is.
      if (changed && !pending) {
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          place();
        });
      }
    });
    for (const el of host.querySelectorAll<HTMLElement>("[data-key]")) ro.observe(el);
    return () => ro.disconnect();
  }, [signature, place, hostRef]);
  return placed;
}

/** How many columns the page has room for: a card wants 380px. */
function useColumns(hostRef: React.RefObject<HTMLDivElement | null>): number {
  const [columns, setColumns] = useState(1);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = (): void => setColumns(Math.max(1, Math.min(3, Math.floor((host.clientWidth + 18) / (380 + 18)))));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [hostRef]);
  return columns;
}

export default function RoutinesView() {
  const [all, setAll] = useState<RoutineMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState<{ open: boolean; editing: RoutineMeta | null }>({ open: false, editing: null });
  const openNote = useStore((s) => s.openNote);
  const setView = useStore((s) => s.setView);
  const locale = useStore((s) => s.blogLocale);
  const today = isoDate(new Date());

  // The trackers ride the same load, for the calendar's marks only (a day a
  // book was read is a kept day); a shelf that will not load costs nothing
  // but those marks.
  const [trackers, setTrackers] = useState<TrackerMeta[]>([]);
  const load = useCallback((): void => {
    getRoutines()
      .then((list) => {
        setAll(list);
        setFailed(false);
      })
      .catch(() => setFailed(true));
    getTrackers()
      .then(setTrackers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVault = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 250);
    };
    window.addEventListener(VAULT_EVENT, onVault);
    return () => {
      window.removeEventListener(VAULT_EVENT, onVault);
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  // In a STABLE order — by title, in the site's language — not the server's
  // newest-touched-first: every tick writes the note, and a card that jumped
  // to the front each time its box was ticked was the "flash" the owner saw.
  const live = useMemo(
    () => (all ?? []).filter((m) => !m.template).sort((a, b) => a.plan.title.localeCompare(b.plan.title, locale) || a.path.localeCompare(b.path)),
    [all, locale],
  );
  const templates = useMemo(() => (all ?? []).filter((m) => m.template), [all]);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const columns = useColumns(gridRef);
  const keys = useMemo(() => live.map((m) => `${m.path}::${m.index}`), [live]);
  const placed = useMasonry(keys, columns, gridRef);
  // The day each card is showing instead of today, by card; a click on a
  // heatmap cell or week day sets it, "← Today" clears it.
  const [views, setViews] = useState<Record<string, string | null>>({});
  const complete = useMemo(
    () => live.filter((m) => dayStatus(m.plan, m.entries.find((e) => e.date === today) ?? null, today, today) === "complete").length,
    [live, today],
  );
  const asked = useMemo(() => live.filter((m) => dayStatus(m.plan, null, today, today) !== "rest").length, [live, today]);
  const [cardsDue, setCardsDue] = useState(0);
  const [tasksDue, setTasksDue] = useState(0);
  // "Nothing due" is a fact about the whole page: no sigil asks today (or
  // every one that asked has been ticked — a finished checklist owes the
  // day nothing), no card waits and no task is due. Only then does the
  // recents row take the top.
  const nothingDue = all !== null && complete >= asked && cardsDue === 0 && tasksDue === 0;

  const log = useCallback(
    async (meta: RoutineMeta, patch: EntryPatch): Promise<void> => {
      try {
        await updateRoutine(meta.path, meta.index, patch);
      } catch {
        toast(tf("routinesSaveFailed", { title: meta.plan.title }), "error");
      }
      load();
    },
    [load],
  );

  const open = useCallback(
    (meta: RoutineMeta): void => {
      openNote(meta.path);
      setView("editor");
    },
    [openNote, setView],
  );

  const remove = useCallback(
    (meta: RoutineMeta): void => {
      void confirmDeleteNote(meta.path).then(load);
    },
    [load],
  );

  const onThisDay = useOnThisDay();
  const dateLine = siteDate(`${today}T12:00:00`, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="s-routines" data-testid="routines-page">
      <header className="s-routines__head">
        <div className="s-routines__headtext">
          <p className="s-routines__date">{dateLine}</p>
          <h1 className="s-routines__h1">{t("routines")}</h1>
          <p className="s-routines__lead">
            {live.length > 0 && asked > 0 ? tf("routinesSummary", { done: localeNum(complete), of: localeNum(asked) }) : t("routinesLead")}
          </p>
        </div>
        <button type="button" className="s-btn s-btn--accent s-routines__addbtn" onClick={() => setForm({ open: true, editing: null })}>
          {t("routinesAdd")}
        </button>
      </header>
      {nothingDue && <RecentlyRead />}
      {/* No month grid here. The sidebar's Calendar section draws the same
          grid with the same marks and is on screen beside this page, so the
          card was a second copy of a calendar the reader already had. */}
      {onThisDay.length > 0 && (
        <section className="s-routines__otd" aria-label={t("onThisDay")}>
          <h2 className="s-routines__otdhead">{t("onThisDay")}</h2>
          <OnThisDayList rows={onThisDay} />
        </section>
      )}
      <CardsDue today={today} onCount={setCardsDue} tasksDue={tasksDue} />
      <ReviewWeekRow today={today} />
      <section className="s-routines__due" aria-label={t("routinesTasksHead")}>
        <DueTasks today={today} onCount={setTasksDue} />
      </section>
      {failed ? (
        <p className="s-routines__empty">{t("routinesFailed")}</p>
      ) : all !== null && live.length === 0 ? (
        <div className="s-routines__empty">
          <span className="s-routines__emptystar" aria-hidden="true"><SiteMark size={32} /></span>
          <p className="s-routines__emptytext">{t("routinesEmpty")}</p>
          <p className="s-routines__emptyhint">{t("routinesEmptyHint")}</p>
        </div>
      ) : (
        <div className="s-routines__grid" ref={gridRef} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, col) => (
            <div className="s-routines__column" key={col}>
              {live
                .filter((m) => (placed.get(`${m.path}::${m.index}`) ?? live.indexOf(m) % columns) === col)
                .map((meta) => (
                  <div className="s-routines__slot" data-key={`${meta.path}::${meta.index}`} key={`${meta.path}::${meta.index}`}>
                    <RoutineCard
                      meta={meta}
                      today={today}
                      onLog={(patch) => void log(meta, patch)}
                      onOpen={() => open(meta)}
                      onEdit={() => setForm({ open: true, editing: meta })}
                      onDelete={() => remove(meta)}
                      view={views[`${meta.path}::${meta.index}`] ?? null}
                      onView={(iso) => setViews((v) => ({ ...v, [`${meta.path}::${meta.index}`]: iso }))}
                    />
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
      {form.open && (
        <RoutineForm
          editing={form.editing}
          templates={templates}
          onClose={() => setForm({ open: false, editing: null })}
          onSaved={() => {
            setForm({ open: false, editing: null });
            load();
          }}
        />
      )}
    </div>
  );
}
