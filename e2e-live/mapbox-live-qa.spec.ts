import { expect, test, type Page } from "@playwright/test";

test.skip(
  process.env.DANANGMAP_LIVE_MAPBOX_QA !== "true",
  "Set DANANGMAP_LIVE_MAPBOX_QA=true to run against an explicitly configured live Mapbox app.",
);

type StyleObservations = {
  customStreetOk: number;
  lightOk: number;
  failures: number;
};

function observeStyles(page: Page) {
  const observations: StyleObservations = { customStreetOk: 0, lightOk: 0, failures: 0 };
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    const isCustomStreet = pathname.includes("/styles/v1/duchuynhinsafe/");
    const isLight = pathname.includes("/styles/v1/mapbox/light-v11");
    if (!isCustomStreet && !isLight) return;
    if (response.status() >= 200 && response.status() < 300) {
      if (isCustomStreet) observations.customStreetOk += 1;
      if (isLight) observations.lightOk += 1;
    } else observations.failures += 1;
  });
  return observations;
}

async function expectMapReady(page: Page, accessibleName: string | RegExp) {
  const map = page.getByLabel(accessibleName);
  await expect(map).toBeVisible();
  await expect(map.locator("canvas.mapboxgl-canvas")).toBeVisible();
  await expect(page.getByTestId("map-degraded")).not.toBeAttached();
  await expect(page.getByRole("alert").filter({ hasText: /(?:Không|Chưa) tải được bản đồ/u })).not.toBeAttached();
}

async function expectCanvasFillsMap(page: Page, accessibleName: string | RegExp) {
  const map = page.getByLabel(accessibleName);
  await expect.poll(() => map.evaluate((element) => {
    const canvas = element.querySelector<HTMLCanvasElement>("canvas.mapboxgl-canvas");
    if (!canvas) return false;
    const container = element.getBoundingClientRect();
    const rendered = canvas.getBoundingClientRect();
    return Math.abs(rendered.width - container.width) <= 1 && Math.abs(rendered.height - container.height) <= 1;
  })).toBe(true);
}

test("live Street and Light render across the approved public and admin target surfaces", async ({ page }) => {
  const styles = observeStyles(page);

  await page.setViewportSize({ width: 1484, height: 1060 });
  await page.goto("/");
  await expectMapReady(page, "Bản đồ dữ liệu hành chính Đà Nẵng");
  await expect(page.getByText(/^Đường phố(?: · Demo)?$/u)).toBeVisible();
  await expect.poll(() => styles.customStreetOk).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Đổi sang bản đồ nền sáng" }).click();
  await expect(page.getByText(/^Nền sáng(?: · Demo)?$/u)).toBeVisible();
  await expect.poll(() => styles.lightOk).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Đổi sang bản đồ đường phố" }).click();
  await expect(page.getByText(/^Đường phố(?: · Demo)?$/u)).toBeVisible();
  await expect.poll(() => styles.customStreetOk).toBeGreaterThan(1);

  const search = page.getByRole("combobox", { name: "Tìm địa điểm hoặc dữ liệu" });
  await search.fill("cong an");
  await page.getByRole("option", { name: /Công an phường Hải Châu/u }).click();
  await expect(page.getByRole("complementary", { name: "Thông tin kết quả" })).toContainText("Công an phường Hải Châu");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expectMapReady(page, "Bản đồ dữ liệu hành chính Đà Nẵng");
  await page.getByRole("button", { name: "Lớp", exact: true }).click();
  await expect(page.getByRole("region", { name: "Lớp dữ liệu" })).toBeVisible();
  await page.getByRole("button", { name: "Đóng bảng" }).click();
  await page.getByRole("button", { name: "Danh sách", exact: true }).click();
  await page.getByRole("button", { name: /Công an phường Hải Châu/u }).click();
  await expect(page.getByRole("region", { name: "Thông tin đối tượng" })).toContainText("Công an phường Hải Châu");

  await page.setViewportSize({ width: 1487, height: 1058 });
  await page.goto("/admin/layers/wards/edit");
  await expect(page.getByRole("heading", { name: "Ranh giới phường, xã" })).toBeVisible();
  await expectMapReady(page, "Bản đồ biên tập");
  await expectCanvasFillsMap(page, "Bản đồ biên tập");
  await expect(page.getByText("Bán kính được tính bằng mét")).toBeVisible();
  await page.getByRole("button", { name: "Vẽ vùng" }).click();
  await expect(page.getByRole("button", { name: "Vẽ vùng" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Mở danh sách đối tượng" }).click();
  await expect(page.getByRole("complementary", { name: "Danh sách đối tượng" })).toBeVisible();
  await expectCanvasFillsMap(page, "Bản đồ biên tập");
  await page.getByRole("button", { name: "Bảng dữ liệu" }).click();
  await expect(page.getByRole("region", { name: "Bảng dữ liệu đối tượng" })).toBeVisible();
  await expectCanvasFillsMap(page, "Bản đồ biên tập");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => window.sessionStorage.setItem("danangmap-demo-role", "reviewer"));
  await page.goto("/admin/layers/wards/review");
  await expect(page.getByRole("tab", { name: "Bản đồ" })).toHaveAttribute("aria-selected", "true");
  await expectMapReady(page, /Bản đồ dữ liệu hành chính Đà Nẵng/u);
  await expect(page.getByRole("button", { name: "Yêu cầu chỉnh sửa" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Duyệt thay đổi" })).toBeEnabled();
  expect(styles.failures).toBe(0);
});
