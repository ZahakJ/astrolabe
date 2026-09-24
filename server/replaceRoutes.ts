// Vault-wide search and replace. Mounted from server/api.ts below the auth
// guard; moved out of that file unchanged.

import { Hono } from "hono";
import type { ReplaceResult } from "../shared/types.ts";
import { makeBodyTest, previewReplace, replaceTransform, screenTargets, type ReplaceSpec, type ReplaceTarget } from "./searchReplace.ts";
import { VaultError, assertNotePath, normalizeRel } from "./vault.ts";
import { applyBulk } from "./bulkRewrite.ts";
import { canonicalTag } from "./tagLabels.ts";
import { isPublishLimited } from "./auth.ts";
import { jsonBody, requiredString } from "./requestBody.ts";
import { replaceCandidates, whenIndexed } from "./indexer.ts";
import { snapshotNow } from "./gitSync.ts";

export const replaceRoutes = new Hono();

// ------------------------------------------------- vault-wide search & replace
//
// The 650-like request, and the one Obsidian answers with "open the folder in
// VS Code". It is last in this section on purpose: it is the scariest verb in
// the product, and it rides on everything above it — the same dry-run-first
// rule, the same engine, the same undo, plus one guard only it needs.
//
// THE FIND FIELD AND THE SCOPE ARE THE SAME BOX. `q` is whatever the reader
// typed into the sidebar's search — its operators (shared/searchQuery.ts)
// narrow which notes are considered, exactly as they narrow the results the
// reader is already looking at. `find` is sent SEPARATELY and used verbatim,
// because a regular expression is not a search query: `\d+:\d+` run through
// the operator tokenizer would lose its middle to a `path:`-shaped rule. The
// client pre-fills it from the same parser and the reader may edit it.
//
// See server/searchReplace.ts for why matching here is exact — no folding, no
// case-insensitivity — and why frontmatter is out of reach.

function replaceSpec(source: {
  find?: string | undefined;
  replace?: string | undefined;
  regex?: unknown;
}): ReplaceSpec {
  return {
    find: source.find ?? "",
    replace: source.replace ?? "",
    regex: source.regex === true || source.regex === "1" || source.regex === "true",
  };
}

replaceRoutes.get("/replace/preview", async (c) => {
  // 404, not 403 — the preview names vault paths and quotes their lines, which
  // is exactly what every other admin GET withholds from a visitor.
  if (isPublishLimited(c)) throw new VaultError(404, "Not found");
  const spec = replaceSpec({
    find: c.req.query("find"),
    replace: c.req.query("replace") ?? "",
    regex: c.req.query("regex"),
  });
  const paths = replaceCandidates(c.req.query("q") ?? "", makeBodyTest(spec), { canonicalTag });
  return c.json(await previewReplace(paths, spec));
});

replaceRoutes.post("/replace", async (c) => {
  const body = await jsonBody(c);
  const spec = replaceSpec({
    find: requiredString(body, "find"),
    replace: typeof body.replace === "string" ? body.replace : "",
    regex: body.regex,
  });
  const targets = readReplaceTargets(body.files);
  if (targets.length === 0) throw new VaultError(400, "Nothing selected", "nothingSelected");

  // THE SNAPSHOT COMES FIRST, and it is the reason this release shipped git
  // history before it shipped the tools that need it. A commit taken after the
  // rewrite records the damage; taken before, it is the way back that survives
  // the undo bundle expiring, the tab closing and the reader going to bed. A
  // repository that is not there, or a tree with nothing to commit, is not an
  // error — the checkbox was an offer, not a precondition.
  let snapshot: string | null = null;
  if (body.snapshot === true) {
    try {
      snapshot = (await snapshotNow()).sha;
    } catch (err) {
      console.error("astrolabe: the snapshot before a vault-wide replace failed", err);
    }
  }

  const { paths, selection, conflicts } = await screenTargets(targets);
  const result = await applyBulk(paths, replaceTransform(spec, selection));
  await whenIndexed();
  const answer: ReplaceResult = { ...result, conflicts, snapshot };
  return c.json(answer);
});

/** The apply's `files` array, screened. Every field is checked here rather
 *  than trusted: this body decides which paths get written and which LINES of
 *  them, and it arrives from a browser. */
function readReplaceTargets(value: unknown): ReplaceTarget[] {
  if (!Array.isArray(value)) throw new VaultError(400, 'Body field "files" must be an array');
  const out: ReplaceTarget[] = [];
  for (const raw of value.slice(0, 5_000)) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.path !== "string" || typeof entry.mtimeMs !== "number") continue;
    const relPath = normalizeRel(entry.path);
    assertNotePath(relPath);
    const lines = Array.isArray(entry.lines)
      ? entry.lines.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0)
      : null;
    out.push({ path: relPath, mtimeMs: entry.mtimeMs, lines });
  }
  return out;
}
