import { describe, expect, it } from "vitest";
import {
  asArxivId,
  asClassId,
  asDecision,
  asDeterminations,
  asDiscoveryQuery,
  asEnum,
  asHttpsUrl,
  asId,
  asShareToken,
  asSingleLine,
  asSourceKind,
  asUnit,
  isAllowedHost,
  LIMITS,
} from "./validation";

describe("input validation", () => {
  it("accepts well-formed ids and rejects the rest", () => {
    expect(asId("11111111-1111-4111-8111-111111111111")).toBe("11111111-1111-4111-8111-111111111111");
    expect(asId("11111111-1111-4111-8111-111111111111".toUpperCase())).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(() => asId("not-a-uuid")).toThrow();
    expect(() => asId(42)).toThrow();
  });

  it("strips an arXiv version suffix and rejects other shapes", () => {
    expect(asArxivId("2411.01042")).toBe("2411.01042");
    expect(asArxivId("2411.01042v3")).toBe("2411.01042");
    expect(() => asArxivId("arXiv:2411.01042")).toThrow();
    expect(() => asArxivId("2411.010")).toThrow();
    expect(() => asArxivId("../../../etc/passwd")).toThrow();
  });

  it("only allows https URLs on the ingest allowlist", () => {
    expect(asHttpsUrl("https://arxiv.org/abs/2411.01042", "url")).toBe(
      "https://arxiv.org/abs/2411.01042",
    );
    expect(() => asHttpsUrl("http://arxiv.org/abs/1", "url")).toThrow(/https/);
    expect(() => asHttpsUrl("https://evil.example/x", "url")).toThrow(/untrusted host/);
    expect(() => asHttpsUrl("javascript:alert(1)", "url")).toThrow();
    expect(isAllowedHost("arxiv.org")).toBe(true);
    expect(isAllowedHost("ARXIV.ORG")).toBe(true);
    expect(isAllowedHost("arxiv.org.evil.test")).toBe(false);
  });

  it("bounds every free-text field", () => {
    expect(() => asSingleLine("x".repeat(LIMITS.name + 1), "name", LIMITS.name)).toThrow();
    expect(asSingleLine("  hello \n world  ", "name", 100)).toBe("hello world");
    expect(asSingleLine(`bad${String.fromCharCode(0)}chars`, "name", 100)).toBe("bad chars");
  });

  it("enforces unit ranges for determinations", () => {
    expect(asUnit(0.5, "d")).toBe(0.5);
    expect(asUnit("0.25", "d")).toBe(0.25);
    expect(() => asUnit(1.5, "d")).toThrow();
    expect(() => asUnit(-0.1, "d")).toThrow();
    expect(() => asUnit("abc", "d")).toThrow();
  });

  it("rejects unknown enum members and unknown class ids", () => {
    expect(asEnum("b", "t", ["a", "b"] as const)).toBe("b");
    expect(() => asEnum("z", "t", ["a", "b"] as const)).toThrow();
    expect(asClassId("interpretability")).toBe("interpretability");
    expect(() => asClassId("vibes")).toThrow();
    expect(asDecision("admitted")).toBe("admitted");
    expect(() => asDecision("maybe")).toThrow();
    expect(asSourceKind("book")).toBe("book");
  });

  it("accepts only known class ids inside a determinations object", () => {
    expect(asDeterminations({ interpretability: 0.4 })).toEqual({ interpretability: 0.4 });
    expect(asDeterminations(undefined)).toEqual({});
    expect(() => asDeterminations({ nonsense: 0.4 })).toThrow(/unknown class id/);
    expect(() => asDeterminations([] as unknown)).toThrow();
    expect(() => asDeterminations({ interpretability: 2 })).toThrow();
  });

  it("strips arXiv query syntax out of a visitor's search string", () => {
    expect(asDiscoveryQuery("deceptive alignment")).toBe("deceptive alignment");
    // Anything that could smuggle a query operator becomes whitespace.
    expect(asDiscoveryQuery('cat:cs.AI AND all:"x"')).toBe("cat cs.AI AND all x");
    expect(() => asDiscoveryQuery("a")).toThrow();
    expect(() => asDiscoveryQuery("x".repeat(200))).toThrow();
  });

  it("validates share tokens", () => {
    expect(asShareToken("abcdefghijklmnop")).toBe("abcdefghijklmnop");
    expect(() => asShareToken("short")).toThrow();
    expect(() => asShareToken("has spaces here 12345")).toThrow();
  });
});