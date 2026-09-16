// The graph view's own preferences: how the constellation is coloured, what
// is hidden, how hard the forces pull, how much the canvas says.
//
// PER BROWSER, NEVER PER VAULT. A colouring is how one reader likes to look
// at their vault, not a fact about the vault, and it is never sent to the
// server and never appears in a Save diff — the same rule the theme and the
// sidebar side follow. Stored under one key as one object, so a corrupt or
// stale entry is thrown away whole and the graph opens with its defaults
// rather than with half of somebody's old settings.
//
// The pure half (grouping, palette) lives here rather than in the view so it
// can be tested under `node --test` with no canvas anywhere.

import type { GraphNode } from "../shared/types.ts";

export type ColorBy = "none" | "folder" | "tag" | "query";

export interface GraphForces {
  /** Pairwise push, as a multiple of the shipped constant (0.4 … 2.5). */
  repulsion: number;
  /** Preferred edge length in world px (80 … 480). */
  linkDistance: number;
  /** Pull toward the centre, as a multiple of the shipped constant (0 … 3). */
  gravity: number;
}

export interface GraphDisplay {
  /** Disc radius multiplier (0.6 … 2). */
  nodeScale: number;
  /** Idle edge opacity (0.1 … 1). */
  edgeAlpha: number;
  /** The zoom from which labels appear (0.3 … 1.6). Lower shows them sooner. */
  labelZoom: number;
  /** A soft halo behind every node, in its own colour. */
  glow: boolean;
}

export interface GraphPrefs {
  colorBy: ColorBy;
  /** Folder depth the grouping reads: 1 is the top-level folder, 2 its child. */
  folderDepth: 1 | 2;
  /** Overrides by group name, kept per colouring so switching between folder
   *  and tag does not lose either set. */
  groupColors: Record<ColorBy, Record<string, string>>;
  /** Groups switched off in the legend, per colouring. */
  hiddenGroups: Record<ColorBy, string[]>;
  hideOrphans: boolean;
  /** Nodes with fewer links than this are hidden (0 shows everything). */
  minLinks: number;
  forces: GraphForces;
  display: GraphDisplay;
  /** Whether the settings panel was open last time. */
  panelOpen: boolean;
  /** Under the tag colouring, which of a note's tags names its group: the
   *  one most notes share (a tag that spans the vault makes a big group) or
   *  the one written FIRST in the note (the author's own "this is mostly
   *  about"). */
  tagPick: TagPick;
  /** Tags gathered under one name, so "distributed", "raft" and "paxos" can
   *  be one colour called "systems". `tags` is the reader's own text, split
   *  on commas and spaces when the graph is coloured, so typing into the
   *  field never fights a parser. */
  tagGroups: TagGathering[];
  /** Under the query colouring, the search-box queries whose notes share a
   *  colour: `tag:physics before:2026` is a group the way a folder is. Up
   *  to QUERY_GROUPS_MAX rows; `color` null means the slot's place on the
   *  theme's accent scale (accentScale). The server answers each query
   *  (GET /api/query/paths) and the first query that names a note wins it. */
  queryGroups: QueryGroup[];
}

export type TagPick = "common" | "first";

export interface QueryGroup {
  query: string;
  color: string | null;
}

export const QUERY_GROUPS_MAX = 6;

export interface TagGathering {
  name: string;
  tags: string;
}

export const GRAPH_PREFS_KEY = "astrolabe.graph";

export const DEFAULT_FORCES: GraphForces = { repulsion: 1, linkDistance: 235, gravity: 1 };
export const DEFAULT_DISPLAY: GraphDisplay = { nodeScale: 1, edgeAlpha: 0.6, labelZoom: 0.7, glow: true };

export function defaultGraphPrefs(): GraphPrefs {
  return {
    colorBy: "folder",
    folderDepth: 1,
    groupColors: { none: {}, folder: {}, tag: {}, query: {} },
    hiddenGroups: { none: [], folder: [], tag: [], query: [] },
    hideOrphans: false,
    minLinks: 0,
    forces: { ...DEFAULT_FORCES },
    display: { ...DEFAULT_DISPLAY },
    panelOpen: false,
    tagPick: "common",
    tagGroups: [],
    queryGroups: [],
  };
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
};

const HEX = /^#[0-9a-f]{6}$/i;

/** A stored object, or anything at all, back into a valid preferences
 *  object. Every field is clamped or replaced on its own, so one bad value
 *  costs one default and not the reader's whole setup. */
