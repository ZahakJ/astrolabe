// LANGUAGE & DATES — which language YOU read the app in, which one the site
// speaks to visitors, which languages this browser spellchecks, and how dates
// are printed. A tab body (see ./TabBody.tsx).
//
// THE TWO LANGUAGES, SIDE BY SIDE (the settings purge). "Your language" used
// to be on "This device" as "Editor language" and "Site language" was here,
// three tabs apart — and they are the one pair a reader has to see together
// to understand either: one is the app speaking to you on this device, the
// other is the site speaking to its visitors. Note layout went to Appearance
// (it is how prose is set), the properties card and tag labels to Writing,
// and voice and read aloud to Reading & speech.

import { useSettings } from "./context.ts";
import { siteDateIn } from "../../dates.ts";
import { localeNum, t, tf } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { desktop } from "../../desktop/bridge.ts";
import { DECLARABLE, setBrowserDictionaries, type Declarable } from "../../spellDicts.ts";
import { Advanced } from "./Fold.tsx";
import { Part, Parts, Row } from "./Row.tsx";
import { Consequence, LanguageConsequence } from "./Visibility.tsx";

/** Named one by one so the dictionary gate sees every key used. */
const DICT_LABELS: Record<Declarable, () => string> = {
  fr: () => t("spellDict_fr"),
  ar: () => t("spellDict_ar"),
  he: () => t("spellDict_he"),
  fa: () => t("spellDict_fa"),
};

