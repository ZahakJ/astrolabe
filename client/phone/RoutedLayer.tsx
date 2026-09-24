// A LAYER THAT DRAWS ITSELF, WITH THE PHONE'S PROMISE. The desktop's forms
// that a phone screen still raises as they are — New sigil, New deck, a
// tracker's edit form — bring their own overlay and their own ✕. What they do
// not bring is a history entry, so Back walked past them to the screen below.
// This takes one on mount (a sheet id in the nav, drawing nothing), gives it
// back when the layer closes itself, and closes the layer when the entry goes
// by Back. It draws into the shell's sheet host, the one part of the page the
// shell never makes inert. RoutedSheet is the same promise for a pane that wants the Sheet's
// own chrome.

import { Suspense, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePhone } from "./context.ts";

export default function RoutedLayer({ id, onGone, children }: { id: string; onGone: () => void; children: ReactNode }) {
  const phone = usePhone();
  const phoneRef = useRef(phone);
  phoneRef.current = phone;
  const gone = useRef(onGone);
  gone.current = onGone;
  const seen = useRef(false);
  const up = phone.state.sheets.includes(id);

  useEffect(() => {
    phoneRef.current.openSheet(id);
    return () => {
      if (phoneRef.current.state.sheets.includes(id)) phoneRef.current.closeSheet(id);
    };
  }, [id]);

  useEffect(() => {
    if (up) seen.current = true;
    else if (seen.current) gone.current();
  }, [up]);

  // Into the sheet layer, not in place: while any entry of the kind is up the
  // shell makes everything under the sheets INERT, and a form drawn inside
  // the screen that raised it would be inert with the screen.
  return createPortal(<Suspense fallback={null}>{children}</Suspense>, layerHost());
}

/** Where a phone layer draws: the shell's sheet host, which is never inert. */
export function layerHost(): HTMLElement {
  return document.querySelector<HTMLElement>(".s-ph__sheets") ?? document.body;
}
