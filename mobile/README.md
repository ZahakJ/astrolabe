# Astrolabe for Android

A native APK that opens **your** vault — the one your own Astrolabe server serves,
or (since 3.22) one that lives in a private GitHub repository and is cloned into
the app.

The app has two screens of its own — a connection screen and a capture sheet —
and after the first of those it hands the whole display to the reading room:
your instance, signed in with its own session cookie, or the web client running
over the clone. Everything you know about Astrolabe on a laptop is the same here,
because it *is* the same: the responsive web client already handles coarse
pointers, 44px targets, drawers and RTL, and this ships none of it twice.

```
mobile/
  src/            the two screens — TypeScript, no framework, ~30 kB entry
  src/pocket/     the GitHub-backed vault: the clone, the sync, and an
                  in-page implementation of the `/api/*` the client speaks
  android/        the Capacitor shell: six Java classes and the resources
  icons/          make-icons.mjs — the ✦ mark, rendered to every raster
  scripts/        build-apk.mjs — one command to a signed APK
                  build-pocket.mjs — the client's build into www/, for the pocket
  www/            what ships in the APK's assets (gitignored)
  out/            finished APKs (gitignored)
```

---

## The architecture decision

**With a server, the phone is a client of it. Without one, the vault is a
repository and the phone is the only writer with a screen.**

### The first shape: a client of the server

Astrolabe's server owns the vault and already does git backup and sync server-side
(`server/gitSync.ts`). So through the first door the phone holds no vault, no
repository and no working copy. It reads and writes through the same HTTP API
the web client uses, over the same session cookie, and every conflict question
has the same answer it has always had — the one the server gives.

Two other shapes were considered and rejected at the time:

**On-device git via `isomorphic-git`.** A real vault clone on the phone, editing
offline, pushing later. Rejected because of what it does *next to a live
server*: the same vault would then have two writers with independent histories,
one of which spends most of its life asleep in a pocket. A week-old phone clone
that wakes up and pushes is a merge conflict inside somebody's prose, resolved
by a phone, at the worst possible moment. Astrolabe's own write path already refuses
stale saves with a precondition (`baseMtimeMs`) precisely because silent
divergence is the failure it will not accept; shipping a second full history
would have been that failure with a bow on it.

**`nodejs-mobile` — run the actual server on the phone.** Rejected on a fact,
not a preference: Astrolabe's `package.json` sets `engines.node >= 24`, and it means
it — unflagged TypeScript execution, `node:sqlite`, `--env-file-if-exists`. The
`nodejs-mobile` runtimes are years behind that, and the app would have needed a
fork of the server that is allowed to be older than the server. One vault, one
server, one version.

### The third shape (3.22): a vault from GitHub

`src/pocket/` is on-device git, and it is **not** the rejected shape. Read the
rejection again: every word of it is about a clone *next to a live server*. The
pocket vault has no server beside it at all. The repository is the vault, the
phone is one working copy of it, and the only other writer is the owner's own
laptop through git — which is the arrangement every person who keeps notes in a
repository already lives with, and the arrangement git was built for.

The second rejection stands untouched: no server runs on the phone. What runs
is `src/pocket/server.ts`, an in-page implementation of the subset of `/api/*`
the web client needs to read, write, navigate and search a vault. It computes
nothing of its own — the parsing, folding, scanning, stripping, the frontmatter
writer and the SRS schedule all come from `shared/`, which is where the
server's own copies now live (`shared/noteParse.ts`, `shared/prose.ts`,
`shared/snippet.ts`, `shared/frontmatterEdit.ts`). A second implementation of
"what does this note say" is a vault that disagrees with itself about its own
contents depending on which machine opened it.

And the precondition is the same precondition. A save carries `baseMtimeMs` and
a stale one is refused `409 code:"stale"`, exactly as the server refuses it.
Where the two histories genuinely diverge, **the phone does not merge prose**:
the remote's version keeps its name, the phone's is set down beside it as
`<Note> (phone).md`, both are committed and pushed, and the shell's sync line
names the pair until the owner has dealt with it (`src/pocket/conflict.ts`).
That is the same refusal to lose writing that `baseMtimeMs` is, one level up.

What the two doors leave is a shell, and a shell has one interesting decision in it:

**The one host it may open is chosen at run time, so the gate is at run time
too.** Capacitor's `server.allowNavigation` is a build-time list; for an app
whose server is whatever its owner typed, the only value that would work there is
`"*"`, which is the same as no gate. Instead the shell leaves that setting off
entirely and implements `AstrolabePlugin.shouldOverrideLoad` — the hook Capacitor
consults before every navigation. It says yes to exactly one scheme + host +
port, the one that was verified and saved, and lets Capacitor's default (open it
in the browser) have every other link in your notes.

### How the pieces fit

| Piece | Where | What it does |
| --- | --- | --- |
| Connection screen | `src/connect.ts` | Takes an address, verifies it with `GET /api/me`, remembers it, hands over the WebView — and offers the third door |
| Capture sheet | `src/capture.ts` | "Share to Astrolabe" from any app → a bullet in `Inbox/YYYY-MM-DD.md` |
| The GitHub door | `src/pocket/door.ts` | The device flow, the repository list, the branch, the clone |
| The pocket server | `src/pocket/server.ts` | `/api/*`, answered in the page, over the clone |
| The seam | `src/pocket/boot.ts`, `src/pocket/sw.ts` | A `fetch` patch for the client's calls; a worker for `<img src="/api/file?…">`, ranges and `EventSource` |
| The repository | `src/pocket/git.ts` | Shallow clone, fast-forward pull, the conflict rule, push |
| `AstrolabePlugin` | `android/…/AstrolabePlugin.java` | The navigation gate, the share Intent, the trusted-host store, one git request |
| `GitTransport` | `android/…/GitTransport.java` | One HTTP request, binary both ways — github.com ships no CORS and a packfile is not a string |
| `MainActivity` | `android/…/MainActivity.java` | Back = history back; leaves only from the connection screen |
| `ShareActivity` | `android/…/ShareActivity.java` | The share target, in its own task so a capture never costs you your place |
| `SystemBarInsets` | `android/…/SystemBarInsets.java` | Keeps the status bar and the gesture bar off the page, on both activities |

**Which page is at `/`.** From 3.22 the page at the app's root is the web
client's own `index.html`, with its entry module swapped for
`src/pocket/boot.ts` at build time, and the shell's two screens moved to
`/shell.html`. That is not tidiness: the client routes on the PATHNAME
(`/graph`, `/Ideas/Note` — client/router.ts), so served anywhere but the root
it rewrites its own address on the first paint and a reload lands somewhere
else. The bootstrap at `/` decides in its first tick which of the three things
the APK can show is showing — a capture sheet, the connection screen, the
pocket vault — and a launch that is not a pocket vault is at `/shell.html`
before a byte of the client is imported, behind the splash, so nothing flashes.

**Why every network call goes through `CapacitorHttp` and not `fetch`.** The
connection screen is served from `https://localhost`; your vault is on your own
host. That is cross-origin, and Astrolabe's server ships no CORS headers — correctly,
since its API is not for other people's pages. `CapacitorHttp` performs the
request natively, so there is no preflight to fail, and Capacitor installs its
cookie manager over the WebView's own store, so the `astrolabe_session` cookie your
instance set when you signed in rides along on the capture sheet's write.

**Why the shell pads for the system bars instead of letting the page do it.**
Android 15 draws every window edge to edge, and Android 16 does it whether the
app asked or not: the status bar and the gesture bar become glass over the top
and bottom of the WebView. Capacitor 8 ships a handler for this, and it decides
between padding the WebView's container and passing the insets to the page as
`env(safe-area-inset-*)` on two facts — the WebView's major version, and whether
the loaded page declared `viewport-fit=cover`. This app cannot answer either
one. Nearly every page it shows belongs to your instance, on your origin, and
Capacitor only injects the script that reads that second fact into *its own*
origin — so on your vault the flag is a leftover reading from the connection
screen, and a phone with a current WebView hands the insets to CSS that was
never told about them. The symptom is the vault's tab bar sitting under the
notification bar, on a new phone, invisibly to an emulator with an older WebView.

So `insetsHandling` is `disable` in `capacitor.config.ts` and
`SystemBarInsets.java` pads unconditionally: status bar plus display cutout on
top, navigation bar below, the side insets in landscape, and the keyboard's own
inset in place of the bottom one when it opens — so the editor resizes rather
than being covered. The strips are painted iron-gall, the same ground as the
page. The bundled screens still carry `env(safe-area-inset-*)` in `styles.css`
as a second layer; because the native layer consumes the insets, those read zero,
and the two can never double up. What is deliberately *not* used is
`android:windowOptOutEdgeToEdge`, which is deprecated already and ignored from
API 36 — an escape hatch with an expiry date is a bug scheduled for later.

**Why the capture is an append with a precondition, and why it retries.** The
sheet reads today's inbox note, adds one timestamped bullet, and PUTs it back
with the read's `mtimeMs` as the write precondition. If the file moved
underneath — you were editing it on the laptop — the server answers 409 and the
sheet re-reads and re-appends, once. An append is the rare write where that is
safe to do automatically: the thing being added was not in the file either time.
The editor's own save cannot do this and does not.

---

## Building

Everything below is `npm run` from `mobile/`. The first run installs Gradle's
wrapper distribution, which takes a few minutes; after that a build is ~20s.

```sh
npm run build          # FIRST, from the repository root: the APK ships the
                       # web client, and build-pocket.mjs reads dist/

cd mobile
npm install

npm run typecheck      # the shell's TypeScript
npm run apk:debug      # → out/astrolabe-<version>-debug.apk
npm run apk:release    # → out/astrolabe-<version>-release.apk (signed, if you have a key)
```

`apk:*` runs `vite build` → `build-pocket.mjs` → `cap sync android` →
`gradlew assemble…` and copies the result into `out/` with a name a human can
read. `build-pocket.mjs` refuses loudly rather than shipping an APK whose
GitHub door opens onto nothing, so a missing `dist/` is a sentence and not a
surprise on a phone.

## A vault from GitHub

The third door signs in with **GitHub's device flow**: the app shows a code,
the owner approves it in a browser, and no client secret exists to be unzipped
out of the APK. That needs an OAuth App, and the one a release is built with is
not yours to borrow — a build from this repository registers its own.

1. On github.com, under your account's **Developer settings → OAuth Apps**,
   choose **New OAuth App**. The name and the homepage URL are yours; the
   callback URL is never used and any value will do.
2. On the app's page, turn **Enable Device Flow** on. Without it GitHub answers
   the device-code request with an error and the door says so.
3. Put the Client ID — which is public by design — in `mobile/.env`:

   ```properties
   ASTROLABE_GITHUB_CLIENT_ID=Iv1.0123456789abcdef
   ```

   `ASTROLABE_GITHUB_CLIENT_ID` in the build's environment works too, and wins.
   There is **no client secret**: the device flow does not use one, which is the
   whole reason it is the flow a phone can use.
4. Build. A build with no id still runs — the GitHub door says what is missing
   instead of failing at the first request.

The scope asked for is **`repo`**, and nothing else. It is the narrowest scope
GitHub offers that can read and write a PRIVATE repository, which is what a
vault is. The token is kept in Capacitor Preferences (SharedPreferences: the
app's private data directory, not encrypted at rest — the argument for that,
and what would change it, is in CONTRACTS.md) and it is revocable in one click
from the owner's GitHub account page, which is the mitigation that matches the
risk. It sets `JAVA_HOME` and
`ANDROID_HOME` itself, because on most machines the default `java` is newer than
the Android Gradle Plugin accepts and the failure says nothing about Java
versions. Override with `ASTROLABE_JAVA_HOME` / `ANDROID_HOME` if yours live
elsewhere.

Toolchain this was built against:

| | |
| --- | --- |
| Capacitor | 8.5.0 (`@capacitor/core`, `cli`, `android`) |
| Android Gradle Plugin | 8.13.0 |
| Gradle | 8.14.3 (via the wrapper) |
| compileSdk / targetSdk | 36 |
| minSdk | 24 (Android 7.0) |
| Build tools | 36.0.0 |
| JDK | 21 (Temurin 21.0.11+10) |

Android lint runs clean:

```sh
cd android && ./gradlew :app:lintDebug
```

Two lint warnings in `res/xml/network_security_config.xml` are silenced with
`tools:ignore` and an argument written at the site: this app permits cleartext
and trusts the user certificate store, because a self-hosted vault at
`http://192.168.1.24:5173` or behind a private CA is the case it exists for, and
it only ever talks to the one host its owner named.

### Changing the mark

```sh
npm run icons     # needs ImageMagick's `magick` on PATH
```

`icons/make-icons.mjs` draws the ✦ from a single path and writes every launcher
raster, the adaptive foreground, the themed-icon monochrome layer and the splash
vector. The same path is inlined in `src/dom.ts` for the on-screen wordmark — an
Android WebView cannot be trusted to have the `✦` character in a font, and a
wordmark that is a different shape on every phone is not a wordmark. Change the
path in one place and all four follow.

---

## Signing

The release build is signed with a key that lives **only on the release machine**.
`mobile/.gitignore` covers both files; both are `chmod 600`.

```sh
keytool -genkeypair -v \
  -keystore astrolabe-release.keystore \
  -alias astrolabe \
  -keyalg RSA -keysize 4096 -validity 10950 \
  -storetype PKCS12 \
  -dname "CN=Astrolabe, OU=Astrolabe Mobile, O=Astrolabe"
```

Then `mobile/keystore.properties`, beside it:

```properties
storeFile=astrolabe-release.keystore
storePassword=…
keyAlias=astrolabe
keyPassword=…
```

`storePassword` and `keyPassword` are the same string: PKCS12 has no separate
per-entry password, and `keytool` will tell you so if you try. Gradle asks for
both anyway.

`android/app/build.gradle` declares the release `signingConfig` **only when
`keystore.properties` exists**, so a fresh clone still builds a debug APK; without
it, `apk:release` produces an unsigned APK and says so. Signing is v2 + v3, no v1
— v1 is for API 23 and below and this app's floor is 24, while v3 carries the
key-rotation lineage that makes replacing this key possible later without every
installed copy refusing the update.

> **Back up `astrolabe-release.keystore` and `keystore.properties` somewhere that is
> not this machine.** Android identifies an app by its signature. Lose this pair
> and no future build can ever update an installed copy — for a sideloaded APK
> there is no recovery path, only uninstall and start again.

---

## Sideloading

The APK is not on any store. Install it yourself:

**Over USB.** Enable Developer options → USB debugging on the phone, then:

```sh
~/Android/Sdk/platform-tools/adb install -r mobile/out/astrolabe-<version>-release.apk
```

`-r` reinstalls over an existing copy and keeps its data — as long as it was
signed with the same key.

**Without a cable.** Copy the `.apk` to the phone (Nextcloud, `adb push`, a USB
cable in file-transfer mode) and open it in the phone's file manager. Android
will ask permission to install unknown apps *for that file manager*; grant it,
install, and revoke it afterwards if you like.

Debug and release APKs are signed with different keys and cannot replace each
other. To go from one to the other, uninstall first.

## First run

1. Open Astrolabe. Type your server's address — `astrolabe.example.com`, or
   `192.168.1.24:5173`.
   A bare name is assumed to be `https`; an address on your own network
   (`10.x`, `192.168.x`, `172.16–31.x`, `100.64+`, `*.local`, `*.lan`,
   `localhost`) is assumed to be `http`. Typing the scheme always wins.
2. The app checks `GET /api/me` before it goes anywhere, so a typo is a sentence
   on this screen rather than a blank WebView.
3. It remembers what worked. Next launch it reconnects without a tap; the back
   gesture from the instance's first page brings you here to choose another, and
   back from here leaves.
4. Sign in on your instance's own login screen. The session cookie persists —
   your server gives it a seven-day sliding life, so an active writer never meets
   the login screen again.
5. Share a link or a selection from any app → **Capture to Astrolabe** → it lands as
   a timestamped bullet in `Inbox/YYYY-MM-DD.md`, creating the note and the
   folder if this is the day's first.

…or, with no server at all, choose **or open a vault from GitHub** on the first
screen and follow the section above. The app remembers which door you used and
opens it next launch; the back gesture from the vault's first page brings you
back to the connection screen to choose the other one.

## What this app does not do

No camera, no location, no contacts, no storage, no analytics, no push. Its
manifest asks for `INTERNET` and nothing else. Pointed at your own server it has
no offline mode of its own: the page it shows keeps the web app's offline copy
(`docs/offline.md`) the way a browser does, and when there is no copy and no
server, it says so and stops. A vault from GitHub is the other case — it *is*
the copy, and it opens with no network at all.

A GitHub vault has no public half, and every route that would need one answers
`501` with the reason in it rather than failing quietly: publishing, the blog,
marginalia, the site designer, the clipper token, uploaded fonts, PDF
annotations, export, the bulk rewriter, and `/api/sync/*` — which a pocket
vault does not need, because it *is* the sync.
