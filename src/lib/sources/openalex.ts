import type { SourceRecord } from "../types";

/**
 * OpenAlex, the second live source.
 *
 * Keyless and public. arXiv preprints carry an arXiv DOI (`10.48550/arXiv.<id>`),
 * which OpenAlex indexes, so a preprint can be joined to its citation count and
 * its recorded licence without any API key. Used for two things: enriching the
 * discovery feed with real citation counts, and the explicit "refresh citations"
 * action on a mounted sheet.
 *
 * OpenAlex asks callers to identify themselves with a mailto in the polite pool.
 * We send the product's contact address only.
 */

const BASE = "https://api.openalex.org";
const TIMEOUT_MS = 7000;
const POLITE_MAILTO = "safety-herbarium@users.noreply.github.com";

export const OPENALEX_ATTRIBUTION =
  "OpenAlex, openalex.org — an open catalogue of scholarly works, CC0. Data retrieved from the OpenAlex API.";

interface OpenAlexWork {
  id: string;
  title: string | null;
  cited_by_count: number | null;
  publication_year: number | null;
  license: string | null;
}

async function fetchWork(doi: string): Promise<OpenAlexWork | null> {
  const url =
    `${BASE}/works/https://doi.org/${doi}` +
    `?select=id,title,cited_by_count,publication_year,license&mailto=${encodeURIComponent(POLITE_MAILTO)}`;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`OpenAlex responded ${response.status}`);
    return (await response.json()) as OpenAlexWork;
  } catch {
    return null;
  }
}

function doiFor(record: Pick<SourceRecord, "sourceKind" | "sourceId" | "url">): string | null {
  if (record.sourceKind === "arxiv") return `10.48550/arXiv.${record.sourceId}`;
  return null;
}

/** Citation count for one mounted sheet, or null when OpenAlex has no record. */
export async function fetchCitationCount(
  sourceId: string,
  sourceKind: SourceRecord["sourceKind"],
): Promise<number | null> {
  if (sourceKind !== "arxiv") return null;
  const work = await fetchWork(`10.48550/arXiv.${sourceId}`);
  return typeof work?.cited_by_count === "number" ? work.cited_by_count : null;
}

export interface EnrichedRecord extends SourceRecord {
  citationStatus: "live" | "unavailable";
}

/**
 * Attach citation counts to a batch of arXiv records. Bounded to the first 12
 * upstream ids so one page cannot fan out into a dozen requests; the remainder
 * stay explicitly `unavailable` rather than silently zero.
 */
export async function enrichCitations(
  records: readonly SourceRecord[],
  limit = 12,
): Promise<EnrichedRecord[]> {
  const targets = records.filter((r) => r.sourceKind === "arxiv").slice(0, limit);
  const results = await Promise.all(
    targets.map(async (record) => {
      const doi = doiFor(record);
      if (!doi) return null;
      const work = await fetchWork(doi);
      return work ? { id: record.sourceId, cited: work.cited_by_count ?? 0 } : null;
    }),
  );
  const byId = new Map(results.filter((r): r is { id: string; cited: number } => r !== null).map((r) => [r.id, r.cited]));
  return records.map((record) => {
    const cited = byId.get(record.sourceId);
    return {
      ...record,
      citations: cited ?? null,
      citationStatus: cited === undefined ? "unavailable" : "live",
    };
  });
}