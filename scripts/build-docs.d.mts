// Types for the two exports tests/docs.test.ts and scripts/check-docs.mjs
// import from the site builder. The builder stays plain JavaScript (it is a
// build script, run by `npm run build-docs`); this file is what the strict
// `npm run typecheck` reads for it.

export interface DocPage {
  slug: string;
  file: string;
  title: { en: string; ar: string };
  section: { id: string; title: { en: string; ar: string } };
}

export interface DocHeading {
  depth: number;
  id: string;
  text: string;
}

export const SECTIONS: { id: string; title: { en: string; ar: string }; pages: Omit<DocPage, "section">[] }[];
export const PAGES: DocPage[];
export const MOVED: Record<string, string>;
/** A heading's id, the way GitHub makes it. */
export function slugify(text: string): string;
/** Every heading of a Markdown source with its id, in order. */
export function headingIds(markdown: string): DocHeading[];
export function build(): void;
