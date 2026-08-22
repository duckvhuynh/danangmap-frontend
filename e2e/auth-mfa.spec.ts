import { expect, test, type Page } from "@playwright/test";

const enrollmentUri = "otpauth://totp/DanangMap%3Aeditor%40danang.gov.vn?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=DanangMap";
const recoveryCodes = Array.from({ length: 10 }, (_, index) => `ABCD-EF01-2345-6789-${String(index + 1).padStart(4, "0")}`);
const principal = { id: "11111111-1111-4111-8111-111111111111", email: "editor@danang.gov.vn", username: "editor", displayName: "Editor", role: "editor", status: "active", mfaEnabled: true, mustChangePassword: false };
const csrfTokens = { public: "P".repeat(32), preauth: "R".repeat(32), authenticated: "A".repeat(32) } as const;

async function mockAuth(page: Page, enrollmentRequired: boolean) {
  let csrfState: keyof typeof csrfTokens = "public";
  const csrfReads: string[] = [];
  const mutationTokens: string[] = [];
  let enrollCalls = 0;
  const cors = {
    "access-control-allow-origin": "http://127.0.0.1:3100",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type,x-csrf-token",
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
    if (path.endsWith("/auth/csrf")) {
      const csrfToken = csrfTokens[csrfState];
      csrfReads.push(csrfToken);
      await route.fulfill({ status: 200, headers: { ...cors, "cache-control": "private, no-store" }, body: JSON.stringify({ data: { csrfToken }, meta: { requestId: `csrf-${csrfState}` } }) });
      return;
    }
    mutationTokens.push(request.headers()["x-csrf-token"] ?? "");
    expect(request.headers()["x-csrf-token"]).toBe(csrfTokens[csrfState]);
    if (path.endsWith("/auth/login")) {
      expect(request.postDataJSON()).toEqual({ login: "editor@example.gov.vn", password: "very-secure-password" });
      await route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ data: { status: "mfa_required", mfaEnrollmentRequired: enrollmentRequired, challengeExpiresAt: "2026-08-21T14:00:00.000Z" }, meta: { requestId: "login" } }) });
      csrfState = "preauth";
      return;
    }
    if (path.endsWith("/mfa/enroll/confirm")) {
      expect(request.postDataJSON()).toEqual({ code: "123456" });
      await route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ data: { principal, recoveryCodes }, meta: { requestId: "confirm" } }) });
      csrfState = "authenticated";
      return;
    }
    if (path.endsWith("/mfa/enroll")) {
      enrollCalls += 1;
      await route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ data: { status: "pending", enrollmentUri }, meta: { requestId: "enroll" } }) });
      return;
    }
    if (path.endsWith("/mfa/verify")) {
      expect(request.postDataJSON()).toEqual({ method: "totp", code: "123456" });
      await route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ data: principal, meta: { requestId: "verify" } }) });
      csrfState = "authenticated";
      return;
    }
    await route.abort("failed");
  });
  return { enrollCalls: () => enrollCalls, csrfReads: () => [...csrfReads], mutationTokens: () => [...mutationTokens] };
}

async function passwordLogin(page: Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Tên đăng nhập hoặc email" }).fill("editor@example.gov.vn");
  await page.getByLabel("Mật khẩu").fill("very-secure-password");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

test("enrolled account uses public and preauth CSRF before entering admin", async ({ page }) => {
  const auth = await mockAuth(page, false);
  await passwordLogin(page);
  await expect(page).toHaveURL(/\/login\/mfa$/);
  const totp = page.getByLabel("Mã xác thực 6 số");
  await totp.focus();
  await totp.fill("123456");
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Tổng quan hệ thống" })).toBeVisible();
  expect(auth.csrfReads()).toEqual([csrfTokens.public, csrfTokens.preauth]);
  expect(auth.mutationTokens()).toEqual([csrfTokens.public, csrfTokens.preauth]);
});

test("new account explicitly enrolls once and acknowledges ten one-time recovery codes", async ({ page }) => {
  const auth = await mockAuth(page, true);
  await passwordLogin(page);
  await expect(page).toHaveURL(/\/login\/mfa\?enrollment=required$/);
  const start = page.getByRole("button", { name: "Bắt đầu thiết lập MFA" });
  await expect(start).toBeVisible();
  expect(auth.enrollCalls()).toBe(0);
  await start.focus();
  await start.press("Enter");
  await expect(page.getByRole("img", { name: "Mã QR thiết lập MFA DanangMap" })).toBeVisible();
  await expect(page.getByTestId("manual-mfa-secret")).toHaveText("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP");
  expect(auth.enrollCalls()).toBe(1);

  await page.getByLabel("Mã xác nhận 6 số").fill("123456");
  await page.getByRole("button", { name: "Xác nhận và tạo mã khôi phục" }).click();
  const list = page.getByRole("list", { name: "10 mã khôi phục" });
  await expect(list.getByRole("listitem")).toHaveCount(10);
  const continueButton = page.getByRole("button", { name: "Tiếp tục vào trang quản trị" });
  await expect(continueButton).toBeDisabled();
  await page.getByRole("checkbox", { name: /Tôi đã lưu mã khôi phục/ }).check();
  await expect(continueButton).toBeEnabled();
  await continueButton.click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText(recoveryCodes[0])).not.toBeAttached();
  expect(auth.csrfReads()).toEqual([csrfTokens.public, csrfTokens.preauth, csrfTokens.preauth]);
  expect(auth.mutationTokens()).toEqual([csrfTokens.public, csrfTokens.preauth, csrfTokens.preauth]);
  const persisted = await page.evaluate(async () => ({
    local: Object.values(localStorage),
    session: Object.values(sessionStorage),
    databases: (await indexedDB.databases()).map((database) => database.name),
  }));
  const persistedText = JSON.stringify(persisted);
  expect(persistedText).not.toContain(enrollmentUri);
  expect(persistedText).not.toContain("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP");
  expect(persistedText).not.toContain(recoveryCodes[0]);
});
