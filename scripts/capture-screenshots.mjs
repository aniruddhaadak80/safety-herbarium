import { chromium } from "@playwright/test";
import { randomBytes } from "node:crypto";

/**
 * Capture the README screenshots against a running deployment.
 *
 *   node scripts/capture-screenshots.mjs
 *
 * The script seeds its own reading volume through the public API with a fresh
 * session scope, then captures pages as that same session. The screenshots
 * therefore show real rows, a real seal and a real engine score — not fixtures.
 */

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const SCOPE = `shots-${randomBytes(10).toString("base64url")}`;
const HEADERS = { "content-type": "application/json", "x-herbarium-scope": SCOPE };

async function api(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: HEADERS });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${response.status} ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
}

/** Mount a realistic reading programme so the screenshots show useful state. */
async function seed() {
  const { volume } = await api("/api/volumes", {
    method: "POST",
    body: JSON.stringify({
      name: "Frontier safety primer",
      intent:
        "Get to a defensible overview of AI safety in six weeks, without reading the same survey five times.",
      role: "researcher",
    }),
  });

  const plan = [
    {
      key: "hendrycks-ai-safety-ethics-society",
      patch: {
        status: "read",
        decision: "admitted",
        decisionNote: "The clearest single introduction to the field. Chapter 3 is the one to revisit.",
        marginalia: "Chapters 3 and 4 carry the argument. Chapter 6 on society is the weakest part.",
      },
    },
    {
      key: "international-ai-safety-report-2025",
      patch: {
        status: "read",
        decision: "admitted",
        decisionNote: "The evidence base for anything claimed about catastrophic risk.",
        marginalia: "Strong on capability evidence, thinner on mitigations.",
      },
    },
    {
      key: "alignment-faking",
      patch: {
        status: "reading",
        decision: "deferred",
        decisionNote: "Strong primary evidence, but needs the interpretability context first.",
        marginalia: "Wait until mechanistic interpretability is mounted.",
      },
    },
    { key: "nist-ai-rmf-1-0", patch: { status: "queued" } },
  ];

  let firstSheetId = null;
  for (const item of plan) {
    const mounted = await api(`/api/volumes/${volume.id}/sheets`, {
      method: "POST",
      body: JSON.stringify({ sourceKind: "book", sourceId: item.key }),
    });
    if (firstSheetId === null) firstSheetId = mounted.sheet.id;
    if (Object.keys(item.patch).length > 0) {
      await api(`/api/sheets/${mounted.sheet.id}`, {
        method: "PATCH",
        body: JSON.stringify(item.patch),
      });
    }
  }

  const coverage = await api(`/api/volumes/${volume.id}/coverage`, {
    method: "POST",
    body: "{}",
  });

  const share = await api(`/api/volumes/${volume.id}/share`, {
    method: "POST",
    body: JSON.stringify({ enabled: true }),
  });

  return {
    volumeId: volume.id,
    sheetId: firstSheetId,
    shareToken: share.shareToken,
    score: coverage.report.score,
    gap: coverage.report.recommendation.primaryGap,
    seal: coverage.volume.seal,
  };
}

const browser = await chromium.launch();

async function capture(name, path, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1500, height: 1150 },
    deviceScaleFactor: 2,
    extraHTTPHeaders: { "x-herbarium-scope": SCOPE },
  });
  /**
   * Server-rendered pages resolve the session from the HTTP-only cookie, so the
   * cookie has to be set for a capture to show a real volume. This is the same
   * ownership path a browser uses, not a back door.
   */
  await context.addCookies([
    {
      name: "hb_scope",
      value: SCOPE,
      domain: new URL(BASE).hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const response = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  if (options.prepare) await options.prepare(page);
  await page.waitForTimeout(700);

  /**
   * A 404 in a screenshot would be a lie about the product. The check is on the
   * response status, not on body text: Next serialises the not-found boundary into
   * the layout payload on every page, so its copy is always present in the HTML.
   */
  if (!response || response.status() !== 200) {
    console.error(`  ${name}: got HTTP ${response?.status()} at ${path}`);
    process.exitCode = 1;
  }

  await page.screenshot({ path: `docs/${name}.png`, fullPage: options.fullPage ?? false });
  await context.close();

  if (errors.length) {
    console.error(`  ${name}: page errors ${errors.join("; ")}`);
    process.exitCode = 1;
  } else {
    console.log(`  ${name} <- ${path}`);
  }
}

console.log(`Seeding a volume on ${BASE}`);
const seeded = await seed();
console.log(
  `  volume ${seeded.volumeId} · score ${seeded.score} · open gap ${seeded.gap}\n  seal ${seeded.seal}`,
);

console.log("Capturing");
await capture("screenshot-volume", `/volume/${seeded.volumeId}`);
await capture("screenshot-sheet", `/sheet/${seeded.sheetId}`);
await capture("screenshot-coverage", `/coverage?volume=${seeded.volumeId}`);
await capture(
  "screenshot-agent",
  "/agent",
  {
    /**
     * Runs a real MCP call so the transcript shows a genuine request and
     * response, then opens it.
     */
    prepare: async (page) => {
      await page.getByRole("button", { name: /^tools\/list$/i }).click();
      await page.waitForTimeout(1500);
      await page.locator("details summary").first().click();
      await page.waitForTimeout(300);
    },
  },
);
await capture("screenshot-discover", "/discover");
await capture("screenshot-landing", "/");

console.log("\ndone");
await browser.close();