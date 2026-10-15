// What a note says only to its author: `<!-- … -->` and `%% … %%`.
//
// Both are comments in every Markdown reader, so a writer leaves plans,
// sources still to check and second thoughts in them, inside notes that are
// published. The reading view never drew them — but a visitor's browser still
// received the note's raw text, and search matched and quoted them, so the
// comment was one "view source" (or one search) away from any reader.
//
// This removes them from the text a VISITOR is sent. Code is left alone (a
// fenced block or an inline span showing `<!-- -->` is showing it), the
// frontmatter is left alone, and every newline inside a comment is kept, so
// line numbers, block references and paragraph breaks land where they did.

import { closesFence, fenceOpener, type Fence } from "./fences.ts";

/** `src` with its comments blanked, for a reader who is not its author. */
export function stripPrivateComments(src: string): string {
  if (!src.includes("<!--") && !src.includes("%%")) return src;
  let start = 0;
  const fm = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(src);
  if (fm) start = fm[0].length;
  const out: string[] = [src.slice(0, start)];
  const lines = src.slice(start).split("\n");
  let fence: Fence | null = null;
  let open: "<!--" | "%%" | null = null;
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const nl = n < lines.length - 1 ? "\n" : "";
    if (open === null) {
      if (fence !== null) {
        if (closesFence(line, fence)) fence = null;
        out.push(line + nl);
        continue;
      }
      const opener = fenceOpener(line);
      if (opener !== null) {
        fence = opener;
        out.push(line + nl);
        continue;
      }
    }
    let kept = "";
    let i = 0;
    while (i < line.length) {
      if (open !== null) {
        const close = line.indexOf(open === "<!--" ? "-->" : "%%", i);
        if (close < 0) {
          i = line.length;
          break;
        }
        i = close + (open === "<!--" ? 3 : 2);
        open = null;
        continue;
      }
      const ch = line[i];
      if (ch === "`") {
        // An inline code span: copied whole, comment markers and all.
        let run = 1;
        while (line[i + run] === "`") run++;
        const tick = "`".repeat(run);
        const end = line.indexOf(tick, i + run);
        const stop = end < 0 ? i + run : end + run;
        kept += line.slice(i, stop);
        i = stop;
        continue;
      }
      if (line.startsWith("<!--", i)) {
        open = "<!--";
        i += 4;
        continue;
      }
      if (line.startsWith("%%", i)) {
        open = "%%";
        i += 2;
        continue;
      }
      kept += ch;
      i++;
    }
    // A line that was nothing but a comment leaves an empty line, not one
    // of trailing spaces.
    out.push((kept.trim() === "" ? "" : kept) + nl);
  }
  return out.join("");
}
