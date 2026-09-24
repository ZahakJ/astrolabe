// The vault graph's engine: the force simulation, the canvas painter, the
// camera and the hit tests, all in one closure (`createSim`). GraphView is
// the React half that mounts it and wires the HUD. Moved out of
// client/components/GraphView.tsx unchanged.

import { DEFAULT_DISPLAY, DEFAULT_FORCES } from "../graphPrefs.ts";
import type { GraphData, GraphNode } from "../../shared/types.ts";
import { autoDir, t } from "../i18n.ts";
import { mixColors, readThemeColors } from "../components/graphColors.ts";
import { prefersReducedMotion } from "../a11y.ts";
import { useStore } from "../state.ts";

// ---------------------------------------------------------------------------
// Simulation tuning. Forces are scaled by a cooling factor ("alpha") so the
// layout settles instead of jittering forever; interaction reheats it.
// ---------------------------------------------------------------------------
// THE MOTION IS CALM ON PURPOSE. The owner's word for the first cut was "too
// quick": nodes shot to their places and the web twitched under the hand.
// Three numbers below carry that: a lower speed cap, more damping, and a
// gentler reheat, so a drag pulls the neighbourhood along like weight on a
// string and the entrance is an unfolding rather than a snap. The reader's
// own sliders (graphPrefs.ts) scale the three forces from these bases.
const REPULSION = 20000; // pairwise inverse-square push
const REPULSE_RADIUS = 560; // cutoff beyond which a pair stops pushing
const SPRING_K = 0.045; // pull along edges
const SPRING_REST = 235; // preferred edge length (the base the slider scales)
const GRAVITY = 0.003; // gentle pull toward the origin
const FRICTION = 0.86; // velocity damping per step
/** Per-step speed cap (world px). In a 1.4k-node vault the dense start piles
 *  hundreds of repulsion contributions onto one node in a single step; without
 *  this clamp velocities compound to ~1e8, the pre-settle bounding box
 *  explodes, and fitView frames a cloud that later contracts back near the
 *  origin — leaving the whole graph offscreen (blank canvas). */
const MAX_SPEED = 16;
const ALPHA_START = 1;
const ALPHA_DECAY = 0.995;
const ALPHA_MIN = 0.015;
const ALPHA_REHEAT = 0.3;
/** How long a button zoom or a fit takes to arrive (ms). The wheel stays
 *  immediate: a wheel is the reader's own hand, a button is a request. */
const ZOOM_ANIM_MS = 220;
/** Simulation steps run per frame when the reader prefers reduced motion —
 *  enough to reach rest in well under a second without blocking the tab. */
const SETTLE_STEPS_PER_FRAME = 25;
/** The step the cooling schedule is written in: one 60 Hz frame.
 *
 *  Alpha used to decay once per FRAME, which quietly made the whole schedule a
 *  function of how fast the machine happened to be drawing. 777 steps is 13 s
 *  at 60 fps and 102 s at the 131 ms frames a 3,000-note vault was producing —
 *  so the graph that most needed to settle was the one that never did, and the
 *  slower it drew the longer it stayed hot. The clock decides now. */
const STEP_MS = 1000 / 60;
/** How much physics one frame may run to catch up with wall time. The cooling
 *  follows the clock exactly (see `frame`), but the INTEGRATION is capped, so a
 *  slow frame cannot spend its whole budget on forces and make itself slower. */
const MAX_CATCHUP_STEPS = 3;
// The floor was 0.15, which a vault of a few hundred notes fills edge to
// edge; the owner wanted to step back further ("zoom out a bit further"),
// so it is 0.04 — a thousand-note vault as one constellation, dots still a
// pixel or two wide (the radius floors in `draw` keep them visible).
const ZOOM_MIN = 0.04;
const ZOOM_MAX = 4;
const TAU = Math.PI * 2;
/** How many labels one frame may draw, whatever the zoom rule allows.
 *
 *  A label is the most expensive mark on this canvas — a text shaping pass
 *  each, and `direction` has to be set from the title's own script — and it is
 *  also the least useful in bulk: two hundred overlapping titles are noise, not
 *  navigation. When the budget bites, the highest-degree nodes keep their
 *  names, because those are the ones a reader is steering by. */
const LABEL_BUDGET = 180;

interface SimNode {
  id: string;
  title: string;
  links: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** The disc's colour: the group's under a colouring, a degree shade of
   *  the theme's node ink under none. A hex or rgb() string the canvas takes. */
  fill: string;
  /** Filtered out by the legend, the orphan switch or the degree floor. A
   *  hidden node keeps its place so unhiding it does not reseed the layout. */
  hidden: boolean;
  /** Names the search field's text. */
  match: boolean;
}

/** What the view tells the simulation about how to draw and pull. */
export interface SimOptions {
  /** Disc colour by note id; ids absent here take the degree shade. */
  fills: Map<string, string>;
  hidden: Set<string>;
  query: string;
  repulsion: number;
  linkDistance: number;
  gravity: number;
  nodeScale: number;
  edgeAlpha: number;
  labelZoom: number;
  glow: boolean;
}

function defaultSimOptions(): SimOptions {
  return {
    fills: new Map(),
    hidden: new Set(),
    query: "",
    repulsion: DEFAULT_FORCES.repulsion,
    linkDistance: DEFAULT_FORCES.linkDistance,
    gravity: DEFAULT_FORCES.gravity,
    nodeScale: DEFAULT_DISPLAY.nodeScale,
    edgeAlpha: DEFAULT_DISPLAY.edgeAlpha,
    labelZoom: DEFAULT_DISPLAY.labelZoom,
    glow: DEFAULT_DISPLAY.glow,
  };
}

interface SimEdge {
  a: SimNode;
  b: SimNode;
}

/** The quadtree's numeric columns. Aliased so the buffer parameter is written
 *  once — and so a signature carrying it twice does not read as JSX text to
 *  check-i18n, which scans `>…<` on a line. */
type F64 = Float64Array<ArrayBuffer>;

