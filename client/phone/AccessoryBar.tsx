// THE KEYBOARD'S ACCESSORY BAR — the one thing at the bottom of a note while
// it is being written: [[, #, - [ ], **, heading, undo, redo, and the key that
// puts the keyboard away.
//
// A phone keyboard has no brackets on its first page, no Ctrl, and no way to
// undo that is not a shake. These eight are the Markdown a writer reaches for
// mid-sentence. The bar rides ON the keyboard: pinned by the visual viewport
// (the part of the page the keyboard has not covered), moved by `transform`
// so pinning it costs no layout. Pressing a key must never take the caret out
// of the note, so every button refuses focus on pointerdown and acts on click.
//
// Lazy, and it imports CodeMirror through editorBridge — which is already in
// memory, because there is no bar without an editor under it.

import { useEffect, useRef } from "react";
import { t, type I18nKey } from "../i18n.ts";
import { runAccessory, viewIn, type AccessoryAction } from "./editorBridge.ts";
import { IconKeyboardDown, IconRedo, IconUndo } from "./icons.tsx";

const KEYS: { action: AccessoryAction; label: I18nKey; glyph: React.ReactNode }[] = [
  { action: "link", label: "phKeyLink", glyph: "[[" },
  { action: "tag", label: "phKeyTag", glyph: "#" },
  { action: "task", label: "phKeyTask", glyph: "☐" },
  { action: "bold", label: "phKeyBold", glyph: <b>B</b> },
  { action: "heading", label: "phKeyHeading", glyph: "H" },
  { action: "undo", label: "phKeyUndo", glyph: <IconUndo /> },
  { action: "redo", label: "phKeyRedo", glyph: <IconRedo /> },
  { action: "hide", label: "phKeyHide", glyph: <IconKeyboardDown /> },
];

export default function AccessoryBar({ root }: { root: HTMLElement | null }) {
  const barRef = useRef<HTMLDivElement | null>(null);

  // Ride the keyboard: the distance between the layout viewport's bottom and
  // the visual viewport's is exactly what the keyboard covers when the
  // browser overlays rather than resizes (iOS; Chrome without
  // `interactive-widget=resizes-content`). Where it resizes, it is 0 and the
  // bar simply sits at the bottom of the shrunken page.
  useEffect(() => {
    const vv = window.visualViewport;
    const bar = barRef.current;
    if (!vv || !bar) return;
    let raf = 0;
    const place = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const covered = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
        bar.style.transform = covered > 0 ? `translate3d(0,${-covered}px,0)` : "";
      });
    };
    place();
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", place);
      vv.removeEventListener("scroll", place);
    };
  }, []);

  return (
    <div ref={barRef} className="s-ph-kbbar" role="toolbar" aria-label={t("phKeyBar")}>
      {KEYS.map(({ action, label, glyph }) => (
        <button
          key={action}
          type="button"
          className="s-ph-kbbar__key"
          aria-label={t(label)}
          data-key={action}
          // The caret stays where it is: a button that takes focus takes the
          // keyboard down with it.
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const view = viewIn(root);
            if (view) runAccessory(view, action);
          }}
        >
          <span aria-hidden="true">{glyph}</span>
        </button>
      ))}
    </div>
  );
}
