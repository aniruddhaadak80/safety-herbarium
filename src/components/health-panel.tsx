"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Store health, read from the live endpoint rather than assumed.
 *
 * The health route executes a real query against the configured adapter, so this
 * panel can tell a visitor whether writes will survive. A degraded store is shown
 * as degraded rather than hidden.
 */
export function HealthPanel() {
  const [state, setState] = useState<
    | { kind: "loading" }
    | {
        kind: "done";
        status: string;
        store: {
          kind: string;
          reachable: boolean;
          hosted: boolean;
          productionSafe: boolean;
          latencyMs: number;
          error: string | null;
        };
        catalogue: { riskClasses: number; openAccessBooks: number; snapshotRecords: number };
        engine: string;
      }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled) setState({ kind: "done", ...payload });
      } catch {
        if (!cancelled) {
          setState({
            kind: "done",
            status: "unreachable",
            store: {
              kind: "unknown",
              reachable: false,
              hosted: false,
              productionSafe: false,
              latencyMs: 0,
              error: "The health endpoint did not answer.",
            },
            catalogue: { riskClasses: 0, openAccessBooks: 0, snapshotRecords: 0 },
            engine: "unknown",
          });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <section className="sheet p-4">
        <h2 className="label-caps">Store health</h2>
        <p className="mt-2 inline-flex items-center gap-2 font-[family-name:var(--font-mono)] text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          checking
        </p>
      </section>
    );
  }

  const healthy = state.store.reachable && state.status === "ok";

  return (
    <section className="sheet p-4" aria-labelledby="health-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="health-heading" className="label-caps">
          Store health
        </h2>
        <span
          className={`figure text-[0.625rem] uppercase tracking-[0.14em] ${healthy ? "text-field" : "text-stamp"}`}
        >
          {state.status}
        </span>
      </div>

      <dl className="mt-3 space-y-1.5 font-[family-name:var(--font-mono)] text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-faint">adapter</dt>
          <dd className="text-ink-soft">{state.store.kind}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-faint">reachable</dt>
          <dd className={state.store.reachable ? "text-field" : "text-stamp"}>
            {state.store.reachable ? "yes" : "no"}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-faint">latency</dt>
          <dd className="text-ink-soft">{state.store.latencyMs}ms</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-faint">engine</dt>
          <dd className="text-ink-soft">{state.engine}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-faint">snapshot</dt>
          <dd className="text-ink-soft">{state.catalogue.snapshotRecords} records</dd>
        </div>
      </dl>

      {!state.store.productionSafe ? (
        <p className="mt-3 font-[family-name:var(--font-body)] text-xs leading-relaxed text-stamp">
          This deployment is using the embedded local store, which does not survive a cold start.
          That is fine for development and is refused automatically on Vercel.
        </p>
      ) : null}

      {state.store.error ? (
        <p className="mt-2 font-[family-name:var(--font-body)] text-xs text-stamp">
          {state.store.error}
        </p>
      ) : null}
    </section>
  );
}