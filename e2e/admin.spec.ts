import { expect, test } from "@playwright/test";

test("desktop Editor creates a mixed layer and lands on its persisted layer configuration route", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop configuration authoring");
  await page.goto("/admin/layers");
  await page.getByRole("link", { name: "Tạo lớp" }).click();
  await expect(page).toHaveURL(/\/admin\/layers\/new$/u);
  await page.getByLabel("Mã lớp").fill("tru-so-hanh-chinh");
  await page.getByLabel("Tên lớp").fill("Trụ sở hành chính");
  await page.getByRole("tab", { name: "Geometry" }).click();
  await page.getByRole("radio", { name: /Mixed/u }).check();
  await page.getByRole("checkbox", { name: "LineString", exact: true }).click();
  await page.getByRole("checkbox", { name: /Circle, tâm Point/u }).click();
  await page.getByRole("button", { name: "Tạo layer" }).click();
  await expect(page).toHaveURL(/\/admin\/layers\/88888888-8888-4888-8888-888888888888$/u);
  await expect(page.getByRole("heading", { name: "Ranh giới phường, xã" })).toBeVisible();
});

test("mobile Editor cannot open layer configuration authoring", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("desktop"), "Mobile capability gate");
  await page.goto("/admin/layers/new");
  await expect(page.getByRole("heading", { name: "Tạo layer cần máy tính" })).toBeVisible();
  await expect(page.getByLabel("Mã lớp")).toBeHidden();
});

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
  const approve = page.getByRole("button", { name: "Duyệt thay đổi" });
  await expect(approve).toBeEnabled();
  await page.getByLabel("Bình luận review").fill("Cần kiểm tra nhãn");
  await expect(page.getByRole("button", { name: "Yêu cầu chỉnh sửa" })).toBeEnabled();
  expect(await approve.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return hit === button || button.contains(hit);
  })).toBe(true);
  await approve.click();
  await expect(page.getByRole("status").filter({ hasText: "Đã duyệt revision" })).toBeVisible();
});

test("publisher action requires a desktop pointer and release note", async ({ page }, testInfo) => {
  await page.addInitScript(() => window.sessionStorage.setItem("danangmap-demo-role", "publisher"));
  await page.goto("/admin/layers/wards/review");
  const publish = page.getByRole("button", { name: "Công bố revision" });
  if (testInfo.project.name.includes("mobile")) {
    await expect(page.getByLabel("Ghi chú công bố")).not.toBeAttached();
    await expect(publish).not.toBeAttached();
  } else {
    await page.getByLabel("Ghi chú công bố").fill("Công bố dữ liệu đã duyệt");
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(page.getByRole("status").filter({ hasText: "Yêu cầu công bố đã được nhận" })).toBeVisible();
    await expect(page.getByRole("region", { name: /Publication job/u })).toContainText("Đang chờ xử lý");
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
