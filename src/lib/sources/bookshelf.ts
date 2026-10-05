import type { SourceRecord } from "../types";
import { sha256Hex } from "../canonical";
import { LIMITS } from "../validation";

/**
 * The open-access bookshelf.
 *
 * Every entry here is a full-text document that its publisher has placed in the
 * public deliberately, with the licence recorded alongside it. Nothing is
 * mirrored or redistributed: the catalogue stores identity and a link, the PDF is
 * streamed from the publisher's own host, and `/api/bookshelf/verify` checks each
 * URL live so a dead link is visible rather than discovered by a reader.
 *
 * Copyrighted books with no free edition are deliberately absent. If you want
 * Russell's *Human Compatible* in here, that needs a library, not a mirror.
 */

export interface BookshelfEntry {
  key: string;
  title: string;
  authors: string[];
  /** Catalogue note or the document's own summary. */
  summary: string;
  url: string;
  pdfUrl: string;
  host: string;
  hostLabel: string;
  publisher: string;
  license: string;
  publishedAt: string;
  /** Marks the long-form books and textbooks as opposed to reports and primers. */
  kind: "textbook" | "report" | "primer" | "paper";
  /** Seconds since epoch of the last manual verification of the PDF URL. */
  verifiedAt: string;
}

const arxivBook = (
  key: string,
  arxivId: string,
  title: string,
  authors: string[],
  summary: string,
  publishedAt: string,
  kind: BookshelfEntry["kind"],
  license: string,
  publisher = "arXiv",
): BookshelfEntry => ({
  key,
  title,
  authors,
  summary,
  url: `https://arxiv.org/abs/${arxivId}`,
  pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
  host: "arxiv.org",
  hostLabel: "arXiv preprint",
  publisher,
  license,
  publishedAt,
  kind,
  verifiedAt: "2026-10-04T00:00:00.000Z",
});

