// A sheet a CHILD opens rather than the shell — the calendar's day pane is
// the case: CalendarView decides when a day is picked, and hands its pane to
// the phone to wrap (calendar/CalendarView.tsx `dayHost`). The wrapper still
// owes the phone's promise, a history entry, so it takes one on mount and
// tells its owner when the entry is gone — however it went: the ✕, a drag,
// the scrim, or the OS back gesture.

import { useEffect, useRef, type ReactNode } from "react";
import { usePhone } from "./context.ts";
import Sheet, { type Detent } from "./Sheet.tsx";

export default function RoutedSheet({ id, label, header, detent = "half", onGone, children }: { id: string; label: string; header?: ReactNode; detent?: Detent; onGone: () => void; children: ReactNode }) {
  const phone = usePhone();
  const phoneRef = useRef(phone);
  phoneRef.current = phone;
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
    else if (seen.current) onGone();
  }, [up, onGone]);

  if (!up) return null;
  return (
    <Sheet label={label} header={header} detent={detent} side={phone.tablet} onDismiss={() => phone.closeSheet(id)}>
      {children}
    </Sheet>
  );
}
