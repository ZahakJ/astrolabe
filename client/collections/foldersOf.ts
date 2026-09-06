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

export function foldersOf(content: string): string[] {
  const fm = block(content);
  if (fm === null) return [];
  const lines = fm.split(/\r?\n/);
  const out: string[] = [];
  const add = (raw: string): void => {
    const slug = folderSlug(raw.trim().replace(/^["']|["']$/g, ""));
    if (slug !== null && !out.includes(slug)) out.push(slug);
  };
  for (let i = 0; i < lines.length; i++) {
    const m = /^(folders?)\s*:\s*(.*)$/.exec(lines[i]);
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
