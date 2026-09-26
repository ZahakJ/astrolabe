// SETTINGS → LANGUAGE & DATES → YOUR OWN VOICES (docs/read-aloud.md).
//
// The door for a reader who already has voices on disk — Piper voices a
// LibreOffice extension ("Read Text") installed, or ones downloaded from the
// catalogue by hand. One row:
//
//   · THE FOLDER: a path typed, or chosen with Browse… in the desktop app
//     (its folder picker, electron/main.ts `pickFolder`). Saved like any
//     setting; the server checks it (absolute, outside the vault, readable)
//     and scans it at once. A Rescan button reads it again.
//   · WHAT THE SCAN FOUND, per language — "French: 3 voices · Arabic: 1 ·
//     2 files skipped: no .json beside them" — with the skipped files one
//     click away. The voices themselves join every voice picker (the Read
//     aloud row above, the player's ▾) under "Your voices".
//   · THE ONE PRECONDITION: a found Piper voice runs on Light's runtime, so
//     until Light is installed the row says so, and that installing it does
//     not download the reader's voice files again.
//   · THE ESCAPE HATCH, folded away: an external speaker — the reader's own
//     program, run once per sentence (server/speakExternal.ts). The ⓘ says it
//     runs with the server's own user.
//
// A pocket vault keeps neither (the Row is locked there, and the pocket
// refuses the keys with the reason).

import { useEffect, useState } from "react";
import { speakInstall } from "../../api.ts";
import { desktop } from "../../desktop/bridge.ts";
import { countPhrase, getLang, t, tf, type I18nKey } from "../../i18n.ts";
import { SPEAK_LANGS, type SpeakLang } from "../../../shared/speech.ts";
import { countByLang, skippedByReason, type OwnDirProblem, type OwnSkipReason } from "../../../shared/speechVoices.ts";
import { localeName } from "../../speech/deviceVoices.ts";
import { rescanOwnVoices, setSpeakStatus, useSpeakStatus } from "../../speech/speakStatus.ts";
import { TextInput } from "../controls/Fields.tsx";
import { useSettings } from "./context.ts";
import { modelSize } from "./voiceStatus.ts";

/** The catalogue a reader downloads more Piper voices from. A link, not a
 *  download button: which voice is theirs to choose, and the files are
 *  theirs to keep where they like. */
export const PIPER_CATALOGUE = "https://huggingface.co/rhasspy/piper-voices";

const SKIP_KEY: Record<OwnSkipReason, I18nKey> = {
  noJson: "ownSkipNoJson",
  noModel: "ownSkipNoModel",
  badJson: "ownSkipBadJson",
  noLanguage: "ownSkipNoLanguage",
  otherLanguage: "ownSkipOtherLanguage",
  unreadable: "ownSkipUnreadable",
  noKokoroModel: "ownSkipNoKokoroModel",
};

const PROBLEM_KEY: Record<OwnDirProblem, I18nKey> = {
  relative: "errVoicesDirRelative",
  inVault: "errVoicesDirInVault",
  missing: "errVoicesDirMissing",
  notDir: "errVoicesDirNotDir",
  unreadable: "errVoicesDirUnreadable",
};

function languageList(langs: string[]): string {
  const ui = getLang();
  return new Intl.ListFormat(ui, { type: "conjunction" }).format(langs.map((l) => localeName(l, ui)));
}

