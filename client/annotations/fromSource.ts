// A selection made in the EDITOR names source text; the anchor has to name
// the words a reader sees. This strips the inline markdown that vanishes in
// rendering — emphasis, code ticks, wikilink brackets, link targets, list
// and heading markers — so a quote taken over `**vortex** lines` reattaches
// to the rendered "vortex lines". Deliberately shallow: a passage that is
// mostly syntax was never a passage worth marking.
export function proseOfSource(text: string): string {
  return text
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d+[.)][ \t]+)/gm, "")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|==)(.+?)\1/g, "$2")
    .replace(/(\*|_)([^*_\n]+?)\1/g, "$2")
    .replace(/`([^`\n]+)`/g, "$1");
}

/** What the editor dispatches on "Annotate" (window event `vellum:annotate`). */
export interface AnnotateRequest {
  path: string;
  quote: string;
  prefix: string;
  suffix: string;
  x: number;
  y: number;
}

export const ANNOTATE_EVENT = "vellum:annotate";
