// WHAT TRAVELS — the mirror's own report, on the Backup & sync tab.
//
// server/configMirror.ts has kept `<vault>/.astrolabe/` in step with the data
// directory since 3.14 and written `mirror-state.json` on every pass, and no
// surface ever read either: the owner learned that fonts did not travel by
// opening a fresh clone and finding Georgia. This row is the reader. One
// glyph per item says whether the vault holds it (✓), whether this machine
// holds something the vault does not yet (⚠ — the state a mirror should never
// rest in), or whether there is nothing to carry (–); one muted line says
// when the last pass ran and how many files have been reconciled; a red line
// names every file a pass could not copy and why (a cap, a permission); and
// **Re-sync now** runs a pass plus the font warm on demand. Under it, the
// sentence the truth table asked for: what is still redone by hand.
//
// Mounted by SettingsModal.tsx's sync section as `<TravelRow />`, and parsed
// into the settings index from THIS file (scripts/settings-index.mjs reads
// it as part of the sync tab), so search finds "What travels". Its copy is
// its own table (travelCopy.ts), in this chunk rather than the entry's.

import { useEffect, useState } from "react";
import type { TravelItem, TravelProblem, TravelStatus } from "../../../shared/types.ts";
import { getTravelStatus, resyncTravel } from "../../api.ts";
import { localeNum, t } from "../../i18n.ts";
import { lastPull } from "../../prefsSync.ts";
import { useStore } from "../../state.ts";
import { syncWhen } from "../../sync.ts";
import { toast } from "../../toast.ts";
import { Row } from "./Row.tsx";
import { tv, tvf, type TravelKey } from "./travelCopy.ts";

const ITEM_LABEL: Record<TravelItem["id"], TravelKey> = {
  settings: "travelSite",
  designs: "travelDesigns",
  customCss: "travelCustomCss",
  fonts: "travelFonts",
  layouts: "travelLayouts",
  books: "travelBooks",
  annotations: "travelAnnotations",
  prefs: "travelPrefs",
};

type ItemState = "ok" | "warn" | "none";

function stateOf(item: TravelItem): ItemState {
  if (item.inVault) return "ok";
  return item.inData ? "warn" : "none";
}

const STATE_GLYPH: Record<ItemState, string> = { ok: "✓", warn: "⚠", none: "–" };
const STATE_NAME: Record<ItemState, TravelKey> = { ok: "travelInVault", warn: "travelNotYet", none: "travelNothing" };

/** "fonts (2)": the count in the chrome's numerals, in its own parentheses
 *  rather than a count phrase — the unit is the label beside it. */
function itemLabel(item: TravelItem): string {
  const name = tv(ITEM_LABEL[item.id]);
  return item.count !== null && item.count > 0 ? `${name} (${localeNum(item.count)})` : name;
}

function problemLine(p: TravelProblem): string {
  const file = p.rel.split("/").pop() ?? p.rel;
  if (p.reason === "too-large") return tvf("travelTooLarge", { file });
  if (p.reason === "over-total") return tvf("travelOverTotal", { file });
  return tvf("travelCopyFailed", { file, detail: p.detail });
}

export function TravelRow() {
  const locale = useStore((s) => s.blogLocale);
  const [status, setStatus] = useState<TravelStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = (): void => {
      void getTravelStatus()
        .then((s) => {
          if (alive) setStatus(s);
        })
        .catch(() => {
          // a visitor preview, or the server is restarting: the row stays quiet
        });
    };
    load();
    // Every few seconds, like the sync status above it: a pass runs every 5 s
    // and a face uploaded in another tab should turn its glyph here.
    const id = window.setInterval(load, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const resync = async (): Promise<void> => {
    setBusy(true);
    try {
      const next = await resyncTravel();
      setStatus(next);
      const moved = (next.lastPass?.toData.length ?? 0) + (next.lastPass?.toVault.length ?? 0);
      toast(tvf("travelResynced", { n: localeNum(moved) }));
    } catch {
      toast(tv("travelResyncFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const pulled = lastPull();
  const pass = status?.lastPass ?? null;
  const problems = pass?.problems ?? [];

  return (
    <Row label={t("rowTravel")} hint={t("hintTravel")}>
      <div className="s-smodal__sync s-travel">
        {status === null ? (
          <div className="s-smodal__syncline s-smodal__syncline--muted">
            <span>{t("loading")}</span>
          </div>
        ) : (
          // Items separated by a hairline, never a "·" (see .s-smodal__counts):
          // the Eastern Arabic zero is a dot. Each item is its own isolate so
          // a Latin count inside an Arabic label cannot reorder its neighbour.
          <ul className="s-smodal__syncline s-smodal__counts s-travel__items">
            {status.items.map((item) => {
              const state = stateOf(item);
              return (
                <li key={item.id} className={`s-travel__item s-travel__item--${state}`}>
                  <span className="s-travel__glyph" role="img" aria-label={tv(STATE_NAME[state])}>
                    {STATE_GLYPH[state]}
                  </span>
                  <bdi>{itemLabel(item)}</bdi>
                </li>
              );
            })}
          </ul>
        )}
        {status !== null && (
          <div className="s-smodal__syncline s-smodal__syncline--muted s-smodal__counts">
            {pass === null ? (
              <span>{tv("travelNoPass")}</span>
            ) : (
              <>
                <bdi>{tvf("travelLastPass", { when: syncWhen(pass.at, locale) })}</bdi>
                <bdi>{tvf("travelReconciled", { n: localeNum(status.reconciled) })}</bdi>
              </>
            )}
            {pulled !== null && (
              <bdi>
                {tvf("travelPrefsPulled", {
                  n: localeNum(pulled.keys),
                  when: syncWhen(new Date(pulled.at).toISOString(), locale),
                })}
              </bdi>
            )}
          </div>
        )}
        {problems.map((p) => (
          // One RED line per file, in the reader's language, with the file's
          // name in its own isolate: a face that stayed behind silently is the
          // bug this row exists to make impossible.
          <div key={p.rel} className="s-smodal__syncline s-smodal__syncline--bad" role="alert">
            <span>{problemLine(p)}</span>
          </div>
        ))}
        <div className="s-smodal__actions">
          <button type="button" className="s-btn" disabled={busy || status === null} onClick={() => void resync()}>
            {busy ? tv("travelResyncing") : tv("travelResync")}
          </button>
        </div>
        <div className="s-smodal__syncline s-smodal__syncline--muted">
          <span>{tv("travelRedo")}</span>
        </div>
      </div>
    </Row>
  );
}
