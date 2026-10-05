import { createHash } from "node:crypto";

/**
 * Canonical JSON and the per-volume seal chain.
 *
 * Canonical form: object keys sorted by code unit at every depth, `undefined`
 * dropped, arrays left in order, no insignificant whitespace, numbers emitted in
 * shortest round-trip form, and `-0` normalised to `0`. Two structurally equal
 * values therefore always produce the same bytes, whatever order their keys were
 * built in.
 *
 * The chain: `seal_n = SHA-384( UTF-8( prevSeal || canonicalJson(event_n) ) )`
 * where the genesis `prevSeal` is 96 `0` characters (SHA-384 is 48 bytes, hex
 * encoded to 96). Replaying a volume recomputes every seal from stored events
 * and reports the first sequence number that does not match.
 */

export const GENESIS_SEAL = "0".repeat(96);

/** A stored audit event, before it is turned into canonical bytes. */
export interface ChainEvent {
  seq: number;
  eventType: string;
  payload: Record<string, unknown>;
  at: string;
}

/**
 * A stored audit event as it comes back from the database: the same event, with
 * the persisted `created_at` in the `at` slot so a replay hashes exactly the
 * bytes the original write hashed.
 */
export interface StoredChainEvent {
  seq: number;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  seal?: string;
}

export interface SealedEvent extends ChainEvent {
  prevSeal: string;
  seal: string;
}

function canonicalize(value: unknown): string | null {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "number") {
    const n = value as number;
    // Refuse rather than silently omit: a dropped number would change the
    // preimage and quietly produce a chain that verifies against a lie.
    if (!Number.isFinite(n)) {
      throw new TypeError("non-finite numbers cannot be represented in canonical JSON");
    }
    if (Object.is(n, -0)) return "0";
    return String(n);
  }
  if (type === "boolean") return value ? "true" : "false";
  if (type === "string") return JSON.stringify(value);
  if (type === "undefined") return null;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const entry of value) {
      const c = canonicalize(entry);
      parts.push(c === null ? "null" : c);
    }
    return `[${parts.join(",")}]`;
  }
  if (type === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const parts: string[] = [];
    for (const [key, v] of entries) {
      const c = canonicalize(v);
      if (c === null) continue;
      parts.push(`${JSON.stringify(key)}:${c}`);
    }
    return `{${parts.join(",")}}`;
  }
  return null;
}

/** Canonical JSON bytes for a value. Non-finite numbers throw. */
export function canonicalJson(value: unknown): string {
  const out = canonicalize(value);
  if (out === null) throw new TypeError("value cannot be represented in canonical JSON");
  return out;
}

export function sha384Hex(input: string): string {
  return createHash("sha384").update(Buffer.from(input, "utf8")).digest("hex");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(Buffer.from(input, "utf8")).digest("hex");
}

/** The exact bytes a chain event is hashed over. Exported for tests. */
export function eventPreimage(event: ChainEvent): string {
  return canonicalJson({
    seq: event.seq,
    eventType: event.eventType,
    at: event.at,
    payload: event.payload,
  });
}

/** `seal_n` for one event given the previous seal. */
export function sealFor(prevSeal: string, event: ChainEvent): string {
  return sha384Hex(`${prevSeal}${eventPreimage(event)}`);
}

export interface ReplayReport {
  ok: boolean;
  events: number;
  headSeal: string;
  /** First sequence number whose stored seal does not recompute, or null. */
  brokenAtSeq: number | null;
  reason: string | null;
}

/**
 * Recompute a chain from stored events. Events must be ordered by `seq`; a gap
 * in the sequence is itself a break, because the chain is only meaningful if it
 * is contiguous.
 */
export function replayChain(events: readonly StoredChainEvent[]): ReplayReport {
  let prev = GENESIS_SEAL;
  let previousSeq = 0;

  for (const event of events) {
    if (event.seq !== previousSeq + 1) {
      return {
        ok: false,
        events: previousSeq,
        headSeal: prev,
        brokenAtSeq: event.seq,
        reason: `expected seq ${previousSeq + 1} but found ${event.seq}`,
      };
    }
    const expected = sealFor(prev, {
      seq: event.seq,
      eventType: event.eventType,
      payload: event.payload,
      at: event.createdAt,
    });
    const stored = event.seal;
    if (typeof stored === "string" && stored !== expected) {
      return {
        ok: false,
        events: previousSeq,
        headSeal: prev,
        brokenAtSeq: event.seq,
        reason: `seal mismatch at seq ${event.seq}`,
      };
    }
    prev = expected;
    previousSeq = event.seq;
  }

  return {
    ok: true,
    events: previousSeq,
    headSeal: prev,
    brokenAtSeq: null,
    reason: null,
  };
}

/** Convenience: fold a list of unsorted events into sealed, ordered form. */
export function sealAll(events: readonly ChainEvent[]): SealedEvent[] {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const out: SealedEvent[] = [];
  let prev = GENESIS_SEAL;
  for (const event of ordered) {
    const seal = sealFor(prev, event);
    out.push({ ...event, prevSeal: prev, seal });
    prev = seal;
  }
  return out;
}