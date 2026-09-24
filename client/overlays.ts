// THE LAYERS THAT MOUNT THEMSELVES — the theme picker, the site designer,
// the what's-new deck, the tour, the attachment viewer — say so here.
//
// Each of them is opened by a function call from anywhere (a palette row, a
// More row, a status-bar glyph) and draws on its own root on <body>, outside
// either shell's tree; the store never hears of them. On a desktop that is
// fine: Escape and their own ✕ close them. On a phone the way out is Back, and
// Back is history — so a layer nobody knew was up was a layer Back walked
// straight past, popping the screen underneath while the picker stayed on top
// (the audit listed all five).
//
// So an overlay announces itself: `announceOverlay(id, close)` when it opens,
// and the returned function when it closes by its own hand. The phone shell
// (client/phone/PhoneShell.tsx) subscribes: an announced overlay takes a
// history entry, Back calls its `close`, and its own ✕ gives the entry back.
// The desktop does not subscribe, and for it this module is a list nobody
// reads. Deliberately tiny — it is imported by first-paint code.

export interface Overlay {
  id: string;
  /** Close it the way its own ✕ would. */
  close: () => void;
}

type Listener = (up: readonly Overlay[]) => void;

let up: Overlay[] = [];
const listeners = new Set<Listener>();

function emit(): void {
  const now = [...up];
  for (const fn of [...listeners]) fn(now);
}

/** An overlay is on screen. Returns the call to make when it leaves by its
 *  own hand (idempotent; a `close` that came from Back may call it too). */
export function announceOverlay(id: string, close: () => void): () => void {
  const entry: Overlay = { id, close };
  up = [...up.filter((o) => o.id !== id), entry];
  emit();
  return () => {
    if (!up.includes(entry)) return;
    up = up.filter((o) => o !== entry);
    emit();
  };
}

export function overlaysUp(): readonly Overlay[] {
  return up;
}

export function subscribeOverlays(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
