// The environment under both names.
//
// Astrolabe was Vellum until 2.21, and every `.env`, systemd unit and shell
// alias written before then spells its keys `VELLUM_*`. Renaming the product
// must not be the day those installs boot with the default vault and an
// empty data directory, so every key is read through here: the new spelling
// wins when it is set, the old one answers when it is not, and the startup
// banner says ONCE which old keys were leaned on — a nudge, never a break.
//
// One helper rather than a `?? process.env.VELLUM_X` at each site, because
// a fallback written twelve times is a fallback forgotten the thirteenth.

export const ENV_PREFIX = "ASTROLABE_";
export const LEGACY_ENV_PREFIX = "VELLUM_";

const leanedOn = new Set<string>();

/** `envRead(env, "ASTROLABE_DATA")`: the value under that key, else under
 *  `VELLUM_DATA`, else undefined. Only `ASTROLABE_*` keys are accepted; a
 *  key without the prefix has no legacy twin and is read as-is. */
export function envRead(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const fresh = env[key];
  if (fresh !== undefined) return fresh;
  if (!key.startsWith(ENV_PREFIX)) return undefined;
  const legacy = LEGACY_ENV_PREFIX + key.slice(ENV_PREFIX.length);
  const old = env[legacy];
  if (old !== undefined) leanedOn.add(legacy);
  return old;
}

/** The legacy keys read so far, in the order they were first leaned on. */
export function envFallbacksUsed(): string[] {
  return [...leanedOn];
}

/** Clears the record — for tests, which read the same process env many
 *  times over. */
export function resetEnvFallbacks(): void {
  leanedOn.clear();
}

/** One line on stderr when any old key carried a value, naming them all and
 *  their new spellings. Silent when nothing was leaned on. */
export function reportEnvFallbacks(log: (line: string) => void = (line) => console.error(line)): void {
  if (leanedOn.size === 0) return;
  const pairs = [...leanedOn].map((k) => `${k} (now ${ENV_PREFIX}${k.slice(LEGACY_ENV_PREFIX.length)})`);
  log(`astrolabe: reading legacy environment keys — ${pairs.join(", ")}. They keep working; the new names are preferred.`);
}
