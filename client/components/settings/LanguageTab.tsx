// LANGUAGE & DATES — the site's language, the visitor switch, the calendar,
// the note layout and the tag labels. A tab body (see ./TabBody.tsx), split
// out of SettingsModal.tsx (3.27.0) with no change to a single row.

import { useSettings } from "./context.ts";
import { siteDateIn } from "../../dates.ts";
import { localeNum, t, tf } from "../../i18n.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { Select } from "../controls/Select.tsx";
import { desktop } from "../../desktop/bridge.ts";
import { DECLARABLE, setBrowserDictionaries, type Declarable } from "../../spellDicts.ts";
import { Row } from "./Row.tsx";
import { TagLabelEditor } from "./TagLabelEditor.tsx";
import { ReadAloudControls } from "./ReadAloudControls.tsx";
import { Consequence, LanguageConsequence, VisibilityBanner } from "./Visibility.tsx";

/** Named one by one so the dictionary gate sees every key used. */
const DICT_LABELS: Record<Declarable, () => string> = {
  fr: () => t("spellDict_fr"),
  ar: () => t("spellDict_ar"),
  he: () => t("spellDict_he"),
  fa: () => t("spellDict_fa"),
};

export default function LanguageTab() {
  const { pocket, form, setForm, errors, field, langFilterLabel, eff, inh, impact, dicts } = useSettings();
  return (
    <section data-section="language">
      {/* The standing answer to "how much of my site is public",
          at the top of both tabs that can change it. It describes
          the site AS THE FORM WOULD LEAVE IT, so it moves as the
          controls move — the operator never has to save to find
          out. */}
      <VisibilityBanner impact={impact} />
      {pocket && <p className="s-smodal__offnote">{t("pocketLangNotice")}</p>}
      <Row
        label={t("rowLanguage")}
        hint={t("hintLanguage")}
        env={{ name: "SITE_LANG", value: eff.language, inherits: form.language === "" }}
      >
        {/* Language names stay in their own script — that is how
            a language picker reads to the person who needs it. */}
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
        <Row label={t("rowSpellDicts")} hint={t("hintSpellDicts")} more={t("moreSpellDicts")}>
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
      <Row
        label={t("rowDateLocale")}
        hint={t("hintDateLocale")}
        error={errors.blogLocale}
        env={{ name: "BLOG_LOCALE", value: eff.blogLocale, inherits: form.blogLocale.trim() === "" }}
      >
        <TextInput
          placeholder={eff.blogLocale}
          dir="ltr"
          label={t("rowDateLocale")}
          invalid={errors.blogLocale !== undefined}
          {...field("blogLocale")}
        />
      </Row>
      {/* Four states, not two. The boolean this replaces could
          only say "on", and "on" meant "pin to the site language"
          — which is why turning it on took a real site from twenty
          published posts to two with nothing said. Each segment
          now names WHO decides, and the block under it prints, in
          this vault's own numbers, exactly what the pending choice
          would do. */}
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
            {
              value: "follow",
              label: t("langFilterFollow"),
              note: t("langFilterFollowNote"),
            },
            { value: "ar", label: t("langFilterAr") },
            { value: "en", label: t("langFilterEn") },
          ]}
          {...field("languageFilter")}
        />
        {impact && (
          <LanguageConsequence
            mode={form.languageFilter === "" ? inh.languageFilter : form.languageFilter}
            impact={impact}
            toggleOn={
              form.languageToggle === "" ? inh.languageToggle : form.languageToggle === "on"
            }
            siteLang={form.language === "" ? inh.language : form.language}
          />
        )}
        {impact && impact.topics.visible < impact.topics.total && (
          <Consequence>
            {tf("langFilterTopicsCut", {
              visible: localeNum(impact.topics.visible),
              total: localeNum(impact.topics.total),
            })}
          </Consequence>
        )}
      </Row>
      {/* The visitor switch, spelled out. It EXISTS — it has since
          the language round — but it lived as a two-word row in a
          list nobody could reach, and the one person who wanted it
          could not tell whether it was there. So it gets its own
          sub-heading and a sentence saying exactly what turning it
          on puts on the public page, and what it deliberately does
          not move (dates and numerals stay on the site's locale). */}
      <div className="s-smodal__sub">{t("visitorSwitchHead")}</div>
      <p className="s-smodal__note">{t("visitorSwitchNote")}</p>
      {/* A PLAIN TOGGLE, not a three-way segment: no environment
          variable stands behind this row (server/settings.ts
          inherits a constant), so "Default" would name nothing an
          operator can set elsewhere. The empty stored value reads
          as the constant it resolves to, and a flip writes on/off. */}
      <Row locked={pocket} label={t("rowLanguageToggle")} hint={t("hintLanguageToggle")}>
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

      {/* ── Calendar ────────────────────────────────────────────
          Under Language because it is the same question one layer
          down: the language decides the WORDS a date is spelled
          in, this decides which date it is. Hijri is Umm al-Qura
          — see shared/dates.ts for why that one and not the other
          three Intl offers. */}
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
      {/* How the two calendars sit together (the owner's own
          example: "السبت 16 ربيع الأول 1448هـ | 29 أغسطس 2026 م",
          Hijri first, a bar between). Only shown while "Both"
          is the choice; the specimen below moves with them. */}
      {form.dateCalendar === "both" && (
        <>
          <Row label={t("rowDateOrder")} hint={t("hintDateOrder")}>
            <SegmentedControl
              label={t("rowDateOrder")}
              segments={[
                { value: "auto", label: t("dateOrderAuto") },
                { value: "hijri-first", label: t("dateOrderHijriFirst") },
                { value: "gregorian-first", label: t("dateOrderGregorianFirst") },
              ]}
              {...field("dateOrder")}
            />
          </Row>
          <Row label={t("rowDateSeparator")} hint={t("hintDateSeparator")}>
            <SegmentedControl
              label={t("rowDateSeparator")}
              segments={[
                { value: "bar", label: "|" },
                { value: "dot", label: "·" },
                { value: "parens", label: "( )" },
              ]}
              {...field("dateSeparator")}
            />
          </Row>
        </>
      )}
      {/* A SPECIMEN, not a promise. The three words above name
          three calendars; this line is the only thing that shows
          what one of them actually prints, in this instance's own
          locale and numerals, and it moves as the segments do —
          the same argument the type specimen makes one tab over. */}
      <p className="s-smodal__note">
        {t("calSpecimen")}
        {": "}
        <bdi className="s-smodal__specdate">
          {siteDateIn(
            new Date(),
            eff.blogLocale,
            form.dateCalendar === "hijri" || form.dateCalendar === "both"
              ? form.dateCalendar
              : "gregorian",
            { dateStyle: "long" },
            {
              order: form.dateOrder === "hijri-first" || form.dateOrder === "gregorian-first" ? form.dateOrder : "auto",
              separator: form.dateSeparator === "dot" || form.dateSeparator === "parens" ? form.dateSeparator : "bar",
            },
          )}
        </bdi>
      </p>
      <p className="s-smodal__note">{t("calFeedNote")}</p>
      {/* SUGGEST, NEVER FORCE. An Arabic instance still starts on
          the Gregorian calendar — changing what an existing site
          prints because its language changed would be a settings
          panel making an editorial decision. So the panel says the
          sentence and leaves the click to the owner. */}
      {(form.language === "ar" || (form.language === "" && inh.language === "ar")) &&
        form.dateCalendar === "gregorian" && (
          <p className="s-smodal__offnote">{t("calArabicSuggest")}</p>
        )}

      {/* ── Note layout ─────────────────────────────────────────
          Direction and alignment for the PROSE, applied
          identically in the editor, the reading view and blog
          articles. A note overrides both from its own
          frontmatter, and says so where the reader can see it. */}
      <div className="s-smodal__sub">{t("groupNoteLayout")}</div>
      <Row label={t("rowTextDirection")} hint={t("hintTextDirection")}>
        <SegmentedControl
          label={t("rowTextDirection")}
          segments={[
            { value: "auto", label: t("layoutDirAuto") },
            { value: "ltr", label: t("layoutDirLtr") },
            { value: "rtl", label: t("layoutDirRtl") },
          ]}
          {...field("textDirection")}
        />
      </Row>
      {/* Five values, so a Select rather than a fifth segment: a
          segmented control this wide stops being scannable and
          starts wrapping, which is the trap the theme list was
          moved out of the palette to avoid. */}
      <Row label={t("rowTextAlign")} hint={t("hintTextAlign")}>
        <Select
          label={t("rowTextAlign")}
          options={[
            { value: "start", label: t("layoutAlignStart") },
            { value: "left", label: t("layoutAlignLeft") },
            { value: "right", label: t("layoutAlignRight") },
            { value: "center", label: t("layoutAlignCenter") },
            { value: "justify", label: t("layoutAlignJustify") },
          ]}
          {...field("textAlign")}
        />
      </Row>
      <p className="s-smodal__note">{t("noteLayoutOverride")}</p>
      {/* The card on a note with nothing in its frontmatter yet:
          shown by default (the owner: "should prob show by
          default on all created notes"), with the switch here
          for the reader who wants a bare page. */}
      <Row label={t("rowEmptyPropsCard")} hint={t("hintEmptyPropsCard")}>
        <SegmentedControl
          label={t("rowEmptyPropsCard")}
          segments={[
            { value: "on", label: t("on") },
            { value: "off", label: t("off") },
          ]}
          {...field("emptyPropsCard")}
        />
      </Row>
      {/* Which language a voice note is heard in (docs/capture.md
          "Voice"). Detect is right for a vault that speaks both;
          a pin is right for a speaker whose Arabic the detector
          keeps hearing as something else. */}
      <Row locked={pocket} label={t("rowVoiceLanguage")} hint={t("hintVoiceLanguage")}>
        <SegmentedControl
          label={t("rowVoiceLanguage")}
          segments={[
            { value: "auto", label: t("voiceLangAuto") },
            { value: "ar", label: t("langAr") },
            { value: "en", label: t("langEn") },
          ]}
          {...field("voiceLanguage")}
        />
      </Row>
      {/* The other direction (docs/read-aloud.md): a selection read aloud
          by voices on this machine's CPU, in the language it is written in.
          One row — the engine, its install, the voices, the speed. */}
      {/* Not locked in a pocket vault: there the row is this phone's own
          voices (ReadAloudControls), which are the only ones it has. */}
      <Row label={t("rowReadAloud")} hint={t("hintReadAloud")} more={t("moreReadAloud")}>
        <ReadAloudControls />
      </Row>

      {/* ── Tag labels ──────────────────────────────────────────
          DISPLAY ONLY, and the copy says so before the table does
          anything: the vault keeps its canonical tags, the URLs
          keep canonical slugs, and search answers to both. */}
      <div className="s-smodal__sub">{t("groupTagLabels")}</div>
      <p className="s-smodal__note">{t("tagLabelsNote")}</p>
      <Row label={t("tagLabelsRowLabel")} hint={t("tagLabelsPageWins")} wide>
        <TagLabelEditor
          rows={form.tagLabels}
          onChange={(rows) => setForm((f) => (f ? { ...f, tagLabels: rows } : f))}
        />
      </Row>
    </section>
  );
}
