import { NextResponse, type NextRequest } from "next/server";
import { handleMcp } from "@/lib/mcp-handler";
import { TOOLS, toolNames } from "@/lib/mcp";
import { NO_STORE } from "@/lib/http";
import { site } from "@/lib/site";

/**
 * POST /api/mcp — JSON-RPC 2.0, the Model Context Protocol transport.
 *
 * `initialize`, `tools/list`, `tools/call` and `ping` are supported. The session
 * scope comes from the request (cookie or `x-herbarium-scope`), never from tool
 * arguments, and every mutating tool goes through the same service functions the
 * interface uses.
 */
export async function POST(req: NextRequest) {
  const responses = await handleMcp(req);
  return NextResponse.json(responses, { status: 200, headers: NO_STORE });
}

/**
 * GET /api/mcp — a self-describing manifest, so the endpoint is discoverable by
 * a client that only knows the URL.
 */
export async function GET() {
  return NextResponse.json(
    {
      protocolVersion: "2025-06-18",
      transport: "http+jsonrpc",
      endpoint: `${site.liveUrl}/api/mcp`,
      tools: toolNames(),
      schemas: Object.fromEntries(TOOLS.map((tool) => [tool.name, tool.inputSchema])),
      note: "POST JSON-RPC 2.0 requests. Scope is taken from the hb_scope cookie or the x-herbarium-scope header.",
    },
    { status: 200, headers: NO_STORE },
  );
}