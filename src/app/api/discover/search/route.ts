import type { NextRequest } from "next/server";
import { jsonWithScope, resolveRequestScope, route, NO_STORE, intParam } from "@/lib/http";
import { asDiscoveryQuery } from "@/lib/validation";
import { searchArxivForQuery } from "@/lib/sources/arxiv";
import { enrichCitations } from "@/lib/sources/openalex";
import { SNAPSHOT } from "@/lib/sources/snapshot";
import { affinitiesFor } from "@/lib/taxonomy";

/**
 * GET /api/discover/search?q=&limit=
 *
 * Search the live arXiv index by the visitor's own words. The string is
 * sanitised to letters, digits, spaces and a few punctuation marks before it is
 * handed upstream, and results are scored against the risk taxonomy so the
 * reader can see *which* open class a result speaks to, not just a similarity
 * number.
 *
 * If arXiv is unreachable, the sealed snapshot is filtered locally with the same
 * scoring and labelled as fallback.
 */
export const GET = route(async (req: NextRequest) => {
  const { scope, setCookie } = resolveRequestScope(req);
  const query = asDiscoveryQuery(req.nextUrl.searchParams.get("q"));
  const limit = intParam(req, "limit", 10, 1, 20);
  const wanted = query.toLowerCase();

  try {
    const records = await searchArxivForQuery(query, limit);
    if (records.length === 0) throw new Error("no live matches");
    const enriched = await enrichCitations(records, Math.min(limit, 8));
    return jsonWithScope(
      {
        provenance: "live",
        query,
        count: enriched.length,
        papers: enriched.map((r) => ({ ...r, matches: scoreAgainstTaxonomy(r.title, r.abstract) })),
      },
      { headers: NO_STORE, scope: { scope, setCookie } },
    );
  } catch {
    const scored = SNAPSHOT.records
      .map((record) => ({
        record,
        haystack: `${record.title} ${record.abstract}`.toLowerCase(),
      }))
      .filter((entry) => entry.haystack.includes(wanted))
      .slice(0, limit)
      .map((entry) => ({
        ...entry.record,
        provenance: "fallback" as const,
        matches: scoreAgainstTaxonomy(entry.record.title, entry.record.abstract),
      }));

    return jsonWithScope(
      {
        provenance: "fallback",
        query,
        count: scored.length,
        papers: scored,
        note: `arXiv was unreachable. These ${scored.length} matches come from the sealed snapshot taken ${SNAPSHOT.sealedAt}, not from the live index.`,
      },
      { headers: NO_STORE, scope: { scope, setCookie } },
    );
  }
});

/** Which risk classes a result speaks to, strongest first. */
function scoreAgainstTaxonomy(title: string, abstract: string) {
  const affinities = affinitiesFor({ title, abstract });
  return Object.entries(affinities)
    .filter(([, value]) => value > 0.05)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([classId, affinity]) => ({ classId, affinity }));
}