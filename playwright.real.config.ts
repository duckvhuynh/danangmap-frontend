import { defineConfig, devices } from "@playwright/test";

const realStackEnabled = process.env.DANANGMAP_REAL_STACK === "true";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "https://gateway";

if (realStackEnabled && !process.env.PLAYWRIGHT_BASE_URL) {
  throw new Error("PLAYWRIGHT_BASE_URL is required when DANANGMAP_REAL_STACK=true.");
}

export default defineConfig({
  testDir: "./e2e-real",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["line"], ["html", { open: "never", outputFolder: "playwright-report/real-stack" }]],
  outputDir: "test-results/real-stack",
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "real-stack",
      use: { ...devices["Desktop Chrome"], baseURL, ignoreHTTPSErrors: true },
    },
  ],
});
