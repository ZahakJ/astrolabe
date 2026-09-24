// Types for scripts/i18nScan.mjs, so tests/i18nScan.test.ts can import it.
export interface CopyFinding {
  line: number;
  kind: string;
  text: string;
}
export interface ShellEntry {
  text: string;
  holes: string[];
}
export const COPY_ATTRS: ReadonlySet<string>;
export const PROPER: ReadonlySet<string>;
export const DOM_PROPS: ReadonlySet<string>;
export function copyWords(text: string): string[];
export function scanTsx(source: string, fileName?: string): CopyFinding[];
export function scanDom(source: string, fileName?: string, options?: { shell?: boolean }): CopyFinding[];
export function readShellDictionary(source: string): { en: Map<string, ShellEntry | null>; ar: Map<string, ShellEntry | null> };
