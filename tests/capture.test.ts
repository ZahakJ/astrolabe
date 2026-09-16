// Capture's text arithmetic (shared/capture.ts) and the manifest that puts
// the site in a phone's share sheet (shared/manifest.ts).

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendCaptured,
  bookmarklet,
  clipFileName,
  clipNote,
  isClippableUrl,
  splitSharedText,
  yamlQuote,
} from "../shared/capture.ts";
import { buildManifest, themeSwatch, DEFAULT_SWATCH, MANIFEST_ICON_PATH } from "../shared/manifest.ts";

describe("appendCaptured", () => {
  it("starts the section at the end of a note that has none", () => {
    assert.equal(appendCaptured("", "a thought", "09:15"), "## Captured\n\n- 09:15 a thought\n");
    assert.equal(appendCaptured("# Day\n\nprose\n", "x", "09:15"), "# Day\n\nprose\n\n## Captured\n\n- 09:15 x\n");
    // Frontmatter-only notes are a body too.
    assert.equal(appendCaptured("---\ntags: [d]\n---\n", "x", "09:15"), "---\ntags: [d]\n---\n\n## Captured\n\n- 09:15 x\n");
  });

  it("appends to an existing section and leaves the rest of the note alone", () => {
    const note = "# Day\n\n## Captured\n\n- 08:00 first\n\n## Later\n\nmore\n";
    assert.equal(appendCaptured(note, "second", "09:15"), "# Day\n\n## Captured\n\n- 08:00 first\n- 09:15 second\n\n## Later\n\nmore\n");
    // A `###` under it is inside the section; the item goes after it.
    const nested = "## Captured\n\n- a\n\n### sub\n\n- b\n";
    assert.equal(appendCaptured(nested, "c", "10:00"), "## Captured\n\n- a\n\n### sub\n\n- b\n- 10:00 c\n");
    // An empty section gets its blank line before the first item.
    assert.equal(appendCaptured("## Captured\n## Next\n", "x", "10:00"), "## Captured\n\n- 10:00 x\n## Next\n");
  });

  it("hangs a multi-line thought under its bullet and follows the note's line endings", () => {
    assert.equal(appendCaptured("## Captured\n\n- a\n", "one\ntwo\n\nthree", "10:00"), "## Captured\n\n- a\n- 10:00 one\n  two\n\n  three\n");
    assert.equal(appendCaptured("# D\r\n\r\n## Captured\r\n\r\n- a\r\n", "b", "10:00"), "# D\r\n\r\n## Captured\r\n\r\n- a\r\n- 10:00 b\r\n");
  });

  it("matches the heading loosely and the section end strictly", () => {
    assert.equal(appendCaptured("##   captured  \n- a\n", "b", "10:00"), "##   captured  \n- a\n- 10:00 b\n");
    // A `# Top` heading ends it too; a `####` does not.
    assert.equal(appendCaptured("## Captured\n- a\n# Top\n", "b", "10:00"), "## Captured\n- a\n- 10:00 b\n# Top\n");
  });
});

describe("clips", () => {
  it("names the file from the title, within what a filesystem and a wikilink allow", () => {
    assert.equal(clipFileName("A / B: the [best]? #1 | \"quoted\""), "A B the best 1 quoted.md");
    assert.equal(clipFileName("   "), "Clip.md");
    assert.equal(clipFileName("...dots..."), "dots.md");
    assert.equal(clipFileName("x".repeat(200)).length, 123);
    assert.equal(clipFileName("ctl\u0000char"), "ctl char.md");
    // A title that would spell a dotfile once its slashes are spaces: the
    // tree never lists a name that begins with a dot, so the clip must not.
    assert.equal(clipFileName("../../etc/passwd"), "etc passwd.md");
    assert.equal(clipFileName(". . hidden ."), "hidden.md");
    assert.equal(clipFileName(`${"a".repeat(119)} .`), `${"a".repeat(119)}.md`);
  });

  it("writes the source and the day as frontmatter, the title as the heading", () => {
    assert.equal(
      clipNote({ title: "  A  \"page\" ", url: "https://ex.org/a?b=c", date: "2026-09-15", body: "\nBody.\n" }),
      '---\nsource: "https://ex.org/a?b=c"\nclipped: 2026-09-15\n---\n\n# A "page"\n\nBody.\n',
    );
    assert.equal(clipNote({ title: "T", url: null, date: "2026-09-15", body: "" }), "---\nclipped: 2026-09-15\n---\n\n# T\n");
    // The page's own H1, when it is the title, is not printed twice.
    assert.equal(clipNote({ title: "Whole", url: null, date: "2026-09-15", body: "# whole\n\nBody." }), "---\nclipped: 2026-09-15\n---\n\n# Whole\n\nBody.\n");
    assert.equal(clipNote({ title: "Whole", url: null, date: "2026-09-15", body: "# Other\n\nBody." }), "---\nclipped: 2026-09-15\n---\n\n# Whole\n\n# Other\n\nBody.\n");
    assert.equal(yamlQuote('a "b" \\ c\nd'), '"a \\"b\\" \\\\ c d"');
  });

  it("finds the one address in what a phone shares", () => {
    assert.deepEqual(splitSharedText("https://ex.org/p"), { url: "https://ex.org/p", rest: "" });
    assert.deepEqual(splitSharedText("Great read: https://ex.org/p."), { url: "https://ex.org/p", rest: "Great read:" });
    assert.deepEqual(splitSharedText("just a thought"), { url: null, rest: "just a thought" });
    assert.equal(isClippableUrl("https://ex.org"), true);
    assert.equal(isClippableUrl("ftp://ex.org"), false);
    assert.equal(isClippableUrl("javascript:alert(1)"), false);
    assert.equal(isClippableUrl("not a url"), false);
  });
});

