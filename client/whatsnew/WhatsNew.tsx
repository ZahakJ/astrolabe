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

const DOCS_BASE = "https://zahakj.github.io/vellum/site";

interface Card {
  version: string;
  releaseTitle: string;
  slide: Slide;
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
      el.innerHTML = visual.svg;
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
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [enabled, setEnabled] = useState(whatsNewEnabled);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialog(panelRef, { onEscape: onClose });

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
        <div className="s-wn__body" key={index} data-dir={dir}>
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
            {cards.map((c, i) => (
              <button
                key={`${c.version}-${i}`}
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
          <div className="s-wn__nav">
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
  const close = (): void => {
    markWhatsNewSeen(versions[0]);
    root?.unmount();
    root = null;
    mount?.remove();
    mount = null;
  };
  root.render(<Deck versions={versions} onClose={close} />);
}
