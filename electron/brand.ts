// THE APP'S NAME AND ICON ARE THE READER'S TO CHOOSE.
//
// Astrolabe is one person's name for it. Someone else running the desktop app
// over their own vault does not want a tray icon, a launcher entry, a window
// icon and an About box that all say a name they did not pick (the owner:
// "what if others want their different name.. they prob don't wanna have the
// executable and its logo have astrolabe in it"). So the name and the icon
// are read at launch from `<userData>/brand.json`, and everything the desktop
// shell draws with the product's identity draws with those instead: the tray,
// its tooltip, the window icon, the About dialog, `app.name`. The site's own
// name (Settings → Site) already titles the window and the sidebar; this is
// the layer beneath it, the one the operating system sees.
//
// AN UPDATE NEVER TOUCHES THIS. The updater swaps the AppImage over its own
// path — a file the reader renamed keeps its name — or runs the Windows
// installer into the program directory; `userData` is neither, and the
// launcher entry this module writes points at the path, not at a build. The
// full rebrand (the executable's own file name and the icon baked into it)
// is a build-time act: scripts/rebrand.mjs, documented beside it.

import { app, dialog, nativeImage, shell, type BrowserWindow } from "electron";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_NAME = "Astrolabe";
const NAME_MAX = 60;
const FILE = "brand.json";
const DIR = "brand";

export interface Brand {
  /** The reader's name for the app, or null for the product's. */
  name: string | null;
  /** Absolute path of the reader's icon, copied under `<userData>/brand/`, or null. */
  icon: string | null;
}

/** What the renderer is told: the name in effect, the icon as a data URL for
 *  the preview (never a file path — the renderer cannot read one), whether
 *  either was set by the reader, and what "install a launcher" means here. */
export interface BrandInfo {
  name: string;
  custom: boolean;
  iconDataUrl: string | null;
  launcher: "desktop-entry" | "start-menu" | "none";
}

let cache: Brand | null = null;

function file(): string {
  return path.join(app.getPath("userData"), FILE);
}

function dir(): string {
  return path.join(app.getPath("userData"), DIR);
}

/** Control characters out, runs of whitespace to one space, 60 characters at
 *  most; the product's own name stored as "nothing set". */
function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
  return name === "" || name === DEFAULT_NAME ? null : name;
}

export function readBrand(): Brand {
  if (cache !== null) return cache;
  let brand: Brand = { name: null, icon: null };
  try {
    const parsed: unknown = JSON.parse(readFileSync(file(), "utf8"));
    if (typeof parsed === "object" && parsed !== null) {
      const p = parsed as Record<string, unknown>;
      const icon = typeof p.icon === "string" && p.icon !== "" ? path.resolve(p.icon) : null;
      brand = {
        name: cleanName(p.name),
        // Only an icon inside our own directory is trusted: brand.json is a
        // plain file, and a path in it pointing anywhere else is not ours.
        icon: icon !== null && icon.startsWith(dir() + path.sep) && existsSync(icon) ? icon : null,
      };
    }
  } catch {
    // no file, or not ours: the product's own identity
  }
  cache = brand;
  return brand;
}

function writeBrand(brand: Brand): void {
  cache = brand;
  if (brand.name === null && brand.icon === null) {
    rmSync(file(), { force: true });
    return;
  }
  mkdirSync(path.dirname(file()), { recursive: true });
  writeFileSync(file(), JSON.stringify(brand, null, 2) + "\n", "utf8");
}

export function brandName(): string {
  return readBrand().name ?? DEFAULT_NAME;
}

/** The icon to draw: the reader's when it exists, else the product's. */
export function brandIcon(defaultIcon: string): string {
  const icon = readBrand().icon;
  return icon !== null && existsSync(icon) ? icon : defaultIcon;
}

/** At ready: the name the OS sees. Called again after every change. */
export function applyBrand(): void {
  app.setName(brandName());
}

function iconDataUrl(icon: string | null): string | null {
  if (icon === null || !existsSync(icon)) return null;
  try {
    if (icon.toLowerCase().endsWith(".svg")) {
      return `data:image/svg+xml;base64,${readFileSync(icon).toString("base64")}`;
    }
    const image = nativeImage.createFromPath(icon);
    if (image.isEmpty()) return null;
    return image.resize({ width: 96, height: 96 }).toDataURL();
  } catch {
    return null;
  }
}

