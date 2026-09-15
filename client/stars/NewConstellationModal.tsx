// NEW CONSTELLATION — a form that writes a note. Two tabs: WRITE, where the
// reader types `front::back::extra` lines and watches the count; IMPORT,
// where a file becomes the note — an Anki .apkg goes to the server whole
// (one constellation per deck, media beside the notes), a .csv/.tsv is
// read here, mapped column by column, and created through the same route
// the Write tab uses, because a CSV is only lines with a delimiter and the
// mapper is the whole of what an importer would add.
//
// The note lands at `<folder>/<title>.md` (default Constellations/) and
// the shelf reloads. The form wears the Media form's frame (.s-mediaform)
// and the Orbit form's habits: a dialog with a trap, Escape closes, the
// primary action on the right.

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { DEFAULT_FOLDER, type ConstellationKind, type NewCard } from "../../shared/constellations.ts";
import { useDialog } from "../a11y.ts";
import { createConstellation, importConstellations } from "../api.ts";
import { SegmentedControl, TextInput } from "../components/controls/Fields.tsx";
import { Select } from "../components/controls/Select.tsx";
import { countPhrase, localeNum, t } from "../i18n.ts";
import { st, stf } from "./copy.ts";
import { toast } from "../toast.ts";
import { delimiterOf, guessColumns, parseDelimited, stripAnkiHeader } from "./csv.ts";
import { cardsOfText } from "./lines.ts";

const KINDS: Array<{ value: ConstellationKind; label: "starsKindBasic" | "starsKindReversed" | "starsKindBoth" | "starsKindTyped" | "starsKindClozeOnly" }> = [
  { value: "basic", label: "starsKindBasic" },
  { value: "reversed", label: "starsKindReversed" },
  { value: "both", label: "starsKindBoth" },
  { value: "typed", label: "starsKindTyped" },
  { value: "cloze-only", label: "starsKindClozeOnly" },
];

function cleanTitle(s: string): string {
  return s.trim().replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
}

function cleanFolder(s: string): string {
  return s.trim().replace(/^\/+|\/+$/g, "") || DEFAULT_FOLDER;
}

type ColumnPick = { front: number; back: number; extra: number | null };

