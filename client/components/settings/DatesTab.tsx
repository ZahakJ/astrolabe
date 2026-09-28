// DATES & CALENDAR — which calendar every date on the site is printed in, and
// how two calendars sit together. A page body (see ./TabBody.tsx).
//
// The language decides the WORDS a date is spelled in; this decides which
// date it is. Hijri is Umm al-Qura — see shared/dates.ts for why that one. Its
// own page in the second settings pass: on "Language & dates" it was the
// third of four subjects under an ALL-CAPS subhead.

import { useSettings } from "./context.ts";
import { siteDateIn } from "../../dates.ts";
import { t } from "../../i18n.ts";
import { SegmentedControl, TextInput } from "../controls/Fields.tsx";
import { Advanced } from "./Fold.tsx";
import { Part, Parts, Row } from "./Row.tsx";

export default function DatesTab() {
  const { form, errors, field, eff, inh } = useSettings();
  return (
    <section data-section="dates">
      <Row kind="segmented" label={t("rowDateCalendar")} hint={t("hintDateCalendar")}>
        <SegmentedControl
          label={t("rowDateCalendar")}
          segments={[
            { value: "gregorian", label: t("calGregorian") },
            { value: "hijri", label: t("calHijri") },
            { value: "both", label: t("calBoth") },
          ]}
          {...field("dateCalendar")}
        />
      </Row>
      {/* How the two calendars sit together (the owner's own example:
          "السبت 16 ربيع الأول 1448هـ | 29 أغسطس 2026 م", Hijri first, a bar
          between): ONE row, the order and the mark between them, because the
          second means nothing without the first. Only while "Both" is chosen;
          the specimen below moves with them. */}
      {form.dateCalendar === "both" && (
        <Row kind="segmented" label={t("rowDateOrder")} hint={t("hintDateOrder")}>
          <Parts>
            <SegmentedControl
              label={t("rowDateOrder")}
              segments={[
                { value: "auto", label: t("dateOrderAuto") },
                { value: "hijri-first", label: t("dateOrderHijriFirst") },
                { value: "gregorian-first", label: t("dateOrderGregorianFirst") },
              ]}
              {...field("dateOrder")}
            />
            <Part kind="segmented" label={t("rowDateSeparator")} hint={t("hintDateSeparator")}>
              <SegmentedControl
                label={t("rowDateSeparator")}
                segments={[
                  { value: "bar", label: "|" },
                  { value: "dot", label: "·" },
                  { value: "parens", label: "( )" },
                ]}
                {...field("dateSeparator")}
              />
            </Part>
          </Parts>
        </Row>
      )}
      {/* A SPECIMEN, not a promise: the only thing that shows what a calendar
          actually prints, in this instance's own locale and numerals, moving
          as the segments do. */}
      <p className="s-smodal__note">
        {t("calSpecimen")}
        {": "}
        <bdi className="s-smodal__specdate">
          {siteDateIn(
            new Date(),
            eff.blogLocale,
            form.dateCalendar === "hijri" || form.dateCalendar === "both" ? form.dateCalendar : "gregorian",
            { dateStyle: "long" },
            {
              order: form.dateOrder === "hijri-first" || form.dateOrder === "gregorian-first" ? form.dateOrder : "auto",
              separator: form.dateSeparator === "dot" || form.dateSeparator === "parens" ? form.dateSeparator : "bar",
            },
          )}
        </bdi>
        {" "}
        {t("calFeedNote")}
      </p>
      {/* SUGGEST, NEVER FORCE. An Arabic instance still starts on the
          Gregorian calendar; the page says the sentence and leaves the click
          to the owner. */}
      {(form.language === "ar" || (form.language === "" && inh.language === "ar")) && form.dateCalendar === "gregorian" && (
        <p className="s-smodal__offnote">{t("calArabicSuggest")}</p>
      )}

      <Advanced tab="dates">
        <Row kind="text"
          label={t("rowDateLocale")}
          hint={t("hintDateLocale")}
          error={errors.blogLocale}
          env={{ name: "BLOG_LOCALE", value: eff.blogLocale, inherits: form.blogLocale.trim() === "" }}
        >
          <TextInput placeholder={eff.blogLocale} dir="ltr" label={t("rowDateLocale")} invalid={errors.blogLocale !== undefined} {...field("blogLocale")} />
        </Row>
      </Advanced>
    </section>
  );
}
