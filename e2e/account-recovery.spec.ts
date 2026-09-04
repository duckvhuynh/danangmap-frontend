import { expect, test, type Page } from "@playwright/test";

const appOrigin = "http://127.0.0.1:3100";
const apiOrigin = "http://localhost:4000";
const principal = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "editor@danang.gov.vn",
  username: "editor",
  displayName: "Editor",
  role: "editor",
  status: "active",
  mfaEnabled: true,
  mustChangePassword: true,
};
const operationKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "access-control-allow-origin": appOrigin,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,x-csrf-token,idempotency-key",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-expose-headers": "retry-after,x-request-id",
  "content-type": "application/json",
};

const envelope = (data: unknown, requestId: string) =>
  JSON.stringify({ data, meta: { requestId } });

async function fulfillPreflight(page: Page) {
  await page.route(`${apiOrigin}/api/v1/auth/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fallback();
  });
}

test("must-change principal rotates password once and enters admin", async ({ page }) => {
  let changeCalls = 0;
  await fulfillPreflight(page);
  await page.route(`${apiOrigin}/api/v1/auth/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fallback();
    expect(request.headers().origin).toBe(appOrigin);
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/auth/me")) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: envelope({ ...principal, mustChangePassword: changeCalls === 0 }, "me-change"),
      });
      return;
    }
    if (path.endsWith("/auth/csrf")) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: envelope({ csrfToken: "csrf-change" }, "csrf-change"),
      });
      return;
    }
    if (path.endsWith("/auth/password/change")) {
      changeCalls += 1;
      expect(request.headers()["x-csrf-token"]).toBe("csrf-change");
      expect(request.headers()["idempotency-key"]).toMatch(operationKeyPattern);
      expect(request.postDataJSON()).toEqual({
        currentPassword: "Temporary-password-2026!",
        newPassword: "Permanent-password-2026!",
        passwordConfirmation: "Permanent-password-2026!",
      });
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: envelope(
          {
            status: "password_changed",
            sessionsRevoked: 1,
            sessionRotated: true,
            principal: { ...principal, mustChangePassword: false },
          },
          "password-change",
        ),
      });
      return;
    }
    await route.abort("failed");
  });

  await page.goto("/login/password-change");
  await expect(page.getByRole("heading", { name: "Đổi mật khẩu" })).toBeVisible();
  await page.getByLabel("Mật khẩu hiện tại").fill("Temporary-password-2026!");
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill("Permanent-password-2026!");
  await page.getByLabel("Nhập lại mật khẩu mới").fill("Permanent-password-2026!");
  await page.getByRole("button", { name: "Đổi mật khẩu và tiếp tục" }).press("Enter");
  await expect(page).toHaveURL(/\/admin$/);
  expect(changeCalls).toBe(1);
  expect(page.url()).not.toContain("password");
});

test("forgot-password response is generic and uses one caller idempotency key", async ({ page }) => {
  let requestCalls = 0;
  await fulfillPreflight(page);
  await page.route(`${apiOrigin}/api/v1/auth/password/reset:request`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fallback();
    requestCalls += 1;
    expect(request.headers().origin).toBe(appOrigin);
    expect(request.headers()["idempotency-key"]).toMatch(operationKeyPattern);
    expect(request.headers()["x-csrf-token"]).toBeUndefined();
    expect(request.postDataJSON()).toEqual({ email: "unknown@danang.gov.vn" });
    await route.fulfill({
      status: 202,
      headers: corsHeaders,
      body: envelope({ status: "accepted" }, "reset-request"),
    });
  });

  await page.goto("/login/forgot-password");
  await page.getByLabel("Email tài khoản nội bộ").fill("unknown@danang.gov.vn");
  await page.getByRole("button", { name: "Gửi hướng dẫn đặt lại" }).press("Enter");
  const status = page.getByRole("status");
  await expect(status).toContainText("Nếu email thuộc một tài khoản phù hợp");
  await expect(status).not.toContainText("unknown@danang.gov.vn");
  expect(requestCalls).toBe(1);
});

