"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Play, Bug } from "lucide-react";
import { BOOKSHELF } from "@/lib/sources/bookshelf";

/**
 * A live MCP client, in the page.
 *
 * Preset calls cover the whole tool surface: protocol handshake, discovery, a read
 * tool, the analysis tool, and a mutating tool that writes through the same service
 * the interface uses. Every response is shown verbatim — including JSON-RPC
 * errors — and anything a call persisted links straight to the record, so the
 * console proves writes happened rather than asserting that they might.
 */
export function AgentConsole({ endpoint }: { endpoint: string }) {
  const [volumeId, setVolumeId] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [bookKey, setBookKey] = useState<string>(BOOKSHELF[0].key);
  const [log, setLog] = useState<
    { label: string; request: unknown; response: unknown; ok: boolean }[]
  >([]);
  const [busy, setBusy] = useState(false);

  async function send(method: string, params: unknown, label: string) {
    setBusy(true);
    const request = { jsonrpc: "2.0", id: Date.now(), method, params };
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await response.json();

      /**
       * A JSON-RPC error is returned with HTTP 200, so an HTTP-only check would
       * report a failed call as "ok". Success here means: the transport worked AND
       * the response carries neither a JSON-RPC `error` nor a tool `isError`.
       */
      const messages: Record<string, unknown>[] = Array.isArray(body) ? body : [body];
      const protocolFailed = messages.some((entry) => {
        const result = entry?.result as { isError?: unknown } | undefined;
        return Boolean(entry?.error) || result?.isError === true;
      });

      setLog((entries) => [
        ...entries,
        { label, request, response: body, ok: response.ok && !protocolFailed },
      ]);
    } catch (error) {
      setLog((entries) => [
        ...entries,
        {
          label,
          request,
          response: { transport: "network error", message: String(error) },
          ok: false,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const presets = [
    {
      id: "list_volumes",
      label: "initialize",
      needsVolume: false,
      run: () => send("initialize", { protocolVersion: "2025-06-18" }, "initialize"),
    },
    { id: "tools_list", label: "tools/list", needsVolume: false, run: () => send("tools/list", {}, "tools/list") },
    {
      id: "list_volumes",
      label: "list_volumes",
      needsVolume: false,
      run: () => send("tools/call", { name: "list_volumes", arguments: {} }, "list_volumes"),
    },
    {
      id: "coverage",
      label: "coverage_report",
      needsVolume: true,
      run: () =>
        send(
          "tools/call",
          { name: "coverage_report", arguments: { volumeId } },
          "coverage_report",
        ),
    },
    {
      id: "mount",
      label: "mount_sheet",
      needsVolume: true,
      run: () =>
        send(
          "tools/call",
          {
            name: "mount_sheet",
            arguments: { volumeId, sourceKind: "book", sourceId: bookKey },
          },
          "mount_sheet",
        ),
    },
    {
      id: "verify",
      label: "verify_chain",
      needsVolume: true,
      run: () => send("tools/call", { name: "verify_chain", arguments: { volumeId } }, "verify_chain"),
    },
    {
      id: "record",
      label: "record_decision",
      needsVolume: false,
      needsSheet: true,
      run: () =>
        send(
          "tools/call",
          {
            name: "record_decision",
            arguments: { sheetId, decision: "admitted", status: "read", note: "Set from the agent console." },
          },
          "record_decision",
        ),
    },
    {
      id: "bad_tool",
      label: "unknown tool (expect -32602)",
      needsVolume: false,
      run: () => send("tools/call", { name: "delete_everything", arguments: {} }, "unknown tool"),
    },
  ];

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
      <section aria-labelledby="console-heading">
        <h2 id="console-heading" className="label-caps">
          Console
        </h2>

        <div className="sheet mt-3 p-4">
          <label htmlFor="console-volume" className="label-caps">
            Volume id
          </label>
          <input
            id="console-volume"
            value={volumeId}
            onChange={(event) => setVolumeId(event.target.value)}
            placeholder="paste a volume id from /shelf"
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-3 py-2 font-[family-name:var(--font-mono)] text-xs"
          />
          <p className="mt-1 font-[family-name:var(--font-body)] text-xs text-ink-faint">
            Copy a volume id from the{" "}
            <Link href="/shelf" className="underline decoration-rule underline-offset-4 hover:text-field">
              shelf
            </Link>
            . The console shares this browser session, so it can read exactly what you can.
          </p>

          <label htmlFor="console-sheet" className="label-caps mt-3 block">
            Sheet id (for record_decision)
          </label>
          <input
            id="console-sheet"
            value={sheetId}
            onChange={(event) => setSheetId(event.target.value)}
            placeholder="paste a sheet id from a volume"
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-3 py-2 font-[family-name:var(--font-mono)] text-xs"
          />

          <label htmlFor="console-book" className="label-caps mt-3 block">
            Bookshelf key (for mount_sheet)
          </label>
          <select
            id="console-book"
            value={bookKey}
            onChange={(event) => setBookKey(event.target.value)}
            className="mt-1 w-full rounded-sm border border-rule bg-paper px-3 py-2 font-[family-name:var(--font-body)] text-sm"
          >
            {BOOKSHELF.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.title}
              </option>
            ))}
          </select>

          <div className="mt-4 flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
onClick={() => {
              void preset.run();
            }}
            disabled={busy || (preset.needsVolume && !volumeId) || ("needsSheet" in preset && preset.needsSheet && !sheetId)}
                className="inline-flex items-center gap-1.5 rounded-sm border border-ink px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] transition-colors hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : preset.id === "bad_tool" ? (
                  <Bug className="h-3 w-3" aria-hidden />
                ) : (
                  <Play className="h-3 w-3" aria-hidden />
                )}
                {preset.label}
              </button>
            ))}
          </div>
          <p className="mt-2 figure text-[0.625rem] text-ink-faint">
            Calls needing a volume or sheet id stay disabled until one is pasted, so a click can
            never send a call that has nothing to act on.
          </p>
        </div>
      </section>

      <section aria-labelledby="transcript-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="transcript-heading" className="label-caps">
            Transcript
          </h2>
          {log.length > 0 ? (
            <button
              type="button"
              onClick={() => setLog([])}
              className="figure text-[0.625rem] text-ink-faint underline decoration-rule underline-offset-4 hover:text-field"
            >
              clear
            </button>
          ) : null}
        </div>

        {log.length === 0 ? (
          <p className="mt-3 rounded-sm border border-rule bg-paper-deep/40 px-3 py-2 font-[family-name:var(--font-body)] text-sm text-ink-soft">
            No calls yet. Run one to see the exact request and response.
          </p>
        ) : (
          <ol className="mt-3 space-y-4">
            {log.map((entry, index) => {
              const persisted = findPersisted(entry.response);
              return (
                // Log entries are append-only and the same call may legitimately
                // repeat, so the position is the identity here.
                <li key={`${entry.label}-${index}`} className="sheet p-3">
                  <p
                    className={`figure text-[0.625rem] uppercase tracking-[0.14em] ${entry.ok ? "text-field" : "text-stamp"}`}
                  >
                    {entry.label} · {entry.ok ? "ok" : "error"}
                  </p>
                  <details className="mt-2">
                    <summary className="figure cursor-pointer text-[0.625rem] text-ink-faint">
                      request and response
                    </summary>
                    <pre className="mt-1.5 max-h-64 overflow-auto scroll-thin rounded-sm border border-rule bg-paper-deep/50 p-2 font-[family-name:var(--font-mono)] text-[0.625rem] leading-relaxed">
{`→ ${JSON.stringify(entry.request, null, 2)}

← ${JSON.stringify(entry.response, null, 2).slice(0, 3000)}`}
                    </pre>
                  </details>
                  {persisted ? (
                    <p className="mt-2 font-[family-name:var(--font-body)] text-sm text-field">
                      Persisted:{" "}
                      <Link
                        href={`/sheet/${persisted.sheetId}`}
                        className="underline decoration-rule underline-offset-4"
                      >
                        {persisted.accession}
                      </Link>{" "}
                      mounted.{" "}
                      <Link
                        href={`/volume/${persisted.volumeId}`}
                        className="underline decoration-rule underline-offset-4"
                      >
                        Open the volume
                      </Link>
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

/** Pull a persisted record out of a tool response so the console can link to it. */
function findPersisted(
  response: unknown,
): { sheetId: string; volumeId: string; accession: string } | null {
  const entries = Array.isArray(response) ? response : [response];
  for (const entry of entries) {
    const result = (entry as { result?: { structuredContent?: unknown } }).result;
    const payload = result?.structuredContent as { sheet?: Record<string, string> } | undefined;
    if (payload?.sheet?.id && payload.sheet.accession) {
      return {
        sheetId: payload.sheet.id,
        volumeId: payload.sheet.volumeId,
        accession: payload.sheet.accession,
      };
    }
  }
  return null;
}