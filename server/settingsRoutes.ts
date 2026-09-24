// Instance settings, the editor theme's mirror, the font previews and the
// operator's own faces. Mounted from server/api.ts below the auth guard; moved
// out of that file unchanged.

import { Hono } from "hono";
import { CUSTOM_FONT_MAX_BYTES, customFileOf, customFontExists, deleteCustomFont, hasPlausibleTableDirectory, isCustomFileName, saveCustomFont, sniffFontFormat } from "./customFonts.ts";
import { FOLLOW_THEME } from "../shared/themes.ts";
import { FONT_SLOTS, buildFaceListCss, buildFontCss, catalogSlotIds, cleanFontSlots, customSlotIds, ensureFontsCached, pickableIds, slotsAreSystem } from "./fonts.ts";
import type { PublicThemeInfo } from "../shared/types.ts";
import { VaultError } from "./vault.ts";
import { assertCredentialed } from "./syncRoutes.ts";
import { collectionRows } from "./indexer.ts";
import { fontSlots, patchSettings, setAdminTheme, settingsResponse } from "./settings.ts";
import { isPublishLimited } from "./auth.ts";
import { jsonBody } from "./requestBody.ts";
import { themePinnedByEnv, themePref, visitorTheme } from "./site.ts";

export const settingsRoutes = new Hono();

// ------------------------------------------------------------------ settings
// Instance settings (ASTROLABE_DATA/settings.json): siteName / tagline / footer /
// defaultTheme / publicLayout / blogLocale / excludeTags / commentsEnabled /
// favicon / logo / home { mode, note, banner }. A stored value overrides its
// env default, live. Admin-eyes-only both ways — the visitor-relevant subset
// travels via /api/me instead. GET answers a 404 to visitors (like
// /api/attachments); PATCH is admin-gated by the auth guard (mutation on a
// non-exempt path). Both answer the stored keys plus `effective` (the merged
// values the site is using right now).

settingsRoutes.get("/settings", (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  return c.json(settingsResponse());
});

// THE COLLECTIONS AS THE SERVER SEES THEM — settings rows, tag pages and,
// under folders, the derived categories, merged (server/indexer.ts
// collectionRows). Admin only: the rows carry vault folders. The tree's
// popover ticks against this list rather than against settings alone, or a
// collection declared by a tag page could not be joined by right-click.
settingsRoutes.get("/collections", (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  return c.json(collectionRows());
});

settingsRoutes.patch("/settings", async (c) => {
  const body = await jsonBody(c);
  // The sync keys are the ones that can send the vault off this machine, so
  // they need a real credential in every mode — see assertCredentialed().
  // Everything else in this payload is instance styling, which open local
  // mode may legitimately let a trusted LAN change.
  if (["gitSync", "gitToken", "gitUser"].some((k) => Object.prototype.hasOwnProperty.call(body, k))) {
    assertCredentialed();
  }
  // Typography is the one setting with a prerequisite on disk: the chosen
  // families must be cached under ASTROLABE_DATA/fonts/catalog before
  // settings.json names them, or the site would link a stylesheet with no
  // faces behind it. Validate the ids (400), fetch what is missing (502),
  // and only then write — a download failure leaves settings untouched.
  if (Object.prototype.hasOwnProperty.call(body, "fonts") && body.fonts !== null) {
    const slots = cleanFontSlots(body.fonts, fontSlots());
    await ensureFontsCached(catalogSlotIds(slots));
    // An UPLOADED id is validated for SHAPE by cleanFontSlots and for
    // EXISTENCE here — the same "the faces are on disk before settings.json
    // names them" rule the catalog download enforces, one line down from it.
    for (const id of customSlotIds(slots)) {
      if (!(await customFontExists(id))) {
        throw new VaultError(400, `Uploaded font not found: ${customFileOf(id) ?? id}`);
      }
    }
  }
  return c.json(patchSettings(body));
});

// ------------------------------------------------------------ editor theme
// POST /api/theme { theme } — the admin's own theme, mirrored to the server.
//
// WHY A ROUTE AT ALL. The public site's default theme follows the admin's
// editor theme, and that theme has only ever lived in ONE place the server
// cannot see: `localStorage["astrolabe.theme"]` in whichever browser the owner
// happens to be writing in. So the browser tells it — once, after the pick has
// settled (the client debounces; see client/state.ts).
//
// Why not PATCH /api/settings: that answers with the whole settings response,
// which counts published notes, lists every image attachment and re-reads the
// font catalog. This fires on a theme click. It writes one key, validates it
// against the shared theme list, no-ops when unchanged, and answers with the
// two facts the chrome puts on screen ("Visitors see Cinnabar — following your
// editor theme"). Admin-gated by the auth guard like any other mutation, so a
// visitor's browser can never move the site's default; an admin PREVIEWING as
// a visitor is a visitor here too, and the client stands down while previewing
// rather than relying on the 401.
settingsRoutes.post("/theme", async (c) => {
  const body = await jsonBody(c);
  setAdminTheme(body.theme); // 400 on anything but a theme id (built-in or custom:)
  const info: PublicThemeInfo = {
    mode: themePref() === FOLLOW_THEME ? "follow" : "pinned",
    theme: visitorTheme(),
    ...(themePinnedByEnv() ? { env: true } : {}),
  };
  return c.json(info);
});

