// A HEADING HELD IN THE READING VIEW, on a phone: the same action sheet the
// editor's heading raises (./editorBridge.ts `headingVerbsAt`), minus the rows
// that act on an editor that is not on screen — fold, select and focus — and
// the rule the desktop's reading-view menu already keeps
// (client/reading/headingMenu.ts): a menu row that does nothing when pressed
// is worse than one that is not there. The note is read fresh, so a section
// extracted here is the section as it stands in the file.

import { copySectionLink, copySectionMarkdown, extractSection, noteContent } from "../sectionActions.ts";
import { sectionAtHeading, sectionsOf } from "../sections.ts";
import { t } from "../i18n.ts";
import type { HeadingVerb } from "./editorBridge.ts";

export async function readingHeadingVerbs(path: string, slug: string): Promise<{ title: string; verbs: HeadingVerb[] } | null> {
  const content = await noteContent(path);
  const section = sectionsOf(content).find((s) => s.slug === slug);
  if (!section) return null;
  return {
    title: section.text,
    verbs: [
      { label: t("copySectionLink"), run: () => copySectionLink(path, section) },
      { label: t("copySectionMd"), run: () => copySectionMarkdown(content, section) },
      {
        label: t("extractSection"),
        run: () =>
          void (async () => {
            const fresh = await noteContent(path);
            await extractSection(path, fresh, sectionAtHeading(sectionsOf(fresh), section.headingLine) ?? section);
          })(),
      },
    ],
  };
}