test("body-only reset token is cleared before a fresh login and never persisted", async ({ page }) => {
  const resetToken = "reset_token_abcdefghijklmnopqrstuvwxyz123456";
  let resetCalls = 0;
  await fulfillPreflight(page);
  await page.route(`${apiOrigin}/api/v1/auth/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fallback();
    const path = new URL(request.url()).pathname;
    expect(request.headers().origin).toBe(appOrigin);
    if (path.endsWith("/auth/csrf")) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: envelope({ csrfToken: "csrf-reset" }, "csrf-reset"),
      });
      return;
    }
    if (path.endsWith("/auth/password/reset:confirm")) {
      resetCalls += 1;
      expect(request.url()).not.toContain(resetToken);
      expect(request.headers()["x-csrf-token"]).toBe("csrf-reset");
      expect(request.postDataJSON()).toEqual({
        token: resetToken,
        password: "Reset-password-2026!",
        passwordConfirmation: "Reset-password-2026!",
      });
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: envelope(
          { status: "password_reset", loginRequired: true, sessionsRevoked: 2 },
          "reset-confirm",
        ),
      });
      return;
    }
    await route.abort("failed");
  });

  await page.goto("/login/reset-password");
  expect(page.url()).not.toContain(resetToken);
  await page.getByLabel("Mã đặt lại mật khẩu").fill(resetToken);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill("Reset-password-2026!");
  await page.getByLabel("Nhập lại mật khẩu mới").fill("Reset-password-2026!");
  await page.getByRole("button", { name: "Đặt lại mật khẩu" }).press("Enter");
  await expect(page).toHaveURL(/\/login$/);
  expect(resetCalls).toBe(1);
  expect(page.url()).not.toContain(resetToken);
  const persisted = await page.evaluate(async () => ({
    local: Object.values(localStorage),
    session: Object.values(sessionStorage),
    databases: (await indexedDB.databases()).map((database) => database.name),
  }));
  expect(JSON.stringify(persisted)).not.toContain(resetToken);
  expect(JSON.stringify(persisted)).not.toContain("Reset-password-2026!");
});

test("invalid reset stays generic and rate limiting is focused without auto replay", async ({ page }) => {
  let calls = 0;
  await fulfillPreflight(page);
  await page.route(`${apiOrigin}/api/v1/auth/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fallback();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/auth/csrf")) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: envelope({ csrfToken: "csrf-reset" }, "csrf-reset"),
      });
      return;
    }
    calls += 1;
    await route.fulfill({
      status: 429,
      headers: { ...corsHeaders, "retry-after": "30" },
      body: JSON.stringify({
        status: 429,
        code: "RATE_LIMITED",
        message: "internal detail",
        requestId: "reset-rate",
      }),
    });
  });

  await page.goto("/login/reset-password");
  await page.getByLabel("Mã đặt lại mật khẩu").fill("z".repeat(43));
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill("Reset-password-2026!");
  await page.getByLabel("Nhập lại mật khẩu mới").fill("Reset-password-2026!");
  await page.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  const alert = page.locator('[role="alert"][tabindex="-1"]');
  await expect(alert).toContainText("30 giây");
  await expect(alert).toBeFocused();
  expect(calls).toBe(1);
  await page.waitForTimeout(300);
  expect(calls).toBe(1);
});

test("revoke-all clears the current principal recovery and routes to login once", async ({ page }) => {
  let revokeCalls = 0;
  await fulfillPreflight(page);
  await page.route(`${apiOrigin}/api/v1/auth/**`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fallback();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/auth/me")) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: envelope({ ...principal, mustChangePassword: false }, "me-settings"),
      });
      return;
    }
    if (path.endsWith("/auth/csrf")) {
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: envelope({ csrfToken: "csrf-settings" }, "csrf-settings"),
      });
      return;
    }
    if (path.endsWith("/auth/sessions:revoke-all")) {
      revokeCalls += 1;
      expect(request.headers()["x-csrf-token"]).toBe("csrf-settings");
      expect(request.headers()["idempotency-key"]).toMatch(operationKeyPattern);
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: envelope(
          {
            status: "sessions_revoked",
            revokedCount: 3,
            currentSessionRevoked: true,
            loginRequired: true,
          },
          "revoke-all",
        ),
      });
      return;
    }
    await route.abort("failed");
  });

  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "Bảo mật tài khoản" })).toBeVisible();
  await page.getByRole("button", { name: "Đăng xuất trên mọi thiết bị" }).click();
  await expect(page.getByRole("note")).toContainText("Bản nháp chỉ lưu trong trình duyệt này sẽ bị xóa");
  await expect(page.getByRole("note")).toContainText("Hãy lưu các thay đổi lên hệ thống trước khi tiếp tục");
  await page.getByRole("button", { name: "Xác nhận đăng xuất" }).press("Enter");
  await expect(page).toHaveURL(/\/login$/);
  expect(revokeCalls).toBe(1);
});
