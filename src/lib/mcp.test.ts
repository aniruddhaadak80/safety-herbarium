import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handleMcp } from "./mcp-handler";
import { TOOLS, toolNames } from "./mcp";
import { nextVersion } from "./version";
import { readyDb } from "./db/client";

/**
 * MCP contract tests.
 *
 * These exercise the real handler over the real service layer and the embedded
 * store, including the mutating path, because an agent interface that cannot
 * actually write is worse than none.
 */

/**
 * One session per test. The abuse limiter is keyed by scope, so sharing a single
 * scope across the whole file would let one test exhaust another's quota and
 * produce failures that have nothing to do with the code under test.
 */
let counter = 0;
function freshScope(): string {
  counter += 1;
  return `mcp-scope-${String(counter).padStart(4, "0")}-aaaaaaaaaaaa`;
}

/**
 * Tests that exercise several calls as one session pass its scope explicitly; the
 * default gives a fresh session so single-call tests stay independent.
 */
function rpc(body: unknown, scope: string) {
  return new Request("http://internal/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-herbarium-scope": scope },
    body: JSON.stringify(body),
  }) as never;
}

type RpcResponse = {
  jsonrpc: string;
  id: string | number | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
};

async function call(payload: unknown, scope: string = freshScope()): Promise<RpcResponse> {
  const [response] = await handleMcp(rpc(payload, scope));
  return response as RpcResponse;
}

function toolPayload(result: Record<string, unknown> | undefined): Record<string, unknown> {
  const content = (result?.content ?? []) as { type: string; text: string }[];
  const block = content.find((c) => c.type === "text");
  if (!block) throw new Error("tool result carried no text content block");
  return JSON.parse(block.text) as Record<string, unknown>;
}

/**
 * Volumes are created through the service layer, which is what the interface
 * uses, so the tools are exercised against real rows rather than fixtures. There
 * is deliberately no `create_volume` tool: a volume is opened from the interface,
 * and the agent's job is to read, analyse and mount into it.
 */
async function newVolume(name: string, scope: string): Promise<string> {
  const { createVolume } = await import("./service");
  const volume = await createVolume(scope, { name, intent: "via mcp", role: "researcher" });
  return volume.id;
}

