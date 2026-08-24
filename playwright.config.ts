import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: { baseURL: "http://127.0.0.1:3100", trace: "on-first-retry", screenshot: "only-on-failure" },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    env: { ...process.env, NEXT_PUBLIC_DANANGMAP_DEMO_MODE: "true", NEXT_PUBLIC_DANANGMAP_AUTH_E2E_MODE: "true", NEXT_PUBLIC_DANANGMAP_USER_IMPORT_E2E_MODE: "true", NEXT_PUBLIC_DANANGMAP_PUBLIC_SEARCH_E2E_MODE: "true", NEXT_PUBLIC_MAPBOX_TOKEN: "" },
  },
});
