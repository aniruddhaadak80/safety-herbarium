import type { SourceRecord } from "../types";
import { inferTier } from "../taxonomy";
import { LIMITS } from "../validation";
import { buildSafetyQuery, queryForClass } from "./queries";

/**
 * The arXiv Atom API.
 *
 * Keyless, public, no account. Every request is time-bounded with a single
 * bounded retry, so a slow upstream degrades into the sealed snapshot rather than
 * into a hung page.
 */

const ENDPOINT = "http://export.arxiv.org/api/query";
const TIMEOUT_MS = 8000;
const RETRIES = 1;

export const ARXIV_ATTRIBUTION =
  "arXiv, arXiv.org — a Cornell University-operated preprint server. Content is licensed by its authors.";

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function tag(entry: string, name: string): string | null {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`);
  const match = re.exec(entry);
  return match ? clean(match[1]) : null;
}

function authorsOf(entry: string): string[] {
  const re = /<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g;
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(entry)) !== null) {
    out.push(clean(match[1]));
    if (out.length >= 40) break;
  }
  return out;
}

/** arXiv exposes the licence as a link; report only the short name we can justify. */
function licenseOf(entry: string): string | null {
  const re = /<arxiv:license[^>]*url="([^"]+)"[^>]*\/?>/;
  const url = re.exec(entry)?.[1];
  if (!url) return null;
  if (url.includes("creativecommons.org")) {
    const nc = url.includes("by-nc") ? "-NC" : "";
    const nd = url.includes("-nd") ? "-ND" : "";
    const sa = url.includes("-sa") ? "-SA" : "";
    return `CC BY${nc}${nd}${sa}`;
  }
  return "arXiv non-exclusive licence";
}

function primaryCategory(entry: string): string {
  return /<arxiv:primary_category[^>]*term="([^"]+)"/.exec(entry)?.[1] ?? "";
}

/** `http://arxiv.org/abs/2411.01042v2` -> `2411.01042` */
export function stripArxivVersion(value: string): string {
  return /(\d{4}\.\d{4,5})v?\d*\/?$/.exec(value)?.[1] ?? value.trim();
}

function recordFromEntry(entry: string, fetchedAt: string): SourceRecord | null {
  const idUrl = tag(entry, "id");
  const title = tag(entry, "title");
  if (!idUrl || !title) return null;

  const sourceId = stripArxivVersion(idUrl);
  const abstract = (tag(entry, "summary") ?? "").slice(0, LIMITS.abstract);
  const category = primaryCategory(entry);
  const hostLabel = `arXiv ${category || "preprint"}`;

  return {
    sourceKind: "arxiv",
    sourceId,
    title: title.slice(0, LIMITS.title),
    authors: authorsOf(entry),
    abstract,
    url: `https://arxiv.org/abs/${sourceId}`,
    pdfUrl: `https://arxiv.org/pdf/${sourceId}`,
    host: "arxiv.org",
    hostLabel,
    license: licenseOf(entry),
    publishedAt: (tag(entry, "published") ?? "").slice(0, 10) || null,
    citations: null,
    provenance: "live",
    upstreamId: sourceId,
    fetchedAt,
    attribution: ARXIV_ATTRIBUTION,
    tier: inferTier({ sourceKind: "arxiv", title, abstract, hostLabel }),
  };
}

async function request(query: string, limit: number, sortBy: "relevance" | "submittedDate"): Promise<string> {
  const url =
    `${ENDPOINT}?search_query=${encodeURIComponent(query)}` +
    `&start=0&max_results=${limit}&sortBy=${sortBy}&sortOrder=descending`;
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": "safety-herbarium/1.0 (open-source AI-safety reading catalogue)" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`arXiv responded ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("arXiv unreachable");
}

export interface ArxivSearchOptions {
  limit?: number;
  sort?: "relevance" | "recent";
}

/** Search the live index. Returns records already normalised for the UI. */
export async function searchArxiv(options: ArxivSearchOptions = {}): Promise<SourceRecord[]> {
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 40);
  const sortBy = options.sort === "recent" ? "submittedDate" : "relevance";
  const query = buildSafetyQuery();
  const xml = await request(query, limit, sortBy);
  const fetchedAt = new Date().toISOString();
  return xml
    .split("<entry>")
    .slice(1)
    .map((entry) => recordFromEntry(entry, fetchedAt))
    .filter((record): record is SourceRecord => record !== null);
}

/** Resolve one arXiv id to its canonical record. Used when mounting a sheet. */
export async function arxivById(sourceId: string): Promise<SourceRecord | null> {
  const xml = await request(`id_list=${sourceId}`, 1, "relevance");
  const entry = xml.split("<entry>").slice(1)[0];
  if (!entry) return null;
  return recordFromEntry(entry, new Date().toISOString());
}

/** Fetch a slice of the live index for one risk class, for the coverage page. */
export async function searchArxivForQuery(
  classId: string,
  limit = 6,
): Promise<SourceRecord[]> {
  const query = queryForClass(classId);
  if (!query) return [];
  const xml = await request(query, Math.min(Math.max(limit, 1), 20), "relevance");
  const fetchedAt = new Date().toISOString();
  return xml
    .split("<entry>")
    .slice(1)
    .map((entry) => recordFromEntry(entry, fetchedAt))
    .filter((record): record is SourceRecord => record !== null);
}