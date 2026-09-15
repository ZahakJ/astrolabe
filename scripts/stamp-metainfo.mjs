// Stamp the AppStream file's <release> with package.json's version and
// today's date, from desktop/appstream/ (tracked, placeholders) into
// desktop/build/ (ignored), which electron-builder.yml maps into the deb and
// the pacman package. Run before a desktop build; check-desktop runs it too.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const src_ = path.join(root, "desktop", "appstream", "dev.astrolabe.desktop.metainfo.xml");
const file = path.join(root, "desktop", "build", "dev.astrolabe.desktop.metainfo.xml");
const date = process.argv[2] || new Date().toISOString().slice(0, 10);
mkdirSync(path.dirname(file), { recursive: true });
const src = readFileSync(src_, "utf8");
const out = src.replace(/<release version="[^"]*" date="[^"]*"\/>/, `<release version="${version}" date="${date}"/>`);
writeFileSync(file, out);
console.log(`  metainfo stamped ${version} ${date}`);
