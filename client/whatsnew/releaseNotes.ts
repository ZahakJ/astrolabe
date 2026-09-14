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

export type Visual =
  | { kind: "demo"; mount: (host: HTMLElement, lang: Lang) => void | (() => void) }
  | { kind: "svg"; svg: string }
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
  const draw = (mod: typeof import("../reading/routine.ts")): void => {
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
  void import("../reading/routine.ts").then(draw);
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
  head.appendChild(el("span", "s-wn-page__title", lang === "ar" ? "الروتين" : "Routines"));
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

// ── The registry ────────────────────────────────────────────────────────────

export const RELEASES: Release[] = [
  {
    version: "3.11.0",
    title: { en: "Routines", ar: "الروتين" },
    slides: [
      {
        title: { en: "A plan you follow by the day", ar: "خطة تتبعها يومًا بيوم" },
        body: {
          en: "An exercise week, the five prayers, sleep, water — a routine is a card about your days. Today's checklist, the numbers you keep, a streak that lights, the week as seven dots and twelve weeks as a heatmap. Tick a box on this one.",
          ar: "أسبوع تمارين، الصلوات الخمس، النوم، الماء: الروتين بطاقة عن أيامك. قائمة اليوم، والأرقام التي تحفظها، وسلسلة تضيء، والأسبوع سبع نقاط، واثنا عشر أسبوعًا خريطة حرارية. علّم على مربع في هذه.",
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
  <text x="32" y="46" fill="var(--text-faint)">\`\`\`routine</text>
  <text x="32" y="68" fill="var(--text)">title: <tspan fill="var(--accent)">Weekly exercise</tspan></text>
  <text x="32" y="90" fill="var(--text)">slots: <tspan fill="var(--accent)">morning, evening</tspan></text>
  <text x="32" y="112" fill="var(--text)">monday:</text>
  <text x="52" y="134" fill="var(--text-muted)">morning: 60 min brisk walk</text>
  <text x="32" y="156" fill="var(--text-faint)">\`\`\`</text>
  <text x="32" y="190" fill="var(--text-faint)">\`\`\`routine-log</text>
  <text x="32" y="212" fill="var(--text)"><tspan fill="var(--accent)">2026-09-14</tspan> | done: morning, evening | minutes: 62</text>
  <text x="32" y="234" fill="var(--text-faint)">\`\`\`</text>
  <g transform="translate(470 196)"><circle r="14" fill="var(--callout-success, var(--accent))" opacity="0.18"/><path d="M-6 0l4 4 8-9" fill="none" stroke="var(--callout-success, var(--accent))" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>
</svg>`,
        },
      },
      {
        title: { en: "The Routines page, and templates", ar: "صفحة الروتين، والقوالب" },
        body: {
          en: "The calendar button beside the gear opens every routine as today's checklists. New routine starts from a template — an exercise week, prayers, sleep, water, mood, reading, study — or from one of your own, saved with one click.",
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
