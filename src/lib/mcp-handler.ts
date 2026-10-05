import type { NextRequest } from "next/server";
import {
  MCP_PROTOCOL_VERSION,
  JSONRPC_INTERNAL_ERROR,
  JSONRPC_INVALID_PARAMS,
  JSONRPC_INVALID_REQUEST,
  JSONRPC_METHOD_NOT_FOUND,
  JSONRPC_PARSE_ERROR,
  TOOLS,
  capabilities,
  rpcError,
  rpcSuccess,
  serverInfo,
  toolResult,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./mcp";
import { errorEnvelope } from "./errors";
import {
  annotateSheet,
  coverageFor,
  getSheet,
  getVolume,
  listSheets,
  listVolumes,
  mountSheet,
  recordDecision,
  removeSheet,
  verifyVolume,
} from "./service";
import { resolveRequestScope } from "./http";
import { fetchCandidatesForClass, toEngineCandidate } from "./sources/resolve";
import type { EngineCandidate } from "./engine";
import { asClassId, asId, asDecision, asSheetStatus, asShelfKey, asArxivId, asSingleLine, LIMITS } from "./validation";
import { nextVersion } from "./version";

/**
 * The MCP endpoint handler.
 *
 * Scopes every operation to the caller's session, so a tool call from an agent
 * sees exactly the records a browser in the same session would see, and nothing
 * else.
 */

function asParams(params: unknown): Record<string, unknown> {
  if (params === undefined || params === null) return {};
  if (typeof params !== "object" || Array.isArray(params)) {
    throw Object.assign(new Error("params must be an object"), { rpcCode: JSONRPC_INVALID_PARAMS });
  }
  return params as Record<string, unknown>;
}

function requireString(params: Record<string, unknown>, field: string, max: number): string {
  const value = params[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw Object.assign(new Error(`${field} is required and must be a string.`), {
      rpcCode: JSONRPC_INVALID_PARAMS,
    });
  }
  return asSingleLine(value, field, max);
}

function optionalString(params: Record<string, unknown>, field: string, max: number): string | undefined {
  const value = params[field];
  if (value === undefined || value === null) return undefined;
  return requireString(params, field, max);
}

export async function handleMcp(req: NextRequest): Promise<JsonRpcResponse[]> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return [rpcError(null, JSONRPC_PARSE_ERROR, "Request body is not valid JSON.")];
  }

  // Scoped once, on the real request, and closed over by every dispatch in this
  // batch. Nothing reads a global, so concurrent sessions cannot cross wires.
  const { scope } = resolveRequestScope(req);

  if (!Array.isArray(raw)) return [await dispatch(raw as JsonRpcRequest, scope)];
  return Promise.all((raw as JsonRpcRequest[]).map((entry) => dispatch(entry, scope)));
}

async function dispatch(message: JsonRpcRequest, scope: string): Promise<JsonRpcResponse> {
  const id = typeof message?.id === "string" || typeof message?.id === "number" ? message.id : null;

  try {
    if (typeof message !== "object" || message === null) {
      return rpcError(null, JSONRPC_INVALID_REQUEST, "A JSON-RPC object is required.");
    }
    if (message.jsonrpc !== "2.0") {
      return rpcError(id, JSONRPC_INVALID_REQUEST, 'jsonrpc must be exactly "2.0".');
    }
    if (typeof message.method !== "string") {
      return rpcError(id, JSONRPC_INVALID_REQUEST, "method must be a string.");
    }

    switch (message.method) {
      case "initialize":
        return rpcSuccess(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: capabilities(),
          serverInfo: serverInfo("safety-herbarium", nextVersion()),
          instructions:
            "A reading volume is a set of mounted AI-safety papers and books. Call list_volumes, mount_sheet to add one, coverage_report to see which risk classes are still open, and verify_chain to replay the audit trail.",
        });

      case "notifications/initialized":
      case "initialized":
        // A JSON-RPC notification carries no id and expects no result body. The
        // transport returns 204 for these; the envelope still records the id as
        // null so a batch stays positionally aligned.
        return rpcSuccess(null, {});

      case "ping":
        return rpcSuccess(id, {});

      case "tools/list":
        return rpcSuccess(id, {
          tools: TOOLS.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: {
              readOnlyHint: tool.effect === "read",
              destructiveHint: tool.effect === "mutating" && tool.name === "remove_sheet",
              idempotentHint: tool.name === "mount_sheet",
              openWorldHint: false,
            },
          })),
        });

      case "tools/call":
        return callTool(id, asParams(message.params), scope);

      default:
        return rpcError(id, JSONRPC_METHOD_NOT_FOUND, `Unknown method: ${message.method}`);
    }
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "rpcCode" in error
        ? Number((error as { rpcCode: unknown }).rpcCode)
        : JSONRPC_INTERNAL_ERROR;
    const message_ = error instanceof Error ? error.message : "Internal error.";
    return rpcError(id, code, message_);
  }
}

