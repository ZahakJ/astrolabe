/**
 * THE THIRD DOOR — sign in with GitHub, pick a repository, open it.
 *
 * The connection screen has always asked one question: which instance? This
 * adds a second answer for a person who runs no instance at all — the vault is
 * a private GitHub repository, cloned into this app's storage and edited here.
 *
 * Three screens, in a line, each of which can be backed out of:
 *
 *   1. A code to type on github.com (the device flow — see pocket/github.ts
 *      for why it is that flow and not another).
 *   2. The account's repositories, private ones included, and a branch.
 *   3. The clone, with its progress, and then the vault.
 *
 * It renders with the same four lines of DOM plumbing the other two screens
 * use, and every string comes from the shell's dictionary in both languages.
 */

import { el, icon, wordmark } from "../dom.ts";
import { t } from "../i18n.ts";
import { AstrolabeNative } from "../native.ts";
import { createPocketFs, dropPocketFs, flushPocketFs, POCKET_DIR } from "./fsFactory.ts";
import {
  GITHUB_SCOPE,
  cloneUrlFor,
  gitAuthHeader,
  listBranches,
  listRepos,
  pollForToken,
  requestDeviceCode,
  whoAmI,
  type GitHubHttp,
  type GitHubRepo,
} from "./github.ts";
import { PocketSession } from "./session.ts";
import {
  forgetRepo,
  forgetSignIn,
  readRepo,
  readToken,
  readUser,
  writeBase,
  readBase,
  writeDoor,
  writeRepo,
  writeToken,
  writeUser,
  createPocketStore,
} from "./store.ts";
import { nativeGitHttp } from "./transport.ts";

const CHECK = "M3 8.5 6.5 12 13 4.5";
const LOCK = "M4.5 7V5a3.5 3.5 0 0 1 7 0v2M3.5 7h9v6.5h-9z";

/** The OAuth App's public client id, a build-time constant from `mobile/.env`
 *  (`ASTROLABE_GITHUB_CLIENT_ID`). Public by design — the device flow has no
 *  client secret, which is the whole reason it is the flow this uses. */
declare const __GITHUB_CLIENT_ID__: string;

/** Every GitHub call goes through the native side, for the reason the capture
 *  sheet's do: this page is served from https://localhost and github.com
 *  answers no preflight. */
const http: GitHubHttp = async ({ url, method, headers, body }) => {
  const answer = await AstrolabeNative.gitRequest({
    url,
    method,
    headers,
    ...(body === undefined ? {} : { bodyBase64: btoa(unescape(encodeURIComponent(body))) }),
  });
  return { status: answer.status, text: decodeURIComponent(escape(atob(answer.bodyBase64))) };
};

export interface PocketDoorOptions {
  /** Back to the instance form. */
  onBack: () => void;
}

export async function mountPocketDoor(root: HTMLElement, options: PocketDoorOptions): Promise<void> {
  const token = await readToken();
  const repo = await readRepo();
  if (token && repo) return renderOpen(root, options, repo.fullName);
  if (token) return renderRepos(root, options, token);
  return renderStart(root, options);
}

function frame(...children: (Node | string)[]): HTMLElement {
  return el("div", { class: "sheet" }, ...children);
}

/** The app's own mark, with this screen's sentence under it. The wordmark
 *  stays the APP's name in both languages: a masthead that renames itself per
 *  screen is two products. */
function masthead(lede: string): HTMLElement {
  return el("div", { class: "masthead" }, wordmark(t.wordmark), el("p", { class: "lede", textContent: lede }));
}

function backLink(options: PocketDoorOptions): HTMLElement {
  return el("button", {
    class: "btn-link",
    type: "button",
    textContent: t.pocketOrInstance,
    onclick: options.onBack,
  });
}

/** The vault is already here: open it, or put it down. */
function renderOpen(root: HTMLElement, options: PocketDoorOptions, fullName: string): void {
  const forget = el("button", {
    class: "btn-quiet",
    type: "button",
    textContent: t.pocketForget,
    onclick: async () => {
      await dropPocketFs();
      await forgetRepo();
      await mountPocketDoor(root, options);
    },
  });
  root.replaceChildren(
    frame(
      masthead(fullName),
      el("button", {
        class: "btn-primary",
        type: "button",
        textContent: t.pocketOpen(fullName),
        onclick: async () => {
          await writeDoor("pocket");
          await AstrolabeNative.openPocket();
        },
      }),
      el("p", { class: "hint", textContent: t.pocketForgetNote }),
      forget,
      backLink(options),
    ),
  );
}

