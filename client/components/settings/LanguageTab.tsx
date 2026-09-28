// LANGUAGE — which language YOU read the app in, which one the site speaks to
// visitors, which languages this browser spellchecks, and which notes the
// public site shows by their language. A page body (see ./TabBody.tsx).
//
// THE TWO LANGUAGES, SIDE BY SIDE (the purge). "Your language" and "Site
// language" are the one pair a reader has to see together to understand
// either: one is the app speaking to you on this device, the other is the site
// speaking to its visitors. The visitors' filter and switch stay here rather
// than under Publishing, because a reader who wants "Arabic only" looks under
// Language. Dates went to a page of their own in the second pass.

import { useSettings } from "./context.ts";
import { localeNum, t, tf } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import { Chips, SegmentedControl, Toggle } from "../controls/Fields.tsx";
import { Select } from "../controls/Select.tsx";
import { dictionaryName, setBrowserDictionaries, spellOffer } from "../../spellDicts.ts";
import { Row } from "./Row.tsx";
import { Consequence, LanguageConsequence } from "./Visibility.tsx";

export default function LanguageTab() {
  const { pocket, form, setForm, field, langFilterLabel, eff, inh, impact, dicts } = useSettings();
  /** The stored PREFERENCE drives the control (a pin to English and a follow
   *  of an English site are different states that resolve alike), and the
   *  site's own language names what "Follow site" is currently doing. */
  const editorLangPref = useStore((s) => s.editorLangPref);
  const setEditorLang = useStore((s) => s.setEditorLang);
  const siteLanguage = useStore((s) => s.siteLanguage);
  /** What this device can offer, read afresh on each render — `dicts` below
   *  re-renders the page whenever the chosen set moves (SPELL_DICTS_EVENT). */
  const offer = spellOffer();
  return (
    <section data-section="language">
      {/* THE ROW THAT UNWELDS THE TWO LANGUAGES. The site language decides
          what the site PUBLISHES in; this decides what the person looking at
          the screen reads. One value used to do both jobs, so one tap on the
          public ع rewrote the owner's editor. Three states, not two: the
          default has to stay reachable, and "Follow site" names the language
          it landed on rather than being a silent state. */}
      <Row kind="segmented" device label={t("rowEditorLanguage")} hint={t("hintEditorLanguage")}>
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
      <Row kind="segmented"
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
      {/* SPELLCHECK IN — ONE multi-select, not four switches (the owner:
          "wth is this browser dictionaries with like so many on off
          toggles"). Each chip is a language's NAME in the chrome's language;
          what is offered is what this device can honestly check
          (client/spellDicts.ts): the four line languages in a browser, the
          dictionaries this computer has in the desktop app, and — where there
          is nothing to choose (macOS, or spelling off in the Edit menu) — one
          sentence and no control. Kept on this device, like a dictionary. */}
      <Row kind="chips" device label={t("rowSpellDicts")} hint={t("hintSpellDicts")} more={t("moreSpellDicts")}>
        {offer.mode === "browser" || offer.mode === "desktop" ? (
          <Chips
            label={t("rowSpellDicts")}
            chips={offer.offered.map((code) => ({ value: code, label: dictionaryName(code) }))}
            value={dicts}
            onChange={(next) => setBrowserDictionaries(next)}
          />
        ) : (
          <p className="s-smodal__status" data-spell-mode={offer.mode}>
            {t(offer.mode === "system" ? "spellDictsSystem" : offer.mode === "off" ? "spellDictsOff" : "spellDictsNone")}
          </p>
        )}
      </Row>

      {/* ── For visitors ──────────────────────────────────────────────────────
          What the PUBLIC site does with the two languages: which notes it
          shows, and whether a reader may flip the interface. A pocket vault
          has no visitors, so both rows are its locked facts. */}
      {pocket && <p className="s-smodal__offnote">{t("pocketLangNotice")}</p>}
      <Row kind="select"
        locked={pocket}
        label={t("rowLanguageFilter")}
        hint={t("hintLanguageFilter")}
        env={{ name: "LANGUAGE_FILTER", value: eff.languageFilter, inherits: form.languageFilter === "" }}
        after={
          <>
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
          </>
        }
      >
        {/* FIVE STATES, SO A SELECT: as five segments with a note under two
            of them the row ran wider than the control column and two storeys
            tall. The notes ride in the list; the lines under the control say,
            in this vault's own numbers, what the pending choice would do. */}
        <Select
          label={t("rowLanguageFilter")}
          options={[
            { value: "", label: t("inheritSegment"), note: langFilterLabel(inh.languageFilter) },
            { value: "off", label: t("langFilterOff"), note: t("langFilterOffNote") },
            { value: "follow", label: t("langFilterFollow"), note: t("langFilterFollowNote") },
            { value: "ar", label: t("langFilterAr") },
            { value: "en", label: t("langFilterEn") },
          ]}
          {...field("languageFilter")}
        />
      </Row>
      {/* A PLAIN TOGGLE, not a three-way segment: no environment variable
          stands behind this row, so "Default" would name nothing an operator
          can set elsewhere. Its hint says what turning it on puts on the page;
          its ⓘ says what it deliberately does not move. */}
      <Row kind="toggle" locked={pocket} label={t("rowLanguageToggle")} hint={t("hintLanguageToggle")} more={t("visitorSwitchNote")}>
        <Toggle
          label={t("rowLanguageToggle")}
          value={form.languageToggle === "on" || (form.languageToggle === "" && inh.languageToggle)}
          onChange={(on) => setForm((f) => (f ? { ...f, languageToggle: on ? "on" : "off" } : f))}
        />
      </Row>
      {(form.languageToggle === "on" || (form.languageToggle === "" && inh.languageToggle)) && (
        <p className="s-smodal__offnote">{t("visitorSwitchOn")}</p>
      )}
    </section>
  );
}
