// THE CHIP UNDER A SELECTION — "Read aloud", where the reader's finger or
// pointer already is (docs/read-aloud.md).
//
// The desktop editor has its selection menu; rendered prose has none, so a
// selection in the reading view, a book's text layer, an EPUB chapter or a
// blog post grows one small button below its last line — below, because the
// annotation button sits above it and Android's own selection callout does
// too. On the PHONE the editor has no selection menu either (a long press is
// Android's callout, and the heading's sheet), so there the chip answers an
// editor selection as well: that is the phone's selection sheet for this
// verb. Mounted once per shell; it watches the document's selection.

import { useEffect, useRef, useState } from "react";
import "../styles/speech.css";
import { t } from "../i18n.ts";
import { domSelectionRequest } from "./doors.ts";
import { speak, type SpeakRequest } from "./player.ts";

function Speaker() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      <path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** What a press will read: rendered prose (a request in hand), or the
 *  editor the selection is in (read through ./editorSpeak.ts, which only
 *  loads where an editor is). */
type Target = { kind: "dom"; req: SpeakRequest } | { kind: "editor"; el: HTMLElement; range: Range };

function currentTarget(editor: boolean): Target | null {
  const req = domSelectionRequest();
  if (req) return { kind: "dom", req };
  if (!editor) return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const el = (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest<HTMLElement>(".cm-editor");
  if (!el || !/[\p{L}\p{N}]/u.test(sel.toString())) return null;
  return { kind: "editor", el, range };
}

export default function SpeakChip({ enabled = true, editor = false }: { enabled?: boolean; editor?: boolean }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  // Taken on the press, not the click: a tap on a touch screen may collapse
  // the selection before the click arrives.
  const pressed = useRef<Target | null>(null);

  useEffect(() => {
    if (!enabled) {
      setAt(null);
      return;
    }
    let raf = 0;
    const place = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const target = currentTarget(editor);
        const range = target === null ? null : target.kind === "dom" ? target.req.range : target.range;
        if (!range) {
          setAt(null);
          return;
        }
        const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 || r.height > 0);
        const last = rects[rects.length - 1] ?? range.getBoundingClientRect();
        const rtl = getComputedStyle(range.startContainer.parentElement ?? document.body).direction === "rtl";
        const x = Math.min(Math.max(8, rtl ? last.left - 8 : last.right - 8), window.innerWidth - 150);
        const below = last.bottom + 8;
        const y = below + 40 > window.innerHeight ? Math.max(8, last.top - 44) : below;
        setAt({ x, y });
      });
    };
    document.addEventListener("selectionchange", place);
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("selectionchange", place);
      window.removeEventListener("scroll", place, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", place);
    };
  }, [enabled, editor]);

  if (!at) return null;
  return (
    <button
      type="button"
      className="s-speak-chip"
      style={{ left: at.x, top: at.y }}
      // The selection must survive the press: it is what is read.
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        e.preventDefault();
        pressed.current = currentTarget(editor);
      }}
      onClick={() => {
        const target = currentTarget(editor) ?? pressed.current;
        pressed.current = null;
        if (!target) return;
        if (target.kind === "editor") {
          void import("./editorSpeak.ts").then((m) => m.speakEditorElement(target.el, "selection"));
          return;
        }
        speak(target.req);
        // The selection's own paint would cover the sentence being lit; the
        // range is already in the player's hands.
        window.getSelection()?.removeAllRanges();
      }}
      title={`${t("speakSelection")} (Ctrl/Cmd ⇧ .)`}
    >
      <Speaker /> {t("speakSelection")}
    </button>
  );
}
