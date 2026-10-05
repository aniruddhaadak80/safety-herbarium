import type { NextRequest } from "next/server";
import { fetchDiscovery } from "@/lib/sources/resolve";
import { jsonWithScope, resolveRequestScope, route, NO_STORE, intParam, stringParam } from "@/lib/http";
import { defaultSearchTerms } from "@/lib/sources/queries";
import { ARXIV_ATTRIBUTION } from "@/lib/sources/arxiv";
import { OPENALEX_ATTRIBUTION } from "@/lib/sources/openalex";
import { SNAPSHOT } from "@/lib/sources/snapshot";

/**
 * GET /api/discover/papers?limit=&sort=
 *
 * The live arXiv feed, normalised, with citation counts joined from OpenAlex.
 * If arXiv is unreachable the sealed offline snapshot answers and the envelope
 * says `provenance: "fallback"`, with a note saying exactly when it was sealed.
 * Fallback records are never mixed into user-created rows.
 */
export const GET = route(async (req: NextRequest) => {
  const { scope, setCookie } = resolveRequestScope(req);
  const limit = intParam(req, "limit", 12, 1, 40);
  const sortParam = stringParam(req, "sort", 10);
  const sort = sortParam === "recent" ? "recent" : "relevance";

  const discovery = await fetchDiscovery({ limit, sort });

  return jsonWithScope(
    {
      provenance: discovery.provenance,
      fetchedAt: discovery.fetchedAt,
      count: discovery.papers.length,
      papers: discovery.papers,
      note: discovery.note,
      query: { terms: defaultSearchTerms(), sort },
      sources: [
        { id: "arxiv", label: "arXiv Atom API", url: "http://export.arxiv.org/api/query", license: "Author-licensed preprints", provenance: discovery.provenance === "live" ? "live" : "fallback", attribution: ARXIV_ATTRIBUTION },
        { id: "openalex", label: "OpenAlex", url: "https://api.openalex.org", license: "CC0", provenance: "live", attribution: OPENALEX_ATTRIBUTION },
      ],
      snapshot: { sealedAt: SNAPSHOT.sealedAt, seal: SNAPSHOT.seal, records: SNAPSHOT.records.length },
    },
    { headers: NO_STORE, scope: { scope, setCookie } },
  );
});