// ONE VOICE PICKER'S OPTIONS, for every picker of the app's own voices
// (docs/read-aloud.md): the Read aloud row's per-language pickers in
// Settings and the player's ▾. Two groups — the built-in engine's voices,
// then "Your voices" from the voices folder (shared/speechVoices.ts
// `voiceChoices` decides which of each) — so a voice found on disk is chosen
// exactly like a built-in one.

import { t, tf } from "../i18n.ts";
import { SPEAK_ENGINES, SPEAK_VOICES } from "../../shared/speech.ts";
import type { VoiceChoices } from "../../shared/speechVoices.ts";
import type { SelectGroup, SelectOption } from "../components/controls/Select.tsx";

/** A built-in voice's name wherever it is, for a stored pick of another
 *  engine's voice. */
function builtinName(id: string): string | null {
  for (const e of SPEAK_ENGINES) for (const list of Object.values(SPEAK_VOICES[e])) for (const v of list ?? []) if (v.id === id) return v.name;
  return null;
}

/** `value` is what the picker holds: "" is "the default" in Settings (the
 *  engine's first voice), and a real id in the player. A value the lists do
 *  not hold (a voice file that went away) stays visible, marked, rather than
 *  silently showing another voice as chosen. */
export function voiceGroups(choices: VoiceChoices, value: string, opts: { withDefault: boolean }): SelectGroup[] {
  const builtin: SelectOption[] = choices.builtin.map((v, i) =>
    opts.withDefault && i === 0 ? { value: "", label: tf("speakVoiceDefault", { name: v.name }) } : { value: v.id, label: v.name },
  );
  if (opts.withDefault && builtin.length === 0) {
    const first = choices.own[0];
    builtin.push({ value: "", label: first ? tf("speakVoiceDefault", { name: first.name }) : t("speakVoiceAuto"), labelDir: undefined });
  }
  const own: SelectOption[] = choices.own.map((v) => ({
    value: v.id,
    // A found voice's name is machine text (a file's name): its own
    // direction, like a device voice's.
    label: v.name,
    labelDir: "ltr",
    note: [v.locale, v.quality].filter(Boolean).join(" · "),
  }));
  const groups: SelectGroup[] = [];
  if (builtin.length > 0) groups.push({ id: "builtin", label: t("speakVoicesBuiltIn"), options: builtin });
  if (own.length > 0) groups.push({ id: "own", label: t("speakVoicesYours"), options: own });
  const known = groups.some((g) => g.options.some((o) => o.value === value));
  if (!known && value !== "") {
    const name = builtinName(value);
    groups.push({
      id: "gone",
      label: t("speakVoiceGoneGroup"),
      options: [{ value, label: name ?? t("speakVoiceGone"), note: name ? undefined : value.replace(/^own:/, "") }],
    });
  }
  return groups;
}

/** A long list — a Kokoro pack is dozens of voices — gets the picker's
 *  filter field. */
export function manyVoices(groups: SelectGroup[]): boolean {
  return groups.reduce((n, g) => n + g.options.length, 0) > 12;
}
