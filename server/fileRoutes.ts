// Attachments: serving, uploads, the drawing's SVG twin, the lists. Mounted
// from server/api.ts below the auth guard; moved out of that file unchanged.

import { Hono } from "hono";
import { ATTACHMENT_TYPES, contentTypeFor, extensionOf, normalizeFolder, uploadDestination } from "../shared/attachments.ts";
import { Readable } from "node:stream";
import { UPLOAD_MAX_BYTES, uploadCapMb } from "../shared/limits.ts";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { UploadResult } from "../shared/types.ts";
import { VaultError, emitEvent, normalizeRel, noteExists, safeAbs, statAttachment, suppressWatcherEcho } from "./vault.ts";
import { attachmentLocation } from "./site.ts";
import { createReadStream, createWriteStream, promises as fsp } from "node:fs";
import { drawingSvgPath, isDrawingPath } from "../shared/noteFormat.ts";
import { isAllowedAttachment, listImageAttachments, registerAttachment } from "./indexer.ts";
import { isPublishLimited } from "./auth.ts";
import { listUnusedAttachments } from "./unusedAttachments.ts";
import { parseByteRange } from "../shared/byteRange.ts";
import path from "node:path";
import { requiredQuery } from "./requestBody.ts";
import { settingsAssetPaths } from "./settings.ts";

export const fileRoutes = new Hono();

fileRoutes.get("/file", async (c) => {
  const relQuery = requiredQuery(c.req.query("path"), "path");
  // Visitors may fetch only attachments embedded/linked by published notes —
  // checked before stat so unpublished files 404 without revealing existence.
  // Settings-named assets (dashboard home banner, logo) are visitor-visible
  // by definition: the admin pointed the public homepage at them.
  // PUBLIC here means "a visitor may have this", and it decides two separate
  // things: whether this request is answered at all, and whether the answer
  // may be cached by anything between us and the reader.
  const rel = normalizeRel(relQuery);
  const publicFile = isAllowedAttachment(rel) || settingsAssetPaths().has(rel);
  if (isPublishLimited(c) && !publicFile) {
    throw new VaultError(404, `File not found: ${rel}`);
  }
  const file = await statAttachment(relQuery);

  const etag = `"${file.size.toString(16)}-${Math.round(file.mtimeMs).toString(16)}"`;
  const baseHeaders: Record<string, string> = {
    "Content-Type": contentTypeFor(file.rel),
    "ETag": etag,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    // A PUBLISHED attachment is public by definition, so let the browser and
    // the CDN in front of us hold it: every one of these used to be `no-cache`,
    // which meant a reader on the other side of the world pulled the whole
    // gallery back through the tunnel on every visit — measured at 1.3 MB and
    // a 6.3 s largest-contentful-paint for one home page. Five minutes fresh,
    // then served stale for an hour while it revalidates behind the reader:
    // long enough to help, short enough that unpublishing a note takes its
    // pictures off the edge in minutes rather than days. Anything a visitor
    // may NOT have stays uncacheable and private, so a shared cache can never
    // hold a file the owner has not published.
    "Cache-Control": publicFile
      ? "public, max-age=300, stale-while-revalidate=3600"
      : "private, no-cache",
    ...(publicFile ? {} : { Vary: "Cookie" }),
  };
  // SVG/PDF can carry scripts — sandbox them so they can't run in our origin.
  if (/\.(svg|pdf|html?)$/i.test(file.rel)) {
    baseHeaders["Content-Security-Policy"] = "sandbox";
  }

  const ifNoneMatch = c.req.header("if-none-match");
  if (ifNoneMatch && ifNoneMatch.split(",").some((t) => t.trim() === etag || t.trim() === `W/${etag}`)) {
    return c.body(null, 304, { "ETag": etag });
  }

  // shared/byteRange.ts — the pocket's /api/file asks the same parser.
  const asked = parseByteRange(c.req.header("range"), file.size);
  if (asked === "unsatisfiable") {
    return c.body(null, 416, { "Content-Range": `bytes */${file.size}` });
  }
  const range = asked;

  const start = range?.start ?? 0;
  const end = range?.end ?? file.size - 1;
  const length = file.size === 0 ? 0 : end - start + 1;
  const nodeStream =
    file.size === 0 ? Readable.from([]) : createReadStream(file.abs, { start, end });
  nodeStream.on("error", (err: unknown) => console.error(`file stream error for ${file.rel}:`, err));
  const body = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  const headers: Record<string, string> = {
    ...baseHeaders,
    "Content-Length": String(length),
  };
  if (range) {
    headers["Content-Range"] = `bytes ${start}-${end}/${file.size}`;
    return c.body(body, 206, headers);
  }
  return c.body(body, 200, headers);
});

