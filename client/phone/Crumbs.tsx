// A folder screen's title, as the way up: "Notes › Mathematics › تاريخ
// الرياضيات", every crumb but the last a button that goes up to that folder
// (./up.ts through the shell's `onUp`), the middle folded into "…" when the
// bar is too narrow (./crumbs.ts decides which; this measures and draws).
// "…" opens an action sheet of the folders it hides.
//
// Measured with the canvas's `measureText` in the crumbs' own fonts rather
// than by drawing every crumb once to see: the plan is known before the
// first paint, so the bar never flashes the whole path and then folds it.
// The separator is a chevron that points the reading direction (phone.css
// mirrors it under [dir="rtl"]), and each folder's name isolates its own
// direction, so an Arabic folder in an English shell reads right.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { t } from "../i18n.ts";
import { useActionSheet } from "./ActionSheet.tsx";
import { collapseCrumbs, crumbsOf } from "./crumbs.ts";
import { IconChevron } from "./icons.tsx";

/** Horizontal padding inside a crumb button, both sides together. */
const PAD = 12;
const SEP = 16;
const MORE = 44;

let canvas: HTMLCanvasElement | null = null;
function textWidth(text: string, font: string): number {
  canvas ??= document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.length * 9;
  ctx.font = font;
  return ctx.measureText(text).width;
}

export default function Crumbs({ path, onUp, onCurrent }: { path: string; onUp: (path: string) => void; onCurrent?: () => void }) {
  const crumbs = useMemo(() => crumbsOf(path, t("phTabNotes")), [path]);
  const ref = useRef<HTMLElement | null>(null);
  const [room, setRoom] = useState(0);
  const actions = useActionSheet();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => setRoom(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plan = useMemo(() => {
    const el = ref.current;
    if (!el || room === 0) return { items: crumbs.map((_, i) => i), hidden: [] as number[] };
    const family = getComputedStyle(el).fontFamily;
    const widths = crumbs.map((c, i) => textWidth(c.label, i === crumbs.length - 1 ? `600 17px ${family}` : `500 15px ${family}`) + PAD);
    return collapseCrumbs(widths, room, SEP, MORE);
  }, [crumbs, room]);

  const sep = (key: string) => (
    <span key={key} className="s-ph-crumbs__sep" aria-hidden="true">
      <IconChevron />
    </span>
  );
  const out: React.ReactNode[] = [];
  plan.items.forEach((item, i) => {
    if (i > 0) out.push(sep(`s${i}`));
    if (item === "more") {
      out.push(
        <button
          key="more"
          type="button"
          className="s-ph-crumbs__more"
          aria-label={t("phCrumbsMore")}
          data-crumb="more"
          onClick={() =>
            actions(
              t("phCrumbsMore"),
              plan.hidden.map((j) => ({ label: crumbs[j].label, user: j > 0, onSelect: () => onUp(crumbs[j].path) })),
            )
          }
        >
          …
        </button>,
      );
      return;
    }
    const c = crumbs[item];
    const last = item === crumbs.length - 1;
    out.push(
      last ? (
        <button key={c.path} type="button" className="s-ph-crumbs__crumb s-ph-crumbs__crumb--here" aria-current="page" data-crumb={c.path} onClick={onCurrent}>
          <bdi dir="auto">{c.label}</bdi>
        </button>
      ) : (
        <button key={c.path || "~root"} type="button" className="s-ph-crumbs__crumb" data-crumb={c.path} onClick={() => onUp(c.path)}>
          {item === 0 ? c.label : <bdi dir="auto">{c.label}</bdi>}
        </button>
      ),
    );
  });

  return (
    <nav ref={ref} className="s-ph-crumbs" aria-label={t("phCrumbs")}>
      {out}
    </nav>
  );
}
