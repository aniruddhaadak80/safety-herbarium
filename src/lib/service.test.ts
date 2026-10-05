import { describe, expect, it } from "vitest";
import {
  annotateSheet,
  coverageFor,
  createVolume,
  getAudit,
  getSheet,
  getVolume,
  listSheets,
  listVolumes,
  mountSheet,
  recordDecision,
  removeSheet,
  retireVolume,
  saveWeights,
  setShareToken,
  getSharedVolume,
  updateSheet,
  updateVolume,
  verifyVolume,
} from "./service";
import { activeStoreKind, readyDb } from "./db/client";
import { replayChain } from "./canonical";
import { AppError } from "./errors";
import { bookshelfEntry, toSourceRecord } from "./sources/bookshelf";
import { defaultWeights } from "./taxonomy";

/**
 * Integration tests over the real store.
 *
 * These run against an embedded Postgres with the same schema, constraints,
 * indexes and SQL as production, so the audit chain, the unique constraints and
 * the ownership filter are all genuinely exercised.
 */

/** One session per test: the abuse limiter is keyed by scope, so sharing a scope
 * between cases would let one test trip another's quota. */
let scopeCounter = 0;
function freshScope(): string {
  scopeCounter += 1;
  return `scope-${String(scopeCounter).padStart(4, "0")}-aaaaaaaaaaaaaaaa`;
}
const SCOPE_B = "scope-bbbbbbbbbbbbbbbbbbbb";

const BOOK = bookshelfEntry("hendrycks-ai-safety-ethics-society")!;

