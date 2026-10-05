/**
 * Single source of truth for everything that names the product or points at it.
 *
 * The GitHub URL and the live URL are written here and nowhere else: the shared
 * header, the mobile menu, the landing CTA, the footer, the OpenGraph metadata,
 * the sitemap and `public/mcp.json` all read from this module, so a rename is a
 * one-line change and the repository link can never drift out of sync with the
 * footer.
 */

const PRODUCTION_URL = "https://safety-herbarium.vercel.app";
const REPO_SLUG = "aniruddhaadak80/safety-herbarium";

const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();

/** Public base URL, no trailing slash. Falls back to the deployed alias. */
export const liveUrl = (configured && configured.length > 0 ? configured : PRODUCTION_URL).replace(
  /\/+$/,
  "",
);

export const site = {
  name: "Safety Herbarium",
  shortName: "Herbarium",
  tagline: "Mount AI-safety literature. Let the coverage engine find your gaps.",
  description:
    "A mounted reading catalogue for AI-safety and alignment literature. Pull live arXiv papers and open-access safety textbooks off the discovery rail, mount them into a reading volume, and a deterministic, explainable engine shows which risk classes that volume actually covers and which are still open.",
  repoUrl: `https://github.com/${REPO_SLUG}`,
  repoSlug: REPO_SLUG,
  liveUrl,
  issuesUrl: `https://github.com/${REPO_SLUG}/issues`,
  agentEndpoint: `${liveUrl}/api/mcp`,
  license: "MIT",
  author: "aniruddhaadak80",
} as const;

export type NavItem = { href: string; label: string; blurb: string };

export const navigation: readonly NavItem[] = [
  { href: "/shelf", label: "Shelf", blurb: "Your reading volumes" },
  { href: "/discover", label: "Discover", blurb: "Live arXiv index and open-access bookshelf" },
  { href: "/coverage", label: "Coverage", blurb: "Run the engine over a volume" },
  { href: "/agent", label: "Agent", blurb: "Live MCP console" },
  { href: "/export", label: "Export", blurb: "Syllabus, BibTeX, CSV" },
  { href: "/verify", label: "Verify", blurb: "Replay an audit chain" },
  { href: "/settings", label: "Settings", blurb: "Engine weights and session scope" },
];

export const externalNavigation = [
  { href: site.repoUrl, label: "GitHub" },
  { href: `${site.liveUrl}/api/health`, label: "API" },
] as const;

export function absolute(path: string): string {
  return `${liveUrl}${path.startsWith("/") ? path : `/${path}`}`;
}