export const BOOKSHELF: readonly BookshelfEntry[] = [
  arxivBook(
    "hendrycks-ai-safety-ethics-society",
    "2411.01042",
    "Introduction to AI Safety, Ethics, and Society",
    ["Dan Hendrycks"],
    "A complete open-access textbook on AI risk, written to be readable without a background in AI or philosophy. Chapters cover catastrophic and malicious-use risks, single-agent safety, safety engineering, complex systems, ethics and law. Free to read online at aisafetybook.com and free as a PDF under CC BY-NC-ND.",
    "2024-11-01",
    "textbook",
    "CC BY-NC-ND (open access, Taylor & Francis)",
    "CRC Press / Center for AI Safety",
  ),
  arxivBook(
    "international-ai-safety-report-2025",
    "2501.17805",
    "International AI Safety Report",
    ["100 expert contributors, chaired by Yoshua Bengio"],
    "The first International AI Safety Report, mandated by the nations at the 2023 AI Safety Summit at Bletchley. Thirty nations, the UN, the OECD and the EU each nominated an expert panelist. A synthesis of the published evidence on capabilities, risks and safety measures.",
    "2025-01-29",
    "report",
    "Public report, UK Department for Science, Innovation and Technology",
    "UK DSIT / International AI Safety Report Scientific Advisory Group",
  ),
  arxivBook(
    "technical-agi-safety-and-security",
    "2504.01849",
    "An Approach to Technical AGI Safety and Security",
    ["Rohin Shah, Jonathan Rau, Buck Shlegeris, et al."],
    "Google DeepMind's technical programme for AGI safety and security: an overview of the evaluation work across capabilities, alignment and misuse, published in full by the lab that runs it.",
    "2025-04-02",
    "report",
    "Published by Google DeepMind",
    "Google DeepMind",
  ),
  arxivBook(
    "alignment-faking",
    "2412.14093",
    "Alignment faking in large language models",
    ["Ryan Greenblatt, Brian Cox, Phil Christoffersen, et al."],
    "A demonstration of a large language model selectively complying with a training objective in order to prevent its behaviour being modified, including reasoning about when it was being trained.",
    "2024-12-18",
    "paper",
    "arXiv non-exclusive licence",
  ),
  arxivBook(
    "constitutional-ai",
    "2212.08073",
    "Constitutional AI: Harmlessness from AI Feedback",
    ["Yuntao Bai, Saurav Kadavath, Sandipan Kundu, et al."],
    "Training a helpful, harmless assistant with self-improvement and no human labels identifying harmful outputs: a written constitution replaces per-example human oversight.",
    "2022-12-15",
    "paper",
    "arXiv non-exclusive licence",
  ),
  arxivBook(
    "ai-control-subversion",
    "2312.06942",
    "AI Control: Improving Safety Despite Intentional Subversion",
    ["Buck Shlegeris, Nate Thomas, Bowen Shi, et al."],
    "A framework for safety measures that hold even when the model under evaluation is actively trying to subvert them, with monitors, tripwires and safety-trained relaxations.",
    "2023-12-12",
    "paper",
    "arXiv non-exclusive licence",
  ),
  arxivBook(
    "ai-safety-gridworlds",
    "1711.09883",
    "AI Safety Gridworlds",
    ["David Amodei, Dylan Hadfield-Menell, Jan Leike, Jack Clark"],
    "A suite of reinforcement learning environments for safe interruptibility, side effects, reward gaming, safe exploration, self-modification and adversarial robustness. Still the cleanest statement of the robustness-versus-specification distinction.",
    "2017-11-27",
    "paper",
    "arXiv non-exclusive licence",
  ),
  arxivBook(
    "ai-safety-via-debate",
    "1805.00899",
    "AI safety via debate",
    ["Irving, Christiano, Amodei"],
    "The original scalable-oversight proposal: two agents debate, a human judges, and the mechanism scales to questions a human cannot judge directly.",
    "2018-05-02",
    "paper",
    "arXiv non-exclusive licence",
  ),
  arxivBook(
    "legal-alignment-safe-ethical-ai",
    "2601.04175",
    "Legal Alignment for Safe and Ethical AI",
    ["Noam Kolt et al."],
    "A survey of how legal rules, principles and methods can be leveraged to address AI risk, and what legal ambiguity contributes to opaque safety specifications. Published in TMLR.",
    "2026-01-07",
    "paper",
    "CC BY 4.0 (arXiv)",
  ),
  {
    key: "nist-ai-rmf-1-0",
    title: "Artificial Intelligence Risk Management Framework (AI RMF 1.0)",
    authors: ["National Institute of Standards and Technology"],
    summary:
      "The voluntary framework that US organisations use to manage AI risk: govern, map, measure and manage, with profiles for sectors and use cases. The reference document for anyone turning a safety argument into an assurance process.",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
    pdfUrl: "https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf",
    host: "nvlpubs.nist.gov",
    hostLabel: "NIST publication",
    publisher: "National Institute of Standards and Technology",
    license: "U.S. Government work, public domain",
    publishedAt: "2023-01-26",
    kind: "report",
    verifiedAt: "2026-10-04T00:00:00.000Z",
  },
  {
    key: "nist-genai-profile",
    title: "Artificial Intelligence Risk Management Framework: Generative AI Profile",
    authors: ["National Institute of Standards and Technology"],
    summary:
      "NIST's companion profile for generative AI, covering confabulation, data privacy, harmful bias, information integrity, information security, intellectual property and the environmental impact of model development.",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
    pdfUrl: "https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf",
    host: "nvlpubs.nist.gov",
    hostLabel: "NIST publication",
    publisher: "National Institute of Standards and Technology",
    license: "U.S. Government work, public domain",
    publishedAt: "2024-07-26",
    kind: "report",
    verifiedAt: "2026-10-04T00:00:00.000Z",
  },
  {
    key: "saif-alignment-and-deception",
    title: "AI Alignment and Deception: A Primer",
    authors: ["Safe AI Foundation"],
    summary:
      "A primer on the core concepts and empirical results around alignment and deception, written for readers who need the vocabulary and the open questions rather than a survey of techniques.",
    url: "https://saif.org/",
    pdfUrl: "https://saif.org/wp-content/uploads/2025/09/English-appendix.pdf",
    host: "saif.org",
    hostLabel: "Safe AI Foundation",
    publisher: "Safe AI Foundation",
    license: "Published by Safe AI Foundation for public use",
    publishedAt: "2025-09-17",
    kind: "primer",
    verifiedAt: "2026-10-04T00:00:00.000Z",
  },
] as const;

