// THE SETTINGS WALK — every page opened, every row SET, the app reloaded, and
// every row read back. Shared by check-fidelity (the desktop dialog) and
// check-phone (the phone shell's pushed pages), so the two hosts are asked the
// same questions of the same rows (contracts/settings-design.md, "Legitimacy").
//
// The owner, after 3.38.0: "Please make sure things are legit." A control that
// looks right and saves nothing, or saves and reads back something else after
// a reload, is exactly what a screenshot cannot show. So, for each page of
// the rail, in order:
//   · it opens under its own name, with its one sentence (and, when it is all
//     this device's, the line that says so), at most ten rows in sight, and no
//     Save bar while nothing has changed;
//   · every control in it has an accessible name, every row's control ends at
//     the same edge (the one control column, mirrored in Arabic), and on the
//     desktop every hint is one line;
//   · EVERY ROW IT CAN SET IS SET, once, by its catalogue kind (settings/
//     catalogue.ts): a switch flipped, another segment, another option, a chip,
//     the slider moved, a field typed. The rows kept on this device go first
//     and must not raise the Save bar; the saved rows must, and Save sends
//     them;
//   · the app is RELOADED, the page reopened, and every row read back: what is
//     on screen must be what was set, and the stored settings (the server's, or
//     this browser's) must have moved;
//   · every row is then put back, saved, reloaded and read back again — the
//     instance ends as it began.
// And once: Discard puts an edit back and takes the bar away; a search by a
// word that is only in a row's HINT lands on that row behind its page's
// Advanced line. Rows it cannot set in a scratch instance are named with their
// reason (a write-only secret; a row that would switch this walk's own chrome
// language or pull another device's preferences into it).

import enDict from "../client/i18n/en.ts";
import arDict from "../client/i18n/ar.ts";
import { devicePage, visiblePages } from "../client/components/settings/tabs.ts";
import { SETTINGS_INDEX } from "../client/components/settings/settingsIndex.ts";
import { SETTABLE_KINDS } from "../client/components/settings/catalogue.ts";

const DICT = { en: enDict, ar: arDict };

/** What to type into a field, by its label key, where "walk" would not pass
 *  the row's own validation. Everything else gets `walk`. */
const TYPE = {
  rowSiteName: "Walked",
  rowTagline: "walked by the settings gate",
  rowFooter: "© walked",
  rowDateLocale: "en-GB",
  rowAuthorSites: "https://example.org",
  rowFediverseHandle: "walker",
  rowExcludeTags: "walked",
  rowHomeNote: "Walked.md",
  rowLaunchNote: "Walked.md",
  defaultTemplateLabel: "Templates/Walked.md",
  captureInboxLabel: "Inbox-walk.md",
  feedsNoteField: "Feeds-walk.md",
  rowLogo: "walk.png",
  rowFavicon: "walk.png",
  rowHomeBanner: "walk.png",
  rowSyncRemote: "https://example.org/walk.git",
  rowSyncBranch: "walk",
  rowAskTopK: "6",
  rowSizeAdjust: "104",
  editorWidthCustom: "900px",
  rowLibraryTitle: "Walked shelf",
};

/** The value to type when a field already holds its TYPE value. */
const TYPE_ALT = {
  rowAskTopK: "8",
  rowSizeAdjust: "106",
};

