// Custom themes: a named override layer over one of the built-ins.
//
// A custom theme is NOT one more block in tokens.css and never becomes one.
// It is `{ base, tokens }` — a built-in theme id plus a SPARSE map of token
// overrides — and it is applied by putting the base's own id on
// `<html data-theme>` (so every token the author did not touch comes from the
// shipped block, unchanged) and the theme's id on `<html data-custom-theme>`,
// which a generated stylesheet keys the overrides off:
//
//     :root[data-custom-theme="my-room"] { --accent: #7c9; }
//
// `:root[data-custom-theme]` is (0,2,0) against `[data-theme="…"]`'s (0,1,0),
// so the override wins wherever it exists and nothing else moves. Three
// consequences worth stating, because each of them is why this shape was
// chosen over "generate a whole theme block":
//   · tokens.css is never rewritten, never parsed, and never has to be
//     shipped to the server;
//   · a theme that overrides four tokens stays four tokens on disk, so
//     "reset this token" is a delete rather than a re-derivation, and a later
//     retune of the base theme reaches every custom theme built on it;
//   · a base theme that is removed from the product is a loud, catchable
//     validation failure at read time, not a room with half its tokens
//     missing.
//
// Ids are `custom:<slug>` EVERYWHERE a theme id is spoken — `settings.
// defaultTheme`, `DEFAULT_THEME`, localStorage "vellum.theme", the picker.
// The prefix is what lets every existing `isTheme()` guard keep meaning
// exactly what it meant (a BUILT-IN theme) while the new callers ask
// `isThemeChoice()` instead.

import { stripBidiControls } from "./bidi.ts";
import { checkTheme, type ContrastCheck } from "./contrast.ts";
import { isTheme, themeGroup, type Theme, type ThemeGroup } from "./themes.ts";

export const CUSTOM_THEME_PREFIX = "custom:";

/** A custom theme id as it is spoken on the wire and in localStorage. */
export type CustomThemeId = string;

/** Any theme the product can be set to: one of the built-ins, or `custom:<slug>`. */
export type ThemeChoice = Theme | CustomThemeId;

/** How many custom themes one instance may hold. Not a resource limit — the
 *  file is tiny — but a picker is a browsing surface and a hundred rooms is a
 *  directory, not a choice. */
export const MAX_CUSTOM_THEMES = 24;

export const THEME_NAME_MAX = 48;

// ── The token allowlist ─────────────────────────────────────────────────────
// STRICT: a key not in this table is a 400. The values reach a generated
// stylesheet, so "which keys" and "which value shapes" are the entire security
// story of this feature, and both are closed sets rather than filters.

/** A token's value shape. `color` is an opaque hex; `wash` also accepts an
 *  8-digit hex, because the three tokens that carry one are translucent by
 *  design (a selection over prose, an accent ground, the graph vignette).
 *  NOTHING accepts a general CSS value: no `rgba()`, no `color-mix()`, no
 *  `var()`, no `url()`. A closed grammar means the generator can concatenate
 *  without escaping and still be provably injection-free. */
export type TokenKind = "color" | "wash";

/** The groups the builder lays out, in the order it lays them out. */
/** The groups the builder lays out. The first four and the last three are the
 *  base tokens tokens.css defines per theme; the rest are SURFACES — the
 *  sidebar, the tab strip, the status bar, the editor, the reading page, the
 *  controls, the dialogs, the site, the cards — each derived from a base
 *  token on `:root` (tokens.css, "the surface layer") until an author paints
 *  it on its own. */
export type TokenGroup = "ground" | "text" | "accent" | "line" | "sidebar" | "tabs" | "statusbar" | "editor" | "reading" | "links" | "controls" | "overlays" | "callout" | "code" | "graph" | "blog" | "cards";

export interface TokenSpec {
  name: string;
  group: TokenGroup;
  kind: TokenKind;
  /** The builder's label for the row, as a dictionary key — a human name in
   *  both languages ("Sidebar background", «خلفية شريط الملاحظات»); the raw
   *  token name stays beside it for people who write custom.css. Every token
   *  has one; tests/themeTokens.test.ts holds the dictionary to it. */
  label: string;
  /** A surface token's default, as tokens.css spells it: a `var(--base)`
   *  (or a color-mix of one), so a base override still flows into every
   *  surface an author did not paint. Absent on the base tokens themselves. */
  derivedFrom?: string;
}