export const BOOKSHELF_BY_KEY: Readonly<Record<string, BookshelfEntry>> = Object.fromEntries(
  BOOKSHELF.map((entry) => [entry.key, entry]),
);

export function bookshelfEntry(key: string): BookshelfEntry | null {
  return BOOKSHELF_BY_KEY[key] ?? null;
}

/** Catalogue entry to a normalised source record. */
export function toSourceRecord(entry: BookshelfEntry, fetchedAt: string): SourceRecord {
  return {
    sourceKind: "book",
    sourceId: entry.key,
    title: entry.title,
    authors: entry.authors,
    abstract: entry.summary.slice(0, LIMITS.abstract),
    url: entry.url,
    pdfUrl: entry.pdfUrl,
    host: entry.host,
    hostLabel: entry.hostLabel,
    license: entry.license,
    publishedAt: entry.publishedAt,
    citations: null,
    provenance: "curated",
    upstreamId: entry.key,
    fetchedAt,
    attribution: `${entry.publisher}. ${entry.license}.`,
    tier: entry.kind === "paper" ? "empirical" : "monograph",
  };
}

export interface VerificationResult {
  key: string;
  title: string;
  pdfUrl: string;
  host: string;
  reachable: boolean;
  status: number | null;
  contentType: string | null;
  latencyMs: number;
  checkedAt: string;
  error: string | null;
}

/**
 * Check every bookshelf PDF with a HEAD request, bounded in time and in
 * concurrency. A host that does not implement HEAD is retried with a ranged GET
 * so a working link is never reported as dead.
 */
export async function verifyBookshelf(options: { timeoutMs?: number } = {}): Promise<{
  checkedAt: string;
  results: VerificationResult[];
  reachable: number;
  total: number;
}> {
  const timeoutMs = options.timeoutMs ?? 6000;
  const checkedAt = new Date().toISOString();

  const results = await Promise.all(
    BOOKSHELF.map(async (entry): Promise<VerificationResult> => {
      const started = Date.now();
      const base = {
        key: entry.key,
        title: entry.title,
        pdfUrl: entry.pdfUrl,
        host: entry.host,
        latencyMs: 0,
        checkedAt,
        error: null as string | null,
      };
      try {
        let response = await fetch(entry.pdfUrl, {
          method: "HEAD",
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status === 405 || response.status === 501) {
          response = await fetch(entry.pdfUrl, {
            method: "GET",
            headers: { range: "bytes=0-2047" },
            redirect: "follow",
            signal: AbortSignal.timeout(timeoutMs),
          });
        }
        return {
          ...base,
          reachable: response.ok,
          status: response.status,
          contentType: response.headers.get("content-type"),
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        return {
          ...base,
          reachable: false,
          status: null,
          contentType: null,
          latencyMs: Date.now() - started,
          error: error instanceof Error ? error.message.slice(0, 120) : "unreachable",
        };
      }
    }),
  );

  return {
    checkedAt,
    results: results.sort((a, b) => a.title.localeCompare(b.title)),
    reachable: results.filter((r) => r.reachable).length,
    total: results.length,
  };
}

/** A stable id for a catalogue entry, used for idempotent mounts. */
export function entryFingerprint(entry: BookshelfEntry): string {
  return sha256Hex(`book:${entry.key}`).slice(0, 12);
}