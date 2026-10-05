#!/usr/bin/env node
/**
 * Live end-to-end proof.
 *
 *   npm run verify:live                      # uses NEXT_PUBLIC_SITE_URL
 *   BASE_URL=https://x.vercel.app npm run verify:live
 *
 * This makes real HTTP requests against a running deployment and proves the
 * complete journey: create a volume, mount a real record, read it back, update
 * it, run the engine, mutate through MCP, replay the audit chain, export, and
 * delete. It also checks the repository link appears in the rendered navigation
 * and footer, and that the repository itself returns 200.
 *
 * It embeds no secrets: the session is an anonymous token this script mints for
 * itself and sends as `x-herbarium-scope`, exactly as an agent would.
 */

import { randomBytes } from "node:crypto";

const BASE = (process.env.BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const REPO_URL =
  process.env.REPO_URL ?? "https://github.com/aniruddhaadak80/safety-herbarium";
const SCOPE = `verify-${randomBytes(12).toString("base64url")}`;

let passed = 0;
let failed = 0;
const failures = [];

function ok(label, detail = "") {
  passed += 1;
  process.stdout.write(`  PASS  ${label}${detail ? ` — ${detail}` : ""}\n`);
}

function bad(label, detail) {
  failed += 1;
  failures.push(`${label}: ${detail}`);
  process.stdout.write(`  FAIL  ${label} — ${detail}\n`);
}

function check(label, condition, detail = "") {
  if (condition) ok(label, detail);
  else bad(label, detail || "condition was false");
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "x-herbarium-scope": SCOPE,
      ...(options.headers ?? {}),
    },
    redirect: "manual",
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: response.status, json, text, headers: response.headers };
}

