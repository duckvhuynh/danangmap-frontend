import { expect, test } from "@playwright/test";

test("public map remains useful in degraded Mapbox mode", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop list flow");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bản đồ số Đà Nẵng" })).toBeAttached();
  await expect(page.getByText("Chế độ demo · Không phải dữ liệu công bố")).toBeVisible();
  await expect(page.getByTestId("map-degraded")).toBeVisible();
  await page.getByRole("textbox", { name: "Tìm địa điểm hoặc dữ liệu" }).fill("Công an");
  await page.getByRole("button", { name: "Xem danh sách" }).click();
  await expect(page.getByText("1 kết quả")).toBeVisible();
  await page.getByRole("button", { name: "Công an phường Hải Châu" }).click();
  await expect(page.getByRole("heading", { name: "Công an phường Hải Châu" })).toBeVisible();
});

test("mobile public exposes layers and list as touch panels", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("desktop"), "Mobile flow");
  await page.goto("/");
  await page.getByRole("button", { name: "Lớp", exact: true }).click();
  await expect(page.getByRole("region", { name: "Lớp dữ liệu" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ranh giới phường, xã/ })).toBeVisible();
});
