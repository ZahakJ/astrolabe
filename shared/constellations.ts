// CONSTELLATIONS — the vault's own spaced-repetition study system: the
// contract, shared by the indexer, the API, the shelf and the session.
//
// The astrolabe's rete is a map of the stars you learn to recognise, so a
// deck is a CONSTELLATION (كوكبة) and a card is a STAR (نجم). The owner:
// "screw Anki… let's make our own version and integrate it". Everything
// here stands on shared/flashcards.ts and shared/srs.ts and keeps their one
// promise: THE NOTE IS THE STATE. A constellation is a note with a
// ```constellation fence; its stars are the card lines the vault already
// reads; each star's schedule is the Obsidian Spaced Repetition plugin's
// comment, so the vault stays one vault with the plugin.
//
// This file is the skeleton the builders fill (see the spec the orchestrator
// wrote); the TYPES are the contract and do not change without telling the
// other worktrees.

import type { Schedule } from "./srs.ts";

/** How a constellation's `::` lines become stars. */
export type ConstellationKind = "basic" | "reversed" | "both" | "typed" | "cloze-only";

/** A learning step, in minutes. */
export type Step = number;

export interface Star {
  /** `${path}#${line}#${dir}` — stable across a session, unique in the vault. */
  id: string;
  path: string;
  /** 1-based line the star's block starts on; the schedule comment sits after `end`. */
  line: number;
  end: number;
  /** "fwd" is front→back; "rev" is the reversed twin a `:::` line makes. */
  dir: "fwd" | "rev";
  kind: "qa" | "cloze" | "quote";
  front: string;
  back: string;
  /** The optional third segment of `front::back::extra`: a reading, an example, a mnemonic. */
  extra: string | null;
  /** The nearest heading above the star, or null. */
  section: string | null;
  tags: string[];
  schedule: Schedule | null;
}

export interface Constellation {
  path: string;
  title: string;
  icon: string | null;
  kind: ConstellationKind;
  newPerDay: number;
  /** Learning steps in minutes, e.g. [1, 10]; relearning is always [10]. */
  steps: Step[];
  tags: string[];
  sections: string[];
  stars: Star[];
}

/** What GET /api/constellations returns per constellation. */
export interface ConstellationMeta {
  path: string;
  title: string;
  icon: string | null;
  kind: ConstellationKind;
  tags: string[];
  /** The implicit "Everything else" constellation, grouped from the whole vault. */
  implicit: boolean;
  counts: { total: number; new: number; due: number };
  sections: Array<{ name: string; total: number; due: number }>;
}

export const CONSTELLATION_FENCE = "constellation";
export const DEFAULT_STEPS: Step[] = [1, 10];
export const RELEARN_STEPS: Step[] = [10];
export const DEFAULT_NEW_PER_DAY = 10;
export const DEFAULT_FOLDER = "Constellations";

export interface FenceHead {
  title: string | null;
  icon: string | null;
  kind: ConstellationKind;
  newPerDay: number;
  steps: Step[];
  tags: string[];
}

/** The fence's key: value lines, or null when the note has no fence. */
export function parseConstellationFence(_md: string): FenceHead | null {
  throw new Error("not implemented (builder A)");
}

/** Every star in the note, in document order, with the note's kind applied. */
export function scanStars(_md: string, _path: string, _kind: ConstellationKind): Star[] {
  throw new Error("not implemented (builder A)");
}

/** The note as a constellation, or null when it carries no fence. */
export function constellationOf(_md: string, _path: string, _title: string): Constellation | null {
  throw new Error("not implemented (builder A)");
}

/** The note text with one star's schedule written: the plugin's comment
 *  after the block, with two schedules in one comment for a `:::` pair. */
export function writeStarSchedule(_md: string, _star: Star, _schedule: Schedule): string {
  throw new Error("not implemented (builder A)");
}

export interface NewCard {
  front: string;
  back: string;
  extra?: string | null;
  section?: string | null;
}

/** The text of a new constellation note: frontmatter title, the fence, then
 *  the cards as `front::back::extra` lines under their section headings. */
export function serialiseConstellation(_head: { title: string; icon?: string | null; kind?: ConstellationKind; tags?: string[]; newPerDay?: number }, _cards: NewCard[]): string {
  throw new Error("not implemented (builder A)");
}
