// A PublicActivity → Discord's `activity` object. Everything here has already
// passed the policy, so this file decides only wording, images and limits —
// never what may be said.

import {
  PRESENCE_BUTTON_LABEL_MAX,
  PRESENCE_BUTTON_URL_MAX,
  PRESENCE_LARGE_ASSET,
  PRESENCE_SMALL_ASSET,
  PRESENCE_TEXT_MAX,
  presenceAsset,
} from "./config.ts";
import { BUTTON_LABEL, cardsLeftPhrase, kindLabel, type PresenceLang } from "./copy.ts";
import { clip } from "./policy.ts";
import type { DiscordActivity, PresenceEffective, PublicActivity } from "./types.ts";

export interface RenderContext {
  lang: PresenceLang;
  vaultName: string | null;
  siteUrl: string | null;
  publicLayout: string;
  settings: PresenceEffective;
}

/** A vault's name is its folder's name — a name, not a path. String work
 *  only, so the client bundle could import this too. */
export function vaultNameOf(vaultDir: string): string {
  const parts = vaultDir.split(/[/\\]/).filter((p) => p !== "");
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

function text(s: string | undefined): string | undefined {
  if (s === undefined) return undefined;
  const t = clip(s, PRESENCE_TEXT_MAX);
  // Discord refuses a one-character details/state; pad rather than drop.
  return t.length === 1 ? `${t} ` : t === "" ? undefined : t;
}

export function renderActivity(pub: PublicActivity, ctx: RenderContext): DiscordActivity {
  const { lang, settings } = ctx;
  const label = kindLabel(pub.kind, lang);
  const phrase = pub.cardsLeft !== null ? cardsLeftPhrase(pub.cardsLeft, lang) : undefined;
  const vault = settings.vaultName && ctx.vaultName ? ctx.vaultName : undefined;
  const out: DiscordActivity = { type: 0 };
  const details = text(label);
  if (details !== undefined) out.details = details;
  const state = text(pub.title ?? phrase ?? vault);
  if (state !== undefined) out.state = state;
  if (pub.since !== null) out.timestamps = { start: pub.since };
  const assets: NonNullable<DiscordActivity["assets"]> = {
    large_image: presenceAsset(PRESENCE_LARGE_ASSET, settings.assets),
    small_image: presenceAsset(PRESENCE_SMALL_ASSET[pub.kind], settings.assets),
  };
  const large = text(vault);
  if (large !== undefined) assets.large_text = large;
  // With the title on the second line, the count moves to the glyph's
  // tooltip rather than being lost.
  const small = text(pub.title !== null && phrase !== undefined ? phrase : label);
  if (small !== undefined) assets.small_text = small;
  out.assets = assets;
  const url = ctx.siteUrl;
  if (
    settings.button &&
    url !== null &&
    url.startsWith("https://") &&
    url.length <= PRESENCE_BUTTON_URL_MAX &&
    (ctx.publicLayout === "blog" || ctx.publicLayout === "designed")
  ) {
    out.buttons = [{ label: clip(BUTTON_LABEL[lang], PRESENCE_BUTTON_LABEL_MAX), url }];
  }
  return out;
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) out[key] = sorted((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

/** Structural equality, key order ignored: the coalescer sends only on a
 *  real change, and an object built in a different order is not one. */
export function sameActivity(a: DiscordActivity | null, b: DiscordActivity | null): boolean {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}
