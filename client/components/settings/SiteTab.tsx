// YOUR SITE — what visitors see, and who may answer them. A tab body (see
// ./TabBody.tsx).
//
// The settings purge put the old "Site" and "Publishing & comments" tabs back
// together, because they answered one question — what does a visitor meet —
// and the split had been made to keep a tab under eighteen rows, not because
// a reader thinks of a site's name and its home page as different subjects.
// The fonts left for Appearance (they set the owner's own editor too); the
// visitors' read aloud went to Reading & speech; four controls that only mean
// something beside another became parts of it (the designer's door under the
// layout, the fediverse name under its switch, webmentions in and out as one
// row); and the three rows set once and left — the footer template, the
// excluded tags, your other sites — sit behind the Advanced line.
//
// A pocket vault (a repository cloned onto a phone) keeps the identity rows,
// the ones it cannot keep locked, and draws none of the publishing rows it
// never drew: `<InstanceOnly>` (settings/Fold.tsx), which the settings index
// reads as `mode: "instance"`.

import { useSettings } from "./context.ts";
import { useStore } from "../../state.ts";
import { localeNum, t, tf } from "../../i18n.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { Select } from "../controls/Select.tsx";
import { openDesigner } from "../design/openDesigner.ts";
import { FediverseNote, SentPanel } from "../../mentions/PublishingPanels.tsx";
import { ImageField } from "./ImageField.tsx";
import { VisitorThemeLine, themeChoices } from "./VisitorTheme.tsx";
import { Consequence, VisibilityBanner } from "./Visibility.tsx";
import { Advanced, InstanceOnly } from "./Fold.tsx";
import { Part, Parts, Row } from "./Row.tsx";
import { enumLabel, splitSites, splitTags } from "./form.ts";

export default function SiteTab() {
  const { pocket, form, setForm, setPicker, errors, field, onOffSegments, eff, inh, impact, homeOff } = useSettings();
  return (
    <section data-section="site">
      {/* The standing answer to "how much of my site is public". It describes
          the site AS THE FORM WOULD LEAVE IT, so it moves as the controls move
          — the operator never has to save to find out. */}
      <InstanceOnly>
        <VisibilityBanner impact={impact} />
      </InstanceOnly>
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

        {/* ── Publishing ────────────────────────────────────────────────────
            Which shell a visitor lands in, and the door to the designer
            BESIDE the switch that needs it: `openDesigner()` once had a single
            call site (the palette), so an owner who picked "Designed" landed
            on a designed site with no design and nothing saying where designs
            are made. */}
        <div className="s-smodal__sub">{t("groupPublishing")}</div>
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
        {/* No env var behind these two — plain toggles. */}
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

        {/* ── Home page ─────────────────────────────────────────────────────
            Read by the blog and designed layouts only; with the app layout
            the rows grey and a note says so. */}
        <div className="s-smodal__sub">{t("groupHome")}</div>
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

        {/* ── Conversation (docs/webmentions.md) ────────────────────────────
            Who may answer: comments, webmentions and the fediverse. Each is
            network access or visitor input the owner consents to on its own,
            all off on a new instance. What a switch has done is said UNDER it
            (the row's `after` line) rather than in a row of its own. */}
        <div className="s-smodal__sub">{t("groupConversation")}</div>
        <Row label={t("rowComments")} hint={t("hintComments")} env={{ name: "COMMENTS", value: eff.commentsEnabled ? "on" : "off", inherits: form.comments === "" }}>
          <SegmentedControl label={t("rowComments")} segments={onOffSegments(inh.commentsEnabled)} {...field("comments")} />
        </Row>
        <Row
          label={t("rowWebmentions")}
          hint={t("hintWebmentions")}
          more={[t("moreWebmentionsAccept"), t("moreWebmentionsSend")]}
          after={<SentPanel on={form.wmSend === "on"} />}
        >
          <Parts>
            <Part label={t("rowWebmentionsAccept")} hint={t("hintWebmentionsAccept")}>
              <Toggle
                label={t("rowWebmentionsAccept")}
                onLabel={t("on")}
                offLabel={t("off")}
                value={form.wmAccept === "on"}
                onChange={(on) => setForm((f) => (f ? { ...f, wmAccept: on ? "on" : "off" } : f))}
              />
            </Part>
            <Part label={t("rowWebmentionsSend")} hint={t("hintWebmentionsSend")}>
              <Toggle
                label={t("rowWebmentionsSend")}
                onLabel={t("on")}
                offLabel={t("off")}
                value={form.wmSend === "on"}
                onChange={(on) => setForm((f) => (f ? { ...f, wmSend: on ? "on" : "off" } : f))}
              />
            </Part>
          </Parts>
        </Row>
        <Row
          label={t("rowFediverse")}
          hint={t("hintFediverse")}
          more={t("moreFediverse")}
          error={errors.fediHandle}
          after={<FediverseNote on={form.fediEnabled === "on"} />}
        >
          <Parts>
            <Toggle
              label={t("rowFediverse")}
              onLabel={t("on")}
              offLabel={t("off")}
              value={form.fediEnabled === "on"}
              onChange={(on) => setForm((f) => (f ? { ...f, fediEnabled: on ? "on" : "off" } : f))}
            />
            {form.fediEnabled === "on" && (
              <Part label={t("rowFediverseHandle")} hint={t("hintFediverseHandle")}>
                <TextInput placeholder={eff.fediverse.handle} dir="ltr" label={t("rowFediverseHandle")} invalid={errors.fediHandle !== undefined} {...field("fediHandle")} />
              </Part>
            )}
          </Parts>
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
        <InstanceOnly>
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
        </InstanceOnly>
      </Advanced>
    </section>
  );
}
