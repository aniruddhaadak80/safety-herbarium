import { TOOLS, toolNames } from "@/lib/mcp";
import { site } from "@/lib/site";
import { AgentConsole } from "@/components/agent-console";

export const dynamic = "force-dynamic";

/**
 * The agent console.
 *
 * A live MCP client against this deployment's own `/api/mcp`: preloaded one-click
 * calls, the exact request and response for each, real error states, and links to
 * whatever the call persisted. If the endpoint or the store were broken, this page
 * would say so rather than showing a plausible-looking console.
 */
export default function AgentPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="border-b border-ink pb-5">
        <h1 className="font-[family-name:var(--font-bodoni)] text-3xl tracking-tight sm:text-4xl">
          Agent console
        </h1>
        <p className="mt-2 max-w-3xl font-[family-name:var(--font-body)] text-base text-ink-soft">
          A JSON-RPC 2.0 endpoint at{" "}
          <code className="figure text-sm">/api/mcp</code>, speaking the Model Context Protocol.
          Every mutating tool runs the same service function the interface does, scoped to this
          browser session — so an agent and a reader cannot diverge, and neither can see the
          other&apos;s records.
        </p>
      </header>

      <AgentConsole endpoint="/api/mcp" />

      <section className="mt-10 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="tools-heading">
          <h2 id="tools-heading" className="label-caps">
            Tool catalogue
          </h2>
          <ul className="mt-3 space-y-3">
            {TOOLS.map((tool) => (
              <li key={tool.name} className="sheet p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <code className="figure text-sm text-ink">{tool.name}</code>
                  <span
                    className={`figure text-[0.625rem] uppercase tracking-[0.14em] ${
                      tool.effect === "mutating"
                        ? "text-caution"
                        : tool.effect === "analysis"
                          ? "text-field"
                          : "text-ink-faint"
                    }`}
                  >
                    {tool.effect}
                  </span>
                </div>
                <p className="mt-1 font-[family-name:var(--font-body)] text-sm leading-relaxed text-ink-soft">
                  {tool.description}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="wire-heading">
          <h2 id="wire-heading" className="label-caps">
            Wire format
          </h2>
          <p className="mt-2 font-[family-name:var(--font-body)] text-sm text-ink-soft">
            <code className="figure text-xs">GET /api/mcp</code> returns a self-describing manifest,
            so the endpoint is discoverable by a client that only knows the URL.
          </p>
          <pre className="mt-2 overflow-x-auto scroll-thin rounded-sm border border-rule bg-paper-deep/50 p-3 font-[family-name:var(--font-mono)] text-[0.6875rem] leading-relaxed">
{`curl -s ${site.liveUrl}/api/mcp | head -20

curl -s -X POST ${site.liveUrl}/api/mcp \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
          </pre>
          <p className="mt-3 font-[family-name:var(--font-body)] text-sm text-ink-soft">
            {toolNames().length} tools are published at{" "}
            <a href="/mcp.json" className="underline decoration-rule underline-offset-4 hover:text-field">
              /mcp.json
            </a>{" "}
            for client configuration.
          </p>
        </section>
      </section>
    </div>
  );
}