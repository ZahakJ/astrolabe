// THE PERFORMANCE GATE — five surfaces, measured, with budgets.
//
//   npm run build && npm run check-perf
//   (CHROMIUM=/usr/bin/chromium uses a system browser instead of a downloaded one)
//
// Every other gate here holds a promise the product makes about what it DOES.
// This one holds the promise it makes about how it FEELS, and it exists
// because that promise is the one that decays invisibly: no screenshot shows
// a keystroke arriving a frame later, no test fails when a first paint gains
// two hundred milliseconds, and nobody notices on the seed vault — the vault
// where it shows is the one with two thousand notes in it, which is the vault
// nobody runs the suite against.
//
// So the gate brings its own vault. `scripts/perf-fixture.mjs` generates it
// from a fixed seed — 2,000 notes with links, tags and frontmatter, a
// 3,000-line note, a note with fifty embeds — and this script starts its own
// server over it, on its own port, with its own throwaway data directory.
// Nothing is measured against the owner's vault and nothing can be: the gate
// never takes a vault path, and the fixture reads nobody's disk unless
// `ASTROLABE_SEED_VAULT` names one. That is also why the numbers below mean
// the same thing on another machine — a fixture that quietly folded in a real
// folder would be measuring a folder that grows.
//
// WHAT IT MEASURES, and why these:
//
//   · FIRST PAINT of the admin app. The moment anything is on screen. It is
//     the number a code-split boundary quietly undoes — one careless static
//     import and the shell downloads a surface it cannot reach.
//   · TYPING LATENCY in the 3,000-line note, as the browser's own Event
//     Timing reports it: hardware keydown to the paint that shows the letter.
//     Not a frame counter and not a wrapper's stopwatch — the number the
//     typist feels. Caret at line ~1,500, because typing at line 1 of a long
//     note measures a short note.
//   · READING RENDER of that same note: Ctrl/Cmd E to the rendered column.
//     The one operation in the product whose cost is the whole document, all
//     at once, with no viewport to hide behind.
//   · THE SIGILS PAGE and THE CALENDAR PAGE: the status bar's door to the
//     drawn page. The two surfaces whose cost is the whole YEAR at once —
//     twelve sigils with most of a year of log each (a streak, a heatmap and
//     a week per card), and a month grid whose every day reads the daily
//     notes, the sigils' logs and the trackers.
//
// THE BROWSER IS THROTTLED TO A QUARTER SPEED (Lighthouse's own mid-tier
// multiplier). A developer's desktop with nothing else running is not the
// machine anyone reads on, and on an unthrottled localhost every surface
// lands inside one frame — there is no headroom left in which a regression
// could show. Throttling is also what makes the numbers repeatable between
// machines: they are dominated by work, not by clock speed.
//
// EACH NUMBER IS THE BEST OF SEVERAL ROUNDS, not the average — see `best()`.
// Other work on the machine can only make a round slower, so the fastest round
// is the one closest to the cost of the work itself, and a gate built on the
// average is a gate that fails because somebody started a build.
//
// BUDGETS are that number plus honest slack, and they move the way
// check-bundle's do: by the actual overage, with the cause written beside
// them, or DOWN when a round earns it.

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixtureVault, EMBED_NOTE, LONG_NOTE, LONG_NOTE_LINES, FIXTURE_NOTES, FIXTURE_SIGILS } from "./perf-fixture.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CPU = Number(process.env.PERF_CPU || 4);
const ROUNDS = Number(process.env.PERF_ROUNDS || 3);
const KEEP = process.env.PERF_KEEP === "1";

/** The two surface budgets, set from their first measurement: best of nine
 *  warm opens over three rounds at 4×, on the fixture's twelve generated
 *  sigils and year of daily notes, under a load average of 9 (the ordinary
 *  state of the machine this is developed on). The rule is the one the rows
 *  above follow — the loaded measurement plus a third, rounded up to the next
 *  50 ms — and the measured numbers stay here so a later move can say what
 *  it moved. Spread of the nine: Sigils 1,241–1,449 ms, Calendar 157–201 ms. */
const SIGILS_MEASURED = 1241;
const SIGILS_BUDGET = 1650;
const CALENDAR_MEASURED = 157;
const CALENDAR_BUDGET = 250;

/** The budgets. Each is in milliseconds, measured at `PERF_CPU`× throttling on
 *  the fixture vault, and each carries the run that set it. */
