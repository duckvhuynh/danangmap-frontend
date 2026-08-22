import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { freshTotp, loginWithMfa, requiredEnv } from "./support/auth";

test.skip(
  process.env.DANANGMAP_REAL_STACK !== "true",
  "Set DANANGMAP_REAL_STACK=true to run against the external Docker stack.",
);

// One-time credentials must never be copied into Playwright artifacts.
test.use({ screenshot: "off", trace: "off", video: "off" });
test.setTimeout(360_000);

const adminEnvironment = {
  login: "DANANGMAP_ADMIN_LOGIN",
  password: "DANANGMAP_ADMIN_PASSWORD",
  totpSecret: "DANANGMAP_ADMIN_TOTP_SECRET",
};

function realContext(browser: Browser) {
  return browser.newContext({
    baseURL: requiredEnv("PLAYWRIGHT_BASE_URL"),
    ignoreHTTPSErrors: true,
  });
}

async function browserStateContains(page: Page, sensitiveValues: string[]) {
  return page.evaluate(async (secrets) => {
    const serialized: string[] = [];
    const append = (value: unknown) => {
      try {
        serialized.push(typeof value === "string" ? value : (JSON.stringify(value) ?? String(value)));
      } catch {
        serialized.push(String(value));
      }
    };

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      append(key);
      if (key) append(localStorage.getItem(key));
    }
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      append(key);
      if (key) append(sessionStorage.getItem(key));
    }
    for (const databaseInfo of await indexedDB.databases()) {
      if (!databaseInfo.name) continue;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const openRequest = indexedDB.open(databaseInfo.name!);
        openRequest.onsuccess = () => resolve(openRequest.result);
        openRequest.onerror = () => reject(openRequest.error);
      });
      try {
        for (const storeName of Array.from(database.objectStoreNames)) {
          const transaction = database.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          const [keys, values] = await Promise.all([
            new Promise<IDBValidKey[]>((resolve, reject) => {
              const request = store.getAllKeys();
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            }),
            new Promise<unknown[]>((resolve, reject) => {
              const request = store.getAll();
              request.onsuccess = () => resolve(request.result);
              request.onerror = () => reject(request.error);
            }),
          ]);
          append(keys);
          append(values);
        }
      } finally {
        database.close();
      }
    }
    return secrets.some((secret) => secret.length > 0 && serialized.some((value) => value.includes(secret)));
  }, sensitiveValues);
}

async function expectSecretsAbsent(page: Page, sensitiveValues: string[]) {
  expect(sensitiveValues.some((value) => page.url().includes(value))).toBe(false);
  expect(await browserStateContains(page, sensitiveValues)).toBe(false);
}

function envelopeData(value: unknown) {
  if (typeof value !== "object" || value === null || !("data" in value)) return null;
  const data = value.data;
  return typeof data === "object" && data !== null ? data as Record<string, unknown> : null;
}

