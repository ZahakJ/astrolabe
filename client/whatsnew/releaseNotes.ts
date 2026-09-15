// THE RELEASE NOTES — one deck per minor version, each slide a VISUAL and a
// few words in both languages.
//
// A slide's visual is one of three things, and "demo" is the one to reach
// for: a live piece of the product, drawn by the product's own renderer with
// sample data, so the preview is the feature and never a stale picture of
// it. An `svg` is for a mechanism a drawing explains better; an `image` is
// the last resort (a PNG under client/whatsnew/media/, imported as a URL).
//
// ADDING A RELEASE: add the version to versions.ts, an entry here with at
// least one slide, English AND Arabic on every string. scripts/check-whatsnew
// fails the build when a new x.Y.0 has no deck. This file is a lazy chunk —
// prose and demos cost the entry nothing.

import { isoDate, mergeEntry, parseRoutine, parseRoutineLog, shiftDate, type EntryPatch, type RoutineEntry } from "../../shared/routine.ts";
import { t } from "../i18n.ts";

export type Lang = "en" | "ar";
export type Text = Record<Lang, string>;

/** A drawing's label in the reader's language. */
const L = (lang: Lang, en: string, ar: string): string => (lang === "ar" ? ar : en);

export type Visual =
  | { kind: "demo"; mount: (host: HTMLElement, lang: Lang) => void | (() => void) }
  | { kind: "svg"; svg: string | ((lang: Lang) => string) }
  | { kind: "image"; src: string; alt: Text };

export interface Slide {
  title: Text;
  body: Text;
  visual: Visual;
  /** A manual page slug to link, e.g. "routines". */
  docs?: string;
}

