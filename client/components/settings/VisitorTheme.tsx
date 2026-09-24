// The theme a VISITOR lands on: the grouped choices for the default-theme
// select and the line under it that names tonight's room. Split out of
// SettingsModal.tsx (3.27.0) unchanged.

import { t, tf } from "../../i18n.ts";
import { useStore } from "../../state.ts";
import type { SelectGroup } from "../controls/Select.tsx";
import { choiceLabel, isTheme, THEME_GROUPS, THEME_LABELS, THEMES, type Theme } from "../../themes.ts";
import { customThemeChoice, isCustomThemeId } from "../../../shared/customTheme.ts";
import { getCustomThemes } from "../../design/customThemes.ts";
import { FOLLOW_THEME } from "../../../shared/themes.ts";

/** A theme's human label, falling back to the product default for an unset or
 *  unrecognised value. The picker, this panel and the palette all read the
 *  same table (`THEME_LABELS`); the raw id stays the stored value. "follow" is
 *  not a theme and never has been — it is the RULE, so it answers with the
 *  rule's own name rather than pretending to be a room. */
export function themeLabel(id: string | null): string {
  if (id === FOLLOW_THEME) return t("themeFollowOption");
  if (id && isCustomThemeId(id)) return choiceLabel(id);
  return t(THEME_LABELS[isTheme(id ?? "") ? (id as Theme) : THEMES[0]].name);
}

/** "Visitors see Cinnabar — following your editor theme", under the default-
 *  theme select, with the one control that changes the rule.
 *
 *  THE ROW USED TO BE HONEST AND UNREADABLE: it named a theme (or "inherit")
 *  and said nothing about who gets it or why. Now that the default FOLLOWS the
 *  owner's own editor theme unless pinned, silence would be worse than
 *  unreadable — an owner would change their theme at midnight and change their
 *  blog with it, having been told nothing. So the rule is printed in the
 *  theme's own name, and it tracks the select LIVE (before saving), because a
 *  sentence that only tells the truth after a round-trip teaches nothing while
 *  the choice is being made. */
export function VisitorThemeLine({
  pref,
  effective,
  onSet,
}: {
  /** The preference the panel is showing: a theme id or "follow". */
  pref: string | null;
  /** What the server says a visitor gets right now (the fallback for an
   *  instance whose preference the client cannot resolve on its own). */
  effective: string | null;
  onSet: (value: string) => void;
}) {
  const theme = useStore((s) => s.theme);
  const following = pref === null || pref === "" || pref === FOLLOW_THEME;
  // Following: the owner's own theme is what visitors get (the server mirrors
  // it within a second of a pick). Pinned: the pin, whoever is editing.
  // A pin may name a CUSTOM theme as readily as a built-in, so the
  // value is passed through as-is: themeLabel() below is what knows how to
  // name either kind (and how to fall back for an id this instance lost).
  const shown = following ? theme : pref !== null && pref !== "" ? pref : effective ?? THEMES[0];
  return (
    <p className="s-smodal__visitors">
      <span className="s-smodal__visitorsnote">
        {tf(following ? "visitorsFollow" : "visitorsPinned", { theme: themeLabel(shown) })}
      </span>
      <button
        type="button"
        className="s-smodal__visitorspin"
        onClick={() => onSet(following ? theme : FOLLOW_THEME)}
      >
        {t(following ? "pinForVisitors" : "followMyTheme")}
      </button>
    </p>
  );
}

/** A NOTE THAT ONLY REPEATS ITS LABEL IS NOISE.
 *
 *  Each theme row carries the raw id as a muted note, because the id is what
 *  `DEFAULT_THEME` takes in a .env and what `settings.defaultTheme` stores —
 *  worth showing. In ARABIC it earns that place twice over: the label is an
 *  Arabic name and the note is the Latin id, two different strings. In English
 *  it produced Iron gall / iron-gall, Cinnabar / cinnabar, Sumi / sumi, Void /
 *  void, Basalt / basalt, Nocturne / nocturne, Lapis / lapis, Verdigris /
 *  verdigris — eight rows of the same word printed twice, ~230px apart at the
 *  far edge of the row. So the note is dropped exactly when it is derivable
 *  from the label it sits beside, which is a property of the pair rather than
 *  of the language: a theme whose English name is not its id keeps it. */
export function noteIsDerivable(label: string, id: string): boolean {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") === id
  );
}

/** The theme rows the default-theme picker offers: an "inherit" row naming
 *  the value in force, then the built-in themes grouped dark/light. The human
 *  label is the option's text and the raw id is its muted note (see above). */
export function themeChoices(effective: string | null): SelectGroup[] {
  return [
    {
      id: "inherit",
      label: "",
      options: [
        // "Default", with what it resolves to as the NOTE — never the value
        // spelled into the label. As "inherit (Follow my editor theme)" the
        // row read as a twin of the follow row two lines under it.
        { value: "", label: t("inheritSegment"), note: themeLabel(effective) },
        // The third state, offered as plainly as the rooms themselves: not a
        // theme but a rule, and the one this product now defaults to. It is a
        // STORABLE value rather than merely the absence of one, because an
        // instance whose .env pins DEFAULT_THEME needs a way to say "no,
        // follow me" — clearing the key would only fall back to the pin.
        { value: FOLLOW_THEME, label: t("themeFollowOption") },
      ],
    },
    ...THEME_GROUPS.map((group) => ({
      id: group.group,
      label: t(group.group === "dark" ? "themeGroupDark" : "themeGroupLight"),
      options: group.themes.map((theme) => {
        const label = t(THEME_LABELS[theme].name);
        return {
          value: theme,
          label,
          note: noteIsDerivable(label, theme) ? undefined : theme,
        };
      }),
    })),
    // A custom theme is selectable everywhere a built-in is, and this row —
    // the theme a visitor with no stored choice gets — is the one that makes
    // that promise mean something on the PUBLIC site. The group is omitted
    // entirely when the instance has none, rather than standing empty.
    ...(getCustomThemes().length > 0
      ? [
          {
            id: "custom",
            label: t("themeGroupCustom"),
            options: getCustomThemes().map((theme) => ({
              value: customThemeChoice(theme.id),
              label: theme.name,
              // The note is the value DEFAULT_THEME takes, which for a custom
              // theme is never derivable from its name.
              note: customThemeChoice(theme.id),
            })),
          },
        ]
      : []),
  ];
}
