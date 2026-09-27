// THE SETTINGS WALK — every section, opened, searched and saved, in a real
// browser. Shared by check-fidelity (the desktop dialog) and check-phone (the
// phone shell's pushed sections), so the two hosts are asked the same
// questions of the same rows (the settings purge: "the phone's sections mirror
// the desktop's exactly").
//
// For each section of TABS, in order:
//   · it opens under its own name, with its one-sentence intro, and holds at
//     most eighteen rows;
//   · ONE CHANGE IS SAVED: a control on a row the section owns is moved, the
//     Save bar appears (it is absent while nothing has changed), Save sends
//     it, the server's effective settings move, and the control is put back
//     and saved again (the instance ends as it began);
// and then, once:
//   · a search by a word that is only in a row's HINT lands on that row —
//     one behind its section's Advanced line, which the hit opens.

import enDict from "../client/i18n/en.ts";
import arDict from "../client/i18n/ar.ts";
import { TABS } from "../client/components/settings/tabs.ts";
import { SETTINGS_INDEX } from "../client/components/settings/settingsIndex.ts";

const DICT = { en: enDict, ar: arDict };

/** One change per section that has server rows: the row, how to move its
 *  control, and how to put it back. `seg` picks a segment by index (so the
 *  plan reads the same in both languages); `fill` types into the row's
 *  first text field. About holds only rows this device keeps, which never
 *  raise the Save bar — so it is asked for its rows and nothing is saved. */
export const SAVE_PLAN = {
  appearance: { row: "rowTextDirection", seg: [2, 0] },
  language: { row: "rowDateCalendar", seg: [1, 0] },
  writing: { row: "templatesFolderLabel", fill: ["Templates-walk", ""] },
  reading: { row: "rowPdfSearch", seg: [2, 0] },
  site: { row: "rowTagline", fill: ["walked by the settings gate", ""] },
  collections: { row: "rowTopicsMode", seg: [1, 0] },
  sync: { row: "rowNoteVersions", seg: [2, 0] },
  ask: { row: "rowAskChatModel", fill: ["qwen-walk", ""] },
};

/** A row behind an Advanced line, found by a word only its hint has. */
export function hintProbe(lang) {
  const d = DICT[lang];
  const row = SETTINGS_INDEX.find((e) => e.label === "drawingsFolderLabel");
  const words = String(d[row.hint]).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 5);
  // The word no OTHER row's label or hint begins a word with, so the first
  // hit is this row.
  const others = SETTINGS_INDEX.filter((e) => e !== row).map((e) => `${d[e.label] ?? ""} ${e.hint ? d[e.hint] : ""}`.toLowerCase());
  const word = words.find((w) => !others.some((o) => o.includes(w.toLowerCase()))) ?? words[0];
  return { query: word, label: d[row.label], tab: row.tab };
}