// ThemeColors / readThemeColors / mixColors used to be declared here and
// exported for LocalGraph to import — which made the whole force-directed
// simulation a static dependency of the backlinks panel, and so of every admin
// first paint. They live in ./graphColors.ts now (imported above), with the
// graph-token and color-scheme handling this file had; check-bundle.mjs fails
// the build if the GraphView → LocalGraph edge ever comes back.

function nodeRadius(links: number): number {
  return 4 + Math.min(10, Math.sqrt(links) * 2.4);
}

/** FNV-1a 32-bit hash — stable seed source for the initial layout. */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic initial position seeded by the note's path (not its index in
 *  the response), so the layout is stable across reloads and across notes
 *  being added/removed elsewhere in the vault. Uniform over a disc whose
 *  radius scales with vault size. */
function seedPosition(id: string, count: number): { x: number; y: number } {
  const h = hash32(id);
  const u1 = ((h >>> 16) & 0xffff) / 0x10000; // radius sample
  const u2 = (h & 0xffff) / 0x10000; // angle sample
  const outer = 46 * Math.sqrt(count + 1);
  const radius = outer * Math.sqrt(u1);
  const angle = u2 * Math.PI * 2;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

export interface Sim {
  setData(data: GraphData): void;
  /** Colours, filters, forces and display, all at once; cheap enough to call
   *  on every slider tick. Positions survive it. */
  setOptions(opts: SimOptions): void;
  /** How many nodes the filters left on the canvas. */
  visibleCount(): number;
  zoomBy(factor: number): void;
  resetView(): void;
  /** Light a node from outside the pointer — the keyboard list behind the
   *  canvas. Null puts the canvas back to its resting state. */
  setFocus(id: string | null): void;
  destroy(): void;
}

export function createSim(canvas: HTMLCanvasElement, wrap: HTMLElement): Sim {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      setData() {},
      setOptions() {},
      visibleCount: () => 0,
      zoomBy() {},
      resetView() {},
      setFocus() {},
      destroy() {},
    };
  }

  /** Every node and edge the data holds; `nodes`/`edges` are the visible
   *  subset the forces and the canvas work on. */
  let all: SimNode[] = [];
  let allEdges: SimEdge[] = [];
  let nodes: SimNode[] = [];
  let edges: SimEdge[] = [];
  let byId = new Map<string, SimNode>();
  let opts: SimOptions = defaultSimOptions();
  /** Nodes whose titles name the search text; null while the field is empty. */
  let matchSet: Set<SimNode> | null = null;
  const neighbors = new Map<SimNode, Set<SimNode>>();
  /** The brightest node in the graph, sampled once per dataset instead of
   *  reduced over every node on every frame. */
  let maxLinks = 1;

  let colors = readThemeColors();

  // Node fills are a blend of accent → bg by degree. Computed inline, that is
  // two hex parses, two array allocations and a template string PER NODE PER
  // FRAME — ~2,800 of them at 1,388 nodes, before the canvas re-parses each
  // resulting string. The blend is a smooth ramp, so a quantized lookup table
  // is visually identical (33 steps across a 0.35 lightness range is well
  // under a perceptible increment) and costs nothing per frame.
  const SHADES = 33;
  let shades: string[] = [];
  let orphanFill = "";
  let rimStroke = "";
  function buildPalette(): void {
    shades = Array.from({ length: SHADES }, (_, i) =>
      mixColors(colors.accent, colors.bg, 0.45 - 0.35 * (i / (SHADES - 1))),
    );
    orphanFill = mixColors(colors.accent, colors.bg, 0.62);
    rimStroke = mixColors(colors.text, colors.bg, 0.55);
  }
  buildPalette();

  /** The degree shade a node wears when no colouring names it. */
  function degreeFill(n: SimNode): string {
    if (n.links === 0) return orphanFill;
    return shades[Math.min(SHADES - 1, ((n.links / maxLinks) * (SHADES - 1)) | 0)];
  }

  /** Recolour, refilter and retune from `opts`. Positions are untouched, so a
   *  slider tick or a legend click changes the picture and not the place. */
  function applyOptions(): void {
    const q = opts.query.trim().toLowerCase();
    matchSet = q === "" ? null : new Set<SimNode>();
    for (const n of all) {
      n.fill = opts.fills.get(n.id) ?? degreeFill(n);
      n.hidden = opts.hidden.has(n.id);
      n.r = nodeRadius(n.links) * opts.nodeScale;
      n.match = q !== "" && n.title.toLowerCase().includes(q);
      if (n.match && matchSet) matchSet.add(n);
    }
    nodes = all.filter((n) => !n.hidden);
    edges = allEdges.filter((e) => !e.a.hidden && !e.b.hidden);
    neighbors.clear();
    for (const { a, b } of edges) {
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    }
    litFor = undefined;
    if (hovered?.hidden) hovered = null;
    if (focused?.hidden) focused = null;
    themeRev++; // the edge layer's alpha is part of its key
    needsDraw = true;
  }
  let width = 0; // CSS px
  let height = 0;
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  // View transform: screen = world * k + (tx, ty), in CSS px.
  let k = 1;
  let tx = 0;
  let ty = 0;
  let viewCentered = false;

  let alpha = ALPHA_START;
  let needsDraw = true;
  let hovered: SimNode | null = null;
  let focused: SimNode | null = null;
  /** Bumped whenever node POSITIONS move; part of the edge layer's cache key. */
  let geom = 0;
  /** Bumped when the theme changes; likewise. */
  let themeRev = 0;

  // Pointer interaction state. A press becomes a drag only after 4px of
  // pointer travel; a press-and-release inside the threshold is a click.
  let dragNode: SimNode | null = null;
  let panning = false;
  let panStart = { x: 0, y: 0, tx: 0, ty: 0 };
  let downAt = { x: 0, y: 0 };
  let moved = false;
  let dragVel = { x: 0, y: 0 }; // smoothed drag velocity (world px/ms)
  let lastDrag = { x: 0, y: 0, t: 0 };

  function updateCursor() {
    // Both nodes (drag) and the background (pan) are grabbable; the hand
    // closes while either is held.
    canvas.style.cursor = dragNode || panning ? "grabbing" : "grab";
  }

  const abort = new AbortController();
  const { signal } = abort;

  const toWorld = (sx: number, sy: number) => ({
    x: (sx - tx) / k,
    y: (sy - ty) / k,
  });

  function reheat() {
    alpha = Math.max(alpha, ALPHA_REHEAT);
  }

  let pendingFit = false;

  /** Center the view on the layout's bounding box (optical centering — the
   *  spiral seed is origin-centered but the settled mass rarely is). */
  function fitView() {
    if (nodes.length === 0 || width === 0 || height === 0) {
      pendingFit = nodes.length > 0;
      k = 1;
      tx = width / 2;
      ty = height / 2;
      needsDraw = true;
      return;
    }
    pendingFit = false;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x - n.r);
      minY = Math.min(minY, n.y - n.r);
      maxX = Math.max(maxX, n.x + n.r);
      maxY = Math.max(maxY, n.y + n.r);
    }
    const pad = 64;
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    k = Math.min(
      1,
      Math.max(ZOOM_MIN, Math.min((width - pad * 2) / w, (height - pad * 2) / h)),
    );
    tx = width / 2 - ((minX + maxX) / 2) * k;
    ty = height / 2 - ((minY + maxY) / 2) * k;
    viewCentered = true;
    needsDraw = true;
  }

  function setData(data: GraphData) {
    const previous = byId;
    byId = new Map<string, SimNode>();
    all = data.nodes.map((n: GraphNode) => {
      // A node the sim already holds keeps its place: a refilter or a refetch
      // must not fling the constellation back to its seed under the reader.
      const was = previous.get(n.id);
      const { x, y } = was ?? seedPosition(n.id, data.nodes.length);
      const sim: SimNode = {
        id: n.id,
        title: n.title,
        links: n.links,
        x,
        y,
        vx: 0,
        vy: 0,
        r: nodeRadius(n.links),
        fill: "",
        hidden: false,
        match: false,
      };
      byId.set(n.id, sim);
      return sim;
    });
    maxLinks = all.reduce((m, n) => Math.max(m, n.links), 1);
    allEdges = [];
    hovered = null;
    focused = null;
    for (const e of data.edges) {
      const a = byId.get(e.source);
      const b = byId.get(e.target);
      if (!a || !b || a === b) continue;
      allEdges.push({ a, b });
    }
    applyOptions();
    // Pre-settle off-screen so the first frame is already a readable layout,
    // then frame it optically centered.
    alpha = ALPHA_START;
    // Pre-settle steps run SYNCHRONOUSLY, so this number is a freeze the
    // reader pays before the first frame. Big vaults get fewer of them; the
    // rAF loop finishes the job with the tab responsive.
    const preSteps = nodes.length > 2000 ? 30 : nodes.length > 800 ? 60 : 140;
    for (let i = 0; i < preSteps; i++) {
      step();
      alpha *= ALPHA_DECAY;
    }
    alpha = Math.max(alpha, ALPHA_REHEAT);
    fitView();
    needsDraw = true;
  }

  function setOptions(next: SimOptions): void {
    const forcesMoved =
      next.repulsion !== opts.repulsion ||
      next.linkDistance !== opts.linkDistance ||
      next.gravity !== opts.gravity;
    const shownBefore = nodes.length;
    opts = next;
    applyOptions();
    // A change in what is on the canvas, or in how it pulls, is a reason to
    // move again; a recolour is not.
    if (forcesMoved || nodes.length !== shownBefore) reheat();
  }

  // --- physics --------------------------------------------------------------
  //
  // Repulsion is the whole cost of this simulation. At 3,000 nodes the layout
  // holds roughly 420 other nodes inside one node's 560 px cutoff, which is
  // 1.26 million distance computations per step — measured at 39 ms, nine
  // frames a second, for as long as the graph is moving. A uniform grid cannot
  // help with that, because the DENSITY is the problem and a grid's cells are
  // the same size everywhere however crowded they get.
  //
  // So the far field is summarized rather than summed, the standard way: a
  // quadtree, where a cell that is small compared to its distance answers as
  // one mass at its centre of gravity (Barnes–Hut). Two properties earn it its
  // place here rather than anything simpler:
  //
  //   - The test is a DISTANCE test, so the approximation leaves no mark on
  //     the picture. An earlier attempt aggregated by fixed grid cell and
  //     printed the grid into the settled layout — a square cloud with a
  //     visible lattice in it, on the one surface of this product that is a
  //     screenshot. A quadtree's cells shrink exactly where the nodes are.
  //   - Cells wholly outside the cutoff are pruned by their own bounding box,
  //     so the LOCALITY the shipped force law had is kept: this is still a
  //     short-range repulsion, not the global one a plain Barnes–Hut would
  //     give, and a vault's constellation keeps the shape readers have been
  //     looking at. (A cell that straddles the cutoff contributes all of its
  //     mass rather than the part inside it — a smoother truth than a force
  //     that switches off at a radius, and invisible at these magnitudes.)
  //
  // Measured on the 3,000-note fixture: 39 ms → about 2 ms a step, and the
  // graph holds 60 fps from the first frame through to rest, against nine.

  /** Barnes–Hut opening angle. Below this ratio of cell width to distance a
   *  cell is taken as one mass; above it the traversal descends. 0.7 is the
   *  conventional value and the force error it admits is a fraction of a
   *  percent at these densities. */
  const THETA = 0.7;
  /** Cells stop subdividing here, so exactly-coincident nodes cannot recurse
   *  forever; they share a leaf and are answered pairwise. */
  const MIN_HALF = 0.5;

  // The tree lives in parallel arrays that are reused between steps: at sixty
  // steps a second, one object per cell would be several thousand allocations
  // a frame for a structure that is thrown away immediately.
  let tCap = 0;
  let tMass = new Float64Array(0); // node count under this cell
  let tX = new Float64Array(0); // centre of mass
  let tY = new Float64Array(0);
  let tCx = new Float64Array(0); // geometric centre of the cell's square
  let tCy = new Float64Array(0);
  let tHalf = new Float64Array(0);
  let tKids = new Int32Array(0); // 4 per cell, -1 for none
  let tLeaf = new Int32Array(0); // head of this leaf's node chain, else -1
  let leafNext = new Int32Array(0); // node -> next node in its leaf's chain
  let tCount = 0;

  /** Grow the tree arrays, KEEPING what is in them. A build that runs out of
   *  cells halfway — two nodes a hair apart subdivide until the floor, and a
   *  vault of near-duplicates can do that thousands of times — would otherwise
   *  come back with a tree of zeroes and a graph with no forces in it. */
  function ensureTree(cells: number): void {
    if (cells <= tCap) return;
    const cap = Math.max(64, cells, tCap * 2);
    const grow = (old: F64): F64 => {
      const next = new Float64Array(cap);
      next.set(old);
      return next;
    };
    tMass = grow(tMass);
    tX = grow(tX);
    tY = grow(tY);
    tCx = grow(tCx);
    tCy = grow(tCy);
    tHalf = grow(tHalf);
    const kids = new Int32Array(cap * 4);
    kids.set(tKids);
    tKids = kids;
    const leaf = new Int32Array(cap);
    leaf.set(tLeaf);
    tLeaf = leaf;
    tCap = cap;
  }

  function newCell(cx: number, cy: number, half: number): number {
    if (tCount >= tCap) ensureTree(tCount + 1);
    const c = tCount++;
    tMass[c] = 0;
    tX[c] = 0;
    tY[c] = 0;
    tCx[c] = cx;
    tCy[c] = cy;
    tHalf[c] = half;
    tKids[c * 4] = -1;
    tKids[c * 4 + 1] = -1;
    tKids[c * 4 + 2] = -1;
    tKids[c * 4 + 3] = -1;
    tLeaf[c] = -1;
    return c;
  }

  /** Which of a cell's four quadrants a point falls in. */
  function quadrant(c: number, x: number, y: number): number {
    return (x >= tCx[c] ? 1 : 0) | (y >= tCy[c] ? 2 : 0);
  }

  function childOf(c: number, q: number): number {
    const at = c * 4 + q;
    let kid = tKids[at];
    if (kid !== -1) return kid;
    const half = tHalf[c] / 2;
    kid = newCell(
      tCx[c] + (q & 1 ? half : -half),
      tCy[c] + (q & 2 ? half : -half),
      half,
    );
    // `newCell` may have grown (and so replaced) the arrays; write through the
    // current one.
    tKids[at] = kid;
    return kid;
  }

  function buildTree(): void {
    if (nodes.length === 0) {
      tCount = 0;
      return;
    }
    if (leafNext.length < nodes.length) leafNext = new Int32Array(nodes.length * 2);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    const half = Math.max(1, (maxX - minX) / 2, (maxY - minY) / 2) * 1.05;
    // A generous cell budget up front: a random point set needs about 2N
    // cells, and growing mid-build is correct but pointless churn.
    ensureTree(Math.max(64, nodes.length * 3));
    tCount = 0;
    newCell((minX + maxX) / 2, (minY + maxY) / 2, half);

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      leafNext[i] = -1;
      let c = 0;
      for (;;) {
        const held = tLeaf[c];
        if (tMass[c] === 0) {
          // Empty cell: it becomes this node's leaf.
          tLeaf[c] = i;
          tMass[c] = 1;
          break;
        }
        if (held !== -1) {
          // A leaf. Coincident (or below the subdivision floor) → share it.
          const other = nodes[held];
          if (
            tHalf[c] <= MIN_HALF ||
            (Math.abs(other.x - n.x) < 1e-6 && Math.abs(other.y - n.y) < 1e-6)
          ) {
            leafNext[i] = held;
            tLeaf[c] = i;
            break;
          }
          // Push the sitting tenant down one level, then carry on with ours.
          tLeaf[c] = -1;
          const q = quadrant(c, other.x, other.y);
          const kid = childOf(c, q);
          tLeaf[kid] = held;
          tMass[kid] = 1;
        }
        c = childOf(c, quadrant(c, n.x, n.y));
      }
      // Every cell on the path down gains this node's mass. Walking the path a
      // second time is cheaper than threading parent pointers through the
      // insertion above, and the depth is a logarithm.
      let p = 0;
      for (;;) {
        if (p !== c) tMass[p]++;
        if (p === c) break;
        const q = quadrant(p, n.x, n.y);
        const kid = tKids[p * 4 + q];
        if (kid === -1) break;
        p = kid;
      }
    }

    // Centres of mass, bottom up. Children are always created after their
    // parent, so descending indices IS a post-order.
    for (let c = tCount - 1; c >= 0; c--) {
      if (tLeaf[c] !== -1) {
        let sx = 0;
        let sy = 0;
        let m = 0;
        for (let i = tLeaf[c]; i !== -1; i = leafNext[i]) {
          sx += nodes[i].x;
          sy += nodes[i].y;
          m++;
        }
        tMass[c] = m;
        tX[c] = sx / m;
        tY[c] = sy / m;
        continue;
      }
      let sx = 0;
      let sy = 0;
      let m = 0;
      for (let q = 0; q < 4; q++) {
        const kid = tKids[c * 4 + q];
        if (kid === -1) continue;
        const km = tMass[kid];
        if (km === 0) continue;
        sx += tX[kid] * km;
        sy += tY[kid] * km;
        m += km;
      }
      tMass[c] = m;
      if (m > 0) {
        tX[c] = sx / m;
        tY[c] = sy / m;
      }
    }
  }

  /** Traversal stack, reused. Depth times four is a generous ceiling. */
  const bhStack = new Int32Array(4096);

  /** One integration step: Barnes–Hut repulsion, springs, gravity, damping. */
  function step() {
    buildTree();
    const R2 = REPULSE_RADIUS * REPULSE_RADIUS;
    const repulsion = REPULSION * opts.repulsion;
    const gravity = GRAVITY * opts.gravity;
    const rest = opts.linkDistance;

    for (const n of nodes) {
      let fx = 0;
      let fy = 0;

      if (tCount > 0) {
        let top = 0;
        bhStack[top++] = 0;
        while (top > 0) {
          const c = bhStack[--top];
          const mass = tMass[c];
          if (mass === 0) continue;
          // Prune by the cell's own box, which is the cutoff this force law
          // has always had: nothing in a cell that lies wholly further than
          // REPULSE_RADIUS can contribute.
          const bx = Math.max(0, Math.abs(n.x - tCx[c]) - tHalf[c]);
          const by = Math.max(0, Math.abs(n.y - tCy[c]) - tHalf[c]);
          if (bx * bx + by * by > R2) continue;

          const leaf = tLeaf[c];
          if (leaf !== -1) {
            for (let i = leaf; i !== -1; i = leafNext[i]) {
              const o = nodes[i];
              if (o === n) continue;
              let dx = n.x - o.x;
              let dy = n.y - o.y;
              let d2 = dx * dx + dy * dy;
              if (d2 > R2) continue;
              if (d2 < 1) {
                // Coincident nodes: nudge apart deterministically.
                dx = (n.id < o.id ? 1 : -1) * 0.5;
                dy = 0.5;
                d2 = 0.5;
              }
              const d = Math.sqrt(d2);
              const f = Math.min(repulsion / d2, 12);
              fx += (dx / d) * f;
              fy += (dy / d) * f;
            }
            continue;
          }

          const dx = n.x - tX[c];
          const dy = n.y - tY[c];
          const d2 = dx * dx + dy * dy;
          if (d2 > 1 && tHalf[c] * 2 < THETA * Math.sqrt(d2)) {
            const d = Math.sqrt(d2);
            const f = Math.min(repulsion / d2, 12) * mass;
            fx += (dx / d) * f;
            fy += (dy / d) * f;
            continue;
          }
          for (let q = 0; q < 4; q++) {
            const kid = tKids[c * 4 + q];
            if (kid !== -1 && top < bhStack.length) bhStack[top++] = kid;
          }
        }
      }

      // Centering gravity.
      fx -= n.x * gravity;
      fy -= n.y * gravity;

      n.vx += fx * alpha;
      n.vy += fy * alpha;
    }

    // Springs along edges (applied symmetrically).
    for (const { a, b } of edges) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = SPRING_K * (d - rest) * alpha;
      const ux = dx / d;
      const uy = dy / d;
      a.vx += ux * f;
      a.vy += uy * f;
      b.vx -= ux * f;
      b.vy -= uy * f;
    }

    // Integrate with damping; the dragged node is pinned to the pointer.
    for (const n of nodes) {
      if (n === dragNode) {
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      n.vx *= FRICTION;
      n.vy *= FRICTION;
      const speed = Math.hypot(n.vx, n.vy);
      if (speed > MAX_SPEED) {
        n.vx *= MAX_SPEED / speed;
        n.vy *= MAX_SPEED / speed;
      }
      n.x += n.vx;
      n.y += n.vy;
    }
    geom++;
  }

  // --- rendering ------------------------------------------------------------

  /** The lit node and its neighbours, cached: hovering a hub used to rebuild a
   *  Set of several hundred nodes on every frame the pointer did not move. */
  let litFor: SimNode | null | undefined;
  let litSet: Set<SimNode> | null = null;
  function litSetFor(n: SimNode | null): Set<SimNode> | null {
    if (n === litFor) return litSet;
    litFor = n;
    litSet = n === null ? null : new Set<SimNode>([n, ...(neighbors.get(n) ?? [])]);
    return litSet;
  }

  // The idle edge web is drawn to its own bitmap and blitted, because edges
  // change with the VIEW and with the PHYSICS and with nothing else — a hover
  // changes neither. Before this, moving a pointer across a settled 3,000-node
  // vault re-stroked every edge in the graph, sixty times a second, in order to
  // light up ten of them.
  const edgeCanvas = document.createElement("canvas");
  const edgeCtx = edgeCanvas.getContext("2d");
  let edgeKey = "";

  /** The world-space rectangle the reader can actually see, with a margin for
   *  discs and labels whose centre is just outside it. Everything culled
   *  against this costs nothing at all; without it a 3,000-node vault paid a
   *  fill, a stroke and a text shaping pass for every node off screen. */
  function viewBox(): { x0: number; x1: number; y0: number; y1: number } {
    const margin = 72;
    return {
      x0: (-margin - tx) / k,
      x1: (width + margin - tx) / k,
      y0: (-margin - ty) / k,
      y1: (height + margin - ty) / k,
    };
  }

  function edgeLayer(): HTMLCanvasElement | null {
    if (!edgeCtx || width === 0 || height === 0) return null;
    const key = `${k}|${tx}|${ty}|${width}|${height}|${dpr}|${geom}|${themeRev}`;
    if (key === edgeKey) return edgeCanvas;
    edgeKey = key;
    const { x0, x1, y0, y1 } = viewBox();
    edgeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    edgeCtx.clearRect(0, 0, width, height);
    edgeCtx.lineWidth = 1;
    edgeCtx.strokeStyle = colors.idleEdge;
    edgeCtx.globalAlpha = opts.edgeAlpha;
    // ONE path for the whole web: 2,922 beginPath/stroke pairs on the fixture
    // became one of each. The bbox reject below is conservative — a segment
    // whose ends straddle the viewport is kept — which is exactly right for a
    // cull: cheap, and it never drops a line the reader can see.
    edgeCtx.beginPath();
    for (const { a, b } of edges) {
      if ((a.x < x0 && b.x < x0) || (a.x > x1 && b.x > x1)) continue;
      if ((a.y < y0 && b.y < y0) || (a.y > y1 && b.y > y1)) continue;
      edgeCtx.moveTo(a.x * k + tx, a.y * k + ty);
      edgeCtx.lineTo(b.x * k + tx, b.y * k + ty);
    }
    edgeCtx.stroke();
    return edgeCanvas;
  }

  /** Reused across frames, keyed by fill colour: one path and one fillStyle
   *  per colour on the canvas, whether the colours are a degree ramp or a
   *  dozen folders. Arrays are kept and emptied rather than reallocated. */
  const nodeBuckets = new Map<string, SimNode[]>();
  const labelPicks: SimNode[] = [];

  /** One disc, as a subpath of whatever path is open. The `moveTo` is load-
   *  bearing: consecutive `arc`s in one path are joined by a line otherwise,
   *  and a batched stroke would draw the constellation as a scribble. */
  function arc(target: CanvasRenderingContext2D, n: SimNode, grow: number): void {
    const rk = Math.max(2, n.r * k) + grow;
    const sx = n.x * k + tx;
    const sy = n.y * k + ty;
    target.moveTo(sx + rk, sy);
    target.arc(sx, sy, rk, 0, TAU);
  }

  function draw() {
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, width, height);

    // Hover and keyboard focus ask the same question — "which node am I on?" —
    // so they get the same answer. The pointer wins while it is on a node.
    const lit = hovered ?? focused;
    // A search narrows the picture the way a hover does: the named nodes
    // stand at full strength and everything else steps back. The pointer
    // still wins while it is on a node, so a reader can walk a match's
    // neighbourhood without clearing the field.
    const hoverSet = litSetFor(lit) ?? matchSet;
    const dimAlpha = 0.15;
    // Labels appear from the reader's zoom threshold upward; hover and
    // search always reveal them.
    const at = opts.labelZoom;
    const zoomLabelAlpha = k < at ? 0 : Math.min(1, (k - at) / 0.35);
    const activePath = useStore.getState().openPath;
    const { x0, x1, y0, y1 } = viewBox();
    const onScreen = (n: SimNode): boolean =>
      n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1;

    // Edges: one blit, plus the handful incident on the lit node.
    const layer = edgeLayer();
    if (layer) {
      ctx!.globalAlpha = hoverSet
        ? Math.min(1, dimAlpha / (colors.idleEdgeAlpha || 1))
        : 1;
      ctx!.drawImage(layer, 0, 0, width, height);
    }
    if (lit !== null) {
      // The lit node's own web, in its own colour, a little heavier.
      ctx!.globalAlpha = 0.9;
      ctx!.strokeStyle = lit.fill;
      ctx!.lineWidth = 1.4;
      ctx!.beginPath();
      for (const { a, b } of edges) {
        if (a !== lit && b !== lit) continue;
        ctx!.moveTo(a.x * k + tx, a.y * k + ty);
        ctx!.lineTo(b.x * k + tx, b.y * k + ty);
      }
      ctx!.stroke();
      ctx!.lineWidth = 1;
    }

    // Nodes: gold-leaf discs, brighter with degree, with a thin rim.
    //
    // Bucketed by fill colour, so the canvas takes one fillStyle and one path
    // per shade instead of a fill and a stroke per node — three dozen draw
    // calls where a 3,000-node vault used to issue six thousand. The rims all
    // land on top of all the fills rather than under the next node's; in a
    // dense cluster that reads as a crisper web, and it is one stroke.
    for (const bucket of nodeBuckets.values()) bucket.length = 0;
    let shown = 0;
    for (const n of nodes) {
      if (!onScreen(n)) continue;
      shown++;
      let bucket = nodeBuckets.get(n.fill);
      if (!bucket) nodeBuckets.set(n.fill, (bucket = []));
      bucket.push(n);
    }

    // The halo: a soft disc of the node's own colour under it. One
    // translucent fill per colour, three times the radius, so a cluster of
    // one folder reads as a glow of one hue. Skipped above a few hundred
    // discs on screen, where it would be a wash rather than a light.
    const glowAll = opts.glow && shown <= 700;
    if (glowAll) {
      ctx!.globalAlpha = hoverSet ? 0.05 : 0.16;
      for (const [fill, bucket] of nodeBuckets) {
        if (bucket.length === 0) continue;
        ctx!.fillStyle = fill;
        ctx!.beginPath();
        for (const n of bucket) arc(ctx!, n, Math.max(4, n.r * k * 1.4));
        ctx!.fill();
      }
    }

    ctx!.globalAlpha = hoverSet ? dimAlpha : 1;
    for (const [fill, bucket] of nodeBuckets) {
      if (bucket.length === 0) continue;
      ctx!.fillStyle = fill;
      ctx!.beginPath();
      for (const n of bucket) arc(ctx!, n, 0);
      ctx!.fill();
    }
    // A hairline of the ground between touching discs, so a dense cluster
    // is a cluster of discs and not a blot.
    ctx!.strokeStyle = colors.bg;
    ctx!.globalAlpha = hoverSet ? dimAlpha * 0.6 : 0.6;
    ctx!.lineWidth = 1;
    ctx!.beginPath();
    for (const bucket of nodeBuckets.values()) for (const n of bucket) arc(ctx!, n, 0);
    ctx!.stroke();

    // The lit node and its neighbours (or the search's matches), repainted
    // at full strength on top, each in its own colour, with a glow of it.
    if (hoverSet) {
      ctx!.globalAlpha = 0.28;
      for (const n of hoverSet) {
        if (!onScreen(n)) continue;
        ctx!.fillStyle = n.fill;
        ctx!.beginPath();
        arc(ctx!, n, Math.max(6, n.r * k * 1.6));
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
      for (const n of hoverSet) {
        if (!onScreen(n)) continue;
        ctx!.fillStyle = n.fill;
        ctx!.beginPath();
        arc(ctx!, n, 0);
        ctx!.fill();
      }
      ctx!.strokeStyle = rimStroke;
      ctx!.beginPath();
      for (const n of hoverSet) if (onScreen(n)) arc(ctx!, n, 0);
      ctx!.stroke();
    }

    // Ring around the currently-open note, and around the lit one.
    ctx!.globalAlpha = 1;
    ctx!.strokeStyle = colors.text;
    ctx!.lineWidth = 1.5;
    const active = activePath === null ? undefined : byId.get(activePath);
    if (active && onScreen(active)) {
      ctx!.beginPath();
      arc(ctx!, active, 4);
      ctx!.stroke();
    }
    if (lit && onScreen(lit)) {
      ctx!.strokeStyle = lit.fill;
      ctx!.beginPath();
      arc(ctx!, lit, 3);
      ctx!.stroke();
    }
    ctx!.lineWidth = 1;

    // Labels (drawn after all nodes so they sit on top), culled, then capped.
    const labelAlphaOf = (n: SimNode): number => {
      const isLit = hoverSet !== null && hoverSet.has(n);
      let a = isLit ? 1 : zoomLabelAlpha * (n.links === 0 ? 0.55 : 0.85);
      if (hoverSet && !isLit) a = Math.min(a, dimAlpha);
      return a;
    };
    labelPicks.length = 0;
    for (const n of nodes) {
      if (!onScreen(n)) continue;
      if (labelAlphaOf(n) <= 0.02) continue;
      labelPicks.push(n);
    }
    if (labelPicks.length > LABEL_BUDGET) {
      labelPicks.sort((a, b) => b.links - a.links);
      labelPicks.length = LABEL_BUDGET;
    }
    ctx!.font = `${k >= 1.6 ? 12 : 11}px ${colors.fontUI}`;
    ctx!.textAlign = "center";
    ctx!.textBaseline = "top";
    // A halo of the ground under every label, so a title over an edge or a
    // neighbouring disc stays a title.
    ctx!.strokeStyle = colors.bg;
    ctx!.lineWidth = 3;
    ctx!.lineJoin = "round";
    let dir = "";
    let ink = "";
    for (const n of labelPicks) {
      ctx!.globalAlpha = labelAlphaOf(n);
      const want = hoverSet !== null && hoverSet.has(n) ? colors.text : colors.muted;
      if (want !== ink) ctx!.fillStyle = ink = want;
      // Titles are note content: each renders in its own direction, or an
      // English title in an RTL shell comes out as "?What is the Republic about".
      const d = autoDir(n.title);
      if (d !== dir) ctx!.direction = dir = d;
      const lx = n.x * k + tx;
      const ly = n.y * k + ty + Math.max(2, n.r * k) + 5;
      ctx!.strokeText(n.title, lx, ly);
      ctx!.fillText(n.title, lx, ly);
    }
    ctx!.lineWidth = 1;

    ctx!.globalAlpha = 1;
  }

  // --- lifecycle: rAF loop --------------------------------------------------

  /** A zoom in flight: the view eases from `from` to `to` about (cx, cy). */
  let zoomAnim: { from: number; to: number; cx: number; cy: number; start: number } | null = null;
  function zoomAbout(next: number, cx: number, cy: number): void {
    tx = cx - ((cx - tx) / k) * next;
    ty = cy - ((cy - ty) / k) * next;
    k = next;
    needsDraw = true;
  }

  let raf = 0;
  let lastFrameAt = 0;
  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (zoomAnim) {
      const t = Math.min(1, (now - zoomAnim.start) / ZOOM_ANIM_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      const target = zoomAnim.from * Math.pow(zoomAnim.to / zoomAnim.from, eased);
      zoomAbout(target, zoomAnim.cx, zoomAnim.cy);
      if (t >= 1) zoomAnim = null;
    }
    // A force layout's whole entrance IS motion — eight hundred frames of
    // drift is exactly what "prefers-reduced-motion" is asking us not to do.
    // So when the reader has asked for less, those frames are spent settling
    // the layout instead of showing it: many steps per frame, nothing painted
    // until it comes to rest, and then the finished graph appears at once.
    // Interaction (drag, zoom, hover) still repaints immediately — direct
    // manipulation is the reader's own movement, not ours.
    const still = prefersReducedMotion();
    const elapsed = lastFrameAt === 0 ? STEP_MS : Math.min(250, now - lastFrameAt);
    lastFrameAt = now;
    if (alpha > ALPHA_MIN && nodes.length > 0) {
      if (still) {
        for (let i = 0; i < SETTLE_STEPS_PER_FRAME && alpha > ALPHA_MIN; i++) {
          step();
          alpha *= ALPHA_DECAY;
        }
      } else {
        // The COOLING follows the clock — a 131 ms frame cools by eight 60 Hz
        // frames' worth whether or not it had time to integrate eight of them
        // — while the integration itself is capped. That is what makes the
        // settle time a property of the vault instead of the machine.
        const owed = elapsed / STEP_MS;
        const steps = Math.min(MAX_CATCHUP_STEPS, Math.max(1, Math.round(owed)));
        for (let i = 0; i < steps; i++) step();
        alpha *= Math.pow(ALPHA_DECAY, owed);
      }
      needsDraw = needsDraw || !still || alpha <= ALPHA_MIN;
    }
    if (needsDraw) {
      draw();
      needsDraw = false;
    }
  }
  raf = requestAnimationFrame(frame);

  // --- sizing / theme -------------------------------------------------------

  function resize() {
    const rect = wrap.getBoundingClientRect();
    dpr = Math.max(1, window.devicePixelRatio || 1);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    edgeCanvas.width = canvas.width;
    edgeCanvas.height = canvas.height;
    edgeKey = ""; // a resized bitmap holds nothing
    if (pendingFit && width > 0) {
      fitView();
    } else if (!viewCentered && width > 0) {
      tx = width / 2;
      ty = height / 2;
      viewCentered = true;
    }
    needsDraw = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  resize();

  const themeObserver = new MutationObserver(() => {
    colors = readThemeColors();
    buildPalette(); // the shade table is derived from the theme, not the data
    themeRev++;
    needsDraw = true;
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  // --- interaction ----------------------------------------------------------

  function hitTest(sx: number, sy: number): SimNode | null {
    const { x, y } = toWorld(sx, sy);
    const slack = 6 / k; // keep small nodes grabbable when zoomed out
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const reach = n.r + slack;
      const dx = n.x - x;
      const dy = n.y - y;
      if (dx * dx + dy * dy <= reach * reach) return n;
    }
    return null;
  }

  function pointerPos(e: { clientX: number; clientY: number }) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  canvas.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      const p = pointerPos(e);
      downAt = p;
      moved = false;
      canvas.setPointerCapture(e.pointerId);
      const hit = hitTest(p.x, p.y);
      if (hit) {
        dragNode = hit;
        const w = toWorld(p.x, p.y);
        dragVel = { x: 0, y: 0 };
        lastDrag = { x: w.x, y: w.y, t: performance.now() };
        reheat();
      } else {
        panning = true;
        panStart = { x: p.x, y: p.y, tx, ty };
      }
      updateCursor();
    },
    { signal },
  );

  canvas.addEventListener(
    "pointermove",
    (e) => {
      const p = pointerPos(e);
      if (Math.hypot(p.x - downAt.x, p.y - downAt.y) > 4) moved = true;

      if (dragNode) {
        // Inside the click threshold the node stays put; past it the node
        // pins to the pointer and we keep a smoothed velocity for momentum.
        if (!moved) return;
        const w = toWorld(p.x, p.y);
        dragNode.x = w.x;
        dragNode.y = w.y;
        geom++; // the web moved with it
        const now = performance.now();
        const dt = now - lastDrag.t;
        if (dt > 0) {
          const s = Math.min(1, dt / 50);
          dragVel.x += ((w.x - lastDrag.x) / dt - dragVel.x) * s;
          dragVel.y += ((w.y - lastDrag.y) / dt - dragVel.y) * s;
        }
        lastDrag = { x: w.x, y: w.y, t: now };
        reheat();
        needsDraw = true;
        return;
      }
      if (panning) {
        tx = panStart.tx + (p.x - panStart.x);
        ty = panStart.ty + (p.y - panStart.y);
        needsDraw = true;
        return;
      }
      const hit = hitTest(p.x, p.y);
      if (hit !== hovered) {
        hovered = hit;
        updateCursor();
        needsDraw = true;
      }
    },
    { signal },
  );

  canvas.addEventListener(
    "pointerup",
    (e) => {
      const clicked = !moved && dragNode;
      if (clicked) useStore.getState().openNote(clicked.id);
      if (dragNode && moved) {
        // Release with momentum: the smoothed drag velocity (world px/ms)
        // becomes sim velocity (world px/frame), capped so a flick glides
        // instead of launching the node across the vault.
        let vx = dragVel.x * 16.7;
        let vy = dragVel.y * 16.7;
        const cap = MAX_SPEED * 0.6;
        const speed = Math.hypot(vx, vy);
        if (speed > cap) {
          vx *= cap / speed;
          vy *= cap / speed;
        }
        dragNode.vx = vx;
        dragNode.vy = vy;
        reheat();
      }
      dragNode = null;
      panning = false;
      if (canvas.hasPointerCapture(e.pointerId)) {
        canvas.releasePointerCapture(e.pointerId);
      }
      updateCursor();
      needsDraw = true;
    },
    { signal },
  );

  canvas.addEventListener(
    "pointercancel",
    () => {
      dragNode = null;
      panning = false;
      updateCursor();
      needsDraw = true;
    },
    { signal },
  );

  canvas.addEventListener(
    "pointerleave",
    () => {
      if (hovered) {
        hovered = null;
        needsDraw = true;
      }
    },
    { signal },
  );

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = pointerPos(e);
      const next = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, k * Math.exp(-e.deltaY * 0.0015)),
      );
      // Zoom about the cursor: keep the world point under it fixed.
      tx = p.x - ((p.x - tx) / k) * next;
      ty = p.y - ((p.y - ty) / k) * next;
      k = next;
      needsDraw = true;
    },
    { passive: false, signal },
  );

  canvas.style.cursor = "grab";
  canvas.style.touchAction = "none";

  /** Zoom about the viewport center, eased over a few frames. */
  function zoomBy(factor: number) {
    const from = zoomAnim ? zoomAnim.to : k;
    const to = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, from * factor));
    if (prefersReducedMotion()) {
      zoomAbout(to, width / 2, height / 2);
      return;
    }
    zoomAnim = { from: k, to, cx: width / 2, cy: height / 2, start: performance.now() };
  }

  function resetView() {
    fitView();
    reheat();
  }

  /** Bring a node into frame, but only if it has left it — a reader walking
   *  the node list along one cluster must not have the whole constellation
   *  jump under them at every step. */
  function ensureVisible(n: SimNode): void {
    if (width === 0 || height === 0) return;
    const sx = n.x * k + tx;
    const sy = n.y * k + ty;
    const pad = 80;
    if (sx >= pad && sx <= width - pad && sy >= pad && sy <= height - pad) return;
    tx = width / 2 - n.x * k;
    ty = height / 2 - n.y * k;
    viewCentered = true;
  }

  function setFocus(id: string | null): void {
    const node = id === null ? null : (byId.get(id) ?? null);
    if (node === focused) return;
    focused = node;
    if (node) ensureVisible(node);
    needsDraw = true;
  }

  return {
    setData,
    setOptions,
    visibleCount: () => nodes.length,
    zoomBy,
    resetView,
    setFocus,
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeObserver.disconnect();
      abort.abort();
      // The edge layer is a second full-size bitmap (about 20 MB at 2× on a
      // 1440 pane). Toggling the graph view is a thing readers do repeatedly,
      // so hand it back rather than waiting for a collection.
      edgeCanvas.width = 0;
      edgeCanvas.height = 0;
    },
  };
}
