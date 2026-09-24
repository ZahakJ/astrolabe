// THE NOTE SCREEN — a note, and as little else as a phone can manage.
//
// A 44px top bar: ‹ back, the title (tap it to go back to the top), one icon
// for the mode the note is IN (the old status bar's pill named the mode you
// were NOT in, "READING" over an editor), and ⋯ for the note sheet. Nothing at
// the bottom — no tab bar, no status bar, no Publish one tap away — except,
// while the keyboard is up, its accessory bar.
//
// The bar slides away as the reader scrolls down and back on the smallest
// scroll up, by `transform`, over a note that keeps its own top padding for
// it — so the note never reflows when the chrome moves.
//
// The editor, the reading view and every other surface come from the same
// switch the desktop pane uses (components/PaneSurface.tsx): nothing about a
// note renders differently because it is on a phone, except the chrome.

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { noteLabelOf } from "../../../shared/noteFormat.ts";
import PaneSurface from "../../components/PaneSurface.tsx";
import { t } from "../../i18n.ts";
import { lazySurface } from "../../lazySurface.tsx";
import { useStore } from "../../state.ts";
import { activeTabOf, paneAt, surfaceOf } from "../../workspace.ts";
import type { ActionRow } from "../ActionSheet.tsx";
import { usePhone } from "../context.ts";
import { IconDots, IconPencil, IconReader } from "../icons.tsx";
import { ACTION_SHEET, NOTE_SHEET } from "../sheetIds.ts";
import TopBar from "../TopBar.tsx";
import { isHeadingLine } from "../../../shared/headings.ts";

const AccessoryBar = lazySurface(() => import("../AccessoryBar.tsx"));

/** Scrolled this far down past the last turn, the bar goes; any scroll up
 *  brings it back. Under this is a finger's tremor, not a direction. */
const HIDE_AFTER_PX = 24;
/** Held this long on a heading, a press is the heading's menu. */
const HOLD_MS = 420;

/** The element that scrolls inside a surface: CodeMirror's scroller or the
 *  reading view's own column. */
function scrollerOf(root: HTMLElement | null): HTMLElement | null {
  if (!root) return null;
  const inner = root.querySelector(".cm-scroller") ?? root.querySelector(".s-reading");
  return inner instanceof HTMLElement ? inner : root;
}

