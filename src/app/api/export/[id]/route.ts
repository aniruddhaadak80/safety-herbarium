import type { NextRequest } from "next/server";
import { coverageFor } from "@/lib/service";
import {
  EXPORT_CONTENT_TYPES,
  EXPORT_FORMATS,
  exportFilename,
  renderExport,
  type ExportFormat,
} from "@/lib/export";
import { resolveRequestScope, route, stringParam, RouteContext } from "@/lib/http";
import { badRequest } from "@/lib/errors";
import { SOURCE_ATTRIBUTION } from "@/lib/sources/resolve";
import { site } from "@/lib/site";
import { NextResponse } from "next/server";

type Ctx = RouteContext<{ id: string }>;

/**
 * GET /api/export/[id]?format=markdown|bibtex|csv|json
 *
 * A real downloadable artifact: the syllabus, a bibliography block, a
 * spreadsheet, or the sealed JSON with a digest. Content-disposition is set so a
 * browser downloads a file with a sensible name instead of navigating away.
 */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { scope } = resolveRequestScope(req);
  const formatParam = stringParam(req, "format", 16) ?? "markdown";
  if (!EXPORT_FORMATS.includes(formatParam as ExportFormat)) {
    throw badRequest("Unknown export format.", { allowed: EXPORT_FORMATS });
  }
  const format = formatParam as ExportFormat;

  const { volume, sheets, report } = await coverageFor(scope, id);
  const generatedAt = new Date().toISOString();
  const body = renderExport(format, { volume, sheets, report, generatedAt });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": EXPORT_CONTENT_TYPES[format],
      "content-disposition": `attachment; filename="${exportFilename(volume, format)}"`,
      "cache-control": "no-store",
      "x-herbarium-seal": report.referenceSeal,
      "x-herbarium-engine": report.engine,
      "x-herbarium-generated-at": generatedAt,
      "x-herbarium-sources": String(SOURCE_ATTRIBUTION.length),
      "x-herbarium-repository": site.repoUrl,
    },
  });
});