// French auto-correction gate: the editor, driven by a keyboard.
//
//   node scripts/check-french.mjs [url]
//   env: CHROMIUM=/usr/bin/chromium  ASTROLABE_PASSWORD=…
//
// tests/french.test.ts proves the table and the planners; this proves the
// EDITOR does what they plan, at the keystroke, in a real Chromium — because
// the whole feature is a second transaction dispatched off a microtask after
// the one that typed the space, and only a browser can say whether that lands
// as one undo step with the space left standing. Every case the feature
// promises is typed here, in the order the docs list them:
//
//   · "Je suis tres " → "très"; "Elle a un coeur " → "cœur"; Enter counts
//   · "This is tres chic " is NOT corrected (one French word in an English
//     line — the mixed-line rule, documented in docs/editor.md); nor is an
//     English line whose only French is `EST` and `UN` in capitals, nor a
//     Spanish line that shares `la`, `de`, `un` with French
//   · a closing bracket closeBrackets had already placed, stepped over, is a
//     boundary too: "(tres)" is corrected
//   · the word that tips a line into French brings the words before it:
//     "Tres bien, c'est" → "Très bien, c'est" at the apostrophe
//   · a line inside a code fence is never corrected
//   · Ctrl+Z after a correction gives "tres " back, space included, and the
//     same word at the same spot is not corrected again
//   · the device switch off disables it
//   · the French line's `.cm-line` carries lang="fr"; the English one carries
//     no lang; an Arabic line keeps lang="ar"
//   · the typography: "Vraiment ?" narrows its space, "Alors..." → "Alors…",
//     and an English "And then..." is left alone
//   · with vim keys on, a correction happens in insert mode
//
// Same session model as check-caret.mjs: one context, the login through the
// page so the cookie sticks, the fixture written through the API and deleted
// on the way out.

import { chromium } from "playwright";

const [url = "http://localhost:6801"] = process.argv.slice(2);
const NOTE = "french-gate.md";
const NNBSP = String.fromCharCode(0x202f);

const FIXTURE = `# French gate

\`\`\`js
const code =
\`\`\`

الحمد لله رب العالمين

`;

const fail = [];
const check = (ok, label, detail = "") => {
  if (!ok) fail.push(`${label} ${detail}`);
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};
const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
// The what's-new deck and the prefs pull would both get in front of the editor.
await context.addInitScript(() => {
  localStorage.setItem("astrolabe.whatsnewSeen", "9.9.9");
  localStorage.setItem("astrolabe.prefs-sync-off", "1");
});
const apiPage = await context.newPage();
await apiPage.goto(url, { waitUntil: "load" });

const api = (path, init) =>
  apiPage.evaluate(
    async ([p, i]) => {
      const r = await fetch(p, i ?? undefined);
      const text = await r.text();
      let body = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* text */
      }
      return { status: r.status, body };
    },
    [path, init ?? null],
  );

// CodeMirror's own handle on the view, read off `.cm-content` — no test hook.
const VIEW = `(() => { const c = document.querySelector(".cm-content"); const t = c && c.cmTile; return t && t.root && t.root.view; })()`;

let wrote = false;
const restore = async () => {
  if (wrote) {
    await api(`/api/note?path=${encodeURIComponent(NOTE)}&permanent=true`, { method: "DELETE" }).catch(() => {});
  }
  await browser.close().catch(() => {});
};

