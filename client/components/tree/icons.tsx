// The notes tree's glyphs: an attachment's kind, and the header's three
// buttons. Moved out of client/components/Sidebar.tsx unchanged.

import type { AttachmentKind } from "../../../shared/types.ts";

// ── Attachment type glyphs ──────────────────────────────────────────────────
// One 14px mark per kind, so a row says what it holds before it is opened.

function IconImage() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="M21 16l-5-5-6 6-2-2-5 5" />
    </svg>
  );
}

/** A book in the tree. One glyph for both formats, because what the marker
 *  tells the reader is where a click goes — the reader — and a `.pdf` and a
 *  `.epub` go to the same place. */
function IconBook() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 16.5h4" />
    </svg>
  );
}

function IconAudio() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 17V6l9-2v11" />
      <circle cx="7" cy="17.5" r="3" />
      <circle cx="16" cy="15.5" r="3" />
    </svg>
  );
}

function IconVideo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="M17 10l4-2.5v9L17 14z" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function IconDrawing() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l4-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5 16z" />
      <path d="M13.5 6.5l3 3" />
      <path d="M3 20h6" />
    </svg>
  );
}

export function IconClip() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5l-8.8 8.8a5 5 0 0 1-7.1-7.1l9.2-9.2a3.3 3.3 0 0 1 4.7 4.7l-9.2 9.2a1.7 1.7 0 0 1-2.4-2.4l8.3-8.3" />
    </svg>
  );
}

export function AttachmentGlyph({ kind }: { kind: AttachmentKind }) {
  return (
    <span className="s-tree__glyph">
      {kind === "image" ? (
        <IconImage />
      ) : kind === "book" ? (
        <IconBook />
      ) : kind === "audio" ? (
        <IconAudio />
      ) : kind === "video" ? (
        <IconVideo />
      ) : (
        <IconFile />
      )}
    </span>
  );
}

export function IconNewNote() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 12v6M9 15h6" />
    </svg>
  );
}

export function IconCollapseAll() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 10l5-5 5 5" />
      <path d="M7 19l5-5 5 5" />
    </svg>
  );
}

export function IconNewFolder() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <path d="M12 10v6M9 13h6" />
    </svg>
  );
}
