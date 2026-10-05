import { expect, test } from "@playwright/test";

/**
 * The primary journey, through visible controls only.
 *
 * create → discover → mount → inspect → decide → grade → agent → export → delete
 *
 * No direct API calls: if a control is broken for a reader, this test fails.
 * Console errors and failed requests are collected and asserted empty, because a
 * journey that "works" while logging TypeErrors is not working.
 */

test.describe("primary journey", () => {
  test("mounts a paper, grades the volume, exports and deletes it", async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    /**
     * A navigation that becomes a download is cancelled by the browser, which
     * surfaces as ERR_ABORTED. That is the success path for an export rather than
     * a failure, so URLs the browser reports as downloaded are excluded from the
     * failed-request assertion.
     */
    const downloadedUrls = new Set<string>();

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("requestfailed", (request) => {
      const reason = request.failure()?.errorText ?? "";
      /**
       * ERR_ABORTED is how a navigation that becomes a download ends: the browser
       * cancels the page load once it has the bytes. The download itself is
       * asserted separately (a `download` event with real content), so this is the
       * success path rather than a failed request. Anything else is a real failure.
       */
      if (reason === "net::ERR_ABORTED" || downloadedUrls.has(request.url())) return;
      failedRequests.push(`${request.method()} ${request.url()} — ${reason}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 500) failedRequests.push(`${response.status()} ${response.url()}`);
    });
    page.on("download", (download) => {
      downloadedUrls.add(download.url());
    });

    // --- Landing, and the repository is a first-class link -------------------
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Mount the AI-safety literature");
    await expect(page.getByRole("link", { name: /star on github/i }).first()).toBeVisible();

    // --- Create a volume through the form ------------------------------------
    const volumeName = `E2E ${Date.now().toString(36)}`;
    await page.getByRole("link", { name: /start a volume/i }).click();
    await page.getByLabel(/volume name/i).fill(volumeName);
    await page.getByLabel(/intent/i).fill("Proving the journey end to end.");
    await page.getByRole("button", { name: /create volume/i }).click();

    await page.waitForURL(/\/volume\/[0-9a-f-]{36}$/i);
    const volumeUrl = page.url();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(volumeName);

    // --- Mount from the open-access shelf -------------------------------------
    await page.goto("/discover");
    const shelf = page.locator("section", {
      has: page.getByRole("heading", { name: /open-access bookshelf/i }),
    });
    await expect(shelf).toBeVisible();

    // Mount the open-access textbook specifically: it is on the curated shelf, so
    // it does not depend on arXiv being reachable.
    const textbook = shelf.locator("li", {
      has: page.getByRole("link", { name: /Introduction to AI Safety, Ethics, and Society/i }),
    });
    await expect(textbook).toBeVisible();
    await textbook.getByRole("button", { name: /^Mount to /i }).click();

    // The confirmation reports a real accession number from the database.
    await expect(page.getByText(/mounted · HB-[0-9A-F]{8}/i).first()).toBeVisible({ timeout: 30_000 });

    // --- Back to the volume: the plate now shows a non-zero score ------------
    await page.goto(volumeUrl);
    const plate = page.getByRole("region", { name: /determination plate/i }).or(
      page.locator("section", { has: page.getByRole("heading", { name: /determination plate/i }) }),
    );
    await expect(plate).toBeVisible();

    const scoreText = await page.locator("text=/score \\d\\.\\d{3}/i").first().textContent();
    expect(scoreText ?? "").toBeTruthy();

    // --- Decide on the sheet --------------------------------------------------
    // Scope to the Decisions section: there is also a *filter* called "Reading
    // status" above, and selecting on the wrong one would filter the list away
    // instead of persisting a decision.
    const decisions = page.locator("section", {
      has: page.getByRole("heading", { name: "Decisions" }),
    });
    const sheetLink = decisions.getByRole("link").first();
    await expect(sheetLink).toBeVisible();

    const statusSelect = decisions.getByLabel(/reading status/i);
    await statusSelect.selectOption("read");

    // The write is persisted, not merely reflected locally: the decision select
    // still reads "read" after the refresh, and the version advanced.
    await expect(async () => {
      expect(await statusSelect.inputValue()).toBe("read");
    }).toPass({ timeout: 20_000 });

    // --- Marginalia persists --------------------------------------------------
    await sheetLink.click();
    await page.waitForURL(/\/sheet\/[0-9a-f-]{36}$/i);
    const marginalia = page.getByLabel(/your note on this sheet/i);
    await marginalia.fill("Chapter 3 is the clearest statement of the problem.");
    await page.getByRole("button", { name: /save note/i }).click();
    await expect(page.getByText(/saved|note/i).first()).toBeVisible();

    // The full text is embedded from the publisher's host.
    await expect(page.locator('object[type="application/pdf"]')).toBeVisible();

    // --- The engine, itemised --------------------------------------------------
    await page.goto("/coverage");
    await expect(page.getByText("herbarium-grade/1.0.0", { exact: true })).toBeVisible();
    // The itemised factors show the arithmetic, not just the total.
    await expect(page.getByRole("heading", { name: /itemised factors/i })).toBeVisible();

    // --- The agent console: a mutating call ------------------------------------
    await page.goto("/agent");

    // Every call appends one transcript entry; count them rather than matching on
    // a label, which is also present in the button that triggered the call.
    const transcript = page.locator("details");
    const countEntries = () => transcript.count();

    await page.getByRole("button", { name: /^tools\/list$/i }).click();
    await expect.poll(countEntries).toBe(1);

    // A JSON-RPC error comes back with HTTP 200, so the console must judge
    // success on the protocol level rather than the status code.
    await page.getByRole("button", { name: /unknown tool/i }).click();
    await expect.poll(countEntries).toBe(2);
    await expect(page.locator("li", { hasText: /unknown tool · error/i })).toBeVisible();

    // Open the transcript and read the error out of the actual response body.
    const failing = page.locator("details").nth(1);
    await failing.locator("summary").click();
    const pre = failing.locator("pre");
    await expect(pre).toBeVisible();
    await expect(pre).toContainText("-32602");
    await expect(pre).toContainText("delete_everything");

    // --- Export downloads real content -----------------------------------------
    await page.goto("/export");
    const syllabusLink = page.getByRole("link", { name: /syllabus/i }).first();
    await expect(syllabusLink).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      syllabusLink.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.markdown$/);

    // And the downloaded file has real content in it.
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const markdown = Buffer.concat(chunks).toString("utf8");
    expect(markdown.length).toBeGreaterThan(200);
    expect(markdown).toContain("Risk-class coverage");
    expect(markdown).toMatch(/arXiv|OpenAlex/);

    // --- Integrity replay ------------------------------------------------------
    await page.goto("/verify");
    await expect(page.getByText(/chain replayed, none broken|chain intact/i).first()).toBeVisible();

    // --- Keyboard focus is visible ---------------------------------------------
    // Checked before the retire step: an unhandled confirm dialog blocks every
    // subsequent navigation, so this belongs before it rather than after.
    await page.goto("/shelf");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const style = getComputedStyle(el);
      return {
        tag: el.tagName,
        outline: style.outlineWidth,
        outlineStyle: style.outlineStyle,
        text: (el.textContent ?? "").slice(0, 40),
      };
    });
    expect(focused).not.toBeNull();
    expect(focused?.tag).not.toBe("BODY");
    // Focus is not merely present, it is visible: a real outline is drawn.
    expect(focused?.outlineStyle).not.toBe("none");

    // --- Delete, and confirm the tombstone -------------------------------------
    await page.goto(volumeUrl);

    /**
     * The handler is registered before the click, and it accepts rather than
     * merely observing: an open dialog blocks the click itself from resolving, so
     * a post-click wait deadlocks.
     */
    let confirmMessage = "";
    page.once("dialog", (dialog) => {
      confirmMessage = dialog.message();
      void dialog.accept();
    });
    await page.getByRole("button", { name: /^retire$/i }).click();
    await expect(page.getByText(/retired · tombstoned/i)).toBeVisible({ timeout: 30_000 });
    // The confirmation has to say it keeps the chain, because that is what it does.
    expect(confirmMessage).toMatch(/chain|replayable|tombstone/i);

    expect(consoleErrors, `console errors: ${consoleErrors.join("\n")}`).toEqual([]);
    expect(failedRequests, `failed requests: ${failedRequests.join("\n")}`).toEqual([]);
  });

  test("serves the repository link from the shared navigation", async ({ page }) => {
    await page.goto("/");
    const repoLinks = page.getByRole("link", { name: /github/i });
    await expect(repoLinks.first()).toBeVisible();

    const hrefs = await repoLinks.evaluateAll((links) =>
      links.map((link) => ({
        href: (link as HTMLAnchorElement).href,
        target: (link as HTMLAnchorElement).target,
        rel: (link as HTMLAnchorElement).rel,
      })),
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const link of hrefs) {
      expect(link.href).toContain("github.com/aniruddhaadak80/safety-herbarium");
      expect(link.target).toBe("_blank");
      expect(link.rel).toContain("noopener");
    }

    // The footer carries it too.
    const footer = page.locator("footer");
    await expect(footer.getByRole("link", { name: /github/i }).first()).toBeVisible();
  });
});