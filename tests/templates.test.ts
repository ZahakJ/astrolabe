// Template placeholders (client/templates.ts): the two borrowed from the
// plugins a migrated vault's templates were written against — `{{cursor}}`
// and `{{prompt:Label}}` / `{{VALUE:Label}}` — beside the Obsidian set.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPlaceholders, applyTemplate, fillPrompts, templatePrompts, type TemplateVars } from "../client/templates.ts";

const vars: TemplateVars = {
  title: "heat equation",
  now: new Date(2026, 8, 15, 10, 5, 0),
  locale: "en",
  calendar: "gregorian",
  lang: "en",
};

describe("{{cursor}}", () => {
  it("is removed, and the caret offset into the insert is reported", () => {
    const applied = applyTemplate("# {{title}}\n\nHello {{cursor}}world\n", "", vars);
    assert.equal(applied.insert, "# heat equation\n\nHello world\n");
    assert.equal(applied.caret, "# heat equation\n\nHello ".length);
  });

  it("takes the first when a template names several, and removes them all", () => {
    const applied = applyTemplate("a{{cursor}}b{{ CURSOR }}c", "", vars);
    assert.equal(applied.insert, "abc");
    assert.equal(applied.caret, 1);
  });

  it("is null when the template names no place", () => {
    assert.equal(applyTemplate("plain body", "", vars).caret, null);
  });

  it("is measured after the line endings are settled", () => {
    // A CRLF note: the offset must count the \r the insert will carry.
    const applied = applyTemplate("one\ntwo {{cursor}}", "x\r\ny\r\n", vars);
    assert.equal(applied.insert, "one\r\ntwo ");
    assert.equal(applied.caret, "one\r\ntwo ".length);
  });

  it("leaves the frontmatter alone: a caret in the properties card is never asked for", () => {
    const applied = applyTemplate("---\ntitle: {{cursor}}\n---\nbody", "", vars);
    assert.ok(applied.content.includes("{{cursor}}"));
    assert.equal(applied.caret, null);
  });
});

describe("{{prompt:Label}} / {{VALUE:Label}}", () => {
  it("lists each distinct label once, in order of first appearance, either spelling", () => {
    const src = "Dear {{prompt:Name}}, re {{VALUE:Subject}} — {{ prompt : Name }} again, {{value}} and {{prompt:Where}}";
    assert.deepEqual(templatePrompts(src), ["Name", "Subject", "", "Where"]);
    assert.deepEqual(templatePrompts("no questions {{date}} {{title}}"), []);
  });

  it("writes the answers in and leaves an unanswered label as written", () => {
    const answers = new Map([["Name", "Ali"], ["", "bare"]]);
    assert.equal(fillPrompts("{{prompt:Name}} / {{VALUE}} / {{VALUE:Later}}", answers), "Ali / bare / {{VALUE:Later}}");
    // A blank answer is an answer: the token goes.
    assert.equal(fillPrompts("[{{prompt:Opt}}]", new Map([["Opt", ""]])), "[]");
  });

  it("is not filled by applyPlaceholders — the sheet answers, not the clock", () => {
    assert.equal(applyPlaceholders("{{prompt:Name}} {{date}}", vars), "{{prompt:Name}} 2026-09-15");
  });
});

describe("the Obsidian set, still", () => {
  it("fills date, time, title and the formats", () => {
    assert.equal(applyPlaceholders("{{date}} {{time}} {{title}} {{Title}}", vars), "2026-09-15 10:05 heat equation Heat Equation");
    assert.equal(applyPlaceholders("{{date:YYYY/MM/DD}} {{date:[on] D MMMM}}", vars), "2026/09/15 on 15 September");
    assert.equal(applyPlaceholders("{{time:HH:mm:ss}}", vars), "10:05:00");
  });

  it("leaves an unknown placeholder exactly as written", () => {
    assert.equal(applyPlaceholders("<% tp.file.title %> {{unknown}} {{", vars), "<% tp.file.title %> {{unknown}} {{");
  });
});
