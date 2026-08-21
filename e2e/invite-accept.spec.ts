import { expect, test, type Page } from "@playwright/test";

const inviteToken = "invite_token_abcdefghijklmnopqrstuvwxyz123456";
const password = "Accepted-password-2026!";
const appOrigin = "http://127.0.0.1:3100";

const corsHeaders = {
  "access-control-allow-origin": appOrigin,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,x-csrf-token",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-expose-headers": "retry-after,x-request-id",
  "content-type": "application/json",
};

const envelope = (data: unknown, requestId: string) =>
  JSON.stringify({ data, meta: { requestId } });

async function openInvitePage(page: Page) {
  await page.goto("/invite/accept");
  await expect(page).toHaveURL(`${appOrigin}/invite/accept`);
  await page.getByLabel("Mã lời mời").fill(inviteToken);
}

test("valid invite is inspected explicitly and accepted into the MFA enrollment handoff", async ({ page }) => {
  let inspectCalls = 0;
  let acceptCalls = 0;
  let csrfCalls = 0;
  await page.route("**/api/v1/auth/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    const path = new URL(request.url()).pathname;
    expect(request.headers().origin).toBe(appOrigin);
    if (path.endsWith("/auth/invites:inspect")) {
      inspectCalls += 1;
      expect(request.headers()["x-csrf-token"]).toBeUndefined();
      expect(request.postDataJSON()).toEqual({ token: inviteToken });
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: envelope(
          {
            maskedEmail: "ed***@danang.gov.vn",
            role: "editor",
            expiresAt: "2026-08-22T08:00:00.000Z",
            requiresMfaEnrollment: true,
          },
          "inspect-valid",
        ),
      });
      return;
    }
    if (path.endsWith("/auth/csrf")) {
      csrfCalls += 1;
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: envelope({ csrfToken: "csrf-invite" }, "csrf-invite"),
      });
      return;
    }
    if (path.endsWith("/auth/invites:accept")) {
      acceptCalls += 1;
      expect(request.headers()["x-csrf-token"]).toBe("csrf-invite");
      expect(request.postDataJSON()).toEqual({
        token: inviteToken,
        password,
        passwordConfirmation: password,
      });
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: envelope(
          {
            status: "mfa_required",
            mfaEnrollmentRequired: true,
            challengeExpiresAt: "2026-08-21T15:00:00.000Z",
          },
          "accept-valid",
        ),
      });
      return;
    }
    await route.abort("failed");
  });

  await openInvitePage(page);
  await page.getByRole("button", { name: "Kiểm tra lời mời" }).press("Enter");
  const summary = page.getByRole("heading", { name: "Kiểm tra thông tin tài khoản" });
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();
  await expect(page.getByText("ed***@danang.gov.vn")).toBeVisible();
  await expect(page.locator("#invite-token")).not.toBeAttached();

  await page.getByLabel("Mật khẩu mới").fill(password);
  await page.getByLabel("Nhập lại mật khẩu").fill(password);
  await page.getByRole("button", { name: "Tạo mật khẩu và tiếp tục" }).press("Enter");
  await expect(page).toHaveURL(/\/login\/mfa\?enrollment=required$/);
  await expect(page.getByRole("heading", { name: "Thiết lập xác thực hai bước" })).toBeVisible();
  expect(inspectCalls).toBe(1);
  expect(csrfCalls).toBe(1);
  expect(acceptCalls).toBe(1);
  expect(page.url()).not.toContain(inviteToken);

  const persisted = await page.evaluate(async () => ({
    local: Object.values(localStorage),
    session: Object.values(sessionStorage),
    databases: (await indexedDB.databases()).map((database) => database.name),
  }));
  expect(JSON.stringify(persisted)).not.toContain(inviteToken);
  expect(JSON.stringify(persisted)).not.toContain(password);
});

test("invalid, expired, used and revoked invite states stay indistinguishable", async ({ page }) => {
  await page.route("**/api/v1/auth/invites:inspect", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fulfill({
      status: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        status: 400,
        code: "INVITE_INVALID_OR_EXPIRED",
        message: "internal invite state must not reach the UI",
        requestId: "invalid-invite",
      }),
    });
  });

  await openInvitePage(page);
  await page.getByRole("button", { name: "Kiểm tra lời mời" }).click();
  const alert = page.locator('[role="alert"][tabindex="-1"]');
  await expect(alert).toContainText("không hợp lệ hoặc đã hết hiệu lực");
  await expect(alert).not.toContainText("internal invite state");
  await expect(alert).toBeFocused();
  await expect(page).toHaveURL(`${appOrigin}/invite/accept`);
  expect(page.url()).not.toContain(inviteToken);
});

test("rate limiting provides a focused retry hint without automatic resubmission", async ({ page }) => {
  let inspectCalls = 0;
  await page.route("**/api/v1/auth/invites:inspect", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    inspectCalls += 1;
    await route.fulfill({
      status: 429,
      headers: { ...corsHeaders, "retry-after": "30" },
      body: JSON.stringify({
        status: 429,
        code: "RATE_LIMITED",
        message: "limited",
        requestId: "rate-invite",
      }),
    });
  });

  await openInvitePage(page);
  await page.getByRole("button", { name: "Kiểm tra lời mời" }).click();
  const alert = page.locator('[role="alert"][tabindex="-1"]');
  await expect(alert).toContainText("30 giây");
  await expect(alert).toBeFocused();
  expect(inspectCalls).toBe(1);
  await page.waitForTimeout(350);
  expect(inspectCalls).toBe(1);
  await expect(page.getByRole("button", { name: "Kiểm tra lời mời" })).toBeEnabled();
});
