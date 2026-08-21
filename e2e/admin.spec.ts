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

test("reviewer can approve or request changes on mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("desktop"), "Mobile review capability");
  await page.addInitScript(() => window.sessionStorage.setItem("danangmap-demo-role", "reviewer"));
  await page.goto("/admin/layers/wards/review");
  await expect(page.getByRole("button", { name: "Duyệt thay đổi" })).toBeEnabled();
  await page.getByLabel("Bình luận review").fill("Cần kiểm tra nhãn");
  await expect(page.getByRole("button", { name: "Yêu cầu chỉnh sửa" })).toBeEnabled();
  await page.getByRole("button", { name: "Duyệt thay đổi" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đã duyệt revision" })).toContainText("Đã duyệt revision");
});

test("publisher action requires a desktop pointer and release note", async ({ page }, testInfo) => {
  await page.addInitScript(() => window.sessionStorage.setItem("danangmap-demo-role", "publisher"));
  await page.goto("/admin/layers/wards/review");
  const publish = page.getByRole("button", { name: "Công bố revision" });
  await page.getByLabel("Ghi chú công bố").fill("Công bố dữ liệu đã duyệt");
  if (testInfo.project.name.includes("mobile")) {
    await expect(publish).toBeDisabled();
    await expect(page.getByText(/chỉ có thể công bố trên desktop/)).toBeVisible();
  } else {
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(page.getByRole("status")).toContainText("Đã bắt đầu công bố revision");
  }
});

test("workflow conflicts are explained without hiding the request id", async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem("danangmap-demo-role", "reviewer");
    window.sessionStorage.setItem("danangmap-demo-mutation-error", "409");
  });
  await page.goto("/admin/layers/wards/review");
  await page.getByRole("button", { name: "Duyệt thay đổi" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "Không thể hoàn tất yêu cầu" });
  await expect(alert).toContainText("Trạng thái revision đã thay đổi");
  await expect(alert).toContainText("demo-409");
});
