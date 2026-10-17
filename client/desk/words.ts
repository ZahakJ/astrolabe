// The desk's vocabulary: a status, a next step and a language as the reader's
// own words. Shared by both shells' desk, the piece bar and the capture sheet.

import type { DeskLang, DeskStatus, NextStep } from "../../shared/desk.ts";
import { countPhrase, t, tf, type I18nKey } from "../i18n.ts";

const STATUS_KEY: Record<DeskStatus, I18nKey> = {
  idea: "deskStatusIdea",
  researching: "deskStatusResearching",
  outlining: "deskStatusOutlining",
  drafting: "deskStatusDrafting",
  editing: "deskStatusEditing",
  published: "deskStatusPublished",
  parked: "deskStatusParked",
};

export function statusLabel(status: DeskStatus): string {
  return t(STATUS_KEY[status]);
}

export function langLabel(lang: DeskLang): string {
  return t(lang === "ar" ? "deskLangAr" : "deskLangEn");
}

export function nextStepText(step: NextStep): string {
  switch (step.kind) {
    case "own":
      return step.text;
    case "words":
      return tf("deskNextWords", { n: countPhrase(step.n, "words") });
    case "angle":
      return t("deskNextAngle");
    case "research":
      return t("deskNextResearch");
    case "outline":
      return t("deskNextOutline");
    case "headings":
      return t("deskNextHeadings");
    case "finish":
      return t("deskNextFinish");
    case "publish":
      return t("deskNextPublish");
    case "reread":
      return t("deskNextReread");
    case "live":
      return t("deskNextLive");
    case "parked":
      return t("deskNextParked");
  }
}
