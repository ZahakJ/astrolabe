// The phone shell's glyphs: one stroke family (24-unit box, 1.8 stroke,
// round joins), drawn inline so the shell's chunk carries no icon font and
// every glyph takes `currentColor`. Direction-bearing glyphs (back, chevron)
// are mirrored by phone.css under [dir="rtl"], not redrawn.

import type { ReactNode } from "react";

function Glyph({ size = 22, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const IconToday = () => (
  <Glyph>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Glyph>
);
export const IconNotes = () => (
  <Glyph>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M14 3v5h5M9 12h7M9 16h7" />
  </Glyph>
);
export const IconSearch = () => (
  <Glyph>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Glyph>
);
export const IconCalendar = () => (
  <Glyph>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Glyph>
);
export const IconMore = () => (
  <Glyph>
    <circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </Glyph>
);
export const IconBack = () => (
  <Glyph size={24}>
    <path d="M15 5l-7 7 7 7" />
  </Glyph>
);
export const IconChevron = () => (
  <Glyph size={18}>
    <path d="M9 6l6 6-6 6" />
  </Glyph>
);
export const IconFolder = () => (
  <Glyph>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Glyph>
);
export const IconFile = () => (
  <Glyph>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4" />
  </Glyph>
);
export const IconBook = () => (
  <Glyph>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 19V5M8 7h7" />
  </Glyph>
);
export const IconPencil = () => (
  <Glyph>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="m13.5 6.5 4 4" />
  </Glyph>
);
export const IconReader = () => (
  <Glyph>
    <path d="M2.5 6c3-1.5 6.5-1.5 9.5 1 3-2.5 6.5-2.5 9.5-1v13c-3-1.5-6.5-1.5-9.5 1-3-2.5-6.5-2.5-9.5-1z" />
    <path d="M12 7v13" />
  </Glyph>
);
export const IconPlus = () => (
  <Glyph>
    <path d="M12 5v14M5 12h14" />
  </Glyph>
);
export const IconSort = () => (
  <Glyph>
    <path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3" />
  </Glyph>
);
export const IconDots = () => (
  <Glyph>
    <circle cx="12" cy="5.5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="18.5" r="1.3" fill="currentColor" stroke="none" />
  </Glyph>
);
export const IconClose = () => (
  <Glyph>
    <path d="M6 6l12 12M18 6 6 18" />
  </Glyph>
);
export const IconUndo = () => (
  <Glyph size={20}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Glyph>
);
export const IconRedo = () => (
  <Glyph size={20}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </Glyph>
);
export const IconKeyboardDown = () => (
  <Glyph size={20}>
    <rect x="2.5" y="4" width="19" height="11" rx="2" />
    <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M7 11.5h10M9 19l3 2.5 3-2.5" />
  </Glyph>
);
export const IconSend = () => (
  <Glyph size={20}>
    <path d="M4 12h14M13 6l6 6-6 6" />
  </Glyph>
);
export const IconMic = () => (
  <Glyph size={20}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </Glyph>
);
export const IconCheck = () => (
  <Glyph size={18}>
    <path d="m5 12 5 5 9-10" />
  </Glyph>
);
export const IconImage = () => (
  <Glyph>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4 18 5.5-5.5 4 4 2.5-2.5 4 4" />
  </Glyph>
);