/** Every token a custom theme may set: the set a `[data-theme]` block in
 *  tokens.css defines (minus `color-scheme`, which is not a color and rides on
 *  the theme's `group`, and `--banner-tint`, a percentage), and then the
 *  SURFACE tokens — one per painted thing a reader might want to change on
 *  its own — which tokens.css derives from those on `:root, [data-theme]`.
 *  The six page inks (`--book-ink-*`) are deliberately not here: a highlight
 *  that changes colour with the theme is data loss, as tokens.css argues. */
export const THEME_TOKENS: TokenSpec[] = [

  { name: "--bg", group: "ground", kind: "color", label: "tkBg" },
  { name: "--bg-raised", group: "ground", kind: "color", label: "tkBgRaised" },
  { name: "--bg-hover", group: "ground", kind: "color", label: "tkBgHover" },

  { name: "--text", group: "text", kind: "color", label: "tkText" },
  { name: "--text-muted", group: "text", kind: "color", label: "tkTextMuted" },
  { name: "--text-faint", group: "text", kind: "color", label: "tkTextFaint" },
  { name: "--heading", group: "text", kind: "color", label: "tkHeading" },

  { name: "--accent", group: "accent", kind: "color", label: "tkAccent" },
  { name: "--accent-soft", group: "accent", kind: "wash", label: "tkAccentSoft" },
  { name: "--selection-bg", group: "accent", kind: "wash", label: "tkSelectionBg" },
  { name: "--focus-ring", group: "accent", kind: "color", label: "tkFocusRing" },

  { name: "--border", group: "line", kind: "color", label: "tkBorder" },
  { name: "--danger", group: "line", kind: "color", label: "tkDanger" },

  { name: "--callout-note", group: "callout", kind: "color", label: "tkCalloutNote" },
  { name: "--callout-info", group: "callout", kind: "color", label: "tkCalloutInfo" },
  { name: "--callout-todo", group: "callout", kind: "color", label: "tkCalloutTodo" },
  { name: "--callout-abstract", group: "callout", kind: "color", label: "tkCalloutAbstract" },
  { name: "--callout-tip", group: "callout", kind: "color", label: "tkCalloutTip" },
  { name: "--callout-success", group: "callout", kind: "color", label: "tkCalloutSuccess" },
  { name: "--callout-question", group: "callout", kind: "color", label: "tkCalloutQuestion" },
  { name: "--callout-warning", group: "callout", kind: "color", label: "tkCalloutWarning" },
  { name: "--callout-failure", group: "callout", kind: "color", label: "tkCalloutFailure" },
  { name: "--callout-danger", group: "callout", kind: "color", label: "tkCalloutDanger" },
  { name: "--callout-bug", group: "callout", kind: "color", label: "tkCalloutBug" },
  { name: "--callout-example", group: "callout", kind: "color", label: "tkCalloutExample" },
  { name: "--callout-quote", group: "callout", kind: "color", label: "tkCalloutQuote" },

  { name: "--syn-keyword", group: "code", kind: "color", label: "tkSynKeyword" },
  { name: "--syn-string", group: "code", kind: "color", label: "tkSynString" },
  { name: "--syn-number", group: "code", kind: "color", label: "tkSynNumber" },
  { name: "--syn-comment", group: "code", kind: "color", label: "tkSynComment" },
  { name: "--syn-func", group: "code", kind: "color", label: "tkSynFunc" },
  { name: "--syn-type", group: "code", kind: "color", label: "tkSynType" },
  { name: "--syn-prop", group: "code", kind: "color", label: "tkSynProp" },
  { name: "--syn-operator", group: "code", kind: "color", label: "tkSynOperator" },

  { name: "--graph-node", group: "graph", kind: "color", label: "tkGraphNode" },
  { name: "--graph-edge", group: "graph", kind: "color", label: "tkGraphEdge" },
  { name: "--graph-vignette", group: "graph", kind: "wash", label: "tkGraphVignette" },

  { name: "--sidebar-bg", group: "sidebar", kind: "color", label: "tkSidebarBg", derivedFrom: "var(--bg-raised)" },
  { name: "--sidebar-text", group: "sidebar", kind: "color", label: "tkSidebarText", derivedFrom: "var(--text)" },
  { name: "--sidebar-muted", group: "sidebar", kind: "color", label: "tkSidebarMuted", derivedFrom: "var(--text-muted)" },
  { name: "--sidebar-border", group: "sidebar", kind: "color", label: "tkSidebarBorder", derivedFrom: "var(--border)" },
  { name: "--sidebar-hover-bg", group: "sidebar", kind: "color", label: "tkSidebarHoverBg", derivedFrom: "var(--bg-hover)" },
  { name: "--sidebar-active-bg", group: "sidebar", kind: "wash", label: "tkSidebarActiveBg", derivedFrom: "var(--accent-soft)" },
  { name: "--sidebar-active-bar", group: "sidebar", kind: "color", label: "tkSidebarActiveBar", derivedFrom: "var(--accent)" },
  { name: "--sidebar-search-bg", group: "sidebar", kind: "color", label: "tkSidebarSearchBg", derivedFrom: "var(--bg)" },
  { name: "--tagpill-bg", group: "sidebar", kind: "color", label: "tkTagpillBg", derivedFrom: "var(--bg-hover)" },
  { name: "--tagpill-text", group: "sidebar", kind: "color", label: "tkTagpillText", derivedFrom: "var(--text-muted)" },

  { name: "--tabs-bg", group: "tabs", kind: "color", label: "tkTabsBg", derivedFrom: "var(--bg-raised)" },
  { name: "--tabs-border", group: "tabs", kind: "color", label: "tkTabsBorder", derivedFrom: "var(--border)" },
  { name: "--tab-text", group: "tabs", kind: "color", label: "tkTabText", derivedFrom: "var(--text-muted)" },
  { name: "--tab-hover-bg", group: "tabs", kind: "color", label: "tkTabHoverBg", derivedFrom: "var(--bg-hover)" },
  { name: "--tab-active-bg", group: "tabs", kind: "color", label: "tkTabActiveBg", derivedFrom: "var(--bg)" },
  { name: "--tab-active-text", group: "tabs", kind: "color", label: "tkTabActiveText", derivedFrom: "var(--text)" },
  { name: "--tab-active-bar", group: "tabs", kind: "color", label: "tkTabActiveBar", derivedFrom: "var(--accent)" },
  { name: "--panel-bg", group: "tabs", kind: "color", label: "tkPanelBg", derivedFrom: "var(--bg-raised)" },
  { name: "--panel-text", group: "tabs", kind: "color", label: "tkPanelText", derivedFrom: "var(--text)" },
  { name: "--panel-heading", group: "tabs", kind: "color", label: "tkPanelHeading", derivedFrom: "var(--text-faint)" },
  { name: "--panel-border", group: "tabs", kind: "color", label: "tkPanelBorder", derivedFrom: "var(--border)" },

  { name: "--statusbar-bg", group: "statusbar", kind: "color", label: "tkStatusbarBg", derivedFrom: "var(--bg-raised)" },
  { name: "--statusbar-text", group: "statusbar", kind: "color", label: "tkStatusbarText", derivedFrom: "var(--text-muted)" },
  { name: "--statusbar-border", group: "statusbar", kind: "color", label: "tkStatusbarBorder", derivedFrom: "var(--border)" },

  { name: "--editor-bg", group: "editor", kind: "color", label: "tkEditorBg", derivedFrom: "var(--bg)" },
  { name: "--editor-text", group: "editor", kind: "color", label: "tkEditorText", derivedFrom: "var(--text)" },
  { name: "--editor-caret", group: "editor", kind: "color", label: "tkEditorCaret", derivedFrom: "var(--accent)" },
  { name: "--editor-panel-bg", group: "editor", kind: "color", label: "tkEditorPanelBg", derivedFrom: "var(--bg-raised)" },
  { name: "--codeblock-bg", group: "editor", kind: "color", label: "tkCodeblockBg", derivedFrom: "var(--bg-raised)" },
  { name: "--codeblock-text", group: "editor", kind: "color", label: "tkCodeblockText", derivedFrom: "var(--text)" },
  { name: "--inline-code-bg", group: "editor", kind: "color", label: "tkInlineCodeBg", derivedFrom: "var(--bg-raised)" },
  { name: "--inline-code-text", group: "editor", kind: "color", label: "tkInlineCodeText", derivedFrom: "var(--text)" },
  { name: "--code-border", group: "editor", kind: "color", label: "tkCodeBorder", derivedFrom: "var(--border)" },

  { name: "--reading-bg", group: "reading", kind: "color", label: "tkReadingBg", derivedFrom: "var(--bg)" },
  { name: "--reading-text", group: "reading", kind: "color", label: "tkReadingText", derivedFrom: "var(--text)" },
  { name: "--quote-bar", group: "reading", kind: "color", label: "tkQuoteBar", derivedFrom: "var(--accent)" },
  { name: "--quote-text", group: "reading", kind: "color", label: "tkQuoteText", derivedFrom: "var(--text-muted)" },
  { name: "--highlight-bg", group: "reading", kind: "wash", label: "tkHighlightBg", derivedFrom: "color-mix(in srgb, var(--accent) 26%, transparent)" },
  { name: "--hr", group: "reading", kind: "color", label: "tkHr", derivedFrom: "var(--accent)" },
  { name: "--list-bullet", group: "reading", kind: "color", label: "tkListBullet", derivedFrom: "var(--accent)" },
  { name: "--table-border", group: "reading", kind: "color", label: "tkTableBorder", derivedFrom: "var(--border)" },
  { name: "--table-head-bg", group: "reading", kind: "color", label: "tkTableHeadBg", derivedFrom: "var(--bg-raised)" },
  { name: "--table-head-text", group: "reading", kind: "color", label: "tkTableHeadText", derivedFrom: "var(--text-muted)" },
  { name: "--props-bg", group: "reading", kind: "color", label: "tkPropsBg", derivedFrom: "var(--bg-raised)" },
  { name: "--footnote-marker", group: "reading", kind: "color", label: "tkFootnoteMarker", derivedFrom: "var(--accent)" },

  { name: "--link", group: "links", kind: "color", label: "tkLink", derivedFrom: "var(--accent)" },
  { name: "--wikilink", group: "links", kind: "color", label: "tkWikilink", derivedFrom: "var(--accent)" },
  { name: "--wikilink-broken", group: "links", kind: "color", label: "tkWikilinkBroken", derivedFrom: "color-mix(in srgb, var(--danger) 70%, var(--text))" },
  { name: "--tag-bg", group: "links", kind: "wash", label: "tkTagBg", derivedFrom: "var(--accent-soft)" },
  { name: "--tag-text", group: "links", kind: "color", label: "tkTagText", derivedFrom: "var(--accent)" },

  { name: "--button-text", group: "controls", kind: "color", label: "tkButtonText", derivedFrom: "var(--text)" },
  { name: "--button-hover-bg", group: "controls", kind: "color", label: "tkButtonHoverBg", derivedFrom: "var(--bg-hover)" },
  { name: "--button-accent-bg", group: "controls", kind: "wash", label: "tkButtonAccentBg", derivedFrom: "var(--accent-soft)" },
  { name: "--button-accent-text", group: "controls", kind: "color", label: "tkButtonAccentText", derivedFrom: "var(--accent)" },
  { name: "--input-bg", group: "controls", kind: "color", label: "tkInputBg", derivedFrom: "var(--bg)" },
  { name: "--input-text", group: "controls", kind: "color", label: "tkInputText", derivedFrom: "var(--text)" },
  { name: "--input-border", group: "controls", kind: "color", label: "tkInputBorder", derivedFrom: "var(--border)" },
  { name: "--input-placeholder", group: "controls", kind: "color", label: "tkInputPlaceholder", derivedFrom: "var(--text-faint)" },
  { name: "--input-focus", group: "controls", kind: "color", label: "tkInputFocus", derivedFrom: "var(--accent)" },
  { name: "--menu-bg", group: "controls", kind: "color", label: "tkMenuBg", derivedFrom: "var(--bg-raised)" },
  { name: "--menu-text", group: "controls", kind: "color", label: "tkMenuText", derivedFrom: "var(--text)" },
  { name: "--menu-hover-bg", group: "controls", kind: "wash", label: "tkMenuHoverBg", derivedFrom: "var(--accent-soft)" },

  { name: "--modal-bg", group: "overlays", kind: "color", label: "tkModalBg", derivedFrom: "var(--bg-raised)" },
  { name: "--modal-text", group: "overlays", kind: "color", label: "tkModalText", derivedFrom: "var(--text)" },
  { name: "--modal-border", group: "overlays", kind: "color", label: "tkModalBorder", derivedFrom: "var(--border)" },
  { name: "--backdrop", group: "overlays", kind: "wash", label: "tkBackdrop", derivedFrom: "#00000066" },
  { name: "--toast-bg", group: "overlays", kind: "color", label: "tkToastBg", derivedFrom: "var(--bg-raised)" },
  { name: "--toast-text", group: "overlays", kind: "color", label: "tkToastText", derivedFrom: "var(--text)" },
  { name: "--toast-bar", group: "overlays", kind: "color", label: "tkToastBar", derivedFrom: "var(--accent)" },
  { name: "--scrollbar-thumb", group: "overlays", kind: "color", label: "tkScrollbarThumb", derivedFrom: "var(--border)" },
  { name: "--scrollbar-thumb-hover", group: "overlays", kind: "color", label: "tkScrollbarThumbHover", derivedFrom: "var(--text-faint)" },

  { name: "--graph-bg", group: "graph", kind: "color", label: "tkGraphBg", derivedFrom: "var(--bg)" },

  { name: "--blog-bg", group: "blog", kind: "color", label: "tkBlogBg", derivedFrom: "var(--bg)" },
  { name: "--blog-text", group: "blog", kind: "color", label: "tkBlogText", derivedFrom: "var(--text)" },
  { name: "--blog-mast-text", group: "blog", kind: "color", label: "tkBlogMastText", derivedFrom: "var(--text)" },
  { name: "--blog-mast-tagline", group: "blog", kind: "color", label: "tkBlogMastTagline", derivedFrom: "var(--text-muted)" },
  { name: "--blog-mast-star", group: "blog", kind: "color", label: "tkBlogMastStar", derivedFrom: "var(--accent)" },
  { name: "--blog-nav-text", group: "blog", kind: "color", label: "tkBlogNavText", derivedFrom: "var(--text-muted)" },
  { name: "--blog-nav-hover-bg", group: "blog", kind: "color", label: "tkBlogNavHoverBg", derivedFrom: "var(--bg-hover)" },
  { name: "--blog-nav-active-bg", group: "blog", kind: "wash", label: "tkBlogNavActiveBg", derivedFrom: "var(--accent-soft)" },
  { name: "--blog-nav-active-text", group: "blog", kind: "color", label: "tkBlogNavActiveText", derivedFrom: "var(--accent)" },

  { name: "--card-bg", group: "cards", kind: "color", label: "tkCardBg", derivedFrom: "var(--bg-raised)" },
  { name: "--card-text", group: "cards", kind: "color", label: "tkCardText", derivedFrom: "var(--text)" },
  { name: "--card-border", group: "cards", kind: "color", label: "tkCardBorder", derivedFrom: "var(--border)" },
  { name: "--card-hover-border", group: "cards", kind: "color", label: "tkCardHoverBorder", derivedFrom: "var(--accent)" },
  { name: "--progress-track", group: "cards", kind: "color", label: "tkProgressTrack", derivedFrom: "var(--bg-hover)" },
  { name: "--progress-fill", group: "cards", kind: "color", label: "tkProgressFill", derivedFrom: "var(--accent)" },
];

