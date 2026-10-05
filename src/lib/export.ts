import type { Sheet, Volume } from "./types";
import { CLASS_BY_ID } from "./taxonomy";
import { canonicalJson, sha256Hex } from "./canonical";
import type { CoverageReport } from "./engine";
import { SOURCE_ATTRIBUTION } from "./sources/resolve";

/**
 * Takeaway artifacts.
 *
 * A reading volume is worth something only if it leaves the app. Four formats,
 * all generated from the same persisted rows: a Markdown syllabus a reader can
 * paste anywhere, a BibTeX block for a reference manager, a CSV for a
 * spreadsheet, and the sealed JSON itself, which anyone can re-verify against
 * the replay endpoint.
 *
 * Every artifact carries source attribution and a generation timestamp, because
 * a syllabus that silently loses its provenance is worse than no syllabus.
 */

export const EXPORT_FORMATS = ["markdown", "bibtex", "csv", "json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_CONTENT_TYPES: Record<ExportFormat, string> = {
  markdown: "text/markdown; charset=utf-8",
  bibtex: "application/x-bibtex; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
};

export function exportFilename(volume: Volume, format: ExportFormat): string {
  const slug =
    volume.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "volume";
  return `${slug}.${format === "bibtex" ? "bib" : format}`;
}

function bibtexKey(sheet: Sheet): string {
  const surname = (sheet.authors[0] ?? "anon")
    .split(/\s+/)
    .filter(Boolean)
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z]/g, "") || "anon";
  const year = (sheet.publishedAt ?? "0000").slice(0, 4);
  const word =
    sheet.title
      .split(/\s+/)
      .find((w) => w.length > 4)
      ?.toLowerCase()
      .replace(/[^a-z]/g, "") || "paper";
  return `${surname}${year}${word}`;
}