const BUDGETS = [
  {
    id: "firstPaint",
    label: "admin app first paint",
    budget: 1550,
    // 3.19 the performance purge: 936 ms on a quiet machine (median of five
    // loads), against 1,008 ms before; 1,316 ms best-of-four under a load
    // average of 17, which is the ordinary state of the machine this is
    // developed on. The budget covers the loaded case, and it is deliberately
    // the LOOSEST of the four.
    //
    // Say plainly what it is and is not: first paint here is dominated by the
    // entry chunk and by whatever else the machine is doing, and most of what
    // the purge moved is BYTES rather than milliseconds — the outline pane
    // went behind a lazy boundary and took 503 kB out of an admin's first
    // request, which over a loopback socket with no latency converts into only
    // the 7% above. For that failure `npm run check-bundle` is the sharper
    // instrument, and this is the ceiling underneath it: it catches the
    // version where the shell becomes so heavy that it is slow even here.
  },
  {
    id: "typingMedian",
    label: "keypress → paint, 3,000-line note (median)",
    budget: 40,
    // 24 ms measured over 120 keystrokes on a quiet machine, against 32 ms
    // before; anything at or under two frames (33 ms) reads as instant. The
    // budget is two and a half frames rather than two, because a loaded run
    // measured the median at 32: a median is a coarse instrument here, and the
    // sharp one is the long-task budget below, which the same load moved by a
    // third while the purge moved it by two thirds.
  },
  {
    id: "typingP95",
    label: "keypress → paint, 3,000-line note (p95)",
    budget: 64,
    // The tail is what a typist actually notices — one letter in twenty
    // arriving late is a stutter, and a median alone would hide it. 32 ms
    // measured after the purge on a quiet machine, against 48 ms before it,
    // and the main thread's long-task time over a 40-key burst fell 571 ms →
    // 184 ms.
    //
    // 64, not 48, because two runs under a load average of 16–17 best-of-three
    // landed at 48 ms and 56 ms — a budget a passing run touches exactly is a
    // budget that fails tomorrow for no reason, and a gate nobody trusts is a
    // gate nobody runs. Four frames is still half of what a 3,000-line note
    // cost before the purge's worst case (112 ms).
  },
  {
    id: "typingLongTasks",
    label: "long-task time on the main thread, 40 keystrokes",
    budget: 340,
    // THE SENSITIVE ONE, and the reason it is here: a long task is main-thread
    // time in which nothing at all can happen — no keystroke, no scroll, no
    // paint — so its total over a fixed burst measures the WORK a keystroke
    // causes rather than which side of a frame boundary the work happened to
    // land on. It is what the purge actually moved: 571 ms → 184 ms over the
    // same forty keys, a threefold gap, where the median moved by a third.
    //
    // 340 is the loaded measurement plus slack; load would have to nearly
    // double it to fail on its own, while a per-keystroke pass that went
    // O(document) again would pass 571 ms and break it immediately.
  },
  {
    id: "readingRender",
    label: "reading view render, 3,000-line note",
    budget: 1400,
    // 1,081 ms measured over nine renders, against 1,673 ms before. The floor
    // here is the browser laying out six thousand nodes of prose, which no
    // amount of JavaScript discipline removes; the budget guards the
    // JavaScript above it, where the whole-vault walk per wikilink lived.
  },
  {
    id: "sigilsOpen",
    label: "Sigils page, door → twelve cards drawn",
    budget: SIGILS_BUDGET,
    // SIGILS_MEASURED (1,241 ms), best of the warm opens (the first also
    // fetches the page's chunk), plus a third: a loaded machine passes and a
    // card that went O(log × days) per render again does not.
  },
  {
    id: "calendarOpen",
    label: "Calendar page, door → the month drawn",
    budget: CALENDAR_BUDGET,
    // CALENDAR_MEASURED (157 ms), the same way and with the same headroom:
    // the month with its lines and its daily-note dots, not the empty grid.
  },
];

const FAIL = [];
const fail = (msg) => {
  console.error(`  FAIL  ${msg}`);
  FAIL.push(msg);
};

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const p95 = (a) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * 0.95))];

/** BEST OF N, not the average of N — the standard way to benchmark on a
 *  machine that is also doing something else. Background load can only ever
 *  make a round SLOWER, so the fastest round is the one closest to the cost of
 *  the work itself; an average or a median mixes in whatever else the machine
 *  was doing and turns a gate into a coin toss. A real regression raises the
 *  floor as well as the ceiling, so it is still caught.
 *
 *  It is not a cure for SUSTAINED load, and the budgets below do not pretend
 *  otherwise. Measured: inside one run under a load average of 17 the four
 *  first-paint rounds spread 1,316–1,708 ms, and the minimum is the least
 *  contended of them — but on a quiet machine the same minimum was 872 ms.
 *  Hence the first-paint budget is the loose one, and check-bundle carries
 *  the sharp version of the same promise in bytes, which load cannot move. */