// The settings panel's live preview: the same generated CSS as
// /api/site-fonts.css but under a "AstrolabePreview…" family prefix and with no
// :root remap, so the panel can show faces the reader has PICKED but not yet
// saved. Admin-eyes-only (it can trigger a download, and it describes an
// unsaved state) — 404 to visitors exactly like GET /api/settings. Failures
// degrade to whatever is already cached instead of erroring: a preview that
// falls back to the system stack is a fine preview, a toast per keystroke is
// not.
settingsRoutes.get("/font-preview.css", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const q = c.req.query();
  // The size-adjust dial travels too: it changes what the specimen LOOKS
  // like without changing a single id, and the whole point of the dial is
  // being judged against the Latin line beside it.
  const adjust = Number(q.sizeAdjust);
  const slots = cleanFontSlots({
    ...(q.prose ? { prose: q.prose } : {}),
    ...(q.ui ? { ui: q.ui } : {}),
    ...(q.mono ? { mono: q.mono } : {}),
    ...(q.arabic ? { arabic: q.arabic } : {}),
    ...(q.sizeAdjust && Number.isFinite(adjust) ? { arabicSizeAdjust: adjust } : {}),
  });
  for (const id of catalogSlotIds(slots)) {
    try {
      await ensureFontsCached([id]);
    } catch (err) {
      console.warn(`astrolabe: font preview could not cache ${id}:`, err);
    }
  }
  const css = slotsAreSystem(slots) ? "" : await buildFontCss(slots, { prefix: "AstrolabePreview", root: false });
  return c.body(css, 200, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-cache" });
});

// ── The operator's own faces ────────────────────────────────────────────────
// Uploading a font is the one thing this product could not do that every real
// instance eventually needs: the catalog is twenty-seven Google families, and
// a serious Arabic vault runs on a licensed face that is on nobody's CDN.
//
// Everything here is admin-only. The GETs gate themselves (the /api/fonts/
// prefix is exempt from the auth guard so a VISITOR can fetch the face BYTES,
// which means a route that lists or manages them has to say so itself); the
// POST and the DELETE are mutations, which the guard now 401s under that
// prefix like anywhere else — including an admin previewing as a visitor.

// Multipart field "file". The FORMAT is decided by the magic bytes and by
// nothing else: not the extension (caller text), not the multipart
// content-type (caller text). A PNG renamed .woff2 is a 400 here, which is
// the whole point — the file is about to be served back with a font MIME.
settingsRoutes.post("/fonts/upload", async (c) => {
  let form: Record<string, unknown>;
  try {
    form = await c.req.parseBody();
  } catch {
    throw new VaultError(400, "Invalid multipart body", "font_bad_body");
  }
  const file = form.file;
  if (!(file instanceof File)) {
    throw new VaultError(400, 'Multipart field "file" (the font) is required', "font_no_file");
  }
  if (file.size > CUSTOM_FONT_MAX_BYTES) {
    throw new VaultError(413, `Font too large (${CUSTOM_FONT_MAX_BYTES} bytes max)`, "font_too_large");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const format = sniffFontFormat(buf);
  if (!format) {
    throw new VaultError(400, "Not a recognized font file (woff2, woff, ttf, otf)", "font_unrecognized");
  }
  // Magic bytes say "this claims to be a font"; they do not say "a browser can
  // use this". A 4.9 MB file of literal `wOF2` plus five million zeros passed
  // the sniff, was stored, was served, and rendered nothing — a permanently
  // dead face the operator would have to work out for themselves. One cheap
  // structural read (a plausible table count, a directory that fits inside the
  // file) turns that into a 400 at upload time.
  if (!hasPlausibleTableDirectory(buf, format)) {
    throw new VaultError(400, "That font file is damaged (its table directory is unreadable)", "font_damaged");
  }
  return c.json(await saveCustomFont(file.name ?? "", format, buf));
});

// Deleting a face that a slot still names would leave settings.json pointing
// at nothing and the site silently back on its system stack — so a font in
// use is a 409 that NAMES the slots, and the panel offers to clear them.
settingsRoutes.delete("/fonts/custom/:file", async (c) => {
  const file = c.req.param("file");
  if (!isCustomFileName(file)) throw new VaultError(400, "Invalid font file name", "font_bad_name");
  const id = `custom:${file}`;
  const slots = fontSlots();
  const inUse = FONT_SLOTS.filter((slot) => slots[slot] === id);
  if (inUse.length > 0) {
    throw new VaultError(
      409,
      `That font is in use (${inUse.join(", ")}) — choose another face first`,
      "font_in_use",
    );
  }
  await deleteCustomFont(file);
  return c.json({ ok: true });
});

// The font PICKER's own faces: one @font-face per pickable id, under a
// "AstrolabeOpt-…" family, so every option row renders IN THE FACE IT NAMES —
// and the Arabic options render their Arabic sample in it too. Asked for one
// GROUP at a time as that group opens, which is why the ids are a parameter
// rather than "all of them": twenty-seven families at once is a megabyte of
// downloads to draw a menu.
//
// Admin-eyes-only for /api/font-preview.css's reason (it can trigger a
// download), and just as forgiving: a family that will not cache is skipped,
// and the option row falls back to the panel's own type rather than erroring.
settingsRoutes.get("/font-faces.css", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const wanted = (c.req.query("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 40);
  const allowed = new Set(await pickableIds());
  const ids = [...new Set(wanted.filter((id) => allowed.has(id)))];
  for (const id of ids) {
    try {
      await ensureFontsCached([id]);
    } catch (err) {
      console.warn(`astrolabe: font picker could not cache ${id}:`, err);
    }
  }
  return c.body(await buildFaceListCss(ids), 200, {
    "Content-Type": "text/css; charset=utf-8",
    "Cache-Control": "no-cache",
  });
});
