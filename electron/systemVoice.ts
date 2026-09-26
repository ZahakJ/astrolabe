// THE VOICE THE READER CHOSE IN WINDOWS (docs/read-aloud.md, "This device's
// voices").
//
// A page cannot see it. Chromium lists Windows' voices in registry order and
// marks the first of the whole list `default`, whichever voice Settings →
// Time & language → Speech → "Choose a voice" names — so a reader who chose
// Microsoft Paul heard Hortense, and had no reason to think the app had even
// looked. The desktop app is not a page: it can read the same registry value
// Settings writes, and hand the renderer the voice's NAME (the token's
// description, which is exactly what Chromium shows as `voice.name`), so the
// device voice that stands in for French is the one he chose.
//
//   HKCU\Software\Microsoft\Speech_OneCore\Voices  DefaultTokenId  → the token
//   <token>                                        (default)       → its name
//
// then the same under Speech (the older SAPI store), for a machine whose
// OneCore key is absent. `reg.exe` is in System32 on every Windows; nothing
// here writes. Anything unexpected answers null and the renderer chooses the
// way it does in a browser.

import { execFile } from "node:child_process";

const STORES = ["HKCU\\Software\\Microsoft\\Speech_OneCore\\Voices", "HKCU\\Software\\Microsoft\\Speech\\Voices"];

/** A REG_SZ value out of `reg query` output: the text after the type on the
 *  first line that has one. The value's own name column is localized
 *  ("(Default)", "(par défaut)"), so it is not what is matched. */
export function regValue(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    const m = /\sREG_(?:EXPAND_)?SZ\s+(.+?)\s*$/.exec(line);
    if (m) return m[1];
  }
  return null;
}

function query(key: string, value: string | null): Promise<string | null> {
  return new Promise((resolve) => {
    const args = ["query", key, ...(value === null ? ["/ve"] : ["/v", value])];
    execFile("reg", args, { windowsHide: true, timeout: 5000, encoding: "utf8" }, (err, stdout) => {
      resolve(err ? null : regValue(stdout));
    });
  });
}

/** The name of the voice Windows' Settings chose, or null (not Windows, no
 *  choice made, or a registry that does not answer). */
export async function windowsSystemVoice(platform: NodeJS.Platform = process.platform): Promise<string | null> {
  if (platform !== "win32") return null;
  for (const store of STORES) {
    const token = await query(store, "DefaultTokenId");
    if (!token) continue;
    const name = await query(token, null);
    if (name) return name;
  }
  return null;
}
