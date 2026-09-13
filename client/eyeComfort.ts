// EASY ON THE EYES — a warm, dimmer screen, per device.
//
// The owner, on a bright day in a light room: "I did light mode which is nice
// but almost blinds me. I wonder if something like reading mode or eink or
// some way to disable blue light like we do on some phones is possible here?"
// It is, and it is the phone's own trick: a phone's night light does not
// repaint every app, it lays an amber sheet over the whole screen. So this
// lays one over the whole page. Two numbers, both of the SCREEN and not of the
// vault:
//
//   · warmth 0–100: an amber layer blended with `multiply`, so white paper
//     turns the colour of a page under a reading lamp and every blue in the
//     chrome loses its edge. At 0 there is no layer at all.
//   · dim 0–70: a black layer at that opacity, for the screen whose lowest
//     brightness is still too bright. Capped at 70 because past it the text
//     goes with the glare.
//
// Per device, like the theme and the editor's measure (client/editorWidth.ts),
// and DELIBERATELY NOT in prefsSync's TRAVELS list: a warm tint belongs to
// one panel in one room, and the phone already has its own night light. It
// is not a theme either — a theme is forty-six declarations about ink and
// paper; this is one sheet that any of them can sit under, which is exactly
// why it is not the forty-seventh room.
//
// Applied before the first paint from main.tsx, as an element of its own
// rather than a React node: the blog reader, the admin shell and the designer
// preview all live under it, and it must be there before any of them mounts.

export const WARMTH_KEY = "astrolabe.warmth";
export const DIM_KEY = "astrolabe.dim";
export const WARMTH_MAX = 100;
export const DIM_MAX = 70;
/** What the palette's toggle turns ON when nothing warmer has been chosen
 *  yet: a reading-lamp tint, plainly warm without being orange. */
export const WARMTH_DEFAULT_ON = 45;
export const EYE_COMFORT_EVENT = "astrolabe:eye-comfort";

/** A stored or typed level as a whole number inside [0, max]; anything that
 *  is not a number (or was never stored) reads as 0 — the sheet off. */
export function normalizeLevel(raw: unknown, max: number): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(0, Math.round(n)));
}

function read(key: string, max: number): number {
  try {
    return normalizeLevel(localStorage.getItem(key), max);
  } catch {
    return 0;
  }
}

export function readWarmth(): number {
  return read(WARMTH_KEY, WARMTH_MAX);
}

export function readDim(): number {
  return read(DIM_KEY, DIM_MAX);
}

function write(key: string, level: number): void {
  try {
    if (level === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, String(level));
  } catch {
    // storage unavailable — the sheet lasts the session
  }
}

const SHEET_ID = "s-eye-comfort";

/** The one sheet, made on first use and kept: two layers, warm and dim, each
 *  driven by a custom property the stylesheet reads (app.css `.s-eye`). */
function sheet(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById(SHEET_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = SHEET_ID;
  el.className = "s-eye";
  el.setAttribute("aria-hidden", "true");
  const warm = document.createElement("div");
  warm.className = "s-eye__warm";
  const dim = document.createElement("div");
  dim.className = "s-eye__dim";
  el.append(warm, dim);
  document.body.append(el);
  return el;
}

/** Paint the stored levels. Safe to call before React mounts and again on
 *  every change; with both levels at 0 the sheet is removed rather than left
 *  as an invisible full-screen layer the compositor still has to blend. */
export function applyEyeComfort(warmth: number = readWarmth(), dim: number = readDim()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (warmth === 0 && dim === 0) {
    document.getElementById(SHEET_ID)?.remove();
    delete root.dataset.eyeComfort;
    return;
  }
  const el = sheet();
  if (!el) return;
  el.style.setProperty("--eye-warmth", String(warmth / WARMTH_MAX));
  el.style.setProperty("--eye-dim", String(dim / 100));
  root.dataset.eyeComfort = "on";
}

export function setWarmth(raw: number): number {
  const level = normalizeLevel(raw, WARMTH_MAX);
  write(WARMTH_KEY, level);
  applyEyeComfort(level, readDim());
  window.dispatchEvent(new CustomEvent(EYE_COMFORT_EVENT));
  return level;
}

export function setDim(raw: number): number {
  const level = normalizeLevel(raw, DIM_MAX);
  write(DIM_KEY, level);
  applyEyeComfort(readWarmth(), level);
  window.dispatchEvent(new CustomEvent(EYE_COMFORT_EVENT));
  return level;
}

const LAST_WARMTH_KEY = "astrolabe.warmthLast";

/** The palette's one-key switch: off if warm, back to the level last used
 *  (or the default) if off. The last level is remembered so a reader who
 *  tuned the slider to 30 and pressed the command twice gets 30 back, not
 *  the default. Returns the level now in force. */
export function toggleWarmth(): number {
  const now = readWarmth();
  if (now > 0) {
    try {
      localStorage.setItem(LAST_WARMTH_KEY, String(now));
    } catch {
      // storage unavailable
    }
    return setWarmth(0);
  }
  let last = WARMTH_DEFAULT_ON;
  try {
    last = normalizeLevel(localStorage.getItem(LAST_WARMTH_KEY), WARMTH_MAX) || WARMTH_DEFAULT_ON;
  } catch {
    // storage unavailable
  }
  return setWarmth(last);
}
