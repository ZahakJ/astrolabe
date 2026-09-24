// The evening reflection (shared/reflection.ts): "How did the day go?"
// appends under `## Reflection` in the day's note — and never a second heading.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appendReflection, EVENING_HOUR, isEvening, reflectionOf } from "../shared/reflection.ts";

describe("appending the reflection", () => {
  it("adds the heading at the end of a note that has none", () => {
    assert.equal(appendReflection("# Tuesday\n\nSome words.\n", "A good day."), "# Tuesday\n\nSome words.\n\n## Reflection\n\nA good day.\n");
  });

  it("writes into a template's empty section instead of adding a second heading", () => {
    const template = "# Tuesday\n\n## Reflection\n\n## Tomorrow\n\n- [ ] call\n";
    const out = appendReflection(template, "Slow, then good.");
    assert.equal(out, "# Tuesday\n\n## Reflection\n\nSlow, then good.\n\n## Tomorrow\n\n- [ ] call\n");
    assert.equal(out.match(/## Reflection/g)?.length, 1);
  });

  it("is idempotent in its heading: a second evening's line joins the first", () => {
    const once = appendReflection("# Tuesday\n", "First.");
    const twice = appendReflection(once, "Second.");
    assert.equal(twice, "# Tuesday\n\n## Reflection\n\nFirst.\n\nSecond.\n");
    assert.equal(twice.match(/## Reflection/g)?.length, 1);
  });

  it("finds the heading however it is cased, and leaves a `###` under it inside the section", () => {
    const note = "## reflection\n\n### morning\nearly\n\n## Next\n";
    assert.equal(appendReflection(note, "Late."), "## reflection\n\n### morning\nearly\n\nLate.\n\n## Next\n");
  });

  it("gives a heading that followed the section straight away its blank line back", () => {
    assert.equal(appendReflection("## Reflection\n## Next\n", "Ok."), "## Reflection\n\nOk.\n\n## Next\n");
  });

  it("does not take a heading inside a code fence for the section", () => {
    const note = "```\n## Reflection\n```\n";
    assert.equal(appendReflection(note, "Real."), "```\n## Reflection\n```\n\n## Reflection\n\nReal.\n");
  });

  it("keeps the note's own line endings and the text's own lines", () => {
    assert.equal(appendReflection("# Day\r\n", "one\ntwo"), "# Day\r\n\r\n## Reflection\r\n\r\none\r\ntwo\r\n");
  });

  it("writes nothing for an empty answer", () => {
    assert.equal(appendReflection("# Day\n", "   \n"), "# Day\n");
  });

  it("starts an empty note with the section alone", () => {
    assert.equal(appendReflection("", "Fine."), "## Reflection\n\nFine.\n");
  });
});

describe("reading the reflection back", () => {
  it("is null with no heading, empty under a template's heading, and the text once written", () => {
    assert.equal(reflectionOf("# Day\n"), null);
    assert.equal(reflectionOf("## Reflection\n\n## Next\n"), "");
    assert.equal(reflectionOf(appendReflection("# Day\n", "Good.")), "Good.");
  });
});

describe("the evening", () => {
  it("begins at six", () => {
    assert.equal(EVENING_HOUR, 18);
    assert.equal(isEvening(new Date(2026, 8, 23, 17, 59)), false);
    assert.equal(isEvening(new Date(2026, 8, 23, 18, 0)), true);
    assert.equal(isEvening(new Date(2026, 8, 23, 23, 59)), true);
  });
});