// ------------------------------------------------------- attachment uploads

/** ISO-BMFF brand → canonical extension (the `ftyp` box at offset 4 is what
 *  separates an .avif from an .m4a from a .mov — they share one container). */
function brandExt(brand: string): string {
  if (brand === "avif" || brand === "avis") return "avif";
  if (brand.startsWith("heic") || brand.startsWith("heix") || brand === "mif1" || brand === "hevc") {
    return "heic";
  }
  if (brand === "M4A ") return "m4a";
  if (brand === "qt  ") return "mov";
  return "mp4";
}

/** Sniff the actual attachment type from file bytes — extension and
 *  Content-Type are attacker-controlled and ignored. Returns the canonical
 *  extension, or null when the bytes are not a type we accept.
 *
 *  `hint` is the uploader's own extension, consulted ONLY to pick between
 *  aliases the bytes cannot distinguish (jpg/jpeg, ogg/oga/opus, mp4/m4v);
 *  the family is always decided by the magic number. */
function sniffAttachmentType(buf: Buffer, hint = ""): string | null {
  const alias = (canonical: string, others: string[]): string =>
    others.includes(hint) ? hint : canonical;
  const latin = (from: number, to: number): string =>
    buf.length >= to ? buf.toString("latin1", from, to) : "";

  // ── images ──
  if (buf.length >= 8 && buf[0] === 0x89 && latin(1, 4) === "PNG") return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return alias("jpg", ["jpeg"]);
  }
  if (buf.length >= 6 && /^GIF8[79]a/.test(latin(0, 6))) return "gif";
  if (latin(0, 4) === "RIFF" && latin(8, 12) === "WEBP") return "webp";
  if (latin(0, 2) === "BM" && buf.length >= 14) return "bmp";
  // ── documents ──
  if (latin(0, 5) === "%PDF-") return "pdf";
  // ── audio ──
  if (latin(0, 3) === "ID3") return "mp3";
  if (latin(0, 4) === "RIFF" && latin(8, 12) === "WAVE") return "wav";
  if (latin(0, 4) === "OggS") return alias("ogg", ["oga", "opus", "ogv"]);
  if (latin(0, 4) === "fLaC") return "flac";
  // ── ISO base media: mp4 / m4a / mov / avif / heic ──
  if (latin(4, 8) === "ftyp") {
    const ext = brandExt(latin(8, 12));
    return ext === "mp4" ? alias("mp4", ["m4v"]) : ext;
  }
  // ── Matroska / WebM ── (one magic number; the uploader's own `.mkv` is
  // kept, since a WebM is a Matroska file with a narrower codec list)
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return alias("webm", ["mkv"]);
  }
  // An mp3 with no ID3 tag opens on a raw MPEG audio frame sync. Checked LAST
  // of the binary formats: 0xFF 0xEx is two bytes, weak enough that anything
  // with a real magic number must get its say first.
  if (buf.length >= 4 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3";
  // SVG has no magic bytes: accept text that opens with an <svg …> root
  // (optionally after a BOM, an XML declaration, comments, or a DOCTYPE).
  const head = buf.toString("utf8", 0, Math.min(buf.length, 2048)).replace(/^\uFEFF/, "");
  const trimmed = head
    .replace(/^\s*<\?xml[^>]*\?>/i, "")
    .replace(/^(\s*<!--[\s\S]*?-->)*/, "")
    .replace(/^\s*<!DOCTYPE[^>]*>/i, "")
    .replace(/^(\s*<!--[\s\S]*?-->)*/, "")
    .trimStart();
  if (/^<svg[\s>]/i.test(trimmed)) return "svg";
  return null;
}