async function readBodyOnlyCredential(
  request: APIRequestContext,
  email: string,
  subjectFragment: string,
  instruction: string,
) {
  const mailpitBaseURL = requiredEnv("MAILPIT_BASE_URL").replace(/\/$/u, "");
  const encodedQuery = encodeURIComponent(`to:\"${email}\"`);
  await expect.poll(async () => {
    const response = await request.get(`${mailpitBaseURL}/api/v1/search?query=${encodedQuery}`);
    if (!response.ok()) return 0;
    const result: unknown = await response.json();
    if (typeof result !== "object" || result === null || !("messages_count" in result)) return 0;
    return typeof result.messages_count === "number" ? result.messages_count : 0;
  }, { timeout: 60_000, intervals: [250, 500, 1_000, 2_000] }).toBeGreaterThan(0);

  const searchResponse = await request.get(`${mailpitBaseURL}/api/v1/search?query=${encodedQuery}`);
  expect(searchResponse.ok()).toBe(true);
  const searchResult: unknown = await searchResponse.json();
  const messages = typeof searchResult === "object" && searchResult !== null && "messages" in searchResult && Array.isArray(searchResult.messages)
    ? searchResult.messages
    : [];
  const subject = typeof messages[0] === "object" && messages[0] !== null && "Subject" in messages[0]
    ? messages[0].Subject
    : null;
  expect(typeof subject === "string" && subject.includes(subjectFragment)).toBe(true);

  const response = await request.get(`${mailpitBaseURL}/view/latest.txt?query=${encodedQuery}`);
  expect(response.ok()).toBe(true);
  const body = (await response.text()).replace(/\r\n/gu, "\n");
  expect(body.includes(instruction)).toBe(true);
  expect(/https?:\/\//iu.test(body)).toBe(false);
  const credential = body.match(/\n\n([A-Za-z0-9_-]{20,512})\n\n/u)?.[1];
  expect(Boolean(credential)).toBe(true);
  if (!credential) throw new Error("Mailpit message did not contain the expected body-only credential.");
  return credential;
}

async function createInvite(page: Page, email: string, username: string, displayName: string) {
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Mời" }).click();
  const dialog = page.getByRole("dialog", { name: "Gửi lời mời tài khoản" });
  await dialog.getByLabel("Tên hiển thị").fill(displayName);
  await dialog.getByLabel("Tên đăng nhập").fill(username);
  await dialog.getByLabel("Email công vụ").fill(email);
  const inviteResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/admin/invites") && response.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Gửi lời mời" }).click();
  const response = await inviteResponse;
  expect(response.status()).toBe(202);
  const data = envelopeData(await response.json());
  const inviteId = data?.id;
  expect(typeof inviteId === "string").toBe(true);
  if (typeof inviteId !== "string") throw new Error("Invite response did not contain an id.");
  await expect(page.getByRole("status")).toContainText(displayName);
  return inviteId;
}

async function revokeInvite(page: Page, inviteId: string) {
  const status = await page.evaluate(async (id) => {
    const csrfResponse = await fetch("/api/v1/auth/csrf", { credentials: "include" });
    const csrfEnvelope: unknown = await csrfResponse.json();
    const csrfToken = typeof csrfEnvelope === "object"
      && csrfEnvelope !== null
      && "data" in csrfEnvelope
      && typeof csrfEnvelope.data === "object"
      && csrfEnvelope.data !== null
      && "csrfToken" in csrfEnvelope.data
      && typeof csrfEnvelope.data.csrfToken === "string"
      ? csrfEnvelope.data.csrfToken
      : "";
    const response = await fetch(`/api/v1/admin/invites/${id}:revoke`, {
      credentials: "include",
      headers: {
        "Idempotency-Key": crypto.randomUUID(),
        "X-CSRF-Token": csrfToken,
      },
      method: "POST",
    });
    return response.status;
  }, inviteId);
  expect(status).toBe(200);
}

async function createManualEditor(page: Page, email: string, username: string, displayName: string, password: string) {
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo tài khoản thủ công" });
  await dialog.getByLabel("Tên hiển thị").fill(displayName);
  await dialog.getByLabel("Tên đăng nhập").fill(username);
  await dialog.getByLabel("Email công vụ").fill(email);
  await dialog.getByLabel("Mật khẩu tạm thời").fill(password);
  await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByRole("status")).toContainText(displayName);
}