const TOKEN_BY_NAME = new Map(THEME_TOKENS.map((spec) => [spec.name, spec]));

/** The groups in the builder's order. */
export const TOKEN_GROUPS: TokenGroup[] = ["ground", "text", "accent", "line", "sidebar", "tabs", "statusbar", "editor", "reading", "links", "controls", "overlays", "callout", "code", "graph", "blog", "cards"];

/** The surface tokens only — those with a derivation in tokens.css. */
export const SURFACE_TOKENS: TokenSpec[] = THEME_TOKENS.filter((spec) => spec.derivedFrom !== undefined);

/** Own-property lookup, never `TOKENS[name]` on a bare object: an allowlist
 *  read through the prototype chain answers for `constructor` and `toString`,
 *  which is the trap `patchSettings` and the font catalog both document. */
export function tokenSpec(name: string): TokenSpec | null {
  return TOKEN_BY_NAME.get(name) ?? null;
}

const HEX_OPAQUE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const HEX_ANY = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export function isValidTokenValue(kind: TokenKind, value: string): boolean {
  return (kind === "wash" ? HEX_ANY : HEX_OPAQUE).test(value.trim());
}

// ── The document ────────────────────────────────────────────────────────────

export interface CustomTheme {
  /** Slug, `[a-z0-9-]`, unique per instance. The full id is
   *  `custom:<id>` — see themeChoiceId(). */
  id: string;
  /** What a reader is shown. Free text (bidi controls already stripped). */
  name: string;
  /** The built-in this theme is an override layer over. */
  base: Theme;
  /** Which half of the picker it belongs in, and the `color-scheme` it
   *  declares. Defaults to the base's group; an author who turns a dark room's
   *  ground to paper says so here, and the browser's own form controls and
   *  scrollbars follow. */
  group: ThemeGroup;
  /** Sparse: only what the author actually changed. */
  tokens: Record<string, string>;
  createdMs: number;
  updatedMs: number;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;

export function isCustomThemeId(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value.startsWith(CUSTOM_THEME_PREFIX) &&
    SLUG_RE.test(value.slice(CUSTOM_THEME_PREFIX.length))
  );
}

