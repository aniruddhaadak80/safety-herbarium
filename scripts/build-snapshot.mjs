#!/usr/bin/env node
/**
 * Regenerate the sealed offline snapshot.
 *
 *   node scripts/build-snapshot.mjs
 *
 * Fetches the discovery feed from the live arXiv index, normalises the records
 * into the same shape the app uses at runtime, and writes
 * `src/lib/sources/snapshot.ts` with a SHA-256 seal over the canonical payload.
 *
 * The snapshot exists so a cold build, an offline dev machine or an arXiv outage
 * still renders a first paint. It is dated, it is sealed, and the API labels
 * every record it serves as `fallback` so nobody mistakes it for current.
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "..", "src", "lib", "sources", "snapshot.ts");

const TERMS = [
  "AI alignment",
  "deceptive alignment",
  "scalable oversight",
  "mechanistic interpretability",
  "reward hacking",
  "corrigibility",
  "power seeking",
  "AI safety evaluation",
  "AI safety governance",
  "red teaming language models",
];

const ENDPOINT = "http://export.arxiv.org/api/query";

function clean(value) {
  return value.replace(/\s+/g, " ").trim();
}

function tag(entry, name) {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(entry);
  return m ? clean(m[1]) : null;
}

function authorsOf(entry) {
  const re = /<author>\s*<name>([\s\S]*?)<\/name>\s*<\/author>/g;
  const out = [];
  let m;
  while ((m = re.exec(entry)) !== null && out.length < 40) out.push(clean(m[1]));
  return out;
}

function licenseOf(entry) {
  const url = /<arxiv:license[^>]*url="([^"]+)"/.exec(entry)?.[1];
  if (!url) return "arXiv non-exclusive licence";
  if (url.includes("creativecommons.org")) {
    const nc = url.includes("by-nc") ? "-NC" : "";
    const nd = url.includes("-nd") ? "-ND" : "";
    const sa = url.includes("-sa") ? "-SA" : "";
    return `CC BY${nc}${nd}${sa}`;
  }
  return "arXiv non-exclusive licence";
}

function primaryCategory(entry) {
  return /<arxiv:primary_category[^>]*term="([^"]+)"/.exec(entry)?.[1] ?? "";
}

/** Mirrors `inferTier` in src/lib/taxonomy.ts. */
function inferTier({ sourceKind, title, abstract, hostLabel }) {
  const text = `${title} ${abstract}`;
  if (sourceKind === "book") return "monograph";
  if (/\bnist\b|\biso\/|standard\b|\bframework\b/i.test(hostLabel) && /\bsurveys?\b/i.test(text) === false) {
    return "standard";
  }
  if (/\bsurveys?\b|\bwe review\b|\ba comprehensive overview\b|\bthis book\b/i.test(text)) return "survey";
  if (/\bwe (argue|claim|contend)\b|\bposition paper\b|\bperspective\b|\bcommentary\b/i.test(text)) return "position";
  if (/\bwe (introduce|present|propose|develop|release)\b|\bexperiments?\b|\bwe (train|evaluate|measure|benchmark)\b|\bwe show\b|\bempirical(?:ly)?\b|\bbenchmark\b/i.test(text)) {
    return "empirical";
  }
  return "theoretical";
}

async function fetchBatch(terms, perTerm) {
  const query = terms.map((t) => `all:"${t}"`).join(" OR ");
  const url = `${ENDPOINT}?search_query=${encodeURIComponent(query)}&start=0&max_results=${perTerm}&sortBy=relevance&sortOrder=descending`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { "user-agent": "safety-herbarium/1.0 (snapshot builder)" },
  });
  if (!response.ok) throw new Error(`arXiv responded ${response.status}`);
  return (await response.text()).split("<entry>").slice(1);
}

const fetchedAt = new Date().toISOString();
const seen = new Map();

for (const term of TERMS) {
  try {
    const entries = await fetchBatch([term], 6);
    for (const entry of entries) {
      const idUrl = tag(entry, "id");
      const title = tag(entry, "title");
      if (!idUrl || !title) continue;
      const sourceId = /(\d{4}\.\d{4,5})/.exec(idUrl)?.[1];
      if (!sourceId || seen.has(sourceId)) continue;
      const abstract = tag(entry, "summary") ?? "";
      const category = primaryCategory(entry);
      const hostLabel = `arXiv ${category || "preprint"}`;
      seen.set(sourceId, {
        sourceKind: "arxiv",
        sourceId,
        title: title.slice(0, 600),
        authors: authorsOf(entry),
        abstract: abstract.slice(0, 8000),
        url: `https://arxiv.org/abs/${sourceId}`,
        pdfUrl: `https://arxiv.org/pdf/${sourceId}`,
        host: "arxiv.org",
        hostLabel,
        license: licenseOf(entry),
        publishedAt: (tag(entry, "published") ?? "").slice(0, 10) || null,
        citations: null,
        provenance: "fallback",
        upstreamId: sourceId,
        fetchedAt,
        attribution:
          "arXiv, arXiv.org — a Cornell University-operated preprint server. Content is licensed by its authors.",
        tier: inferTier({ sourceKind: "arxiv", title, abstract, hostLabel }),
        matchedTerm: term,
      });
    }
    process.stdout.write(`  ${term}: ${entries.length} entries\n`);
  } catch (error) {
    process.stdout.write(`  ${term}: FAILED ${error.message}\n`);
  }
}

const records = [...seen.values()].sort((a, b) => b.sourceId.localeCompare(a.sourceId));

function canonical(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }
  if (typeof value === "number") return Object.is(value, -0) ? "0" : String(value);
  return JSON.stringify(value);
}

const seal = createHash("sha256").update(canonical(records), "utf8").digest("hex");

const body = `/**
 * SEALED OFFLINE SNAPSHOT — generated by scripts/build-snapshot.mjs. Do not edit by hand.
 *
 * Real records retrieved from the arXiv Atom API on ${fetchedAt} and sealed with
 * SHA-256 over the canonical JSON below.
 *
 * Purpose: the discovery page and the coverage recommendations must still render
 * on a cold build, on an offline machine, or while arXiv is slow. Records served
 * from here are marked \`provenance: "fallback"\` and the API says so in its
 * response envelope. They are never presented as current, and they never stand in
 * for user-created rows.
 *
 * seal (sha256, canonical JSON of records): ${seal}
 */

import type { SourceRecord } from "../types";

export interface Snapshot {
  sealedAt: string;
  seal: string;
  terms: readonly string[];
  records: SourceRecord[];
}

export const SNAPSHOT: Snapshot = ${JSON.stringify(
  { sealedAt: fetchedAt, seal, terms: TERMS, records },
  null,
  2,
)};
`;

writeFileSync(out, body, "utf8");
process.stdout.write(`\nWrote ${records.length} records to ${out}\nseal ${seal}\n`);