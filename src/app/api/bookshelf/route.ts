import type { NextRequest } from "next/server";
import { jsonWithScope, resolveRequestScope, route, NO_STORE } from "@/lib/http";
import { BOOKSHELF, verifyBookshelf } from "@/lib/sources/bookshelf";
import { affinitiesFor } from "@/lib/taxonomy";

/**
 * GET /api/bookshelf
 *
 * The open-access catalogue. Every entry is a document its publisher placed in
 * the public deliberately, with the licence recorded. Nothing is mirrored: the
 * PDF is streamed from the publisher's own host.
 *
 * `?verify=1` additionally performs a live reachability check on every PDF, so a
 * dead link is visible to the reader rather than discovered mid-read.
 */
export const GET = route(async (req: NextRequest) => {
  const { scope, setCookie } = resolveRequestScope(req);
  const wantsVerify = req.nextUrl.searchParams.get("verify") === "1";

  const books = BOOKSHELF.map((entry) => {
    const matches = Object.entries(affinitiesFor({ title: entry.title, abstract: entry.summary }))
      .filter(([, value]) => value > 0.05)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([classId, affinity]) => ({ classId, affinity }));
    return { ...entry, matches, provenance: "curated" as const };
  });

  const body: Record<string, unknown> = {
    provenance: "curated",
    count: books.length,
    books,
    note: "Open-access only. Books with no free edition are deliberately absent rather than mirrored.",
  };

  if (wantsVerify) {
    body.verification = await verifyBookshelf();
  }

  return jsonWithScope(body, { headers: NO_STORE, scope: { scope, setCookie } });
});