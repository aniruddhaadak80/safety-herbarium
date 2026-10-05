import { describe, expect, it } from "vitest";
import {
  SCOPE_COOKIE,
  SCOPE_HEADER,
  isValidScope,
  newScopeToken,
  newShareToken,
  resolveScope,
  scopeFingerprint,
} from "./session";
import { serializeScopeCookie, readScopeCookieForTest } from "./http";

describe("anonymous session ownership", () => {
  it("mints an unguessable 128-bit token", () => {
    const a = newScopeToken();
    const b = newScopeToken();
    expect(a).not.toBe(b);
    // 16 random bytes base64url-encoded is 22 characters, well above the 16 floor.
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("accepts only base64url tokens in the documented length range", () => {
    expect(isValidScope("abcdefghijklmnop")).toBe(true);
    expect(isValidScope("A-_0123456789abcdefghij")).toBe(true);
    expect(isValidScope("short")).toBe(false);
    expect(isValidScope("has spaces in here!!")).toBe(false);
    expect(isValidScope("x".repeat(65))).toBe(false);
    expect(isValidScope(42)).toBe(false);
    expect(isValidScope(null)).toBe(false);
  });

  it("prefers an explicit header over the cookie, so agents work without a jar", () => {
    const fromHeader = resolveScope({
      headerValue: "header-scope-aaaaaaaaaa",
      cookieValue: "cookie-scope-aaaaaaaaaa",
    });
    expect(fromHeader.scope).toBe("header-scope-aaaaaaaaaa");
    expect(fromHeader.isNew).toBe(false);
  });

  it("falls back to the cookie when no header is present", () => {
    const fromCookie = resolveScope({ headerValue: null, cookieValue: "cookie-scope-aaaaaaaaaa" });
    expect(fromCookie.scope).toBe("cookie-scope-aaaaaaaaaa");
    expect(fromCookie.isNew).toBe(false);
  });

  it("mints a new scope and flags it when neither is usable", () => {
    const fresh = resolveScope({ headerValue: null, cookieValue: "garbage" });
    expect(fresh.isNew).toBe(true);
    expect(isValidScope(fresh.scope)).toBe(true);
    expect(fresh.scope).not.toBe("garbage");
  });

  it("ignores an invalid header rather than trusting it", () => {
    const result = resolveScope({ headerValue: "bad header!!", cookieValue: "cookie-scope-aaaaaaaaaa" });
    expect(result.scope).toBe("cookie-scope-aaaaaaaaaa");
  });

  it("serialises an http-only cookie that round-trips", () => {
    const cookie = serializeScopeCookie("abcdefghijklmnop");
    expect(cookie).toContain(`${SCOPE_COOKIE}=abcdefghijklmnop`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(readScopeCookieForTest(cookie)).toBe("abcdefghijklmnop");
  });

  it("finds the cookie among others and ignores the rest", () => {
    const header = `other=1; ${SCOPE_COOKIE}=zzzzzzzzzzzzzzzzzzzz; another=2`;
    expect(readScopeCookieForTest(header)).toBe("zzzzzzzzzzzzzzzzzzzz");
    expect(readScopeCookieForTest("nothing=here")).toBeNull();
    expect(readScopeCookieForTest(null)).toBeNull();
  });

  it("never reveals the token through the fingerprint", () => {
    const token = newScopeToken();
    const fingerprint = scopeFingerprint(token);
    expect(fingerprint).toHaveLength(8);
    expect(fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(token).not.toContain(fingerprint);
    // Stable for the same token, different for another.
    expect(scopeFingerprint(token)).toBe(fingerprint);
    expect(scopeFingerprint(newScopeToken())).not.toBe(fingerprint);
  });

  it("issues share tokens in a URL-safe alphabet", () => {
    const token = newShareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(22);
    expect(newShareToken()).not.toBe(token);
  });

  it("names the header it accepts so the contract is checkable", () => {
    expect(SCOPE_HEADER).toBe("x-herbarium-scope");
    expect(SCOPE_COOKIE).toBe("hb_scope");
  });
});