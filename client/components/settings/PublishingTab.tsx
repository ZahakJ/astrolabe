// PUBLISHING — which shell a visitor lands in, what the home page shows, and
// what an article carries. Instance-only (`!pocket` in ./TabBody.tsx: a pocket
// vault has no public site). A page body, split from "Your site" in the second
// settings pass.

import { useSettings } from "./context.ts";
import { useStore } from "../../state.ts";
import { localeNum, t, tf } from "../../i18n.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { openDesigner } from "../design/openDesigner.ts";
import { ImageField } from "./ImageField.tsx";
import { Consequence, VisibilityBanner } from "./Visibility.tsx";
import { Advanced } from "./Fold.tsx";
import { Part, Parts, Row } from "./Row.tsx";
import { enumLabel, splitSites, splitTags } from "./form.ts";

export default function PublishingTab() {
  const { form, setForm, setPicker, errors, field, eff, inh, impact, homeOff } = useSettings();
  return (
    <section data-section="publishing">
      {/* The standing answer to "how much of my site is public". It describes
          the site AS THE FORM WOULD LEAVE IT, so it moves as the controls move
          — the operator never has to save to find out. */}
      <VisibilityBanner impact={impact} />
      {/* Which shell a visitor lands in, and the door to the designer BESIDE
          the switch that needs it: `openDesigner()` once had a single call
          site (the palette), so an owner who picked "Designed" landed on a
          designed site with no design and nothing saying where designs are
          made. */}
      <Row label={t("rowPublicLayout")} hint={t("hintPublicLayout")} env={{ name: "PUBLIC_LAYOUT", value: eff.publicLayout, inherits: form.publicLayout === "" }}>
        <Parts>
          <SegmentedControl
            label={t("rowPublicLayout")}
            segments={[
              { value: "", label: t("inheritSegment"), note: enumLabel(inh.publicLayout) },
              { value: "app", label: t("layoutApp") },
              { value: "blog", label: t("layoutBlog") },
              // Lossless in both directions — the design lives in its own
              // file and is not consulted while this reads anything else —
              // so "back to blog" is the rescue, never a migration.
              { value: "designed", label: t("layoutDesigned") },
            ]}
            {...field("publicLayout")}
          />
          <Part label={t("rowOpenDesigner")} hint={t("hintOpenDesigner")}>
            <button
              type="button"
              className="s-btn s-btn--accent"
              onClick={() => {
                useStore.getState().setSettingsOpen(false);
                openDesigner();
              }}
            >
              {t("designTitle")}
            </button>
          </Part>
        </Parts>
      </Row>

      {/* The home page: read by the blog and designed layouts only; with the
          app layout the rows grey and a note says so. */}
      {homeOff && <p className="s-smodal__offnote">{t("homeBlogOnlyNotice")}</p>}
      <Row label={t("rowMode")} hint={t("hintMode")} off={homeOff}>
        <SegmentedControl
          label={t("rowMode")}
          disabled={homeOff}
          segments={[
            { value: "", label: t("inheritSegment"), note: enumLabel(inh.homeMode) },
            { value: "note", label: t("modeNote") },
            { value: "dashboard", label: t("modeDashboard") },
          ]}
          {...field("homeMode")}
        />
      </Row>
      <Row
        label={t("rowHomeNote")}
        hint={t("hintHomeNote")}
        error={errors.homeNote}
        env={{ name: "HOME_NOTE", value: eff.home.note ?? "", inherits: form.homeNote.trim() === "" }}
      >
        <TextInput placeholder={eff.home.note ?? "Welcome.md"} dir="ltr" label={t("rowHomeNote")} invalid={errors.homeNote !== undefined} {...field("homeNote")} />
        {/* A front door pointing at a note visitors cannot see renders a
            blank homepage; only the server knows the publish flag AND the
            language filter the note is about to meet. */}
        {impact &&
          (impact.home.note === null ? (
            <Consequence>{t("homeNoteUnset")}</Consequence>
          ) : impact.home.noteVisible ? (
            <Consequence>{t("homeNoteOk")}</Consequence>
          ) : (
            <Consequence level="warn">{t("homeNoteHidden")}</Consequence>
          ))}
      </Row>
      <Row label={t("rowHomeBanner")} hint={t("hintHomeBanner")} error={errors.homeBanner} off={homeOff}>
        <ImageField
          value={form.homeBanner}
          placeholder={t("phVaultImageOrUrl")}
          invalid={errors.homeBanner !== undefined}
          disabled={homeOff}
          onChange={(v) => setForm((f) => (f ? { ...f, homeBanner: v } : f))}
          onOpenPicker={() => setPicker("homeBanner")}
        />
      </Row>

      {/* What an article carries. No env var behind these two — plain
          toggles. */}
      <Row label={t("rowShareButtons")} hint={t("hintShareButtons")}>
        <Toggle
          label={t("rowShareButtons")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.share === "on" || (form.share === "" && inh.shareButtons)}
          onChange={(on) => setForm((f) => (f ? { ...f, share: on ? "on" : "off" } : f))}
        />
      </Row>
      {/* ANOTHER SITE'S PLAYER (shared/externalVideo.ts) tells that site who
          is reading, so this is a consent switch: off until the owner turns
          it on, and off means the address stays a link. */}
      <Row label={t("rowExternalVideo")} hint={t("hintExternalVideo")} more={t("moreExternalVideo")}>
        <Toggle
          label={t("rowExternalVideo")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.externalVideo === "on" || (form.externalVideo === "" && inh.externalVideo)}
          onChange={(on) => setForm((f) => (f ? { ...f, externalVideo: on ? "on" : "off" } : f))}
        />
      </Row>

      <Advanced tab="publishing">
        {/* This removes topic pills — and with them whole topic pages — and
            it says so, including when the tag it names matches nothing. */}
        <Row
          label={t("rowExcludeTags")}
          hint={t("hintExcludeTags")}
          error={errors.excludeTags}
          env={{ name: "EXCLUDE_TAGS", value: eff.excludeTags.join(","), inherits: form.excludeTags.trim() === "" }}
        >
          <TextInput
            placeholder={eff.excludeTags.length > 0 ? eff.excludeTags.join(", ") : t("phExcludeTags")}
            label={t("rowExcludeTags")}
            invalid={errors.excludeTags !== undefined}
            {...field("excludeTags")}
          />
          {impact &&
            (impact.topics.suppressed.length > 0 ? (
              <Consequence>
                {tf("excludeTagsEffect", {
                  hidden: localeNum(impact.topics.suppressed.length),
                  total: localeNum(impact.topics.total),
                  tags: impact.topics.suppressed.join("، "),
                })}
              </Consequence>
            ) : splitTags(form.excludeTags).length > 0 ? (
              <Consequence>{t("excludeTagsNoop")}</Consequence>
            ) : (
              <Consequence>{tf("excludeTagsNone", { total: localeNum(impact.topics.total) })}</Consequence>
            ))}
        </Row>
        {/* The author's other homes, one per line: pasting six links into
            six fields is busywork this panel refuses to assign. The server
            enriches each with the site's own OpenGraph card. */}
        <Row label={t("rowAuthorSites")} hint={t("hintAuthorSites")} error={errors.authorSites}>
          <textarea
            className="s-smodal__textarea"
            rows={3}
            dir="ltr"
            placeholder={t("phAuthorSites")}
            aria-label={t("rowAuthorSites")}
            aria-invalid={errors.authorSites !== undefined || undefined}
            value={field("authorSites").value}
            onChange={(e) => field("authorSites").onChange(e.target.value)}
          />
          {splitSites(form.authorSites).length > 0 && (
            <Consequence>{tf("authorSitesEffect", { count: localeNum(splitSites(form.authorSites).length) })}</Consequence>
          )}
        </Row>
      </Advanced>
    </section>
  );
}
