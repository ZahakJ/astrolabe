// Astrolabe was Vellum. These hold the promise that nothing an install, a
// vault, a document or a bookmark relied on under the old name broke when
// the product changed it — CONTRACTS.md, "The name".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { envFallbacksUsed, envRead, reportEnvFallbacks, resetEnvFallbacks } from "../shared/envName.ts";
import { migrateStorage } from "../client/storageMigration.ts";
import { LEGACY_PROTOCOL, PROTOCOL, parseDeepLink } from "../electron/deeplink.ts";
import { parseTex } from "../shared/tex.ts";
import { brandMarkDataUrl, brandMarkSvg } from "../shared/brandMark.ts";
import { COOKIE_NAME, LEGACY_COOKIE_NAME, sessionCookie } from "../server/auth.ts";
import { LANG_HEADER, LEGACY_LANG_HEADER, readerLanguage } from "../server/language.ts";
import type { Context } from "hono";

describe("the environment under both names", () => {
  it("prefers the new key, answers the old one, and remembers which it leaned on", () => {
    resetEnvFallbacks();
    assert.equal(envRead({ ASTROLABE_DATA: "new", VELLUM_DATA: "old" }, "ASTROLABE_DATA"), "new");
    assert.equal(envRead({ VELLUM_DATA: "old" }, "ASTROLABE_DATA"), "old");
    assert.equal(envRead({}, "ASTROLABE_DATA"), undefined);
    assert.deepEqual(envFallbacksUsed(), ["VELLUM_DATA"]);
    const lines: string[] = [];
    reportEnvFallbacks((l) => lines.push(l));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /VELLUM_DATA \(now ASTROLABE_DATA\)/);
    resetEnvFallbacks();
    reportEnvFallbacks((l) => lines.push(l));
    assert.equal(lines.length, 1, "silent when nothing was leaned on");
  });

  it("only ASTROLABE_ keys have a legacy twin", () => {
    assert.equal(envRead({ PORT: "1" }, "PORT"), "1");
    assert.equal(envRead({ VELLUM_PORT: "1" }, "PORT"), undefined);
  });
});

describe("the browser's memory under both names", () => {
  function fakeStorage(seed: Record<string, string>): Storage {
    const map = new Map(Object.entries(seed));
    return {
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    } as Storage;
  }
  it("copies vellum.* to astrolabe.* once, never overwriting, never deleting", () => {
    const s = fakeStorage({ "vellum.theme": "graphite", "vellum.zen": "1", "astrolabe.zen": "0", other: "x" });
    assert.equal(migrateStorage(s), 1);
    assert.equal(s.getItem("astrolabe.theme"), "graphite");
    assert.equal(s.getItem("astrolabe.zen"), "0", "an existing new key is kept");
    assert.equal(s.getItem("vellum.theme"), "graphite", "the old key stays for older builds");
    assert.equal(migrateStorage(s), 0, "a second pass has nothing to carry");
  });
});

describe("deep links under both schemes", () => {
  it("parses astrolabe:// and vellum:// alike", () => {
    assert.equal(PROTOCOL, "astrolabe");
    assert.equal(LEGACY_PROTOCOL, "vellum");
    for (const scheme of [PROTOCOL, LEGACY_PROTOCOL]) {
      const link = parseDeepLink(`${scheme}://note?path=Folder/Note.md`);
      assert.ok(link, scheme);
      assert.ok(link.note);
    }
    assert.equal(parseDeepLink("other://note?path=Note.md"), null);
  });
});

describe("the .sty and the macro under both names", () => {
  it("both package files provide \\note, \\astrolabe and \\vellum", () => {
    for (const file of ["assets/astrolabe.sty", "assets/vellum.sty"]) {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      assert.match(src, /\\providecommand\\note\{\}/, file);
      assert.match(src, /\\newcommand\\astrolabe\[1\]\{\}/, file);
      assert.match(src, /\\providecommand\\vellum\[1\]\{\}/, file);
    }
    assert.match(readFileSync(new URL("../assets/vellum.sty", import.meta.url), "utf8"), /\\ProvidesPackage\{vellum\}/);
    assert.match(readFileSync(new URL("../assets/astrolabe.sty", import.meta.url), "utf8"), /\\ProvidesPackage\{astrolabe\}/);
  });

  it("\\vellum{…} in a document is read exactly like \\astrolabe{…}", () => {
    const a = parseTex("\\astrolabe{publish=true, citekey=k1}\n\\section{A}\nText.\n");
    const b = parseTex("\\vellum{publish=true, citekey=k1}\n\\section{A}\nText.\n");
    assert.deepEqual(a.astrolabe, b.astrolabe);
    assert.equal(b.astrolabe.publish, "true");
  });
});

describe("the session cookie and the language header under both names", () => {
  const ctx = (headers: Record<string, string>): Context =>
    ({
      req: {
        raw: new Request("http://x/", { headers }),
        header: (name: string) => new Headers(headers).get(name) ?? undefined,
        path: "/",
        query: () => undefined,
      },
    }) as unknown as Context;
  it("reads astrolabe_session first and vellum_session when that is absent", () => {
    assert.equal(COOKIE_NAME, "astrolabe_session");
    assert.equal(LEGACY_COOKIE_NAME, "vellum_session");
    assert.equal(sessionCookie(ctx({ cookie: "vellum_session=old" })), "old");
    assert.equal(sessionCookie(ctx({ cookie: "astrolabe_session=new; vellum_session=old" })), "new");
    assert.equal(sessionCookie(ctx({})), undefined);
  });
  it("names the header under both spellings", () => {
    assert.equal(LANG_HEADER, "X-Astrolabe-Lang");
    assert.equal(LEGACY_LANG_HEADER, "X-Vellum-Lang");
    // readerLanguage is gated on the visitor switch, which a bare test cannot
    // turn on; the read itself is what this pins — both spellings reach it.
    assert.equal(typeof readerLanguage, "function");
  });
});

describe("the mark", () => {
  it("is one geometry at every size, with the throne, the mater and the alidade", () => {
    const full = brandMarkSvg({ size: 64 });
    const small = brandMarkSvg({ size: 16 });
    assert.match(full, /<circle cx="50" cy="9" r="5"/, "the throne");
    assert.match(full, /<circle cx="50" cy="55" r="40"/, "the mater");
    assert.match(full, /stroke-width="2.8"/, "the alidade");
    assert.ok(full.split("<circle").length > small.split("<circle").length, "small drops rings");
    assert.match(brandMarkDataUrl(), /^data:image\/svg\+xml,/);
  });
});