async function initialLoginAndPasswordChange(
  page: Page,
  username: string,
  temporaryPassword: string,
  permanentPassword: string,
) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Tên đăng nhập hoặc email" }).fill(username);
  await page.getByLabel("Mật khẩu").fill(temporaryPassword);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/login\/mfa\?enrollment=required$/u);
  await page.getByRole("button", { name: "Bắt đầu thiết lập MFA" }).click();
  const secret = (await page.getByTestId("manual-mfa-secret").textContent())?.trim();
  expect(secret?.length).toBe(32);
  if (!secret) throw new Error("MFA enrollment did not expose a manual secret.");
  const confirmationCode = await freshTotp(page, secret, username);
  await page.getByLabel("Mã xác nhận 6 số").fill(confirmationCode);
  await page.getByRole("button", { name: "Xác nhận và tạo mã khôi phục" }).click();
  const recoveryList = page.getByRole("list", { name: "10 mã khôi phục" });
  await expect(recoveryList.getByRole("listitem")).toHaveCount(10);
  const recoveryCodes = (await recoveryList.getByRole("listitem").allTextContents()).map((value) => value.trim());
  await page.getByRole("checkbox", { name: /Tôi đã lưu mã khôi phục/u }).check();
  await page.getByRole("button", { name: "Tiếp tục vào trang quản trị" }).click();
  await expect(page).toHaveURL(/\/login\/password-change$/u);
  await page.getByLabel("Mật khẩu hiện tại").fill(temporaryPassword);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(permanentPassword);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(permanentPassword);
  await page.getByRole("button", { name: "Đổi mật khẩu và tiếp tục" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
  await expectSecretsAbsent(page, [temporaryPassword, secret, confirmationCode, ...recoveryCodes]);
  return recoveryCodes;
}

async function loginWithRecoveryCode(page: Page, username: string, password: string, recoveryCode: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Tên đăng nhập hoặc email" }).fill(username);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/login\/mfa$/u);
  await page.getByRole("button", { name: "Mã khôi phục" }).click();
  await page.getByLabel("Mã khôi phục").fill(recoveryCode);
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
  await expect(page.getByRole("heading", { name: "Tổng quan hệ thống" })).toBeVisible();
  await expectSecretsAbsent(page, [password, recoveryCode]);
}

async function requestPasswordReset(page: Page, email: string) {
  await page.goto("/login/forgot-password");
  await page.getByLabel("Email tài khoản nội bộ").fill(email);
  await page.getByRole("button", { name: "Gửi hướng dẫn đặt lại" }).click();
  await expect(page.getByRole("status")).toContainText("Nếu email thuộc một tài khoản phù hợp");
}

async function confirmPasswordReset(page: Page, token: string, password: string) {
  await page.goto("/login/reset-password");
  await page.getByLabel("Mã đặt lại mật khẩu").fill(token);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(password);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(password);
  await page.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await expectSecretsAbsent(page, [token, password]);
}

async function expectSessionDenied(page: Page) {
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: "Quay lại đăng nhập" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tổng quan hệ thống" })).not.toBeAttached();
}

async function closeContexts(contexts: BrowserContext[]) {
  await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
}

test("a revoked invite is denied generically and its body-only token is not persisted", async ({ browser, request }) => {
  const stamp = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const email = `e2e.revoked.${stamp}@example.gov.vn`;
  const username = `revoked${stamp}`.slice(0, 48);
  const displayName = `E2E Revoked Editor ${stamp}`;
  const contexts = [await realContext(browser), await realContext(browser)];
  try {
    const adminPage = await contexts[0]!.newPage();
    await loginWithMfa(adminPage, adminEnvironment);
    const inviteId = await createInvite(adminPage, email, username, displayName);
    const token = await readBodyOnlyCredential(
      request,
      email,
      "Mã mời",
      "Hãy sao chép và dán mã mời sau vào màn hình chấp nhận lời mời:",
    );
    await revokeInvite(adminPage, inviteId);

    const invitePage = await contexts[1]!.newPage();
    await invitePage.goto("/invite/accept");
    await invitePage.getByLabel("Mã lời mời").fill(token);
    await invitePage.getByRole("button", { name: "Kiểm tra lời mời" }).click();
    const alert = invitePage.getByRole("alert");
    await expect(alert).toContainText("không hợp lệ hoặc đã hết hiệu lực");
    await expect(alert).not.toContainText(/thu hồi|revoked/iu);
    await expect(invitePage.getByLabel("Mã lời mời")).toBeFocused();
    await invitePage.getByLabel("Mã lời mời").fill("");
    await expectSecretsAbsent(invitePage, [token]);
  } finally {
    await closeContexts(contexts);
  }
});

test("password reset and revoke-all invalidate every real browser session", async ({ browser, request }) => {
  const stamp = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const email = `e2e.recovery.${stamp}@example.gov.vn`;
  const username = `recovery${stamp}`.slice(0, 48);
  const displayName = `E2E Recovery Editor ${stamp}`;
  const temporaryPassword = "Temporary-Recovery-Account-2026!";
  const firstPassword = "First-Recovery-Account-Password-2026!";
  const resetPassword = "Reset-Recovery-Account-Password-2026!";
  const contexts = await Promise.all(Array.from({ length: 6 }, () => realContext(browser)));
  try {
    const adminPage = await contexts[0]!.newPage();
    await loginWithMfa(adminPage, adminEnvironment);
    await createManualEditor(adminPage, email, username, displayName, temporaryPassword);

    const firstSession = await contexts[1]!.newPage();
    const recoveryCodes = await initialLoginAndPasswordChange(firstSession, username, temporaryPassword, firstPassword);
    const secondSession = await contexts[2]!.newPage();
    await loginWithRecoveryCode(secondSession, username, firstPassword, recoveryCodes[0]!);

    const resetPage = await contexts[3]!.newPage();
    await requestPasswordReset(resetPage, email);
    const resetToken = await readBodyOnlyCredential(
      request,
      email,
      "đặt lại mật khẩu",
      "Hãy sao chép và dán mã sau vào màn hình đặt lại mật khẩu:",
    );
    await confirmPasswordReset(resetPage, resetToken, resetPassword);
    await expectSessionDenied(firstSession);
    await expectSessionDenied(secondSession);

    const freshSession = await contexts[4]!.newPage();
    const otherFreshSession = await contexts[5]!.newPage();
    await loginWithRecoveryCode(freshSession, username, resetPassword, recoveryCodes[1]!);
    await loginWithRecoveryCode(otherFreshSession, username, resetPassword, recoveryCodes[2]!);
    await freshSession.goto("/admin/settings");
    await freshSession.getByRole("button", { name: "Thu hồi toàn bộ phiên" }).click();
    await expect(freshSession.getByRole("button", { name: "Xác nhận thu hồi" })).toBeFocused();
    await freshSession.getByRole("button", { name: "Xác nhận thu hồi" }).click();
    await expect(freshSession).toHaveURL(/\/login$/u);
    await expectSessionDenied(otherFreshSession);
  } finally {
    await closeContexts(contexts);
  }
});

test("expired and rate-limited invite inspection stays generic and safe", async ({ browser }) => {
  const expiredToken = requiredEnv("DANANGMAP_EXPIRED_INVITE_TOKEN");
  const rateLimitToken = requiredEnv("DANANGMAP_INVITE_RATE_LIMIT_TOKEN");
  const context = await realContext(browser);
  try {
    const page = await context.newPage();
    await page.goto("/invite/accept");
    const input = page.getByLabel("Mã lời mời");
    await input.fill(expiredToken);
    const expiredResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/v1/auth/invites:inspect") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Kiểm tra lời mời" }).click();
    expect((await expiredResponse).status()).toBe(400);
    const expiredAlert = page.getByRole("alert");
    await expect(expiredAlert).toContainText("không hợp lệ hoặc đã hết hiệu lực");
    await expect(expiredAlert).not.toContainText(/hết hạn|expired/iu);
    await expect(input).toBeFocused();
    await input.fill("");
    await expectSecretsAbsent(page, [expiredToken]);

    const primedStatuses = await page.evaluate(async (token) => {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const response = await fetch("/api/v1/auth/invites:inspect", {
          body: JSON.stringify({ token }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        statuses.push(response.status);
      }
      return statuses;
    }, rateLimitToken);
    expect(primedStatuses.length).toBe(30);
    expect(primedStatuses.every((status) => status === 400)).toBe(true);

    await input.fill(rateLimitToken);
    const limitedResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/v1/auth/invites:inspect") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Kiểm tra lời mời" }).click();
    const response = await limitedResponse;
    expect(response.status()).toBe(429);
    expect(/^\d+$/u.test(response.headers()["retry-after"] ?? "")).toBe(true);
    const limitedAlert = page.getByRole("alert");
    await expect(limitedAlert).toContainText(/Có quá nhiều lần thử.*Thử lại sau \d+ giây/u);
    expect(await limitedAlert.evaluate((element) => document.activeElement === element)).toBe(true);
    await input.fill("");
    await expectSecretsAbsent(page, [rateLimitToken]);
  } finally {
    await context.close();
  }
});
