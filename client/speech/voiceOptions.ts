// ONE VOICE PICKER'S OPTIONS, for every picker of the app's own voices
// (docs/read-aloud.md): the Read aloud row's per-language pickers in
// Settings and the player's ▾. A group per engine — the one that speaks the
// language first, then the other installed engine's voices for it (a Light
// voice may be chosen under Natural: French's only man's voice is Light's
// Pierre) — then "Your voices" from the voices folder (shared/speechVoices.ts
// `voiceChoices` decides which of each), so a voice found on disk is chosen
// exactly like a built-in one. Every built-in voice wears its gender, (m) or
// (f), so "Natural: Siwis (f) · Light: Pierre (m), Jessica (f), Siwis (f)"
// says at a glance that only Light has a man's French voice.

import { t, tf } from "../i18n.ts";
import { builtinVoice, type SpeakEngineId, type SpeakVoice, type SpeakVoiceFile } from "../../shared/speech.ts";
import type { VoiceChoices } from "../../shared/speechVoices.ts";
import type { SelectGroup, SelectOption } from "../components/controls/Select.tsx";

function engineLabel(e: SpeakEngineId): string {
  return e === "natural" ? t("speakEngineNatural") : t("speakEngineLight");
}

/** "Pierre (m)" / «Pierre (رجل)». */
export function voiceLabel(v: Pick<SpeakVoice, "name" | "gender">): string {
  return tf(v.gender === "m" ? "speakVoiceMale" : "speakVoiceFemale", { name: v.name });
}

/** The size still to download, for a voice that comes on choice and is not
 *  here yet: "downloads on choice · 77 MB". */
function fetchNote(id: string, files: Record<string, SpeakVoiceFile> | undefined, size: (bytes: number) => string): string | undefined {
  const f = files?.[id];
  return f && !f.ready ? tf("speakVoiceOnChoice", { size: size(f.bytes) }) : undefined;
}

export interface VoiceGroupOpts {
  withDefault: boolean;
  /** The status's on-choice voices, to mark the ones not downloaded yet. */
  files?: Record<string, SpeakVoiceFile>;
  size?: (bytes: number) => string;
}

/** `value` is what the picker holds: "" is "the default" in Settings (the
 *  engine's first voice), and a real id in the player. A value the lists do
 *  not hold (a voice file that went away) stays visible, marked, rather than
 *  silently showing another voice as chosen. */
export function voiceGroups(choices: VoiceChoices, value: string, opts: VoiceGroupOpts): SelectGroup[] {
  const size = opts.size ?? ((b: number) => `${Math.round(b / 1e6)} MB`);
  const option = (v: SpeakVoice): SelectOption => ({ value: v.id, label: voiceLabel(v), note: fetchNote(v.id, opts.files, size) });
  const builtin: SelectOption[] = choices.builtin.map((v, i) =>
    opts.withDefault && i === 0 ? { value: "", label: tf("speakVoiceDefault", { name: voiceLabel(v) }) } : option(v),
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
  if (builtin.length > 0) {
    groups.push({ id: "builtin", label: choices.engine ? engineLabel(choices.engine) : t("speakVoicesBuiltIn"), options: builtin });
  }
  if (choices.also) {
    groups.push({ id: `builtin-${choices.also.engine}`, label: engineLabel(choices.also.engine), options: choices.also.voices.map(option) });
  }
  if (own.length > 0) groups.push({ id: "own", label: t("speakVoicesYours"), options: own });
  const known = groups.some((g) => g.options.some((o) => o.value === value));
  if (!known && value !== "") {
    const b = builtinVoice(value);
    groups.push({
      id: "gone",
      label: t("speakVoiceGoneGroup"),
      options: [{ value, label: b ? voiceLabel(b.voice) : t("speakVoiceGone"), note: b ? undefined : value.replace(/^own:/, "") }],
    });
  }
  return groups;
}

/** A long list — a Kokoro pack is dozens of voices — gets the picker's
 *  filter field. */
export function manyVoices(groups: SelectGroup[]): boolean {
  return groups.reduce((n, g) => n + g.options.length, 0) > 12;
}
