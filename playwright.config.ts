import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke test for the primary journey.
 *
 * Runs against a real deployment or a local server. The default reuses an already
 * running dev server so `npm run dev` plus `npm run test:e2e` works with no
 * configuration and no database.
 */
export default defineConfig({
  testDir: "./e2e",
  // Generous: the journey crosses many server-rendered routes and, on a cold
  // dev server, each first hit compiles.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 180_000,
      },
});