// Build the desktop app under YOUR name, with YOUR icon.
//
//   node scripts/rebrand.mjs --name "Marginalia" --icon ~/marginalia.png
//   npm --prefix desktop run dist
//
// What the app calls itself at runtime — tray, window icon, About, the
// launcher entry — is a setting (Settings → Device → This app), and an update
// never touches it. What this script changes is the build: the product name
// electron-builder stamps on the executable and its installers, and the icon
// baked into them. Run it, then package; every artifact in desktop/release is
// yours. The updater still follows the release page the build was made from
// (electron/update.ts, RELEASES_PAGE), so a rebranded build of this
// repository keeps taking this repository's releases — swap that constant if
// you publish your own.
//
// The icon must be a square PNG, 512 px or larger; electron-builder derives
// the .ico and the Linux sizes from it.

import { copyFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const name = get("--name");
const icon = get("--icon");
if (!name && !icon) {
  console.error('usage: node scripts/rebrand.mjs --name "Your Name" [--icon path/to/icon.png]');
  process.exit(1);
}

if (name) {
  const clean = name.trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .'&-]{0,59}$/u.test(clean)) {
    console.error("rebrand: the name must be 1–60 letters, digits, spaces or . ' & -");
    process.exit(1);
  }
  const yml = path.join(root, "desktop", "electron-builder.yml");
  let text = readFileSync(yml, "utf8");
  text = text.replace(/^productName: .*$/m, `productName: ${clean}`).replace(/^copyright: .*$/m, `copyright: ${clean}`);
  writeFileSync(yml, text);
  console.log(`rebrand: productName → ${clean}  (${path.relative(root, yml)})`);
}

if (icon) {
  const src = path.resolve(icon);
  if (!existsSync(src) || !src.toLowerCase().endsWith(".png")) {
    console.error("rebrand: --icon must be an existing .png");
    process.exit(1);
  }
  const head = readFileSync(src).subarray(0, 24);
  const width = head.readUInt32BE(16);
  const height = head.readUInt32BE(20);
  if (width !== height || width < 512) {
    console.error(`rebrand: the icon is ${width}×${height}; it must be square and at least 512 px`);
    process.exit(1);
  }
  const dst = path.join(root, "desktop", "icons", "icon.png");
  copyFileSync(src, dst);
  console.log(`rebrand: icon → ${path.relative(root, dst)} (${width}×${height})`);
}
console.log("rebrand: now `npm --prefix desktop run dist`");
