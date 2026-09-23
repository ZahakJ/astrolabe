// A screen's top bar: 44px (plus the notch), the way back on the leading edge,
// the screen's name, and at most two actions on the trailing edge. On the note
// screen it hides as the reader scrolls down and returns on the smallest
// scroll up — by `transform`, so the note under it never reflows (the shell
// measured the desktop's two chrome rows at 83px of a 915px screen; here the
// chrome is 44px and, while reading, none).

import type { ReactNode } from "react";
import { t } from "../i18n.ts";
import { IconBack } from "./icons.tsx";

export interface TopBarProps {
  title: ReactNode;
  /** Present: the ‹ is drawn. */
  onBack?: () => void;
  /** Tap the title: back to the top of whatever scrolls. */
  onTitle?: () => void;
  actions?: ReactNode;
  /** Slid out of view (the note screen, reading down). */
  hidden?: boolean;
  /** A title that is a note's own name takes its own direction. */
  userTitle?: boolean;
}

export default function TopBar({ title, onBack, onTitle, actions, hidden = false, userTitle = false }: TopBarProps) {
  // The note's own name isolates its direction; the bar keeps the chrome's,
  // so an English title in an Arabic shell still starts at the leading edge.
  const name = userTitle ? <bdi dir="auto">{title}</bdi> : title;
  return (
    <header className={`s-ph-top${hidden ? " s-ph-top--hidden" : ""}`}>
      {onBack ? (
        <button type="button" className="s-ph-icon s-ph-top__back" onClick={onBack} aria-label={t("phBack")}>
          <IconBack />
        </button>
      ) : (
        <span className="s-ph-top__gap" aria-hidden="true" />
      )}
      {onTitle ? (
        <button type="button" className="s-ph-top__title s-ph-top__title--button" onClick={onTitle}>
          {name}
        </button>
      ) : (
        <h1 className="s-ph-top__title">
          {name}
        </h1>
      )}
      <div className="s-ph-top__actions">{actions}</div>
    </header>
  );
}
