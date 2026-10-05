import { NextResponse } from "next/server";
import { TOOLS } from "@/lib/mcp";
import { liveUrl, site } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * GET /mcp.json
 *
 * The client-configuration manifest. Served dynamically so the endpoint URL is
 * always this deployment's real public alias rather than a value someone forgot to
 * update — the same reason the site config is the single source of truth everywhere
 * else.
 */
export function GET() {
  const endpoint = `${liveUrl}/api/mcp`;

  return NextResponse.json(
    {
      $schema: "https://json.schemastore.org/mcp.json",
      name: "safety-herbarium",
      version: "1.0.0",
      description:
        "A mounted reading catalogue for AI-safety and alignment literature. Read volumes, mount papers and open-access textbooks, run a deterministic coverage engine over ten AI-safety risk classes, and replay a SHA-384 audit chain.",
      repository: { url: site.repoUrl, source: "github" },
      mcpServers: {
        safetyHerbarium: {
          type: "http",
          url: endpoint,
          headers: {
            "x-herbarium-scope": "replace-with-your-own-random-token",
          },
        },
      },
      tools: TOOLS.map((tool) => ({
        name: tool.name,
        effect: tool.effect,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
      authentication: {
        type: "session-header",
        header: "x-herbarium-scope",
        notes:
          "Every call is scoped to an anonymous session token. There are no accounts. Generate your own random token and send it in x-herbarium-scope; it will see only the volumes it creates. A browser session uses the hb_scope HTTP-only cookie instead.",
      },
    },
    {
      status: 200,
      headers: { "cache-control": "public, max-age=300", "access-control-allow-origin": "*" },
    },
  );
}