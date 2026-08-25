import { expect, test } from "@playwright/test";

test.skip(
  process.env.DANANGMAP_LIVE_MAPBOX_QA !== "true",
  "Set DANANGMAP_LIVE_MAPBOX_QA=true to run against an explicitly configured live Mapbox app.",
);

interface ViewportRequest {
  slug: string;
  bbox: string;
}

test("live map updates one accessible feed per visible layer after rapid viewport changes", async ({ page }) => {
  const requests: ViewportRequest[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    const match = url.pathname.match(/\/api\/v1\/public\/layers\/([^/]+)\/features$/u);
    const bbox = url.searchParams.get("bbox");
    if (match && bbox) requests.push({ slug: decodeURIComponent(match[1]), bbox });
  });

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");
  const map = page.getByLabel("Bản đồ dữ liệu hành chính Đà Nẵng");
  await expect(map.locator("canvas.mapboxgl-canvas")).toBeVisible();
  await expect.poll(() => requests.length, { timeout: 30_000 }).toBeGreaterThan(0);
  const initialBboxes = new Set(requests.map((request) => request.bbox));

  const zoomIn = page.getByRole("button", { name: "Phóng to" });
  const interactionStartedAt = Date.now();
  await zoomIn.click();
  await zoomIn.click();
  await zoomIn.click();
  await expect.poll(
    () => new Set(requests.map((request) => request.bbox)).size,
    { timeout: 10_000 },
  ).toBeGreaterThan(initialBboxes.size);
  expect(Date.now() - interactionStartedAt).toBeLessThan(10_000);
  await page.waitForTimeout(750);
  const changedBboxes = new Set(requests.map((request) => request.bbox).filter((bbox) => !initialBboxes.has(bbox)));
  expect(changedBboxes.size).toBeGreaterThan(0);

  const latestBbox = requests.at(-1)!.bbox;
  const latest = requests.filter((request) => request.bbox === latestBbox);
  expect(new Set(latest.map((request) => request.slug)).size).toBe(latest.length);
  expect(page.url()).not.toMatch(/[?&](?:layers|feature|lat|lng|z)=/u);
});