function escapeTex(value: string): string {
  return value.replace(/[{}]/g, "").replace(/&/g, "\\&").replace(/%/g, "\\%").replace(/#/g, "\\#");
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export interface ExportInput {
  volume: Volume;
  sheets: readonly Sheet[];
  report: CoverageReport;
  generatedAt: string;
}

export function renderExport(format: ExportFormat, input: ExportInput): string {
  switch (format) {
    case "markdown":
      return renderMarkdown(input);
    case "bibtex":
      return renderBibtex(input);
    case "csv":
      return renderCsv(input);
    case "json":
      return renderJson(input);
  }
}

function renderMarkdown({ volume, sheets, report, generatedAt }: ExportInput): string {
  const lines: string[] = [];
  lines.push(`# ${volume.name}`);
  lines.push("");
  lines.push(
    `_A reading volume compiled in Safety Herbarium. Generated ${generatedAt}._`,
  );
  if (volume.intent) {
    lines.push("");
    lines.push(`**Intent.** ${volume.intent}`);
  }
  lines.push("");
  lines.push(
    `**Coverage score ${report.score.toFixed(3)}** under \`${report.engine}\`, measured against ${report.factors.length} AI-safety risk classes. Chain head \`${report.referenceSeal.slice(0, 16)}…\`.`,
  );
  lines.push("");

  lines.push("## Risk-class coverage");
  lines.push("");
  lines.push("| Class | Code | Weight | Coverage | Status |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const factor of report.factors) {
    lines.push(
      `| ${factor.label} | ${factor.code} | ${factor.weight.toFixed(3)} | ${(factor.coverage * 100).toFixed(1)}% | ${factor.isGap ? "open" : "covered"} |`,
    );
  }
  lines.push("");

  if (report.recommendation.primaryGap) {
    const gap = CLASS_BY_ID[report.recommendation.primaryGap];
    lines.push("## Next read");
    lines.push("");
    lines.push(
      `**${gap.label}** (${gap.code}) — ${report.recommendation.reason}`,
    );
    for (const candidate of report.recommendation.candidates) {
      lines.push(`- [${candidate.title}](${candidate.url}) — ${candidate.why}`);
    }
    lines.push("");
  }

  lines.push("## Mounted sheets");
  lines.push("");
  if (sheets.length === 0) {
    lines.push("_No sheets mounted._");
  }
  for (const sheet of sheets) {
    lines.push(`### ${sheet.title}`);
    lines.push("");
    lines.push(
      `- Accession \`${sheet.accession}\` · ${sheet.sourceKind === "arxiv" ? "arXiv" : "Open-access book"} · ${sheet.tier} · status ${sheet.status}${sheet.citations > 0 ? ` · ${sheet.citations} citations` : ""}`,
    );
    lines.push(`- Mounted on: ${CLASS_BY_ID[sheet.mountedClass].label} (\`${sheet.mountedClass}\`)`);
    lines.push(`- Authors: ${sheet.authors.length > 0 ? sheet.authors.join(", ") : "not recorded"}`);
    if (sheet.publishedAt) lines.push(`- Published: ${sheet.publishedAt}`);
    if (sheet.license) lines.push(`- Licence: ${sheet.license}`);
    lines.push(`- Landing page: ${sheet.url}`);
    if (sheet.pdfUrl) lines.push(`- PDF: ${sheet.pdfUrl}`);
    lines.push(`- Provenance when mounted: ${sheet.provenance}`);
    if (sheet.decision) lines.push(`- Decision: ${sheet.decision}${sheet.decisionNote ? ` — ${sheet.decisionNote}` : ""}`);
    if (sheet.marginalia) {
      lines.push("");
      lines.push("> " + sheet.marginalia.split("\n").join("\n> "));
    }
    lines.push("");
  }

  lines.push("## Provenance and integrity");
  lines.push("");
  for (const attribution of SOURCE_ATTRIBUTION) lines.push(`- ${attribution}`);
  lines.push(
    `- Audit chain head: \`${report.referenceSeal}\`. Replay it at \`/verify\`; the chain is SHA-384 over canonical JSON.`,
  );
  lines.push(
    "- This is a reading aid, not a safety assessment. Coverage describes what you have read, not what is true.",
  );
  lines.push("");
  return lines.join("\n");
}

function renderBibtex({ sheets, generatedAt }: ExportInput): string {
  const out: string[] = [
    `% Safety Herbarium bibliography`,
    `% Volume compiled ${generatedAt}`,
    `% ${sheets.length} entries`,
    "",
  ];
  const used = new Set<string>();
  for (const sheet of sheets) {
    let key = bibtexKey(sheet);
    let n = 2;
    while (used.has(key)) key = `${bibtexKey(sheet)}${n++}`;
    used.add(key);
    const isBook = sheet.sourceKind === "book";
    out.push(`@${isBook ? "book" : "misc"} {${key},`);
    out.push(`  title       = {${escapeTex(sheet.title)}},`);
    if (sheet.authors.length > 0) out.push(`  author      = {${escapeTex(sheet.authors.join(" and "))}},`);
    if (sheet.publishedAt) out.push(`  year        = {${sheet.publishedAt.slice(0, 4)}},`);
    out.push(`  url         = {${sheet.url}},`);
    if (isBook && sheet.publishedAt) out.push(`  publisher   = {${escapeTex(sheet.license ?? "open access")}},`);
    out.push(`  note        = {Accession ${sheet.accession}; mounted ${sheet.mountedClass}; provenance ${sheet.provenance}},`);
    out.push("}");
    out.push("");
  }
  return out.join("\n");
}

function renderCsv({ sheets }: ExportInput): string {
  const header = [
    "accession",
    "title",
    "authors",
    "source_kind",
    "source_id",
    "year",
    "tier",
    "status",
    "decision",
    "citations",
    "mounted_class",
    "license",
    "url",
    "pdf_url",
    "provenance",
    "marginalia",
  ];
  const rows = sheets.map((sheet) =>
    [
      sheet.accession,
      sheet.title,
      sheet.authors.join("; "),
      sheet.sourceKind,
      sheet.sourceId,
      sheet.publishedAt ?? "",
      sheet.tier,
      sheet.status,
      sheet.decision ?? "",
      String(sheet.citations),
      sheet.mountedClass,
      sheet.license ?? "",
      sheet.url,
      sheet.pdfUrl ?? "",
      sheet.provenance,
      sheet.marginalia,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...rows].join("\r\n");
}

function renderJson({ volume, sheets, report, generatedAt }: ExportInput): string {
  const payload = {
    generator: "safety-herbarium",
    generatedAt,
    volume,
    engine: report.engine,
    score: report.score,
    referenceSeal: report.referenceSeal,
    factors: report.factors.map((f) => ({
      classId: f.classId,
      coverage: f.coverage,
      weight: f.weight,
      load: f.load,
      sheets: f.sheets.map((s) => ({
        sheetId: s.sheetId,
        affinity: s.affinity,
        evidence: s.evidence,
        contribution: s.contribution,
      })),
    })),
    sheets,
    attribution: SOURCE_ATTRIBUTION,
  };
  return `${JSON.stringify(payload, null, 2)}\n% digest ${sha256Hex(canonicalJson(payload))}\n`;
}