async function callTool(
  id: string | number | null,
  params: Record<string, unknown>,
  scope: string,
): Promise<JsonRpcResponse> {
  const name = requireString(params, "name", 64);
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) {
    return rpcError(id, JSONRPC_INVALID_PARAMS, `Unknown tool: ${name}`, {
      available: TOOLS.map((t) => t.name),
    });
  }

  const args = asParams(params.arguments);
  // Scope comes from the transport, never from tool arguments, so a tool call
  // cannot address another session's records.
  try {
    const payload = await runTool(name, args, scope);
    return rpcSuccess(id, toolResult(payload));
  } catch (error) {
    const { status, body } = errorEnvelope(error);
    return rpcSuccess(id, toolResult({ ...body.error, httpStatus: status }, true));
  }
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  scope: string,
): Promise<unknown> {
  switch (name) {
    case "list_volumes": {
      const includeRetired = args.includeRetired === true;
      const volumes = await listVolumes(scope, { includeRetired });
      return { count: volumes.length, volumes };
    }

    case "get_volume": {
      const volumeId = asId(requireString(args, "volumeId", LIMITS.ids), "volumeId");
      const volume = await getVolume(scope, volumeId);
      const sheets = await listSheets(scope, volumeId);
      return { volume, sheets };
    }

    case "coverage_report": {
      const volumeId = asId(requireString(args, "volumeId", LIMITS.ids), "volumeId");
      let candidates: EngineCandidate[] = [];
      if (args.includeCandidates === true) {
        // Resolve candidates for the open gap only, so a report costs at most one
        // upstream query.
        const probe = await coverageFor(scope, volumeId);
        const gap = probe.report.recommendation.primaryGap;
        if (gap) {
          const live = await fetchCandidatesForClass(gap, 4);
          candidates = live.map(toEngineCandidate);
        }
      }
      const { volume, sheets, report } = await coverageFor(scope, volumeId, candidates);
      return { volume, sheets, report };
    }

    case "mount_sheet": {
      const volumeId = asId(requireString(args, "volumeId", LIMITS.ids), "volumeId");
      const kind = requireString(args, "sourceKind", 8);
      if (kind !== "arxiv" && kind !== "book") {
        throw Object.assign(new Error("sourceKind must be arxiv or book."), {
          rpcCode: JSONRPC_INVALID_PARAMS,
        });
      }
      const sourceId = kind === "arxiv" ? asArxivId(args.sourceId) : asShelfKey(args.sourceId);
      const mountedClass = args.mountedClass === undefined ? undefined : asClassId(args.mountedClass);
      const { sheet, created } = await mountSheet(scope, volumeId, { sourceKind: kind, sourceId, mountedClass });
      const volume = await getVolume(scope, volumeId);
      return { sheet, created, volumeSeal: volume.seal };
    }

    case "record_decision": {
      const sheetId = asId(requireString(args, "sheetId", LIMITS.ids), "sheetId");
      const decision = asDecision(args.decision);
      const status = args.status === undefined ? undefined : asSheetStatus(args.status);
      const note = optionalString(args, "note", LIMITS.decisionNote);
      const sheet = await recordDecision(scope, sheetId, { decision, status, decisionNote: note });
      return { sheet };
    }

    case "annotate_sheet": {
      const sheetId = asId(requireString(args, "sheetId", LIMITS.ids), "sheetId");
      const marginalia = requireString(args, "marginalia", LIMITS.marginalia);
      const sheet = await annotateSheet(scope, sheetId, { marginalia });
      return { sheet };
    }

    case "remove_sheet": {
      const sheetId = asId(requireString(args, "sheetId", LIMITS.ids), "sheetId");
      await removeSheet(scope, sheetId);
      return { removed: true, sheetId };
    }

    case "verify_chain": {
      const volumeId = asId(requireString(args, "volumeId", LIMITS.ids), "volumeId");
      const report = await verifyVolume(scope, volumeId);
      return {
        ok: report.ok,
        events: report.events,
        brokenAtSeq: report.brokenAtSeq,
        reason: report.reason,
        headSeal: report.headSeal,
        headStored: report.headStored,
      };
    }

    default:
      throw Object.assign(new Error(`Tool ${name} is declared but not implemented.`), {
        rpcCode: JSONRPC_INVALID_PARAMS,
      });
  }
}

/** Convenience used by the console page to prove a read tool end to end. */
export async function readSheetThroughService(scope: string, sheetId: string) {
  return getSheet(scope, sheetId);
}