// A numeric frontmatter id is a creation stamp (shared/idStamp.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { idStampMs } from "../shared/idStamp.ts";

const NOW = Date.UTC(2026, 8, 7);

test("a 16-digit template id is thirteen digits of milliseconds", () => {
  // The owner's note: minted 2026-08-24T05:36:11.296Z, three digits of noise.
  assert.equal(idStampMs("1787537771296148", NOW), 1787537771296);
  assert.equal(idStampMs(1787537771296148, NOW), 1787537771296);
});

test("thirteen digits are milliseconds, ten are seconds", () => {
  assert.equal(idStampMs("1788069380124", NOW), 1788069380124);
  assert.equal(idStampMs("1788069380", NOW), 1788069380000);
});

test("anything that is not plainly a stamp is not a date", () => {
  assert.equal(idStampMs("abc123", NOW), null);
  assert.equal(idStampMs("42", NOW), null);
  assert.equal(idStampMs("3f2a9c1e-0b7d-4e21-9a55-1c2d3e4f5a6b", NOW), null);
  assert.equal(idStampMs("", NOW), null);
  assert.equal(idStampMs(undefined, NOW), null);
  // Eleven or twelve digits are no resolution anyone mints.
  assert.equal(idStampMs("17880693801", NOW), null);
  // Before 2000, or after tomorrow: a serial number that happens to be long.
  assert.equal(idStampMs("0946684799999", NOW), null);
  assert.equal(idStampMs(String(NOW + 3 * 24 * 60 * 60 * 1000), NOW), null);
});
