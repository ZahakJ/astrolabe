// SITE — what the site is called, the theme a visitor lands on and the type it
// is set in. A tab body, drawn by ./TabBody.tsx inside either host (the
// desktop dialog or a phone Settings screen) from the form in ./context.ts.
// Split out of SettingsModal.tsx (3.27.0) with no change to a single row.

import { useSettings } from "./context.ts";
import { t, type I18nKey } from "../../i18n.ts";
import { FontPicker, SYSTEM_FONT } from "../FontPicker.tsx";
import { NumberInput, TextInput } from "../controls/Fields.tsx";
import { Select } from "../controls/Select.tsx";
import { Row } from "./Row.tsx";
import { CustomFonts, FontSpecimens } from "./CustomFonts.tsx";
import { ImageField } from "./ImageField.tsx";
import { VisitorThemeLine, themeChoices } from "./VisitorTheme.tsx";
import { SIZE_ADJUST_MIN, SIZE_ADJUST_MAX } from "./form.ts";

export default function SiteTab() {
  const { pocket, loaded, form, setForm, setPicker, customFonts, fontBusy, uploadCustomFont, removeCustomFont, errors, field, eff, inh } = useSettings();
  return (
    <section data-section="site">
      <p className="s-smodal__note s-smodal__note--inherit">{t("settingsNote")}</p>
      {/* WHY THOSE ROWS ARE GREY, said once per tab rather than
          fourteen times in fourteen hints — a hint is one sentence
          about what a row DOES, and the reason a row is inert here
          is the same reason for every one of them. */}
      {pocket && <p className="s-smodal__offnote">{t("pocketSiteNotice")}</p>}
      <Row
        label={t("rowSiteName")}
        error={errors.siteName}
        env={{ name: "SITE_NAME", value: eff.siteName, inherits: form.siteName.trim() === "" }}
      >
        <TextInput
          placeholder={eff.siteName}
          maxLength={81}
          label={t("rowSiteName")}
          invalid={errors.siteName !== undefined}
          {...field("siteName")}
        />
      </Row>
      <Row
        label={t("rowTagline")}
        hint={t("hintTagline")}
        error={errors.tagline}
        env={{ name: "SITE_TAGLINE", value: eff.tagline ?? "", inherits: form.tagline.trim() === "" }}
      >
        <TextInput
          placeholder={eff.tagline ?? "Notes from the canopy…"}
          maxLength={161}
          label={t("rowTagline")}
          invalid={errors.tagline !== undefined}
          {...field("tagline")}
        />
      </Row>
      <Row
        locked={pocket}
        label={t("rowFooter")}
        hint={t("hintFooter")}
        error={errors.footer}
        env={{ name: "SITE_FOOTER", value: eff.footer ?? "", inherits: form.footer.trim() === "" }}
      >
        {/* THE ONE FIELD WHOSE CONTENT IS A TEMPLATE.
            `© {year} {siteName}` is machine syntax, and in an
            Arabic panel an RTL field laid it out as
            `{siteName} {year} ©` — measured, tokens at x 538 /
            628 / 679 — so the operator was shown one token order
            and had to type another. A field cannot be pinned
            `ltr` either: this is also the site's footer PROSE, and
            this owner writes it in Arabic. `auto` is the honest
            answer — the first strong character decides, so the
            default template renders exactly as it must be typed
            and an Arabic footer stays Arabic. Alignment does not
            follow it (controls.css): the field is flushed to the
            panel's start edge either way, like every row above. */}
        <TextInput
          placeholder={eff.footer ?? "© {year} {siteName}"}
          maxLength={201}
          dir="auto"
          label={t("rowFooter")}
          invalid={errors.footer !== undefined}
          {...field("footer")}
        />
      </Row>
      <Row
        label={t("rowLogo")}
        hint={t("hintLogo")}
        error={errors.logo}
      >
        <ImageField
          value={form.logo}
          placeholder={t("phVaultImageOrUrl")}
          invalid={errors.logo !== undefined}
          onChange={(v) => setForm((f) => (f ? { ...f, logo: v } : f))}
          onOpenPicker={() => setPicker("logo")}
        />
      </Row>
      <Row
        locked={pocket}
        label={t("rowFavicon")}
        hint={t("hintFavicon")}
        error={errors.favicon}
      >
        <ImageField
          value={form.favicon}
          placeholder={t("phVaultIcon")}
          invalid={errors.favicon !== undefined}
          onChange={(v) => setForm((f) => (f ? { ...f, favicon: v } : f))}
          onOpenPicker={() => setPicker("favicon")}
        />
      </Row>
      {/* THE THEME A VISITOR ARRIVES ON, beside the marks they arrive
          on. It used to stand two rows from "Your theme" — two labels
          carrying the same word, one of them in the Save diff and one
          of them saving itself on click, with nothing on screen to tell
          them apart. Yours is a tab away now, and this row keeps the
          only question it ever answered: which room a reader with no
          stored choice walks into. */}
      <Row
        locked={pocket}
        label={t("rowDefaultTheme")}
        hint={t("hintDefaultTheme")}
        env={{ name: "DEFAULT_THEME", value: eff.defaultTheme ?? "", inherits: form.defaultTheme === "" }}
        /* THE ROW SAYS WHAT IT DOES, IN A THEME'S NAME.
           "Follow my editor theme" is a rule, not an appearance,
           and an owner reading it still does not know what their
           readers are looking at tonight. This line answers that
           in the same breath, and — while the instance is
           following — offers the single click that stops it. It
           rides `after` rather than being a second child: the row
           wires the label onto its ONE control child. */
        after={
          <VisitorThemeLine
            pref={form.defaultTheme === "" ? inh.defaultTheme : form.defaultTheme}
            effective={eff.visitorTheme}
            onSet={(v) => setForm((f) => (f ? { ...f, defaultTheme: v } : f))}
          />
        }
      >
        {/* Grouped, because twenty-one names in one flat list is the
            same "which of these is dark?" guess the picker exists
            to end. The GROUP names and the theme labels are both
            chrome copy — an Arabic reader met "verdigris" and
            "porphyry" in Latin script here — while the raw id
            stays the option's VALUE and its muted note, because
            that is what settings.defaultTheme and DEFAULT_THEME
            take and what a reader has to type into a .env. */}
        <Select
          label={t("rowDefaultTheme")}
          groups={themeChoices(inh.defaultTheme)}
          {...field("defaultTheme")}
        />
      </Row>
      <div className="s-smodal__sub">{t("groupTypography")}</div>
      <p className="s-smodal__note">{t("typographyNote")}</p>
      <div data-section="typography">
      {/* The specimen leads the typography group and STAYS on
          screen while a picker is open: once scrolled to, it is
          stuck to the top of the scroller for as long as the
          group lasts, and every picker below opens downward into
          the space under its own trigger. Choosing a face is a
          compare-and-adjust loop — the control and its effect have
          to be in one frame, and a popover that covers the effect
          is the same bug as no preview at all. The wrapper is the
          sticky's containing block, so the identity rows above
          scroll past it untouched. */}
      <div className="s-smodal__specwrap" data-popclear>
        <div className="s-smodal__speclabelrow">
          <span className="s-smodal__speccaption">{t("fontPreview")}</span>
          <span className="s-smodal__spechint">{t("fontPreviewNote")}</span>
          <button
            type="button"
            className="s-btn"
            onClick={() =>
              setForm((f) =>
                f
                  ? {
                      ...f,
                      fontProse: SYSTEM_FONT,
                      fontUi: SYSTEM_FONT,
                      fontMono: SYSTEM_FONT,
                      fontArabic: SYSTEM_FONT,
                      fontSizeAdjust: "",
                    }
                  : f,
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
      {/* The Arabic slot is not a fourth Latin slot: it is one face
          that answers for Arabic letters INSIDE the three above,
          per character. Its own sub-heading says so before the
          hint has to. */}
      <div className="s-smodal__sub">{t("fontArabicHead")}</div>
      <p className="s-smodal__note">{t("fontArabicHeadNote")}</p>
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
      {/* The dial only exists while there IS an Arabic face to
          match, and it is the one number in the panel a reader
          arrives at by eye: it is set against the specimen two
          rows up, which is why it lives here and not in a
          config file. */}
      {form.fontArabic !== SYSTEM_FONT && (
        <Row
          locked={pocket}
          label={t("rowSizeAdjust")}
          hint={t("hintSizeAdjust")}
          error={errors.fontSizeAdjust}
        >
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

      {/* Uploading is the answer to the question the catalog
          cannot answer: the face an operator already owns. An
          uploaded face is served out of an instance's data
          directory, which a pocket vault has not got — the route
          is a 501 there — so the whole group goes rather than
          standing greyed beside a drop zone that refuses. It is
          not a settings ROW and carries nothing for the index. */}
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
