import type { ClassId, SourceRecord } from "../types";
import { arxivById, searchArxiv, searchArxivForQuery, ARXIV_ATTRIBUTION } from "./arxiv";
import { enrichCitations, OPENALEX_ATTRIBUTION } from "./openalex";
import { bookshelfEntry, toSourceRecord, BOOKSHELF } from "./bookshelf";
import { SNAPSHOT } from "./snapshot";
import { notFound, upstreamFailure } from "../errors";
import { isClassId } from "./queries";

/**
 * Resolving a source record.
 *
 * `live` when the upstream host answered just now. `curated` for a checked-in
 * open-access bookshelf entry. `fallback` only when the network is unavailable
 * and a dated, sealed snapshot carries the record — and even then the record says
 * so in its own `provenance` field, which the UI renders. User-created rows are
 * never produced by this path.
 */

function fromSnapshot(sourceId: string): SourceRecord | null {
  const found = SNAPSHOT.records.find((r) => r.sourceId === sourceId);
  return found ? { ...found, provenance: "fallback" } : null;
}

export async function resolveSource(
  sourceKind: "arxiv" | "book",
  sourceId: string,
): Promise<SourceRecord> {
  if (sourceKind === "book") {
    const entry = bookshelfEntry(sourceId);
    if (!entry) throw notFound("No such book in the open-access bookshelf.");
    return toSourceRecord(entry, new Date().toISOString());
  }

  try {
    const live = await arxivById(sourceId);
    if (live) return live;
    const snapshotted = fromSnapshot(sourceId);
    if (snapshotted) return snapshotted;
    throw notFound("arXiv has no record with that id.");
  } catch (error) {
    const snapshotted = fromSnapshot(sourceId);
    if (snapshotted) return snapshotted;
    if (error instanceof Error && error.name === "AppError") throw error;
    throw upstreamFailure("arXiv did not answer in time, and that paper is not in the offline snapshot.");
  }
}

/**
 * The discovery feed.
 *
 * Queries the live arXiv index with the taxonomy's own phrases, then attaches
 * real citation counts from OpenAlex for the first batch. If the index is
 * unreachable the sealed snapshot answers instead, and the envelope says
 * `fallback` so the page can label it.
 */
export async function fetchDiscovery(options: {
  limit?: number;
  sort?: "relevance" | "recent";
} = {}): Promise<{
  provenance: "live" | "fallback";
  fetchedAt: string;
  papers: SourceRecord[];
  note: string | null;
}> {
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 40);
  try {
    const records = await searchArxiv({ limit, sort: options.sort });
    if (records.length === 0) throw new Error("empty result set");
    const enriched = await enrichCitations(records, 12);
    return {
      provenance: "live",
      fetchedAt: enriched[0]?.fetchedAt ?? new Date().toISOString(),
      papers: enriched,
      note: null,
    };
  } catch {
    return {
      provenance: "fallback",
      fetchedAt: SNAPSHOT.sealedAt,
      papers: SNAPSHOT.records.slice(0, limit).map((r) => ({ ...r, provenance: "fallback" as const })),
      note: `arXiv was unreachable. Showing a sealed offline snapshot taken ${SNAPSHOT.sealedAt}. These are not current.`,
    };
  }
}

/** Live candidates for one risk class, used to recommend a next read. */
export async function fetchCandidatesForClass(
  classId: ClassId,
  limit = 4,
): Promise<SourceRecord[]> {
  if (!isClassId(classId)) return [];
  try {
    return await searchArxivForQuery(classId, limit);
  } catch {
    const { affinitiesFor } = await import("../taxonomy");
    const matched = SNAPSHOT.records
      .map((record) => ({ record, affinity: affinitiesFor(record)[classId] }))
      .filter((entry) => entry.affinity > 0)
      .sort((a, b) => b.affinity - a.affinity || a.record.sourceId.localeCompare(b.record.sourceId))
      .map((entry) => entry.record);
    return (matched.length > 0 ? matched : SNAPSHOT.records)
      .slice(0, limit)
      .map((r) => ({ ...r, provenance: "fallback" as const }));
  }
}

export const SOURCE_ATTRIBUTION = [ARXIV_ATTRIBUTION, OPENALEX_ATTRIBUTION] as const;

/** A compact, engine-ready view of a record for the coverage recommendation. */
export function toEngineCandidate(record: SourceRecord) {
  return {
    sourceId: record.sourceId,
    title: record.title,
    abstract: record.abstract,
    url: record.url,
    publishedAt: record.publishedAt,
  };
}

export function bookshelfCount(): number {
  return BOOKSHELF.length;
}