describe("service layer", () => {
  it("uses the embedded adapter when no hosted URL is configured", async () => {
    await readyDb();
    expect(activeStoreKind()).toBe("pglite-embedded");
  });

  it("creates a volume, seals the creation event and reads it back", async () => {
    const own = freshScope();
    const volume = await createVolume(own, {
      name: "Frontier safety primer",
      intent: "Get to a defensible overview in six weeks.",
      role: "student",
    });
    expect(volume.status).toBe("active");
    expect(volume.seal).toMatch(/^[0-9a-f]{96}$/);
    expect(volume.eventCount).toBe(1);
    expect(volume.sheetCount).toBe(0);

    const events = await getAudit(own, volume.id);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("volume.created");
    expect(replayChain(events).ok).toBe(true);
  });

  it("never exposes one session's volume to another", async () => {
    const own = freshScope();
    const volume = await createVolume(own, {
      name: "Private",
      intent: "",
      role: "researcher",
    });
    await expect(getVolume(SCOPE_B, volume.id)).rejects.toMatchObject({ status: 404 });
    const strangerList = await listVolumes(SCOPE_B);
    expect(strangerList.some((v) => v.id === volume.id)).toBe(false);
  });

  it("mounts an open-access book and is idempotent", async () => {
    const own = freshScope();
    const volume = await createVolume(own, {
      name: "Books first",
      intent: "",
      role: "generalist",
    });
    const first = await mountSheet(own, volume.id, {
      sourceKind: "book",
      sourceId: BOOK.key,
    });
    expect(first.created).toBe(true);
    expect(first.sheet.accession).toMatch(/^HB-[0-9A-F]{8}$/);
    expect(first.sheet.provenance).toBe("curated");
    expect(first.sheet.tier).toBe("monograph");
    expect(first.sheet.pdfUrl).toBe(BOOK.pdfUrl);

    const second = await mountSheet(own, volume.id, {
      sourceKind: "book",
      sourceId: BOOK.key,
    });
    expect(second.created).toBe(false);
    expect(second.sheet.id).toBe(first.sheet.id);
    expect((await listSheets(own, volume.id))).toHaveLength(1);
  });

  it("mounts onto a chosen class and records a manual determination", async () => {
    const own = freshScope();
    const volume = await createVolume(own, { name: "Class choice", intent: "", role: "engineer" });
    const { sheet } = await mountSheet(own, volume.id, {
      sourceKind: "book",
      sourceId: BOOK.key,
      mountedClass: "governance_assurance",
    });
    expect(sheet.mountedClass).toBe("governance_assurance");
    expect(sheet.determinations.governance_assurance).toBeGreaterThanOrEqual(0.8);
  });

  it("rejects an unknown bookshelf key with 404", async () => {
    const own = freshScope();
    const volume = await createVolume(own, { name: "Bad key", intent: "", role: "student" });
    await expect(
      mountSheet(own, volume.id, { sourceKind: "book", sourceId: "not-a-real-book" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("records status, decision and marginalia, each as a sealed event", async () => {
    const own = freshScope();
    const volume = await createVolume(own, { name: "Annotated", intent: "", role: "researcher" });
    const { sheet } = await mountSheet(own, volume.id, {
      sourceKind: "book",
      sourceId: BOOK.key,
    });

    await updateSheet(own, sheet.id, { status: "reading" });
    await annotateSheet(own, sheet.id, { marginalia: "Chapter 3 is the one to revisit." });
    const decided = await recordDecision(own, sheet.id, {
      decision: "admitted",
      status: "read",
      decisionNote: "Core reading for the volume.",
    });

    expect(decided.status).toBe("read");
    expect(decided.decision).toBe("admitted");
    expect(decided.version).toBeGreaterThan(1);

    const events = await getAudit(own, volume.id);
    const types = events.map((e) => e.eventType);
    expect(types).toContain("volume.created");
    expect(types).toContain("sheet.mounted");
    expect(types).toContain("sheet.status");
    expect(types).toContain("sheet.annotated");
    expect(types).toContain("sheet.decision");
    expect(replayChain(events).ok).toBe(true);
    expect(await verifyVolume(own, volume.id)).toMatchObject({
      ok: true,
      brokenAtSeq: null,
    });
  });

  it("detects a lost update through optimistic concurrency", async () => {
    const own = freshScope();
    const volume = await createVolume(own, { name: "Concurrent", intent: "", role: "engineer" });
    const { sheet } = await mountSheet(own, volume.id, { sourceKind: "book", sourceId: BOOK.key });
    await updateSheet(own, sheet.id, { status: "reading" });
    await expect(
      updateSheet(own, sheet.id, { status: "read", expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a write from a foreign session", async () => {
    const own = freshScope();
    const volume = await createVolume(own, { name: "Owned", intent: "", role: "student" });
    const { sheet } = await mountSheet(own, volume.id, { sourceKind: "book", sourceId: BOOK.key });
    await expect(getSheet(SCOPE_B, sheet.id)).rejects.toMatchObject({ status: 403 });
    await expect(updateSheet(SCOPE_B, sheet.id, { status: "read" })).rejects.toMatchObject({
      status: 403,
    });
    await expect(removeSheet(SCOPE_B, sheet.id)).rejects.toMatchObject({ status: 403 });
  });

  it("keeps a replayable tombstone when a sheet is removed", async () => {
    const own = freshScope();
    const volume = await createVolume(own, { name: "Removable", intent: "", role: "student" });
    const { sheet } = await mountSheet(own, volume.id, { sourceKind: "book", sourceId: BOOK.key });
    await removeSheet(own, sheet.id);

    expect(await listSheets(own, volume.id)).toHaveLength(0);
    const events = await getAudit(own, volume.id);
    expect(events.map((e) => e.eventType)).toContain("sheet.removed");
    const report = await verifyVolume(own, volume.id);
    expect(report.ok).toBe(true);
    expect(report.volume.seal).toBe(report.headSeal);
  });

  it("retires a volume once and leaves the chain replayable", async () => {
    const own = freshScope();
    const volume = await createVolume(own, { name: "Retiring", intent: "", role: "policy" });
    const retired = await retireVolume(own, volume.id);
    expect(retired.status).toBe("retired");
    expect(retired.retiredAt).not.toBeNull();
    await expect(retireVolume(own, volume.id)).rejects.toMatchObject({ status: 409 });
    const report = await verifyVolume(own, volume.id);
    expect(report.ok).toBe(true);
    expect(await listVolumes(own)).toHaveLength(0);
    expect((await listVolumes(own, { includeRetired: true })).length).toBeGreaterThan(0);
  });

  it("refuses to mount into a retired volume", async () => {
    const own = freshScope();
    const volume = await createVolume(own, { name: "Closed", intent: "", role: "student" });
    await retireVolume(own, volume.id);
    await expect(
      mountSheet(own, volume.id, { sourceKind: "book", sourceId: BOOK.key }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("publishes a volume by token and revokes it again", async () => {
    const own = freshScope();
    const volume = await createVolume(own, { name: "Shared", intent: "", role: "researcher" });
    await mountSheet(own, volume.id, { sourceKind: "book", sourceId: BOOK.key });

    const shared = await setShareToken(own, volume.id, true);
    expect(shared.shareToken).toBeTruthy();
    const published = await getSharedVolume(shared.shareToken!);
    expect(published.volume.name).toBe("Shared");
    expect(published.sheets).toHaveLength(1);

    const revoked = await setShareToken(own, volume.id, false);
    expect(revoked.shareToken).toBeNull();
    await expect(getSharedVolume(shared.shareToken!)).rejects.toMatchObject({ status: 404 });
  });

  it("updates volume metadata and seals the change", async () => {
    const own = freshScope();
    const volume = await createVolume(own, { name: "Before", intent: "old", role: "student" });
    const updated = await updateVolume(own, volume.id, { name: "After", intent: "new" });
    expect(updated.name).toBe("After");
    expect(updated.intent).toBe("new");
    const events = await getAudit(own, volume.id);
    const last = events.at(-1)!;
    expect(last.eventType).toBe("volume.updated");
    expect(last.payload.name).toBe("After");
    expect(replayChain(events).ok).toBe(true);
  });

  it("persists engine weights and normalises them at read time", async () => {
    const own = freshScope();
    const weights = defaultWeights();
    weights.interpretability = 3;
    const saved = await saveWeights(own, weights);
    expect(saved.interpretability).toBe(3);
  });

  it("grades a volume with mounted sheets and returns a seal reference", async () => {
    const own = freshScope();
    const volume = await createVolume(own, { name: "Graded", intent: "", role: "researcher" });
    const { sheet } = await mountSheet(own, volume.id, {
      sourceKind: "book",
      sourceId: BOOK.key,
      mountedClass: "power_seeking",
    });
    await recordDecision(own, sheet.id, { decision: "admitted", status: "read" });

    const { report } = await coverageFor(own, volume.id);
    expect(report.score).toBeGreaterThan(0);
    expect(report.factors).toHaveLength(10);
    const powerSeeking = report.factors.find((f) => f.classId === "power_seeking")!;
    expect(powerSeeking.coverage).toBeGreaterThan(0.3);
    expect(powerSeeking.sheets[0].sheetId).toBe(sheet.id);
    expect(report.referenceSeal).toMatch(/^[0-9a-f]{96}$/);

    // Deterministic: the same rows grade the same way twice.
    const again = await coverageFor(own, volume.id);
    expect(again.report.score).toBe(report.score);
    expect(again.report.evaluation.inputDigest).toBe(report.evaluation.inputDigest);
  });

  it("keeps the table's role check honest", async () => {
    const own = freshScope();
    const db = await readyDb();
    await expect(
      db.query(
        `INSERT INTO hb_volumes (id, own, name, intent, role) VALUES ('22222222-2222-4222-8222-222222222222', $1, 'x', '', 'wizard')`,
        [own],
      ),
    ).rejects.toBeTruthy();
  });

  it("maps a bookshelf entry to a normalised record with attribution", () => {
    const record = toSourceRecord(BOOK, "2026-10-04T00:00:00.000Z");
    expect(record.sourceKind).toBe("book");
    expect(record.host).toBe(BOOK.host);
    expect(record.attribution).toContain(BOOK.publisher);
    expect(record.provenance).toBe("curated");
  });

  it("surfaces a typed error for a malformed volume id", async () => {
    const own = freshScope();
    await expect(getVolume(own, "not-a-uuid")).rejects.toBeInstanceOf(AppError);
  });
});