/** Screen one: the code. */
async function renderStart(root: HTMLElement, options: PocketDoorOptions): Promise<void> {
  if (!__GITHUB_CLIENT_ID__) {
    root.replaceChildren(
      frame(masthead(t.pocketLede), el("p", { class: "message", textContent: t.pocketNoClientId }), backLink(options)),
    );
    return;
  }

  const message = el("p", { class: "message", hidden: true });
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");

  const start = el("button", { class: "btn-primary", type: "submit", textContent: t.pocketStart });
  const form = el(
    "form",
    {},
    el("p", { class: "hint", textContent: t.pocketScopeNote }),
    message,
    start,
  );
  root.replaceChildren(frame(masthead(t.pocketLede), form, backLink(options)));

  form.onsubmit = (event) => {
    event.preventDefault();
    void begin();
  };

  async function begin(): Promise<void> {
    start.disabled = true;
    start.textContent = t.pocketSigningIn;
    message.hidden = true;
    let code: Awaited<ReturnType<typeof requestDeviceCode>>;
    try {
      code = await requestDeviceCode(http, __GITHUB_CLIENT_ID__);
    } catch (err) {
      start.disabled = false;
      start.textContent = t.pocketStart;
      message.textContent = String((err as Error).message);
      message.hidden = false;
      return;
    }
    renderCode(root, options, code);
  }
}

