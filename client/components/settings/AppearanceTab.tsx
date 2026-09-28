// APPEARANCE — how the app looks on this screen. A page body (see
// ./TabBody.tsx), the first of the rail, because "where is the theme" is the
// first question a settings panel is opened with.
//
// Every row here is kept in this browser and saves as it changes: the room
// and the lamp over it, the sidebar's edge and the column's width. The page
// says so once (`device` in tabs.ts); the direction, alignment and faces of
// note prose — the site's, saved with the Save bar — are Layout & type's.

import { useState } from "react";
import { t } from "../../i18n.ts";
import { defaultSide, useStore, type SidebarSidePref } from "../../state.ts";
import { choiceBase, choiceLabel } from "../../themes.ts";
import { SegmentedControl, TextInput } from "../controls/Fields.tsx";
import { openThemePicker } from "../ThemePicker.tsx";
import { readCustomWidth, readEditorWidth, setCustomWidth, setEditorWidth, type EditorWidth } from "../../editorWidth.ts";
import { DIM_MAX, WARMTH_MAX, readDim, readWarmth, setDim, setWarmth } from "../../eyeComfort.ts";
import { useLevel } from "./devicePrefs.ts";
import { Part, Parts, Row } from "./Row.tsx";

/** A level, spoken: "45%" or "Off", because a thumb at the left end says
 *  nothing about whether the sheet is gone or merely faint. It rides in the
 *  row's LABEL ("Screen warmth · 30%", Row's `value`) — the 3.38.0 slider
 *  had it flung to the far edge of the control column, a word with no row. */
function levelText(value: number): string {
  return value === 0 ? t("eyeComfortOff") : `${value}%`;
}

/** The slider itself, the full width of the control column. The row's label
 *  is its accessible name, as every row here wires it; the value is its
 *  `aria-valuetext`. */
function LevelSlider({ label, max, value, onChange, id, "aria-describedby": describedBy }: { label: string; max: number; value: number; onChange: (v: number) => void; id?: string; "aria-describedby"?: string }) {
  return (
    <input
      className="s-ctl-range s-ctl-level"
      type="range"
      id={id}
      min={0}
      max={max}
      step={1}
      value={value}
      aria-label={label}
      aria-describedby={describedBy}
      aria-valuetext={levelText(value)}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export default function AppearanceTab() {
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
      <Row kind="select" device label={t("rowYourTheme")} hint={t("hintYourTheme")}>
        {/* ONE trigger, built on `.s-ctl-select` like the visitors' theme row
            on Site identity: same measure, same border, same chevron. What it
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
      <Row kind="slider" device label={t("rowScreenWarmth")} value={levelText(warmth)} hint={t("hintScreenWarmth")}>
        <LevelSlider label={t("rowScreenWarmth")} max={WARMTH_MAX} value={warmth} onChange={setWarmth} />
      </Row>
      <Row kind="slider" device label={t("rowScreenDim")} value={levelText(dim)} hint={t("hintScreenDim")}>
        <LevelSlider label={t("rowScreenDim")} max={DIM_MAX} value={dim} onChange={setDim} />
      </Row>

      {/* Segment labels name a PHYSICAL edge in both languages, exactly as the
          palette commands do; "Auto" follows the reader's language. */}
      <Row kind="segmented" device label={t("rowSidebarSide")} hint={t("hintSidebarSide")}>
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
      <Row kind="segmented" device label={t("rowEditorWidth")} hint={t("hintEditorWidth")}>
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
            <Part kind="text" label={t("editorWidthCustom")} hint={t("editorWidthCustomHint")}>
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
    </section>
  );
}