try {
  const me = (await api("/api/me")).body;
  if (!me.admin) {
    const password = process.env.ASTROLABE_PASSWORD ?? "";
    if (!password) {
      console.error("check-french: not an admin session; set ASTROLABE_PASSWORD.");
      await restore();
      process.exit(2);
    }
    const res = await api("/api/login", json("POST", { password }));
    if (res.status !== 200) {
      console.error(`check-french: login failed (${res.status}).`);
      await restore();
      process.exit(2);
    }
  }
  const w = await api(`/api/note?path=${encodeURIComponent(NOTE)}`, json("PUT", { content: FIXTURE }));
  if (w.status !== 200) {
    console.error(`check-french: could not write ${NOTE} (${w.status}).`);
    await restore();
    process.exit(2);
  }
  wrote = true;

  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
  await page.goto(`${url}/${NOTE.replace(/\.md$/, "")}`, { waitUntil: "load" });
  await page.waitForSelector(".cm-content", { timeout: 25000 });
  await page.waitForTimeout(800);

  /** Put the caret at the end of the document, focused. */
  const toEnd = () =>
    page.evaluate(`(() => { const v = ${VIEW}; v.focus(); v.dispatch({ selection: { anchor: v.state.doc.length } }); })()`);
  /** Put the caret at the end of the first line containing `needle`. */
  const toLineEnd = (needle) =>
    page.evaluate(
      `((needle) => { const v = ${VIEW}; v.focus(); for (let n = 1; n <= v.state.doc.lines; n++) { const l = v.state.doc.line(n); if (l.text.includes(needle)) { v.dispatch({ selection: { anchor: l.to } }); return; } } throw new Error("no line " + needle); })(${JSON.stringify(needle)})`,
    );
  /** The text of the first line containing `needle`. */
  const lineOf = (needle) =>
    page.evaluate(
      `((needle) => { const v = ${VIEW}; for (let n = 1; n <= v.state.doc.lines; n++) { const l = v.state.doc.line(n); if (l.text.includes(needle)) return l.text; } return null; })(${JSON.stringify(needle)})`,
    );
  /** The last line, or the one `up` lines above it. */
  const lastLine = (up = 0) =>
    page.evaluate(`(() => { const v = ${VIEW}; return v.state.doc.line(v.state.doc.lines - ${up}).text; })()`);
  const type = async (text) => {
    await page.keyboard.type(text, { delay: 8 });
    await page.waitForTimeout(60);
  };
  const enter = async () => {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(60);
  };
  const setPref = (on) =>
    page.evaluate((v) => localStorage.setItem("astrolabe.frenchAutocorrect", v), on ? "on" : "off");

  // ── The corrections ────────────────────────────────────────────────────
  await toEnd();
  await type("Je suis tres ");
  check((await lastLine()) === "Je suis très ", "tres → très at the space", JSON.stringify(await lastLine()));
  await type("content");
  await enter();
  await type("Elle a un coeur ");
  check((await lastLine()) === "Elle a un cœur ", "coeur → cœur", JSON.stringify(await lastLine()));
  await enter();
  await type("This is tres chic ");
  check((await lastLine()) === "This is tres chic ", "an English line with one French word is left alone", JSON.stringify(await lastLine()));
  await enter();
  await type("Elle a un coeur");
  await enter();
  check((await lastLine(1)) === "Elle a un cœur", "Enter is a boundary too", JSON.stringify(await lastLine(1)));

  await enter();
  await type("Meeting at 5pm EST with the UN about the hotel ");
  check((await lastLine()) === "Meeting at 5pm EST with the UN about the hotel ", "capitals do not make an English line French", JSON.stringify(await lastLine()));
  await enter();
  await type("la casa de mi madre es un hotel ");
  check((await lastLine()) === "la casa de mi madre es un hotel ", "a Spanish line is not French", JSON.stringify(await lastLine()));

  // ── A stepped-over closing bracket is a boundary ───────────────────────
  await enter();
  await type("Je suis (tres");
  await type(")");
  await type(" ");
  check((await lastLine()) === "Je suis (très) ", "a closing bracket stepped over finishes the word", JSON.stringify(await lastLine()));

  // ── The tipping word brings the words before it ────────────────────────
  await enter();
  await type("Tres bien, c'est deja fait ");
  check((await lastLine()) === "Très bien, c'est déjà fait ", "a line corrected whole when it becomes French", JSON.stringify(await lastLine()));
  await enter();
  await type("Tres `etat` et [[etat]] alors je ");
  check((await lastLine()) === "Très `etat` et [[etat]] alors je ", "…but not its code spans or link targets", JSON.stringify(await lastLine()));
  await enter();

  // ── Not in a code fence ────────────────────────────────────────────────
  await toLineEnd("const code =");
  await type(" je suis tres ");
  check((await lineOf("const code")) === "const code = je suis tres ", "a code fence line is never corrected", JSON.stringify(await lineOf("const code")));

  // ── Undo: one step, the space stays, the refusal is remembered ─────────
  await toEnd();
  await type("Je suis tres ");
  check((await lastLine()) === "Je suis très ", "a correction to undo", JSON.stringify(await lastLine()));
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(60);
  check((await lastLine()) === "Je suis tres ", "Ctrl+Z restores 'tres' and keeps the space", JSON.stringify(await lastLine()));
  // Retype the space: the same word at the same spot is not corrected again.
  await page.keyboard.press("Backspace");
  await type(" ");
  check((await lastLine()) === "Je suis tres ", "a refused correction is not re-applied", JSON.stringify(await lastLine()));

  // ── The switch ─────────────────────────────────────────────────────────
  await setPref(false);
  await enter();
  await type("Je suis tres ");
  check((await lastLine()) === "Je suis tres ", "the setting off disables it", JSON.stringify(await lastLine()));
  await setPref(true);
  await enter();
  await type("Je suis tres ");
  check((await lastLine()) === "Je suis très ", "…and on again enables it", JSON.stringify(await lastLine()));

  // ── Typography ─────────────────────────────────────────────────────────
  await enter();
  await type("Vraiment, je suis ?");
  check((await lastLine()) === `Vraiment, je suis${NNBSP}?`, "a space before ? becomes a narrow no-break space", JSON.stringify(await lastLine()));
  await enter();
  await type("Alors je pense...");
  check((await lastLine()) === "Alors je pense…", "three dots become an ellipsis on a French line", JSON.stringify(await lastLine()));
  await enter();
  await type("And then...");
  check((await lastLine()) === "And then...", "…but not on an English line", JSON.stringify(await lastLine()));

  // ── lang on the line ───────────────────────────────────────────────────
  // Park the caret on a line of its own first: live preview reveals the
  // caret's line, and the attribute is read off rendered `.cm-line`s.
  await enter();
  await page.waitForTimeout(200);
  const langs = await page.evaluate(() => {
    const out = { french: "unset", english: "unset", arabic: "unset" };
    for (const el of document.querySelectorAll(".cm-line")) {
      const t = el.textContent ?? "";
      if (t.startsWith("Je suis très content")) out.french = el.getAttribute("lang");
      if (t.startsWith("This is tres chic")) out.english = el.getAttribute("lang");
      if (t.startsWith("الحمد")) out.arabic = el.getAttribute("lang");
    }
    return out;
  });
  check(langs.french === "fr", "the French line carries lang=fr", JSON.stringify(langs));
  check(langs.english === null, "the English line carries no lang", JSON.stringify(langs));
  check(langs.arabic === "ar", "the Arabic line still carries lang=ar", JSON.stringify(langs));

  // ── Vim: insert mode only ──────────────────────────────────────────────
  await page.evaluate(() => localStorage.setItem("astrolabe.vim", "true"));
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector(".cm-content", { timeout: 25000 });
  await page.waitForTimeout(1500);
  await toEnd();
  // Normal mode: `o` opens a line below and enters insert; type, then Esc.
  await page.keyboard.press("o");
  await page.waitForTimeout(100);
  await type("Je suis tres ");
  check((await lastLine()) === "Je suis très ", "vim insert mode corrects", JSON.stringify(await lastLine()));
  await page.keyboard.press("Escape");
  await page.evaluate(() => localStorage.setItem("astrolabe.vim", "false"));
} finally {
  await restore();
}

console.log(fail.length === 0 ? "\ncheck-french: OK" : `\ncheck-french: ${fail.length} FAILED`);
for (const f of fail) console.log(`  · ${f}`);
process.exit(fail.length === 0 ? 0 : 1);