/** What the last scan found, as the row's status line and its details. */
function ScanSummary() {
  const status = useSpeakStatus();
  const own = status?.own;
  if (!own || own.dir === null) return null;
  if (own.scanning && own.at === null) return <p className="s-smodal__note" role="status">{t("ownScanning")}</p>;
  if (own.problem) {
    return (
      <p className="s-smodal__offnote" role="alert">
        {t(PROBLEM_KEY[own.problem])}
      </p>
    );
  }
  const ui = getLang();
  // "French: 3 voices" — a language and a count, the same shape in both.
  const counts = countByLang(own.voices).map(({ lang, count }) => `${localeName(lang, ui)}: ${countPhrase(count, "voices")}`);
  const groups = skippedByReason(own.skipped);
  const skippedCount = own.skipped.length;
  const parts: string[] = counts.length > 0 ? counts : [t("ownNoneFound")];
  // One phrase per reason: "2 files skipped: no .json beside the model". A
  // language the detector cannot name is said by its languages, not counted
  // as files — a Kokoro pack holds several in one file.
  for (const g of groups) {
    if (g.reason === "otherLanguage") {
      parts.push(tf("ownOtherLanguages", { languages: languageList([...new Set(own.skipped.filter((s) => s.lang).map((s) => s.lang!))]) }));
    } else {
      parts.push(tf("ownSkipped", { count: countPhrase(g.count, "files"), why: t(SKIP_KEY[g.reason]) }));
    }
  }
  if (own.truncated) parts.push(t("ownTruncated"));
  return (
    <div className="s-ownvoices__found" data-own-voices={own.voices.length} data-own-skipped={skippedCount}>
      <p className="s-smodal__note" role="status">
        {parts.join(" · ")}
      </p>
      {skippedCount > 0 && (
        <details className="s-ownvoices__skipped">
          <summary>{t("ownSkippedShow")}</summary>
          <ul>
            {own.skipped.map((s, i) => (
              <li key={`${s.file}-${s.lang ?? ""}-${i}`}>
                <bdi dir="ltr" className="s-ownvoices__file">
                  {s.file}
                </bdi>{" "}
                —{" "}
                {s.reason === "otherLanguage"
                  ? tf("ownSkipOtherLanguage", { languages: languageList([s.lang ?? "?"]) })
                  : t(SKIP_KEY[s.reason])}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Light is not installed and there are Piper voices to speak: the one
 *  thing the reader must do, and the promise that it does not fetch their
 *  voices again. */
function NeedsLight() {
  const status = useSpeakStatus();
  const [asked, setAsked] = useState(false);
  if (!status || status.test) return null;
  const piper = status.own.voices.some((v) => v.kind === "piper");
  const kokoro = status.own.voices.some((v) => v.kind === "kokoro");
  const lightMissing = piper && !status.engines.light.installed;
  const naturalMissing = kokoro && !status.engines.natural.installed;
  if (!lightMissing && !naturalMissing) return null;
  const engine = lightMissing ? "light" : "natural";
  const size = modelSize(status.engines[engine].bytes);
  const running = status.install.phase !== "idle" && status.install.phase !== "done" && status.install.phase !== "failed";
  return (
    <>
      <p className="s-smodal__note">
        {engine === "light" ? tf("ownNeedsLight", { size }) : tf("ownNeedsNatural", { size })}
      </p>
      {!running && (
        <button
          type="button"
          className="s-btn s-btn--accent"
          disabled={asked}
          onClick={() => {
            setAsked(true);
            void speakInstall(engine).then(setSpeakStatus, () => {}).finally(() => setAsked(false));
          }}
        >
          {tf("speakInstall", { engine: engine === "light" ? t("speakEngineLight") : t("speakEngineNatural"), size })}
        </button>
      )}
    </>
  );
}

/** The external speaker, folded: a command and the languages it speaks for. */
function ExternalSpeaker() {
  const { form, setForm, errors } = useSettings();
  const ui = getLang();
  const on = form.speakExternalCmd.trim() !== "";
  const [open, setOpen] = useState(on);
  const toggle = (lang: SpeakLang, yes: boolean): void =>
    setForm((f) =>
      f ? { ...f, speakExternalLangs: yes ? SPEAK_LANGS.filter((l) => l === lang || f.speakExternalLangs.includes(l)) : f.speakExternalLangs.filter((l) => l !== lang) } : f,
    );
  return (
    <details className="s-ownvoices__external" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        {t("ownExternalHead")}
        {on && form.speakExternalLangs.length > 0 && <span className="s-ownvoices__on"> · {languageList(form.speakExternalLangs)}</span>}
      </summary>
      <p className="s-smodal__note">{t("ownExternalNote")}</p>
      <TextInput
        label={t("ownExternalCommand")}
        placeholder="piper --model /home/me/voices/fr_FR-upmc-medium.onnx --output_file {out}"
        dir="ltr"
        autoComplete="off"
        invalid={errors.speakExternalCmd !== undefined}
        value={form.speakExternalCmd}
        onChange={(v) => setForm((f) => (f ? { ...f, speakExternalCmd: v } : f))}
      />
      {errors.speakExternalCmd && (
        <p className="s-smodal__offnote" role="alert">
          {errors.speakExternalCmd}
        </p>
      )}
      <fieldset className="s-ownvoices__langs">
        <legend className="s-smodal__voicelabel">{t("ownExternalFor")}</legend>
        {SPEAK_LANGS.map((lang) => (
          <label key={lang} className="s-ownvoices__lang">
            <input type="checkbox" checked={form.speakExternalLangs.includes(lang)} onChange={(e) => toggle(lang, e.target.checked)} />
            {localeName(lang, ui)}
          </label>
        ))}
      </fieldset>
    </details>
  );
}

export function OwnVoicesControls() {
  const { form, setForm, errors, pocket, loaded } = useSettings();
  const status = useSpeakStatus(!pocket);
  const bridge = desktop();
  const [scanning, setScanning] = useState(false);
  const saved = loaded.effective.speak.voicesDir ?? "";
  // A saved folder the server has not scanned yet (a server that just
  // started, a save a moment ago): the store asks until it has.
  useEffect(() => {
    if (saved !== "" && status && status.own.dir !== saved) void rescanOwnVoices().catch(() => {});
  }, [saved, status]);
  return (
    <div className="s-ownvoices">
      <div className="s-ownvoices__path">
        <TextInput
          label={t("rowOwnVoices")}
          placeholder="/home/you/.local/share/piper-voices"
          dir="ltr"
          autoComplete="off"
          invalid={errors.speakVoicesDir !== undefined}
          value={form.speakVoicesDir}
          onChange={(v) => setForm((f) => (f ? { ...f, speakVoicesDir: v } : f))}
        />
        {bridge?.pickFolder && (
          <button
            type="button"
            className="s-btn"
            onClick={() =>
              void bridge.pickFolder!().then((dir) => {
                if (dir) setForm((f) => (f ? { ...f, speakVoicesDir: dir } : f));
              })
            }
          >
            {t("ownBrowse")}
          </button>
        )}
        {saved !== "" && (
          <button
            type="button"
            className="s-btn"
            disabled={scanning}
            onClick={() => {
              setScanning(true);
              void rescanOwnVoices()
                .catch(() => {})
                .finally(() => setScanning(false));
            }}
          >
            {scanning ? t("ownScanning") : t("ownRescan")}
          </button>
        )}
      </div>
      {errors.speakVoicesDir && (
        <p className="s-smodal__offnote" role="alert">
          {errors.speakVoicesDir}
        </p>
      )}
      {saved !== "" && form.speakVoicesDir.trim() === saved ? <ScanSummary /> : saved === "" && <p className="s-smodal__note">{t("ownEmpty")}</p>}
      {saved !== "" && <NeedsLight />}
      <p className="s-smodal__note">
        {t("ownMoreVoices")}{" "}
        <a href={PIPER_CATALOGUE} target="_blank" rel="noopener noreferrer">
          {t("ownCatalogue")}
        </a>
      </p>
      <ExternalSpeaker />
    </div>
  );
}
