import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for the flows a coach can't lose: the screens open, a play
 * saves and syncs, PDFs and wristbands download, screens open offline, and
 * Griddy's cards and errors show. They run against the production build
 * (`vite preview`), with Identity and /api mocked per test (tests/helpers.ts).
 *
 *   npm run test:e2e          (builds, starts preview on 4173, runs)
 */
export default defineConfig({
  testDir: "tests",
  timeout: 45_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    // The cloud sandbox has Chromium at this path; CI installs Playwright's own.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