export function normalizeGraphPrefs(raw: unknown): GraphPrefs {
  const d = defaultGraphPrefs();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const colorBy: ColorBy = r.colorBy === "none" || r.colorBy === "tag" || r.colorBy === "folder" || r.colorBy === "query" ? r.colorBy : d.colorBy;
  const colors = (value: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (value && typeof value === "object") {
      for (const [name, hex] of Object.entries(value as Record<string, unknown>)) {
        if (typeof hex === "string" && HEX.test(hex) && name.length <= 200) out[name] = hex.toLowerCase();
      }
    }
    return out;
  };
  const names = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length <= 200).slice(0, 500) : [];
  const gc = (r.groupColors && typeof r.groupColors === "object" ? r.groupColors : {}) as Record<string, unknown>;
  const hg = (r.hiddenGroups && typeof r.hiddenGroups === "object" ? r.hiddenGroups : {}) as Record<string, unknown>;
  const forces = (r.forces && typeof r.forces === "object" ? r.forces : {}) as Record<string, unknown>;
  const display = (r.display && typeof r.display === "object" ? r.display : {}) as Record<string, unknown>;
  return {
    colorBy,
    folderDepth: r.folderDepth === 2 ? 2 : 1,
    groupColors: { none: colors(gc.none), folder: colors(gc.folder), tag: colors(gc.tag), query: colors(gc.query) },
    hiddenGroups: { none: names(hg.none), folder: names(hg.folder), tag: names(hg.tag), query: names(hg.query) },
    hideOrphans: r.hideOrphans === true,
    minLinks: Math.round(clamp(r.minLinks, 0, 50, 0)),
    forces: {
      repulsion: clamp(forces.repulsion, 0.4, 2.5, DEFAULT_FORCES.repulsion),
      linkDistance: clamp(forces.linkDistance, 80, 480, DEFAULT_FORCES.linkDistance),
      gravity: clamp(forces.gravity, 0, 3, DEFAULT_FORCES.gravity),
    },
    display: {
      nodeScale: clamp(display.nodeScale, 0.6, 2, DEFAULT_DISPLAY.nodeScale),
      edgeAlpha: clamp(display.edgeAlpha, 0.1, 1, DEFAULT_DISPLAY.edgeAlpha),
      labelZoom: clamp(display.labelZoom, 0.3, 1.6, DEFAULT_DISPLAY.labelZoom),
      glow: display.glow !== false,
    },
    panelOpen: r.panelOpen === true,
    tagPick: r.tagPick === "first" ? "first" : "common",
    tagGroups: Array.isArray(r.tagGroups)
      ? r.tagGroups
          .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
          .map((g) => ({
            name: typeof g.name === "string" ? g.name.slice(0, 80) : "",
            tags: typeof g.tags === "string" ? g.tags.slice(0, 2000) : "",
          }))
          .slice(0, 60)
      : [],
    queryGroups: Array.isArray(r.queryGroups)
      ? r.queryGroups
          .filter((g): g is Record<string, unknown> => !!g && typeof g === "object")
          .map((g) => ({
            query: typeof g.query === "string" ? g.query.slice(0, 500) : "",
            color: typeof g.color === "string" && HEX.test(g.color) ? g.color.toLowerCase() : null,
          }))
          .slice(0, QUERY_GROUPS_MAX)
      : [],
  };
}

export function loadGraphPrefs(): GraphPrefs {
  try {
    const raw = localStorage.getItem(GRAPH_PREFS_KEY);
    return normalizeGraphPrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return defaultGraphPrefs();
  }
}

export function saveGraphPrefs(prefs: GraphPrefs): void {
  try {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage full or unavailable — the colouring lasts the session
  }
}

// ── Grouping ────────────────────────────────────────────────────────────────

/** The name every note outside a folder groups under. A sentinel the tree
 *  cannot produce (a folder cannot be named with a slash), shown through
 *  t("graphGroupRoot") rather than as itself. */
export const ROOT_GROUP = "/";
/** The group for a note with no tag under `colorBy: "tag"`. */
export const UNTAGGED_GROUP = "#";
/** The group for a note no query names under `colorBy: "query"`. A query
 *  cannot be a lone `?`: the parser reads it as a word, and a word finds
 *  notes, so the sentinel never collides with a real group's name. */
export const UNMATCHED_GROUP = "?";

/** The folder a path sits in, cut to `depth` segments: `a/b/c/note.md` is
 *  `a` at depth 1 and `a/b` at depth 2. A note at the root is ROOT_GROUP. */