export default function NewConstellationModal({ tab: initialTab, onClose, onCreated }: { tab: "new" | "import"; onClose: () => void; onCreated: () => void }) {
  const [tab, setTab] = useState<"new" | "import">(initialTab);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("");
  const [kind, setKind] = useState<ConstellationKind>("basic");
  const [folder, setFolder] = useState(DEFAULT_FOLDER);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Import: the file, and — for a CSV — its rows and the column mapping.
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [header, setHeader] = useState(false);
  const [cols, setCols] = useState<ColumnPick>({ front: 0, back: 1, extra: null });
  const panel = useRef<HTMLFormElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  useDialog(panel, { onEscape: onClose });
  useEffect(() => setError(null), [title, text, file, tab]);

  const cards = useMemo(() => cardsOfText(text), [text]);
  const isApkg = file !== null && /\.apkg$/i.test(file.name);
  const width = useMemo(() => (rows ?? []).reduce((w, r) => Math.max(w, r.length), 0), [rows]);
  const dataRows = useMemo(() => (rows === null ? [] : header ? rows.slice(1) : rows), [rows, header]);
  const csvCards = useMemo<NewCard[]>(
    () =>
      dataRows
        .map((r) => ({ front: (r[cols.front] ?? "").trim(), back: (r[cols.back] ?? "").trim(), extra: cols.extra === null ? null : (r[cols.extra] ?? "").trim() || null }))
        .filter((c) => c.front !== "" && c.back !== ""),
    [dataRows, cols],
  );

  const pickFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setRows(null);
    if (!f) return;
    if (title.trim() === "") setTitle(cleanTitle(f.name.replace(/\.(apkg|csv|tsv|txt)$/i, "")));
    if (/\.apkg$/i.test(f.name)) return;
    void f.text().then((raw) => {
      const body = stripAnkiHeader(raw);
      const parsed = parseDelimited(body, delimiterOf(body, f.name));
      setRows(parsed);
      const w = parsed.reduce((n, r) => Math.max(n, r.length), 0);
      setCols(guessColumns(w));
      // A first row that looks like labels ("Front", "Back") is a header.
      const first = parsed[0] ?? [];
      setHeader(first.length > 0 && first.every((c) => c.trim().length > 0 && c.trim().length < 24 && !/[.!?。]/.test(c)) && parsed.length > 1 && /^(front|back|question|answer|word|meaning)$/i.test(first[0].trim()));
    });
  };

  const save = async (): Promise<void> => {
    const name = cleanTitle(title);
    if (tab === "import" && file === null) {
      setError(st("starsFileRequired"));
      return;
    }
    if (tab === "import" && isApkg) {
      setBusy(true);
      try {
        const res = await importConstellations(file!, cleanFolder(folder));
        toast(stf("starsImported", { n: countPhrase(res.created.length, "notes") }));
        onCreated();
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : st("starsImportFailed"));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (name === "") {
      setError(st("starsTitleRequired"));
      return;
    }
    const list = tab === "import" ? csvCards : cards;
    if (list.length === 0) {
      setError(st("starsCardsRequired"));
      return;
    }
    setBusy(true);
    try {
      await createConstellation({ title: name, icon: icon.trim() === "" ? null : icon.trim(), kind, folder: cleanFolder(folder), cards: list });
      toast(stf("starsCreated", { title: name }));
      onCreated();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : st("starsCreateFailed"));
    } finally {
      setBusy(false);
    }
  };

  const columnOptions = (none: boolean) => [
    ...(none ? [{ value: "-1", label: st("starsColNone") }] : []),
    ...Array.from({ length: width }, (_, i) => ({ value: String(i), label: stf("starsColumnN", { n: localeNum(i + 1) }), note: (rows?.[0]?.[i] ?? "").slice(0, 24) })),
  ];

  const where = `${cleanFolder(folder)}/${cleanTitle(title) || "…"}.md`;

  return (
    <div className="s-palette-overlay" onMouseDown={onClose}>
      <form
        ref={panel}
        className="s-mediaform s-starsform"
        role="dialog"
        aria-modal="true"
        aria-label={st("starsNewTitle")}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        data-testid="stars-form"
      >
        <div className="s-mediaform__head">
          <h2 className="s-mediaform__title">{st("starsNewTitle")}</h2>
          <button type="button" className="s-mediaform__close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </div>
        <div className="s-starsform__tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "new"} className={`s-starsform__tab${tab === "new" ? " s-starsform__tab--on" : ""}`} onClick={() => setTab("new")}>
            {st("starsTabWrite")}
          </button>
          <button type="button" role="tab" aria-selected={tab === "import"} className={`s-starsform__tab${tab === "import" ? " s-starsform__tab--on" : ""}`} onClick={() => setTab("import")}>
            {st("starsTabImport")}
          </button>
        </div>

        <div className="s-mediaform__body s-starsform__body">
          {tab === "import" && (
            <div className="s-mediaform__row">
              <span className="s-mediaform__label">{st("starsFieldFile")}</span>
              <div className="s-mediaform__coverrow">
                <button type="button" className="s-btn s-mediaform__upload" onClick={() => fileRef.current?.click()} data-testid="stars-pick-file">
                  {file ? file.name : st("starsChooseFile")}
                </button>
                <input ref={fileRef} type="file" accept=".apkg,.csv,.tsv,.txt" hidden onChange={pickFile} aria-label={st("starsFieldFile")} />
              </div>
              <p className="s-mediaform__hint">{isApkg ? st("starsApkgNote") : st("starsFileHint")}</p>
            </div>
          )}

          {tab === "import" && rows !== null && (
            <div className="s-mediaform__row">
              <span className="s-mediaform__label">{st("starsColumns")}</span>
              <div className="s-starsform__mapper">
                <label className="s-starsform__col">
                  <span>{st("starsColFront")}</span>
                  <Select value={String(cols.front)} onChange={(v) => setCols((c) => ({ ...c, front: Number(v) }))} options={columnOptions(false)} label={st("starsColFront")} />
                </label>
                <label className="s-starsform__col">
                  <span>{st("starsColBack")}</span>
                  <Select value={String(cols.back)} onChange={(v) => setCols((c) => ({ ...c, back: Number(v) }))} options={columnOptions(false)} label={st("starsColBack")} />
                </label>
                <label className="s-starsform__col">
                  <span>{st("starsColExtra")}</span>
                  <Select value={cols.extra === null ? "-1" : String(cols.extra)} onChange={(v) => setCols((c) => ({ ...c, extra: v === "-1" ? null : Number(v) }))} options={columnOptions(true)} label={st("starsColExtra")} />
                </label>
              </div>
              <label className="s-starsform__check">
                <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} /> {st("starsHeaderRow")}
              </label>
              <p className="s-mediaform__hint" data-testid="stars-csv-count">
                {stf("starsRowsFound", { n: countPhrase(csvCards.length, "stars") })}
              </p>
            </div>
          )}

          {!(tab === "import" && isApkg) && (
            <>
              <div className="s-mediaform__pair">
                <label className="s-mediaform__row">
                  <span className="s-mediaform__label">{st("starsFieldTitle")}</span>
                  <TextInput value={title} onChange={setTitle} label={st("starsFieldTitle")} maxLength={120} dir="auto" />
                </label>
                <label className="s-mediaform__row s-starsform__iconrow">
                  <span className="s-mediaform__label">{st("starsFieldIcon")}</span>
                  <TextInput value={icon} onChange={setIcon} label={st("starsFieldIcon")} maxLength={4} placeholder="✦" />
                  <p className="s-mediaform__hint">{st("starsFieldIconHint")}</p>
                </label>
              </div>
              <div className="s-mediaform__row">
                <span className="s-mediaform__label">{st("starsFieldKind")}</span>
                <SegmentedControl value={kind} onChange={(v) => setKind(v as ConstellationKind)} segments={KINDS.map((k) => ({ value: k.value, label: st(k.label) }))} label={st("starsFieldKind")} />
              </div>
            </>
          )}

          <label className="s-mediaform__row">
            <span className="s-mediaform__label">{st("starsFieldFolder")}</span>
            <TextInput value={folder} onChange={setFolder} label={st("starsFieldFolder")} maxLength={200} dir="auto" />
          </label>

          {tab === "new" && (
            <label className="s-mediaform__row">
              <span className="s-mediaform__label">{st("starsFieldCards")}</span>
              <textarea
                className="s-ctl s-ctl-input s-mediaform__notes s-starsform__cards"
                rows={8}
                value={text}
                dir="auto"
                spellCheck={false}
                placeholder={"front::back\nfront::back::extra"}
                onChange={(e) => setText(e.target.value)}
                data-testid="stars-cards"
              />
              <p className="s-mediaform__hint">{st("starsCardsHint")}</p>
              <p className="s-starsform__count" aria-live="polite" data-testid="stars-count">
                {countPhrase(cards.length, "stars")}
              </p>
            </label>
          )}

          {!(tab === "import" && isApkg) && <p className="s-mediaform__hint">{stf("starsWhere", { path: where })}</p>}
          {error && (
            <p className="s-mediaform__error" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="s-mediaform__foot">
          <button type="button" className="s-btn" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className="s-btn s-btn--accent" disabled={busy} data-testid="stars-save">
            {tab === "import" ? st("starsImportGo") : st("starsCreate")}
          </button>
        </div>
      </form>
    </div>
  );
}