export default function LanguageTab() {
  const { pocket, form, setForm, errors, field, langFilterLabel, eff, inh, impact, dicts } = useSettings();
  /** The stored PREFERENCE drives the control (a pin to English and a follow
   *  of an English site are different states that resolve alike), and the
   *  site's own language names what "Follow site" is currently doing. */
  const editorLangPref = useStore((s) => s.editorLangPref);
  const setEditorLang = useStore((s) => s.setEditorLang);
  const siteLanguage = useStore((s) => s.siteLanguage);
  return (
    <section data-section="language">
      {/* THE ROW THAT UNWELDS THE TWO LANGUAGES. The site language decides
          what the site PUBLISHES in; this decides what the person looking at
          the screen reads. One value used to do both jobs, so one tap on the
          public ع rewrote the owner's editor. Three states, not two: the
          default has to stay reachable, and "Follow site" names the language
          it landed on rather than being a silent state. */}
      <Row device label={t("rowEditorLanguage")} hint={t("hintEditorLanguage")}>
        <SegmentedControl
          label={t("rowEditorLanguage")}
          value={editorLangPref ?? ""}
          onChange={(v) => setEditorLang(v === "" ? null : (v as "en" | "ar"))}
          segments={[
            { value: "", label: t("editorLangFollow"), note: siteLanguage === "ar" ? "العربية" : "English" },
            { value: "en", label: "English" },
            { value: "ar", label: "العربية" },
          ]}
        />
      </Row>
      <Row
        label={t("rowLanguage")}
        hint={t("hintLanguage")}
        env={{ name: "SITE_LANG", value: eff.language, inherits: form.language === "" }}
      >
        {/* Language names stay in their own script — that is how a language
            picker reads to the person who needs it. */}
        <SegmentedControl
          label={t("rowLanguage")}
          segments={[
            { value: "", label: t("inheritSegment"), note: inh.language === "ar" ? "العربية" : "English" },
            { value: "en", label: "English" },
            { value: "ar", label: "العربية" },
          ]}
          {...field("language")}
        />
      </Row>
      {desktop() === null && (
        <Row device label={t("rowSpellDicts")} hint={t("hintSpellDicts")} more={t("moreSpellDicts")}>
          <div className="s-smodal__dicts" role="group" aria-label={t("rowSpellDicts")}>
            {DECLARABLE.map((code) => (
              <Toggle
                key={code}
                label={DICT_LABELS[code]()}
                // The language's NAME is on screen, not only in the
                // aria-label: four toggles reading "Off" were four
                // controls nobody could tell apart (3.24 audit).
                onLabel={tf("spellDictToggle", { lang: DICT_LABELS[code](), state: t("on") })}
                offLabel={tf("spellDictToggle", { lang: DICT_LABELS[code](), state: t("off") })}
                value={dicts.includes(code)}
                onChange={(on) => setBrowserDictionaries(on ? [...dicts, code] : dicts.filter((d) => d !== code))}
              />
            ))}
          </div>
        </Row>
      )}

      {/* ── Calendar ────────────────────────────────────────────────────────
          The same question one layer down: the language decides the WORDS a
          date is spelled in, this decides which date it is. Hijri is Umm
          al-Qura — see shared/dates.ts for why that one. */}
      <div className="s-smodal__sub">{t("groupCalendar")}</div>
      <Row label={t("rowDateCalendar")} hint={t("hintDateCalendar")}>
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
        <Row label={t("rowDateOrder")} hint={t("hintDateOrder")}>
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
            <Part label={t("rowDateSeparator")} hint={t("hintDateSeparator")}>
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
          Gregorian calendar; the panel says the sentence and leaves the click
          to the owner. */}
      {(form.language === "ar" || (form.language === "" && inh.language === "ar")) && form.dateCalendar === "gregorian" && (
        <p className="s-smodal__offnote">{t("calArabicSuggest")}</p>
      )}

      {/* ── For visitors ────────────────────────────────────────────────────
          What the PUBLIC site does with the two languages: which notes it
          shows, and whether a reader may flip the interface. A pocket vault
          has no visitors, so both rows are its locked facts. The standing
          "how much of my site is public" banner is Your site's; here the
          filter's own consequence lines under it say the same, in numbers. */}
      <div className="s-smodal__sub">{t("groupForVisitors")}</div>
      {pocket && <p className="s-smodal__offnote">{t("pocketLangNotice")}</p>}
      {/* Four states, not two. Each segment names WHO decides, and the block
          under it prints, in this vault's own numbers, exactly what the
          pending choice would do. */}
      <Row
        locked={pocket}
        label={t("rowLanguageFilter")}
        hint={t("hintLanguageFilter")}
        env={{ name: "LANGUAGE_FILTER", value: eff.languageFilter, inherits: form.languageFilter === "" }}
        wide
      >
        <SegmentedControl
          label={t("rowLanguageFilter")}
          segments={[
            { value: "", label: t("inheritSegment"), note: langFilterLabel(inh.languageFilter) },
            { value: "off", label: t("langFilterOff"), note: t("langFilterOffNote") },
            { value: "follow", label: t("langFilterFollow"), note: t("langFilterFollowNote") },
            { value: "ar", label: t("langFilterAr") },
            { value: "en", label: t("langFilterEn") },
          ]}
          {...field("languageFilter")}
        />
        {impact && (
          <LanguageConsequence
            mode={form.languageFilter === "" ? inh.languageFilter : form.languageFilter}
            impact={impact}
            toggleOn={form.languageToggle === "" ? inh.languageToggle : form.languageToggle === "on"}
            siteLang={form.language === "" ? inh.language : form.language}
          />
        )}
        {impact && impact.topics.visible < impact.topics.total && (
          <Consequence>
            {tf("langFilterTopicsCut", { visible: localeNum(impact.topics.visible), total: localeNum(impact.topics.total) })}
          </Consequence>
        )}
      </Row>
      {/* A PLAIN TOGGLE, not a three-way segment: no environment variable
          stands behind this row, so "Default" would name nothing an operator
          can set elsewhere. Its hint says what turning it on puts on the page;
          its ⓘ says what it deliberately does not move. */}
      <Row locked={pocket} label={t("rowLanguageToggle")} hint={t("hintLanguageToggle")} more={t("visitorSwitchNote")}>
        <Toggle
          label={t("rowLanguageToggle")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.languageToggle === "on" || (form.languageToggle === "" && inh.languageToggle)}
          onChange={(on) => setForm((f) => (f ? { ...f, languageToggle: on ? "on" : "off" } : f))}
        />
      </Row>
      {(form.languageToggle === "on" || (form.languageToggle === "" && inh.languageToggle)) && (
        <p className="s-smodal__offnote">{t("visitorSwitchOn")}</p>
      )}

      <Advanced tab="language">
        <Row
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
