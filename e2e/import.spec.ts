import { expect, test } from "@playwright/test";

test("editor completes a CSV import wizard in explicit demo mode", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Import authoring requires desktop pointer capability");
  await page.goto("/admin/layers/wards/import");
  await expect(page.getByRole("heading", { name: "Nhập dữ liệu" })).toBeVisible();
  await expect(page.getByText("Dữ liệu minh họa · không được lưu vào hệ thống")).toBeVisible();

  await page.getByLabel(/Chọn tệp CSV/).setInputFiles({
    name: "tru-so.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,longitude,latitude\nTrụ sở A,108.2208,16.0668"),
  });
  await page.getByRole("button", { name: /Tải lên và tiếp tục/ }).click();
  await expect(page.getByRole("heading", { name: "2. Ghép cột dữ liệu" })).toBeVisible();

  await page.getByRole("button", { name: /Lưu và kiểm tra/ }).click();
  await expect(page.getByRole("heading", { name: "4. Kiểm tra lỗi trước khi áp dụng" })).toBeVisible();
  await page.getByRole("checkbox", { name: /Bỏ qua dòng lỗi/ }).check();
  await page.getByRole("checkbox", { name: /đã xem và chấp nhận/ }).check();
  await page.getByRole("button", { name: /Nhập vào bản nháp/ }).click();
  await expect(page.getByRole("heading", { name: "Nhập dữ liệu hoàn tất" })).toBeVisible();
  await expect(page.getByText("Đã áp dụng 3 bản ghi, bỏ qua 1 bản ghi.")).toBeVisible();
});
