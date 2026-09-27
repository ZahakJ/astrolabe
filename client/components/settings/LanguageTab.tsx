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
import { SegmentedControl, Toggle } from "../controls/Fields.tsx";
import { desktop } from "../../desktop/bridge.ts";
import { DECLARABLE, setBrowserDictionaries, type Declarable } from "../../spellDicts.ts";
import { Row } from "./Row.tsx";
import { Consequence, LanguageConsequence } from "./Visibility.tsx";

/** Named one by one so the dictionary gate sees every key used. */
const DICT_LABELS: Record<Declarable, () => string> = {
  fr: () => t("spellDict_fr"),
  ar: () => t("spellDict_ar"),
  he: () => t("spellDict_he"),
  fa: () => t("spellDict_fa"),
};

export default function LanguageTab() {
  const { pocket, form, setForm, field, langFilterLabel, eff, inh, impact, dicts } = useSettings();
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
                onLabel={tf("spellDictToggle", { lang: DICT_LABELS[code](), state: t("on") })}
                offLabel={tf("spellDictToggle", { lang: DICT_LABELS[code](), state: t("off") })}
                value={dicts.includes(code)}
                onChange={(on) => setBrowserDictionaries(on ? [...dicts, code] : dicts.filter((d) => d !== code))}
              />
            ))}
          </div>
        </Row>
      )}

      {/* ── For visitors ──────────────────────────────────────────────────────
          What the PUBLIC site does with the two languages: which notes it
          shows, and whether a reader may flip the interface. A pocket vault
          has no visitors, so both rows are its locked facts. */}
      {pocket && <p className="s-smodal__offnote">{t("pocketLangNotice")}</p>}
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
    </section>
  );
}