const best = (a) => Math.min(...a);

/** A port nothing is listening on, asked for by binding to 0. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error(
    "check-perf: playwright is not installed.\n" +
      "  npm i -D playwright   (or set CHROMIUM=/path/to/chromium after installing the library)",
  );
  process.exit(1);
}

// The built client, because a dev-server build is a different program: no
// minification, no code splitting, and a first-paint number that means
// nothing.
try {
  await fs.stat(path.join(ROOT, "dist", "index.html"));
} catch {
  console.error("check-perf: no dist/index.html — run `npm run build` first.");
  process.exit(1);
}

// ── the fixture, and a server over it ───────────────────────────────────────
const workDir = process.env.PERF_DIR || (await fs.mkdtemp(path.join(os.tmpdir(), "astrolabe-perf-")));
const vaultDir = path.join(workDir, "vault");
const dataDir = path.join(workDir, "data");
await fs.mkdir(dataDir, { recursive: true });
const fixture = await buildFixtureVault(vaultDir);

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
// NO `ADMIN_PASSWORD_HASH`: bound to loopback with no hash the server runs in
// open local mode, so the gate needs no secret and can never be pointed at a
// protected instance by accident.
const server = spawn("node", ["server/index.ts"], {
  cwd: ROOT,
  env: {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    ASTROLABE_VAULT: vaultDir,
    ASTROLABE_DATA: dataDir,
    PUBLIC: "true",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
const bootT0 = Date.now();
server.stdout.on("data", (c) => (serverLog += c.toString()));
server.stderr.on("data", (c) => (serverLog += c.toString()));

let up = false;
const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  try {
    const res = await fetch(`${base}/api/me`);
    if (res.ok) {
      up = true;
      break;
    }
  } catch {
    // not listening yet
  }
  await new Promise((r) => setTimeout(r, 200));
}
const bootMs = Date.now() - bootT0;

async function stop() {
  server.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 500));
  if (!KEEP && !process.env.PERF_DIR) await fs.rm(workDir, { recursive: true, force: true });
}

if (!up) {
  console.error(`check-perf: the scratch server never answered on ${base}\n${serverLog.slice(-2000)}`);
  await stop();
  process.exit(1);
}

const indexed = /indexed (\d+) notes[^\n]*in (\d+)ms/.exec(serverLog);
console.log(
  `check-perf: ${fixture.notes} generated notes + a ${LONG_NOTE_LINES}-line note` +
    (fixture.book ? " + a 665-page book" : "") +
    `, served at ${base}`,
);
if (indexed) console.log(`  indexer cold start        ${indexed[2]} ms over ${indexed[1]} notes  (process → serving ${bootMs} ms)`);
console.log(`  CPU throttling            ${CPU}×   ·   rounds ${ROUNDS}`);

// ── the browser ─────────────────────────────────────────────────────────────
const executablePath = process.env.CHROMIUM;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

async function context() {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // The worker would race the measurement for the main thread and serve the
    // second round from cache, which is not what a first paint is.
    serviceWorkers: "block",
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("astrolabe.whatsnewSeen", "9.9.9");
      localStorage.setItem("astrolabe.prefs-sync-off", "1");
    } catch {
      // private window or blocked storage — the deck may open; harmless here
    }
  });
  return ctx;
}

/** One cold load of the admin app: first contentful paint, and the end of the
 *  last long task, which is the honest approximation of time-to-interactive —
 *  a long task is the only thing that actually makes a page unresponsive. */
async function measureFirstPaint() {
  const ctx = await context();
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__long = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__long.push(e.startTime + e.duration);
      }).observe({ type: "longtask", buffered: true });
    } catch {
      // no long-task observer: TTI falls back to DOMContentLoaded below
    }
  });
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  const t0 = Date.now();
  await page.goto(base, { waitUntil: "load" });
  // The shell is READY when the vault is on screen — the tree's first row.
  // First paint is earlier and is its own number; this is the one a reader
  // would call "it opened".
  await page.waitForSelector(".s-tree__item", { timeout: 60000 });
  const shell = Date.now() - t0;
  await page.waitForTimeout(4000);
  const out = await page.evaluate(() => {
    const paint = performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint");
    const nav = performance.getEntriesByType("navigation")[0];
    const long = window.__long ?? [];
    const fcp = paint ? paint.startTime : 0;
    const js = performance.getEntriesByType("resource").filter((r) => r.name.includes(".js"));
    return {
      fcp,
      tti: Math.max(fcp, long.length ? Math.max(...long) : nav ? nav.domContentLoadedEventEnd : fcp),
      // Only what the browser fetched BEFORE anything was on screen. Counting
      // every chunk of the session would count the editor, the reading view
      // and the outline — which are lazy on purpose and arrive later.
      chunksBefore: js.filter((r) => r.responseEnd <= fcp).length,
      chunksAll: js.length,
      bytesBefore: js.filter((r) => r.responseEnd <= fcp).reduce((s, r) => s + (r.transferSize || 0), 0),
    };
  });
  await ctx.close();
  return { ...out, shell };
}

