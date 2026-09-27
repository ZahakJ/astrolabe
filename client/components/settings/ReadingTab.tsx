// READING — the reading view, what search reads inside your books, and the
// feeds you follow. A page body (see ./TabBody.tsx).
//
// It was "Reading & speech", four subjects on one page; the voices that read
// to you and the voice notes you speak are their own page now (SpeechTab),
// and the offline copy — a thing about this browser, not about reading — is
// on This device.

import { useSettings } from "./context.ts";
import { t } from "../../i18n.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { headingNumbersPref, setHeadingNumbersPref } from "../../reading/headingNumbers.ts";
import { FeedsFields } from "./PairControls.tsx";
import { useEventPref } from "./devicePrefs.ts";
import { Advanced } from "./Fold.tsx";
import { Row } from "./Row.tsx";

export default function ReadingTab() {
  const { pocket, form, setForm, field, onOffSegments, eff, inh } = useSettings();
  const numbered = useEventPref("astrolabe:heading-numbers", headingNumbersPref);
  return (
    <section data-section="reading">
      {pocket && <p className="s-smodal__offnote">{t("pocketReadingNotice")}</p>}
      <Row device label={t("rowHeadingNumbers")} hint={t("hintHeadingNumbers")}>
        <Toggle label={t("rowHeadingNumbers")} onLabel={t("on")} offLabel={t("off")} value={numbered} onChange={setHeadingNumbersPref} />
      </Row>
      {/* The shelf's page text (server/pdfText.ts): whether the sidebar search
          reads the vault's PDFs. Three-way like Comments, because the middle
          state — "whatever PDF_SEARCH says" — is the row being empty. */}
      <Row
        locked={pocket}
        label={t("rowPdfSearch")}
        hint={t("hintPdfSearch")}
        env={{ name: "PDF_SEARCH", value: eff.pdfSearch ? "on" : "off", inherits: form.pdfSearch === "" }}
      >
        <SegmentedControl label={t("rowPdfSearch")} segments={onOffSegments(inh.pdfSearch)} {...field("pdfSearch")} />
      </Row>
      {/* FEEDS (docs/feeds.md): the list of other people's feeds lives in a
          note; this row is the consent. Off, the server asks no feed for
          anything — network access is the owner's to switch on. */}
      <Row locked={pocket} label={t("rowFeeds")} hint={t("hintFeeds")} more={t("moreFeeds")} wide>
        <FeedsFields
          fetch={form.feedsFetch === "on"}
          onFetch={(on) => setForm((f) => (f ? { ...f, feedsFetch: on ? "on" : "off" } : f))}
          note={field("feedsNote")}
          noteInForce={eff.feeds.note}
        />
      </Row>

      <Advanced tab="reading">
        {/* The corpus the callouts read: detected when the vault names it, and
            the detected value printed rather than a blank field beside a
            feature that is quietly working. */}
        <Row locked={pocket} label={t("hadithFolderLabel")} hint={t("hadithFolderHint")} more={t("moreHadithFolder")}>
          <TextInput placeholder={eff.hadithFolder ?? "Corpus/hadith"} dir="ltr" label={t("hadithFolderLabel")} {...field("hadithFolder")} />
        </Row>
      </Advanced>
    </section>
  );
}
