/**
 * SIGNING IN TO GITHUB FROM A PHONE — the device flow, and nothing else.
 *
 * WHY THE DEVICE FLOW. The two other OAuth shapes both need something this app
 * must not have. The web flow needs a client SECRET, and a secret shipped in an
 * APK is a secret published; anybody who unzips the app has it. The PKCE flow
 * needs a redirect back into the app, which means registering a custom scheme
 * and hoping no other app claims it. The device flow needs neither: the app
 * shows a short code, the owner types it into github.com in their own browser,
 * where they can see what they are authorising and to whom, and the app polls
 * until they have. The client id is public by design and lives in
 * `mobile/.env` (`ASTROLABE_GITHUB_CLIENT_ID`) as a build-time constant.
 *
 * SCOPE. `repo`, and nothing more. It is the narrowest scope GitHub offers
 * that can read and write a PRIVATE repository, which is what a vault is. The
 * app never asks for `user`, `gist`, `workflow` or `admin:*`, and the consent
 * screen the owner reads says so.
 *
 * WHERE THE TOKEN LIVES. Capacitor Preferences, which on Android is
 * SharedPreferences — a file inside the app's private data directory, readable
 * by this app's uid and no other on a non-rooted device, but NOT encrypted at
 * rest. That is the same place the shell already keeps the trusted host, and
 * it is a deliberate choice rather than an oversight: the alternative is
 * EncryptedSharedPreferences over the Android keystore, which buys protection
 * against an attacker with a root shell or a physical image of the device, and
 * costs a Java plugin of its own plus a failure mode (a keystore entry
 * invalidated by a fingerprint change) that ends with the owner's vault
 * unreachable and no way to say why. The token is a `repo`-scoped GitHub token
 * the owner can revoke from their account page in one click, which is the
 * mitigation that actually matches the risk. Written down in CONTRACTS.md so
 * the next round can revisit it with the argument in hand.
 */

export interface GitHubHttp {
  (request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  }): Promise<{ status: number; text: string }>;
}

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API = "https://api.github.com";

/** The one scope a private vault needs, and the only one asked for. */
export const GITHUB_SCOPE = "repo";

export interface DeviceCode {
  deviceCode: string;
  /** What the owner types on github.com — "WDJB-MJHT". */
  userCode: string;
  /** Where they type it — "https://github.com/login/device". */
  verificationUri: string;
  expiresInSeconds: number;
  /** How often GitHub will accept a poll, in seconds. */
  intervalSeconds: number;
}

export interface GitHubRepo {
  /** "owner/name" — the spelling everything else uses. */
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  cloneUrl: string;
}

export class GitHubError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "GitHubError";
    this.code = code;
  }
}

function form(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Step one: ask GitHub for a code to show the owner. */
export async function requestDeviceCode(http: GitHubHttp, clientId: string): Promise<DeviceCode> {
  const answer = await http({
    url: DEVICE_CODE_URL,
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: form({ client_id: clientId, scope: GITHUB_SCOPE }),
  });
  const data = parseJson(answer.text);
  if (typeof data.device_code !== "string" || typeof data.user_code !== "string") {
    throw new GitHubError(String(data.error_description ?? "GitHub did not answer with a device code"), "deviceCode");
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: String(data.verification_uri ?? "https://github.com/login/device"),
    expiresInSeconds: Number(data.expires_in) || 900,
    intervalSeconds: Number(data.interval) || 5,
  };
}

export type PollResult =
  | { kind: "token"; token: string }
  | { kind: "pending" }
  /** GitHub asking for a longer gap between polls; the caller lengthens it. */
  | { kind: "slow-down"; intervalSeconds: number }
  | { kind: "expired" }
  | { kind: "denied" }
  | { kind: "error"; message: string };

/** Step two, asked once. The caller does the waiting — a poll loop that owns
 *  its own timer is a poll loop that cannot be cancelled when the owner
 *  presses back. */
export async function pollForToken(http: GitHubHttp, clientId: string, deviceCode: string): Promise<PollResult> {
  const answer = await http({
    url: TOKEN_URL,
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: form({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  const data = parseJson(answer.text);
  if (typeof data.access_token === "string") return { kind: "token", token: data.access_token };
  switch (data.error) {
    case "authorization_pending":
      return { kind: "pending" };
    case "slow_down":
      return { kind: "slow-down", intervalSeconds: Number(data.interval) || 10 };
    case "expired_token":
      return { kind: "expired" };
    case "access_denied":
      return { kind: "denied" };
    default:
      return { kind: "error", message: String(data.error_description ?? data.error ?? "GitHub refused the sign-in") };
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "astrolabe-pocket",
  };
}

/** The account's own login, for the sign-in line and for the commit author. */
export async function whoAmI(http: GitHubHttp, token: string): Promise<{ login: string; name: string | null; email: string | null }> {
  const answer = await http({ url: `${API}/user`, method: "GET", headers: authHeaders(token) });
  if (answer.status !== 200) throw new GitHubError("GitHub did not recognise this sign-in", "unauthorized");
  const data = parseJson(answer.text);
  return {
    login: String(data.login ?? ""),
    name: typeof data.name === "string" ? data.name : null,
    email: typeof data.email === "string" ? data.email : null,
  };
}

/**
 * Every repository this account can write, private ones included, most
 * recently touched first.
 *
 * `affiliation` names all three ways a repository can be theirs; without it
 * GitHub answers only the ones they own, and a vault in an organisation would
 * simply not be in the list, with nothing saying why.
 */
export async function listRepos(http: GitHubHttp, token: string, pages = 3): Promise<GitHubRepo[]> {
  const out: GitHubRepo[] = [];
  for (let page = 1; page <= pages; page++) {
    const answer = await http({
      url: `${API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member&page=${page}`,
      method: "GET",
      headers: authHeaders(token),
    });
    if (answer.status !== 200) throw new GitHubError("GitHub did not list your repositories", "repos");
    const rows: unknown = JSON.parse(answer.text || "[]");
    if (!Array.isArray(rows)) break;
    for (const row of rows as Record<string, unknown>[]) {
      out.push({
        fullName: String(row.full_name ?? ""),
        name: String(row.name ?? ""),
        owner: String((row.owner as Record<string, unknown> | undefined)?.login ?? ""),
        private: row.private === true,
        defaultBranch: String(row.default_branch ?? "main"),
        updatedAt: String(row.pushed_at ?? row.updated_at ?? ""),
        cloneUrl: String(row.clone_url ?? ""),
      });
    }
    if (rows.length < 100) break;
  }
  return out;
}

/** The branches of one repository, so the owner picks the one their vault is
 *  on rather than being given the default and a surprise. */
export async function listBranches(http: GitHubHttp, token: string, fullName: string): Promise<string[]> {
  const answer = await http({
    url: `${API}/repos/${fullName}/branches?per_page=100`,
    method: "GET",
    headers: authHeaders(token),
  });
  if (answer.status !== 200) return [];
  const rows: unknown = JSON.parse(answer.text || "[]");
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]).map((row) => String(row.name ?? "")) : [];
}

/** The URL git clones from, with no credentials in it — the token rides in an
 *  Authorization header instead, so it is never written into `.git/config`
 *  where a later `git remote -v` on any machine would print it. */
export function cloneUrlFor(fullName: string): string {
  return `https://github.com/${fullName}.git`;
}

/** The header that authorises a git request. GitHub accepts a token as HTTP
 *  Basic with the token as the username, which is what every git credential
 *  helper sends. */
export function gitAuthHeader(token: string): Record<string, string> {
  return { Authorization: `Basic ${btoa(`${token}:x-oauth-basic`)}` };
}
