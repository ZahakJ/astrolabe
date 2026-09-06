// The `folders:` a note's frontmatter declares, read on the client.
//
// The server's parser (server/noteFrontmatter.ts) is the authority for what
// the site shows; this one exists so the tree's "Collections…" popover can
// tick the boxes a note already has WITHOUT a round trip through the index,
// and it accepts the same spellings: a flow list, a block list, a comma
// scalar, a bare scalar, and the singular `folder:` key. Anything that is
// not a legal slug is dropped, as the server drops it.

import { folderSlug } from "../../shared/publicFolders.ts";

function block(content: string): string | null {
  const m = /^(?:﻿)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(content);
  return m ? m[1] : null;
}

/** The values a frontmatter LIST key holds, in every spelling YAML gives:
 *  a flow list, a block list, a comma scalar, a bare scalar. `clean` decides
 *  what a value becomes (a slug, a tag) and drops it by answering null. */
export function frontmatterListOf(content: string, keys: readonly string[], clean: (raw: string) => string | null): string[] {
  const fm = block(content);
  if (fm === null) return [];
  const lines = fm.split(/\r?\n/);
  const out: string[] = [];
  const add = (raw: string): void => {
    const value = clean(raw.trim().replace(/^["']|["']$/g, ""));
    if (value !== null && value !== "" && !out.includes(value)) out.push(value);
  };
  const keyRe = new RegExp(`^(${keys.join("|")})\\s*:\\s*(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const m = keyRe.exec(lines[i]);
    if (!m) continue;
    const value = m[2].trim();
    if (value === "" ) {
      // A block list under the key.
      for (let j = i + 1; j < lines.length; j++) {
        const item = /^\s+-\s*(.+)$/.exec(lines[j]);
        if (!item) break;
        add(item[1]);
      }
    } else if (value.startsWith("[")) {
      for (const part of value.replace(/^\[|\]$/g, "").split(",")) add(part);
    } else {
      for (const part of value.split(",")) add(part);
    }
  }
  return out;
}

export function foldersOf(content: string): string[] {
  return frontmatterListOf(content, ["folders", "folder"], folderSlug);
}

/** The note's frontmatter tags (`tags:` / `tag:`), lowercased, `#` dropped.
 *  Inline `#tags` in the body are not here: they cannot be edited from a
 *  checkbox, and the popover says so. */
export function tagsOf(content: string): string[] {
  return frontmatterListOf(content, ["tags", "tag"], (raw) => raw.replace(/^#/, "").trim().toLowerCase() || null);
}
