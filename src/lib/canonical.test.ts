import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GENESIS_SEAL,
  canonicalJson,
  replayChain,
  sealAll,
  sealFor,
  sha384Hex,
} from "./canonical";

/**
 * Known-answer tests for the seal chain.
 *
 * The expected digests below are computed independently, with `node:crypto`
 * directly rather than through this module, so a change to the canonical
 * encoding or the preimage format shows up as a failing vector instead of as a
 * chain that is still self-consistent but no longer matches the published rule.
 */

const genesisEvent = {
  seq: 1,
  eventType: "volume.created",
  payload: { volumeId: "v-1", name: "Frontier safety primer", role: "student" },
  at: "2026-01-01T00:00:00.000Z",
};

describe("canonical JSON", () => {
  it("sorts object keys at every depth and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] }, u: undefined })).toBe(
      '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}',
    );
  });

  it("preserves array order and normalises negative zero", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalJson({ n: -0 })).toBe('{"n":0}');
  });

  it("produces the same bytes whatever key insertion order", () => {
    const one = { alpha: 1, beta: { x: true, y: "s" } };
    const two = { beta: { y: "s", x: true }, alpha: 1 };
    expect(canonicalJson(one)).toBe(canonicalJson(two));
  });

  it("refuses values it cannot represent honestly", () => {
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalJson({ n: Number.POSITIVE_INFINITY })).toThrow(TypeError);
  });

  it("escapes strings as UTF-8 JSON, not as raw bytes", () => {
    expect(canonicalJson({ k: "café" })).toBe('{"k":"café"}');
    expect(sha384Hex(canonicalJson({ k: "café" }))).toBe(
      createHash("sha384").update('{"k":"café"}', "utf8").digest("hex"),
    );
  });
});

describe("seal chain", () => {
  it("starts from 96 zero characters", () => {
    expect(GENESIS_SEAL).toHaveLength(96);
    expect(GENESIS_SEAL).toMatch(/^0+$/);
  });

  it("matches the published rule for the genesis step", () => {
    const expected = createHash("sha384")
      .update(GENESIS_SEAL + canonicalJson({ seq: 1, eventType: "volume.created", payload: genesisEvent.payload, at: genesisEvent.at }), "utf8")
      .digest("hex");
    expect(sealFor(GENESIS_SEAL, genesisEvent)).toBe(expected);
    // Pinned so a change to the encoding cannot pass unnoticed.
    expect(sealFor(GENESIS_SEAL, genesisEvent)).toBe(
      "03e3fecaf00634aaaf423095f7e16b5c4c8ad899d48f83df0a7f16892e92b81fc0bd99a95acef39ad6f66624baca7d2e",
    );
  });

  it("is deterministic for a fixed event sequence", () => {
    const events = [
      genesisEvent,
      { seq: 2, eventType: "sheet.mounted", payload: { sheetId: "s1" }, at: "2026-01-01T00:01:00.000Z" },
      { seq: 3, eventType: "sheet.decision", payload: { decision: "admitted" }, at: "2026-01-01T00:02:00.000Z" },
    ];
    const first = sealAll(events);
    const second = sealAll(events);
    expect(first.map((e) => e.seal)).toEqual(second.map((e) => e.seal));
    expect(first[0].prevSeal).toBe(GENESIS_SEAL);
    expect(first[1].prevSeal).toBe(first[0].seal);
    expect(first[2].prevSeal).toBe(first[1].seal);
  });

  it("verifies a chain it just built", () => {
    const sealed = sealAll([
      genesisEvent,
      { seq: 2, eventType: "sheet.mounted", payload: { sheetId: "s1" }, at: "2026-01-01T00:01:00.000Z" },
    ]);
    const report = replayChain(
      sealed.map((e) => ({
        seq: e.seq,
        eventType: e.eventType,
        payload: e.payload,
        createdAt: e.at,
        seal: e.seal,
      })),
    );
    expect(report.ok).toBe(true);
    expect(report.events).toBe(2);
    expect(report.headSeal).toBe(sealed[1].seal);
    expect(report.brokenAtSeq).toBeNull();
  });

  it("detects a tampered payload and names the sequence", () => {
    const sealed = sealAll([
      genesisEvent,
      { seq: 2, eventType: "sheet.mounted", payload: { sheetId: "s1" }, at: "2026-01-01T00:01:00.000Z" },
      { seq: 3, eventType: "sheet.decision", payload: { decision: "admitted" }, at: "2026-01-01T00:02:00.000Z" },
    ]);
    const tampered = sealed.map((e, i) =>
      i === 1 ? { ...e, payload: { sheetId: "s-tampered" } } : e,
    );
    const report = replayChain(
      tampered.map((e) => ({
        seq: e.seq,
        eventType: e.eventType,
        payload: e.payload,
        createdAt: e.at,
        seal: e.seal,
      })),
    );
    expect(report.ok).toBe(false);
    expect(report.brokenAtSeq).toBe(2);
    expect(report.reason).toContain("seal mismatch");
  });

  it("detects a deleted event as a sequence gap", () => {
    const sealed = sealAll([
      genesisEvent,
      { seq: 2, eventType: "sheet.mounted", payload: { sheetId: "s1" }, at: "2026-01-01T00:01:00.000Z" },
      { seq: 3, eventType: "sheet.decision", payload: { decision: "admitted" }, at: "2026-01-01T00:02:00.000Z" },
    ]);
    const withHole = [sealed[0], sealed[2]].map((e) => ({
      seq: e.seq,
      eventType: e.eventType,
      payload: e.payload,
      createdAt: e.at,
      seal: e.seal,
    }));
    const report = replayChain(withHole);
    expect(report.ok).toBe(false);
    expect(report.brokenAtSeq).toBe(3);
    expect(report.reason).toContain("expected seq 2");
  });

  it("treats an empty chain as a valid chain of length zero", () => {
    const report = replayChain([]);
    expect(report.ok).toBe(true);
    expect(report.events).toBe(0);
    expect(report.headSeal).toBe(GENESIS_SEAL);
  });
});