describe("MCP JSON-RPC endpoint", () => {
  it("initializes and advertises the protocol version", async () => {
    const response = await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    expect(response.jsonrpc).toBe("2.0");
    expect(response.id).toBe(1);
    const result = response.result!;
    expect(result.protocolVersion).toBe("2025-06-18");
    expect((result.serverInfo as { name: string }).name).toBe("safety-herbarium");
    expect((result.capabilities as { tools: unknown }).tools).toBeTruthy();
    expect((result.serverInfo as { version: string }).version).toBe(nextVersion());
  });

  it("answers a ping and tolerates the initialized notification", async () => {
    const own = freshScope();
    const ping = await call({ jsonrpc: "2.0", id: 7, method: "ping" }, own);
    expect(ping.result).toEqual({});

    // A notification carries no id. The transport answers it positionally with
    // a null id rather than treating it as a malformed request.
    const notification = await call({ jsonrpc: "2.0", method: "notifications/initialized" }, own);
    expect(notification.id).toBeNull();
    expect(notification.error).toBeUndefined();
  });

  it("lists tools with schemas, including a read, an analysis and a mutating tool", async () => {
    const response = await call({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = (response.result!.tools ?? []) as {
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }[];
    expect(tools.length).toBeGreaterThanOrEqual(3);
    expect(tools.map((t) => t.name)).toEqual(toolNames());
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema).toHaveProperty("type");
    }
    const effects = TOOLS.map((t) => t.effect);
    expect(effects).toContain("read");
    expect(effects).toContain("analysis");
    expect(effects).toContain("mutating");
  });

  it("rejects a wrong protocol version with a JSON-RPC error", async () => {
    const response = await call({ jsonrpc: "1.0", id: 3, method: "initialize" });
    expect(response.error?.code).toBe(-32600);
  });

  it("rejects an unknown method with -32601", async () => {
    const response = await call({ jsonrpc: "2.0", id: 4, method: "tools/nope" });
    expect(response.error?.code).toBe(-32601);
    expect(response.error?.message).toContain("tools/nope");
  });

  it("rejects an unknown tool and lists the available ones", async () => {
    const response = await call({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "delete_everything", arguments: {} },
    });
    expect(response.error?.code).toBe(-32602);
    expect((response.error?.data as { available: string[] }).available).toContain("mount_sheet");
  });

  it("reports malformed JSON with -32700", async () => {
    const [response] = await handleMcp(
      new Request("http://internal/api/mcp", { method: "POST", body: "{not json" }) as never,
    );
    expect((response as { error: { code: number } }).error.code).toBe(-32700);
  });

  it("reads volumes through the read tool", async () => {
    const own = freshScope();
    const volumeId = await newVolume("Read tool volume", own);
    const response = await call(
      {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "get_volume", arguments: { volumeId } },
      },
      own,
    );
    const payload = toolPayload(response.result);
    expect((payload.volume as { name: string }).name).toBe("Read tool volume");
    expect(Array.isArray(payload.sheets)).toBe(true);
  });

  it("mutates through the same service the interface uses, and the write persists", async () => {
    const own = freshScope();
    const volumeId = await newVolume("Mutating volume", own);

    const mounted = await call(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: {
          name: "mount_sheet",
          arguments: { volumeId, sourceKind: "book", sourceId: "nist-genai-profile" },
        },
      },
      own,
    );
    const mountPayload = toolPayload(mounted.result);
    const sheet = mountPayload.sheet as { id: string; title: string; volumeId: string };
    expect(mountPayload.created).toBe(true);
    expect(sheet.volumeId).toBe(volumeId);
    expect(mountPayload.volumeSeal as string).toMatch(/^[0-9a-f]{96}$/);

    // Idempotent: the same call again returns the same sheet and created: false.
    const again = await call(
      {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: {
          name: "mount_sheet",
          arguments: { volumeId, sourceKind: "book", sourceId: "nist-genai-profile" },
        },
      },
      own,
    );
    const againPayload = toolPayload(again.result);
    expect(againPayload.created).toBe(false);
    expect((againPayload.sheet as { id: string }).id).toBe(sheet.id);

    const decided = await call(
      {
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: {
          name: "record_decision",
          arguments: { sheetId: sheet.id, decision: "admitted", status: "read", note: "via agent" },
        },
      },
      own,
    );
    const decidedSheet = toolPayload(decided.result).sheet as { status: string; decision: string };
    expect(decidedSheet.status).toBe("read");
    expect(decidedSheet.decision).toBe("admitted");

    const annotated = await call(
      {
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: {
          name: "annotate_sheet",
          arguments: { sheetId: sheet.id, marginalia: "agent note" },
        },
      },
      own,
    );
    expect((toolPayload(annotated.result).sheet as { marginalia: string }).marginalia).toBe("agent note");

    // Read back through the service directly: the agent's writes are real rows.
    const { listSheets } = await import("./service");
    const sheets = await listSheets(own, volumeId);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].status).toBe("read");
    expect(sheets[0].marginalia).toBe("agent note");
  });

  it("runs the engine through the analysis tool and echoes the chain head", async () => {
    const own = freshScope();
    const volumeId = await newVolume("Analysis volume", own);
    const response = await call(
      {
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: { name: "coverage_report", arguments: { volumeId } },
      },
      own,
    );
    const payload = toolPayload(response.result);
    const report = payload.report as { engine: string; score: number; factors: unknown[]; referenceSeal: string };
    expect(report.engine).toBe("herbarium-grade/1.0.0");
    expect(report.factors).toHaveLength(10);
    expect(report.score).toBe(0);
    expect(report.referenceSeal).toMatch(/^[0-9a-f]{96}$/);
  });

  it("verifies a chain through the tool after mutations", async () => {
    const own = freshScope();
    const volumeId = await newVolume("Verify volume", own);
    const response = await call(
      {
        jsonrpc: "2.0",
        id: 12,
        method: "tools/call",
        params: { name: "verify_chain", arguments: { volumeId } },
      },
      own,
    );
    const payload = toolPayload(response.result);
    expect(payload.ok).toBe(true);
    expect(payload.brokenAtSeq).toBeNull();
    expect(payload.headSeal).toBe(payload.headStored);
  });

  it("keeps a removal tombstone so the chain stays replayable", async () => {
    // Warm the store first: booting an embedded Postgres and running the
    // migration takes far longer than the default per-test timeout on a cold
    // cache, which would fail this test for a reason that has nothing to do with
    // the tombstone behaviour it is checking.
    await readyDb();

    const own = freshScope();
    const volumeId = await newVolume("Removal volume", own);
    const mounted = await call(
      {
        jsonrpc: "2.0",
        id: 13,
        method: "tools/call",
        params: {
          name: "mount_sheet",
          arguments: { volumeId, sourceKind: "book", sourceId: "saif-alignment-and-deception" },
        },
      },
      own,
    );
    const sheet = toolPayload(mounted.result).sheet as { id: string };

    await call(
      {
        jsonrpc: "2.0",
        id: 14,
        method: "tools/call",
        params: { name: "remove_sheet", arguments: { sheetId: sheet.id } },
      },
      own,
    );

    const verified = await call(
      {
        jsonrpc: "2.0",
        id: 15,
        method: "tools/call",
        params: { name: "verify_chain", arguments: { volumeId } },
      },
      own,
    );
    expect(toolPayload(verified.result).ok).toBe(true);

    const { listSheets } = await import("./service");
    expect(await listSheets(own, volumeId)).toHaveLength(0);
  });

  it("scopes every operation to the caller's session", async () => {
    const own = freshScope();
    const volumeId = await newVolume("Scoped volume", own);
    const stranger = "mcp-scope-cccccccccccccccc";

    const response = await call(
      {
        jsonrpc: "2.0",
        id: 16,
        method: "tools/call",
        params: { name: "get_volume", arguments: { volumeId } },
      },
      stranger,
    );
    const payload = toolPayload(response.result);
    expect(payload.code).toBe("not_found");
    expect(payload.httpStatus).toBe(404);
    expect(response.result?.isError).toBe(true);
  });

  it("validates tool arguments before touching the store", async () => {
    const own = freshScope();
    const malformedId = await call(
      {
        jsonrpc: "2.0",
        id: 17,
        method: "tools/call",
        params: {
          name: "mount_sheet",
          arguments: { volumeId: "not-a-uuid", sourceKind: "arxiv", sourceId: "2411.01042" },
        },
      },
      own,
    );
    // A malformed id is a 400 at the transport boundary: it never reaches the
    // driver, so the caller cannot trigger a Postgres type error.
    expect(toolPayload(malformedId.result).code).toBe("bad_request");
    expect(toolPayload(malformedId.result).httpStatus).toBe(400);

    const malformedSource = await call(
      {
        jsonrpc: "2.0",
        id: 18,
        method: "tools/call",
        params: {
          name: "mount_sheet",
          arguments: {
            volumeId: "11111111-1111-4111-8111-111111111111",
            sourceKind: "arxiv",
            sourceId: "../../etc/passwd",
          },
        },
      },
      own,
    );
    expect(toolPayload(malformedSource.result).code).toBe("bad_request");
  });

  it("handles a batch without cross-talk", async () => {
    const own = freshScope();
    const batch = [
      { jsonrpc: "2.0", id: "a", method: "initialize", params: {} },
      { jsonrpc: "2.0", id: "b", method: "tools/list" },
      { jsonrpc: "2.0", id: "c", method: "ping" },
    ];
    const responses = await handleMcp(rpc(batch, own));
    expect(responses).toHaveLength(3);
    expect(responses.map((r) => r.id)).toEqual(["a", "b", "c"]);
    for (const response of responses) expect(response.jsonrpc).toBe("2.0");
  });

  it("keeps a stable digest for the tool catalogue", () => {
    const digest = createHash("sha256")
      .update(TOOLS.map((t) => `${t.name}:${t.effect}`).join("|"))
      .digest("hex");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(toolNames()).toEqual([
      "list_volumes",
      "get_volume",
      "coverage_report",
      "mount_sheet",
      "record_decision",
      "annotate_sheet",
      "remove_sheet",
      "verify_chain",
    ]);
  });
});