/** Typing in the long note, and then rendering it. One page for both, because
 *  opening a 3,000-line note is the expensive part and doing it twice would
 *  double the gate for nothing. */
async function measureNote() {
  const ctx = await context();
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await page.goto(`${base}/${encodeURIComponent(LONG_NOTE.replace(/\.md$/, ""))}`, { waitUntil: "load" });
  await page.waitForSelector(".cm-content", { timeout: 90000 });
  await page.waitForTimeout(4000);

  // Event Timing: `duration` runs from the hardware event to the paint that
  // shows its effect. Nothing measured off requestAnimationFrame can be finer
  // than a frame, and a frame is most of the budget.
  await page.evaluate(() => {
    window.__ev = [];
    window.__lt = [];
    window.__evObs = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name === "keydown") window.__ev.push(e.duration);
    });
    window.__evObs.observe({ type: "event", durationThreshold: 0 });
    // Main-thread time in which nothing can happen. Its TOTAL over the burst
    // is the budget; the individual tasks are not interesting on their own.
    window.__ltObs = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lt.push(e.duration);
    });
    window.__ltObs.observe({ type: "longtask" });
  });
  await page.click(".cm-content");
  await page.keyboard.press("Control+End");
  await page.waitForTimeout(400);
  // Into the middle of the document: typing at line 1 of a long note is a
  // short note's measurement.
  for (let i = 0; i < 300; i++) await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    window.__ev.length = 0;
    window.__lt.length = 0;
  });
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("a");
    await page.waitForTimeout(55);
  }
  await page.waitForTimeout(1000);
  const { keys, longTasks } = await page.evaluate(() => ({
    keys: window.__ev.slice(),
    longTasks: window.__lt.reduce((sum, d) => sum + d, 0),
  }));

  // …and the reading view of the same note. Three toggles, because the first
  // one also fetches the chunk.
  const renders = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    await page.keyboard.press("Control+e");
    await page.waitForSelector(".s-reading__content", { timeout: 90000 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    renders.push(Date.now() - t0);
    await page.keyboard.press("Control+e");
    await page.waitForSelector(".cm-content", { timeout: 90000 });
    await page.waitForTimeout(500);
  }
  await ctx.close();
  return { keys, longTasks, render: renders.slice(1) };
}

/** The status bar's door to a page, timed to the page DRAWN — `ready` is the
 *  page's own evidence that it has its content, then two frames so the paint
 *  is in. Four opens, the first discarded (it also fetches the chunk), each
 *  closed again through the same door. */
async function measureSurfaces() {
  const ctx = await context();
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await page.goto(base, { waitUntil: "load" });
  await page.waitForSelector(".s-tree__item", { timeout: 60000 });
  await page.waitForTimeout(4000);
  const surfaces = [
    {
      door: '[data-testid="sigils-door"]',
      page: '[data-testid="routines-page"]',
      ready: (n) => document.querySelectorAll('[data-testid="routines-page"] .s-routines__slot > *').length >= n,
      arg: FIXTURE_SIGILS,
    },
    {
      door: '[data-testid="calendar-door"]',
      page: '[data-testid="calendar-page"]',
      // The month with its CONTENT: the sigils' lines and the daily notes' dots
      // arrive after the grid, and a grid with nothing in it is the cheap half.
      ready: () => document.querySelectorAll('[data-testid="calendar-page"] .s-calpage__line').length > 20 && document.querySelectorAll('[data-testid="calendar-page"] .s-calpage__notedot').length >= 28 && !!document.querySelector('[data-testid="calendar-day"]'),
      arg: 0,
    },
  ];
  const out = [];
  for (const surface of surfaces) {
    const times = [];
    for (let i = 0; i < 4; i++) {
      const t0 = Date.now();
      await page.click(surface.door);
      await page.waitForFunction(surface.ready, surface.arg, { timeout: 90000 });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      times.push(Date.now() - t0);
      await page.click(surface.door);
      await page.waitForSelector(surface.page, { state: "detached", timeout: 30000 });
      await page.waitForTimeout(600);
    }
    out.push(times.slice(1));
  }
  await ctx.close();
  return { sigils: out[0], calendar: out[1] };
}

