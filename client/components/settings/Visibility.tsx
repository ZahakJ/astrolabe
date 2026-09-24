// WHAT A SETTING WOULD DO TO THE PUBLIC SITE, said before it is saved: the
// live visibility preview (`useVisibility`, one debounced request per settled
// edit) and the three ways the panel prints it. Split out of
// SettingsModal.tsx (3.27.0) unchanged.

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { VisibilityImpact } from "../../../shared/types.ts";
import { getVisibility } from "../../api.ts";
import { localeNum, t, tf } from "../../i18n.ts";
import { type Form, splitTags } from "./form.ts";

/** How loud a consequence line is. `warn` is amber (most of the site would go
 *  dark), `stop` is the danger colour (NOTHING would qualify). */
export type Loudness = "plain" | "warn" | "stop";

export function Consequence({ level = "plain", children }: { level?: Loudness; children: ReactNode }) {
  return <p className={`s-smodal__conseq s-smodal__conseq--${level}`}>{children}</p>;
}

/** The site as the current FORM would leave it, refetched as the operator
 *  moves the controls.
 *
 *  Debounced and abortable because it re-runs on every keystroke in the
 *  excluded-tags field; keyed on the exact five values the server's answer
 *  depends on, so moving an unrelated control costs nothing. It deliberately
 *  keeps the LAST good answer while a new one is in flight — a preview that
 *  blinked out between keystrokes would be a worse companion than one that is
 *  briefly a beat behind. */
export function useVisibility(form: Form | null): VisibilityImpact | null {
  const [impact, setImpact] = useState<VisibilityImpact | null>(null);
  // The exact inputs the answer depends on. Not the whole form: this fires an
  // HTTP request, and the typography tab must not.
  const key = form
    ? JSON.stringify([
        form.languageFilter,
        form.excludeTags.trim(),
        form.publicLayout,
        form.homeMode,
        form.homeNote.trim(),
      ])
    : "";
  useEffect(() => {
    if (form === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      getVisibility(
        {
          // "" means "inherit the env default" — and the server's own default
          // is what an absent param already asks for, so it is simply omitted.
          languageFilter: form.languageFilter || undefined,
          excludeTags: splitTags(form.excludeTags),
          publicLayout: form.publicLayout || undefined,
          home: form.homeMode || undefined,
          homeNote: form.homeNote.trim(),
        },
        controller.signal,
      )
        .then(setImpact)
        .catch(() => {
          // Aborted, offline, or a visitor-preview session (404). A missing
          // preview is a missing preview — never a wrong number.
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return impact;
}

/** The language-filter consequence, in the operator's language, with this
 *  vault's numbers. The mode being described is the PENDING one — the segment
 *  the operator has clicked but not yet saved. */
export function LanguageConsequence({
  mode,
  impact,
  toggleOn,
  siteLang,
}: {
  mode: string;
  impact: VisibilityImpact;
  /** settings.languageToggle as the form would leave it. */
  toggleOn: boolean;
  /** The site language as the form would leave it — what "follow" collapses
   *  to for every reader when there is no switch to state a preference with. */
  siteLang: string;
}) {
  const { published, census } = impact;
  const total = localeNum(published);
  if (published === 0) return <Consequence>{t("visibilityNothingPublished")}</Consequence>;
  if (mode === "off") return <Consequence>{t("langFilterOffWhy")}</Consequence>;
  if (mode === "follow") {
    // One number cannot describe a per-reader setting, so this prints both
    // reader populations rather than pretending there is a single answer.
    return (
      <>
        <Consequence>{t("langFilterFollowWhy")}</Consequence>
        {!toggleOn && (
          <Consequence level="warn">
            {tf("langFilterFollowNeedsToggle", {
              lang: t(siteLang === "ar" ? "langAr" : "langEn"),
            })}
          </Consequence>
        )}
        <Consequence level={census.arabic === 0 || census.latin === 0 ? "warn" : "plain"}>
          {tf("langFilterFollowSplit", {
            ar: localeNum(census.arabic + census.neutral),
            en: localeNum(census.latin + census.neutral),
            total,
          })}
        </Consequence>
      </>
    );
  }
  const langName = t(mode === "ar" ? "langAr" : "langEn");
  const qualify = (mode === "ar" ? census.arabic : census.latin) + census.neutral;
  const hidden = published - qualify;
  if (qualify === 0) {
    return (
      <Consequence level="stop">{tf("langFilterEmptyWarn", { lang: langName, total })}</Consequence>
    );
  }
  // "Most of the site" is the threshold that matters: the real incident was 18
  // of 20 hidden, which is 90%. Half is where a reasonable person wants to be
  // asked twice.
  const heavy = hidden > published / 2;
  return (
    <>
      <Consequence level={heavy ? "warn" : "plain"}>
        {tf("langFilterPinnedWhy", {
          lang: langName,
          visible: localeNum(qualify),
          total,
          hidden: localeNum(hidden),
        })}
      </Consequence>
      {heavy && (
        <Consequence level="warn">
          {tf("langFilterMostHiddenWarn", { hidden: localeNum(hidden), total })}
        </Consequence>
      )}
      <Consequence>{t("langFilterPinnedIgnoresReader")}</Consequence>
    </>
  );
}

/** The tab-level standing summary. Not a warning — a statement of fact that
 *  happens to become a warning when the fact is bad. It is the thing whose
 *  absence made the original incident invisible: there was nowhere in this
 *  product that said how many published notes the public could actually find. */
export function VisibilityBanner({ impact }: { impact: VisibilityImpact | null }) {
  if (!impact) return null;
  const { published, visible, publicReads, fallback } = impact;
  const total = localeNum(published);
  const lines: { level: Loudness; text: string }[] = [];
  // PUBLIC first: while it is off, every other number on the tab is
  // hypothetical, and saying so is more honest than printing counts that
  // describe a site nobody can reach.
  if (!publicReads) lines.push({ level: "warn", text: t("publicReadsOffWarn") });
  if (published === 0) {
    lines.push({ level: "plain", text: t("visibilityNothingPublished") });
  } else if (fallback) {
    // The filter stood down. The visitor sees everything; the admin sees why.
    lines.push({
      level: "stop",
      text: tf("langFilterEmptyWarn", {
        lang: t(impact.languageFilter === "ar" ? "langAr" : "langEn"),
        total,
      }),
    });
  } else if (impact.perReader) {
    // One count per reader population — the same split the filter row
    // prints, because "5 of 107 discoverable" is what the owner read while
    // 102 English notes were reachable by anyone who tapped EN.
    const { census } = impact;
    lines.push({
      level: census.arabic === 0 || census.latin === 0 ? "warn" : "plain",
      text: tf("langFilterFollowSplit", {
        ar: localeNum(census.arabic + census.neutral),
        en: localeNum(census.latin + census.neutral),
        total,
      }),
    });
  } else if (visible === published) {
    lines.push({ level: "plain", text: tf("visibilityAll", { total }) });
  } else {
    lines.push({
      level: visible * 2 < published ? "warn" : "plain",
      text: tf("visibilityNow", { visible: localeNum(visible), total }),
    });
  }
  return (
    <div className="s-smodal__reach">
      <div className="s-smodal__sub">{t("visibilityHead")}</div>
      {lines.map((line) => (
        <Consequence key={line.text} level={line.level}>
          {line.text}
        </Consequence>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image picker overlay — the banner picker's upload/pick surfaces, reusable
// against any settings field (favicon, logo, home banner). Same s-bmodal
// styling family as BannerModal.
// ---------------------------------------------------------------------------
