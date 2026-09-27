// THE THREE WRAPPERS A SECTION IS WRITTEN WITH (the settings purge).
//
//   <Advanced tab="writing">…</Advanced>  — the rows a section keeps at its
//       foot, one line away: set once and left, or never moved at all.
//   <InstanceOnly>…</InstanceOnly>        — rows a pocket vault never draws
//   <PocketOnly>…</PocketOnly>            — rows ONLY a pocket vault draws
//
// They are JSX rather than `{!pocket && (…)}` because the settings index is
// read out of the source as text (scripts/settings-index.mjs): an opening and
// a closing tag, each on its own line, are a boundary a line reader can keep
// count of, where a ternary's parentheses are not. Each one therefore also
// says, in the index, what it says on screen — `adv: true` for a row behind
// the Advanced line, `mode` for the kind of vault that draws it.

import type { ReactNode } from "react";
import { t } from "../../i18n.ts";
import { IS_DESKTOP } from "../../desktop/bridge.ts";
import { useSettings } from "./context.ts";
import { DESKTOP_ONLY_ROWS } from "./searchSettings.ts";
import { SETTINGS_INDEX } from "./settingsIndex.ts";

/** THE ADVANCED LINE AT A SECTION'S FOOT.
 *
 *  Closed, it is one line that NAMES what it holds — "Advanced · Vim keys ·
 *  Drawings folder" — because a disclosure that only says "Advanced" is a
 *  drawer a reader has to open to learn whether the thing they want is in
 *  it. The names come from the settings index, filtered the way the search
 *  filters, so a pocket vault's line never names a row it does not draw.
 *  A search hit on a row inside opens it (tabs.ts `revealRow`). A native
 *  `<details>`: keyboard, screen reader and RTL for free, and no fourth
 *  transient surface in the panel's Escape chain. */
export function Advanced({ tab, children }: { tab: string; children: ReactNode }) {
  const { pocket } = useSettings();
  const names = SETTINGS_INDEX.filter(
    (e) =>
      e.tab === tab &&
      e.adv === true &&
      e.row === undefined &&
      (e.mode === undefined || e.mode === (pocket ? "pocket" : "instance")) &&
      (IS_DESKTOP || !DESKTOP_ONLY_ROWS.has(e.label)),
  ).map((e) => t(e.label));
  if (names.length === 0) return null;
  return (
    <details className="s-smodal__adv">
      <summary className="s-smodal__advsum">
        <span className="s-smodal__advname">{t("settingsAdvanced")}</span>
        <span className="s-smodal__advlist">{names.join(" · ")}</span>
      </summary>
      <div className="s-smodal__advbody">{children}</div>
    </details>
  );
}

export function InstanceOnly({ children }: { children: ReactNode }) {
  const { pocket } = useSettings();
  return pocket ? null : <>{children}</>;
}

export function PocketOnly({ children }: { children: ReactNode }) {
  const { pocket } = useSettings();
  return pocket ? <>{children}</> : null;
}