/** Rows the walk does not set, and why — named in its log, never silently. */
const SKIP = {
  rowSyncToken: "a write-only secret: it reads back as an empty field and a 'stored' line",
  rowAskKey: "a write-only secret: it reads back as an empty field and a 'stored' line",
  rowPrefsSync: "switching it on pulls another device's preferences into this walk",
  rowAppName: "the desktop app's own row",
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

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

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
 * @param {string} [o.shots] — a directory to photograph each page into
 * @returns {Promise<{ set: number, readBack: number, skipped: string[] }>}
 */
export async function walkSettings({ page, lang, host, check, tag, press, openSettings, back, shots }) {
  const d = DICT[lang];
  const settle = (ms = 600) => page.waitForTimeout(ms);
  // The stored settings: the response minus what is derived from them.
  const stored = () =>
    page.evaluate(async () => {
      const { effective, inherited, fontCatalog, about, ...rest } = await (await fetch("/api/settings")).json();
      return JSON.stringify(rest);
    });
  /** What the instance DOES — the effective settings. Putting a row back can
   *  leave an explicit value where there was none (a switch with no "Default"
   *  state stores "off" where nothing was stored), so "as it began" is asked of
   *  these; the raw stored settings are asked only whether they MOVED. */
  const effective = () => page.evaluate(async () => JSON.stringify((await (await fetch("/api/settings")).json()).effective));
  /** The top-level keys two JSON snapshots disagree on — a failure's detail. */
  const differ = (a, b) => {
    const x = JSON.parse(a);
    const y = JSON.parse(b);
    return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k])).join(", ");
  };
  const local = () =>
    page.evaluate(() =>
      JSON.stringify(
        Object.fromEntries(
          Object.keys(localStorage)
            .filter((k) => k.startsWith("astrolabe"))
            .sort()
            .map((k) => [k, localStorage.getItem(k)]),
        ),
      ),
    );
  const pocket = await page.evaluate(async () => (await (await fetch("/api/me")).json()).pocket === true);
  const scope = host === "desktop" ? ".s-smodal" : "[data-screen='settings-section']";
  const visible = visiblePages(pocket);
  const tally = { set: 0, readBack: 0, skipped: [] };
  const keyOf = new Map(SETTINGS_INDEX.map((e) => [d[e.label], e.label]));

  // ── Where the pages are ────────────────────────────────────────────────
  await openSettings();
  if (host === "phone") {
    const listed = await page.locator("[data-screen='settings'] .s-ph-row[data-section]").evaluateAll((els) => els.map((e) => e.getAttribute("data-section")));
    check(JSON.stringify(listed) === JSON.stringify(visible.map((s) => s.id)), tag("the phone lists the desktop's pages, in its order"), listed.join(" · "));
    const heads = await page.locator("[data-screen='settings'] .s-ph-group .s-ph-head").allTextContents();
    check(heads.length === 4, tag("the phone draws the four groups as headed lists"), heads.join(" · "));
  } else {
    const rail = await page.locator(".s-smodal__railbtn").allTextContents();
    check(JSON.stringify(rail) === JSON.stringify(visible.map((s) => d[s.key])), tag("the rail names the pages in order"), rail.join(" · "));
    const heads = await page.locator(".s-smodal__railhead").allTextContents();
    check(heads.length === 4, tag("the rail is two levels: four group headings over the pages"), heads.join(" · "));
  }

  /** Land on one page, from wherever the app is (after a reload too). */
  const goPage = async (s) => {
    if (host === "desktop") {
      if ((await page.locator(".s-smodal").count()) === 0) await openSettings();
      await press(page.locator(`#s-smodal-tab-${s.id}`));
    } else {
      if ((await page.locator(`[data-screen='settings-section'][data-section="${s.id}"]`).count()) > 0) return settle(400);
      // Another page is pushed over the list: Back to the list first (a
      // pushed page has no tab bar to reach More by).
      for (let i = 0; i < 3 && (await page.locator("[data-screen='settings-section']").count()) > 0; i++) {
        if (back) await back();
        else await page.goBack();
        await settle(500);
      }
      if ((await page.locator("[data-screen='settings'] .s-ph-row[data-section]").count()) === 0) await openSettings();
      await press(page.locator(`[data-screen='settings'] .s-ph-row[data-section="${s.id}"]`));
      await page.waitForSelector(`[data-screen='settings-section'][data-section="${s.id}"]`, { timeout: 10000 }).catch(() => {});
    }
    await settle(700);
  };
  const openAdvanced = () => page.evaluate((sel) => document.querySelectorAll(`${sel} details.s-smodal__adv`).forEach((x) => (x.open = true)), scope);
  const reload = async (s) => {
    await page.reload({ waitUntil: "load" });
    await settle(1600);
    await goPage(s);
    await openAdvanced();
    await settle(300);
  };
  const barUp = () =>
    host === "desktop"
      ? page
          .locator(".s-smodal__foot")
          .count()
          .then((n) => n > 0)
      : page.evaluate(() => document.querySelector(".s-ph-settings--dirty") !== null);
  const save = async () => {
    const btn = host === "desktop" ? page.locator(".s-smodal__foot .s-btn--accent") : page.locator('.s-ph-savebar [data-action="save"]');
    const enabled = await btn.isEnabled().catch(() => false);
    if (!enabled) {
      const bad = await page.locator(`${scope} .s-smodal__row--invalid`).evaluateAll((els) => els.map((e) => e.getAttribute("data-setting")));
      return `Save is disabled — invalid: ${bad.join(", ") || "(none marked)"}`;
    }
    await press(btn);
    await page
      .waitForFunction((h) => (h === "desktop" ? document.querySelector(".s-smodal__foot") === null : document.querySelector(".s-ph-settings--dirty") === null), host, { timeout: 30000 })
      .catch(() => {});
    await settle(700);
    return (await barUp()) ? "the Save bar is still up after Save" : "";
  };

  // ── Reading and setting one control, by its kind ───────────────────────
  const at = (label) => page.locator(`${scope} [data-setting="${esc(label)}"]`).first();
  /** The control's state as text: comparable across a reload. */
  const read = (label, kind) =>
    at(label).evaluate((el, k) => {
      const own = (sel) => [...el.querySelectorAll(sel)].filter((x) => x.closest("[data-setting]") === el);
      if (k === "toggle") return own("[role=switch]")[0]?.getAttribute("aria-checked") ?? "?";
      if (k === "segmented") return String(own("[role=radio]").findIndex((r) => r.getAttribute("aria-checked") === "true"));
      if (k === "select") return (el.querySelector(".s-smodal__themename, .s-ctl-select__value")?.textContent ?? "?").trim();
      if (k === "chips") return own("[aria-pressed]").filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => c.getAttribute("data-chip")).join(",");
      if (k === "slider") return own("input[type=range]")[0]?.value ?? "?";
      return own("input, textarea")[0]?.value ?? "?";
    }, kind);
  const disabledNow = (label) =>
    at(label).evaluate((el) => {
      const ctl = [...el.querySelectorAll("input, textarea, button, [role=switch], [role=radio], [role=combobox]")].find((x) => x.closest("[data-setting]") === el);
      return !ctl || ctl.disabled || ctl.closest("fieldset[disabled]") !== null || el.classList.contains("s-smodal__row--off");
    });
  const blur = () => page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  /** Move the control to `to` (a state `read` returned), or — with no `to` —
   *  to some OTHER state; returns the state it was left in. */
  const set = async (label, kind, to) => {
    const row = at(label);
    const key = keyOf.get(label) ?? "";
    const before = await read(label, kind);
    if (kind === "toggle") {
      if (to === undefined || to !== before) await press(row.locator("[role=switch]").first());
    } else if (kind === "segmented") {
      const radios = row.locator("[role=radio]");
      const n = await radios.count();
      let target = to === undefined ? (Number(before) + 1) % n : Number(to);
      // Your language: never switch THIS walk's chrome out from under it —
      // pin the language it is walking in, or follow a site that speaks it.
      if (key === "rowEditorLanguage" && to === undefined) target = Number(before) === 0 ? (lang === "en" ? 1 : 2) : 0;
      await press(radios.nth(target));
    } else if (kind === "select") {
      const trigger = row.locator(".s-smodal__themebtn, [role=combobox]").first();
      await press(trigger);
      await settle(400);
      if (key === "rowYourTheme") {
        // The theme opens a browsing panel, not a list: a click on a room
        // commits it and closes the panel.
        const opts = page.locator(".s-tpick [role=option]");
        const names = await opts.evaluateAll((els) => els.map((e) => (e.querySelector(".s-tpick__name")?.textContent ?? "").trim()));
        const want = to === undefined ? names.findIndex((n) => n !== before && n !== "") : names.indexOf(to);
        await press(opts.nth(Math.max(0, want)));
        await settle(500);
        if ((await page.locator(".s-tpick").count()) > 0) await page.keyboard.press("Enter");
      } else {
        const opts = page.locator(".s-ctl-pop [role=option]");
        const texts = await opts.evaluateAll((els) => els.map((e) => (e.querySelector(".s-ctl-pop__optlabel")?.textContent ?? e.textContent ?? "").trim()));
        let want = to === undefined ? texts.findIndex((x) => x !== before) : texts.indexOf(to);
        if (want < 0) want = 0;
        await opts.nth(want).scrollIntoViewIfNeeded().catch(() => {});
        await press(opts.nth(want));
      }
    } else if (kind === "chips") {
      const chips = row.locator("[aria-pressed]");
      const want = to === undefined ? null : new Set(to.split(",").filter(Boolean));
      const n = await chips.count();
      for (let i = 0; i < n; i++) {
        const c = chips.nth(i);
        const code = await c.getAttribute("data-chip");
        const on = (await c.getAttribute("aria-pressed")) === "true";
        if (want === null ? i === 0 : want.has(code) !== on) await press(c);
      }
    } else if (kind === "slider") {
      await row.locator("input[type=range]").first().fill(to ?? (before === "0" ? "30" : "0"));
    } else {
      const field = row.locator("input, textarea").first();
      await field.fill(to ?? (before === (TYPE[key] ?? "walk") ? (TYPE_ALT[key] ?? "") : (TYPE[key] ?? "walk")));
      await blur();
    }
    await settle(350);
    return read(label, kind);
  };
  const targetsNow = () =>
    page
      .locator(`${scope} [data-setting][data-kind]`)
      .evaluateAll((els) => els.map((e) => ({ label: e.getAttribute("data-setting"), kind: e.getAttribute("data-kind"), device: e.closest("[data-device]") !== null })));

  // ── Page by page ───────────────────────────────────────────────────────
  for (const [i, s] of visible.entries()) {
    const name = d[s.key];
    await goPage(s);
    const head =
      host === "desktop"
        ? ((await page.locator(".s-smodal__tabhead").textContent().catch(() => "")) ?? "")
        : ((await page.locator("[data-screen='settings-section'] .s-ph-top").textContent().catch(() => "")) ?? "");
    check(head.includes(name), tag(`${s.id}: opens under its name`), head.slice(0, 60));
    check(!(await barUp()), tag(`${s.id}: no Save bar while nothing changed`));
    const intro = (await page.locator(`${scope} .s-smodal__note`).first().textContent().catch(() => "")) ?? "";
    check(intro.trim().length > 20, tag(`${s.id}: opens with its one sentence`), intro.slice(0, 60));
    const devnote = await page.locator(`${scope} .s-smodal__devnote`).count();
    check(devnote === (devicePage(s.id) ? 1 : 0), tag(`${s.id}: says "kept on this device" ${devicePage(s.id) ? "once" : "nowhere"}`));
    if (devicePage(s.id)) check((await page.locator(`${scope} .s-smodal__device`).count()) === 0, tag(`${s.id}: …and marks no row with it`));
    const inSight = await page.locator(`${scope} .s-smodal__row:not(.s-smodal__adv .s-smodal__row)`).count();
    check(inSight <= 10, tag(`${s.id}: ${inSight} rows in sight (≤ 10)`));
    await openAdvanced();
    await settle(200);
    if (shots) await page.screenshot({ path: `${shots}/settings-${host}-${lang}-${String(i + 1).padStart(2, "0")}-${s.id}.png` });

    // Every control named; one control column edge; one-line hints.
    const audit = await page.evaluate(
      ([sel, isDesktop]) => {
        const nameOf = (el) => {
          const aria = el.getAttribute("aria-label");
          if (aria && aria.trim()) return aria.trim();
          const by = el.getAttribute("aria-labelledby");
          if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
          if (el.labels && el.labels.length > 0) return [...el.labels].map((l) => l.textContent ?? "").join(" ").trim();
          if (el.tagName === "BUTTON") return (el.textContent ?? "").trim() || (el.getAttribute("title") ?? "");
          return el.getAttribute("title") ?? "";
        };
        const unnamed = [];
        const rows = [...document.querySelectorAll(`${sel} .s-smodal__row`)].filter((r) => r.getBoundingClientRect().height > 0);
        for (const r of rows) {
          for (const el of r.querySelectorAll("input:not([type=hidden]), textarea, button, [role=switch], [role=radio], [role=combobox]")) {
            if (el.getBoundingClientRect().height === 0 || el.closest("[hidden]")) continue;
            if (nameOf(el) === "") unnamed.push(`${r.getAttribute("data-setting")}: ${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}`);
          }
        }
        const rtl = getComputedStyle(document.querySelector(sel) ?? document.body).direction === "rtl";
        const offEdge = [];
        for (const r of rows) {
          if (r.classList.contains("s-smodal__row--wide")) continue;
          const ctl = r.querySelector(":scope > .s-smodal__control");
          if (!ctl) continue;
          const first = [...ctl.children].find((c) => c.getBoundingClientRect().height > 0);
          if (!first) continue;
          const box = first.getBoundingClientRect();
          const rowBox = r.getBoundingClientRect();
          const edge = Math.round(rtl ? box.left - rowBox.left : rowBox.right - box.right);
          if (Math.abs(edge) > 2) offEdge.push(`${r.getAttribute("data-setting")} ${edge}px`);
        }
        const twoLine = [];
        if (isDesktop) {
          for (const h of document.querySelectorAll(`${sel} .s-smodal__row > .s-smodal__label .s-smodal__hint`)) {
            if (h.getBoundingClientRect().height === 0) continue;
            const lh = parseFloat(getComputedStyle(h).lineHeight) || 17;
            if (h.getBoundingClientRect().height > lh * 1.5) twoLine.push(h.closest("[data-setting]")?.getAttribute("data-setting") ?? "?");
          }
        }
        return { unnamed, offEdge, twoLine, rtl };
      },
      [scope, host === "desktop"],
    );
    check(audit.unnamed.length === 0, tag(`${s.id}: every control has an accessible name`), audit.unnamed.join(" | "));
    check(audit.offEdge.length === 0, tag(`${s.id}: every control ends at the one column edge${audit.rtl ? " (mirrored)" : ""}`), audit.offEdge.join(" | "));
    if (host === "desktop") check(audit.twoLine.length === 0, tag(`${s.id}: every hint is one line`), audit.twoLine.join(" | "));

    // ── Set every row ──────────────────────────────────────────────────
    const first = await targetsNow();
    const done = new Map();
    const storedBefore = await stored();
    const effectiveBefore = await effective();
    const localBefore = await local();
    let deviceChecked = false;
    // The rows kept on this device first — they must not raise the bar —
    // then the saved ones. Rows revealed by an earlier change (the calendar's
    // order under "Both", the fediverse name under its switch) are walked on
    // a later pass, once they appear.
    for (let pass = 0; pass < 3; pass++) {
      const now = pass === 0 ? [...first.filter((x) => x.device), ...first.filter((x) => !x.device)] : await targetsNow();
      for (const x of now) {
        if (done.has(x.label) || tally.skipped.some((k) => k.startsWith(`${s.id}/${x.label}:`))) continue;
        if (!deviceChecked && !x.device) {
          deviceChecked = true;
          if (done.size > 0) check(!(await barUp()), tag(`${s.id}: the rows kept on this device raise no Save bar`));
        }
        const key = keyOf.get(x.label) ?? "";
        const why = !SETTABLE_KINDS.has(x.kind)
          ? `a ${x.kind}: shown, not set`
          : (SKIP[key] ?? (key === "rowEditorLanguage" && lang !== "en" ? "would switch this walk's own chrome language" : null));
        if (why) {
          tally.skipped.push(`${s.id}/${x.label}: ${why}`);
          continue;
        }
        if ((await at(x.label).count()) === 0 || (await disabledNow(x.label))) {
          if (pass === 2) tally.skipped.push(`${s.id}/${x.label}: off while the switch it serves is off`);
          continue;
        }
        // A host whose only controls are its parts (Webmentions: accept and
        // send) is set through them — each part is walked on its own.
        if ((await read(x.label, x.kind)) === "?") {
          tally.skipped.push(`${s.id}/${x.label}: a host — its parts are its controls, and each is set`);
          continue;
        }
        const before = await read(x.label, x.kind);
        const after = await set(x.label, x.kind);
        check(after !== before, tag(`${s.id}: setting ${key || x.label} moves its control`), `${before} → ${after}`);
        done.set(x.label, { ...x, before, after });
        tally.set += 1;
      }
    }
    if (!deviceChecked && done.size > 0) check(!(await barUp()), tag(`${s.id}: the rows kept on this device raise no Save bar`));
    const saved = [...done.values()].filter((x) => !x.device);
    if (saved.length > 0) {
      check(await barUp(), tag(`${s.id}: a saved row's change raises the Save bar`));
      const problem = await save();
      check(problem === "", tag(`${s.id}: Save sends ${saved.length} row(s)`), problem);
    }
    if (done.size === 0) continue;

    // ── Reload, and read every row back ────────────────────────────────
    await reload(s);
    let agreed = 0;
    for (const x of done.values()) {
      const now = (await at(x.label).count()) > 0 ? await read(x.label, x.kind) : "(gone)";
      check(now === x.after, tag(`${s.id}: ${keyOf.get(x.label) ?? x.label} reads back after a reload`), `set ${x.after}, read ${now}`);
      if (now === x.after) agreed += 1;
    }
    tally.readBack += agreed;
    if (saved.length > 0) check((await stored()) !== storedBefore, tag(`${s.id}: the server's stored settings moved`));
    if (done.size > saved.length) check((await local()) !== localBefore, tag(`${s.id}: this browser's stored preferences moved`));

    // ── Put everything back, and prove it ──────────────────────────────
    for (const x of [...done.values()].reverse()) {
      if ((await at(x.label).count()) === 0 || (await disabledNow(x.label))) continue;
      await set(x.label, x.kind, x.before);
    }
    if (saved.length > 0 && (await barUp())) {
      const problem = await save();
      check(problem === "", tag(`${s.id}: putting every row back saves`), problem);
    }
    await reload(s);
    const drift = [];
    for (const x of done.values()) {
      if ((await at(x.label).count()) === 0) continue;
      const now = await read(x.label, x.kind);
      if (now !== x.before) drift.push(`${keyOf.get(x.label) ?? x.label}: ${x.before} → ${now}`);
    }
    check(drift.length === 0, tag(`${s.id}: …and every row reads back as it began`), drift.join(" | "));
    if (saved.length > 0) {
      const now = await effective();
      check(now === effectiveBefore, tag(`${s.id}: what the instance does is as it began`), differ(effectiveBefore, now));
    }
  }

  // ── Discard puts an edit back ──────────────────────────────────────────
  const siteIdentity = visible.find((s) => s.id === "site");
  if (siteIdentity) {
    await goPage(siteIdentity);
    const label = d.rowTagline;
    const was = await read(label, "text");
    await at(label).locator("input").first().fill(`${was} — discard me`);
    await settle(300);
    check(await barUp(), tag("an edit raises the Save bar"));
    await press(host === "desktop" ? page.locator(".s-smodal__foot .s-btn:not(.s-btn--accent)") : page.locator(".s-ph-savebar .s-ph-btn--quiet"));
    await settle(500);
    check((await read(label, "text")) === was && !(await barUp()), tag("Discard puts it back and takes the bar away"));
  }

  // ── A hint word finds its row behind an Advanced line ──────────────────
  if (host === "phone" && back) {
    await back();
    await settle(700);
  }
  const probe = hintProbe(lang);
  if (host === "desktop") {
    await page.locator(".s-smodal__searchinput").fill(probe.query);
    await settle(300);
    const hit = (await page.locator(".s-smodal__result").first().textContent().catch(() => "")) ?? "";
    check(hit.includes(probe.label), tag(`searching the hint word "${probe.query}" finds ${probe.label} first`), hit);
    await page.locator(".s-smodal__searchinput").press("Enter");
  } else {
    if ((await page.locator("[data-screen='settings'] input[type=search]").count()) === 0) await openSettings();
    await page.locator("[data-screen='settings'] input[type=search]").fill(probe.query);
    await settle(400);
    const hit = (await page.locator("[data-screen='settings'] .s-ph-hit").first().textContent().catch(() => "")) ?? "";
    check(hit.includes(probe.label), tag(`searching the hint word "${probe.query}" finds ${probe.label} first`), hit);
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
  console.log(`  settings walk (${host} ${lang}): ${tally.set} rows set, ${tally.readBack} read back after a reload; not set: ${tally.skipped.length}`);
  for (const x of tally.skipped) console.log(`    · ${x}`);
  return tally;
}
