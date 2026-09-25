// PUBLISHING — what a visitor may see and how the public shell greets them.
// Instance-only (a pocket vault has no visitors). A tab body (see
// ./TabBody.tsx), split out of SettingsModal.tsx (3.27.0) unchanged.

import { useSettings } from "./context.ts";
import { useStore } from "../../state.ts";
import { localeNum, t, tf } from "../../i18n.ts";
import { SegmentedControl, TextInput, Toggle } from "../controls/Fields.tsx";
import { Row } from "./Row.tsx";
import { openDesigner } from "../design/openDesigner.ts";
import { ImageField } from "./ImageField.tsx";
import { Consequence, VisibilityBanner } from "./Visibility.tsx";
import { splitSites, splitTags, enumLabel } from "./form.ts";
import { FediverseNote, SentPanel } from "../../mentions/PublishingPanels.tsx";

export default function PublishingTab() {
  const { form, setForm, setPicker, errors, field, onOffSegments, eff, inh, impact, homeOff } = useSettings();
  return (
    <section data-section="publishing">
      {/* The standing answer to "how much of my site is public",
          at the top of both tabs that can change it. It describes
          the site AS THE FORM WOULD LEAVE IT, so it moves as the
          controls move — the operator never has to save to find
          out. */}
      <VisibilityBanner impact={impact} />
      {/* Which shell a visitor lands in is a publishing decision,
          not a colour one — which is why it sits under Publishing
          and not under the tab that used to own the word "looks". */}
      <Row
        label={t("rowPublicLayout")}
        hint={t("hintPublicLayout")}
        env={{ name: "PUBLIC_LAYOUT", value: eff.publicLayout, inherits: form.publicLayout === "" }}
      >
        <SegmentedControl
          label={t("rowPublicLayout")}
          segments={[
            { value: "", label: t("inheritSegment"), note: enumLabel(inh.publicLayout) },
            { value: "app", label: t("layoutApp") },
            { value: "blog", label: t("layoutBlog") },
            // The third value. Flipping between blog and designed
            // is LOSSLESS in both directions — the design lives in
            // its own file and is not consulted while this reads
            // anything else — so this segment is a switch, never a
            // migration, and "back to blog" is the rescue.
            { value: "designed", label: t("layoutDesigned") },
          ]}
          {...field("publicLayout")}
        />
      </Row>
      {/* THE DOOR TO THE DESIGNER, BESIDE THE SWITCH THAT NEEDS IT.
          `openDesigner()` had exactly ONE call site in the whole
          client — the command palette — so an operator who flipped
          the segment above landed on a designed site with no design
          and nothing anywhere saying where designs are made. This
          is the row that just told them the word "designed"; it is
          the row that has to hand them the tool. (WordPress puts
          Appearance → Themes in the primary nav; this is the same
          idea, one panel over.) */}
      <Row label={t("rowOpenDesigner")} hint={t("hintOpenDesigner")}>
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
      </Row>
      {/* Same treatment as the language filter, one control over:
          this removes topic pills — and with them whole topic
          pages — and it used to do it in silence, including when
          the tag it names matches nothing at all. */}
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
            <Consequence>
              {tf("excludeTagsNone", { total: localeNum(impact.topics.total) })}
            </Consequence>
          ))}
      </Row>
      <Row
        label={t("rowComments")}
        hint={t("hintComments")}
        env={{ name: "COMMENTS", value: eff.commentsEnabled ? "on" : "off", inherits: form.comments === "" }}
      >
        <SegmentedControl
          label={t("rowComments")}
          segments={onOffSegments(inh.commentsEnabled)}
          {...field("comments")}
        />
      </Row>
      {/* WEBMENTIONS AND THE FEDIVERSE (docs/webmentions.md): three
          switches, each network access the owner consents to on its own,
          all off on a new instance. What they have done is said UNDER each
          switch (the rows' `after` line) rather than in rows of their own:
          the Sent list and the follower count are answers about a switch,
          and this tab holds eighteen rows at most. */}
      <Row label={t("rowWebmentionsAccept")} hint={t("hintWebmentionsAccept")} more={t("moreWebmentionsAccept")}>
        <Toggle
          label={t("rowWebmentionsAccept")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.wmAccept === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, wmAccept: on ? "on" : "off" } : f))}
        />
      </Row>
      <Row
        label={t("rowWebmentionsSend")}
        hint={t("hintWebmentionsSend")}
        more={t("moreWebmentionsSend")}
        after={<SentPanel on={form.wmSend === "on"} />}
      >
        <Toggle
          label={t("rowWebmentionsSend")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.wmSend === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, wmSend: on ? "on" : "off" } : f))}
        />
      </Row>
      <Row
        label={t("rowFediverse")}
        hint={t("hintFediverse")}
        more={t("moreFediverse")}
        after={<FediverseNote on={form.fediEnabled === "on"} />}
      >
        <Toggle
          label={t("rowFediverse")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.fediEnabled === "on"}
          onChange={(on) => setForm((f) => (f ? { ...f, fediEnabled: on ? "on" : "off" } : f))}
        />
      </Row>
      <Row label={t("rowFediverseHandle")} hint={t("hintFediverseHandle")} error={errors.fediHandle} off={form.fediEnabled !== "on"}>
        <TextInput
          placeholder={eff.fediverse.handle}
          dir="ltr"
          label={t("rowFediverseHandle")}
          invalid={errors.fediHandle !== undefined}
          {...field("fediHandle")}
        />
      </Row>
      {/* No env var behind these two either — plain toggles, on
          the visitor-switch row's terms. */}
      <Row label={t("rowShareButtons")} hint={t("hintShareButtons")}>
        <Toggle
          label={t("rowShareButtons")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.share === "on" || (form.share === "" && inh.shareButtons)}
          onChange={(on) => setForm((f) => (f ? { ...f, share: on ? "on" : "off" } : f))}
        />
      </Row>
      {/* Decoration, and the only row in this panel that is
          one — so it sits with the other visitor-facing switches
          rather than anywhere near the theme, which it does not
          change. The air a room gets is decided in
          client/styles/ambient.css; this is the master switch and
          the whole of the feature's configuration. */}
      <Row label={t("rowAmbient")} hint={t("hintAmbient")}>
        <Toggle
          label={t("rowAmbient")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.ambient === "on" || (form.ambient === "" && inh.ambient)}
          onChange={(on) => setForm((f) => (f ? { ...f, ambient: on ? "on" : "off" } : f))}
        />
      </Row>
      {/* ANOTHER SITE'S PLAYER (shared/externalVideo.ts). A frame from
          YouTube, Vimeo or a PeerTube server tells that server who is
          reading, so this is a consent switch like the three above it:
          off on every instance until the owner turns it on, and off
          means the address stays a link. */}
      <Row label={t("rowExternalVideo")} hint={t("hintExternalVideo")} more={t("moreExternalVideo")}>
        <Toggle
          label={t("rowExternalVideo")}
          onLabel={t("on")}
          offLabel={t("off")}
          value={form.externalVideo === "on" || (form.externalVideo === "" && inh.externalVideo)}
          onChange={(on) => setForm((f) => (f ? { ...f, externalVideo: on ? "on" : "off" } : f))}
        />
      </Row>
      {/* The author's other homes. One per line, because a URL
          list belongs in a textarea: pasting six links into six
          separate fields is busywork this panel refuses to
          assign. The server enriches each with the site's own
          OpenGraph title, description and cover, so the row asks
          only for what the admin alone knows: which sites, and
          what to call one when its own title is wrong. */}
      <Row
        label={t("rowAuthorSites")}
        hint={t("hintAuthorSites")}
        error={errors.authorSites}
      >
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
          <Consequence>
            {tf("authorSitesEffect", {
              count: localeNum(splitSites(form.authorSites).length),
            })}
          </Consequence>
        )}
      </Row>
      <div className="s-smodal__sub">{t("groupHome")}</div>
      <p className="s-smodal__note">{t("homeNote")}</p>
      {homeOff && <p className="s-smodal__offnote">{t("homeBlogOnlyNotice")}</p>}
      <Row label={t("rowMode")} hint={t("hintMode")} off={homeOff}>
        {homeOff && <Consequence>{t("homeModeAppNote")}</Consequence>}
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
        <TextInput
          placeholder={eff.home.note ?? "Welcome.md"}
          dir="ltr"
          label={t("rowHomeNote")}
          invalid={errors.homeNote !== undefined}
          {...field("homeNote")}
        />
        {/* A front door pointing at a note visitors cannot see
            renders a blank homepage and says nothing about it.
            Now it says something — and it can only be answered by
            the server, which knows the publish flag AND the
            language filter this note is about to meet. */}
        {impact &&
          (impact.home.note === null ? (
            <Consequence>{t("homeNoteUnset")}</Consequence>
          ) : impact.home.noteVisible ? (
            <Consequence>{t("homeNoteOk")}</Consequence>
          ) : (
            <Consequence level="warn">{t("homeNoteHidden")}</Consequence>
          ))}
      </Row>
      <Row
        label={t("rowHomeBanner")}
        hint={t("hintHomeBanner")}
        error={errors.homeBanner}
        off={homeOff}
      >
        <ImageField
          value={form.homeBanner}
          placeholder={t("phVaultImageOrUrl")}
          invalid={errors.homeBanner !== undefined}
          disabled={homeOff}
          onChange={(v) => setForm((f) => (f ? { ...f, homeBanner: v } : f))}
          onOpenPicker={() => setPicker("homeBanner")}
        />
      </Row>
    </section>
  );
}
