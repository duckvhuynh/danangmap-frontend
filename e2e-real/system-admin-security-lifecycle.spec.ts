import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { freshTotp, loginWithMfa, requiredEnv } from "./support/auth";

test.skip(
  process.env.DANANGMAP_REAL_STACK !== "true",
  "Set DANANGMAP_REAL_STACK=true to run against the external Docker stack.",
);

// These tests render one-time credentials; never copy them into Playwright artifacts.
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
    const values: string[] = [];
    const append = (value: unknown) => {
      try {
        values.push(typeof value === "string" ? value : (JSON.stringify(value) ?? String(value)));
      } catch {
        values.push(String(value));
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
          append(await new Promise<unknown[]>((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          }));
        }
      } finally {
        database.close();
      }
    }
    return secrets.some((secret) => secret.length > 0 && values.some((value) => value.includes(secret)));
  }, sensitiveValues);
}

async function mailCount(request: APIRequestContext, email: string) {
  const baseURL = requiredEnv("MAILPIT_BASE_URL").replace(/\/$/u, "");
  const response = await request.get(`${baseURL}/api/v1/search?query=${encodeURIComponent(`to:\"${email}\"`)}`);
  if (!response.ok()) return -1;
  const body: unknown = await response.json();
  return typeof body === "object" && body !== null && "messages_count" in body && typeof body.messages_count === "number"
    ? body.messages_count
    : -1;
}

async function waitForMailCount(request: APIRequestContext, email: string, minimum: number) {
  await expect.poll(() => mailCount(request, email), {
    timeout: 60_000,
    intervals: [250, 500, 1_000, 2_000],
  }).toBeGreaterThanOrEqual(minimum);
}

async function createInvite(page: Page, email: string, username: string, displayName: string) {
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Mời" }).click();
  const dialog = page.getByRole("dialog", { name: "Gửi lời mời tài khoản" });
  await dialog.getByLabel("Tên hiển thị").fill(displayName);
  await dialog.getByLabel("Tên đăng nhập").fill(username);
  await dialog.getByLabel("Email công vụ").fill(email);
  await dialog.getByRole("button", { name: "Gửi lời mời" }).click();
  await expect(page.getByRole("status").filter({ hasText: email })).toBeVisible();
}

async function createManualUser(page: Page, email: string, username: string, displayName: string, password: string) {
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  const dialog = page.getByRole("dialog", { name: "Tạo tài khoản thủ công" });
  await dialog.getByLabel("Tên hiển thị").fill(displayName);
  await dialog.getByLabel("Tên đăng nhập").fill(username);
  await dialog.getByLabel("Email công vụ").fill(email);
  await dialog.getByLabel("Mật khẩu tạm thời").fill(password);
  await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page.getByRole("status").filter({ hasText: displayName })).toBeVisible();
}

