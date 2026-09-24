// The import graph, read off the syntax tree — what the split tests assert on.
//
// A split is a move: a big module's body goes into files of its own and the
// module keeps its name and its exports, so not one importer changes. That
// claim has two halves a compiler only half checks. `tsc` proves every name an
// importer asks for still exists; it does not notice a part that exports more
// than anybody takes (a surface that grew in the move), nor an importer outside
// the family reaching past the facade into a part (a seam that stopped being
// one). `surfaceOf()` answers both from the source text alone: no build, no
// browser, no module is executed.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const SCANNED = ["client", "server", "shared", "tests", "electron", "mobile/src", "build", "scripts"];
const SKIP_DIRS = new Set(["node_modules", "dist", "fixtures"]);

function walk(dir: string, out: string[]): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !name.endsWith(".d.ts")) out.push(abs);
  }
}

let files: string[] | null = null;
function sourceFiles(): string[] {
  if (files) return files;
  files = [];
  for (const dir of SCANNED) walk(path.join(ROOT, dir), files);
  return files;
}

interface Edge {
  /** Repo-relative path of the importing file. */
  from: string;
  /** Repo-relative path of the imported module. */
  to: string;
  /** The names taken (`*` for a namespace or a star re-export, `default`). */
  names: string[];
  /** A re-export (`export { x } from`), not a use. */
  reexport: boolean;
}

interface Parsed {
  edges: Edge[];
  exports: Set<string>;
}

const cache = new Map<string, Parsed>();

function rel(abs: string): string {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

function parse(abs: string): Parsed {
  const hit = cache.get(abs);
  if (hit) return hit;
  const text = readFileSync(abs, "utf8");
  const kind = abs.endsWith(".tsx") ? ts.ScriptKind.TSX : abs.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, kind);
  const edges: Edge[] = [];
  const exports = new Set<string>();
  const target = (spec: string): string | null =>
    spec.startsWith(".") ? rel(path.resolve(path.dirname(abs), spec)) : null;
  const visitDynamic = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const to = target(node.arguments[0].text);
      if (to) edges.push({ from: rel(abs), to, names: ["*"], reexport: false });
    }
    ts.forEachChild(node, visitDynamic);
  };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const to = target(st.moduleSpecifier.text);
      if (!to) continue;
      const names: string[] = [];
      const clause = st.importClause;
      if (clause?.name) names.push("default");
      const nb = clause?.namedBindings;
      if (nb && ts.isNamespaceImport(nb)) names.push("*");
      if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) names.push((el.propertyName ?? el.name).text);
      edges.push({ from: rel(abs), to, names, reexport: false });
      continue;
    }
    if (ts.isExportDeclaration(st)) {
      const spec = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
      const to = spec ? target(spec) : null;
      if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        const names: string[] = [];
        for (const el of st.exportClause.elements) {
          exports.add(el.name.text);
          names.push((el.propertyName ?? el.name).text);
        }
        if (to) edges.push({ from: rel(abs), to, names, reexport: true });
      } else if (to) {
        edges.push({ from: rel(abs), to, names: ["*"], reexport: true });
      }
      continue;
    }
    const mods = ts.canHaveModifiers(st) ? (ts.getModifiers(st) ?? []) : [];
    if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) exports.add("default");
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) exports.add(d.name.text);
    } else if (
      (ts.isFunctionDeclaration(st) ||
        ts.isClassDeclaration(st) ||
        ts.isInterfaceDeclaration(st) ||
        ts.isTypeAliasDeclaration(st) ||
        ts.isEnumDeclaration(st)) &&
      st.name
    ) {
      exports.add(st.name.text);
    }
  }
  visitDynamic(sf);
  const out = { edges, exports };
  cache.set(abs, out);
  return out;
}

/** Every edge in the scanned tree that lands on `module` (repo-relative). */
export function importsOf(module: string): Edge[] {
  const out: Edge[] = [];
  for (const abs of sourceFiles()) for (const e of parse(abs).edges) if (e.to === module) out.push(e);
  return out;
}

/** What `module` exports by name (its own declarations and its re-exports). */
export function exportsOf(module: string): Set<string> {
  return parse(path.join(ROOT, module)).exports;
}

export interface Surface {
  /** Names some importer asks the facade for that it does not export. */
  missing: string[];
  /** A part's exports that nobody in the family imports — surface that grew. */
  unused: { part: string; name: string }[];
  /** Files outside the family that import a part directly. */
  strays: { from: string; part: string }[];
}

/**
 * The family is a facade (the module that kept its name) and its parts (the
 * files its body moved into). `outside` names extra importers a part may have
 * on purpose (a lazy boundary, say), which are then family too.
 */
export function surfaceOf(facade: string, parts: string[], outside: string[] = []): Surface {
  const family = new Set([facade, ...parts, ...outside]);
  const facadeExports = exportsOf(facade);
  const missing: string[] = [];
  for (const e of importsOf(facade)) {
    for (const n of e.names) if (n !== "*" && !facadeExports.has(n)) missing.push(`${e.from}: ${n}`);
  }
  const unused: { part: string; name: string }[] = [];
  const strays: { from: string; part: string }[] = [];
  for (const part of parts) {
    const taken = new Set<string>();
    let star = false;
    for (const e of importsOf(part)) {
      if (!family.has(e.from)) strays.push({ from: e.from, part });
      for (const n of e.names) (n === "*" ? (star = true) : taken.add(n));
    }
    if (star) continue;
    for (const name of exportsOf(part)) if (!taken.has(name)) unused.push({ part, name });
  }
  return { missing, unused, strays };
}
