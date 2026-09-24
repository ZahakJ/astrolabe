// THE "WHAT'S NEW" DECK — a modal walk through a release's features, one
// slide per feature, a live visual on each, next and back.
//
// A lazy chunk (scripts/check-bundle.mjs pins it): the door in ./door.ts is
// the only first-paint code, and it opens this through import(). The deck
// mounts itself into a root of its own under <body>, like the tour, because
// it is a surface over the whole shell and belongs to no pane.
//
// The visuals are the product's own (see releaseNotes.ts): a live routine
// card, a live warmth slider. Slides transition with a translate the
// reader's reading direction decides, and ←/→ walk them the same way — in
// an Arabic instance "next" is to the left.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useDialog } from "../a11y.ts";
import { getLang, localeNum, t, tf } from "../i18n.ts";
import { markWhatsNewSeen, setWhatsNewEnabled, whatsNewEnabled } from "./door.ts";
import { RELEASES, type Lang, type Slide, type Visual } from "./releaseNotes.ts";
import "../styles/whatsnew.css";
import { announceOverlay } from "../overlays.ts";

// The manual moved with the repository: zahakj.github.io/astrolabe. The old
// vellum address 404s, and every "Read more in the manual" since 3.11.0
// went there.
const DOCS_BASE = "https://zahakj.github.io/astrolabe/site";

interface Card {
  version: string;
  releaseTitle: string;
  slide: Slide;
}

/** GIVE A DRAWING ITS TIMING. Every part of an SVG after its frame (the
 *  first rect) gets `.wa` and an index, so it arrives in document order
 *  and the drawing plays like a short loop (whatsnew.css, "Motion"). A
 *  group's children are timed one by one rather than the group at once —
 *  a list should tick in row by row. A part that already carries a `wa-`
 *  effect keeps it, and takes only its place in the order. */
function stagger(host: HTMLElement): void {
  const svg = host.querySelector("svg");
  if (!svg) return;
  let i = 0;
  const time = (node: Element): void => {
    if (!(node instanceof SVGElement)) return;
    const named = [...node.classList].some((c) => c.startsWith("wa-"));
    if (!named && !node.classList.contains("wa")) node.classList.add("wa");
    node.style.setProperty("--i", String(i++));
  };
  const parts = [...svg.children].filter((n) => n.tagName !== "defs" && n.tagName !== "style");
  parts.forEach((node, k) => {
    if (k === 0 && node.tagName === "rect") return; // the frame
    if (node.tagName === "g" && node.children.length > 1 && !node.hasAttribute("transform")) {
      for (const child of node.children) time(child);
    } else {
      time(node);
    }
  });
  // The whole cascade fits in the first third of the loop whatever the part
  // count: a drawing of thirty parts at a fixed step had its last parts
  // arrive as the loop was already fading.
  svg.style.setProperty("--step", `${Math.min(0.32, 2.6 / Math.max(1, i)).toFixed(3)}s`);
}

function VisualStage({ visual, lang }: { visual: Visual; lang: Lang }) {
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (visual.kind === "demo") {
      const dispose = visual.mount(el, lang);
      return () => {
        if (typeof dispose === "function") dispose();
        el.replaceChildren();
      };
    }
    if (visual.kind === "svg") {
      el.innerHTML = typeof visual.svg === "function" ? visual.svg(lang) : visual.svg;
      stagger(el);
      return () => el.replaceChildren();
    }
    const img = document.createElement("img");
    img.src = visual.src;
    img.alt = visual.alt[lang];
    img.className = "s-wn-image";
    el.replaceChildren(img);
    return () => el.replaceChildren();
  }, [visual, lang]);
  return <div ref={host} className={`s-wn-stage s-wn-stage--${visual.kind}`} />;
}

