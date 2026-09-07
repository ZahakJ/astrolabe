// Vite serves stylesheet imports as side-effect modules; give them a type so
// dynamic `import("...css")` (lazy KaTeX styles) typechecks.
declare module "*.css";

/** The build's package version, baked in by vite.config.ts `define`. */
declare const __APP_VERSION__: string;