/** Defense-in-depth scrub for uploaded SVGs. The primary defense is that
 *  /api/file serves them under `Content-Security-Policy: sandbox` + nosniff,
 *  but the stored bytes should not depend on every future serving path
 *  repeating those headers: strip script/foreignObject subtrees, on* event
 *  handler attributes, and javascript: URLs at write time. Regex scrubbing is
 *  not a full XML sanitizer — it is belt-and-suspenders, not the belt. */
function sanitizeSvg(src: string): string {
  return src
    .replace(/<script\b[\s\S]*?(?:<\/script\s*>|$)/gi, "")
    .replace(/<foreignObject\b[\s\S]*?(?:<\/foreignObject\s*>|$)/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/((?:xlink:)?href\s*=\s*)(["']?)\s*javascript:[^"'\s>]*\2/gi, "$1$2#$2");
}

/** Client filename → safe basename (no extension): directories stripped,
 *  anything outside letters/digits/space/._- dropped, sensible fallback. */
function sanitizeBaseName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "";
  const noExt = base.replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const clean = noExt
    .replace(/[^\p{L}\p{N} ._-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);
  return clean || `upload-${new Date().toISOString().slice(0, 10)}`;
}

// Admin-only via the auth guard (POST on a non-exempt path). Multipart field
// "file"; bytes sniffed for a type we accept; stored in the folder the
// attachment-location setting resolves to (vault-relative, created on demand)
// with a collision-free sanitized name. The optional field "dir" names the
// vault folder the upload happened IN — the open note's folder, or the tree
// row it was dropped on — which is what the "same folder" and "subfolder"
// modes are relative to; the other two modes ignore it.
fileRoutes.post("/upload", async (c) => {
  let form: Record<string, unknown>;
  try {
    form = await c.req.parseBody();
  } catch {
    throw new VaultError(400, "Invalid multipart body");
  }
  const file = form.file;
  if (!(file instanceof File)) {
    throw new VaultError(400, 'Multipart field "file" (the attachment) is required');
  }
  // THE BYTES ARE SNIFFED FROM THEIR HEAD, not from a copy of the whole file:
  // a film may be hundreds of megabytes (shared/limits.ts), and the old
  // `Buffer.from(await file.arrayBuffer())` held a second copy of every one.
  const head = Buffer.from(await file.slice(0, 4096).arrayBuffer());
  const ext = sniffAttachmentType(head, extensionOf(typeof file.name === "string" ? file.name : ""));
  if (!ext) {
    // CODED, so the client can say it in the reader's language (see the API
    // section of CONTRACTS: the prose here is for a log and for curl). The
    // code kept its name through the widening from images to every accepted
    // attachment — it is a wire contract, and what it means ("the bytes are
    // not a kind this vault takes") did not change.
    throw new VaultError(
      400,
      `Not a recognized attachment (${[...new Set(Object.keys(ATTACHMENT_TYPES))].join(", ")})`,
      "upload_not_image",
    );
  }
  // The cap is the SNIFFED kind's: a film has its own (shared/limits.ts).
  const cap = uploadCapMb(ext) * 1024 * 1024;
  if (file.size > cap) {
    throw new VaultError(413, `File too large (${cap} bytes max)`);
  }
  // `dir` is the folder the upload happened IN — CONTEXT, not a destination.
  // The attachment-LOCATION setting decides what that means: "same folder" and
  // "subfolder" are relative to it, "vault root" and "specified" ignore it.
  // It is advisory and untrusted either way: normalizeFolder tidies it, and
  // safeAbs in the loop below is what actually refuses anything outside the
  // vault. There is deliberately no "must already exist" check — "subfolder"
  // mode creates its folder on first upload, which is the whole point of it.
  const context = typeof form.dir === "string" ? normalizeFolder(form.dir) : "";
  // A FILE DROPPED ON A FOLDER IS FILED THERE (shared/attachments.ts,
  // uploadDestination). `place=here` is the client saying the drop was a
  // filing, and the folder aimed at is then the answer for every type.
  const dir = uploadDestination(attachmentLocation(), context, ext, form.place === "here");
  const base = sanitizeBaseName(file.name ?? "");
  // First free filename: name.ext, name-2.ext, name-3.ext, …
  let rel = "";
  let abs = "";
  for (let i = 1; i <= 200; i++) {
    const candidate = normalizeRel(`${dir}/${i === 1 ? base : `${base}-${i}`}.${ext}`);
    const candidateAbs = safeAbs(candidate); // throws 400/404 on unsafe config/paths
    try {
      await fsp.access(candidateAbs);
    } catch {
      rel = candidate;
      abs = candidateAbs;
      break;
    }
  }
  if (!rel) throw new VaultError(409, "Could not find a free filename for the upload");
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  if (ext === "svg") {
    await fsp.writeFile(abs, Buffer.from(sanitizeSvg(Buffer.from(await file.arrayBuffer()).toString("utf8")), "utf8"));
  } else {
    // Streamed to disk: see the sniff above.
    await pipeline(Readable.fromWeb(file.stream() as unknown as WebReadableStream), createWriteStream(abs));
  }
  // Register now — the picker and banner resolution must see it before the
  // watcher debounce echoes the write.
  registerAttachment(rel);
  const result: UploadResult = { path: rel };
  return c.json(result);
});

// THE PICTURE BESIDE THE DRAWING. The drawing surface exports an SVG of the
// scene on every save and puts it here, and that file is what the reading
// view, the blog, a library lesson and a visitor's page show for
// `![[sketch.excalidraw]]` — so nobody but the owner ever downloads the
// editor to look at a sketch. Admin only; the path names the DRAWING and the
// picture lands as `<drawing>.svg` beside it, never anywhere the client
// chooses. The bytes are checked to be an <svg> document and served back by
// /api/file under the same sandboxing CSP as every other attachment.
fileRoutes.put("/drawing-svg", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const rel = normalizeRel(requiredQuery(c.req.query("path"), "path"));
  if (!isDrawingPath(rel)) throw new VaultError(400, `Not a drawing: ${rel}`);
  if (!(await noteExists(rel))) throw new VaultError(404, `Drawing not found: ${rel}`);
  const svg = await c.req.text();
  if (svg.length > UPLOAD_MAX_BYTES) throw new VaultError(413, `File too large (${UPLOAD_MAX_BYTES} bytes max)`);
  if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(svg)) throw new VaultError(400, "Body must be an <svg> document");
  const target = drawingSvgPath(rel);
  const abs = safeAbs(target);
  let existed = true;
  try {
    await fsp.access(abs);
  } catch {
    existed = false;
  }
  suppressWatcherEcho(target);
  await fsp.writeFile(abs, svg, "utf8");
  registerAttachment(target);
  emitEvent({ kind: existed ? "changed" : "created", path: target });
  return c.json({ path: target });
});

// The banner picker's list: every indexed image attachment. Admin-eyes-only —
// visitors would learn unpublished filenames from it, so they get the same
// 404 an unknown route answers.
fileRoutes.get("/attachments", (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  return c.json(listImageAttachments());
});

// The files no note references (server/unusedAttachments.ts): the delete
// previews' complement. Admin-eyes-only for the same reason as the list
// above and the trash — every row names a vault path — so a visitor (and an
// admin previewing as one) gets the 404 an unknown route answers. Read-only:
// the sweep itself goes through DELETE /api/attachment, one file at a time,
// so every move lands in `.trash/` with an origin and an Undo.
fileRoutes.get("/attachments/unused", async (c) => {
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  return c.json(await listUnusedAttachments());
});
