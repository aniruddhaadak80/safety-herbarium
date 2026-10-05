import { describe, expect, it } from "vitest";
import { exportFilename, renderExport, type ExportInput } from "./export";
import { gradeVolume } from "./engine";
import { defaultWeights } from "./taxonomy";
import type { Sheet, Volume } from "./types";

function sheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    volumeId: "11111111-1111-4111-8111-111111111111",
    accession: "HB-ABCD1234",
    sourceKind: "arxiv",
    sourceId: "2412.14093",
    title: "Alignment faking in large language models",
    authors: ["Greenblatt", "Cox", "Christoffersen"],
    abstract: "A demonstration of alignment faking and scheming.",
    url: "https://arxiv.org/abs/2412.14093",
    pdfUrl: "https://arxiv.org/pdf/2412.14093",
    host: "arxiv.org",
    license: "CC BY 4.0 (arXiv)",
    publishedAt: "2024-12-18",
    citations: 120,
    tier: "empirical",
    status: "read",
    marginalia: "Revisit the training-run breakdown.",
    determinations: { deceptive_alignment: 0.9 },
    mountedClass: "deceptive_alignment",
    decision: "admitted",
    decisionNote: "Core evidence.",
    version: 4,
    deletedAt: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    provenance: "live",
    ...overrides,
  };
}

function volume(overrides: Partial<Volume> = {}): Volume {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Frontier safety primer",
    intent: "Six weeks to a defensible overview.",
    role: "student",
    status: "active",
    shareToken: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    retiredAt: null,
    seal: "a".repeat(96),
    eventCount: 5,
    sheetCount: 1,
    readCount: 1,
    ...overrides,
  };
}

function input(sheets: Sheet[] = [sheet()]): ExportInput {
  const v = volume({ sheetCount: sheets.length, readCount: sheets.filter((s) => s.status === "read").length });
  return {
    volume: v,
    sheets,
    report: gradeVolume({
      volumeId: v.id,
      role: v.role,
      sheets: sheets.map((s) => ({
        id: s.id,
        title: s.title,
        abstract: s.abstract,
        status: s.status,
        tier: s.tier,
        citations: s.citations,
        determinations: s.determinations,
      })),
      weights: defaultWeights(),
      candidates: [],
      referenceSeal: v.seal,
    }),
    generatedAt: "2026-10-04T12:00:00.000Z",
  };
}

describe("export artifacts", () => {
  it("builds a filename from the volume name", () => {
    expect(exportFilename(volume(), "markdown")).toBe("frontier-safety-primer.markdown");
    expect(exportFilename(volume(), "bibtex")).toBe("frontier-safety-primer.bib");
    expect(exportFilename(volume({ name: "///" }), "csv")).toBe("volume.csv");
  });

  it("renders a syllabus with coverage, provenance and the chain reference", () => {
    const md = renderExport("markdown", input());
    expect(md).toContain("# Frontier safety primer");
    expect(md).toContain("| Deceptive alignment | DA |");
    expect(md).toContain("Alignment faking in large language models");
    expect(md).toContain("Revisit the training-run breakdown.");
    expect(md).toContain("arXiv");
    expect(md).toContain("OpenAlex");
    expect(md).toContain(volume().seal);
    expect(md).toContain("not a safety assessment");
    expect(md).toContain("2026-10-04T12:00:00.000Z");
  });

  it("says so plainly when a volume is empty", () => {
    const md = renderExport("markdown", input([]));
    expect(md).toContain("_No sheets mounted._");
  });

  it("renders BibTeX with unique keys", () => {
    const bib = renderExport(
      "bibtex",
      input([sheet(), sheet({ id: "44444444-4444-4444-8444-444444444444", title: "Same surname year" })]),
    );
    expect(bib).toContain("@misc {");
    const keys = [...bib.matchAll(/@misc \{([^,]+),/g)].map((m) => m[1]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toMatch(/^greenblatt2024/);
  });

  it("renders CSV with a header and one row per sheet, quoting correctly", () => {
    const csv = renderExport("csv", input([sheet({ title: 'He said "alignment", loudly' })]));
    const lines = csv.split("\r\n");
    expect(lines[0].startsWith('"accession"')).toBe(true);
    expect(lines[1]).toContain('""alignment""');
    expect(lines).toHaveLength(2);
  });

  it("renders sealed JSON that parses and carries the attribution", () => {
    const raw = renderExport("json", input());
    const json = raw.slice(0, raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json);
    expect(parsed.generator).toBe("safety-herbarium");
    expect(parsed.engine).toBe("herbarium-grade/1.0.0");
    expect(parsed.referenceSeal).toBe(volume().seal);
    expect(parsed.factors).toHaveLength(10);
    expect(parsed.attribution.length).toBeGreaterThan(0);
    expect(raw).toContain("% digest");
  });
});