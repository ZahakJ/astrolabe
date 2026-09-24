// The tag-label table on Language & dates: a display name per tag per
// language. Split out of SettingsModal.tsx (3.27.0) unchanged.

import { t } from "../../i18n.ts";
import { TextInput } from "../controls/Fields.tsx";
import type { TagLabelRow } from "./form.ts";

/** THE TAG-LABEL TABLE.
 *
 *  A compact key/value editor and nothing more: one row per tag, one column
 *  per language, a remove button per row and one Add at the foot. It is a
 *  TABLE rather than a textarea of `tag = label` lines because the values are
 *  two scripts side by side — an Arabic label typed into a line-oriented
 *  field reorders around its own separator, and the reader is then editing a
 *  string they cannot read back.
 *
 *  Three deliberate details:
 *   · the TAG field is `dir="ltr"` and the LABEL fields are `dir="auto"`. A
 *     canonical tag is machine text (it is a URL segment, an EXCLUDE_TAGS
 *     match, a search key) and must never be reordered by an RTL panel; a
 *     label is prose in its own language and takes its own direction. Their
 *     ALIGNMENT still follows the panel, per controls.css's rule.
 *   · a row with an empty tag is kept while it is being typed and dropped on
 *     save (`labelMap`), so the first keystroke into a new row does not make
 *     the row vanish.
 *   · emptying BOTH labels deletes the label on save. There is no second
 *     gesture for "clear this" because there is nothing to confirm: the tag
 *     itself is untouched, and what comes back is the tag's own name. */
export function TagLabelEditor({
  rows,
  onChange,
}: {
  rows: TagLabelRow[];
  onChange: (rows: TagLabelRow[]) => void;
}) {
  const set = (i: number, patch: Partial<TagLabelRow>): void => {
    onChange(rows.map((row, n) => (n === i ? { ...row, ...patch } : row)));
  };
  return (
    <div className="s-taglabels">
      {rows.length === 0 ? (
        <p className="s-taglabels__empty">{t("tagLabelsEmpty")}</p>
      ) : (
        <>
          <div className="s-taglabels__head" aria-hidden="true">
            <span>{t("tagLabelsTag")}</span>
            <span>{t("tagLabelsEnglish")}</span>
            <span>{t("tagLabelsArabic")}</span>
            <span />
          </div>
          {rows.map((row, i) => (
            <div className="s-taglabels__row" key={`row-${i}`}>
              <TextInput
                value={row.tag}
                onChange={(v) => set(i, { tag: v })}
                placeholder={t("tagLabelsTagPlaceholder")}
                label={t("tagLabelsTag")}
                dir="ltr"
                maxLength={60}
              />
              <TextInput
                value={row.en}
                onChange={(v) => set(i, { en: v })}
                placeholder={t("tagLabelsLabelPlaceholder")}
                label={t("tagLabelsEnglish")}
                dir="auto"
                maxLength={60}
              />
              <TextInput
                value={row.ar}
                onChange={(v) => set(i, { ar: v })}
                placeholder={t("tagLabelsLabelPlaceholder")}
                label={t("tagLabelsArabic")}
                dir="auto"
                maxLength={60}
              />
              <button
                type="button"
                className="s-taglabels__del"
                title={t("tagLabelsRemove")}
                aria-label={t("tagLabelsRemove")}
                onClick={() => onChange(rows.filter((_, n) => n !== i))}
              >
                {/* Geometry, not a glyph: an SVG ✕ takes no bidi and needs no
                    mirroring rule. */}
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
                  <path
                    d="M4 4l8 8M12 4l-8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          ))}
        </>
      )}
      <button
        type="button"
        className="s-taglabels__add"
        onClick={() => onChange([...rows, { tag: "", en: "", ar: "" }])}
      >
        {t("tagLabelsAdd")}
      </button>
    </div>
  );
}