async function mcp(method, params, id = 1) {
  const result = await api("/api/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return Array.isArray(result.json) ? result.json[0] : result.json;
}

async function tool(name, args) {
  const response = await mcp("tools/call", { name, arguments: args });
  const payload = response?.result?.structuredContent;
  return { response, payload, isError: response?.result?.isError === true };
}

async function main() {
  process.stdout.write(`\nVerifying ${BASE}\n`);
  process.stdout.write(`Session scope ${SCOPE}\n\n`);

  // 1. Landing page
  {
    const response = await fetch(`${BASE}/`);
    const html = await response.text();
    check("1. GET / returns 200", response.status === 200, `status ${response.status}`);
    check("1b. repository URL in landing HTML", html.includes(REPO_URL));
  }

  // 2. Health, proving the real store
  let health;
  {
    const response = await api("/api/health");
    health = response.json;
    check("2. GET /api/health returns 200", response.status === 200, `status ${response.status}`);
    check("2b. store reachable", health?.store?.reachable === true, `kind ${health?.store?.kind}`);
    check("2c. production-safe adapter", health?.store?.productionSafe === true, `kind ${health?.store?.kind}`);
    check("2d. engine version reported", typeof health?.engine === "string", health?.engine);
  }

  // 3. Live data endpoint returns normalised records with provenance
  {
    const response = await api("/api/discover/papers?limit=6");
    const body = response.json;
    const papers = body?.papers ?? [];
    check("3. discovery returns records", papers.length > 0, `${papers.length} papers`);
    check(
      "3b. every record is normalised",
      papers.every(
        (p) =>
          typeof p.sourceId === "string" &&
          typeof p.title === "string" &&
          typeof p.url === "string" &&
          (p.provenance === "live" || p.provenance === "fallback"),
      ),
    );
    check("3c. provenance is declared", ["live", "fallback"].includes(body?.provenance), body?.provenance);
    check("3d. source attribution present", Array.isArray(body?.sources) && body.sources.length > 0);
  }

  // 3e. Open-access bookshelf, with licences
  {
    const response = await api("/api/bookshelf");
    const books = response.json?.books ?? [];
    check("3e. bookshelf has open-access titles", books.length > 0, `${books.length} titles`);
    check(
      "3f. every title carries a licence",
      books.every((b) => typeof b.license === "string" && b.license.length > 0),
    );
  }

  let volumeId;
  let sheetId;

  // 4. Create a volume through the public API
  {
    const response = await api("/api/volumes", {
      method: "POST",
      body: JSON.stringify({
        name: `Live verification ${new Date().toISOString().slice(0, 19)}`,
        intent: "Proving the end-to-end journey against production.",
        role: "researcher",
      }),
    });
    volumeId = response.json?.volume?.id;
    check("4. POST /api/volumes creates a volume", response.status === 201 && Boolean(volumeId));
    check(
      "4b. created volume carries a seal",
      /^[0-9a-f]{96}$/.test(response.json?.volume?.seal ?? ""),
    );
  }

  // 5. Mount a real record and read it back through the UI-facing API
  {
    const response = await api(`/api/volumes/${volumeId}/sheets`, {
      method: "POST",
      body: JSON.stringify({
        sourceKind: "book",
        sourceId: "hendrycks-ai-safety-ethics-society",
        mountedClass: "value_uncertainty",
      }),
    });
    sheetId = response.json?.sheet?.id;
    check("5. mount a book through the API", response.status === 201 && Boolean(sheetId), `status ${response.status}`);
    check(
      "5b. mounted sheet records provenance",
      ["live", "curated", "fallback"].includes(response.json?.sheet?.provenance),
      response.json?.sheet?.provenance,
    );
    check(
      "5c. mounted on the requested class",
      response.json?.sheet?.mountedClass === "value_uncertainty",
    );

    const readBack = await api(`/api/volumes/${volumeId}/sheets`);
    check(
      "5d. read-back shows the mounted sheet",
      (readBack.json?.sheets ?? []).some((s) => s.id === sheetId),
      `${readBack.json?.sheets?.length} sheets`,
    );

    // Idempotency: the same mount twice does not create a second sheet.
    const again = await api(`/api/volumes/${volumeId}/sheets`, {
      method: "POST",
      body: JSON.stringify({ sourceKind: "book", sourceId: "hendrycks-ai-safety-ethics-society" }),
    });
    check("5e. mounting twice is idempotent", again.json?.created === false && again.json?.sheet?.id === sheetId);
  }

  // 6. Update the record and see the change persisted
  {
    const patched = await api(`/api/sheets/${sheetId}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "read",
        decision: "admitted",
        decisionNote: "Verified live by scripts/verify-live.mjs.",
        marginalia: "Chapter 3 remains the clearest statement of the problem.",
      }),
    });
    check("6. PATCH updates the sheet", patched.status === 200, `status ${patched.status}`);
    check("6b. status persisted", patched.json?.sheet?.status === "read");
    check("6c. decision persisted", patched.json?.sheet?.decision === "admitted");

    const readBack = await api(`/api/sheets/${sheetId}`);
    check(
      "6d. read-back reflects the update",
      readBack.json?.sheet?.status === "read" && readBack.json?.sheet?.marginalia?.length > 0,
    );

    // Optimistic concurrency is real, not decorative.
    const stale = await api(`/api/sheets/${sheetId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "queued", expectedVersion: 1 }),
    });
    check("6e. stale write rejected with 409", stale.status === 409, `status ${stale.status}`);
  }

  // 7. Engine returns a versioned score, factors, recommendation and seal
  {
    const response = await api(`/api/volumes/${volumeId}/coverage`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const report = response.json?.report;
    check("7. coverage endpoint returns a report", Boolean(report));
    check("7b. engine is versioned", report?.engine === "herbarium-grade/1.0.0", report?.engine);
    check("7c. ten factors itemised", report?.factors?.length === 10, `${report?.factors?.length} factors`);
    check(
      "7d. factors carry coverage and weights",
      report?.factors?.every(
        (f) => typeof f.coverage === "number" && typeof f.weight === "number" && typeof f.code === "string",
      ),
    );
    check(
      "7e. score is populated for a mounted, read sheet",
      typeof report?.score === "number" && report.score > 0,
      `score ${report?.score}`,
    );
    check("7f. recommendation present", typeof report?.recommendation?.headline === "string");
    check(
      "7g. report carries a seal reference",
      /^[0-9a-f]{96}$/.test(report?.referenceSeal ?? ""),
    );
    const contributing = report?.factors?.find((f) => f.sheets.length > 0);
    check(
      "7h. a factor itemises the sheet that produced it",
      Boolean(contributing?.sheets?.[0]?.contribution > 0),
      contributing ? `${contributing.classId} → ${contributing.sheets[0].contribution}` : "none",
    );

    // Determinism: the same state grades the same way twice.
    const repeat = await api(`/api/volumes/${volumeId}/coverage`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    check(
      "7i. repeated run returns an identical digest",
      repeat.json?.report?.evaluation?.inputDigest === report?.evaluation?.inputDigest,
    );
  }

  // 8. MCP: initialize, tools/list, tools/call
  {
    const init = await mcp("initialize", { protocolVersion: "2025-06-18" });
    check("8. MCP initialize succeeds", init?.result?.protocolVersion === "2025-06-18", init?.result?.protocolVersion);
    check("8b. server identifies itself", init?.result?.serverInfo?.name === "safety-herbarium");

    const list = await mcp("tools/list", {});
    const names = (list?.result?.tools ?? []).map((t) => t.name);
    check("8c. tools/list returns tools", names.length >= 3, `${names.length} tools`);
    check(
      "8d. tools expose schemas",
      (list?.result?.tools ?? []).every((t) => t.inputSchema && t.inputSchema.type === "object"),
    );
    check("8e. a read tool exists", names.includes("list_volumes"));
    check("8f. an analysis tool exists", names.includes("coverage_report"));
    check("8g. a mutating tool exists", names.includes("mount_sheet"));

    // 8h. A mutating tool call through MCP, same path as the UI.
    const mount = await tool("mount_sheet", {
      volumeId,
      sourceKind: "book",
      sourceId: "nist-ai-rmf-1-0",
    });
    check("8h. MCP mount_sheet succeeds", !mount.isError && Boolean(mount.payload?.sheet?.id), mount.payload?.error?.message ?? "");
    check("8i. MCP mount returns the new seal", /^[0-9a-f]{96}$/.test(mount.payload?.volumeSeal ?? ""));

    const persisted = await api(`/api/volumes/${volumeId}/sheets`);
    const found = (persisted.json?.sheets ?? []).some((s) => s.sourceId === "nist-ai-rmf-1-0");
    check("8j. MCP mutation is visible through the UI-facing API", found);

    // 8k. MCP read tool agrees with the API.
    const listCall = await tool("list_volumes", {});
    check(
      "8k. MCP list_volumes sees the volume",
      (listCall.payload?.volumes ?? []).some((v) => v.id === volumeId),
    );

    // 8l. A JSON-RPC error is returned as a JSON-RPC error.
    const unknown = await mcp("tools/call", { name: "delete_everything", arguments: {} });
    check("8l. unknown tool returns -32602", unknown?.error?.code === -32602);
  }

  // 9. Session isolation: another scope cannot read this volume
  {
    const response = await fetch(`${BASE}/api/volumes/${volumeId}`, {
      headers: { "x-herbarium-scope": `other-${randomBytes(10).toString("base64url")}` },
    });
    check("9. another session cannot read the volume", response.status === 404, `status ${response.status}`);
  }

  // 10. Integrity replay before deletion
  {
    const response = await api(`/api/volumes/${volumeId}/verify`);
    const body = response.json;
    check("10. integrity replay succeeds", response.status === 200 && body?.ok === true, body?.reason ?? "");
    // created, mounted, updated, MCP-mounted: at least four sealed events.
    check("10b. replay covers every event", body?.events >= 4, `${body?.events} events`);
    check("10c. no broken link", body?.brokenAtSeq === null);
    check("10d. stored head matches recomputed head", body?.headMatches === true);

    const audit = await api(`/api/volumes/${volumeId}/audit`);
    check(
      "10e. audit log is sealed and ordered",
      (audit.json?.events ?? []).every((e, i) => e.seq === i + 1 && /^[0-9a-f]{96}$/.test(e.seal)),
      `${audit.json?.events?.length} events`,
    );
  }

  // 11. Export produces real, valid content
  {
    const markdown = await fetch(`${BASE}/api/export/${volumeId}?format=markdown`, {
      headers: { "x-herbarium-scope": SCOPE },
    });
    const md = await markdown.text();
    check("11. markdown export returns 200", markdown.status === 200, `status ${markdown.status}`);
    check("11b. export has disposition", (markdown.headers.get("content-disposition") ?? "").includes("attachment"));
    check("11c. export contains the volume", md.includes("Live verification"));
    check("11d. export carries attribution", md.includes("arXiv") && md.includes("OpenAlex"));

    const bib = await fetch(`${BASE}/api/export/${volumeId}?format=bibtex`, {
      headers: { "x-herbarium-scope": SCOPE },
    });
    const bibText = await bib.text();
    check("11e. bibtex export is valid-ish", bib.status === 200 && /@(misc|book)\s\{/.test(bibText));

    const csv = await fetch(`${BASE}/api/export/${volumeId}?format=csv`, {
      headers: { "x-herbarium-scope": SCOPE },
    });
    const csvText = await csv.text();
    check("11f. csv export has a header", csv.status === 200 && csvText.startsWith('"accession"'));
  }

  // 12. Navigation and footer both carry the repository URL; routes resolve
  {
    const pages = ["/", "/shelf", "/discover", "/coverage", "/agent", "/export", "/verify", "/settings", "/share"];
    for (const path of pages) {
      const response = await fetch(`${BASE}${path}`);
      const html = await response.text();
      const statusOk = response.status === 200;
      const hasRepo = html.includes(REPO_URL);
      check(`12. ${path} returns 200`, statusOk, `status ${response.status}`);
      if (path === "/" || path === "/shelf" || path === "/discover") {
        check(`12b. ${path} links the repository`, hasRepo);
      }
    }

    const repo = await fetch(REPO_URL, { redirect: "follow" });
    check("12c. repository URL returns 200", repo.status === 200, `status ${repo.status}`);

    const manifest = await api("/mcp.json");
    check("12d. /mcp.json served", manifest.status === 200, `status ${manifest.status}`);
    const advertised = String(manifest.json?.mcpServers?.safetyHerbarium?.url ?? "");
    check("12e. /mcp.json advertises an https agent endpoint", /^https:\/\/[^/]+\/api\/mcp$/.test(advertised), advertised);
    check("12f. /mcp.json publishes every tool schema", (manifest.json?.tools ?? []).length >= 3, `${(manifest.json?.tools ?? []).length} tools`);
    // Against production the advertised endpoint must be this very deployment.
    if (BASE.startsWith("https://")) {
      check("12g. /mcp.json endpoint is this deployment", advertised === `${BASE}/api/mcp`, advertised);
    }
  }

  // 13. Agent console and engine surfaces render
  {
    const coverage = await fetch(`${BASE}/coverage`);
    const html = await coverage.text();
    check("13. /coverage renders the engine", html.includes("herbarium-grade"));
  }

  // 14. Delete the sheet and retire the volume, then confirm the tombstone
  {
    const removed = await api(`/api/sheets/${sheetId}`, { method: "DELETE" });
    check("14. DELETE removes the sheet", removed.status === 200, `status ${removed.status}`);
    check("14b. deletion is a tombstone", removed.json?.tombstone === true);

    const sheets = await api(`/api/volumes/${volumeId}/sheets`);
    check("14c. removed sheet is gone from the UI API", !(sheets.json?.sheets ?? []).some((s) => s.id === sheetId));

    const retired = await api(`/api/volumes/${volumeId}`, { method: "DELETE" });
    check("14d. DELETE retires the volume", retired.status === 200 && retired.json?.volume?.status === "retired");

    // Reading a retired volume still works (it is a tombstone, not a hole);
    // what must fail is mounting into it.
    const readAfterRetire = await api(`/api/volumes/${volumeId}/sheets`);
    check("14e. retired volume is still readable", readAfterRetire.status === 200, `status ${readAfterRetire.status}`);
    const mountAfterRetire = await api(`/api/volumes/${volumeId}/sheets`, {
      method: "POST",
      body: JSON.stringify({ sourceKind: "book", sourceId: "nist-genai-profile" }),
    });
    check(
      "14e2. retired volume refuses new sheets",
      mountAfterRetire.status === 409,
      `status ${mountAfterRetire.status}`,
    );

    const stillVerifiable = await api(`/api/volumes/${volumeId}/verify`);
    check(
      "14f. chain still replays after deletion",
      stillVerifiable.json?.ok === true,
      stillVerifiable.json?.reason ?? "",
    );
  }

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.stdout.write("\nFailures:\n");
    for (const failure of failures) process.stdout.write(`  - ${failure}\n`);
    process.exit(1);
  }
  process.stdout.write("\nAll live gates passed.\n");
}

main().catch((error) => {
  process.stdout.write(`\nVerifier crashed: ${error?.stack ?? error}\n`);
  process.exit(1);
});