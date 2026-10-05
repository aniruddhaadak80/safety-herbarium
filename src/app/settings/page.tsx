import { cookies } from "next/headers";
import { getWeights } from "@/lib/service";
import { scopeFingerprint } from "@/lib/session";
import { GAP_THRESHOLD, RISK_CLASSES, SATURATION, STATUS_WEIGHT, TIER_WEIGHT } from "@/lib/taxonomy";
import { ENGINE_VERSION } from "@/lib/engine";
import { WeightTuner } from "@/components/weight-tuner";
import { HealthPanel } from "@/components/health-panel";

export const dynamic = "force-dynamic";

/**
 * Settings: the engine's own constants, the class priors, and the store health.
 *
 * The constants are shown rather than hidden, because a reader comparing two
 * scores needs to know whether the same rules produced both. The session
 * fingerprint is a one-way summary, never the token itself.
 */
export default async function SettingsPage() {
  const scope = (await cookies()).get("hb_scope")?.value ?? "";
  const weights = scope ? await getWeights(scope).catch(() => null) : null;
  const fingerprint = scope ? scopeFingerprint(scope) : "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="border-b border-ink pb-5">
        <h1 className="font-[family-name:var(--font-bodoni)] text-3xl tracking-tight sm:text-4xl">
          Settings
        </h1>
        <p className="mt-2 max-w-3xl font-[family-name:var(--font-body)] text-base text-ink-soft">
          The engine&apos;s constants, your class priors, and which store this deployment is really
          using.
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-6">
          <WeightTuner
            initialWeights={weights ?? Object.fromEntries(RISK_CLASSES.map((c) => [c.id, 1]))}
          />

          <section className="sheet p-4" aria-labelledby="constants-heading">
            <h2 id="constants-heading" className="label-caps">
              Engine constants
            </h2>
            <dl className="mt-3 space-y-2 font-[family-name:var(--font-mono)] text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">version</dt>
                <dd className="text-field">{ENGINE_VERSION}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">saturation</dt>
                <dd className="text-ink-soft">{SATURATION}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">gap threshold</dt>
                <dd className="text-ink-soft">{(GAP_THRESHOLD * 100).toFixed(0)}%</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">classes</dt>
                <dd className="text-ink-soft">{RISK_CLASSES.length}</dd>
              </div>
            </dl>

            <h3 className="label-caps mt-4">Tier weights</h3>
            <dl className="mt-1.5 space-y-1 font-[family-name:var(--font-mono)] text-xs">
              {Object.entries(TIER_WEIGHT).map(([tier, weight]) => (
                <div key={tier} className="flex justify-between gap-3">
                  <dt className="text-ink-faint">{tier}</dt>
                  <dd className="text-ink-soft">{weight}</dd>
                </div>
              ))}
            </dl>

            <h3 className="label-caps mt-4">Status weights</h3>
            <dl className="mt-1.5 space-y-1 font-[family-name:var(--font-mono)] text-xs">
              {Object.entries(STATUS_WEIGHT).map(([status, weight]) => (
                <div key={status} className="flex justify-between gap-3">
                  <dt className="text-ink-faint">{status}</dt>
                  <dd className="text-ink-soft">{weight}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 border-t border-rule pt-3 font-[family-name:var(--font-body)] text-xs leading-relaxed text-ink-faint">
              A rejected sheet contributes nothing. A queued sheet contributes 0.2 of a read sheet&apos;s
              weight, so unread material opens a gap but cannot close one.
            </p>
          </section>
        </div>

        <div className="space-y-6">
          <HealthPanel />

          <section className="sheet p-4" aria-labelledby="session-heading">
            <h2 id="session-heading" className="label-caps">
              This session
            </h2>
            <dl className="mt-3 space-y-2 font-[family-name:var(--font-mono)] text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">ownership</dt>
                <dd className="text-ink-soft">anonymous http-only cookie</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-faint">fingerprint</dt>
                <dd className="text-field">{fingerprint}</dd>
              </div>
            </dl>
            <p className="mt-3 font-[family-name:var(--font-body)] text-xs leading-relaxed text-ink-faint">
              The fingerprint is a one-way summary of your token, shown so you can recognise the
              session without the token ever being displayed. There are no accounts, so clearing
              cookies means losing access to these volumes — export first if they matter.
            </p>
          </section>

          <section className="sheet p-4" aria-labelledby="limits-heading">
            <h2 id="limits-heading" className="label-caps">
              Abuse controls
            </h2>
            <ul className="mt-2 space-y-1.5 font-[family-name:var(--font-body)] text-sm text-ink-soft">
              <li>40 writes per minute per session.</li>
              <li>20 mounts per minute per session.</li>
              <li>12 volume changes per five minutes per session.</li>
            </ul>
            <p className="mt-3 font-[family-name:var(--font-body)] text-xs leading-relaxed text-ink-faint">
              Counters live in the database, not in process memory, so a cold start cannot reset
              them. This is best-effort on serverless: two concurrent requests for a brand-new
              bucket can both insert, so the count can briefly under-report. It reliably stops a
              single misbehaving client. A hard guarantee needs a hosted limiter in front of these
              routes.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}