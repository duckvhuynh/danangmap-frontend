import { expect, test } from "@playwright/test";
import { freshTotp, requiredEnv } from "./support/auth";

test.use({ screenshot: "off", trace: "off", video: "off" });

test("fresh stack bootstraps its first System Admin and disables setup after MFA", async ({
  page,
}) => {
  const bootstrapToken = requiredEnv("DANANGMAP_INITIAL_ADMIN_BOOTSTRAP_TOKEN");
  const email = requiredEnv("DANANGMAP_BOOTSTRAP_ADMIN_EMAIL");
  const username = requiredEnv("DANANGMAP_BOOTSTRAP_ADMIN_USERNAME");
  const displayName = requiredEnv("DANANGMAP_BOOTSTRAP_ADMIN_DISPLAY_NAME");
  const password = requiredEnv("DANANGMAP_BOOTSTRAP_ADMIN_PASSWORD");

  await page.goto("/setup");
  await expect(page.getByLabel("Mã khởi tạo một lần")).toBeVisible();
  await page.getByLabel("Tên hiển thị").fill(displayName);
  await page.getByLabel("Email nội bộ").fill(email);
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Nhập lại mật khẩu").fill(password);
  await page.getByLabel("Mã khởi tạo một lần").fill(bootstrapToken);

  const creation = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/auth/bootstrap/system-admin") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Tạo tài khoản và tiếp tục" })
    .click();
  expect((await creation).status()).toBe(201);
  await expect(page).toHaveURL(/\/login\/mfa\?enrollment=required$/u);

  await page.getByRole("button", { name: "Thiết lập xác thực hai bước" }).click();
  const manualSecret = (await page.getByTestId("manual-mfa-secret").textContent())?.trim();
  expect(manualSecret).toMatch(/^[A-Z2-7]{32}$/u);
  await page
    .getByLabel("Mã xác nhận 6 số")
    .fill(await freshTotp(page, manualSecret!, username));
  await page
    .getByRole("button", { name: "Xác nhận và tạo mã khôi phục" })
    .click();

  const recoveryList = page.getByRole("list", { name: "10 mã khôi phục" });
  await expect(recoveryList.getByRole("listitem")).toHaveCount(10);
  await page
    .getByRole("checkbox", { name: /Tôi đã lưu mã khôi phục/ })
    .check();
  await page
    .getByRole("button", { name: "Tiếp tục vào trang quản trị" })
    .click();
  await expect(page).toHaveURL(/\/admin$/u);
  await expect(
    page.getByRole("heading", { name: "Tổng quan" }),
  ).toBeVisible();

  const persisted = await page.evaluate(async () => ({
    local: Object.values(localStorage),
    session: Object.values(sessionStorage),
    databases: (await indexedDB.databases()).map((database) => database.name),
  }));
  const persistedText = JSON.stringify(persisted);
  expect(persistedText).not.toContain(bootstrapToken);
  expect(persistedText).not.toContain(password);
  expect(persistedText).not.toContain(manualSecret!);

  await page.goto("/setup");
  await expect(
    page.getByText("Không thể khởi tạo tài khoản đầu tiên"),
  ).toBeVisible();
  await expect(page.getByLabel("Mã khởi tạo một lần")).not.toBeAttached();
});
