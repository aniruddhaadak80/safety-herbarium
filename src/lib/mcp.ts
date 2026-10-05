import { ENGINE_VERSION } from "./engine";
import type { ClassId, SheetStatus } from "./types";

/**
 * MCP: JSON-RPC 2.0 over HTTP POST at `/api/mcp`.
 *
 * One transport, three methods, a real tool catalogue. Tools are the same service
 * functions the interface uses, so an agent and a reader cannot diverge, and
 * every tool result carries the seal of the volume it touched.
 *
 * Protocol notes that matter in practice:
 *  - `initialize` returns the negotiated protocol version and server info, and
 *    the client is expected to follow with `notifications/initialized`, which
 *    returns 204 with no body because JSON-RPC notifications carry no id.
 *  - Errors use the JSON-RPC error object. A missing method is -32601, a bad
 *    payload is -32602, an unknown tool is -32602 with a named tool, and a
 *    domain failure keeps its HTTP meaning inside the result payload so an agent
 *    can branch on it.
 *  - `tools/call` returns MCP content blocks: a text block holding JSON, which
 *    is what every MCP client expects.
 */

export const JSONRPC_VERSION = "2.0";
export const MCP_PROTOCOL_VERSION = "2025-06-18";

export const JSONRPC_PARSE_ERROR = -32700;
export const JSONRPC_INVALID_REQUEST = -32600;
export const JSONRPC_METHOD_NOT_FOUND = -32601;
export const JSONRPC_INVALID_PARAMS = -32602;
export const JSONRPC_INTERNAL_ERROR = -32603;

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: typeof JSONRPC_VERSION;
  id: string | number | null;
  result: unknown;
}

export interface JsonRpcFailure {
  jsonrpc: typeof JSONRPC_VERSION;
  id: string | number | null;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export function rpcSuccess(id: string | number | null, result: unknown): JsonRpcSuccess {
  return { jsonrpc: JSONRPC_VERSION, id, result };
}

export function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcFailure {
  return { jsonrpc: JSONRPC_VERSION, id, error: { code, message, ...(data ? { data } : {}) } };
}

/** A JSON schema fragment. Small on purpose: descriptive, not a validator. */
export type Schema = Record<string, unknown>;

export interface McpTool {
  name: string;
  description: string;
  /** `read` tools are side-effect free; `mutating` tools change persisted state. */
  effect: "read" | "analysis" | "mutating";
  inputSchema: Schema;
}

const stringProp = (description: string, maxLength = 200) => ({
  type: "string",
  description,
  maxLength,
});

export const TOOLS: readonly McpTool[] = [
  {
    name: "list_volumes",
    description:
      "List the reading volumes owned by the calling session, newest first. Read-only.",
    effect: "read",
    inputSchema: {
      type: "object",
      properties: {
        includeRetired: {
          type: "boolean",
          description: "Include volumes that were retired (tombstoned) instead of deleted.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_volume",
    description:
      "Read one volume with its mounted sheets, the audit chain head and its event count. Read-only.",
    effect: "read",
    inputSchema: {
      type: "object",
      properties: { volumeId: stringProp("The volume uuid.", 64) },
      required: ["volumeId"],
      additionalProperties: false,
    },
  },
  {
    name: "coverage_report",
    description: `Run the ${ENGINE_VERSION} coverage engine over a volume: the score, itemised per-class factors, open gaps and a next-read recommendation. Analysis only; writes nothing.`,
    effect: "analysis",
    inputSchema: {
      type: "object",
      properties: {
        volumeId: stringProp("The volume uuid.", 64),
        includeCandidates: {
          type: "boolean",
          description: "Query the live arXiv index for next-read candidates.",
        },
      },
      required: ["volumeId"],
      additionalProperties: false,
    },
  },
  {
    name: "mount_sheet",
    description:
      "Mount an arXiv paper or an open-access bookshelf book into a volume. The server resolves the record from its source, so metadata cannot be spoofed. Idempotent per (volume, source).",
    effect: "mutating",
    inputSchema: {
      type: "object",
      properties: {
        volumeId: stringProp("The volume uuid.", 64),
        sourceKind: { type: "string", enum: ["arxiv", "book"], description: "Which catalogue." },
        sourceId: stringProp("An arXiv id such as 2411.01042, or a bookshelf key.", 64),
        mountedClass: {
          type: "string",
          enum: [
            "deceptive_alignment",
            "reward_misspecification",
            "scalable_oversight",
            "interpretability",
            "value_uncertainty",
            "corrigibility",
            "power_seeking",
            "robustness_fragility",
            "evaluation_rigor",
            "governance_assurance",
          ] satisfies ClassId[],
          description: "Which risk class this sheet is mounted on. Defaults to the strongest match.",
        },
      },
      required: ["volumeId", "sourceKind", "sourceId"],
      additionalProperties: false,
    },
  },
  {
    name: "record_decision",
    description:
      "Record a reading decision (admitted, deferred, rejected) with an optional note, and optionally set the reading status. Seals a new chain event.",
    effect: "mutating",
    inputSchema: {
      type: "object",
      properties: {
        sheetId: stringProp("The sheet uuid.", 64),
        decision: { type: "string", enum: ["admitted", "deferred", "rejected"] },
        status: {
          type: "string",
          enum: ["queued", "reading", "read", "parked", "rejected"] satisfies SheetStatus[],
        },
        note: stringProp("Why. Recorded in the audit chain.", 1000),
      },
      required: ["sheetId", "decision"],
      additionalProperties: false,
    },
  },
  {
    name: "annotate_sheet",
    description: "Write marginalia onto a mounted sheet. The text is stored, never rendered as HTML.",
    effect: "mutating",
    inputSchema: {
      type: "object",
      properties: {
        sheetId: stringProp("The sheet uuid.", 64),
        marginalia: stringProp("Your note on the paper.", 4000),
      },
      required: ["sheetId", "marginalia"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_sheet",
    description:
      "Remove a mounted sheet. This writes a tombstone so the audit chain stays replayable; the volume keeps its seal.",
    effect: "mutating",
    inputSchema: {
      type: "object",
      properties: { sheetId: stringProp("The sheet uuid.", 64) },
      required: ["sheetId"],
      additionalProperties: false,
    },
  },
  {
    name: "verify_chain",
    description:
      "Replay a volume's audit chain and report the first broken link. Analysis only; writes nothing.",
    effect: "analysis",
    inputSchema: {
      type: "object",
      properties: { volumeId: stringProp("The volume uuid.", 64) },
      required: ["volumeId"],
      additionalProperties: false,
    },
  },
];

export function toolNames(): string[] {
  return TOOLS.map((tool) => tool.name);
}

export function serverInfo(name: string, version: string) {
  return { name, version };
}

/** MCP `tools/call` result: content blocks carrying JSON text. */
export function toolResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError,
    structuredContent: payload as Record<string, unknown>,
  };
}

export function capabilities() {
  return { tools: { listChanged: false } };
}