describe("the manifest", () => {
  it("names the site, colours it like its theme, and declares the share target", () => {
    const m = buildManifest({ name: "My Reading Room", lang: "ar", background: "#16130e", theme: "#c9a227" });
    assert.equal(m.name, "My Reading Room");
    assert.equal(m.short_name, "My Reading");
    assert.equal(m.dir, "rtl");
    assert.equal(m.lang, "ar");
    assert.equal(m.display, "standalone");
    assert.equal(m.background_color, "#16130e");
    assert.equal(m.theme_color, "#c9a227");
    assert.deepEqual(m.share_target, {
      action: "/api/clip",
      method: "POST",
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    });
    const icons = m.icons as { src: string }[];
    assert.equal(icons[icons.length - 1].src, MANIFEST_ICON_PATH);
    // A configured favicon goes first.
    const withIcon = buildManifest({ name: "X", lang: "en", background: "#000", theme: "#fff", icons: [{ src: "/favicon.ico", type: "image/png" }] });
    assert.equal((withIcon.icons as { src: string }[])[0].src, "/favicon.ico");
    assert.equal(buildManifest({ name: "  ", lang: "en", background: "#000", theme: "#fff" }).name, "Astrolabe");
  });

  it("reads a theme's swatch out of tokens.css and refuses what is not there", () => {
    const css = ":root {\n  --swatch-iron-gall-bg: #16130E;\n  --swatch-iron-gall-text: #eae2d0;\n  --swatch-iron-gall-accent: #c9a227;\n}";
    assert.deepEqual(themeSwatch(css, "iron-gall"), { bg: "#16130e", accent: "#c9a227" });
    assert.equal(themeSwatch(css, "void"), null);
    assert.equal(themeSwatch(css, "custom:mine"), null);
    assert.equal(themeSwatch(css, ".*"), null);
    assert.deepEqual(DEFAULT_SWATCH, { bg: "#16130e", accent: "#c9a227" });
  });
});

describe("the bookmarklet", () => {
  it("is one javascript: URL that carries the token, the origin and the words, and nothing unquoted", () => {
    const words = { clipped: "Clipped: {path}", failed: "Clip failed" };
    const url = bookmarklet("https://notes.example", "abc123", words);
    assert.ok(url.startsWith("javascript:"));
    assert.equal(url.includes("\n"), false);
    const src = decodeURIComponent(url.slice("javascript:".length));
    assert.ok(src.includes('"abc123"'));
    assert.ok(src.includes('"https://notes.example/api/clip"'));
    assert.ok(src.includes('"Clipped: {path}"'));
    // A word with a quote in it stays inside its string.
    const hostile = bookmarklet("https://x", "t", { clipped: 'say "hi"', failed: "it's" });
    const hostileSrc = decodeURIComponent(hostile.slice("javascript:".length));
    assert.ok(hostileSrc.includes('"say \\"hi\\""'));
    assert.ok(hostileSrc.includes('"it\'s"'));
    // And the source parses as JavaScript.
    assert.doesNotThrow(() => new Function(src));
  });
});
