import Link from "next/link";
import { GitHubMark } from "@/components/github-mark";
import { navigation, site } from "@/lib/site";
import { SOURCE_ATTRIBUTION } from "@/lib/sources/resolve";

/**
 * The specimen label at the foot of every sheet: what this is, where the code
 * lives, where the data came from, and the honest limit of what the engine claims.
 */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-paper-edge bg-paper-deep/60">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="label-caps">Herbarium</p>
            <p className="mt-2 max-w-sm font-[family-name:var(--font-body)] text-sm leading-relaxed text-ink-soft">
              A mounted reading catalogue for AI-safety and alignment literature. Mounted papers
              and open-access books, graded by a deterministic coverage engine, sealed into a
              replayable audit chain.
            </p>
            <a
              href={site.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View the source of ${site.name} on GitHub`}
              className="mt-4 inline-flex items-center gap-2 rounded-sm border border-ink px-3 py-2 font-[family-name:var(--font-mono)] text-xs uppercase tracking-[0.14em] transition-colors hover:bg-ink hover:text-paper"
            >
              <GitHubMark className="h-4 w-4" />
              View source on GitHub
            </a>
          </div>

          <nav aria-label="Footer">
            <p className="label-caps">Pages</p>
            <ul className="mt-2 space-y-1.5">
              {[...navigation, { href: "/share", label: "Shared volumes", blurb: "" }].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="font-[family-name:var(--font-body)] text-sm text-ink-soft underline decoration-rule underline-offset-4 hover:text-field hover:decoration-strap"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="label-caps">Endpoints</p>
            <ul className="mt-2 space-y-1.5 font-[family-name:var(--font-mono)] text-xs">
              <li>
                <a
                  href="/api/health"
                  className="text-ink-soft underline decoration-rule underline-offset-4 hover:text-field"
                >
                  /api/health
                </a>
              </li>
              <li>
                <a
                  href="/api/discover/papers"
                  className="text-ink-soft underline decoration-rule underline-offset-4 hover:text-field"
                >
                  /api/discover/papers
                </a>
              </li>
              <li>
                <a
                  href="/api/mcp"
                  className="text-ink-soft underline decoration-rule underline-offset-4 hover:text-field"
                >
                  /api/mcp
                </a>
              </li>
              <li>
                <a
                  href="/mcp.json"
                  className="text-ink-soft underline decoration-rule underline-offset-4 hover:text-field"
                >
                  /mcp.json
                </a>
              </li>
              <li>
                <a
                  href={`${site.repoUrl}/issues`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-soft underline decoration-rule underline-offset-4 hover:text-field"
                >
                  Issues
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-rule pt-4">
          <p className="label-caps">Provenance</p>
          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-ink-faint">
            {SOURCE_ATTRIBUTION.map((attribution) => (
              <li key={attribution}>{attribution}</li>
            ))}
          </ul>
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-ink-faint">
            <strong className="font-semibold text-ink-soft">Not a safety assessment.</strong>{" "}
            Coverage describes what a given volume has read, not what is true about AI systems.
            Nothing here is advice about building or deploying them.
          </p>
          <p className="mt-3 font-[family-name:var(--font-mono)] text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint">
            {site.license} licensed · {site.repoUrl}
          </p>
        </div>
      </div>
    </footer>
  );
}