export default function NoteScreen({ path, onBack }: { path: string; onBack: () => void }) {
  const phone = usePhone();
  const admin = useStore((s) => s.admin);
  const surface = useStore((s) => {
    const pane = paneAt(s.workspace, s.workspace.focus);
    return pane === null ? "empty" : surfaceOf(pane);
  });
  const shown = useStore((s) => {
    const pane = paneAt(s.workspace, s.workspace.focus);
    return pane === null ? null : activeTabOf(pane)?.path ?? null;
  });
  const paneId = useStore((s) => s.workspace.focus);
  const toggleReading = useStore((s) => s.toggleReading);
  useStore((s) => s.language);
  const rootRef = useRef<HTMLElement | null>(null);
  const [barHidden, setBarHidden] = useState(false);
  const [typing, setTyping] = useState(false);
  const reading = surface === "reading" || !admin;
  const editing = surface === "edit" && admin;

  // ── the bar that gets out of the way ─────────────────────────────────────
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let last = 0;
    let turn = 0;
    let hidden = false;
    const onScroll = (e: Event): void => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      const y = el.scrollTop;
      const down = y > last;
      if (down !== y > turn) turn = last;
      last = y;
      const next = y > 8 && down && y - turn > HIDE_AFTER_PX ? true : !down ? false : hidden;
      if (next !== hidden) {
        hidden = next;
        setBarHidden(next);
      }
    };
    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => root.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
  }, [path]);
  useEffect(() => setBarHidden(false), [path, surface]);

  // ── the keyboard's bar: up while the editor has the caret ────────────────
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !editing) {
      setTyping(false);
      return;
    }
    const sync = (): void => setTyping(document.activeElement instanceof HTMLElement && document.activeElement.closest(".cm-editor") !== null && root.contains(document.activeElement));
    // Focus leaves before it lands: read where it went a frame later.
    const later = (): void => void requestAnimationFrame(sync);
    root.addEventListener("focusin", sync);
    root.addEventListener("focusout", later);
    sync();
    return () => {
      root.removeEventListener("focusin", sync);
      root.removeEventListener("focusout", later);
    };
  }, [editing, path]);

  // ── the heading's menu, on a long press ──────────────────────────────────
  // The fold chevron and the ⋯ used to hang in the gutters beside every
  // heading, costing the note 32px of measure on each side of a 412px screen.
  // Held still on a heading, a press is that heading's menu instead — in the
  // editor (./editorBridge.ts, the whole list) and, since 3.27.0, in the
  // reading view too (../readingHeading.ts: the rows that do not need an
  // editor). Android answers a held finger with its own text-selection
  // callout; on a heading that is swallowed, because the sheet is the answer.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !admin || (surface !== "edit" && surface !== "reading")) return;
    let timer = 0;
    let start: { x: number; y: number } | null = null;
    const cancel = (): void => {
      window.clearTimeout(timer);
      start = null;
    };
    const readingHeading = (target: EventTarget | null): HTMLElement | null =>
      target instanceof Element ? target.closest<HTMLElement>(".s-reading .s-rv-h[id]") : null;
    const onDown = (e: PointerEvent): void => {
      const line = e.target instanceof Element ? e.target.closest(".cm-line") : null;
      const heading = editing ? null : readingHeading(e.target);
      if (editing ? !line || !isHeadingLine(line.textContent ?? "") : !heading) return;
      start = { x: e.clientX, y: e.clientY };
      const { clientX: x, clientY: y } = e;
      timer = window.setTimeout(() => {
        start = null;
        const found = editing
          ? import("../editorBridge.ts").then((bridge) => bridge.headingVerbsAt(root, x, y))
          : import("../readingHeading.ts").then((m) => m.readingHeadingVerbs(path, heading!.id));
        void found.then((got) => {
          if (!got) return;
          window.getSelection()?.removeAllRanges();
          const rows: ActionRow[] = got.verbs.map((v) => ({ label: v.label, onSelect: v.run }));
          phone.openSheet(ACTION_SHEET, { title: got.title, rows });
        });
      }, HOLD_MS);
    };
    const onMove = (e: PointerEvent): void => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
    };
    const onContext = (e: MouseEvent): void => {
      if (!editing && readingHeading(e.target)) e.preventDefault();
    };
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerup", cancel);
    root.addEventListener("pointercancel", cancel);
    root.addEventListener("contextmenu", onContext);
    return () => {
      cancel();
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerup", cancel);
      root.removeEventListener("pointercancel", cancel);
      root.removeEventListener("contextmenu", onContext);
    };
  }, [editing, surface, admin, path, phone]);

  // ── PROPERTIES, one line ─────────────────────────────────────────────────
  // The card at the top of every note collapses to "N properties ›" here
  // (phone.css), and that line opens the sheet's Properties segment rather
  // than unfolding a form above the note.
  const onClickCapture = useCallback(
    (e: React.MouseEvent) => {
      const head = e.target instanceof Element ? e.target.closest(".cm-s-props__head, .s-rv-props__head") : null;
      if (!head || (e.target as Element).closest("[data-tag], [data-action]")) return;
      e.preventDefault();
      e.stopPropagation();
      phone.openSheet(NOTE_SHEET, { path, segment: "properties" });
    },
    [phone, path],
  );

  const toTop = (): void => {
    scrollerOf(rootRef.current)?.scrollTo({ top: 0, behavior: "smooth" });
    setBarHidden(false);
  };
  const title = noteLabelOf(path.slice(path.lastIndexOf("/") + 1));
  const here = shown === path;
  const canEdit = admin && (surface === "edit" || surface === "reading");

  return (
    <div className={`s-ph-screen s-ph-note${barHidden ? " s-ph-note--bare" : ""}`} data-screen="note" data-path={path}>
      <TopBar
        title={title}
        userTitle
        hidden={barHidden}
        onBack={onBack}
        onTitle={toTop}
        actions={
          <>
            {canEdit && (
              <button
                type="button"
                className="s-ph-icon s-ph-note__mode"
                data-mode={reading ? "reading" : "editing"}
                // The icon is the mode the note is IN; the name says what a
                // tap does, so a screen reader hears both halves.
                aria-label={reading ? t("phModeReading") : t("phModeEditing")}
                aria-pressed={!reading}
                onClick={() => toggleReading()}
              >
                {reading ? <IconReader /> : <IconPencil />}
              </button>
            )}
            <button type="button" className="s-ph-icon" aria-label={t("phNoteSheet")} onClick={() => phone.openSheet(NOTE_SHEET, { path })}>
              <IconDots />
            </button>
          </>
        }
      />
      <section ref={rootRef} className="s-view s-ph-view" data-pane={paneId} onClickCapture={onClickCapture}>
        {here ? <PaneSurface id={paneId} /> : <div className="s-ph-loading" aria-hidden="true" />}
      </section>
      {typing && !phone.keyboard && (
        <Suspense fallback={null}>
          <AccessoryBar root={rootRef.current} />
        </Suspense>
      )}
    </div>
  );
}
