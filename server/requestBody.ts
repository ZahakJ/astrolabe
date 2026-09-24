// The request readers every route file shares: a required query parameter, a
// JSON object body, a required string field. Each answers a 400 in the
// VaultError shape api.ts's onError turns into JSON. Moved out of
// server/api.ts unchanged when its routes split into server/*Routes.ts.

import { VaultError } from "./vault.ts";

export function requiredQuery(value: string | undefined, name: string): string {
  if (!value) throw new VaultError(400, `Missing query param: ${name}`);
  return value;
}

export async function jsonBody(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    const body = await c.req.json();
    if (typeof body !== "object" || body === null) throw new Error("not an object");
    return body as Record<string, unknown>;
  } catch {
    throw new VaultError(400, "Invalid JSON body");
  }
}

export function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new VaultError(400, `Body field "${key}" must be a non-empty string`);
  }
  return value;
}
