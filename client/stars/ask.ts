// The palette's way of asking the shelf for something: "study what is due",
// "new constellation", "import". A tiny first-paint module — the palette is
// in the entry chunk and the shelf is lazy, so the name of the event lives
// here where both can import it without one pulling the other in. The last
// ask is kept so a shelf that is only now mounting can answer it.

export const STARS_ASK_EVENT = "astrolabe:stars-ask";

export type StarsAsk = "study" | "new" | "import";

let pending: StarsAsk | null = null;

export function askStars(ask: StarsAsk): void {
  pending = ask;
  window.dispatchEvent(new CustomEvent(STARS_ASK_EVENT, { detail: { ask } }));
}

/** The shelf's half: the ask not yet answered, taken once. */
export function takeStarsAsk(): StarsAsk | null {
  const ask = pending;
  pending = null;
  return ask;
}
