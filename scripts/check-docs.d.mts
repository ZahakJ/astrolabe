// Types for the docs gate's one export, read by tests/docs.test.ts under the
// strict `npm run typecheck`. The gate itself is plain JavaScript.

export interface DocsReport {
  /** Every finding, as `file: what`; empty when the manual is true and linked. */
  errors: string[];
  files: number;
  pages: number;
}

export function checkDocs(): DocsReport;
