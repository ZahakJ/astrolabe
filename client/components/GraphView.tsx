import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SiteMark from "./SiteMark.tsx";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useVaultGraph, vaultGraphFailed } from "../graphCache.ts";
import { countPhrase, localeNum, t, tf } from "../i18n.ts";
import { MetaSep } from "../metaSep.tsx";
import { promptNewNote } from "../prompts.ts";
import { useStore } from "../state.ts";
import { toast } from "../toast.ts";
import type { GraphNode } from "../../shared/types.ts";
import { readThemeColors } from "./graphColors.ts";
import "../styles/graph.css";
import { Toggle } from "./controls/Fields.tsx";
import { QUERY_GROUPS_MAX, ROOT_GROUP, UNMATCHED_GROUP, UNTAGGED_GROUP, accentScale, defaultGraphPrefs, groupColor, groupNodes, loadGraphPrefs, queryGroupColor, queryOrder, saveGraphPrefs, type ColorBy, type GraphPrefs, type QueryGroup, type QueryMatches, type TagGathering } from "../graphPrefs.ts";
import { queryPaths } from "../api.ts";
import { createSim, type Sim } from "../graph/sim.ts";
export type { SimOptions } from "../graph/sim.ts";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GraphView() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Sim | null>(null);
  const admin = useStore((s) => s.admin);
  useStore((s) => s.language); // re-render the chrome strings on language change
  const [stats, setStats] = useState<{ notes: number; links: number } | null>(
    null,
  );

  // Shared with the local graph and the visitor sidebar — one /api/graph for
  // the whole app (client/graphCache.ts), not one per consumer.
  const data = useVaultGraph();

  // ── The reader's own graph (graphPrefs.ts) ────────────────────────────────
  const [prefs, setPrefsState] = useState<GraphPrefs>(() => loadGraphPrefs());
  const setPrefs = useCallback((patch: Partial<GraphPrefs> | ((p: GraphPrefs) => GraphPrefs)) => {
    setPrefsState((p) => {
      const next = typeof patch === "function" ? patch(p) : { ...p, ...patch };
      saveGraphPrefs(next);
      return next;
    });
  }, []);
  const [query, setQuery] = useState("");
  // Whether the theme is a dark room decides which palette the groups take;
  // read from the theme's own color-scheme, re-read when data-theme changes.
  const [dark, setDark] = useState(() => isDarkTheme());
  useEffect(() => {
    const mo = new MutationObserver(() => setDark(isDarkTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  // ── Groups by query ───────────────────────────────────────────────────────
  // The server answers each query row with the paths it names
  // (GET /api/query/paths — every operator the search box knows, no cap).
  // Asked only while the query colouring is on, a third of a second after
  // the last keystroke, and every answer is kept by its query text so a row
  // retyped to something it said before repaints at once. An answer that
  // arrives for a query no row asks for any more is dropped, not applied.
  const [queryMatches, setQueryMatches] = useState<QueryMatches>(() => new Map());
  useEffect(() => {
    if (prefs.colorBy !== "query") return;
    const wanted = queryOrder(prefs.queryGroups);
    const missing = wanted.filter((q) => !queryMatches.has(q));
    if (missing.length === 0) return;
    const ctl = new AbortController();
    const timer = window.setTimeout(() => {
      for (const q of missing) {
        queryPaths(q, ctl.signal)
          .then((paths) => {
            if (ctl.signal.aborted) return;
            setQueryMatches((prev) => new Map(prev).set(q, new Set(paths)));
          })
          .catch(() => {
            // a query the server refused names nothing, and stays unasked
            // so the next edit asks again
          });
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      ctl.abort();
    };
  }, [prefs.colorBy, prefs.queryGroups, queryMatches]);

  const grouped = useMemo(
    () =>
      groupNodes(
        data?.nodes ?? [],
        prefs.colorBy,
        prefs.folderDepth,
        { pick: prefs.tagPick, gatherings: prefs.tagGroups },
        { groups: prefs.queryGroups, matches: queryMatches },
      ),
    [data, prefs.colorBy, prefs.folderDepth, prefs.tagPick, prefs.tagGroups, prefs.queryGroups, queryMatches],
  );
  const neutral = useMemo(() => readThemeColors().accent, [dark]);
  // Under the query colouring the first slot of the accent scale IS the
  // accent, so "everything else" cannot also be the accent or the first
  // group and the rest would be one colour. The unmatched notes recede into
  // the theme's faint ink instead — which is what "no query names this"
  // should look like beside the notes a query lit.
  const faint = useMemo(() => readThemeColors().faint, [dark]);
  /** Group name → colour, in legend order. A query group's colour is the
   *  row's own (or its slot on the theme's accent scale), never the
   *  folder palette: the swatch on the row and the disc on the canvas must
   *  be one colour. */
  const groupColors = useMemo(() => {
    const overrides = prefs.groupColors[prefs.colorBy];
    const map = new Map<string, string>();
    grouped.groups.forEach((g, i) =>
      map.set(
        g.name,
        prefs.colorBy === "query"
          ? g.name === UNMATCHED_GROUP
            ? (overrides[g.name] ?? faint)
            : queryGroupColor(prefs.queryGroups, g.name, neutral, dark)
          : groupColor(g.name, i, overrides, dark, neutral),
      ),
    );
    return map;
  }, [grouped, prefs.groupColors, prefs.colorBy, prefs.queryGroups, dark, neutral, faint]);
  const [shownCount, setShownCount] = useState<number | null>(null);

  /** The layout is seeded from scratch by `setData`, so a refresh would fling
   *  every node back to its seed position and restart the simulation under
   *  the reader's pointer. The graph view is a snapshot for as long as it is
   *  open, exactly as it was before it shared this cache: apply the first
   *  graph that arrives, then leave the sim alone. Closing and reopening the
   *  view picks up everything that changed meanwhile. */
  const appliedRef = useRef(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const sim = createSim(canvas, wrap);
    simRef.current = sim;
    appliedRef.current = false;

    return () => {
      simRef.current = null;
      sim.destroy();
    };
  }, []);

  useEffect(() => {
    if (!data || appliedRef.current) return;
    const sim = simRef.current;
    if (!sim) return;
    appliedRef.current = true;
    setStats({ notes: data.nodes.length, links: data.edges.length });
    sim.setData(data);
  }, [data]);

  // Colours, filters, forces and display travel to the canvas as one object,
  // on every change; the sim keeps the positions and redraws.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim || !data) return;
    const hiddenGroups = new Set(prefs.hiddenGroups[prefs.colorBy]);
    const fills = new Map<string, string>();
    const hidden = new Set<string>();
    for (const n of data.nodes) {
      const group = grouped.of.get(n.id);
      if (group !== undefined) {
        const color = groupColors.get(group);
        if (color) fills.set(n.id, color);
        if (hiddenGroups.has(group)) hidden.add(n.id);
      }
      if (prefs.hideOrphans && n.links === 0) hidden.add(n.id);
      if (n.links < prefs.minLinks) hidden.add(n.id);
    }
    sim.setOptions({
      fills,
      hidden,
      query,
      repulsion: prefs.forces.repulsion,
      linkDistance: prefs.forces.linkDistance,
      gravity: prefs.forces.gravity,
      nodeScale: prefs.display.nodeScale,
      edgeAlpha: prefs.display.edgeAlpha,
      labelZoom: prefs.display.labelZoom,
      glow: prefs.display.glow,
    });
    setShownCount(sim.visibleCount());
  }, [data, grouped, groupColors, prefs, query]);

  const toggleGroup = useCallback(
    (name: string) => {
      setPrefs((p) => {
        const list = p.hiddenGroups[p.colorBy];
        const next = list.includes(name) ? list.filter((g) => g !== name) : [...list, name];
        return { ...p, hiddenGroups: { ...p.hiddenGroups, [p.colorBy]: next } };
      });
    },
    [setPrefs],
  );
  const setGroupColor = useCallback(
    (name: string, hex: string) => {
      setPrefs((p) => {
        // A query group's colour lives on its row, so it survives the row
        // being retyped and moves with it; the legend's swatch and the row's
        // swatch write the same field.
        if (p.colorBy === "query" && name !== UNMATCHED_GROUP) {
          return { ...p, queryGroups: p.queryGroups.map((g) => (g.query.trim() === name ? { ...g, color: hex } : g)) };
        }
        return {
          ...p,
          groupColors: { ...p.groupColors, [p.colorBy]: { ...p.groupColors[p.colorBy], [name]: hex } },
        };
      });
    },
    [setPrefs],
  );
  const groupLabel = (name: string): string =>
    name === ROOT_GROUP ? t("graphGroupRoot") : name === UNTAGGED_GROUP ? t("graphGroupUntagged") : name === UNMATCHED_GROUP ? t("graphGroupUnmatched") : name;

  // The graph view is the one surface where a failed /api/graph leaves an
  // empty screen rather than a missing garnish, so it is the one that says so.
  const graphFailed = vaultGraphFailed();
  useEffect(() => {
    if (graphFailed && !appliedRef.current) toast(t("graphLoadFailed"));
  }, [graphFailed]);

  // ── The keyboard route (UX F20) ──────────────────────────────────────────
  //
  // A canvas is a picture to a keyboard, and the graph shipped as one: every
  // node in it was reachable only with a pointer. So the nodes get a real list
  // behind the bitmap — one tab stop, arrows to move, Enter to open.
  //
  // The list holds ONE node and its neighbours, not the whole vault, and that
  // is the design rather than a shortcut. A flat list of three thousand
  // buttons is three thousand DOM nodes to build and a shelf nobody can
  // navigate; a neighbourhood is what the graph is actually FOR, and walking
  // it is what the picture shows a sighted reader doing. Up/Down move along
  // the current shelf, the logical forward arrow steps INTO the neighbour
  // under the cursor and makes it the centre, the logical back arrow returns,
  // and Enter opens the note. The canvas lights whichever node the cursor is
  // on, so the two halves are visibly the same thing.
  const nodesById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const n of data?.nodes ?? []) map.set(n.id, n);
    return map;
  }, [data]);

  const neighborIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (a: string, b: string): void => {
      let set = map.get(a);
      if (!set) map.set(a, (set = new Set()));
      set.add(b);
    };
    for (const e of data?.edges ?? []) {
      if (e.source === e.target) continue;
      add(e.source, e.target);
      add(e.target, e.source);
    }
    return map;
  }, [data]);

  const [centre, setCentre] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const trailRef = useRef<string[]>([]);

  // Where the walk starts: the note the reader has open, else the busiest node
  // in the vault — the two places a reader would put their finger first.
  useEffect(() => {
    if (!data || data.nodes.length === 0) {
      setCentre(null);
      setCursor(null);
      return;
    }
    const open = useStore.getState().openPath;
    const start =
      open !== null && nodesById.has(open)
        ? open
        : data.nodes.reduce((best, n) => (n.links > best.links ? n : best), data.nodes[0]).id;
    trailRef.current = [];
    setCentre(start);
    setCursor(start);
  }, [data, nodesById]);

  const rows = useMemo(() => {
    const self = centre === null ? undefined : nodesById.get(centre);
    if (!self) return [] as GraphNode[];
    const near = [...(neighborIds.get(self.id) ?? [])]
      .map((id) => nodesById.get(id))
      .filter((n): n is GraphNode => n !== undefined)
      .sort((a, b) => b.links - a.links || a.title.localeCompare(b.title));
    return [self, ...near];
  }, [centre, neighborIds, nodesById]);

  // The canvas mirrors the list's cursor: a keyboard reader and a pointer
  // reader are looking at the same highlight — but only while the list HOLDS
  // the keyboard. The cursor rests on the open note from the moment the view
  // opens, and lighting it then dimmed the other thousand nodes to 15% for a
  // reader who had not pressed a key: the whole constellation opened grey,
  // which the owner met as "the colour of nodes is lame if you are not
  // highlighting them". A highlight is an answer to a question; nobody had
  // asked one yet.
  const [listFocused, setListFocused] = useState(false);
  useEffect(() => {
    simRef.current?.setFocus(listFocused ? cursor : null);
  }, [cursor, data, listFocused]);

  const focusRow = useCallback((id: string) => {
    setCursor(id);
    // The roving stop moves on the next render; move the browser's focus with
    // it, or the arrows walk a list the caret has left behind.
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)
        ?.focus();
    });
  }, []);

  const walkInto = useCallback(
    (id: string) => {
      if (centre !== null && id !== centre) trailRef.current.push(centre);
      setCentre(id);
      focusRow(id);
      const node = nodesById.get(id);
      if (node) setSaid(tf("graphWalkedTo", { name: node.title, count: localeNum(node.links) }));
    },
    [centre, focusRow, nodesById],
  );

  const onListKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (rows.length === 0) return;
      const rtl = document.documentElement.getAttribute("dir") === "rtl";
      const at = Math.max(0, rows.findIndex((n) => n.id === cursor));
      const forward = rtl ? "ArrowLeft" : "ArrowRight";
      const back = rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const to = (at + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length;
        e.preventDefault();
        focusRow(rows[to].id);
        return;
      }
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        focusRow(rows[e.key === "Home" ? 0 : rows.length - 1].id);
        return;
      }
      if (e.key === forward) {
        e.preventDefault();
        walkInto(rows[at].id);
        return;
      }
      if (e.key === back) {
        const from = trailRef.current.pop();
        if (from === undefined) return;
        e.preventDefault();
        setCentre(from);
        focusRow(from);
        const node = nodesById.get(from);
        if (node) setSaid(tf("graphWalkedTo", { name: node.title, count: localeNum(node.links) }));
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        useStore.getState().openNote(rows[at].id);
      }
    },
    [cursor, focusRow, nodesById, rows, walkInto],
  );

  return (
    <div className="s-graph" ref={wrapRef} role="region" aria-label={t("graphAria")}>
      {/* A bitmap is a picture to assistive tech no matter what it depicts, so
          it is named as one. The graph is a VIEW of the vault, never its only
          route: everything in it is reachable through the tree, the search and
          the backlinks panel, all of which are keyboard-complete — and now
          through the node list below, which is the graph's own shape. */}
      <canvas
        className="s-graph__canvas"
        ref={canvasRef}
        role="img"
        aria-label={
          stats
            ? `${t("graphAria")} — ${countPhrase(stats.notes, admin ? "notes" : "publishedNotes")}, ${countPhrase(stats.links, "links")}`
            : t("graphAria")
        }
      />
      {rows.length > 0 && (
        <div className="s-graph__nav">
          <p className="s-graph__nav-hint">{t("graphNavHint")}</p>
          <div
            className="s-graph__nav-list"
            ref={listRef}
            role="listbox"
            aria-label={t("graphNodesAria")}
            onKeyDown={onListKeyDown}
            onFocus={() => setListFocused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setListFocused(false);
            }}
          >
            {rows.map((n, i) => (
              <button
                key={n.id}
                type="button"
                role="option"
                data-node={n.id}
                aria-selected={n.id === cursor}
                tabIndex={n.id === cursor ? 0 : -1}
                className={
                  i === 0 ? "s-graph__nav-row s-graph__nav-row--centre" : "s-graph__nav-row"
                }
                onFocus={() => setCursor(n.id)}
                onClick={() => useStore.getState().openNote(n.id)}
                onDoubleClick={() => walkInto(n.id)}
              >
                <bdi className="s-graph__nav-name">{n.title}</bdi>
                <span className="s-graph__nav-count">{localeNum(n.links)}</span>
              </button>
            ))}
          </div>
          <p className="s-sr-only" role="status">
            {said}
          </p>
        </div>
      )}
      {stats?.notes === 0 &&
        (admin ? (
          // A DOOR, not a instruction (v1.8 UX audit F41). "Create one and
          // link it with wikilinks" was addressed to a reader standing in
          // front of a blank canvas with no way off it — the sidebar's + is on
          // the other side of the shell, and on a phone the sidebar is a
          // drawer that is closed. The star matches the visitor's empty state
          // above; only the door is new, and it is what the whole pane is for.
          <div className="s-graph__empty s-graph__empty--admin">
            <span className="s-graph__empty-star" aria-hidden="true"><SiteMark size={32} /></span>
            {t("graphEmptyAdmin")}
            <button
              type="button"
              className="s-btn s-btn--accent"
              onClick={() => void promptNewNote("")}
            >
              {t("newNote")}
            </button>
          </div>
        ) : (
          <div className="s-graph__empty s-graph__empty--visitor">
            <span className="s-graph__empty-star" aria-hidden="true"><SiteMark size={32} /></span>
            {t("graphEmptyVisitor")}
          </div>
        ))}
      {stats !== null && stats.notes > 0 && (
        <div className="s-graph__hud">
          {shownCount !== null && shownCount < stats.notes
            ? tf("graphShown", { shown: localeNum(shownCount), total: localeNum(stats.notes) })
            : countPhrase(stats.notes, admin ? "notes" : "publishedNotes")}
          <MetaSep className="s-graph__hudsep" />
          {countPhrase(stats.links, "links")}
        </div>
      )}
      {stats !== null && stats.notes > 0 && (
        <GraphPanel
          open={prefs.panelOpen}
          prefs={prefs}
          setPrefs={setPrefs}
          query={query}
          setQuery={setQuery}
          groups={grouped.groups}
          groupColors={groupColors}
          groupLabel={groupLabel}
          onToggleGroup={toggleGroup}
          onGroupColor={setGroupColor}
          accent={neutral}
          dark={dark}
        />
      )}
      <div className="s-graph__controls">
        {stats !== null && stats.notes > 0 && (
          <button
            type="button"
            className={`s-iconbtn${prefs.panelOpen ? " s-iconbtn--on" : ""}`}
            title={t("graphSettings")}
            aria-label={t("graphSettings")}
            aria-pressed={prefs.panelOpen}
            onClick={() => setPrefs({ panelOpen: !prefs.panelOpen })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8M4 12h14" />
              <circle cx="16" cy="7" r="2" />
              <circle cx="10" cy="17" r="2" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="s-iconbtn"
          title={t("zoomIn")}
          aria-label={t("zoomIn")}
          onClick={() => simRef.current?.zoomBy(1.35)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          className="s-iconbtn"
          title={t("zoomOut")}
          aria-label={t("zoomOut")}
          onClick={() => simRef.current?.zoomBy(1 / 1.35)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          className="s-iconbtn"
          title={t("resetView")}
          aria-label={t("resetView")}
          onClick={() => simRef.current?.resetView()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        </button>
      </div>
    </div>
  );
}


/** Whether the theme in force is a dark room, by its own declaration. */
function isDarkTheme(): boolean {
  return getComputedStyle(document.documentElement).getPropertyValue("color-scheme").trim() !== "light";
}

interface GraphPanelProps {
  open: boolean;
  prefs: GraphPrefs;
  setPrefs(patch: Partial<GraphPrefs> | ((p: GraphPrefs) => GraphPrefs)): void;
  query: string;
  setQuery(q: string): void;
  groups: { name: string; count: number }[];
  groupColors: Map<string, string>;
  groupLabel(name: string): string;
  onToggleGroup(name: string): void;
  onGroupColor(name: string, hex: string): void;
  /** The theme's accent and whether it is a dark room: what a query row's
   *  default swatch is drawn from (graphPrefs.ts accentScale). */
  accent: string;
  dark: boolean;
}

/**
 * The graph's settings: colouring, legend, filters, forces, display. A panel
 * over the canvas rather than a page of settings, because every control here
 * is read against the picture it changes, and the picture is what a reader
 * is adjusting. Everything in it is a per-browser preference (graphPrefs.ts)
 * except the search field, which is the session's.
 */
function GraphPanel({
  open,
  prefs,
  setPrefs,
  query,
  setQuery,
  groups,
  groupColors,
  groupLabel,
  onToggleGroup,
  onGroupColor,
  accent,
  dark,
}: GraphPanelProps) {
  // Escape closes the panel — and only the panel. Capture phase, so the
  // graph's own Escape (which drops the keyboard cursor) and the view's
  // (which leaves the graph) wait their turn: one press per layer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      // A field being typed into keeps Escape for itself (clearing a search).
      if (target && target.tagName === "INPUT" && (target as HTMLInputElement).value) return;
      e.preventDefault();
      e.stopPropagation();
      setPrefs({ panelOpen: false });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, setPrefs]);
  // A DRAGGABLE panel: grab the head, put it anywhere over the graph, and it
  // stays there for this browser (`astrolabe.graphPanelPos`, clamped into the
  // graph's box on every mount so a smaller window never hides it).
  const panelRef = useRef<HTMLElement | null>(null);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(() => {
    try {
      const raw = localStorage.getItem("astrolabe.graphPanelPos");
      const v = raw ? (JSON.parse(raw) as { left?: unknown; top?: unknown }) : null;
      return v && typeof v.left === "number" && typeof v.top === "number" ? { left: v.left, top: v.top } : null;
    } catch {
      return null;
    }
  });
  const [panelDrag, setPanelDrag] = useState(false);
  // The size the owner dragged the corner to, if any: inline width/height the
  // browser's `resize: both` wrote, read back on pointerup and kept per browser.
  const [panelSize, setPanelSize] = useState<{ width: number; height: number } | null>(() => {
    try {
      const raw = localStorage.getItem("astrolabe.graphPanelSize");
      const v = raw ? (JSON.parse(raw) as { width?: unknown; height?: unknown }) : null;
      return v && typeof v.width === "number" && typeof v.height === "number" ? { width: v.width, height: v.height } : null;
    } catch {
      return null;
    }
  });
  const onPanelResized = (): void => {
    const el = panelRef.current;
    if (!el) return;
    const width = parseFloat(el.style.width);
    const height = parseFloat(el.style.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    if (panelSize && panelSize.width === width && panelSize.height === height) return;
    const next = { width, height };
    setPanelSize(next);
    try {
      localStorage.setItem("astrolabe.graphPanelSize", JSON.stringify(next));
    } catch {
      // the size lasts the session
    }
  };
  useEffect(() => {
    if (!open || !panelPos) return;
    const el = panelRef.current;
    const box = el?.parentElement?.getBoundingClientRect();
    if (!el || !box) return;
    const left = Math.max(0, Math.min(panelPos.left, box.width - el.offsetWidth));
    const top = Math.max(0, Math.min(panelPos.top, box.height - 48));
    if (left !== panelPos.left || top !== panelPos.top) setPanelPos({ left, top });
  }, [open, panelPos]);
  const onPanelGrab = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return; // Reset and ✕ are buttons, not handles
    const el = panelRef.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    e.preventDefault();
    const head = e.currentTarget;
    head.setPointerCapture(e.pointerId);
    const hostBox = host.getBoundingClientRect();
    const elBox = el.getBoundingClientRect();
    const dx = e.clientX - elBox.left;
    const dy = e.clientY - elBox.top;
    setPanelDrag(true);
    let last = { left: elBox.left - hostBox.left, top: elBox.top - hostBox.top };
    const move = (ev: PointerEvent): void => {
      last = {
        left: Math.max(0, Math.min(ev.clientX - hostBox.left - dx, hostBox.width - elBox.width)),
        top: Math.max(0, Math.min(ev.clientY - hostBox.top - dy, hostBox.height - 48)),
      };
      setPanelPos(last);
    };
    const up = (): void => {
      head.removeEventListener("pointermove", move);
      head.removeEventListener("pointerup", up);
      head.removeEventListener("pointercancel", up);
      setPanelDrag(false);
      try {
        localStorage.setItem("astrolabe.graphPanelPos", JSON.stringify(last));
      } catch {
        // the position lasts the session
      }
    };
    head.addEventListener("pointermove", move);
    head.addEventListener("pointerup", up);
    head.addEventListener("pointercancel", up);
  };
  if (!open) return null;
  const hidden = new Set(prefs.hiddenGroups[prefs.colorBy]);
  const setGathering = (i: number, patch: Partial<TagGathering>) =>
    setPrefs((p) => ({ ...p, tagGroups: p.tagGroups.map((g, n) => (n === i ? { ...g, ...patch } : g)) }));
  const setQueryGroup = (i: number, patch: Partial<QueryGroup>) =>
    setPrefs((p) => ({ ...p, queryGroups: p.queryGroups.map((g, n) => (n === i ? { ...g, ...patch } : g)) }));
  const colorChoice = (value: ColorBy, label: string) => (
    <button
      type="button"
      className={`s-graph__seg${prefs.colorBy === value ? " s-graph__seg--on" : ""}`}
      aria-pressed={prefs.colorBy === value}
      onClick={() => setPrefs({ colorBy: value })}
    >
      {label}
    </button>
  );
  const slider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void,
    format: (v: number) => string = (v) => localeNum(Math.round(v)),
  ) => (
    <label className="s-graph__slider">
      <span className="s-graph__slider-head">
        <span>{label}</span>
        <span className="s-graph__slider-value">{format(value)}</span>
      </span>
      <input
        className="s-dsgr-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
  const pct = (v: number) => `${localeNum(Math.round(v * 100))}%`;
  return (
    <aside
      ref={panelRef}
      className={`s-graph__panel${panelPos ? " s-graph__panel--moved" : ""}${panelDrag ? " s-graph__panel--dragging" : ""}`}
      style={{ ...(panelPos ? { left: panelPos.left, top: panelPos.top } : {}), ...(panelSize ? panelSize : {}) }}
      onPointerUp={onPanelResized}
      aria-label={t("graphSettings")}
    >
      <div className="s-graph__panel-head" onPointerDown={onPanelGrab}>
        <h2>{t("graphSettings")}</h2>
        <button
          type="button"
          className="s-graph__panel-reset"
          onClick={() => {
            const d = defaultGraphPrefs();
            setPrefs({ ...d, panelOpen: true });
            setQuery("");
            // Reset is the whole panel, its corner included.
            setPanelSize(null);
            const el = panelRef.current;
            if (el) {
              el.style.removeProperty("width");
              el.style.removeProperty("height");
            }
            try {
              localStorage.removeItem("astrolabe.graphPanelSize");
            } catch {
              // nothing to forget
            }
          }}
        >
          {t("graphReset")}
        </button>
        {/* The way out, on the panel itself. The toolbar button that opened
            it is a toggle too, but a panel with no close of its own reads as
            a page, and the owner's first question was how to leave it. */}
        <button
          type="button"
          className="s-graph__panel-close"
          title={t("graphClose")}
          aria-label={t("graphClose")}
          onClick={() => setPrefs({ panelOpen: false })}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
            <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <input
        className="s-graph__search"
        type="search"
        value={query}
        dir="auto"
        placeholder={t("graphSearch")}
        aria-label={t("graphSearch")}
        onChange={(e) => setQuery(e.target.value)}
      />

      <section className="s-graph__section">
        <h3>{t("graphColorBy")}</h3>
        <div className="s-graph__segs" role="group" aria-label={t("graphColorBy")}>
          {colorChoice("folder", t("graphColorFolder"))}
          {colorChoice("tag", t("graphColorTag"))}
          {colorChoice("query", t("graphColorQuery"))}
          {colorChoice("none", t("graphColorNone"))}
        </div>
        {prefs.colorBy === "folder" && (
          <div className="s-graph__segs s-graph__segs--sub" role="group" aria-label={t("graphFolderDepth")}>
            <button
              type="button"
              className={`s-graph__seg${prefs.folderDepth === 1 ? " s-graph__seg--on" : ""}`}
              aria-pressed={prefs.folderDepth === 1}
              onClick={() => setPrefs({ folderDepth: 1 })}
            >
              {t("graphDepthTop")}
            </button>
            <button
              type="button"
              className={`s-graph__seg${prefs.folderDepth === 2 ? " s-graph__seg--on" : ""}`}
              aria-pressed={prefs.folderDepth === 2}
              onClick={() => setPrefs({ folderDepth: 2 })}
            >
              {t("graphDepthSecond")}
            </button>
          </div>
        )}
        {prefs.colorBy === "tag" && (
          <>
            <div className="s-graph__segs s-graph__segs--sub" role="group" aria-label={t("graphTagPick")}>
              <button
                type="button"
                className={`s-graph__seg${prefs.tagPick === "common" ? " s-graph__seg--on" : ""}`}
                aria-pressed={prefs.tagPick === "common"}
                title={t("graphTagPick")}
                onClick={() => setPrefs({ tagPick: "common" })}
              >
                {t("graphTagCommon")}
              </button>
              <button
                type="button"
                className={`s-graph__seg${prefs.tagPick === "first" ? " s-graph__seg--on" : ""}`}
                aria-pressed={prefs.tagPick === "first"}
                title={t("graphTagPick")}
                onClick={() => setPrefs({ tagPick: "first" })}
              >
                {t("graphTagFirst")}
              </button>
            </div>
            {/* Gatherings: several tags under one name and one colour. The
                tags field is free text (commas or spaces) parsed when the
                graph is coloured, never while it is typed. */}
            <div className="s-graph__gather">
              <div className="s-graph__gather-head">
                <span>{t("graphGather")}</span>
                <button
                  type="button"
                  className="s-graph__gather-add"
                  onClick={() => setPrefs((p) => ({ ...p, tagGroups: [...p.tagGroups, { name: "", tags: "" }] }))}
                >
                  {t("graphGatherAdd")}
                </button>
              </div>
              {prefs.tagGroups.length === 0 && <p className="s-graph__hint">{t("graphGatherHint")}</p>}
              {prefs.tagGroups.map((g, i) => (
                <div className="s-graph__gather-row" key={i}>
                  <input
                    className="s-graph__gather-name"
                    value={g.name}
                    dir="auto"
                    placeholder={t("graphGatherName")}
                    aria-label={t("graphGatherName")}
                    spellCheck={false}
                    onChange={(e) => setGathering(i, { name: e.target.value })}
                  />
                  <input
                    className="s-graph__gather-tags"
                    value={g.tags}
                    dir="auto"
                    placeholder={t("graphGatherTags")}
                    aria-label={t("graphGatherTags")}
                    spellCheck={false}
                    onChange={(e) => setGathering(i, { tags: e.target.value })}
                  />
                  <button
                    type="button"
                    className="s-graph__gather-del"
                    title={t("graphGatherRemove")}
                    aria-label={t("graphGatherRemove")}
                    onClick={() => setPrefs((p) => ({ ...p, tagGroups: p.tagGroups.filter((_, n) => n !== i) }))}
                  >
                    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        {prefs.colorBy === "query" && (
          /* Groups by query: up to six search-box queries, each a colour.
             The swatch on the row is the same field the legend's swatch
             edits; the query is free text, asked of the server a beat after
             the last keystroke, never parsed here. */
          <div className="s-graph__gather s-graph__queries">
            <div className="s-graph__gather-head">
              <span>{t("graphGroupByQuery")}</span>
              {prefs.queryGroups.length < QUERY_GROUPS_MAX && (
                <button
                  type="button"
                  className="s-graph__gather-add"
                  onClick={() => setPrefs((p) => ({ ...p, queryGroups: [...p.queryGroups, { query: "", color: null }].slice(0, QUERY_GROUPS_MAX) }))}
                >
                  {t("graphQueryAdd")}
                </button>
              )}
            </div>
            <p className="s-graph__hint">{t("graphQueryHint")}</p>
            {prefs.queryGroups.map((g, i) => {
              const name = g.query.trim();
              // A blank row has no group yet; it still shows the colour it
              // will paint with, its slot on the scale.
              const color = g.color ?? (name === "" ? accentScale(accent, QUERY_GROUPS_MAX, dark)[i % QUERY_GROUPS_MAX] : queryGroupColor(prefs.queryGroups, name, accent, dark));
              return (
                <div className="s-graph__gather-row s-graph__query-row" key={i}>
                  <input
                    type="color"
                    className="s-graph__swatch"
                    value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#888888"}
                    aria-label={tf("graphQueryColor", { query: name || localeNum(i + 1) })}
                    onChange={(e) => setQueryGroup(i, { color: e.target.value })}
                  />
                  <input
                    className="s-graph__gather-tags"
                    value={g.query}
                    dir="auto"
                    placeholder={t("graphQueryPlaceholder")}
                    aria-label={t("graphQueryField")}
                    spellCheck={false}
                    onChange={(e) => setQueryGroup(i, { query: e.target.value })}
                  />
                  <button
                    type="button"
                    className="s-graph__gather-del"
                    title={t("graphQueryRemove")}
                    aria-label={t("graphQueryRemove")}
                    onClick={() => setPrefs((p) => ({ ...p, queryGroups: p.queryGroups.filter((_, n) => n !== i) }))}
                  >
                    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              );
            })}
            {prefs.queryGroups.length > 0 && groups.every((g) => g.name === UNMATCHED_GROUP || g.count === 0) && (
              <p className="s-graph__hint">{t("graphQueryNone")}</p>
            )}
          </div>
        )}
        {groups.length > 0 && (
          <ul className="s-graph__legend">
            {groups.map((g) => {
              const off = hidden.has(g.name);
              const color = groupColors.get(g.name) ?? "#888888";
              return (
                <li key={g.name} className={`s-graph__group${off ? " s-graph__group--off" : ""}`}>
                  <input
                    type="color"
                    className="s-graph__swatch"
                    value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#888888"}
                    aria-label={tf("graphPickColor", { name: groupLabel(g.name) })}
                    onChange={(e) => onGroupColor(g.name, e.target.value)}
                  />
                  <button
                    type="button"
                    className="s-graph__group-name"
                    aria-pressed={!off}
                    title={off ? t("graphShowGroup") : t("graphHideGroup")}
                    onClick={() => onToggleGroup(g.name)}
                  >
                    <bdi>{groupLabel(g.name)}</bdi>
                    <span className="s-graph__group-count">{localeNum(g.count)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="s-graph__section">
        <h3>{t("graphFilters")}</h3>
        <div className="s-graph__row">
          <span>{t("graphHideOrphans")}</span>
          <Toggle
            value={prefs.hideOrphans}
            onChange={(v) => setPrefs({ hideOrphans: v })}
            label={t("graphHideOrphans")}
            onLabel={t("on")}
            offLabel={t("off")}
          />
        </div>
        {slider(t("graphMinLinks"), prefs.minLinks, 0, 12, 1, (v) => setPrefs({ minLinks: v }))}
      </section>

      <section className="s-graph__section">
        <h3>{t("graphForces")}</h3>
        {slider(t("graphRepulsion"), prefs.forces.repulsion, 0.4, 2.5, 0.05, (v) => setPrefs({ forces: { ...prefs.forces, repulsion: v } }), pct)}
        {slider(t("graphLinkDistance"), prefs.forces.linkDistance, 80, 480, 5, (v) => setPrefs({ forces: { ...prefs.forces, linkDistance: v } }))}
        {slider(t("graphGravity"), prefs.forces.gravity, 0, 3, 0.05, (v) => setPrefs({ forces: { ...prefs.forces, gravity: v } }), pct)}
      </section>

      <section className="s-graph__section">
        <h3>{t("graphDisplay")}</h3>
        {slider(t("graphNodeSize"), prefs.display.nodeScale, 0.6, 2, 0.05, (v) => setPrefs({ display: { ...prefs.display, nodeScale: v } }), pct)}
        {slider(t("graphEdgeAlpha"), prefs.display.edgeAlpha, 0.1, 1, 0.05, (v) => setPrefs({ display: { ...prefs.display, edgeAlpha: v } }), pct)}
        {slider(t("graphLabelZoom"), prefs.display.labelZoom, 0.3, 1.6, 0.05, (v) => setPrefs({ display: { ...prefs.display, labelZoom: v } }), pct)}
        <div className="s-graph__row">
          <span>{t("graphGlow")}</span>
          <Toggle
            value={prefs.display.glow}
            onChange={(v) => setPrefs({ display: { ...prefs.display, glow: v } })}
            label={t("graphGlow")}
            onLabel={t("on")}
            offLabel={t("off")}
          />
        </div>
      </section>
    </aside>
  );
}
