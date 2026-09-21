import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";

/**
 * The shell's build. It produces `www/`, which `cap sync` copies into the APK's
 * assets — the only web content this app ships. Everything else it renders is
 * the owner's own server, fetched at run time.
 *
 * `base: ""` because those assets are loaded from `https://localhost/` inside a
 * WebView: an absolute `/assets/...` would resolve, but a relative one survives
 * being loaded from anywhere, and this bundle has no router to disagree with.
 *
 * No code splitting and no hashed chunk graph: it is four modules and one
 * stylesheet, and a single file is one fewer thing the WebView asks the local
 * server for before the first paint.
 */
export default defineConfig(({ mode }) => ({
  root: "src",
  base: "",
  // TWO BUILD-TIME CONSTANTS, AND WHY THEY ARE CONSTANTS.
  //
  // `__GITHUB_CLIENT_ID__` is the OAuth App the pocket vault signs in through.
  // It is PUBLIC by design — the device flow has no client secret, which is
  // exactly why it is the flow a phone can use — and it belongs to whoever
  // built this APK, so it is read from the environment (`mobile/.env`, or
  // `ASTROLABE_GITHUB_CLIENT_ID` in the build's env) rather than checked in.
  // A build without one still compiles; the third door then says so instead
  // of failing at the first request (src/pocket/door.ts).
  //
  // `__POCKET_VERSION__` is what `/api/me` reports to the web client, which
  // compares it with its own build to notice a deploy. Read from
  // package.json, never pinned here — a version pinned in two files is a
  // version that ships wrong from one of them.
  define: {
    __GITHUB_CLIENT_ID__: JSON.stringify(
      loadEnv(mode, new URL(".", import.meta.url).pathname, "").ASTROLABE_GITHUB_CLIENT_ID ?? "",
    ),
    __POCKET_VERSION__: JSON.stringify(
      JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version,
    ),
  },
  build: {
    outDir: "../www",
    emptyOutDir: true,
    // A WebView shipped in the APK — its floor is whatever Capacitor's own
    // minSdk (24) can run, and every Chrome that reaches is well past es2020.
    target: "es2020",
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // SPLIT since 3.22, having been inlined for a reason that stopped
        // being true. The reason was Capacitor's `registerPlugin`, which
        // reaches for its web fallbacks through dynamic imports a phone never
        // takes: splitting those bought a round trip and saved nothing, so the
        // whole shell was one file.
        //
        // The pocket vault changed the arithmetic. Its door carries
        // isomorphic-git, a filesystem and a search index — about 380 kB — and
        // the screen this app opens with is a text field and a button.
        // Inlined, every launch parsed the clone machinery in order to draw a
        // form. So the door is behind an `import()` (src/connect.ts) and the
        // fallbacks may split alongside it; the "round trip" they cost is to a
        // file inside the APK.
        entryFileNames: "assets/shell.js",
        chunkFileNames: "assets/shell-[name]-[hash].js",
        assetFileNames: "assets/shell.[ext]",
      },
    },
  },
}));