/** A built-in id or a well-formed `custom:<slug>`. This is the guard every NEW
 *  caller uses; `isTheme()` keeps answering the narrower question it always
 *  answered, so nothing that already imports it changes meaning. */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return isTheme(value) || isCustomThemeId(value);
}

/** `custom:<slug>` → `<slug>`; anything else → null. */
export function customThemeSlug(choice: string): string | null {
  if (!isCustomThemeId(choice)) return null;
  return choice.slice(CUSTOM_THEME_PREFIX.length);
}

/** `<slug>` → `custom:<slug>`. */
export function customThemeChoice(slug: string): string {
  return `${CUSTOM_THEME_PREFIX}${slug}`;
}

/** A name → a slug. Falls back to a stable "theme" so a purely non-Latin name
 *  still produces a usable id; collisions are resolved by the store. */
export function slugifyThemeName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug === "" ? "theme" : slug;
}

/** The resolved group of any theme choice — built-in from the shipped table,
 *  custom from its own declaration (falling back to its base). */
export function themeChoiceGroup(
  choice: string,
  themes: readonly CustomTheme[],
): ThemeGroup {
  if (isTheme(choice)) return themeGroup(choice);
  const custom = findCustomTheme(choice, themes);
  if (!custom) return "dark";
  return custom.group;
}

