// SITE IDENTITY — the site's name, its marks, and the theme a visitor arrives
// on. A page body (see ./TabBody.tsx).
//
// The purge put the old "Site" and "Publishing & comments" tabs together as
// "Your site", and the second pass took them apart again along a better seam:
// Your site is now a GROUP of five pages — this one (who the site is),
// Publishing (what a visitor lands in), Comments & mentions (who may answer),
// Collections and Library. A pocket vault keeps this page: the name, tagline
// and logo are the vault's own; the rows it cannot keep are drawn locked.

import { useSettings } from "./context.ts";
import { t } from "../../i18n.ts";
import { TextInput, Toggle } from "../controls/Fields.tsx";
import { Select } from "../controls/Select.tsx";
import { ImageField } from "./ImageField.tsx";
import { VisitorThemeLine, themeChoices } from "./VisitorTheme.tsx";
import { Advanced, InstanceOnly } from "./Fold.tsx";
import { Row } from "./Row.tsx";

export default function SiteTab() {
  const { pocket, form, setForm, setPicker, errors, field, eff, inh } = useSettings();
  return (
    <section data-section="site">
      {/* WHY SOME ROWS ARE GREY, said once rather than in every hint. */}
      {pocket && <p className="s-smodal__offnote">{t("pocketSiteNotice")}</p>}
      <Row label={t("rowSiteName")} error={errors.siteName} env={{ name: "SITE_NAME", value: eff.siteName, inherits: form.siteName.trim() === "" }}>
        <TextInput placeholder={eff.siteName} maxLength={81} label={t("rowSiteName")} invalid={errors.siteName !== undefined} {...field("siteName")} />
      </Row>
      <Row
        label={t("rowTagline")}
        hint={t("hintTagline")}
        error={errors.tagline}
        env={{ name: "SITE_TAGLINE", value: eff.tagline ?? "", inherits: form.tagline.trim() === "" }}
      >
        <TextInput
          placeholder={eff.tagline ?? t("taglinePlaceholder")}
          maxLength={161}
          label={t("rowTagline")}
          invalid={errors.tagline !== undefined}
          {...field("tagline")}
        />
      </Row>
      <Row label={t("rowLogo")} hint={t("hintLogo")} error={errors.logo}>
        <ImageField
          value={form.logo}
          placeholder={t("phVaultImageOrUrl")}
          invalid={errors.logo !== undefined}
          onChange={(v) => setForm((f) => (f ? { ...f, logo: v } : f))}
          onOpenPicker={() => setPicker("logo")}
        />
      </Row>
      <Row locked={pocket} label={t("rowFavicon")} hint={t("hintFavicon")} error={errors.favicon}>
        <ImageField
          value={form.favicon}
          placeholder={t("phVaultIcon")}
          invalid={errors.favicon !== undefined}
          onChange={(v) => setForm((f) => (f ? { ...f, favicon: v } : f))}
          onOpenPicker={() => setPicker("favicon")}
        />
      </Row>
      {/* THE THEME A VISITOR ARRIVES ON. The reader's own theme is the first
          row of Appearance; this one keeps the only question it ever answered
          — which room a reader with no stored choice walks into — and the
          line under it says what they are looking at tonight, in a theme's
          name, with the one click that stops following the editor. */}
      <Row
        locked={pocket}
        label={t("rowDefaultTheme")}
        hint={t("hintDefaultTheme")}
        env={{ name: "DEFAULT_THEME", value: eff.defaultTheme ?? "", inherits: form.defaultTheme === "" }}
        after={
          <VisitorThemeLine
            pref={form.defaultTheme === "" ? inh.defaultTheme : form.defaultTheme}
            effective={eff.visitorTheme}
            onSet={(v) => setForm((f) => (f ? { ...f, defaultTheme: v } : f))}
          />
        }
      >
        {/* Grouped, because twenty-one names in one flat list is the "which
            of these is dark?" guess the picker exists to end; the raw id stays
            the option's value and its muted note, because that is what a
            reader types into a .env. */}
        <Select label={t("rowDefaultTheme")} groups={themeChoices(inh.defaultTheme)} {...field("defaultTheme")} />
      </Row>
      <InstanceOnly>
        {/* Decoration, and the only row in this panel that is: beside the
            visitors' theme, which it does not change. The air a room gets is
            decided in client/styles/ambient.css; this is the whole switch. */}
        <Row label={t("rowAmbient")} hint={t("hintAmbient")}>
          <Toggle
            label={t("rowAmbient")}
            onLabel={t("on")}
            offLabel={t("off")}
            value={form.ambient === "on" || (form.ambient === "" && inh.ambient)}
            onChange={(on) => setForm((f) => (f ? { ...f, ambient: on ? "on" : "off" } : f))}
          />
        </Row>
      </InstanceOnly>

      <Advanced tab="site">
        {/* THE ONE FIELD WHOSE CONTENT IS A TEMPLATE. `© {year} {siteName}` is
            machine syntax, and it is also the site's footer PROSE, which this
            owner writes in Arabic: `dir="auto"` lets the first strong
            character decide, so the default template renders exactly as it
            must be typed and an Arabic footer stays Arabic. */}
        <Row
          locked={pocket}
          label={t("rowFooter")}
          hint={t("hintFooter")}
          error={errors.footer}
          env={{ name: "SITE_FOOTER", value: eff.footer ?? "", inherits: form.footer.trim() === "" }}
        >
          <TextInput placeholder={eff.footer ?? "© {year} {siteName}"} maxLength={201} dir="auto" label={t("rowFooter")} invalid={errors.footer !== undefined} {...field("footer")} />
        </Row>
      </Advanced>
    </section>
  );
}