export interface Release {
  version: string;
  title: Text;
  slides: Slide[];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ── 3.11.0: Routines ────────────────────────────────────────────────────────

const ROUTINE_PLAN: Text = {
  en: `title: Weekly exercise
kind: exercise
slots: morning, evening
fields: minutes:number, weight:number:kg
target: 6/week
monday:
  morning: 60 min brisk walk
  evening: Full Body A
tuesday:
  morning: 60 min easy walk
  evening: Bike 40 min + abs
wednesday:
  morning: 60 min walk
  evening: Full Body B
thursday:
  morning: Easy walk
  evening: Recovery cardio
friday:
  morning: 60 min walk
  evening: Full Body A/B
saturday:
  morning: Long bike ride
  evening: Stretching
sunday:
  morning: 60 min walk
  evening: Rest + meal prep
`,
  ar: `title: تمارين الأسبوع
kind: رياضة
slots: صباحًا, مساءً
fields: دقائق:number, الوزن:number:كغ
target: 6/week
الاثنين:
  صباحًا: مشي سريع 60 دقيقة
  مساءً: جسم كامل أ
الثلاثاء:
  صباحًا: مشي خفيف 60 دقيقة
  مساءً: دراجة 40 دقيقة + بطن
الأربعاء:
  صباحًا: مشي 60 دقيقة
  مساءً: جسم كامل ب
الخميس:
  صباحًا: مشي خفيف
  مساءً: كارديو استشفاء
الجمعة:
  صباحًا: مشي 60 دقيقة
  مساءً: جسم كامل أ/ب
السبت:
  صباحًا: جولة دراجة طويلة
  مساءً: إطالة
الأحد:
  صباحًا: مشي 60 دقيقة
  مساءً: راحة + تحضير الوجبات
`,
};

/** A month of sample days behind today: mostly complete, a few partial, one
 *  missed, so the streak lights, the strip shows every state and the heat
 *  has texture. Today is left open for the reader to tick. */
function sampleLog(slots: [string, string], fields: [string, string]): string {
  const today = isoDate(new Date());
  const lines: string[] = [];
  const pattern = ["cc", "cc", "c-", "cc", "cc", "--", "cc", "cc", "cc", "c-", "cc", "cc", "cc", "cc", "cc", "cc", "c-", "cc", "cc", "cc", "cc", "cc", "cc", "cc", "cc", "cc", "cc", "cc"];
  for (let i = pattern.length; i >= 1; i--) {
    const p = pattern[pattern.length - i];
    const date = shiftDate(today, -i);
    const done: string[] = [];
    if (p[0] === "c") done.push(slots[0]);
    if (p[1] === "c") done.push(slots[1]);
    if (done.length === 0) continue;
    const minutes = 45 + ((i * 7) % 40);
    const weight = (84.6 - i * 0.05).toFixed(1);
    lines.push(`${date} | done: ${done.join(", ")} | ${fields[0]}: ${minutes} | ${fields[1]}: ${weight}`);
  }
  return lines.join("\n") + "\n";
}

function routineDemo(host: HTMLElement, lang: Lang): () => void {
  const plan = parseRoutine(ROUTINE_PLAN[lang]);
  if (!plan) return () => {};
  const slots: [string, string] = lang === "ar" ? ["صباحًا", "مساءً"] : ["morning", "evening"];
  const fields: [string, string] = lang === "ar" ? ["دقائق", "الوزن"] : ["minutes", "weight"];
  let entries: RoutineEntry[] = parseRoutineLog(sampleLog(slots, fields), plan.fields);
  let alive = true;
  const draw = (mod: typeof import("../reading/routine.ts")): void => { // lineage
    if (!alive) return;
    const card = mod.renderRoutineCard(plan, entries, {
      notePath: "Routines/Weekly exercise.md",
      // LIVE: a tick here re-draws the card from the merged entry, so the
      // streak, the strip and the heat answer the reader's own click.
      onLog: (patch: EntryPatch) => {
        const existing = entries.find((e) => e.date === patch.date) ?? null;
        const merged = mergeEntry(existing, patch);
        entries = [...entries.filter((e) => e.date !== patch.date), merged].sort((a, b) => a.date.localeCompare(b.date));
        draw(mod);
      },
    });
    host.replaceChildren(card);
  };
  void import("../reading/routine.ts").then(draw); // lineage
  return () => {
    alive = false;
  };
}

function templatesDemo(host: HTMLElement, lang: Lang): void {
  const wrap = el("div", "s-wn-templates");
  const names: Record<Lang, string[]> = {
    en: ["Exercise", "Habits", "Prayers", "Sleep", "Water", "Mood", "Reading", "Study", "Your own"],
    ar: ["رياضة", "عادات", "صلاة", "نوم", "ماء", "مزاج", "قراءة", "دراسة", "قالبك"],
  };
  const row = el("div", "s-wn-chips");
  names[lang].forEach((n, i) => {
    const chip = el("span", `s-wn-chip${i === 0 ? " is-on" : ""}${i === names[lang].length - 1 ? " is-own" : ""}`, n);
    row.appendChild(chip);
  });
  wrap.appendChild(row);
  const page = el("div", "s-wn-page");
  const head = el("div", "s-wn-page__head");
  head.appendChild(el("span", "s-wn-page__date", lang === "ar" ? "الأحد، 13 سبتمبر" : "Sunday, September 13"));
  head.appendChild(el("span", "s-wn-page__title", lang === "ar" ? "الروتين" : "Routines")); // lineage
  head.appendChild(el("span", "s-wn-page__lead", lang === "ar" ? "2 من 3 مكتمل اليوم" : "2 of 3 complete today"));
  page.appendChild(head);
  const cards = el("div", "s-wn-page__cards");
  const rows: Record<Lang, [string, number][]> = {
    en: [["Weekly exercise", 1], ["Prayers", 1], ["Sleep", 0]],
    ar: [["تمارين الأسبوع", 1], ["الصلوات", 1], ["النوم", 0]],
  };
  for (const [name, done] of rows[lang]) {
    const c = el("div", `s-wn-mini${done ? " is-done" : ""}`);
    c.appendChild(el("span", "s-wn-mini__title", name));
    const dots = el("span", "s-wn-mini__dots");
    for (let i = 0; i < 7; i++) dots.appendChild(el("i", `s-wn-mini__dot${i < 6 ? " is-on" : ""}`));
    c.appendChild(dots);
    cards.appendChild(c);
  }
  page.appendChild(cards);
  wrap.appendChild(page);
  host.replaceChildren(wrap);
}

// ── 3.12.0: queries and tasks, over the reader's own vault ──────────────────

function queryDemo(host: HTMLElement, lang: Lang): () => void {
  let alive = true;
  void Promise.all([import("../reading/query.ts"), import("../../shared/queryFence.ts")]).then(([mod, q]) => {
    if (!alive) return;
    const spec = q.parseQueryFence(lang === "ar" ? "sort: modified desc\nlimit: 6\nas: table\nshow: title, modified, tags" : "sort: modified desc\nlimit: 6\nas: table\nshow: title, modified, tags");
    host.replaceChildren(mod.renderQueryFence(spec, { notePath: "" }));
  });
  return () => {
    alive = false;
  };
}

function tasksDemo(host: HTMLElement, lang: Lang): () => void {
  let alive = true;
  void lang;
  void Promise.all([import("../reading/tasks.ts"), import("../../shared/tasks.ts")]).then(([mod, tk]) => {
    if (!alive) return;
    const today = isoDate(new Date());
    // The reader's own open tasks when they have any; a sample list when not.
    const spec = tk.parseTasksFence("not done\nlimit: 6", today);
    const sample = [
      { path: "Ledger.md", title: lang === "ar" ? "الدفتر" : "Ledger", tags: [], task: tk.parseTaskLine(`- [ ] ${lang === "ar" ? "اقرأ الفصل الثالث" : "Read chapter 3"} 📅 ${today} ⏫`, 1)! },
      { path: "Ledger.md", title: lang === "ar" ? "الدفتر" : "Ledger", tags: [], task: tk.parseTaskLine(`- [ ] ${lang === "ar" ? "راجع الحسابات" : "Reconcile the accounts"} 📅 ${shiftDate(today, 4)} 🔁 ${lang === "ar" ? "كل أسبوع" : "every week"}`, 2)! },
      { path: "Kitchen.md", title: lang === "ar" ? "المطبخ" : "Kitchen", tags: [], task: tk.parseTaskLine(`- [ ] ${lang === "ar" ? "اشترِ الكمون" : "Buy cumin"} 📅 ${shiftDate(today, -1)}`, 1)! },
    ];
    host.replaceChildren(mod.renderTasksFence(spec, { notePath: "", live: false, rows: sample }));
  });
  return () => {
    alive = false;
  };
}

// ── 3.10.0: Easy on the eyes ────────────────────────────────────────────────

function eyeDemo(host: HTMLElement, lang: Lang): void {
  void lang; // the strings below come from the dictionary, which follows the chrome
  const wrap = el("div", "s-wn-eye");
  const page = el("div", "s-wn-eye__page");
  page.appendChild(el("div", "s-wn-eye__h", lang === "ar" ? "ملاحظة في ضوء المصباح" : "A note by lamplight"));
  for (const w of [92, 78, 85, 60]) {
    const line = el("div", "s-wn-eye__line");
    line.style.inlineSize = `${w}%`;
    page.appendChild(line);
  }
  const sheet = el("div", "s-wn-eye__sheet");
  page.appendChild(sheet);
  wrap.appendChild(page);
  const controls = el("label", "s-wn-eye__ctl");
  controls.appendChild(el("span", "s-wn-eye__label", t("rowScreenWarmth")));
  const range = el("input", "s-wn-eye__range");
  range.type = "range";
  range.min = "0";
  range.max = "100";
  range.value = "55";
  range.setAttribute("aria-label", t("rowScreenWarmth"));
  const value = el("span", "s-wn-eye__value", "55%");
  const apply = (): void => {
    sheet.style.opacity = String(Number(range.value) / 100);
    value.textContent = `${range.value}%`;
  };
  range.addEventListener("input", apply);
  apply();
  controls.appendChild(range);
  controls.appendChild(value);
  wrap.appendChild(controls);
  host.replaceChildren(wrap);
}

// ── 3.13.0: an ayah drawn in, harakat put on ────────────────────────────────
// DOM rather than SVG: Arabic script needs the browser's shaping and a real
// right-to-left line, which an SVG the stage forces left-to-right cannot
// give it (the first drawing ran the verse off the frame). The loop is CSS
// (whatsnew.css, ".s-wn-ayah", ".s-wn-harakat").

function ayahDemo(host: HTMLElement, lang: Lang): void {
  const wrap = el("div", "s-wn-ayah");
  wrap.appendChild(el("div", "s-wn-ayah__src", "> [!ayah] 2:255"));
  const callout = el("div", "s-wn-ayah__callout");
  callout.appendChild(el("p", "s-wn-ayah__verse", "ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ۚ لَا تَأْخُذُهُۥ سِنَةٌ وَلَا نَوْمٌ ۚ لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ ۗ …"));
  callout.appendChild(el("p", "s-wn-ayah__ref", lang === "ar" ? "البقرة · ٢٥٥" : "Al-Baqarah · 255"));
  wrap.appendChild(callout);
  const hadith = el("div", "s-wn-ayah__hadith", "> [!hadith] Bukhari 1");
  hadith.appendChild(el("b", "", lang === "ar" ? "→ من مجلد مجموعتك" : "→ from your corpus folder"));
  wrap.appendChild(hadith);
  host.replaceChildren(wrap);
}

function harakatDemo(host: HTMLElement, lang: Lang): void {
  void lang; // the line is Arabic in both languages; the caption is a chord
  const wrap = el("div", "s-wn-harakat");
  const line = el("div", "s-wn-harakat__line", "كتب الطالب الدرس");
  line.appendChild(el("span", "s-wn-harakat__pointed", "كَتَبَ الطَّالِبُ الدَّرْسَ"));
  wrap.appendChild(line);
  wrap.appendChild(el("div", "s-wn-harakat__keys", "Ctrl/Cmd Alt ;"));
  const palette = el("div", "s-wn-harakat__palette");
  ["ـَ", "ـُ", "ـِ", "ـّ", "ـْ", "ـً", "ـٰ"].forEach((mark, i) => {
    const key = el("span", "s-wn-harakat__key", mark);
    key.style.setProperty("--i", String(i));
    palette.appendChild(key);
  });
  wrap.appendChild(palette);
  host.replaceChildren(wrap);
}


// ── 3.15.0: the manual, two pages side by side ─────────────────────────────
// DOM, not SVG, for the reason the ayah slide is DOM: Arabic prose needs a
// real right-to-left line, and the stage forces every drawing left-to-right.
// RULE FOR EVERY FUTURE SLIDE: an Arabic sentence never goes into an SVG
// <text>; a single Arabic word anchored at its start is fine, a line is not.
function manualDemo(host: HTMLElement, lang: Lang): void {
  void lang; // both pages show regardless: the point is the pair
  const wrap = el("div", "s-wn-manual");
  const en = el("div", "s-wn-manual__page");
  en.dir = "ltr";
  en.appendChild(el("h4", "s-wn-manual__h", "Sigils"));
  en.appendChild(el("p", "s-wn-manual__p", "A sigil is something you keep every day: a walk, the prayers, a page of reading."));
  en.appendChild(el("p", "s-wn-manual__p", "You write the plan once. Each day you tick what you did, and the note keeps the record."));
  const ar = el("div", "s-wn-manual__page s-wn-manual__page--ar");
  ar.dir = "rtl";
  ar.appendChild(el("h4", "s-wn-manual__h", "السِّجِلّ"));
  ar.appendChild(el("p", "s-wn-manual__p", "السِّجِلّ شيء تحافظ عليه كل يوم: مشية، أو الصلوات، أو صفحة قراءة."));
  ar.appendChild(el("p", "s-wn-manual__p", "تكتب الخطة مرة واحدة، وكل يوم تعلّم على ما فعلت، والملاحظة تحفظ السجل."));
  wrap.appendChild(en);
  wrap.appendChild(ar);
  host.replaceChildren(wrap);
}


// ── 3.16.0: furigana, drawn by the real <ruby> ─────────────────────────────
// DOM, because a reading over a kanji is what the browser's ruby element
// draws and an SVG imitation would be a picture of it; and because the
// Arabic caption is a sentence (the slide rule: no Arabic sentence in an
// SVG <text>).
function furiganaDemo(host: HTMLElement, lang: Lang): void {
  const wrap = el("div", "s-wn-ruby");
  const line = el("p", "s-wn-ruby__line");
  line.lang = "ja";
  const ruby = (base: string, readings: string[]): HTMLElement => {
    const r = document.createElement("ruby");
    if (readings.length === 1) {
      r.appendChild(document.createTextNode(base));
      r.appendChild(el("rt", "", readings[0]));
    } else {
      // One reading per kanji, in order; kana inside the word skipped.
      let i = 0;
      for (const ch of base) {
        r.appendChild(document.createTextNode(ch));
        if (/[一-鿿]/.test(ch)) r.appendChild(el("rt", "", readings[i++] ?? ""));
      }
    }
    return r;
  };
  line.appendChild(ruby("漢字", ["かんじ"]));
  line.appendChild(document.createTextNode("を"));
  line.appendChild(ruby("食べ物", ["た", "もの"]));
  line.appendChild(document.createTextNode("と"));
  line.appendChild(ruby("学校", ["がく", "こう"]));
  line.appendChild(document.createTextNode("で"));
  line.appendChild(ruby("書く", ["か"]));
  wrap.appendChild(line);
  wrap.appendChild(el("div", "s-wn-ruby__src", "{漢字|かんじ}を{食べ物|た|もの}と{学校|がく|こう}で{書く|か}"));
  const chips = el("div", "s-wn-ruby__chips");
  chips.appendChild(el("span", "s-wn-ruby__kanji", "食"));
  ["た", "く", "ショク", "ジキ"].forEach((r, i) => {
    const c = el("span", `s-wn-ruby__chip${i === 0 ? " is-on" : ""}`, r);
    chips.appendChild(c);
  });
  chips.appendChild(el("span", "s-wn-ruby__hint", lang === "ar" ? "القراءات المقترحة لكل كانجي" : "the readings offered for each kanji"));
  wrap.appendChild(chips);
  host.replaceChildren(wrap);
}

// ── The registry ────────────────────────────────────────────────────────────

export const RELEASES: Release[] = [
  {
    version: "3.16.0",
    title: { en: "Orbits, Sigils, French and furigana", ar: "المدارات والسِّجِلّ والفرنسية والفوريغانا" },
    slides: [
      {
        title: { en: "Orbits — your own spaced repetition", ar: "المدارات: تكرارك المتباعد أنت" },
        body: {
          en: "A deck is a note with a deck block and front::back lines. A session asks what is due, with Anki's learning steps and a daily limit of new cards, and writes each card's next date into the note as the Obsidian plugin's own comment. Typed answers, reversed pairs, sections, Anki and CSV import, and six Japanese decks ready to study.",
          ar: "المجموعة ملاحظة فيها كتلة deck وأسطر وجه::ظهر. والجلسة تسألك ما استُحق، بخطوات التعلم التي في Anki وحدٍّ يومي للبطاقات الجديدة، وتكتب موعد كل بطاقة التالي في الملاحظة تعليقًا بصيغة إضافة Obsidian نفسها. إجابات تكتبها، وأزواج معكوسة، وأقسام، واستيراد من Anki وCSV، وست مجموعات يابانية جاهزة.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <g class="wa" style="--i:0"><rect x="30" y="30" width="180" height="160" rx="10" fill="var(--bg)" stroke="var(--border)"/>
    <text x="48" y="70" font-size="30">あ</text>
    <text x="90" y="62" fill="var(--text)" font-family="Georgia, serif" font-size="15">Hiragana</text>
    <text x="90" y="80" fill="var(--text-faint)" font-size="10">${L(lang, "japanese · kana", "japanese · kana")}</text>
    <g font-size="11"><text x="48" y="112" fill="var(--accent)" font-weight="600">12</text><text x="66" y="112" fill="var(--text-muted)">${L(lang, "due", "مستحقة")}</text><text x="110" y="112" fill="var(--text)" font-weight="600">10</text><text x="128" y="112" fill="var(--text-muted)">${L(lang, "new", "جديدة")}</text><text x="170" y="112" fill="var(--text-faint)">104</text></g>
    <polyline points="48,150 66,146 84,148 102,140 120,142 138,134 156,136 174,128 192,130" fill="none" stroke="var(--callout-success)" stroke-width="2"/>
    <g class="wa-press" style="--i:2"><rect x="48" y="160" width="70" height="20" rx="10" fill="var(--bg)" stroke="var(--accent)"/><text x="83" y="174" text-anchor="middle" fill="var(--accent)" font-size="11">${L(lang, "Study", "ادرس")}</text></g>
  </g>
  <g class="wa-late" style="--i:1"><rect x="240" y="30" width="290" height="160" rx="10" fill="var(--bg)" stroke="var(--border)"/>
    <text x="256" y="52" fill="var(--text-faint)" font-size="10" letter-spacing="1">${L(lang, "HIRAGANA · ROW A", "HIRAGANA · ROW A")}</text>
    <text x="385" y="98" text-anchor="middle" font-size="40" fill="var(--text)">あ</text>
    <g><rect x="300" y="108" width="170" height="24" rx="6" fill="var(--bg-raised)" stroke="var(--border)"/><text x="310" y="125" fill="var(--text)" font-family="ui-monospace, monospace" font-size="13">a</text><rect class="wa-blink" x="320" y="113" width="1.5" height="14" fill="var(--accent)"/></g>
    <g font-size="10">
      <rect x="256" y="146" width="62" height="38" rx="6" fill="var(--bg-raised)" stroke="var(--border)"/><text x="287" y="160" text-anchor="middle" fill="var(--text)">${L(lang, "Again", "مرة أخرى")}</text><text x="287" y="177" text-anchor="middle" fill="var(--text-faint)">1m</text>
      <rect x="324" y="146" width="62" height="38" rx="6" fill="var(--bg-raised)" stroke="var(--border)"/><text x="355" y="160" text-anchor="middle" fill="var(--text)">${L(lang, "Hard", "صعب")}</text><text x="355" y="177" text-anchor="middle" fill="var(--text-faint)">10m</text>
      <rect x="392" y="146" width="62" height="38" rx="6" fill="var(--bg-raised)" stroke="var(--accent)"/><text x="423" y="160" text-anchor="middle" fill="var(--accent)">${L(lang, "Good", "جيد")}</text><text x="423" y="177" text-anchor="middle" fill="var(--text-faint)">1d</text>
      <rect x="460" y="146" width="62" height="38" rx="6" fill="var(--bg-raised)" stroke="var(--border)"/><text x="491" y="160" text-anchor="middle" fill="var(--text)">${L(lang, "Easy", "سهل")}</text><text x="491" y="177" text-anchor="middle" fill="var(--text-faint)">4d</text>
    </g>
  </g>
  <g class="wa-pulse" style="--i:3" transform="translate(500 22) scale(0.9)"><circle cx="12" cy="12" r="3.2" fill="none" stroke="var(--accent)" stroke-width="2"/><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(-30 12 12)" fill="none" stroke="var(--accent)" stroke-width="2"/><circle cx="20.2" cy="7.25" r="1.6" fill="var(--accent)"/></g>
</svg>`,
        },
        docs: "orbits",
      },
      {
        title: { en: "Sigils — the routine, renamed", ar: "السِّجِلّ: الروتين باسم جديد" }, // lineage
        body: {
          en: "The daily plan and its log have a new name and a door of their own: a seal, beside the ring. It was Routines, then Orbits in 3.15; 3.16 gives Orbits to spaced repetition, where a card comes back around, and a sigil is the seal you set on a kept day. Every note you have still works, whichever fence it was written with.", // lineage
          ar: "لخطة اليوم وسجلّها اسم جديد وباب خاص: ختم بجوار الحلقة. كانت الروتين، ثم المدارات في 3.15؛ ويعطي 3.16 المدارات للتكرار المتباعد حيث تعود البطاقة في مدارها، والسِّجِلّ ختم تضعه على يوم حافظت عليه. وكل ملاحظة عندك ما زالت تعمل بأي سياج كُتبت.", // lineage
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <rect x="12" y="164" width="536" height="44" fill="var(--bg-hover)"/>
  <g transform="translate(400 168) scale(0.75)"><circle cx="12" cy="12" r="3.2" fill="none" stroke="var(--text-muted)" stroke-width="2"/><ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(-30 12 12)" fill="none" stroke="var(--text-muted)" stroke-width="2"/><circle cx="20.2" cy="7.25" r="1.6" fill="var(--text-muted)"/></g>
  <text x="409" y="201" text-anchor="middle" fill="var(--text-faint)" font-size="9">${L(lang, "Orbits", "المدارات")}</text>
  <g class="wa-pulse" style="--i:1" transform="translate(440 168) scale(0.75)"><circle cx="12" cy="12" r="9" fill="none" stroke="var(--accent)" stroke-width="2"/><path d="M9 12.5l2 2 4-5" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>
  <text x="449" y="201" text-anchor="middle" fill="var(--accent)" font-size="9">${L(lang, "Sigils", "السِّجِلّ")}</text>
  <g transform="translate(480 170) scale(0.7)"><circle cx="12" cy="12" r="8" fill="none" stroke="var(--text-faint)" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="var(--text-faint)" stroke-width="2"/></g>
  <g class="wa" style="--i:0"><rect x="30" y="30" width="500" height="126" rx="10" fill="var(--bg)" stroke="var(--border)"/>
    <text x="48" y="58" font-size="18">🗻</text><text x="76" y="57" fill="var(--text)" font-family="Georgia, serif" font-size="15">${L(lang, "Japanese", "اليابانية")}</text>
    <text x="440" y="57" fill="var(--text-faint)" font-size="11">${L(lang, "4 / 6 this week", "4 / 6 هذا الأسبوع")}</text>
    <g font-size="12">
      <rect x="48" y="74" width="13" height="13" rx="3" fill="none" stroke="var(--accent)"/><path class="wa-draw" style="--i:2" d="M51 81l3 3 6-7" fill="none" stroke="var(--accent)" stroke-width="2"/>
      <text x="70" y="85" fill="var(--text-muted)">${L(lang, "review:", "مراجعة:")}</text><text x="136" y="85" fill="var(--text)">Hiragana</text>
      <g class="wa-late" style="--i:1"><rect x="200" y="72" width="104" height="18" rx="9" fill="var(--bg-raised)" stroke="var(--accent)"/><text x="252" y="85" text-anchor="middle" fill="var(--accent)" font-size="10">${L(lang, "12 due · Study", "12 مستحقة · ادرس")}</text></g>
      <rect x="48" y="100" width="13" height="13" rx="3" fill="none" stroke="var(--border)"/><text x="70" y="111" fill="var(--text-muted)">${L(lang, "study:", "دراسة:")}</text><text x="136" y="111" fill="var(--text)">${L(lang, "Genki, grammar point 1", "Genki، القاعدة 1")}</text>
      <rect x="48" y="126" width="13" height="13" rx="3" fill="none" stroke="var(--border)"/><text x="70" y="137" fill="var(--text-muted)">${L(lang, "immerse:", "انغماس:")}</text><text x="136" y="137" fill="var(--text)">${L(lang, "one video, no pausing", "فيديو واحد بلا توقف")}</text>
    </g>
    <g fill="var(--bg-hover)">${Array.from({ length: 12 }, (_, c) => Array.from({ length: 7 }, (__, r) => `<rect x="${360 + c * 14}" y="${74 + r * 8}" width="6" height="6" rx="1"${(c * 7 + r) % 4 === 0 ? ' fill="var(--callout-success)"' : ""}/>`).join("")).join("")}</g>
  </g>
</svg>`,
        },
        docs: "sigils",
      },
      {
        title: { en: "French, corrected as you type", ar: "الفرنسية، تُصحَّح وأنت تكتب" },
        body: {
          en: "Type tres and a space and it becomes très; coeur becomes cœur, Ecole becomes École. Only on lines that read as French, only once a word is finished, and only for words that cannot go the other way — a and à are left to you. Never in code, links or math; one undo takes one correction back. Settings → This device turns it off.",
          ar: "اكتب tres ومسافةً فتصير très؛ وcoeur تصير cœur، وEcole تصير École. على الأسطر التي تُقرأ فرنسية وحدها، وعند اكتمال الكلمة وحده، وللكلمات التي لا تحتمل الوجهين وحدها؛ فـa وà متروكتان لك. لا في الكود ولا الروابط ولا الرياضيات؛ وتراجع واحد يردّ تصحيحًا واحدًا. والإعدادات ← هذا الجهاز يوقفه.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <g font-family="Georgia, serif" font-size="16">
    <text x="40" y="52" fill="var(--text-faint)" font-family="ui-monospace, monospace" font-size="10">1</text>
    <text x="60" y="52" fill="var(--text-muted)">Tres bien, c'est</text>
    <rect class="wa-blink" x="181" y="39" width="1.5" height="16" fill="var(--accent)"/>
    <g class="wa-late" style="--i:0"><path d="M46 62v10a4 4 0 0 0 4 4h4" fill="none" stroke="var(--accent)" stroke-width="1.5"/><text x="60" y="82" fill="var(--text)">Tr<tspan fill="var(--accent)">è</tspan>s bien, c'est</text><text x="200" y="82" fill="var(--text-faint)" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11">${L(lang, "at the space", "عند المسافة")}</text></g>
    <text x="40" y="112" fill="var(--text-faint)" font-family="ui-monospace, monospace" font-size="10">2</text>
    <text x="60" y="112" fill="var(--text-muted)">This is tres chic</text>
    <text class="wa-late" style="--i:1" x="230" y="112" fill="var(--text-faint)" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11">${L(lang, "an English line: untouched", "سطر إنجليزي: لا يُمسّ")}</text>
  </g>
  <g font-size="12" class="wa-late" style="--i:2">
    <text x="60" y="146" fill="var(--text-muted)">coeur</text><text x="112" y="146" fill="var(--text-faint)">→</text><text x="130" y="146" fill="var(--text)">cœur</text>
    <text x="220" y="146" fill="var(--text-muted)">Ecole</text><text x="270" y="146" fill="var(--text-faint)">→</text><text x="288" y="146" fill="var(--text)">École</text>
    <text x="380" y="146" fill="var(--text-muted)">deja</text><text x="420" y="146" fill="var(--text-faint)">→</text><text x="438" y="146" fill="var(--text)">déjà</text>
    <text x="60" y="170" fill="var(--text-muted)">a · à</text><text x="130" y="170" fill="var(--text-faint)">${L(lang, "both are words: left to you", "كلتاهما كلمة: متروكة لك")}</text>
    <text x="60" y="194" fill="var(--text-muted)">Ctrl/Cmd Z</text><text x="150" y="194" fill="var(--text-faint)">${L(lang, "one correction back", "تصحيح واحد إلى الوراء")}</text>
  </g>
</svg>`,
        },
        docs: "editor",
      },
      {
        title: { en: "Furigana over kanji", ar: "الفوريغانا فوق الكانجي" },
        body: {
          en: "Write {漢字|かんじ} — the Obsidian Markdown Furigana plugin's syntax — and the reading is drawn over the word in the editor, the reading view, the site and on paper. Select a word, right-click, Insert → Furigana…: a box suggests each kanji's reading from KANJIDIC2, the other readings as chips; or automatic for a selection, in one undo step.",
          ar: "اكتب {漢字|かんじ}، صيغة إضافة Markdown Furigana في Obsidian، فتُرسم القراءة فوق الكلمة في المحرر وعرض القراءة والموقع وعلى الورق. حدّد كلمة، وانقر بالزر الأيمن، ثم إدراج ← فوريغانا…: يقترح صندوق قراءة كل كانجي من KANJIDIC2، والقراءات الأخرى شرائح؛ أو تلقائيًا للتحديد في خطوة تراجع واحدة.",
        },
        visual: { kind: "demo", mount: furiganaDemo },
        docs: "japanese",
      },
      {
        title: { en: "Everything follows the vault", ar: "كل شيء يتبع الخزانة" },
        body: {
          en: "Your named layouts, the book shelf with the page each book was left on, and your notes to self on words now live in the vault's .astrolabe folder, mirrored as the site's settings and the designer's documents already were. Point a new machine at the vault and they are there; what describes one window on one screen stays put.",
          ar: "تخطيطاتك المسمّاة، ورف الكتب مع الصفحة التي تركت كل كتاب عندها، وملاحظاتك لنفسك على الكلمات تعيش الآن في مجلد ‎.astrolabe في الخزانة، مرآةً كما كانت إعدادات الموقع ومستندات المصمم من قبل. وجّه جهازًا جديدًا إلى الخزانة فتجدها هناك؛ وما يصف نافذة واحدة على شاشة واحدة يبقى حيث هو.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <g class="wa" style="--i:0"><rect x="36" y="60" width="140" height="90" rx="8" fill="var(--bg)" stroke="var(--border)"/><rect x="24" y="150" width="164" height="10" rx="3" fill="var(--bg-hover)" stroke="var(--border)"/><text x="106" y="176" text-anchor="middle" fill="var(--text-faint)" font-size="10">${L(lang, "the laptop", "الحاسوب المحمول")}</text>
    <g font-size="10" fill="var(--text-muted)"><text x="50" y="82">${L(lang, "Layout · Reading", "تخطيط · قراءة")}</text><text x="50" y="102">${L(lang, "The Muqaddima · p. 212", "المقدمة · ص 212")}</text><text x="50" y="122">${L(lang, "notes on words", "ملاحظات على الكلمات")}</text></g></g>
  <g class="wa" style="--i:3"><rect x="384" y="60" width="140" height="90" rx="8" fill="var(--bg)" stroke="var(--border)"/><rect x="372" y="150" width="164" height="10" rx="3" fill="var(--bg-hover)" stroke="var(--border)"/><text x="454" y="176" text-anchor="middle" fill="var(--text-faint)" font-size="10">${L(lang, "a new machine", "جهاز جديد")}</text>
    <g class="wa-late" style="--i:2" font-size="10" fill="var(--text-muted)"><text x="398" y="82">${L(lang, "Layout · Reading", "تخطيط · قراءة")}</text><text x="398" y="102">${L(lang, "The Muqaddima · p. 212", "المقدمة · ص 212")}</text><text x="398" y="122">${L(lang, "notes on words", "ملاحظات على الكلمات")}</text></g></g>
  <g class="wa" style="--i:1"><path d="M240 84h80a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6h-80a6 6 0 0 1-6-6V90a6 6 0 0 1 6-6z" fill="color-mix(in srgb, var(--accent) 14%, var(--bg))" stroke="var(--accent)"/><path d="M234 90a6 6 0 0 1 6-6h26l8 8h46" fill="none" stroke="var(--accent)"/><text x="280" y="119" text-anchor="middle" fill="var(--text)" font-size="11">.astrolabe</text><text x="280" y="160" text-anchor="middle" fill="var(--text-faint)" font-size="10">${L(lang, "the vault", "الخزانة")}</text></g>
  <g class="wa-late" style="--i:1" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"><path d="M182 104h44"/><path d="M220 98l8 6-8 6"/><path d="M334 104h44"/><path d="M372 98l8 6-8 6"/></g>
  <g class="wa-late" style="--i:2"><text x="280" y="40" text-anchor="middle" fill="var(--text-muted)" font-size="11">${L(lang, "layouts · books · annotations", "تخطيطات · كتب · حواشٍ")}</text></g>
</svg>`,
        },
        docs: "backup-and-sync",
      },
    ],
  },
  {
    version: "3.15.0",
    title: { en: "Sigils, and a manual you can read", ar: "السِّجِلّ، ودليل يُقرأ" },
    slides: [
      {
        title: { en: "Routines are Sigils now", ar: "الروتين صار السِّجِلّ" }, // lineage
        body: {
          en: "The things you keep every day. The name changed twice: 3.15 called them Orbits, and 3.16 gives that word to spaced repetition, where it fits — a card comes back around. A sigil is a seal you set on a kept day, and the same root in Arabic is the word for a register. Same notes, same fences (the older routine and orbit fences still work) — and a rebuilt form: pick a preset or start from nothing, give it an emoji and a banner, and choose exactly what to record each day, every field explained.", // lineage
          ar: "الأشياء التي تحافظ عليها كل يوم. تغيّر الاسم مرتين: سمّاها الإصدار 3.15 المدارات، وأعطى 3.16 تلك الكلمة للتكرار المتباعد حيث تليق بها، فالبطاقة تعود في مدارها. والسِّجِلّ ختم تضعه على يوم حافظت عليه، وجذره نفسه في العربية هو الدفتر الذي تُقيَّد فيه الأيام. الملاحظات نفسها والسياجات نفسها (سياجا routine وorbit الأقدم ما زالا يعملان)، ونموذج أُعيد بناؤه: اختر قالبًا أو ابدأ من لا شيء، وأعطه رمزًا تعبيريًا ولافتة، واختر بالضبط ما تسجّله كل يوم، وكل حقل مشروح.", // lineage
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <g><circle cx="80" cy="110" r="46" fill="none" stroke="var(--border)" stroke-dasharray="3 4"/><circle cx="80" cy="110" r="30" fill="var(--accent)" opacity="0.18" stroke="var(--accent)" stroke-width="2"/><path class="wa-draw" d="M66 112l10 10 20-24" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>
  <text x="150" y="52" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "NEW SIGIL", "سِجِلّ جديد")}</text>
  <g><rect x="150" y="62" width="380" height="40" rx="8" fill="var(--bg)" stroke="var(--border)"/><text x="166" y="88" font-size="20">🚶</text><text x="196" y="87" fill="var(--text)" font-family="Georgia, serif" font-size="15">${L(lang, "Daily exercise", "رياضة يومية")}</text><text x="450" y="87" fill="var(--text-faint)" font-size="11">${L(lang, "6 / week", "6 في الأسبوع")}</text></g>
  <text x="150" y="126" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "WHAT TO RECORD EACH DAY", "ما تسجّله كل يوم")}</text>
  <g font-size="12" fill="var(--text)">
    <rect x="150" y="136" width="14" height="14" rx="3" fill="none" stroke="var(--border)"/><text x="172" y="147">${L(lang, "Minutes", "الدقائق")}</text><text x="230" y="147" fill="var(--text-faint)" font-size="11">${L(lang, "a number", "رقم")}</text>
    <rect x="150" y="158" width="14" height="14" rx="3" fill="none" stroke="var(--border)"/><text x="172" y="169">${L(lang, "Weight", "الوزن")}</text><text x="230" y="169" fill="var(--text-faint)" font-size="11">${L(lang, "a number, kg", "رقم، كغ")}</text>
    <rect x="150" y="180" width="14" height="14" rx="3" fill="none" stroke="var(--accent)"/><path class="wa-draw" d="M153 187l3 3 6-7" fill="none" stroke="var(--accent)" stroke-width="2"/><text x="172" y="191">${L(lang, "Focus", "التركيز")}</text><text x="230" y="191" fill="var(--text-faint)" font-size="11">${L(lang, "1–5, how focused", "1–5، كم كنت مركّزًا")}</text>
    <rect x="400" y="136" width="14" height="14" rx="3" fill="none" stroke="var(--accent)"/><path class="wa-draw" d="M403 143l3 3 6-7" fill="none" stroke="var(--accent)" stroke-width="2"/><text x="422" y="147">${L(lang, "Mood", "المزاج")}</text>
    <rect x="400" y="158" width="14" height="14" rx="3" fill="none" stroke="var(--border)"/><text x="422" y="169">${L(lang, "Water", "الماء")}</text>
    <rect x="400" y="180" width="14" height="14" rx="3" fill="none" stroke="var(--border)"/><text x="422" y="191">${L(lang, "Your own field…", "حقلك أنت…")}</text>
  </g>
</svg>`,
        },
        docs: "sigils",
      },
      {
        title: { en: "Nothing updates itself", ar: "لا شيء يحدّث نفسه" },
        body: {
          en: "The desktop app no longer downloads anything on its own. It looks quietly, and when a newer release exists the build number says so; you click to download, and click again to restart into it. Settings → This device → Software updates turns even the looking off. Settings itself is re-cut into calmer, evenly filled tabs.",
          ar: "لم يعد تطبيق سطح المكتب ينزّل شيئًا من تلقاء نفسه. يتحقق بهدوء، وإذا وُجد إصدار أحدث قال رقم البناء ذلك؛ تنقر لتنزّله، ثم تنقر مرة أخرى لتعيد التشغيل إليه. والإعدادات ← هذا الجهاز ← تحديثات البرنامج يوقف حتى التحقق. والإعدادات نفسها أُعيد تقسيمها إلى تبويبات أهدأ وأكثر توازنًا.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <rect x="12" y="160" width="536" height="48" fill="var(--bg-hover)"/><rect x="12" y="150" width="536" height="30" fill="var(--bg-hover)"/>
  <g><text x="30" y="188" fill="var(--text-muted)" font-size="12">${L(lang, "12 notes", "12 ملاحظة")}</text></g>
  <g><rect x="340" y="170" width="190" height="26" rx="13" fill="var(--bg)" stroke="var(--accent)"/><text x="435" y="187" text-anchor="middle" fill="var(--accent)" font-size="12">${L(lang, "3.15.0 available · Download", "3.15.0 متاح · نزّل")}</text></g>
  <text class="wa-late" x="435" y="140" text-anchor="middle" fill="var(--text-faint)" font-size="11">${L(lang, "…then: Restart to update", "…ثم: أعد التشغيل للتحديث")}</text>
  <text x="30" y="46" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "SETTINGS · THIS DEVICE", "الإعدادات · هذا الجهاز")}</text>
  <g><text x="30" y="72" fill="var(--text)" font-size="13">${L(lang, "Software updates", "تحديثات البرنامج")}</text><text x="30" y="90" fill="var(--text-muted)" font-size="11">${L(lang, "Nothing is ever installed without asking.", "لا يُثبَّت شيء من دون سؤال.")}</text></g>
  <g><rect x="330" y="58" width="100" height="26" rx="13" fill="color-mix(in srgb, var(--accent) 22%, var(--bg))" stroke="var(--accent)"/><text x="380" y="75" text-anchor="middle" fill="var(--text)" font-size="12">${L(lang, "Tell me", "أخبرني")}</text><rect x="434" y="58" width="80" height="26" rx="13" fill="var(--bg)" stroke="var(--border)"/><text x="474" y="75" text-anchor="middle" fill="var(--text-muted)" font-size="12">${L(lang, "Off", "إيقاف")}</text></g>
</svg>`,
        },
        docs: "desktop",
      },
      {
        title: { en: "Panes you can resize, on Windows too", ar: "لوحات تغيّر حجمها، وعلى ويندوز أيضًا" },
        body: {
          en: "A window under 1000 pixels wide used to turn into a phone: the sidebar slid in from the edge and nothing had a grip. A scaled Windows laptop lives there. With a mouse, panes now stay docked and resizable down to phone width; the drawer is for devices with no fine pointer. The outline pane's grip no longer scrolls away with a long list.",
          ar: "كانت النافذة الأضيق من 1000 بكسل تتحول إلى هاتف: ينزلق الشريط الجانبي من الحافة ولا مقبض لشيء. وحاسوب ويندوز المحمول بتكبيره يعيش هناك. مع الفأرة تبقى اللوحات الآن راسية وقابلة لتغيير الحجم حتى عرض الهاتف؛ والدرج للأجهزة التي لا مؤشر دقيقًا لها. ومقبض لوحة المخطط لم يعد ينزلق بعيدًا مع قائمة طويلة.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <g><rect x="40" y="30" width="480" height="160" rx="8" fill="var(--bg)" stroke="var(--border)"/><rect x="40" y="30" width="480" height="22" rx="8" fill="var(--bg-hover)"/><circle cx="54" cy="41" r="4" fill="var(--danger)" opacity="0.7"/><circle cx="68" cy="41" r="4" fill="var(--callout-warning)" opacity="0.7"/><circle cx="82" cy="41" r="4" fill="var(--callout-success)" opacity="0.7"/><text x="280" y="45" text-anchor="middle" fill="var(--text-faint)" font-size="10">${L(lang, "900 px · Windows · 150%", "900 بكسل · ويندوز · 150%")}</text></g>
  <g><rect x="40" y="52" width="130" height="138" fill="var(--bg-raised)"/><g fill="var(--text-muted)" font-size="11"><text x="52" y="76">${L(lang, "Journal", "اليوميات")}</text><text x="52" y="96" fill="var(--text)">${L(lang, "The Muqaddima", "المقدمة")}</text><text x="52" y="116">${L(lang, "Reading list", "قائمة القراءة")}</text><text x="52" y="136">${L(lang, "Sigils", "السِّجِلّ")}</text></g></g>
  <rect class="wa-grow" x="170" y="52" width="60" height="138" fill="var(--bg-raised)" opacity="0.6"/>
  <g class="wa-late"><rect x="228" y="52" width="3" height="138" fill="var(--accent)"/><path d="M222 121l-6-6 6-6M240 121l6-6-6-6" fill="none" stroke="var(--accent)" stroke-width="2"/></g>
  <g fill="var(--text-muted)" font-size="11"><text x="250" y="80" fill="var(--text)" font-family="Georgia, serif" font-size="14">${L(lang, "The Muqaddima", "المقدمة")}</text><text x="250" y="102">${L(lang, "Ibn Khaldun opens with the errors", "يفتتح ابن خلدون بأخطاء")}</text><text x="250" y="120">${L(lang, "of historians and their causes…", "المؤرخين وأسبابها…")}</text></g>
  <text class="wa-late" x="280" y="176" text-anchor="middle" fill="var(--accent)" font-size="11">${L(lang, "docked, with a grip — no drawer", "راسية، بمقبض؛ لا درج")}</text>
</svg>`,
        },
        docs: "workspace",
      },
      {
        title: { en: "A manual for people, in both languages", ar: "دليل للناس، باللغتين" },
        body: {
          en: "Every page of the manual was rewritten for a reader who does not know the terminology: plain words, short sentences, what a thing is for before how it works. The Arabic edition was written as Arabic, not translated, and read back by a second pair of eyes. The interface's Arabic strings got the same pass.",
          ar: "أُعيدت كتابة كل صفحة من الدليل لقارئ لا يعرف المصطلحات: كلمات بسيطة، وجمل قصيرة، وما ينفع الشيء قبل كيف يعمل. وكُتبت النسخة العربية عربيةً لا مترجمة، وراجعتها عين ثانية. ونصوص الواجهة العربية نالت المرور نفسه.",
        },
        visual: { kind: "demo", mount: manualDemo },
        docs: "sigils",
      },
    ],
  },
  {
    version: "3.14.0",
    title: { en: "Counting from the caret", ar: "العدّ من المؤشر" },
    slides: [
      {
        title: { en: "Relative line numbers, for vim", ar: "أرقام أسطر نسبية، لـ Vim" },
        body: {
          en: "With vim keys on, the margin counts lines outward from the caret — 7j and 3k read straight off it — and the caret's line shows its own number. The column sits against the text and follows every move. Its switch lives under Vim keys in Settings → This device.",
          ar: "مع مفاتيح Vim، يعدّ الهامش الأسطر بعيدًا عن المؤشر (تُقرأ 7j و3k منه مباشرة) ويعرض سطر المؤشر رقمه. يجلس العمود بجانب النص ويتبع كل حركة. مفتاحه تحت مفاتيح Vim في الإعدادات ← هذا الجهاز.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => {
            const lines = lang === "ar"
              ? ["في البدء كانت الكلمة", "ثم جاء الهامش", "يعدّ من حيث أنت", "سبعة أسطر إلى أسفل", "ثلاثة إلى أعلى", "والباقي حساب", "لا تخمين فيه", "هذا السطر الآن", "وما بعده يعدّ", "من جديد"]
              : ["In the beginning was the word,", "then the margin,", "counting from where you are:", "seven lines down,", "three up,", "and the rest is arithmetic", "with no guessing in it.", "This line, now.", "And after it the count", "starts again."];
            const caret = 7;
            const rows = lines.map((text, i) => {
              const y = 40 + i * 17;
              const n = i === caret ? String(i + 1) : String(Math.abs(i - caret));
              const cls = i === caret ? "wa-pulse" : "";
              const numFill = i === caret ? "var(--accent)" : "var(--text-faint)";
              const textFill = i === caret ? "var(--text)" : "var(--text-muted)";
              return `<g><text class="${cls}" x="70" y="${y}" text-anchor="end" font-family="ui-monospace, monospace" font-size="11" fill="${numFill}"${i === caret ? ' font-weight="600"' : ""}>${n}</text><text x="92" y="${y}" font-family="Georgia, serif" font-size="12.5" fill="${textFill}">${text}</text></g>`;
            }).join("");
            const cy = 40 + caret * 17;
            return `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <rect x="86" y="${cy - 13}" width="6" height="16" fill="var(--accent)" opacity="0.7"/>
  ${rows}
  <g><rect x="400" y="30" width="128" height="22" rx="11" fill="var(--bg)" stroke="var(--border)"/><text x="464" y="45" text-anchor="middle" fill="var(--text-muted)" font-size="11">VIM · NORMAL</text></g>
  <g class="wa-late"><text x="464" y="${cy - 22}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="18" fill="var(--accent)">3k</text><text x="464" y="${cy + 30}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="18" fill="var(--accent)">2j</text></g>
</svg>`;
          },
        },
        docs: "editor",
      },
      {
        title: { en: "A sigil takes the room it has", ar: "السِّجِلّ يأخذ ما لديه من مكان" },
        body: {
          en: "On the Sigils page one sigil spans the whole row, its week strip beside its heatmap; two share a row; more wrap in pairs. And this deck now plays: every drawing moves, and the dots below are grouped by release.",
          ar: "في صفحة السِّجِلّ يمتد السِّجِلّ الواحد على الصف كله، وشريط أسبوعه بجانب خريطته الحرارية؛ والاثنان يتقاسمان صفًّا؛ والأكثر يلتفّ أزواجًا. وهذه الجولة تتحرك الآن: كل رسم يتحرك، والنقاط أدناه مجمّعة حسب الإصدار.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="36" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "SIGILS · 1", "السِّجِلّ · 1")}</text>
  <g><rect x="30" y="46" width="500" height="70" rx="8" fill="var(--bg)" stroke="var(--border)"/><text x="44" y="66" fill="var(--text)" font-family="Georgia, serif" font-size="13">${L(lang, "Weekly exercise", "تمارين الأسبوع")}</text>
    <g fill="var(--bg-hover)"><rect x="44" y="78" width="26" height="26" rx="4"/><rect x="76" y="78" width="26" height="26" rx="4"/><rect x="108" y="78" width="26" height="26" rx="4"/><rect x="140" y="78" width="26" height="26" rx="4"/><rect x="172" y="78" width="26" height="26" rx="4"/><rect x="204" y="78" width="26" height="26" rx="4"/><rect x="236" y="78" width="26" height="26" rx="4"/></g>
    <rect x="44" y="78" width="26" height="26" rx="4" fill="color-mix(in srgb, var(--accent) 30%, var(--bg))" stroke="var(--accent)"/>
    <g fill="var(--bg-hover)">${Array.from({ length: 12 }, (_, c) => Array.from({ length: 7 }, (__, r) => `<rect x="${340 + c * 14}" y="${58 + r * 7}" width="5" height="5" rx="1"${(c * 7 + r) % 5 === 0 ? ' fill="var(--callout-success)"' : ""}/>`).join("")).join("")}</g>
  </g>
  <text class="wa-late" x="30" y="140" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "SIGILS · 2", "السِّجِلّ · 2")}</text>
  <g class="wa-late"><rect x="30" y="150" width="244" height="48" rx="8" fill="var(--bg)" stroke="var(--border)"/><text x="44" y="170" fill="var(--text)" font-family="Georgia, serif" font-size="13">${L(lang, "Weekly exercise", "تمارين الأسبوع")}</text><g fill="var(--bg-hover)"><rect x="44" y="180" width="12" height="12" rx="3"/><rect x="60" y="180" width="12" height="12" rx="3"/><rect x="76" y="180" width="12" height="12" rx="3"/><rect x="92" y="180" width="12" height="12" rx="3"/><rect x="108" y="180" width="12" height="12" rx="3"/><rect x="124" y="180" width="12" height="12" rx="3"/><rect x="140" y="180" width="12" height="12" rx="3"/></g></g>
  <g class="wa-late"><rect x="286" y="150" width="244" height="48" rx="8" fill="var(--bg)" stroke="var(--border)"/><text x="300" y="170" fill="var(--text)" font-family="Georgia, serif" font-size="13">${L(lang, "Prayers", "الصلوات")}</text><g fill="var(--bg-hover)"><rect x="300" y="180" width="12" height="12" rx="3"/><rect x="316" y="180" width="12" height="12" rx="3"/><rect x="332" y="180" width="12" height="12" rx="3"/><rect x="348" y="180" width="12" height="12" rx="3"/><rect x="364" y="180" width="12" height="12" rx="3"/><rect x="380" y="180" width="12" height="12" rx="3"/><rect x="396" y="180" width="12" height="12" rx="3"/></g></g>
</svg>`,
        },
        docs: "sigils",
      },
    ],
  },
  {
    version: "3.13.0",
    title: { en: "Cards, callouts, and reading anywhere", ar: "بطاقات ونداءات وقراءة في أي مكان" },
    slides: [
      {
        title: { en: "Bookmarks that travel with the vault", ar: "مفضلة تسافر مع الخزانة" },
        body: {
          en: "Ctrl/Cmd Shift B bookmarks the open note. The list is a note of its own, Bookmarks.md, drawn as a starred section above the tree — readable in Obsidian, on the phone, everywhere the vault goes. Drag a row to reorder.",
          ar: "Ctrl/Cmd Shift B يضيف الملاحظة المفتوحة إلى المفضلة. والقائمة ملاحظة بنفسها، Bookmarks.md، تُرسم قسمًا بنجمة فوق الشجرة: تُقرأ في Obsidian وعلى الهاتف وحيثما تذهب الخزانة. اسحب صفًّا لإعادة الترتيب.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="42" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "BOOKMARKS · 3", "المفضلة · 3")}</text>
  <g fill="var(--text)"><text x="30" y="70"><tspan fill="var(--accent)" class="wa-pulse">★</tspan>  ${L(lang, "The Muqaddima", "المقدمة")}</text><text x="30" y="96"><tspan fill="var(--accent)">★</tspan>  ${L(lang, "Reading list", "قائمة القراءة")}</text><text x="30" y="122"><tspan fill="var(--accent)">★</tspan>  ${L(lang, "Weekly exercise", "تمارين الأسبوع")}</text></g>
  <line x1="30" y1="140" x2="530" y2="140" stroke="var(--border)"/>
  <g fill="var(--text-muted)" font-size="12"><text x="30" y="164">▸ 1 - Source Material</text><text x="30" y="186">▸ Journal</text></g>
  <g font-family="ui-monospace, monospace" font-size="11" fill="var(--text-faint)"><text x="330" y="70">Bookmarks.md</text><text x="330" y="90">- [[The Muqaddima]]</text><text x="330" y="108">- [[Reading list]]</text><text x="330" y="126">- [[Weekly exercise]]</text></g>
</svg>`,
        },
        docs: "workspace",
      },
      {
        title: { en: "Named layouts, and a tag tree", ar: "تخطيطات مسمّاة، وشجرة وسوم" },
        body: {
          en: "Save layout as… keeps your panes and splits under a name; Restore a layout… brings one back, shared with the desktop app. The tag shelf is a tree now: book/fiction and book/history fold under book with one count, sorted by count or by name.",
          ar: "احفظ التخطيط باسم… يحفظ لوحاتك وتقسيماتك تحت اسم؛ واسترجع تخطيطًا… يعيد واحدًا، مشتركًا مع تطبيق سطح المكتب. ورفّ الوسوم شجرة الآن: يُطوى book/fiction وbook/history تحت book بعدد واحد، مرتّبًا بالعدد أو بالاسم.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="250" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="42" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "LAYOUTS", "التخطيطات")}</text>
  <g fill="var(--text)"><text x="30" y="72">${L(lang, "Research", "بحث")}</text><text x="30" y="100">${L(lang, "Writing", "كتابة")}</text><text x="30" y="128">${L(lang, "Reading room", "غرفة القراءة")}</text></g>
  <g fill="var(--accent)" font-size="11"><text class="wa-late" x="190" y="72">${L(lang, "RESTORE", "استرجع")}</text><text x="190" y="100">${L(lang, "RESTORE", "استرجع")}</text><text x="190" y="128">${L(lang, "RESTORE", "استرجع")}</text></g>
  <rect x="298" y="12" width="250" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="316" y="42" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "TAGS", "الوسوم")}</text>
  <g fill="var(--text)"><text x="316" y="72"><tspan fill="var(--text-faint)">▾</tspan> #book <tspan fill="var(--text-faint)">42</tspan></text><text x="340" y="96"><tspan fill="var(--text-muted)">#fiction</tspan> <tspan fill="var(--text-faint)">18</tspan></text><text x="340" y="120"><tspan fill="var(--text-muted)">#history</tspan> <tspan fill="var(--text-faint)">24</tspan></text><text x="316" y="148"><tspan fill="var(--text-faint)">▸</tspan> #zettel <tspan fill="var(--text-faint)">131</tspan></text><text x="316" y="176">#recipes <tspan fill="var(--text-faint)">7</tspan></text></g>
</svg>`,
        },
        docs: "workspace",
      },
      {
        title: { en: "A pace, and today's pages", ar: "وتيرة، وصفحات اليوم" },
        body: {
          en: "A tracker takes pace: 20 (or due: a date) and its card says the day you will be done — or the pace that gets you there. A routine that names the book gains \"Read 20 pages of it\" as its first task, and ticking it moves the tracker.", // lineage
          ar: "يأخذ المتتبِّع pace: 20 (أو due: تاريخًا) فتقول بطاقته اليوم الذي تنتهي فيه، أو الوتيرة التي تبلغك إياه. والروتين الذي يسمّي الكتاب يكتسب «اقرأ 20 صفحة منه» مهمةً أولى، والتعليم عليها يحرّك المتتبِّع.", // lineage
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="46" fill="var(--text)" font-family="Georgia, serif" font-size="16">${L(lang, "The Muqaddima", "المقدمة")}</text>
  <rect x="30" y="60" width="320" height="8" rx="4" fill="var(--bg-hover)"/><rect class="wa-grow" x="30" y="60" width="128" height="8" rx="4" fill="var(--accent)"/>
  <text x="30" y="88" fill="var(--text-muted)" font-size="12">100 / 300 ${L(lang, "pages", "صفحة")} · <tspan fill="var(--accent)">20 ${L(lang, "pages a day — done by 24 September", "في اليوم · ينتهي 24 سبتمبر")}</tspan></text>
  <rect x="30" y="112" width="500" height="80" rx="10" fill="var(--bg)" stroke="var(--border)"/>
  <text x="46" y="136" fill="var(--accent)" font-size="11" letter-spacing="1">${L(lang, "TODAY", "اليوم")}</text>
  <rect x="46" y="150" width="16" height="16" rx="3" fill="none" stroke="var(--accent)" stroke-width="1.5"/><path class="wa-draw" d="M50 158l4 4 7-8" fill="none" stroke="var(--accent)" stroke-width="2"/>
  <text x="70" y="163" fill="var(--text)">${L(lang, "Read", "اقرأ")} <tspan fill="var(--text-muted)">20 ${L(lang, "pages of The Muqaddima", "صفحة من المقدمة")}</tspan></text>
  <text class="wa-late" x="46" y="184" fill="var(--text-faint)" font-size="11">${L(lang, "→ the tracker moves to 120 / 300", "→ ينتقل المتتبِّع إلى 120 / 300")}</text>
</svg>`,
        },
        docs: "routines",
      },
      {
        title: { en: "Flashcards from what you already marked", ar: "بطاقات مما علّمته أصلًا" }, // lineage
        body: {
          en: "Every ==highlight==, every quote callout — the PDF reader's citations included — and every Question / ? / Answer block is a card. The Review page asks them back on the SM-2 schedule Obsidian's Spaced Repetition plugin uses, and writes the due day into the note as that plugin's own comment. Nothing is stored anywhere else.",
          ar: "كل ==تظليل==، وكل نداء اقتباس (ومنها اقتباسات قارئ PDF)، وكل كتلة سؤال / ? / جواب هي بطاقة. تسألك صفحة المراجعة عنها على جدول SM-2 الذي تستخدمه إضافة Spaced Repetition في Obsidian، وتكتب يوم الاستحقاق في الملاحظة بتعليق الإضافة نفسه. لا يُخزَّن شيء في مكان آخر.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <rect x="30" y="30" width="72" height="18" rx="9" fill="none" stroke="var(--accent)" opacity="0.6"/><text x="66" y="43" text-anchor="middle" fill="var(--accent)" font-size="10" letter-spacing="1">${L(lang, "CLOZE", "فراغ")}</text>
  <text x="112" y="43" fill="var(--text-muted)" font-size="12">${L(lang, "Cell biology", "بيولوجيا الخلية")}</text>
  <text x="30" y="78" fill="var(--text)" font-family="Georgia, serif" font-size="16">${L(lang, "The", "")} <tspan font-weight="bold">[…]</tspan> ${L(lang, "is the powerhouse of the cell.", "هي مصنع طاقة الخلية.")}</text>
  <line class="wa-late" x1="30" y1="96" x2="530" y2="96" stroke="var(--border)" stroke-dasharray="3 3"/>
  <text class="wa-late" x="30" y="122" fill="var(--text)" font-family="Georgia, serif" font-size="16">${L(lang, "mitochondria", "الميتوكوندريا")}</text>
  <g font-size="12">
    <rect class="wa-late" x="30" y="142" width="118" height="46" rx="6" fill="var(--bg)" stroke="var(--border)"/><rect class="wa-late" x="30" y="142" width="3" height="46" fill="var(--danger)"/><text class="wa-late" x="89" y="161" text-anchor="middle" fill="var(--text)">${L(lang, "Again", "مرة أخرى")}</text><text class="wa-late" x="89" y="178" text-anchor="middle" fill="var(--text-faint)" font-size="11">1d</text>
    <rect class="wa-late" x="158" y="142" width="118" height="46" rx="6" fill="var(--bg)" stroke="var(--border)"/><rect class="wa-late" x="158" y="142" width="3" height="46" fill="var(--callout-warning)"/><text class="wa-late" x="217" y="161" text-anchor="middle" fill="var(--text)">${L(lang, "Hard", "صعب")}</text><text class="wa-late" x="217" y="178" text-anchor="middle" fill="var(--text-faint)" font-size="11">3d</text>
    <rect class="wa-press" x="286" y="142" width="118" height="46" rx="6" fill="var(--bg)" stroke="var(--border)"/><rect class="wa-late" x="286" y="142" width="3" height="46" fill="var(--accent)"/><text class="wa-late" x="345" y="161" text-anchor="middle" fill="var(--text)">${L(lang, "Good", "جيد")}</text><text class="wa-late" x="345" y="178" text-anchor="middle" fill="var(--text-faint)" font-size="11">6d</text>
    <rect class="wa-late" x="414" y="142" width="118" height="46" rx="6" fill="var(--bg)" stroke="var(--border)"/><rect class="wa-late" x="414" y="142" width="3" height="46" fill="var(--callout-success)"/><text class="wa-late" x="473" y="161" text-anchor="middle" fill="var(--text)">${L(lang, "Easy", "سهل")}</text><text class="wa-late" x="473" y="178" text-anchor="middle" fill="var(--text-faint)" font-size="11">8d</text>
  </g>
</svg>`,
        },
        docs: "flashcards",
      },
      {
        title: { en: "Reading without a network", ar: "القراءة بلا شبكة" },
        body: {
          en: "The notes you opened stay on the device: a train, a flight, the server rebooting, and the same address opens the same note. Only for your own session — signing out clears the copy — and edits made offline are saved when the network is back. Settings → This device → Offline reading.",
          ar: "الملاحظات التي فتحتها تبقى على الجهاز: في قطار أو طائرة أو أثناء إعادة تشغيل الخادم، يفتح العنوان نفسه الملاحظة نفسها. لجلستك وحدها؛ تسجيل الخروج يمسح النسخة، والتعديلات دون اتصال تُحفظ عند عودة الشبكة. الإعدادات ← هذا الجهاز ← القراءة دون اتصال.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <g class="wa-drop"><rect x="12" y="12" width="536" height="34" rx="12" fill="var(--bg-hover)"/><rect x="12" y="34" width="536" height="12" fill="var(--bg-hover)"/>
  <g transform="translate(30 22)" fill="none" stroke="var(--text-muted)" stroke-width="1.6" stroke-linecap="round"><path d="M1 6a5 5 0 0 1 9 0"/><path d="M3.2 8.4a2.6 2.6 0 0 1 4.6 0"/><circle cx="5.5" cy="11" r=".8"/><path class="wa-draw" d="M0 0l11 11"/></g>
  <text x="50" y="34" fill="var(--text)" font-weight="600" font-size="12">${L(lang, "Offline", "دون اتصال")}</text>
  <text x="104" y="34" fill="var(--text-muted)" font-size="12">${L(lang, "Reading this device's copy. Edits are kept and saved when the network is back.", "تقرأ نسخة هذا الجهاز؛ تعديلاتك محفوظة.")}</text></g>
  <rect x="30" y="62" width="130" height="130" rx="8" fill="var(--bg)" stroke="var(--border)"/>
  <g fill="var(--text-muted)" font-size="12"><text x="42" y="86">${L(lang, "Journal", "اليوميات")}</text><text x="42" y="108" fill="var(--text)">${L(lang, "The Muqaddima", "المقدمة")}</text><text x="42" y="130">${L(lang, "Reading list", "قائمة القراءة")}</text><text x="42" y="152">${L(lang, "Routines", "الروتين")}</text></g> // lineage
  <text x="180" y="90" fill="var(--text)" font-family="Georgia, serif" font-size="18">${L(lang, "The Muqaddima", "المقدمة")}</text>
  <g fill="var(--text-muted)" font-size="12"><text x="180" y="116">${L(lang, "Ibn Khaldun opens with the errors of", "يفتتح ابن خلدون بأخطاء المؤرخين")}</text><text x="180" y="134">${L(lang, "historians, and the causes of them —", "وأسبابها، ثم يمضي إلى علم العمران")}</text><text x="180" y="152">${L(lang, "and then to the science of civilisation.", "الذي يؤسسه.")}</text></g>
  <text x="180" y="184" fill="var(--text-faint)" font-size="11">${L(lang, "✓ read this morning · kept on this device", "✓ محفوظة على هذا الجهاز")}</text>
</svg>`,
        },
        docs: "offline",
      },
      {
        title: { en: "An ayah, a hadith, drawn in", ar: "آية وحديث يُرسمان" },
        body: {
          en: "> [!ayah] 2:255 draws the verse itself, in the Uthmani script, with the surah and number under it — the whole Quran ships with the app. > [!hadith] Bukhari 1 draws from your own corpus folder. The autocomplete offers surahs by name while you type the reference.",
          ar: "> [!ayah] 2:255 يرسم الآية نفسها بالرسم العثماني، وتحتها السورة والرقم؛ المصحف كله يأتي مع التطبيق. و> [!hadith] Bukhari 1 يرسم من مجلد مجموعتك أنت. والإكمال التلقائي يعرض السور بأسمائها وأنت تكتب المرجع.",
        },
        visual: { kind: "demo", mount: ayahDemo },
        docs: "arabic-and-rtl",
      },
      {
        title: { en: "Harakat, on and off", ar: "الحركات، وضعًا ونزعًا" },
        body: {
          en: "Ctrl/Cmd Alt ; opens a palette of the marks at the caret — fatha, damma, kasra, shadda, sukun, tanwin, the superscript alef — and the selection menu's Arabic page strips them from the selected words, or copies the words without them and leaves the note as it is.",
          ar: "Ctrl/Cmd Alt ; يفتح لوحة الحركات عند المؤشر: الفتحة والضمة والكسرة والشدة والسكون والتنوين والألف الخنجرية؛ وصفحة العربية في قائمة التحديد تنزعها من الكلمات المحددة، أو تنسخ الكلمات بلا حركات وتترك الملاحظة كما هي.",
        },
        visual: { kind: "demo", mount: harakatDemo },
        docs: "arabic-and-rtl",
      },
      {
        title: { en: "What nothing points at", ar: "ما لا يشير إليه شيء" },
        body: {
          en: "Unused attachments, in the palette, lists every file in the vault that no note embeds or links — the screenshot you pasted twice, the cover of a book you deleted — with its size, and sweeps what you tick into the trash, where it can come back.",
          ar: "المرفقات غير المستخدمة، في اللوحة، تعدّد كل ملف في الخزانة لا تضمّنه ولا تربطه أي ملاحظة، كلقطة الشاشة التي لصقتها مرتين أو غلاف كتاب حذفته، مع حجمه، وتكنس ما تعلّم عليه إلى سلة المهملات حيث يمكنه العودة.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="42" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "UNUSED ATTACHMENTS · 4 · 6.1 MB", "مرفقات غير مستخدمة · 4 · 6.1 م.ب")}</text>
  <g font-family="ui-monospace, monospace" font-size="12" fill="var(--text)">
    <rect x="30" y="58" width="14" height="14" rx="3" fill="none" stroke="var(--accent)" stroke-width="1.5"/><path class="wa-draw" d="M33 65l3 3 6-7" fill="none" stroke="var(--accent)" stroke-width="2"/><text x="54" y="70">Attachments/Pasted image 20250812.png</text><text x="470" y="70" fill="var(--text-faint)">2.4 MB</text>
    <rect x="30" y="84" width="14" height="14" rx="3" fill="none" stroke="var(--accent)" stroke-width="1.5"/><path class="wa-draw" d="M33 91l3 3 6-7" fill="none" stroke="var(--accent)" stroke-width="2"/><text x="54" y="96">Attachments/Pasted image 20250812 (1).png</text><text x="470" y="96" fill="var(--text-faint)">2.4 MB</text>
    <rect x="30" y="110" width="14" height="14" rx="3" fill="none" stroke="var(--border)" stroke-width="1.5"/><text x="54" y="122">Media/covers/old-cover.jpg</text><text x="470" y="122" fill="var(--text-faint)">910 kB</text>
    <rect x="30" y="136" width="14" height="14" rx="3" fill="none" stroke="var(--border)" stroke-width="1.5"/><text x="54" y="148">Attachments/scan-draft.pdf</text><text x="470" y="148" fill="var(--text-faint)">420 kB</text>
  </g>
  <rect class="wa-late" x="380" y="168" width="150" height="26" rx="13" fill="var(--accent)"/><text class="wa-late" x="455" y="185" text-anchor="middle" fill="var(--button-accent-text)" font-size="12">${L(lang, "Move 2 to the trash", "انقل 2 إلى السلة")}</text>
</svg>`,
        },
        docs: "templates-and-notes",
      },
    ],
  },
  {
    version: "3.12.0",
    title: { en: "The vault, woven", ar: "الخزانة منسوجة" },
    slides: [
      {
        title: { en: "Live queries in a note", ar: "استعلامات حيّة في ملاحظة" },
        body: {
          en: "A query fence lists the notes that answer a search — tag:reading prop:status=reading — as a list, a table or cards, sorted and capped as you say, live wherever the note is read. This one is your own vault, right now.",
          ar: "سياج query يعدّد الملاحظات التي تجيب عن بحث — tag:reading prop:status=reading — قائمةً أو جدولًا أو بطاقات، مرتبةً ومحدودةً كما تقول، حيّةً حيثما تُقرأ الملاحظة. وهذا هو خزانتك الآن.",
        },
        visual: { kind: "demo", mount: queryDemo },
        docs: "editor",
      },
      {
        title: { en: "Tasks across the vault", ar: "المهام عبر الخزانة" },
        body: {
          en: "Every - [ ] line is a task, with the Tasks plugin's fields read off its end: 📅 due, ⏫ priority, 🔁 recurrence. A tasks fence gathers them — not done, due this week — and a tick flips the one line where the task lives, stamped ✅ today.",
          ar: "كل سطر - [ ] مهمة، تُقرأ من آخره حقول إضافة Tasks: 📅 الاستحقاق، ⏫ الأولوية، 🔁 التكرار. سياج tasks يجمعها — not done، due this week — والتعليم يقلب السطر الواحد الذي تسكنه المهمة مختومًا بـ✅ اليوم.",
        },
        visual: { kind: "demo", mount: tasksDemo },
        docs: "editor",
      },
      {
        title: { en: "Block references", ar: "مراجع الفقرات" },
        body: {
          en: "End a paragraph with ^id and it has an address: [[Note#^id]] links to it, ![[Note#^id]] transcludes just that block, the hover card shows it. Copy link to this block in the palette mints the id for you.",
          ar: "اختم فقرة بـ^id فيصير لها عنوان: [[Note#^id]] يربط إليها، و![[Note#^id]] يضمّن تلك الفقرة وحدها، وبطاقة التمرير تعرضها. ونسخ رابط هذه الفقرة في اللوحة يسكّ المعرّف لك.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 250" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="250" height="226" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="40" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "LEDGER", "الدفتر")}</text>
  <text x="30" y="72" fill="var(--text)">${L(lang, "The rule of three:", "قاعدة الثلاثة:")}</text>
  <text x="30" y="92" fill="var(--text)">${L(lang, "never keep fewer than", "لا تحتفظ بأقل من")}</text>
  <text x="30" y="112" fill="var(--text)">${L(lang, "three copies.", "ثلاث نسخ.")} <tspan fill="var(--text-faint)" font-family="ui-monospace, monospace" font-size="11">^rule3</tspan></text>
  <rect x="298" y="12" width="250" height="226" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="316" y="40" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "JOURNAL", "اليوميات")}</text>
  <text x="316" y="72" fill="var(--text)">${L(lang, "See", "انظر")} <tspan fill="var(--accent)">[[Ledger#^rule3]]</tspan></text>
  <rect x="316" y="92" width="214" height="86" rx="8" fill="var(--bg)" stroke="var(--accent)" stroke-opacity="0.5"/>
  <text x="330" y="114" fill="var(--accent)" font-size="11">Ledger › ^rule3</text>
  <text x="330" y="136" fill="var(--text)" font-size="12">${L(lang, "The rule of three: never", "قاعدة الثلاثة: لا تحتفظ")}</text>
  <text x="330" y="154" fill="var(--text)" font-size="12">${L(lang, "keep fewer than three copies.", "بأقل من ثلاث نسخ.")}</text>
  <path d="M262 100 C 285 100, 285 100, 298 100" stroke="var(--accent)" stroke-width="1.5" fill="none" stroke-dasharray="3 3"/>
</svg>`,
        },
        docs: "editor",
      },
      {
        title: { en: "Unlinked mentions", ar: "إشارات غير مرتبطة" },
        body: {
          en: "Under the backlinks, the notes that name the open note without linking it — whole words, folded like search — each with a Link button that wraps the words as [[Note]] in one edit. Link all does the lot. This is how atomic notes get woven.",
          ar: "تحت الروابط الخلفية، الملاحظات التي تسمّي الملاحظة المفتوحة من غير رابط — كلمات كاملة، مطويّة كما في البحث — لكلٍّ زر اربط يلفّ الكلمات [[Note]] بتعديل واحد. واربط الكل يفعلها كلها. هكذا تُنسج الملاحظات الذرية.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="42" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "UNLINKED MENTIONS · 3", "إشارات غير مرتبطة · 3")}</text>
  <g transform="translate(30 60)">
    <text y="16" fill="var(--text)" font-weight="500">${L(lang, "Journal", "اليوميات")}</text>
    <text y="38" fill="var(--text-muted)" font-size="12">${L(lang, "Today I read the", "اليوم قرأت")} <tspan fill="var(--text)" text-decoration="underline">${L(lang, "Ledger", "الدفتر")}</tspan> ${L(lang, "and thought about it.", "وفكّرت فيه.")}</text>
    <rect x="440" y="22" width="64" height="24" rx="6" fill="var(--bg)" stroke="var(--accent)"/><text x="472" y="38" text-anchor="middle" fill="var(--accent)" font-size="11">${L(lang, "LINK", "اربط")}</text>
  </g>
  <g transform="translate(30 116)">
    <text y="16" fill="var(--text)" font-weight="500">${L(lang, "Monday", "الاثنين")}</text>
    <text y="38" fill="var(--text-muted)" font-size="12">${L(lang, "…wrote in", "…كتبت في")} <tspan fill="var(--text)" text-decoration="underline">${L(lang, "the book of accounts", "دفتر الحسابات")}</tspan> ${L(lang, "after lunch.", "بعد الغداء.")}</text>
    <rect x="440" y="22" width="64" height="24" rx="6" fill="var(--bg)" stroke="var(--border)"/><text x="472" y="38" text-anchor="middle" fill="var(--text-muted)" font-size="11">${L(lang, "LINK", "اربط")}</text>
  </g>
  <g transform="translate(30 172)">
    <text y="16" fill="var(--text-faint)" font-size="12">${L(lang, "→ becomes", "→ يصير")} <tspan fill="var(--accent)">[[Ledger|the book of accounts]]</tspan></text>
  </g>
</svg>`,
        },
        docs: "editor",
      },
      {
        title: { en: "Daily and weekly notes, your way", ar: "الملاحظات اليومية والأسبوعية على طريقتك" },
        body: {
          en: "The daily note's folder, name and template are settings now — YYYY/YYYY-MM-DD files each year in its own folder — and a weekly note joins it. Yesterday's note and Tomorrow's note walk from the day you are on, and On this day reads the archive back: what you wrote or finished on this date in earlier years.",
          ar: "مجلد الملاحظة اليومية واسمها وقالبها إعدادات الآن — YYYY/YYYY-MM-DD يودع كل سنة في مجلدها — وتنضم إليها ملاحظة أسبوعية. ملاحظة الأمس وملاحظة الغد تمشيان من اليوم الذي أنت فيه، وفي مثل هذا اليوم يقرأ عليك أرشيفك: ما كتبته أو أنهيته في هذا التاريخ من سنوات مضت.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 230" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="206" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <g font-family="ui-monospace, monospace" font-size="12">
    <text x="30" y="44" fill="var(--text-muted)">Journal/</text>
    <text x="50" y="66" fill="var(--text-muted)">2025/</text>
    <text x="70" y="88" fill="var(--text-faint)">2025-09-13.md</text>
    <text x="50" y="110" fill="var(--text-muted)">2026/</text>
    <text x="70" y="132" fill="var(--text-faint)">2026-09-12.md</text>
    <text x="70" y="154" fill="var(--text)">2026-09-13.md  <tspan fill="var(--accent)">${L(lang, "← today", "← اليوم")}</tspan></text>
    <text x="70" y="176" fill="var(--text-faint)">2026-W37.md</text>
  </g>
  <g transform="translate(300 40)">
    <text y="0" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "ON THIS DAY", "في مثل هذا اليوم")}</text>
    <text y="30" fill="var(--accent)" font-size="11">${L(lang, "1Y AGO", "قبل سنة")}</text><text x="60" y="30" fill="var(--text)">${L(lang, "you wrote “On Marginalia”", "كتبت «في الهوامش»")}</text>
    <text y="56" fill="var(--accent)" font-size="11">${L(lang, "2Y AGO", "قبل سنتين")}</text><text x="60" y="56" fill="var(--text)">${L(lang, "you finished “Elden Ring”", "أنهيت «إلدن رينغ»")}</text>
    <text y="96" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "PALETTE", "اللوحة")}</text>
    <text y="122" fill="var(--text)">${L(lang, "Yesterday's note · Tomorrow's note", "ملاحظة الأمس · ملاحظة الغد")}</text>
    <text y="146" fill="var(--text)">${L(lang, "This week's note · Random note", "ملاحظة هذا الأسبوع · ملاحظة عشوائية")}</text>
  </g>