async function enrollManualUser(page: Page, username: string, temporaryPassword: string, permanentPassword: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Tên đăng nhập hoặc email" }).fill(username);
  await page.getByLabel("Mật khẩu").fill(temporaryPassword);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/login\/mfa\?enrollment=required$/u);
  await page.getByRole("button", { name: "Bắt đầu thiết lập MFA" }).click();
  const secret = (await page.getByTestId("manual-mfa-secret").textContent())?.trim();
  if (!secret) throw new Error("MFA enrollment did not expose a manual secret.");
  const confirmationCode = await freshTotp(page, secret, username);
  await page.getByLabel("Mã xác nhận 6 số").fill(confirmationCode);
  await page.getByRole("button", { name: "Xác nhận và tạo mã khôi phục" }).click();
  const recoveryList = page.getByRole("list", { name: "10 mã khôi phục" });
  await expect(recoveryList.getByRole("listitem")).toHaveCount(10);
  const recoveryCodes = await recoveryList.getByRole("listitem").evaluateAll((items) => items.map((item) =>
    Array.from(item.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join("")
      .trim(),
  ));
  await page.getByRole("checkbox", { name: /Tôi đã lưu mã khôi phục/iu }).check();
  await page.getByRole("button", { name: "Tiếp tục vào trang quản trị" }).click();
  await expect(page).toHaveURL(/\/login\/password-change$/u);
  await page.getByLabel("Mật khẩu hiện tại").fill(temporaryPassword);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(permanentPassword);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(permanentPassword);
  await page.getByRole("button", { name: "Đổi mật khẩu và tiếp tục" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
  expect(await browserStateContains(page, [temporaryPassword, permanentPassword, secret, confirmationCode, ...recoveryCodes])).toBe(false);
}

async function openUserDetail(page: Page, query: string) {
  await page.goto("/admin/users");
  await page.getByLabel("Tìm tài khoản").fill(query);
  const open = page.getByRole("button", { name: /^Xem chi tiết /u }).first();
  await expect(open).toBeVisible();
  await open.click();
  const dialog = page.getByRole("dialog", { name: "Chi tiết tài khoản" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("System Admin resends and revokes a pending invite while Mailpit receives only the credential mail", async ({ browser, request }) => {
  const stamp = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const email = `e2e.invite.lifecycle.${stamp}@example.gov.vn`;
  const username = `invite${stamp}`.slice(0, 48);
  const context = await realContext(browser);
  try {
    const page = await context.newPage();
    await loginWithMfa(page, adminEnvironment);
    await createInvite(page, email, username, `E2E Invite ${stamp}`);
    await waitForMailCount(request, email, 1);

    await page.getByRole("tab", { name: "Lời mời" }).click();
    await page.getByLabel("Tìm lời mời").fill(email);
    await expect(page.getByText(email)).toBeVisible();
    await page.getByRole("button", { name: "Gửi lại" }).click();
    const resend = page.getByRole("dialog", { name: "Gửi lại lời mời" });
    await resend.getByLabel("Lý do gửi lại").fill("Kiểm tra E2E gửi lại lời mời");
    await resend.getByRole("button", { name: "Gửi lời mời mới" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Đã thay lời mời cũ" })).toBeVisible();
    await waitForMailCount(request, email, 2);

    await page.getByRole("button", { name: "Thu hồi" }).click();
    const revoke = page.getByRole("dialog", { name: "Thu hồi lời mời" });
    await expect(revoke).toContainText(email);
    await revoke.getByRole("button", { name: "Thu hồi lời mời" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Đã thu hồi lời mời" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("System Admin manages another user, enforces self-service restrictions, and regenerates its own recovery codes", async ({ browser, request }) => {
  const stamp = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const email = `e2e.user.lifecycle.${stamp}@example.gov.vn`;
  const username = `security${stamp}`.slice(0, 48);
  const temporaryPassword = "Temporary-Security-Account-2026!";
  const permanentPassword = "Permanent-Security-Account-2026!";
  const adminContext = await realContext(browser);
  const targetContext = await realContext(browser);
  try {
    const adminPage = await adminContext.newPage();
    await loginWithMfa(adminPage, adminEnvironment);
    await createManualUser(adminPage, email, username, `E2E Security ${stamp}`, temporaryPassword);

    const targetPage = await targetContext.newPage();
    await enrollManualUser(targetPage, username, temporaryPassword, permanentPassword);

    let detail = await openUserDetail(adminPage, username);
    await detail.getByLabel("Vai trò").click();
    await adminPage.getByRole("option", { name: "Kiểm duyệt viên" }).click();
    await detail.getByLabel("Lý do thay đổi quyền").fill("Kiểm tra E2E cập nhật vai trò");
    const roleUpdate = adminPage.waitForResponse((response) => response.url().includes("/api/v1/admin/users/") && response.request().method() === "PATCH");
    await detail.getByRole("button", { name: "Lưu thay đổi" }).click();
    expect((await roleUpdate).status()).toBe(200);

    await targetPage.goto("/admin");
    await expect(targetPage.getByRole("link", { name: "Quay lại đăng nhập" })).toBeVisible();

    await detail.getByRole("button", { name: "Gửi reset mật khẩu" }).click();
    const passwordReset = adminPage.getByRole("dialog", { name: "Gửi yêu cầu đặt lại mật khẩu" });
    await passwordReset.getByLabel("Lý do thao tác").fill("Kiểm tra E2E mail đặt lại mật khẩu");
    await passwordReset.getByRole("button", { name: "Gửi mail đặt lại" }).click();
    await expect(passwordReset).not.toBeAttached();
    await expect(detail.getByText(/Đặt lại mật khẩu · pending/iu)).toBeVisible();
    await waitForMailCount(request, email, 1);

    await detail.getByRole("button", { name: "Đặt lại MFA" }).click();
    const resetMfa = adminPage.getByRole("dialog", { name: "Đặt lại MFA" });
    await resetMfa.getByLabel("Lý do thao tác").fill("Kiểm tra E2E thiết bị MFA bị mất");
    await resetMfa.getByRole("button", { name: "Đặt lại MFA" }).click();
    await expect(resetMfa).not.toBeAttached();
    await expect(detail.getByText("Chưa đăng ký", { exact: true })).toBeVisible();

    await detail.getByLabel("Trạng thái").click();
    await adminPage.getByRole("option", { name: "Vô hiệu hóa" }).click();
    await detail.getByLabel("Lý do thay đổi quyền").fill("Kiểm tra E2E vô hiệu hóa tài khoản");
    await detail.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(detail.getByText("Đã vô hiệu hóa", { exact: true }).first()).toBeVisible();
    await detail.getByLabel("Trạng thái").click();
    await adminPage.getByRole("option", { name: "Đang hoạt động" }).click();
    await detail.getByLabel("Lý do thay đổi quyền").fill("Kiểm tra E2E kích hoạt lại tài khoản");
    await detail.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(detail.getByText("Đang hoạt động", { exact: true }).first()).toBeVisible();

    await detail.getByRole("button", { name: "Đóng" }).click();
    detail = await openUserDetail(adminPage, requiredEnv("DANANGMAP_ADMIN_LOGIN"));
    await expect(detail.getByText("Tài khoản của bạn", { exact: true })).toBeVisible();
    await expect(detail.getByText("Dùng luồng tự phục vụ cho tài khoản của bạn")).toBeVisible();
    await expect(detail.getByRole("button", { name: "Đặt lại MFA" })).not.toBeAttached();
    await expect(detail.getByRole("button", { name: "Thu hồi mọi phiên" })).not.toBeAttached();
    await detail.getByRole("button", { name: "Đóng" }).click();

    await adminPage.goto("/admin/settings");
    await adminPage.getByLabel("Mật khẩu hiện tại").fill(requiredEnv("DANANGMAP_ADMIN_PASSWORD"));
    const totp = await freshTotp(adminPage, requiredEnv("DANANGMAP_ADMIN_TOTP_SECRET"), "DANANGMAP_ADMIN_LOGIN");
    await adminPage.getByLabel("Mã MFA hoặc mã khôi phục").fill(totp);
    await adminPage.getByRole("checkbox", { name: /toàn bộ mã cũ sẽ mất hiệu lực/iu }).check();
    await adminPage.getByRole("button", { name: "Tạo lại 10 mã khôi phục" }).click();
    const newCodes = adminPage.getByRole("list", { name: "10 mã khôi phục mới" });
    await expect(newCodes.getByRole("listitem")).toHaveCount(10);
    const rawCodes = await newCodes.getByRole("listitem").allTextContents();
    expect(await browserStateContains(adminPage, [requiredEnv("DANANGMAP_ADMIN_PASSWORD"), totp, ...rawCodes])).toBe(false);
    await adminPage.getByRole("checkbox", { name: /đã lưu 10 mã mới/iu }).check();
    await adminPage.getByRole("button", { name: "Đã lưu, ẩn các mã" }).click();
    await expect(newCodes).not.toBeAttached();
  } finally {
    await adminContext.close();
    await targetContext.close();
  }
});
