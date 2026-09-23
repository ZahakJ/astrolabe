// GATE: the phone shell and the desktop shell stay two shells.
//
//   node scripts/check-shell-seam.mjs
//
// The rules and why they exist are in scripts/shell-seam.mjs.

import { fileURLToPath } from "node:url";
import { seamViolations } from "./shell-seam.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const errs = seamViolations(root);
for (const e of errs) console.error(`  FAIL  ${e}`);
console.log(errs.length === 0 ? "check-shell-seam: the two shells share no chrome" : `check-shell-seam: ${errs.length} violation(s)`);
process.exit(errs.length === 0 ? 0 : 1);
