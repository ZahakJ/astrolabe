// APPEARANCE — how the app looks to you, and the type every reader sees.
//
// The first section, because "where is the theme" is the first question a
// settings panel is opened with. Before the purge the answer was a tab named
// "This device" (the theme lived in localStorage, so that is where it went)
// and the faces were on "Site" two tabs away. Now the question is the
// section: the room and the lamp over it, the sidebar's edge and the column's
// width (each marked "This device": they save on click, here only), the
// direction and alignment of note prose, and the four font slots under their
// live specimen (the site's, saved with the Save bar, like everything else
// without the mark).

import { useState } from "react";
import { t, type I18nKey } from "../../i18n.ts";
import { defaultSide, useStore, type SidebarSidePref } from "../../state.ts";
import { choiceBase, choiceLabel } from "../../themes.ts";
import { SegmentedControl, NumberInput, TextInput } from "../controls/Fields.tsx";
import { Select } from "../controls/Select.tsx";
import { openThemePicker } from "../ThemePicker.tsx";
import { FontPicker, SYSTEM_FONT } from "../FontPicker.tsx";
import { readCustomWidth, readEditorWidth, setCustomWidth, setEditorWidth, type EditorWidth } from "../../editorWidth.ts";
import { DIM_MAX, WARMTH_MAX, readDim, readWarmth, setDim, setWarmth } from "../../eyeComfort.ts";
import { useSettings } from "./context.ts";
import { useLevel } from "./devicePrefs.ts";
import { Part, Parts, Row } from "./Row.tsx";
import { CustomFonts, FontSpecimens } from "./CustomFonts.tsx";
import { SIZE_ADJUST_MIN, SIZE_ADJUST_MAX } from "./form.ts";

/** A level slider with its value spoken beside it: "45%" or "Off", because a
 *  thumb at the left end says nothing about whether the sheet is gone or
 *  merely faint. The row's label is the control's accessible name, as every
 *  row here wires it. */