const esc = (s) => s.replace(/"/g, '\\"');

/**
 * @param {object} o
 * @param {import("playwright").Page} o.page — the app, loaded, as an admin
 * @param {"en"|"ar"} o.lang
 * @param {"desktop"|"phone"} o.host
 * @param {(ok: boolean, label: string, detail?: string) => void} o.check
 * @param {(what: string) => string} o.tag
 * @param {(loc: import("playwright").Locator) => Promise<void>} o.press
 * @param {() => Promise<void>} o.openSettings — lands on the dialog / the list
 * @param {() => Promise<void>} [o.back] — the phone's Back
 * @param {string} [o.shots] — a directory to photograph each section into
 */
export async function walkSettings({ page, lang, host, check, tag, press, openSettings, back, shots }) {
  const d = DICT[lang];
  const effective = () => page.evaluate(async () => JSON.stringify((await (await fetch("/api/settings")).json()).effective));
  const settle = (ms = 600) => page.waitForTimeout(ms);
  const pocket = await page.evaluate(async () => (await (await fetch("/api/me")).json()).pocket === true);
  await openSettings();
  const scope = host === "desktop" ? ".s-smodal" : "[data-screen='settings-section']";
  const visible = TABS.filter((s) => !(pocket && (s.id === "collections" || s.id === "ask")));
  if (host === "phone") {
    const listed = await page.locator("[data-screen='settings'] .s-ph-row[data-section]").evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
    check(JSON.stringify(listed) === JSON.stringify(visible.map((s) => s.id)), tag("the phone lists the desktop's sections, in its order"), listed.join(" · "));
  } else {
    const rail = await page.locator(".s-smodal__railbtn").allTextContents();
    check(JSON.stringify(rail) === JSON.stringify(visible.map((s) => d[s.key])), tag("the rail names the sections in order"), rail.join(" · "));
  }
  for (const [i, s] of visible.entries()) {
    const name = d[s.key];
    if (host === "desktop") {
      await press(page.locator(`#s-smodal-tab-${s.id}`));
      await settle(500);
      const head = (await page.locator(".s-smodal__tabhead").textContent().catch(() => "")) ?? "";
      check(head.trim() === name, tag(`${s.id}: opens under its name`), head);
      check((await page.locator(".s-smodal__foot").count()) === 0, tag(`${s.id}: no Save bar while nothing changed`));
    } else {
      await press(page.locator(`[data-screen='settings'] .s-ph-row[data-section="${s.id}"]`));
      await page.waitForSelector(`[data-screen='settings-section'][data-section="${s.id}"]`, { timeout: 10000 }).catch(() => {});
      await settle(900);
      const head = (await page.locator("[data-screen='settings-section'] .s-ph-top").textContent().catch(() => "")) ?? "";
      check(head.includes(name), tag(`${s.id}: opens under its name`), head.slice(0, 60));
      check(!(await page.evaluate(() => document.querySelector(".s-ph-settings--dirty") !== null)), tag(`${s.id}: no save bar while nothing changed`));
    }
    const intro = (await page.locator(`${scope} .s-smodal__note`).first().textContent().catch(() => "")) ?? "";
    check(intro.trim().length > 20, tag(`${s.id}: opens with its one sentence`), intro.slice(0, 60));
    const rows = await page.locator(`${scope} .s-smodal__row`).count();
    check(rows <= 18 && (s.id === "about" || rows >= 4), tag(`${s.id}: ${rows} rows (≤ 18)`));
    if (shots) await page.screenshot({ path: `${shots}/settings-${host}-${lang}-${String(i + 1).padStart(2, "0")}-${s.id}.png` });

    const plan = SAVE_PLAN[s.id];
    if (plan && !(pocket && (s.id === "reading" || s.id === "sync"))) {
      const row = page.locator(`${scope} [data-setting="${esc(d[plan.row])}"]`).first();
      // Put back what was THERE, not what the plan assumes was there: another
      // step of the same gate may have saved this row already.
      await row.scrollIntoViewIfNeeded().catch(() => {});
      const was = plan.seg
        ? await row.locator("[role=radio]").evaluateAll((els) => els.findIndex((e) => e.getAttribute("aria-checked") === "true"))
        : await row.locator("input").first().inputValue();
      const to = plan.seg ? (was === plan.seg[0] ? plan.seg[1] : plan.seg[0]) : was === plan.fill[0] ? plan.fill[1] : plan.fill[0];
      const move = async (step) => {
        const v = step === 0 ? to : was;
        if (plan.seg) await press(row.locator("[role=radio]").nth(v));
        else await row.locator("input").first().fill(v);
        await settle(400);
      };
      const save = async () => {
        const btn = host === "desktop" ? page.locator(".s-smodal__foot .s-btn--accent") : page.locator('.s-ph-savebar [data-action="save"]');
        await press(btn);
        await page.waitForFunction(
          (h) => (h === "desktop" ? document.querySelector(".s-smodal__foot") === null : document.querySelector(".s-ph-settings--dirty") === null),
          host,
          { timeout: 15000 },
        ).catch(() => {});
        await settle(500);
      };
      const before = await effective();
      await move(0);
      const raised = host === "desktop" ? (await page.locator(".s-smodal__foot").count()) > 0 : await page.evaluate(() => document.querySelector(".s-ph-settings--dirty") !== null);
      check(raised, tag(`${s.id}: a change raises the Save bar`));
      await save();
      const after = await effective();
      check(after !== before, tag(`${s.id}: Save sends ${plan.row} to the server`));
      await move(1);
      await save();
      const restored = await effective();
      check(restored === before, tag(`${s.id}: …and putting it back saves too`));
    }
    if (host === "phone" && back) {
      await back();
      await settle(700);
    }
  }

  // The search, by a word only a hint has, landing behind an Advanced line.
  const probe = hintProbe(lang);
  if (host === "desktop") {
    await page.locator(".s-smodal__searchinput").fill(probe.query);
    await settle(300);
    const first = (await page.locator(".s-smodal__result").first().textContent().catch(() => "")) ?? "";
    check(first.includes(probe.label), tag(`searching the hint word "${probe.query}" finds ${probe.label} first`), first);
    await page.locator(".s-smodal__searchinput").press("Enter");
  } else {
    await page.locator("[data-screen='settings'] input[type=search]").fill(probe.query);
    await settle(400);
    const first = (await page.locator("[data-screen='settings'] .s-ph-hit").first().textContent().catch(() => "")) ?? "";
    check(first.includes(probe.label), tag(`searching the hint word "${probe.query}" finds ${probe.label} first`), first);
    await press(page.locator("[data-screen='settings'] .s-ph-hit").first());
  }
  await settle(1400);
  const landed = await page.evaluate(
    ([sel, label]) => {
      const row = document.querySelector(`${sel} [data-setting="${label}"]`);
      if (!row) return "no row";
      const details = row.closest("details");
      if (details && !details.open) return "the Advanced line stayed shut";
      const r = row.getBoundingClientRect();
      return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight ? "ok" : `off screen (${Math.round(r.top)})`;
    },
    [scope, probe.label],
  );
  check(landed === "ok", tag(`…and the hit opens ${probe.tab}'s Advanced line and lands on the row`), landed);
  if (shots) await page.screenshot({ path: `${shots}/settings-${host}-${lang}-search.png` });
  if (host === "phone" && back) {
    await back();
    await settle(600);
  }
}
