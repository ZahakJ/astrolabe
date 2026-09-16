// ```mermaid FENCES, DRAWN — the one module that imports mermaid.
//
// Mermaid is the largest thing in the tree after the book reader (the parser
// alone is a megabyte), and a note with a diagram in it is rare, so it is
// reached only through `import("./mermaid.ts")` from the fence branch of
// render.ts, at the moment a fence is met, and scripts/check-bundle.mjs
// forbids it from every first paint. The fence's DECISION is synchronous
// (it is a mermaid fence; the host is in the tree at once with the source
// inside it); the DRAWING is not — the tracker's rule, and KaTeX's.
//
// THEME-AWARE, FROM THE TOKENS. Mermaid's own themes are somebody else's
// palette; "base" with themeVariables read off the live custom properties
// (`--bg-raised`, `--text`, `--accent`, `--border`) is the app's room, in
// whichever of the twenty-two rooms the reader is sitting. A theme flip
// redraws every diagram on screen: the root's `data-theme` is watched, and
// so is the system's own dark/light preference for the reader who left the
// theme on "system".
//
// NOTHING IS FETCHED. `securityLevel: "strict"` keeps click handlers and
// script out of the SVG; the font is the app's own stack; no icon pack is
// registered, so an `architecture` diagram naming one draws the fallback
// glyph rather than asking the network for it. A visitor's page makes no
// request it did not make before this module existed.

import mermaid from "mermaid";
import { t } from "../i18n.ts";

/** Every host on screen and the source it was drawn from, so a theme flip
 *  can redraw them. Weak by host: a note that closed takes its hosts away. */
const live = new Map<HTMLElement, string>();
let counter = 0;
let configuredFor = "";

function isDark(): boolean {
  return getComputedStyle(document.documentElement).colorScheme.includes("dark");
}

/** The themeVariables for the room on screen — read live, never cached,
 *  because a custom theme's override sheet can change any of them. */
function configure(): void {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
  const dark = isDark();
  const key = `${document.documentElement.getAttribute("data-theme") ?? ""}|${document.documentElement.getAttribute("data-custom-theme") ?? ""}|${dark}`;
  if (key === configuredFor) return;
  configuredFor = key;
  const text = v("--text", dark ? "#e6edf3" : "#33291a");
  const raised = v("--bg-raised", dark ? "#161b22" : "#f7f2e6");
  const accent = v("--accent", "#c9a227");
  const border = v("--border", dark ? "#30363d" : "#d8cfb8");
  const muted = v("--text-muted", dark ? "#8b949e" : "#6b5f48");
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: v("--font-ui", "system-ui, sans-serif"),
    themeVariables: {
      darkMode: dark,
      background: raised,
      primaryColor: raised,
      primaryTextColor: text,
      primaryBorderColor: border,
      secondaryColor: v("--bg-hover", raised),
      secondaryTextColor: text,
      secondaryBorderColor: border,
      tertiaryColor: v("--bg", raised),
      tertiaryTextColor: text,
      tertiaryBorderColor: border,
      lineColor: muted,
      textColor: text,
      mainBkg: raised,
      nodeBorder: border,
      clusterBkg: v("--bg", raised),
      clusterBorder: border,
      titleColor: text,
      edgeLabelBackground: raised,
      actorBkg: raised,
      actorBorder: accent,
      actorTextColor: text,
      actorLineColor: muted,
      signalColor: text,
      signalTextColor: text,
      labelBoxBkgColor: raised,
      labelBoxBorderColor: border,
      labelTextColor: text,
      loopTextColor: text,
      noteBkgColor: v("--accent-soft", raised),
      noteTextColor: text,
      noteBorderColor: accent,
      activationBkgColor: v("--accent-soft", raised),
      activationBorderColor: accent,
      sectionBkgColor: v("--bg-hover", raised),
      altSectionBkgColor: raised,
      sectionBkgColor2: v("--accent-soft", raised),
      taskBkgColor: accent,
      taskBorderColor: accent,
      taskTextColor: dark ? "#111" : "#fff",
      taskTextLightColor: text,
      taskTextOutsideColor: text,
      gridColor: border,
      doneTaskBkgColor: v("--bg-hover", raised),
      doneTaskBorderColor: border,
      pie1: accent,
      pie2: muted,
      pie3: border,
      pieTitleTextColor: text,
      pieSectionTextColor: text,
      pieLegendTextColor: text,
      pieStrokeColor: raised,
      pieOuterStrokeColor: border,
      errorBkgColor: v("--danger", "#b23a3a"),
      errorTextColor: "#fff",
    },
  });
}

/** Draw `src` into `host`. The host keeps its source (as a <pre>) until
 *  the picture is ready, and keeps it forever when the source will not
 *  parse — an unparseable diagram must read as its own text rather than
 *  vanish, which is the $$-math rule the whole renderer follows. */
export async function renderMermaidInto(host: HTMLElement, src: string): Promise<void> {
  live.set(host, src);
  ensureWatch();
  await draw(host, src);
}

async function draw(host: HTMLElement, src: string): Promise<void> {
  configure();
  const id = `s-mmd-${++counter}`;
  try {
    // Parsed first: `render` on bad input inserts an error picture of its
    // own into the document, which is exactly the thing this must not show.
    await mermaid.parse(src);
    const out = await mermaid.render(id, src);
    if (!live.has(host) || live.get(host) !== src) return; // redrawn or gone
    host.innerHTML = out.svg;
    host.classList.remove("s-rv-mermaid--pending", "s-rv-mermaid--error");
    const svg = host.querySelector("svg");
    if (svg) {
      svg.removeAttribute("height");
      // Mermaid draws at `width="100%"` inside a `max-width` of the
      // picture's own size, so a three-node chart stays three nodes wide.
      // Keep that natural width as the cap and add the column's: a `100%`
      // alone would scale a small diagram up to the column (a two-box
      // Arabic flowchart came out nine hundred pixels tall).
      const natural = parseFloat(svg.style.maxWidth) || parseFloat(svg.getAttribute("viewBox")?.split(/\s+/)[2] ?? "");
      svg.style.maxWidth = Number.isFinite(natural) && natural > 0 ? `min(${Math.ceil(natural)}px, 100%)` : "100%";
      svg.setAttribute("role", "img");
      if (!svg.hasAttribute("aria-label")) svg.setAttribute("aria-label", t("mermaidDiagram"));
    }
  } catch {
    host.classList.remove("s-rv-mermaid--pending");
    host.classList.add("s-rv-mermaid--error");
    host.title = t("mermaidInvalid");
    // The stray element mermaid may have left behind for its error picture.
    document.getElementById(`d${id}`)?.remove();
  }
}

let watching = false;

function ensureWatch(): void {
  if (watching) return;
  watching = true;
  const redraw = (): void => {
    for (const host of [...live.keys()]) {
      if (!host.isConnected) {
        live.delete(host);
        continue;
      }
      void draw(host, live.get(host) ?? "");
    }
  };
  new MutationObserver(redraw).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "data-custom-theme"],
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
}