const runs = { firstPaint: [], tti: [], shell: [], typingMedian: [], typingP95: [], typingLongTasks: [], readingRender: [], sigilsOpen: [], calendarOpen: [], chunksBefore: [], chunksAll: [], bytesBefore: [] };
for (let round = 0; round < ROUNDS; round++) {
  const paint = await measureFirstPaint();
  runs.firstPaint.push(paint.fcp);
  runs.tti.push(paint.tti);
  runs.shell.push(paint.shell);
  runs.chunksBefore.push(paint.chunksBefore);
  runs.chunksAll.push(paint.chunksAll);
  runs.bytesBefore.push(paint.bytesBefore);
  const note = await measureNote();
  if (note.keys.length < 10) {
    fail(`round ${round + 1}: only ${note.keys.length} keystrokes were timed — the editor never took the keys`);
  } else {
    runs.typingMedian.push(median(note.keys));
    runs.typingP95.push(p95(note.keys));
    runs.typingLongTasks.push(note.longTasks);
  }
  runs.readingRender.push(...note.render);
  const surfaces = await measureSurfaces();
  runs.sigilsOpen.push(...surfaces.sigils);
  runs.calendarOpen.push(...surfaces.calendar);
}
await browser.close();

// ── the verdict ─────────────────────────────────────────────────────────────
const measured = {
  firstPaint: best(runs.firstPaint),
  typingMedian: best(runs.typingMedian),
  typingP95: best(runs.typingP95),
  typingLongTasks: best(runs.typingLongTasks),
  readingRender: best(runs.readingRender),
  sigilsOpen: best(runs.sigilsOpen),
  calendarOpen: best(runs.calendarOpen),
};

console.log("\ncheck-perf: budgets");
// Wide enough for the longest label there is, so the column of numbers is a
// column: a fixed 44 left one row hanging past it.
const LABEL_W = Math.max(...BUDGETS.map((b) => b.label.length));
for (const row of BUDGETS) {
  const value = measured[row.id];
  const over = value > row.budget;
  const line = `${row.label.padEnd(LABEL_W)} ${String(value.toFixed(0)).padStart(6)} ms  (budget ${row.budget} ms)`;
  if (over) fail(line);
  else console.log(`  ok    ${line}`);
}

console.log("\ncheck-perf: measured beside them (no budget)");
console.log(`  shell ready (the tree's first row)           ${best(runs.shell).toFixed(0)} ms`);
console.log(`  admin TTI (last long task)                   ${best(runs.tti).toFixed(0)} ms`);
console.log(`  spread across rounds (long tasks typing)     ${runs.typingLongTasks.map((x) => x.toFixed(0)).join(" / ")} ms`);
console.log(`  spread across rounds (first paint)           ${runs.firstPaint.map((x) => x.toFixed(0)).join(" / ")} ms`);
console.log(`  spread across rounds (reading render)        ${runs.readingRender.map((x) => x.toFixed(0)).join(" / ")} ms`);
console.log(`  spread across rounds (Sigils page)           ${runs.sigilsOpen.map((x) => x.toFixed(0)).join(" / ")} ms`);
console.log(`  spread across rounds (Calendar page)         ${runs.calendarOpen.map((x) => x.toFixed(0)).join(" / ")} ms`);
console.log(`  JS before first paint                        ${median(runs.chunksBefore).toFixed(0)} files, ${(median(runs.bytesBefore) / 1024).toFixed(0)} kB`);
console.log(`  JS in the first four seconds                 ${median(runs.chunksAll).toFixed(0)} files`);
if (indexed) console.log(`  indexer cold start (${indexed[1]} notes)             ${indexed[2]} ms`);

await stop();

if (FAIL.length > 0) {
  console.error(
    `\ncheck-perf: ${FAIL.length} budget${FAIL.length === 1 ? "" : "s"} broken.\n` +
      "  A budget moves by the ACTUAL overage, with the cause written beside it in\n" +
      "  scripts/check-perf.mjs — never to whatever number today happened to produce.\n" +
      "  Measure on a quiet machine first: a build running beside this one is not a regression.",
  );
  process.exit(1);
}
console.log(`\nPERF OK  (${FIXTURE_NOTES} notes, ${LONG_NOTE_LINES}-line note, ${EMBED_NOTE} beside it)\n`);