/** The BUILT-IN a choice paints with: itself, or a custom theme's base. Used
 *  by everything that must hand `<html data-theme>` a real block — and by the
 *  swatch machinery, which is keyed on built-in ids. */
export function baseThemeOf(choice: string, themes: readonly CustomTheme[]): Theme {
  if (isTheme(choice)) return choice;
  return findCustomTheme(choice, themes)?.base ?? "iron-gall";
}

export function findCustomTheme(
  choice: string,
  themes: readonly CustomTheme[],
): CustomTheme | null {
  const slug = customThemeSlug(choice);
  if (slug === null) return null;
  return themes.find((theme) => theme.id === slug) ?? null;
}

// ── Validation ──────────────────────────────────────────────────────────────

/** Thrown by validateCustomTheme; the server turns it into a 400 with this
 *  message, the importer prints it beside the file it came from. */
export class ThemeError extends Error {}

/** Validate an untrusted custom theme (a PUT body, an imported file, a row
 *  read back off disk). Returns a NEW object holding only allowlisted keys —
 *  never the caller's object, so nothing unvalidated can ride along into the
 *  file or the generated stylesheet. */
export function validateCustomTheme(input: unknown, now = Date.now()): CustomTheme {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ThemeError("A custom theme must be a JSON object");
  }
  const raw = input as Record<string, unknown>;

  // A theme NAME is drawn in the public theme picker and in the designer's own
  // list, so it is stripped like every other operator string that reaches a
  // page (shared/bidi.ts). The field's own doc comment has claimed this since
  // the day it was written; now it is true.
  const name =
    typeof raw.name === "string" ? stripBidiControls(raw.name).replace(/\s+/g, " ").trim() : "";
  if (name === "") throw new ThemeError("Custom theme needs a name");
  if (name.length > THEME_NAME_MAX) {
    throw new ThemeError(`Custom theme name is too long (${THEME_NAME_MAX} characters max)`);
  }

  if (!isTheme(raw.base)) {
    throw new ThemeError(
      `Custom theme "${name}" names an unknown base theme: ${JSON.stringify(raw.base)}`,
    );
  }
  const base: Theme = raw.base;

  const group: ThemeGroup =
    raw.group === "dark" || raw.group === "light" ? raw.group : themeGroup(base);

  const id =
    typeof raw.id === "string" && SLUG_RE.test(raw.id) ? raw.id : slugifyThemeName(name);

  const tokens: Record<string, string> = {};
  const rawTokens = raw.tokens;
  if (rawTokens !== undefined) {
    if (typeof rawTokens !== "object" || rawTokens === null || Array.isArray(rawTokens)) {
      throw new ThemeError(`Custom theme "${name}": "tokens" must be an object`);
    }
    for (const [key, value] of Object.entries(rawTokens as Record<string, unknown>)) {
      const spec = tokenSpec(key);
      if (!spec) throw new ThemeError(`Custom theme "${name}": unknown token ${key}`);
      if (typeof value !== "string" || !isValidTokenValue(spec.kind, value)) {
        throw new ThemeError(
          `Custom theme "${name}": ${key} must be a hex color` +
            (spec.kind === "wash" ? " (#rgb, #rrggbb or #rrggbbaa)" : " (#rgb or #rrggbb)"),
        );
      }
      tokens[key] = value.trim().toLowerCase();
    }
  }

  const stamp = (value: unknown, fallback: number): number =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;

  return {
    id,
    name,
    base,
    group,
    tokens,
    createdMs: stamp(raw.createdMs, now),
    updatedMs: stamp(raw.updatedMs, now),
  };
}