</svg>`,
        },
        docs: "templates-and-notes",
      },
      {
        title: { en: "Every save keeps what it replaced", ar: "كل حفظ يحتفظ بما استبدله" },
        body: {
          en: "Forty versions per note, with or without git, in one History timeline beside your commits — each a tap from being read or restored. A bad paste over a good paragraph is no longer final.",
          ar: "أربعون نسخة لكل ملاحظة، مع git أو بدونه، في خط زمني واحد في السجل إلى جانب إيداعاتك، وكل نسخة على بعد نقرة من القراءة أو الاسترجاع. اللصق السيئ فوق فقرة جيدة لم يعد نهائيًا.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="42" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "HISTORY", "السجل")}</text>
  <line x1="44" y1="60" x2="44" y2="190" stroke="var(--border)" stroke-width="2"/>
  <g transform="translate(44 72)"><circle r="5" fill="var(--accent)"/><text x="18" y="4" fill="var(--text)">${L(lang, "Before a restore", "قبل استرجاع")}</text><text x="18" y="22" fill="var(--text-faint)" font-size="11">${L(lang, "2 minutes ago · 1.2 kB", "قبل دقيقتين · 1.2 ك.ب")}</text></g>
  <g transform="translate(44 118)"><circle r="5" fill="var(--bg)" stroke="var(--accent)" stroke-width="2"/><text x="18" y="4" fill="var(--text)">${L(lang, "Autosave", "حفظ تلقائي")}</text><text x="18" y="22" fill="var(--text-faint)" font-size="11">${L(lang, "yesterday · 1.1 kB ·", "أمس · 1.1 ك.ب ·")} <tspan fill="var(--accent)">${L(lang, "Restore", "استرجع")}</tspan></text></g>
  <g transform="translate(44 164)"><circle r="5" fill="var(--bg)" stroke="var(--border)" stroke-width="2"/><text x="18" y="4" fill="var(--text)">${L(lang, "Commit 4afec81", "إيداع 4afec81")}</text><text x="18" y="22" fill="var(--text-faint)" font-size="11">${L(lang, "3 days ago · git", "قبل 3 أيام · git")}</text></g>
</svg>`,
        },
        docs: "backup-and-sync",
      },
      {
        title: { en: "Search inside every book", ar: "ابحث داخل كل كتاب" },
        body: {
          en: "The search box now reads every PDF on your shelf: a book page appears beside your notes with its page number, and a click opens the reader right there. in:books or in:notes picks a side; the shelf is read once, in the background.",
          ar: "صندوق البحث يقرأ الآن كل ملف PDF على رفّك: تظهر صفحة الكتاب بجانب ملاحظاتك مع رقمها، والنقر يفتح القارئ عليها مباشرة. in:books أو in:notes يختار جانبًا؛ ويُقرأ الرف مرة واحدة في الخلفية.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <rect x="30" y="30" width="500" height="32" rx="8" fill="var(--bg)" stroke="var(--border)"/>
  <text x="44" y="51" fill="var(--text)">zephyr</text>
  <g transform="translate(30 80)">
    <text y="14" fill="var(--text)" font-weight="500">${L(lang, "Marginalia", "الهوامش")}</text><text x="120" y="14" fill="var(--text-faint)" font-size="11">${L(lang, "note", "ملاحظة")}</text>
    <text y="34" fill="var(--text-muted)" font-size="12">${L(lang, "…a", "…نسيم")} <tspan fill="var(--accent)">zephyr</tspan> ${L(lang, "through the margins of the book…", "في هوامش الكتاب…")}</text>
  </g>
  <g transform="translate(30 134)">
    <rect x="-8" y="-14" width="516" height="52" rx="8" fill="color-mix(in srgb, var(--accent) 8%, transparent)"/>
    <text y="14" fill="var(--text)" font-weight="500">${L(lang, "A Treatise on Winds", "رسالة في الرياح")}</text><text x="190" y="14" fill="var(--accent)" font-size="11">${L(lang, "book page · p. 42", "صفحة كتاب · ص 42")}</text>
    <text y="34" fill="var(--text-muted)" font-size="12">${L(lang, "…the western", "…الغربي")} <tspan fill="var(--accent)">zephyr</tspan> ${L(lang, "arrives before the rains…", "يصل قبل الأمطار…")}</text>
  </g>
</svg>`,
        },
        docs: "books",
      },
      {
        title: { en: "Export, in any shape", ar: "تصدير بأي شكل" },
        body: {
          en: "Export… puts a note, a folder, a tag or the whole vault into a ZIP with the pictures they use, wikilinks kept or turned into standard links. One note can leave as a single HTML page that carries your theme and its images inside it. Nothing leaves the machine.",
          ar: "تصدير… يضع ملاحظة أو مجلدًا أو وسمًا أو الخزانة كلها في ملف ZIP مع الصور التي تستعملها، بروابط ويكية كما هي أو محوَّلة إلى روابط قياسية. ويمكن لملاحظة واحدة أن تخرج صفحةَ HTML واحدة تحمل سمتك وصورها في داخلها. لا شيء يغادر الجهاز.",
        },
        visual: {
          kind: "svg",
          svg: (lang) => `<svg viewBox="0 0 560 220" xmlns="http://www.w3.org/2000/svg" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">
  <rect x="12" y="12" width="536" height="196" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="30" y="42" fill="var(--text-muted)" font-size="11" letter-spacing="1">${L(lang, "EXPORT…", "تصدير…")}</text>
  <g transform="translate(30 60)">
    <rect width="96" height="28" rx="14" fill="var(--bg)" stroke="var(--border)"/><text x="48" y="18" text-anchor="middle" fill="var(--text-muted)" font-size="12">${L(lang, "This note", "هذه الملاحظة")}</text>
    <rect x="104" width="96" height="28" rx="14" fill="color-mix(in srgb, var(--accent) 16%, var(--bg))" stroke="var(--accent)"/><text x="152" y="18" text-anchor="middle" fill="var(--text)" font-size="12">${L(lang, "This folder", "هذا المجلد")}</text>
    <rect x="208" width="72" height="28" rx="14" fill="var(--bg)" stroke="var(--border)"/><text x="244" y="18" text-anchor="middle" fill="var(--text-muted)" font-size="12">${L(lang, "A tag", "وسم")}</text>
    <rect x="288" width="110" height="28" rx="14" fill="var(--bg)" stroke="var(--border)"/><text x="343" y="18" text-anchor="middle" fill="var(--text-muted)" font-size="12">${L(lang, "Whole vault", "الخزانة كلها")}</text>
  </g>
  <g font-family="ui-monospace, monospace" font-size="12" transform="translate(30 116)">
    <text y="0" fill="var(--text)">Essays 2026-09-14.zip</text>
    <text x="20" y="22" fill="var(--text-muted)">Essays/Deep note.md</text>
    <text x="20" y="42" fill="var(--text-muted)">Essays/On Marginalia.md</text>
    <text x="20" y="62" fill="var(--text-muted)">Media/cover.png</text>
  </g>
  <text x="330" y="140" fill="var(--text-faint)" font-size="12">[[Deep note]] →</text>
  <text x="330" y="160" fill="var(--accent)" font-size="12">[Deep note](Deep%20note.md)</text>
</svg>`,
        },
        docs: "export",
      },
    ],
  },
  {
    version: "3.11.0",
    title: { en: "Routines", ar: "الروتين" }, // lineage
    slides: [
      {
        title: { en: "A plan you follow by the day", ar: "خطة تتبعها يومًا بيوم" },
        body: {
          en: "An exercise week, the five prayers, sleep, water — a routine is a card about your days. Today's checklist, the numbers you keep, a streak that lights, the week as seven dots and twelve weeks as a heatmap. Tick a box on this one.", // lineage
          ar: "أسبوع تمارين، الصلوات الخمس، النوم، الماء: الروتين بطاقة عن أيامك. قائمة اليوم، والأرقام التي تحفظها، وسلسلة تضيء، والأسبوع سبع نقاط، واثنا عشر أسبوعًا خريطة حرارية. علّم على مربع في هذه.", // lineage
        },
        visual: { kind: "demo", mount: routineDemo },
        docs: "routines",
      },
      {
        title: { en: "The note is the state", ar: "الملاحظة هي الحالة" },
        body: {
          en: "Two fences in one note: the plan, and the log Astrolabe writes under it — one readable line per day. Tick and a line changes in your file; edit the line by hand and the card follows. Obsidian reads both as plain code blocks.",
          ar: "سياجان في ملاحظة واحدة: الخطة، والسجل الذي يكتبه أسطرلاب تحتها؛ سطر مقروء لكل يوم. علّم فيتغير سطر في ملفك؛ عدّل السطر بيدك فتتبعه البطاقة. وObsidian يقرأ كليهما كتلتي كود عاديتين.",
        },
        visual: {
          kind: "svg",
          svg: `<svg viewBox="0 0 560 260" xmlns="http://www.w3.org/2000/svg" font-family="ui-monospace, monospace" font-size="13">
  <rect x="12" y="12" width="536" height="236" rx="12" fill="var(--bg-raised)" stroke="var(--border)"/>
  <text x="32" y="46" fill="var(--text-faint)">\`\`\`routine</text> // lineage
  <text x="32" y="68" fill="var(--text)">title: <tspan fill="var(--accent)">Weekly exercise</tspan></text>
  <text x="32" y="90" fill="var(--text)">slots: <tspan fill="var(--accent)">morning, evening</tspan></text>
  <text x="32" y="112" fill="var(--text)">monday:</text>
  <text x="52" y="134" fill="var(--text-muted)">morning: 60 min brisk walk</text>
  <text x="32" y="156" fill="var(--text-faint)">\`\`\`</text>
  <text x="32" y="190" fill="var(--text-faint)">\`\`\`routine-log</text> // lineage
  <text x="32" y="212" fill="var(--text)"><tspan fill="var(--accent)">2026-09-14</tspan> | done: morning, evening | minutes: 62</text>
  <text x="32" y="234" fill="var(--text-faint)">\`\`\`</text>
  <g transform="translate(470 196)"><circle r="14" fill="var(--callout-success, var(--accent))" opacity="0.18"/><path d="M-6 0l4 4 8-9" fill="none" stroke="var(--callout-success, var(--accent))" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>
</svg>`,
        },
      },
      {
        title: { en: "The Routines page, and templates", ar: "صفحة الروتين، والقوالب" }, // lineage
        body: {
          en: "The calendar button beside the gear opens every routine as today's checklists. New routine starts from a template — an exercise week, prayers, sleep, water, mood, reading, study — or from one of your own, saved with one click.", // lineage
          ar: "زر التقويم بجانب الترس يفتح كل روتين قوائمَ لليوم. روتين جديد يبدأ من قالب: أسبوع تمارين، صلاة، نوم، ماء، مزاج، قراءة، دراسة؛ أو من قالب لك تحفظه بنقرة واحدة.",
        },
        visual: { kind: "demo", mount: templatesDemo },
        docs: "routines",
      },
    ],
  },
  {
    version: "3.10.0",
    title: { en: "Easy on the eyes", ar: "راحة للعين" },
    slides: [
      {
        title: { en: "Warm the screen, dim the page", ar: "دفّئ الشاشة، عتّم الصفحة" },
        body: {
          en: "Two sliders on Settings → This device that sit over any theme: an amber sheet like a phone's night light, and a dimmer below what your monitor reaches. Per device, never printed. The palette's Warm the screen is the one-key switch.",
          ar: "منزلقان في الإعدادات ← هذا الجهاز يجلسان فوق أي سمة: طبقة كهرمانية كالإضاءة الليلية في الهاتف، ومعتّم يهبط تحت ما تبلغه شاشتك. لكل جهاز، ولا يُطبع. ودفّئ الشاشة في اللوحة مفتاحه الواحد.",
        },
        visual: { kind: "demo", mount: eyeDemo },
        docs: "theming",
      },
    ],
  },
];

export function releaseFor(version: string): Release | undefined {
  return RELEASES.find((r) => r.version === version);
}
