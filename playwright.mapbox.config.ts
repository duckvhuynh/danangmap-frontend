import { defineConfig, devices } from "@playwright/test";

const liveQaEnabled = process.env.DANANGMAP_LIVE_MAPBOX_QA === "true";

if (liveQaEnabled && !process.env.PLAYWRIGHT_BASE_URL) {
  throw new Error("PLAYWRIGHT_BASE_URL is required when DANANGMAP_LIVE_MAPBOX_QA=true.");
}

export default defineConfig({
  testDir: "./e2e-live",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: "line",
  outputDir: "test-results/mapbox-live",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3110",
    screenshot: "off",
    trace: "off",
    video: "off",
  },
});
