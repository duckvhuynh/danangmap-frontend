import { expect, test, type Page } from "@playwright/test";

const bootstrapToken = "bootstrap_token_abcdefghijklmnopqrstuvwxyz1234567890";
const password = "Strong-Civic-Map-2026!";
const enrollmentUri =
  "otpauth://totp/DanangMap%3Asystem.admin%40danang.gov.vn?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=DanangMap";
const recoveryCodes = Array.from(
  { length: 10 },
  (_, index) => `BOOT-STRAP-2026-${String(index + 1).padStart(4, "0")}`,
);
const principal = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "admin@danang.gov.vn",
  username: "system.admin",
  displayName: "Quản trị hệ thống",
  role: "system_admin",
  status: "active",
  mfaEnabled: true,
  mustChangePassword: false,
};
const csrfTokens = {
  public: "P".repeat(32),
  preauth: "R".repeat(32),
} as const;

async function mockFirstAdminBootstrap(page: Page) {
  let csrfState: keyof typeof csrfTokens = "public";
  let bootstrapAvailable = true;
  let bootstrapCalls = 0;
  let enrollCalls = 0;
  const cors = {
    "access-control-allow-origin": "http://127.0.0.1:3100",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers":
      "content-type,x-csrf-token,x-initial-admin-bootstrap-token",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "content-type": "application/json",
  };

  await page.route("**/api/v1/auth/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/auth/bootstrap/status")) {
      await route.fulfill({
        status: 200,
        headers: { ...cors, "cache-control": "no-store" },
        body: JSON.stringify({
          data: { available: bootstrapAvailable },
          meta: { requestId: "bootstrap-status" },
        }),
      });
      return;
    }
    if (path.endsWith("/auth/csrf")) {
      await route.fulfill({
        status: 200,
        headers: { ...cors, "cache-control": "private, no-store" },
        body: JSON.stringify({
          data: { csrfToken: csrfTokens[csrfState] },
          meta: { requestId: `csrf-${csrfState}` },
        }),
      });
      return;
    }
    expect(request.headers()["x-csrf-token"]).toBe(csrfTokens[csrfState]);
    if (path.endsWith("/auth/bootstrap/system-admin")) {
      bootstrapCalls += 1;
      expect(request.headers()["x-initial-admin-bootstrap-token"]).toBe(
        bootstrapToken,
      );
      expect(request.postDataJSON()).toEqual({
        displayName: "Quản trị hệ thống",
        email: "admin@danang.gov.vn",
        username: "system.admin",
        password,
        passwordConfirmation: password,
      });
      bootstrapAvailable = false;
      csrfState = "preauth";
      await route.fulfill({
        status: 201,
        headers: cors,
        body: JSON.stringify({
          data: {
            status: "mfa_required",
            mfaEnrollmentRequired: true,
            challengeExpiresAt: "2026-08-25T15:00:00.000Z",
          },
          meta: { requestId: "bootstrap-create" },
        }),
      });
      return;
    }
    if (path.endsWith("/mfa/enroll/confirm")) {
      expect(request.postDataJSON()).toEqual({ code: "123456" });
      await route.fulfill({
        status: 200,
        headers: cors,
        body: JSON.stringify({
          data: { principal, recoveryCodes },
          meta: { requestId: "bootstrap-mfa-confirm" },
        }),
      });
      return;
    }
    if (path.endsWith("/mfa/enroll")) {
      enrollCalls += 1;
      await route.fulfill({
        status: 200,
        headers: cors,
        body: JSON.stringify({
          data: { status: "pending", enrollmentUri },
          meta: { requestId: "bootstrap-mfa-enroll" },
        }),
      });
      return;
    }
    await route.abort("failed");
  });

  return {
    bootstrapCalls: () => bootstrapCalls,
    enrollCalls: () => enrollCalls,
  };
}

test("first operator creates the only System Admin and completes mandatory MFA", async ({
  page,
}) => {
  const state = await mockFirstAdminBootstrap(page);

  await page.goto("/login");
  const setupLink = page.getByRole("link", { name: "Tạo tài khoản quản trị đầu tiên" });
  await expect(setupLink).toBeVisible();
  await setupLink.focus();
  await setupLink.press("Enter");
  await expect(page).toHaveURL(/\/setup$/);

  await page.getByLabel("Tên hiển thị").fill("Quản trị hệ thống");
  await page.getByLabel("Email nội bộ").fill("admin@danang.gov.vn");
  await page.getByLabel("Tên đăng nhập").fill("system.admin");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByLabel("Nhập lại mật khẩu").fill(password);
  await page.getByLabel("Mã khởi tạo một lần").fill(bootstrapToken);
  const createButton = page.getByRole("button", {
    name: "Tạo tài khoản và tiếp tục",
  });
  await createButton.focus();
  await createButton.press("Enter");

  await expect(page).toHaveURL(/\/login\/mfa\?enrollment=required$/);
  expect(state.bootstrapCalls()).toBe(1);
  expect(page.url()).not.toContain(bootstrapToken);
  expect(page.url()).not.toContain(password);

  const start = page.getByRole("button", { name: "Thiết lập xác thực hai bước" });
  await expect(start).toBeVisible();
  expect(state.enrollCalls()).toBe(0);
  await start.click();
  await expect(
    page.getByRole("img", { name: "Mã QR thiết lập xác thực hai bước DanangMap" }),
  ).toBeVisible();
  expect(state.enrollCalls()).toBe(1);

  await page.getByLabel("Mã xác nhận 6 số").fill("123456");
  await page
    .getByRole("button", { name: "Xác nhận và tạo mã khôi phục" })
    .click();
  const list = page.getByRole("list", { name: "10 mã khôi phục" });
  await expect(list.getByRole("listitem")).toHaveCount(10);
  await page
    .getByRole("checkbox", { name: /Tôi đã lưu mã khôi phục/ })
    .check();
  await page
    .getByRole("button", { name: "Tiếp tục vào trang quản trị" })
    .click();
  await expect(page).toHaveURL(/\/admin$/);

  const persisted = await page.evaluate(async () => ({
    local: Object.values(localStorage),
    session: Object.values(sessionStorage),
    databases: (await indexedDB.databases()).map((database) => database.name),
  }));
  const persistedText = JSON.stringify(persisted);
  expect(persistedText).not.toContain(bootstrapToken);
  expect(persistedText).not.toContain(password);
  expect(persistedText).not.toContain(recoveryCodes[0]);

  await page.goto("/setup");
  await expect(
    page.getByText("Không thể khởi tạo tài khoản đầu tiên"),
  ).toBeVisible();
  await expect(page.getByLabel("Mã khởi tạo một lần")).not.toBeAttached();
});
