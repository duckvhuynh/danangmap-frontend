import { expect, test } from "@playwright/test";

test("desktop layer editor exposes authoring and recovery surfaces", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop editor");
  await page.goto("/admin/layers/wards/edit");
  await expect(page.getByRole("heading", { name: "Ranh giới phường, xã" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Vẽ vùng" })).toBeVisible();
  await expect(page.getByText("Canvas biên tập chưa sẵn sàng")).toBeVisible();
  await expect(page.getByRole("button", { name: /Gửi duyệt/ })).toBeVisible();
});

test("mobile editor is capability-gated to review only", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("desktop"), "Mobile capability gate");
  await page.goto("/admin/layers/wards/edit");
  await expect(page.getByRole("heading", { name: "Biên tập cần desktop có con trỏ chính xác" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mở chế độ xem / duyệt" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Gửi duyệt/ })).toBeHidden();
});
