// /api/feeds — the Feeds surface's door (docs/feeds.md, server/feeds.ts).
//
// Mounted BELOW the auth guard, and every route here — the GETs too — asks
// for the admin: what the owner reads is the owner's business, and a list of
// feeds is a portrait of a reader. A visitor, or an admin previewing as one,
// is a 401.
//
//   GET  /feeds                 the list, its problems, the unread items
//   GET  /feeds/item?feed&guid  one item, its HTML sanitised for the reader
//   POST /feeds/read            {feed, guid, read}      read or unread one
//   POST /feeds/read-all        {feed?}                 read a feed, or all
//   POST /feeds/keep            {feed, guid}            → {path, fetched}
//   POST /feeds/refresh         a round now; 409 `feedsOff` when fetching is off

import { Hono, type Context } from "hono";
import { isPublishLimited } from "./auth.ts";
import { feedsState, keepItem, markAllRead, markRead, openItem, runRound } from "./feeds.ts";
import { feedsEffective } from "./settings.ts";
import { VaultError } from "./vault.ts";

export const feedRoutes = new Hono();

function adminOnly(c: Context): void {
  if (isPublishLimited(c)) throw new VaultError(401, "Admin session required");
}

async function body(c: Context): Promise<Record<string, unknown>> {
  try {
    const b = (await c.req.json()) as unknown;
    if (typeof b !== "object" || b === null) throw new Error("not an object");
    return b as Record<string, unknown>;
  } catch {
    throw new VaultError(400, "Invalid JSON body");
  }
}

function field(b: Record<string, unknown>, key: string): string {
  const v = b[key];
  if (typeof v !== "string" || v === "") throw new VaultError(400, `Body field "${key}" must be a non-empty string`);
  return v;
}

feedRoutes.get("/feeds", async (c) => {
  adminOnly(c);
  return c.json(await feedsState());
});

feedRoutes.get("/feeds/item", (c) => {
  adminOnly(c);
  const feed = c.req.query("feed") ?? "";
  const guid = c.req.query("guid") ?? "";
  if (feed === "" || guid === "") throw new VaultError(400, "feed and guid are required");
  return c.json(openItem(feed, guid));
});

feedRoutes.post("/feeds/read", async (c) => {
  adminOnly(c);
  const b = await body(c);
  markRead(field(b, "feed"), field(b, "guid"), b.read !== false);
  return c.json({ ok: true });
});

feedRoutes.post("/feeds/read-all", async (c) => {
  adminOnly(c);
  const b = await body(c).catch(() => ({}) as Record<string, unknown>);
  const feed = typeof b.feed === "string" && b.feed !== "" ? b.feed : null;
  return c.json({ read: markAllRead(feed) });
});

feedRoutes.post("/feeds/keep", async (c) => {
  adminOnly(c);
  const b = await body(c);
  return c.json(await keepItem(field(b, "feed"), field(b, "guid")));
});

feedRoutes.post("/feeds/refresh", async (c) => {
  adminOnly(c);
  if (!feedsEffective().fetch) throw new VaultError(409, "Fetching feeds is off (Settings → Vault → Feeds)", "feedsOff");
  await runRound();
  return c.json(await feedsState());
});