export function folderOf(id: string, depth: 1 | 2): string {
  const parts = id.split("/");
  parts.pop();
  if (parts.length === 0) return ROOT_GROUP;
  return parts.slice(0, depth).join("/");
}

export interface GraphGroup {
  name: string;
  count: number;
}

/** Every group the colouring produces, largest first with the catch-all
 *  bucket last, and the group of every node. Under `tag`, a note with several
 *  tags belongs to its most common one across the vault: the colouring should
 *  show the vault's big themes, and a note tagged `#physics #draft` is a
 *  physics note before it is a draft. A tie goes to the tag the author wrote
 *  first, which is the one they thought of first. */
/** A tag as the gathering fields compare it: no `#`, no case, no edges. */
const tagKey = (tag: string): string => tag.trim().replace(/^#/, "").toLowerCase();

/** Tag → the gathering's name, for every tag the reader wrote into one. A
 *  gathering with no name gathers nothing; a tag written into two gatherings
 *  belongs to the first. */
export function tagGatherings(groups: readonly TagGathering[]): Map<string, string> {
  const of = new Map<string, string>();
  for (const g of groups) {
    const name = g.name.trim();
    if (!name) continue;
    for (const raw of g.tags.split(/[,\s]+/)) {
      const key = tagKey(raw);
      if (key && !of.has(key)) of.set(key, name);
    }
  }
  return of;
}

export interface TagGrouping {
  pick: TagPick;
  gatherings: readonly TagGathering[];
}

/** What the server answered for each query, keyed by the query's text as
 *  the reader typed it. A query with no entry has not been answered yet and
 *  names nothing until it is. */
export type QueryMatches = ReadonlyMap<string, ReadonlySet<string>>;

export interface QueryGrouping {
  groups: readonly QueryGroup[];
  matches: QueryMatches;
}

/** The rows' queries in the reader's order, trimmed, blanks and repeats
 *  gone — the order is a precedence (the first query that names a note
 *  wins it), so it is the one thing this must not reshuffle. */
export function queryOrder(groups: readonly QueryGroup[]): string[] {
  const out: string[] = [];
  for (const g of groups) {
    const q = g.query.trim();
    if (q !== "" && !out.includes(q)) out.push(q);
  }
  return out;
}

export function groupNodes(
  nodes: readonly GraphNode[],
  colorBy: ColorBy,
  folderDepth: 1 | 2,
  tagging: TagGrouping = { pick: "common", gatherings: [] },
  querying: QueryGrouping = { groups: [], matches: new Map() },
): { groups: GraphGroup[]; of: Map<string, string> } {
  const of = new Map<string, string>();
  const counts = new Map<string, number>();
  if (colorBy === "none") return { groups: [], of };
  if (colorBy === "query") {
    // The legend keeps the rows' order rather than sorting by size, so it
    // reads as the rows do and the precedence stays visible. A query that
    // names nothing is still a group, with a zero: the reader typed it and
    // should see that it found nothing, not that it vanished.
    const ordered = queryOrder(querying.groups);
    for (const q of ordered) counts.set(q, 0);
    for (const n of nodes) {
      const group = ordered.find((q) => querying.matches.get(q)?.has(n.id)) ?? UNMATCHED_GROUP;
      of.set(n.id, group);
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    const groups = [...counts.entries()].map(([name, count]) => ({ name, count }));
    return { groups, of };
  }
  if (colorBy === "tag") {
    const gathered = tagGatherings(tagging.gatherings);
    // A note's tags with every gathered one replaced by its gathering, in
    // the note's own order, no repeats — so a note tagged "raft, paxos" under
    // a "systems" gathering has ONE tag, "systems".
    const tagsOf = (n: GraphNode): string[] => {
      const out: string[] = [];
      for (const tag of n.tags) {
        const name = gathered.get(tagKey(tag)) ?? tag;
        if (!out.includes(name)) out.push(name);
      }
      return out;
    };
    const tagCounts = new Map<string, number>();
    for (const n of nodes) for (const tag of tagsOf(n)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    for (const n of nodes) {
      let best: string | null = null;
      for (const tag of tagsOf(n)) {
        if (best === null) best = tag;
        else if (tagging.pick === "common" && (tagCounts.get(tag) ?? 0) > (tagCounts.get(best) ?? 0)) best = tag;
      }
      const group = best ?? UNTAGGED_GROUP;
      of.set(n.id, group);
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
  } else {
    for (const n of nodes) {
      const group = folderOf(n.id, folderDepth);
      of.set(n.id, group);
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
  }
  const rest = (name: string): number => (name === ROOT_GROUP || name === UNTAGGED_GROUP ? 1 : 0);
  const groups = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => rest(a.name) - rest(b.name) || b.count - a.count || a.name.localeCompare(b.name));
  return { groups, of };
}

// ── Palette ─────────────────────────────────────────────────────────────────

/** Twelve hues that stay apart from each other on a dark ground, in an order
 *  that puts the most different ones first: the biggest groups get the most
 *  distinguishable colours. Tuned by eye against the dark themes. */
const DARK_PALETTE = [
  "#e0b34a", // gold
  "#5fb8e6", // sky
  "#e07a6a", // coral
  "#7fcf9a", // mint
  "#c193e8", // lilac
  "#f2a65a", // apricot
  "#6fd6cf", // teal
  "#e88ab8", // rose
  "#a9c95c", // lime
  "#8fa1ee", // periwinkle
  "#d9a98a", // sand
  "#9fd0f5", // ice
];

/** The same twelve, deepened for a light ground. */
const LIGHT_PALETTE = [
  "#a8781b",
  "#1f6f9e",
  "#b6473a",
  "#2f8a55",
  "#7a4fb0",
  "#c26a1e",
  "#1f8a83",
  "#b8437e",
  "#6b8a1f",
  "#4b5cc4",
  "#9a6a48",
  "#3b7fa8",
];

export function graphPalette(dark: boolean): readonly string[] {
  return dark ? DARK_PALETTE : LIGHT_PALETTE;
}

/** Deterministic colour for a group beyond the palette's twelve: a hue
 *  hashed from the name, so the thirteenth folder is not the first's colour
 *  and keeps its own across reloads. */
function hashedColor(name: string, dark: boolean): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hue = (h >>> 0) % 360;
  return hslHex(hue, dark ? 0.55 : 0.6, dark ? 0.66 : 0.4);
}

function hslHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** The colour a group wears: the reader's override when they set one, else
 *  its place in the palette, else a hue of its own. The root and the
 *  untagged bucket take no palette slot: they are "everything else" and read
 *  as such in a neutral. */
export function groupColor(
  name: string,
  index: number,
  overrides: Record<string, string>,
  dark: boolean,
  neutral: string,
): string {
  const set = overrides[name];
  if (set) return set;
  if (name === ROOT_GROUP || name === UNTAGGED_GROUP || name === UNMATCHED_GROUP) return neutral;
  const palette = graphPalette(dark);
  return index < palette.length ? palette[index] : hashedColor(name, dark);
}

// ── The accent scale ─────────────────────────────────────────────────────────

/** `#rrggbb` → [h 0…360, s 0…1, l 0…1]; null for anything else. */
function hexHsl(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return null;
  const r = parseInt(m[1], 16) / 255;
  const g = parseInt(m[2], 16) / 255;
  const b = parseInt(m[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

/** `count` colours that belong to the theme: the accent itself first, then
 *  the same saturation and lightness walked around the hue wheel in equal
 *  steps, so a query group is painted in the theme's own key rather than
 *  from the twelve-colour palette the folders use. A grey accent (a
 *  monochrome theme) has no hue to walk, so it takes a modest saturation
 *  and walks that; an accent that is not a hex colour falls back to the
 *  palette. Only a swatch the reader has not set reads from here. */
export function accentScale(accent: string, count: number, dark: boolean): string[] {
  const hsl = hexHsl(accent);
  if (hsl === null) return graphPalette(dark).slice(0, count);
  const [h, s0, l0] = hsl;
  const s = s0 < 0.15 ? (dark ? 0.45 : 0.5) : s0;
  const l = Math.min(0.72, Math.max(0.3, l0));
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(hslHex((h + (360 * i) / count) % 360, s, l));
  return out;
}

/** The colour a query row wears: its own when set, else its slot on the
 *  accent scale, so six rows are six hues of the theme. */
export function queryGroupColor(groups: readonly QueryGroup[], query: string, accent: string, dark: boolean): string {
  const scale = accentScale(accent, QUERY_GROUPS_MAX, dark);
  const ordered = queryOrder(groups);
  const row = groups.find((g) => g.query.trim() === query);
  if (row?.color) return row.color;
  const slot = ordered.indexOf(query);
  return scale[slot < 0 ? 0 : slot % scale.length];
}
