import { randomBytes } from "node:crypto";

/**
 * Anonymous session ownership.
 *
 * There are no accounts. A visitor owns exactly the volumes and sheets whose
 * `scope` matches an unguessable 128-bit token held in an HTTP-only cookie. The
 * token is the only credential, so it is generated with the CSPRNG, never
 * derived from anything guessable, and every read and write is filtered by it.
 *
 * An agent or script that cannot keep cookies can send the same token in an
 * `x-herbarium-scope` header. That does not weaken ownership: the caller is
 * still holding an unguessable secret, and it still sees only its own rows.
 */

export const SCOPE_COOKIE = "hb_scope";
export const SCOPE_HEADER = "x-herbarium-scope";
export const SCOPE_MAX = 64;
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export function newScopeToken(): string {
  return randomBytes(16).toString("base64url");
}

export function isValidScope(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

/**
 * Resolve the owning scope for a request. Prefers an explicit header so agent
 * transports work without a cookie jar; otherwise uses the cookie. When neither
 * is present the caller gets a freshly minted token back and decides whether it
 * can set a cookie on the response.
 */
export function resolveScope(input: {
  headerValue?: string | null;
  cookieValue?: string | null;
}): { scope: string; isNew: boolean } {
  if (isValidScope(input.headerValue)) return { scope: input.headerValue, isNew: false };
  if (isValidScope(input.cookieValue)) return { scope: input.cookieValue, isNew: false };
  return { scope: newScopeToken(), isNew: true };
}

/** Short, non-reversible label for the settings page. Never the token itself. */
export function scopeFingerprint(scope: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < scope.length; i += 1) {
    h ^= scope.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const SHARE_TOKEN_BYTES = 18;

export function newShareToken(): string {
  return randomBytes(SHARE_TOKEN_BYTES).toString("base64url");
}