export function brandInfo(): BrandInfo {
  const brand = readBrand();
  return {
    name: brand.name ?? DEFAULT_NAME,
    custom: brand.name !== null || brand.icon !== null,
    iconDataUrl: iconDataUrl(brand.icon),
    launcher: process.platform === "linux" ? "desktop-entry" : process.platform === "win32" ? "start-menu" : "none",
  };
}

export function setBrandName(value: unknown): BrandInfo {
  const brand = { ...readBrand(), name: cleanName(value) };
  writeBrand(brand);
  applyBrand();
  return brandInfo();
}

/** Ask for an image and keep a copy of it under userData — the original may
 *  be on a drive that is not there tomorrow. PNG anywhere; ICO is what a
 *  Windows shortcut can carry; SVG only where a desktop entry can read it. */
export async function pickBrandIcon(win: BrowserWindow | null): Promise<BrandInfo> {
  const extensions = process.platform === "win32" ? ["ico", "png"] : ["png", "svg", "ico"];
  const dialogOpts = { properties: ["openFile" as const], filters: [{ name: "Icon", extensions }] };
  const picked = win ? await dialog.showOpenDialog(win, dialogOpts) : await dialog.showOpenDialog(dialogOpts);
  if (picked.canceled || picked.filePaths.length === 0) return brandInfo();
  const src = picked.filePaths[0];
  const ext = path.extname(src).toLowerCase();
  if (!extensions.includes(ext.slice(1))) return brandInfo();
  if (ext !== ".svg" && nativeImage.createFromPath(src).isEmpty()) return brandInfo(); // not an image
  mkdirSync(dir(), { recursive: true });
  for (const old of ["icon.png", "icon.svg", "icon.ico"]) rmSync(path.join(dir(), old), { force: true });
  const dst = path.join(dir(), `icon${ext}`);
  copyFileSync(src, dst);
  writeBrand({ ...readBrand(), icon: dst });
  return brandInfo();
}

export function clearBrand(): BrandInfo {
  rmSync(dir(), { recursive: true, force: true });
  writeBrand({ name: null, icon: null });
  applyBrand();
  return brandInfo();
}

/** A launcher entry in the reader's own name, with the reader's own icon,
 *  pointing at THIS file — the AppImage wherever they keep it, or the
 *  installed executable. Linux writes a desktop entry the menus read; Windows
 *  writes a Start Menu shortcut (its icon is an .ico or the executable's own;
 *  a PNG cannot be a shortcut's icon and the reader is told so). */
export function installLauncher(defaultIcon: string): { ok: boolean; where: string; note: "png-icon-skipped" | null } {
  const name = brandName();
  let icon = brandIcon(defaultIcon);
  // The product's own icon lives INSIDE the AppImage, on a mount that is gone
  // the moment the app exits — a launcher pointing there has an icon only
  // while the app runs. A copy beside the settings outlives every run.
  if (icon === defaultIcon && existsSync(defaultIcon)) {
    try {
      mkdirSync(dir(), { recursive: true });
      const kept = path.join(dir(), "app-icon.png");
      copyFileSync(defaultIcon, kept);
      icon = kept;
    } catch {
      // the mounted path still works for this run
    }
  }
  if (process.platform === "linux") {
    const target = process.env.APPIMAGE ?? process.execPath;
    const slug = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "astrolabe";
    const appsDir = path.join(app.getPath("home"), ".local", "share", "applications");
    mkdirSync(appsDir, { recursive: true });
    const where = path.join(appsDir, `${slug}.desktop`);
    const entry = [
      "[Desktop Entry]",
      "Type=Application",
      `Name=${name}`,
      "Comment=Notes, and a site made of them",
      `Exec="${target}" %U`,
      `Icon=${icon}`,
      "Terminal=false",
      "Categories=Office;Utility;",
      "MimeType=x-scheme-handler/astrolabe;text/markdown;",
      "StartupWMClass=astrolabe",
      "",
    ].join("\n");
    writeFileSync(where, entry, "utf8");
    return { ok: true, where, note: null };
  }
  if (process.platform === "win32") {
    const where = path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", `${name}.lnk`);
    const ico = icon.toLowerCase().endsWith(".ico");
    const ok = shell.writeShortcutLink(where, "create", {
      target: process.execPath,
      icon: ico ? icon : process.execPath,
      iconIndex: 0,
      description: name,
    });
    return { ok, where, note: ico || readBrand().icon === null ? null : "png-icon-skipped" };
  }
  return { ok: false, where: "", note: null };
}