function renderCode(
  root: HTMLElement,
  options: PocketDoorOptions,
  code: Awaited<ReturnType<typeof requestDeviceCode>>,
): void {
  const status = el("p", { class: "status", textContent: t.pocketCodeWaiting });
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  // A code the owner reads off a phone and types on another screen: big, in
  // one direction, with the digits and letters it actually carries. It is
  // LTR even in Arabic — it is a code, not prose.
  const value = el("p", { class: "device-code", textContent: code.userCode });
  value.setAttribute("dir", "ltr");

  const where = el("a", {
    class: "btn-link",
    href: code.verificationUri,
    target: "_blank",
    rel: "noreferrer",
    textContent: code.verificationUri.replace(/^https?:\/\//, ""),
  });

  root.replaceChildren(
    frame(
      masthead(t.pocketCodeLede),
      value,
      where,
      el("p", { class: "hint", textContent: `${t.pocketScopeNote} (${GITHUB_SCOPE})` }),
      status,
      el("button", { class: "btn-quiet", type: "button", textContent: t.pocketStartOver, onclick: () => void mountPocketDoor(root, options) }),
    ),
  );

  let interval = code.intervalSeconds;
  const deadline = Date.now() + code.expiresInSeconds * 1000;
  const tick = async (): Promise<void> => {
    if (Date.now() > deadline) {
      status.textContent = t.pocketCodeExpired;
      return;
    }
    const answer = await pollForToken(http, __GITHUB_CLIENT_ID__, code.deviceCode).catch(() => ({
      kind: "pending" as const,
    }));
    switch (answer.kind) {
      case "token": {
        await writeToken(answer.token);
        const user = await whoAmI(http, answer.token).catch(() => ({ login: "", name: null, email: null }));
        await writeUser(user);
        await renderRepos(root, options, answer.token);
        return;
      }
      case "slow-down":
        interval = answer.intervalSeconds;
        break;
      case "expired":
        status.textContent = t.pocketCodeExpired;
        return;
      case "denied":
        status.textContent = t.pocketCodeDenied;
        return;
      case "error":
        status.textContent = answer.message;
        return;
      default:
        break;
    }
    setTimeout(() => void tick(), interval * 1000);
  };
  setTimeout(() => void tick(), interval * 1000);
}

/** Screen two: which repository, and which branch. */
async function renderRepos(root: HTMLElement, options: PocketDoorOptions, token: string): Promise<void> {
  const user = await readUser();
  const status = el("p", { class: "status", textContent: t.pocketSigningIn });
  root.replaceChildren(frame(masthead(t.pocketPickRepo), status));

  let repos: GitHubRepo[];
  try {
    repos = await listRepos(http, token);
  } catch (err) {
    root.replaceChildren(
      frame(
        masthead(t.pocketPickRepo),
        el("p", { class: "message", textContent: String((err as Error).message) }),
        backLink(options),
      ),
    );
    return;
  }

  const search = el("input", {
    type: "search",
    id: "pocket-repo-search",
    placeholder: t.pocketSearchRepos,
    autocapitalize: "none",
    spellcheck: false,
  });
  search.setAttribute("autocorrect", "off");
  const list = el("ul", {});

  const paint = (): void => {
    const needle = search.value.trim().toLowerCase();
    const shown = repos.filter((repo) => !needle || repo.fullName.toLowerCase().includes(needle));
    list.replaceChildren(
      ...(shown.length === 0
        ? [el("li", {}, el("p", { class: "hint", textContent: t.pocketNoRepos }))]
        : shown.slice(0, 60).map((repo) => {
            const open = el("button", {
              class: "saved-open",
              type: "button",
              onclick: () => void renderBranch(root, options, token, repo),
            });
            open.append(el("span", { class: "name", textContent: repo.fullName }));
            if (repo.private) {
              const mark = el("span", { class: "host" });
              mark.append(icon(LOCK), document.createTextNode(` ${t.pocketPrivate}`));
              open.append(mark);
            }
            return el("li", {}, open);
          })),
    );
  };
  search.oninput = paint;
  paint();

  root.replaceChildren(
    frame(
      masthead(user?.login ? t.pocketSignedInAs(user.login) : t.pocketPickRepo),
      el("div", {}, el("label", { htmlFor: "pocket-repo-search", textContent: t.pocketSearchRepos }), search),
      el("section", { class: "saved" }, list),
      el("button", {
        class: "btn-quiet",
        type: "button",
        textContent: t.pocketSignOut,
        onclick: async () => {
          await forgetSignIn();
          await mountPocketDoor(root, options);
        },
      }),
      backLink(options),
    ),
  );
}

async function renderBranch(
  root: HTMLElement,
  options: PocketDoorOptions,
  token: string,
  repo: GitHubRepo,
): Promise<void> {
  const branches = await listBranches(http, token, repo.fullName);
  const select = el("select", { id: "pocket-branch" });
  for (const name of branches.length > 0 ? branches : [repo.defaultBranch]) {
    select.append(el("option", { value: name, textContent: name, selected: name === repo.defaultBranch }));
  }
  const open = el("button", { class: "btn-primary", type: "submit", textContent: t.pocketClone });
  const form = el(
    "form",
    {},
    el("div", {}, el("label", { htmlFor: "pocket-branch", textContent: t.pocketPickBranch }), select),
    open,
  );
  root.replaceChildren(
    frame(
      masthead(repo.fullName),
      form,
      el("button", { class: "btn-quiet", type: "button", textContent: t.pocketAnotherRepo, onclick: () => void renderRepos(root, options, token) }),
    ),
  );
  form.onsubmit = (event) => {
    event.preventDefault();
    void clone(root, token, repo, select.value);
  };
}

/** Screen three: the clone, and then the vault. */
async function clone(root: HTMLElement, token: string, repo: GitHubRepo, branch: string): Promise<void> {
  const status = el("p", { class: "status", textContent: t.pocketCloning("") });
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  root.replaceChildren(frame(el("div", { class: "waiting" }, wordmark(t.wordmark), status)));

  const choice = { fullName: repo.fullName, branch, cloneUrl: cloneUrlFor(repo.fullName) };
  const user = await readUser();
  const fs = await createPocketFs();
  const session = new PocketSession({
    fs,
    http: nativeGitHttp,
    dir: POCKET_DIR,
    repo: choice,
    headers: gitAuthHeader(token),
    author: {
      name: user?.name || user?.login || "Astrolabe pocket",
      email: user?.email || `${user?.login ?? "astrolabe"}@users.noreply.github.com`,
    },
    base: { read: readBase, write: writeBase },
    store: createPocketStore(),
  });

  try {
    await session.repo.clone((phase) => {
      status.textContent = t.pocketCloning(phase);
    });
  } catch (err) {
    const retry = el("button", { class: "btn-primary", type: "button", textContent: t.pocketClone, onclick: () => void clone(root, token, repo, branch) });
    root.replaceChildren(
      frame(
        masthead(repo.fullName),
        el("p", { class: "message", textContent: `${t.pocketCloneFailed} ${String((err as Error).message)}` }),
        retry,
      ),
    );
    return;
  }

  // The names, not only the bytes: the next document is a different page and
  // reads this filesystem back from IndexedDB (see PocketFs.flush).
  await flushPocketFs(fs);
  await writeRepo(choice);
  await writeDoor("pocket");
  const done = el("p", { class: "message good", textContent: t.pocketOpen(repo.fullName) });
  done.prepend(icon(CHECK));
  root.replaceChildren(frame(el("div", { class: "waiting" }, wordmark(t.wordmark), done)));
  await AstrolabeNative.openPocket();
}
