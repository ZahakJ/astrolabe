// LAYOUT & TYPE — how note prose is set, for the owner and every reader: its
// base direction and alignment (applied identically in the editor, the
// reading view and blog articles; a note overrides both from its own
// frontmatter), and the four font slots under their live specimen. The
// site's, saved with the Save bar. A page body (see ./TabBody.tsx).
//
// Split from Appearance in the second settings pass: Appearance is what THIS
// screen looks like (all kept in this browser); this is how the TEXT is set,
// everywhere.

import type { I18nKey } from "../../i18n.ts";
import { t } from "../../i18n.ts";
import { SegmentedControl, NumberInput } from "../controls/Fields.tsx";
import { Select } from "../controls/Select.tsx";
import { FontPicker, SYSTEM_FONT } from "../FontPicker.tsx";
import { useSettings } from "./context.ts";
import { Row } from "./Row.tsx";
import { CustomFonts, FontSpecimens } from "./CustomFonts.tsx";
import { SIZE_ADJUST_MIN, SIZE_ADJUST_MAX } from "./form.ts";

export default function TypeTab() {
  const { pocket, loaded, form, setForm, customFonts, fontBusy, uploadCustomFont, removeCustomFont, errors, field } = useSettings();
  return (
    <section data-section="type">
      {pocket && <p className="s-smodal__offnote">{t("pocketSiteNotice")}</p>}
      <Row label={t("rowTextDirection")} hint={t("hintTextDirection")} more={t("noteLayoutOverride")}>
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
      {/* Five values, so a Select rather than a fifth segment: a segmented
          control this wide stops being scannable and starts wrapping. */}
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

      <div data-section="typography">
        {/* The specimen leads the faces and STAYS on screen while a picker is
            open: once scrolled to, it is stuck to the top of the scroller for
            as long as the group lasts, and every picker below opens downward
            into the space under its own trigger. Choosing a face is a
            compare-and-adjust loop — the control and its effect have to be in
            one frame. The wrapper is the sticky's containing block, so the
            rows above scroll past it untouched. */}
        <div className="s-smodal__specwrap" data-popclear>
          <div className="s-smodal__speclabelrow">
            <span className="s-smodal__speccaption">{t("fontPreview")}</span>
            <span className="s-smodal__spechint">{t("fontPreviewNote")}</span>
            <button
              type="button"
              className="s-btn"
              disabled={pocket}
              onClick={() =>
                setForm((f) =>
                  f ? { ...f, fontProse: SYSTEM_FONT, fontUi: SYSTEM_FONT, fontMono: SYSTEM_FONT, fontArabic: SYSTEM_FONT, fontSizeAdjust: "" } : f,
                )
              }
            >
              {t("fontReset")}
            </button>
          </div>
          <FontSpecimens />
        </div>

        <Row locked={pocket} label={t("rowFontProse")} hint={t("hintFontProse")} more={t("typographyNote")}>
          <FontPicker
            slot="text"
            label={t("rowFontProse")}
            value={form.fontProse}
            catalog={loaded?.fontCatalog ?? []}
            custom={customFonts}
            onChange={(id) => setForm((f) => (f ? { ...f, fontProse: id } : f))}
          />
        </Row>
        <Row locked={pocket} label={t("rowFontUi")} hint={t("hintFontUi")}>
          <FontPicker
            slot="text"
            label={t("rowFontUi")}
            value={form.fontUi}
            catalog={loaded?.fontCatalog ?? []}
            custom={customFonts}
            onChange={(id) => setForm((f) => (f ? { ...f, fontUi: id } : f))}
          />
        </Row>
        <Row locked={pocket} label={t("rowFontMono")} hint={t("hintFontMono")}>
          <FontPicker
            slot="mono"
            label={t("rowFontMono")}
            value={form.fontMono}
            catalog={loaded?.fontCatalog ?? []}
            custom={customFonts}
            onChange={(id) => setForm((f) => (f ? { ...f, fontMono: id } : f))}
          />
        </Row>
        {/* The Arabic slot is not a fourth Latin slot: it is one face that
            answers for Arabic letters INSIDE the three above, per character —
            its hint says so, and the size match below it only exists while
            there is an Arabic face to match, set against the specimen by eye. */}
        <Row locked={pocket} label={t("rowFontArabic")} hint={t("hintFontArabic")}>
          <FontPicker
            slot="arabic"
            label={t("rowFontArabic")}
            value={form.fontArabic}
            catalog={loaded?.fontCatalog ?? []}
            custom={customFonts}
            onChange={(id) => setForm((f) => (f ? { ...f, fontArabic: id } : f))}
          />
        </Row>
        {form.fontArabic !== SYSTEM_FONT && (
          <Row locked={pocket} label={t("rowSizeAdjust")} hint={t("hintSizeAdjust")} error={errors.fontSizeAdjust}>
            <NumberInput
              label={t("rowSizeAdjust")}
              unit="%"
              min={SIZE_ADJUST_MIN}
              max={SIZE_ADJUST_MAX}
              step={2}
              placeholder={t("sizeAdjustAuto")}
              invalid={errors.fontSizeAdjust !== undefined}
              {...field("fontSizeAdjust")}
            />
          </Row>
        )}

        {/* Uploading is the answer to the question the catalog cannot answer:
            the face an operator already owns. An uploaded face is served out
            of an instance's data directory, which a pocket vault has not got,
            so the whole block goes rather than standing greyed beside a drop
            zone that refuses. It is not a settings ROW. */}
        {!pocket && (
          <>
            <div className="s-smodal__sub">{t("fontCustomHead")}</div>
            <p className="s-smodal__note">{t("fontCustomNote")}</p>
            <CustomFonts
              fonts={customFonts}
              busy={fontBusy}
              usedBy={(id) =>
                (
                  [
                    [form.fontProse, "rowFontProse"],
                    [form.fontUi, "rowFontUi"],
                    [form.fontMono, "rowFontMono"],
                    [form.fontArabic, "rowFontArabic"],
                  ] as [string, I18nKey][]
                )
                  .filter(([value]) => value === id)
                  .map(([, key]) => t(key))
              }
              onUpload={uploadCustomFont}
              onDelete={removeCustomFont}
            />
          </>
        )}
      </div>
    </section>
  );
}