// ── Generated CSS ───────────────────────────────────────────────────────────

/** One theme's override block. Every key came out of the allowlist and every
 *  value out of a hex regex, so there is no escaping to get wrong — which is
 *  the point of both being closed sets rather than filters. */
export function customThemeCss(theme: CustomTheme): string {
  const lines = [`  color-scheme: ${theme.group};`];
  for (const spec of THEME_TOKENS) {
    const value = Object.prototype.hasOwnProperty.call(theme.tokens, spec.name)
      ? theme.tokens[spec.name]
      : undefined;
    if (value) lines.push(`  ${spec.name}: ${value};`);
  }
  const selector = `:root[data-custom-theme="${theme.id}"]`;
  return `${selector} {\n${lines.join("\n")}\n}\n`;
}

/** The whole instance's custom themes as one stylesheet. */
export function customThemesCss(themes: readonly CustomTheme[]): string {
  const head =
    "/* Vellum — custom themes. Generated from VELLUM_DATA/designs.json;\n" +
    "   every declaration below came out of a closed token allowlist and a hex\n" +
    "   grammar (shared/customTheme.ts). Do not edit: it is rewritten on save. */\n";
  return head + themes.map(customThemeCss).join("\n");
}

/** A signature that changes whenever any custom theme does — the `?v=` on the
 *  stylesheet link, exactly like `fontsSignature()`. Without it a browser that
 *  has the sheet cached keeps painting yesterday's accent. */
export function customThemesSignature(themes: readonly CustomTheme[]): string {
  if (themes.length === 0) return "";
  let hash = 0x811c9dc5;
  for (const theme of themes) {
    for (const ch of `${theme.id}:${theme.base}:${theme.group}:${JSON.stringify(theme.tokens)}`) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return `${themes.length}-${(hash >>> 0).toString(36)}`;
}

// ── Contrast, resolved ──────────────────────────────────────────────────────

/**
 * The gate's verdict on a custom theme — which needs the BASE's values for
 * every token the author did not override, or a theme that only touched
 * `--accent` would report nothing about the ground it has to be legible on.
 *
 * `baseTokens` is the base theme's resolved token map; the client reads it off
 * the live document (`getComputedStyle` against a probe element carrying
 * `data-theme`), which is the only source that cannot drift from tokens.css.
 */
export function checkCustomTheme(
  theme: Pick<CustomTheme, "tokens">,
  baseTokens: Record<string, string>,
): ContrastCheck[] {
  return checkTheme({ ...baseTokens, ...theme.tokens });
}
