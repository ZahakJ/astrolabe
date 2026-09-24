// ABOUT — what this instance IS, and where its settings are documented.
// Split out of SettingsModal.tsx (3.27.0) unchanged; `check-settings` reads
// DOC_TOPICS out of this file and opens every file and anchor it names.

import type { AboutInfo } from "../../../shared/types.ts";
import { localeNum, t, type I18nKey } from "../../i18n.ts";

/** The docs pages this panel's own settings are documented in. Named rather
 *  than linked: the docs ship in the repository, not on the running site, and
 *  a link that 404s into the SPA fallback is worse than a name a reader can
 *  search for. Every file and anchor here is a REAL one — `check-settings`
 *  opens each file and slugs its headings the way build-docs does — because
 *  the list once named seven README anchors that had moved to docs/ years
 *  earlier, and a citation that resolves to nothing is worse than none. */
export const DOC_TOPICS: { key: I18nKey; file: string; anchor?: string }[] = [
  { key: "docSiteSettings", file: "docs/configuration.md", anchor: "the-settings-panel" },
  { key: "docTheming", file: "docs/theming.md" },
  { key: "docTypography", file: "docs/typography.md" },
  { key: "docArabic", file: "docs/arabic-and-rtl.md" },
  { key: "docBlogMode", file: "docs/blog-mode.md" },
  { key: "docComments", file: "docs/publishing.md", anchor: "comments" },
  { key: "docSync", file: "docs/backup-and-sync.md" },
];

export function AboutTab({ about }: { about: AboutInfo | null }) {
  if (about === null) return <div className="s-bmodal__empty">{t("loading")}</div>;
  const facts: { label: string; value: string; path?: boolean }[] = [
    { label: t("aboutVersion"), value: `Astrolabe ${about.version}` },
    { label: t("aboutRuntime"), value: `Node ${about.node}` },
    { label: t("aboutVault"), value: about.vaultPath, path: true },
    { label: t("aboutData"), value: about.dataPath, path: true },
    // Where the panel's own answers are kept. The title bar used to say
    // "— settings.json", which named the file without saying where it was;
    // this says both, beside the other absolute paths, and only to an admin
    // (GET /api/settings 404s to everyone else).
    { label: t("aboutSettingsFile"), value: about.settingsPath, path: true },
    { label: t("aboutFontsDir"), value: about.customFontsPath, path: true },
  ];
  const counts: { label: string; value: string }[] = [
    { label: t("aboutNotes"), value: localeNum(about.notes) },
    { label: t("aboutPublished"), value: localeNum(about.published) },
    { label: t("aboutAttachments"), value: localeNum(about.attachments) },
    { label: t("aboutTags"), value: localeNum(about.tags) },
  ];
  return (
    <section data-section="about">
      <dl className="s-about">
        {facts.map((f) => (
          <div className="s-about__row" key={f.label}>
            <dt className="s-about__key">{f.label}</dt>
            {/* Absolute paths are LTR machine strings; in an Arabic panel they
                keep their own direction and their own start edge, or a
                "/home/…" reorders around its slashes. */}
            <dd className={`s-about__val${f.path ? " s-about__val--path" : ""}`} dir="ltr">
              {f.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="s-smodal__note">{t("aboutSettingsNote")}</p>

      <div className="s-smodal__sub">{t("aboutContents")}</div>
      <div className="s-about__counts">
        {counts.map((c) => (
          <div className="s-about__count" key={c.label}>
            <span className="s-about__countnum">{c.value}</span>
            <span className="s-about__countlabel">{c.label}</span>
          </div>
        ))}
      </div>

      <div className="s-smodal__sub">{t("aboutDocs")}</div>
      <p className="s-smodal__note">{t("aboutDocsNote")}</p>
      <ul className="s-about__docs">
        {DOC_TOPICS.map((d) => (
          <li key={d.key} className="s-about__doc">
            <span className="s-about__docname">{t(d.key)}</span>
            <code className="s-about__docanchor" dir="ltr">
              {d.file}
              {d.anchor ? `#${d.anchor}` : ""}
            </code>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------