function LevelSlider({ label, max, value, onChange }: { label: string; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <span className="s-ctl-inline s-ctl-level">
      <input
        className="s-ctl-range"
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        aria-label={label}
        aria-valuetext={value === 0 ? t("eyeComfortOff") : `${value}%`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="s-ctl-level__value" aria-hidden="true">
        {value === 0 ? t("eyeComfortOff") : <bdi dir="ltr">{value}%</bdi>}
      </span>
    </span>
  );
}

export default function AppearanceTab() {
  const { pocket, loaded, form, setForm, customFonts, fontBusy, uploadCustomFont, removeCustomFont, errors, field } = useSettings();
  const [editorWidth, setEditorWidthState] = useState<EditorWidth>(readEditorWidth);
  const [customWidth, setCustomWidthState] = useState<string>(readCustomWidth);
  const [customBad, setCustomBad] = useState(false);
  /** The reader's OWN theme — a live subscription, so a pick made in the
   *  picker on top of this panel updates the row underneath it. */
  const theme = useStore((s) => s.theme);
  /** The notes sidebar's edge: the three-state preference drives the control,
   *  and the edge *Auto* would resolve to — `defaultSide(language)`, not the
   *  store's resolved side, which has any pin folded into it — names what
   *  "Auto" is doing, because an "Auto" that does not say which edge it
   *  landed on is the invisible state this control exists to end. */
  const sidebarSidePref = useStore((s) => s.sidebarSidePref);
  const autoSide = useStore((s) => defaultSide(s.language));
  const setSidebarSidePref = useStore((s) => s.setSidebarSidePref);
  const warmth = useLevel(readWarmth);
  const dim = useLevel(readDim);

  return (
    <section data-section="appearance">
      <Row device label={t("rowYourTheme")} hint={t("hintYourTheme")}>
        {/* ONE trigger, built on `.s-ctl-select` like the visitors' theme row
            under Your site: same measure, same border, same chevron. What it
            opens is a browsing panel rather than a list — twenty-one rooms
            are chosen by looking at them — which is why the trigger carries
            the miniature the picker itself draws. */}
        <button
          type="button"
          className="s-ctl s-ctl-select s-smodal__themebtn"
          aria-haspopup="dialog"
          aria-label={t("rowYourTheme")}
          onClick={openThemePicker}
        >
          {/* The swatch tokens are keyed on the built-in ids and are
              CONSTANT by design, so a custom theme shows the room it was built
              on — under its OWN name, beside it. */}
          <span className="s-tpick__card" data-theme-swatch={choiceBase(theme)} aria-hidden="true">
            <span className="s-tpick__card-rule" />
            <span className="s-tpick__card-line" />
            <span className="s-tpick__card-foot">
              <span className="s-tpick__card-chip" />
              <span className="s-tpick__card-line s-tpick__card-line--short" />
            </span>
          </span>
          <bdi className="s-ctl-select__value s-smodal__themename">{choiceLabel(theme)}</bdi>
          <span className="s-ctl-select__note">{t("browseThemes")}</span>
          <svg className="s-ctl-select__chev" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M4 6.5 L8 10.5 L12 6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </Row>

      {/* EASY ON THE EYES, right under the theme, because it is the question
          the theme row does not answer: "light mode is nice but almost blinds
          me". A theme is ink and paper; these two are the lamp and the blind
          over ANY theme (client/eyeComfort.ts). Applied as it is dragged. */}
      <Row device label={t("rowScreenWarmth")} hint={t("hintScreenWarmth")}>
        <LevelSlider label={t("rowScreenWarmth")} max={WARMTH_MAX} value={warmth} onChange={setWarmth} />
      </Row>
      <Row device label={t("rowScreenDim")} hint={t("hintScreenDim")}>
        <LevelSlider label={t("rowScreenDim")} max={DIM_MAX} value={dim} onChange={setDim} />
      </Row>

      {/* Segment labels name a PHYSICAL edge in both languages, exactly as the
          palette commands do; "Auto" follows the reader's language, which is
          on the next section's first row. */}
      <Row device label={t("rowSidebarSide")} hint={t("hintSidebarSide")}>
        <SegmentedControl
          label={t("rowSidebarSide")}
          value={sidebarSidePref}
          onChange={(v) => setSidebarSidePref(v as SidebarSidePref)}
          segments={[
            { value: "auto", label: t("sideAuto"), note: t(autoSide === "left" ? "sideLeft" : "sideRight") },
            { value: "left", label: t("sideLeft") },
            { value: "right", label: t("sideRight") },
          ]}
        />
      </Row>

      {/* A width of the reader's own is a PART of this row, not a row: it
          means nothing unless "Custom" is chosen, and it applies as it is
          typed (the owner: "you see it change real time"). */}
      <Row device label={t("rowEditorWidth")} hint={t("hintEditorWidth")}>
        <Parts>
          <SegmentedControl
            label={t("rowEditorWidth")}
            value={editorWidth}
            onChange={(v) => {
              setEditorWidth(v as EditorWidth);
              setEditorWidthState(v as EditorWidth);
            }}
            segments={[
              { value: "measure", label: t("editorWidthMeasure") },
              { value: "wide", label: t("editorWidthWide") },
              { value: "full", label: t("editorWidthFull") },
              { value: "custom", label: t("editorWidthCustom") },
            ]}
          />
          {editorWidth === "custom" && (
            <Part label={t("editorWidthCustom")} hint={t("editorWidthCustomHint")}>
              <TextInput
                label={t("editorWidthCustom")}
                value={customWidth}
                placeholder={t("editorWidthCustomPlaceholder")}
                dir="ltr"
                invalid={customBad}
                onChange={(v) => {
                  setCustomWidthState(v);
                  setCustomBad(!setCustomWidth(v));
                }}
              />
            </Part>
          )}
        </Parts>
      </Row>

      {/* ── Note layout ─────────────────────────────────────────────────────
          Direction and alignment for the PROSE, applied identically in the
          editor, the reading view and blog articles. A note overrides both
          from its own frontmatter, and the group's note says so. */}
      <div className="s-smodal__sub">{t("groupNoteLayout")}</div>
      <p className="s-smodal__note">{t("noteLayoutOverride")}</p>
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

      <div className="s-smodal__sub">{t("groupTypography")}</div>
      <p className="s-smodal__note">{t(pocket ? "pocketSiteNotice" : "typographyNote")}</p>
      <div data-section="typography">
        {/* The specimen leads the typography group and STAYS on screen while a
            picker is open: once scrolled to, it is stuck to the top of the
            scroller for as long as the group lasts, and every picker below
            opens downward into the space under its own trigger. Choosing a
            face is a compare-and-adjust loop — the control and its effect
            have to be in one frame. The wrapper is the sticky's containing
            block, so the rows above scroll past it untouched. */}
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

        <Row locked={pocket} label={t("rowFontProse")} hint={t("hintFontProse")}>
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
            so the whole group goes rather than standing greyed beside a drop
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
