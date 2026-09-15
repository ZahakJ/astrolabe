// The palette's way of asking the shelf for something: "study what is due",
// "new deck", "import". A tiny first-paint module — the palette is
// in the entry chunk and the shelf is lazy, so the name of the event lives
// here where both can import it without one pulling the other in. The last
// ask is kept so a shelf that is only now mounting can answer it.

export const ORBITS_ASK_EVENT = "astrolabe:orbits-ask";

export type OrbitsAsk = "study" | "new" | "import";

let pending: OrbitsAsk | null = null;

export function askOrbits(ask: OrbitsAsk): void {
  pending = ask;
  window.dispatchEvent(new CustomEvent(ORBITS_ASK_EVENT, { detail: { ask } }));
}

/** The shelf's half: the ask not yet answered, taken once. */
export function takeOrbitsAsk(): OrbitsAsk | null {
  const ask = pending;
  pending = null;
  return ask;
}