function Deck({ versions, onClose }: { versions: string[]; onClose: () => void }) {
  const lang = getLang();
  const cards = useMemo<Card[]>(() => {
    const out: Card[] = [];
    for (const v of versions) {
      const rel = RELEASES.find((r) => r.version === v);
      if (!rel) continue;
      for (const slide of rel.slides) out.push({ version: v, releaseTitle: rel.title[lang], slide });
    }
    return out;
  }, [versions, lang]);
  // The dots, grouped by release — a walk through several missed releases
  // shows where each begins (the owner asked for a divider between them).
  const groups = useMemo(() => {
    const out: { version: string; indices: number[] }[] = [];
    cards.forEach((c, i) => {
      const last = out[out.length - 1];
      if (last && last.version === c.version) last.indices.push(i);
      else out.push({ version: c.version, indices: [i] });
    });
    return out;
  }, [cards]);
  const [index, setIndex] = useState(0);
  /** The x where a touch began, for the swipe that turns a page. */
  const swipe = useRef<number | null>(null);
  const onSwipeStart = (e: React.TouchEvent): void => {
    swipe.current = e.touches[0]?.clientX ?? null;
  };
  const onSwipeEnd = (e: React.TouchEvent): void => {
    const from = swipe.current;
    swipe.current = null;
    const to = e.changedTouches[0]?.clientX;
    if (from === null || to === undefined || Math.abs(to - from) < 48) return;
    // A swipe toward the start of the reading direction goes forward.
    const rtl = getComputedStyle(document.documentElement).direction === "rtl";
    // Sign arithmetic rather than a ternary of comparisons: the dictionary
    // gate reads `> … <` as a text node.
    const forward = (rtl ? 1 : -1) * Math.sign(to - from) > 0;
    if (forward && !last) go(1);
    else if (!forward && !first) go(-1);
  };
  const [dir, setDir] = useState<1 | -1>(1);
  const [enabled, setEnabled] = useState(whatsNewEnabled);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // The dialog takes focus itself: the default lands on the first button,
  // the ×, which opened every deck with a focus ring around its close.
  useDialog(panelRef, { onEscape: onClose, manualFocus: true });
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const go = useCallback(
    (delta: 1 | -1): void => {
      setDir(delta);
      setIndex((i) => Math.max(0, Math.min(cards.length - 1, i + delta)));
    },
    [cards.length],
  );

  useEffect(() => {
    const rtl = document.documentElement.dir === "rtl";
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "ArrowRight") go(rtl ? -1 : 1);
      else if (e.key === "ArrowLeft") go(rtl ? 1 : -1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (cards.length === 0) return null;
  const card = cards[index];
  const last = index === cards.length - 1;
  const first = index === 0;

  return (
    <div className="s-palette-overlay s-wn-overlay" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="s-wn"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={tf("whatsnewTitle", { version: card.version })}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="s-wn__head">
          <span className="s-wn__eyebrow">{t("whatsnewEyebrow")}</span>
          <span className="s-wn__version">{tf("whatsnewTitle", { version: card.version })}</span>
          <span className="s-wn__release" dir="auto">{card.releaseTitle}</span>
          <button type="button" className="s-wn__close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </header>
        <div
          className="s-wn__body"
          key={index}
          data-dir={dir}
          onTouchStart={onSwipeStart}
          onTouchEnd={onSwipeEnd}
        >
          <VisualStage visual={card.slide.visual} lang={lang} />
          <div className="s-wn__text">
            <h2 className="s-wn__title" dir="auto">{card.slide.title[lang]}</h2>
            <p className="s-wn__blurb" dir="auto">{card.slide.body[lang]}</p>
            {card.slide.docs && (
              <a className="s-wn__docs" href={`${DOCS_BASE}/${lang}/${card.slide.docs}/`} target="_blank" rel="noreferrer">
                {t("whatsnewManual")}
              </a>
            )}
          </div>
        </div>
        <footer className="s-wn__foot">
          <label className="s-wn__switch">
            <input
              type="checkbox"
              checked={!enabled}
              onChange={(e) => {
                const off = e.target.checked;
                setEnabled(!off);
                setWhatsNewEnabled(!off);
              }}
            />
            <span>{t("whatsnewDontShow")}</span>
          </label>
          <div className="s-wn__dots" aria-label={tf("whatsnewCount", { n: localeNum(index + 1), of: localeNum(cards.length) })}>
            {groups.map((g) => (
              <div key={g.version} className={`s-wn__group${g.version === card.version ? " is-current" : ""}`}>
                <div className="s-wn__groupdots">
                  {g.indices.map((i) => (
                    <button
                      key={i}
                      type="button"
                      className={`s-wn__dot${i === index ? " is-on" : ""}`}
                      aria-label={localeNum(i + 1)}
                      aria-current={i === index}
                      onClick={() => {
                        setDir(i > index ? 1 : -1);
                        setIndex(i);
                      }}
                    />
                  ))}
                </div>
                {groups.length > 1 && <span className="s-wn__grouplabel" dir="ltr">{g.version}</span>}
              </div>
            ))}
          </div>
          <div className="s-wn__nav">
            <span className="s-wn__count">{tf("whatsnewCount", { n: localeNum(index + 1), of: localeNum(cards.length) })}</span>
            <button type="button" className="s-btn" disabled={first} onClick={() => go(-1)}>
              {t("whatsnewBack")}
            </button>
            {last ? (
              <button type="button" className="s-btn s-btn--accent" onClick={onClose}>
                {t("whatsnewDone")}
              </button>
            ) : (
              <button type="button" className="s-btn s-btn--accent" onClick={() => go(1)}>
                {t("whatsnewNext")}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

let root: Root | null = null;
let mount: HTMLElement | null = null;

/** Open the deck for `versions` (newest first). Closing it marks the newest
 *  as seen — a deck dismissed halfway was still offered. */
export function openWhatsNewDeck(versions: string[]): void {
  if (root) return;
  mount = document.createElement("div");
  mount.className = "s-wn-root";
  document.body.appendChild(mount);
  root = createRoot(mount);
  let leave: (() => void) | null = null;
  const close = (): void => {
    leave?.();
    leave = null;
    markWhatsNewSeen(versions[0]);
    root?.unmount();
    root = null;
    mount?.remove();
    mount = null;
  };
  // The phone shell's handle on this layer (client/overlays.ts): Back is
  // Done — the deck was offered, and dismissing it halfway marks it seen.
  leave = announceOverlay("whatsnew", close);
  root.render(<Deck versions={versions} onClose={close} />);
}
