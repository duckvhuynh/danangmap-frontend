import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { freshTotp, requiredEnv } from "./support/auth";

test.skip(
  process.env.DANANGMAP_REAL_STACK !== "true",
  "Set DANANGMAP_REAL_STACK=true to run against the external Docker stack.",
);

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
        const request = indexedDB.open(databaseInfo.name!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
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

async function loginWithMfa(page: Page) {
  const password = requiredEnv("DANANGMAP_ADMIN_PASSWORD");
  const secret = requiredEnv("DANANGMAP_ADMIN_TOTP_SECRET");
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Tên đăng nhập hoặc email" }).fill(requiredEnv("DANANGMAP_ADMIN_LOGIN"));
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/login\/mfa$/u);
  const code = await freshTotp(page, secret, "DANANGMAP_ADMIN_LOGIN");
  await page.getByLabel("Mã xác thực 6 số").fill(code);
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  expect([password, secret, code].some((value) => page.url().includes(value))).toBe(false);
  expect(await browserStateContains(page, [password, secret, code])).toBe(false);
}

async function importInvitedEditor(page: Page, email: string, username: string, displayName: string) {
  await page.goto("/admin/users/import");
  await expect(page.getByRole("heading", { name: "Nhập danh sách người dùng" })).toBeVisible();
  await expect(page.getByText("Bản dùng thử · dữ liệu minh họa")).not.toBeAttached();
  await page.getByLabel("Chọn tệp CSV hoặc XLSX").setInputFiles({
    name: "real-stack-users.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`email,username,displayName,role\n${email},${username},${displayName},editor\n`, "utf8"),
  });
  await page.getByRole("button", { name: "Tải lên và kiểm tra" }).click();
  await expect(page.getByRole("heading", { name: /Kiểm tra danh sách đã tải lên/u })).toBeVisible();
  await page.getByRole("button", { name: "Kiểm tra dữ liệu" }).click();
  await expect(page.getByRole("heading", { name: /Xem kết quả kiểm tra/u })).toBeVisible();
  await expect(page.getByText("Không có lỗi", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: /Tôi hiểu đây là thao tác tạo lời mời/u }).check();
  await page.getByRole("button", { name: "Gửi 1 lời mời" }).click();
  await expect(page.getByRole("heading", { name: "Đã nhập danh sách người dùng" })).toBeVisible();
  await expect(page.getByText(/Đã tạo 1 lời mời/u)).toBeVisible();
  await expect(page.getByText(/Người nhận cần mở email và đặt mật khẩu để bắt đầu sử dụng tài khoản/u)).toBeVisible();
}

async function readInviteToken(request: APIRequestContext, email: string) {
  const mailpitBaseURL = requiredEnv("MAILPIT_BASE_URL").replace(/\/$/u, "");
  const query = `to:\"${email}\"`;
  const encodedQuery = encodeURIComponent(query);
  await expect.poll(async () => {
    const response = await request.get(`${mailpitBaseURL}/api/v1/search?query=${encodedQuery}`);
    if (!response.ok()) return -1;
    const result: unknown = await response.json();
    if (typeof result !== "object" || result === null || !("messages_count" in result)) return -1;
    return typeof result.messages_count === "number" ? result.messages_count : -1;
  }, { timeout: 60_000, intervals: [250, 500, 1_000, 2_000] }).toBe(1);

  const searchResponse = await request.get(`${mailpitBaseURL}/api/v1/search?query=${encodedQuery}`);
  expect(searchResponse.ok()).toBe(true);
  const searchResult: unknown = await searchResponse.json();
  const subject = typeof searchResult === "object"
    && searchResult !== null
    && "messages" in searchResult
    && Array.isArray(searchResult.messages)
    && typeof searchResult.messages[0] === "object"
    && searchResult.messages[0] !== null
    && "Subject" in searchResult.messages[0]
    && typeof searchResult.messages[0].Subject === "string"
    ? searchResult.messages[0].Subject
    : null;
  expect(subject?.includes("Mã mời")).toBe(true);

  const response = await request.get(`${mailpitBaseURL}/view/latest.txt?query=${encodedQuery}`);
  expect(response.ok()).toBe(true);
  const body = (await response.text()).replace(/\r\n/gu, "\n");
  expect(body.includes("Hãy sao chép và dán mã mời sau vào màn hình chấp nhận lời mời:")).toBe(true);
  expect(/https?:\/\//iu.test(body)).toBe(false);
  const token = body.match(/\n\n([A-Za-z0-9_-]{20,256})\n\n/u)?.[1];
  expect(Boolean(token)).toBe(true);
  if (!token) throw new Error("Mailpit invite message did not contain a body-only credential.");
  return token;
}

async function acceptInviteAndEnroll(page: Page, token: string, password: string, displayName: string) {
  await page.goto("/invite/accept");
  await page.getByLabel("Mã lời mời").fill(token);
  await page.getByRole("button", { name: "Kiểm tra lời mời" }).click();
  await expect(page.getByRole("heading", { name: "Kiểm tra thông tin tài khoản" })).toBeVisible();
  await expect(page.locator("#invite-token")).not.toBeAttached();
  await page.getByLabel("Mật khẩu mới").fill(password);
  await page.getByLabel("Nhập lại mật khẩu").fill(password);
  await page.getByRole("button", { name: "Tạo mật khẩu và tiếp tục" }).click();
  await expect(page).toHaveURL(/\/login\/mfa\?enrollment=required$/u);
  expect(page.url().includes(token)).toBe(false);

  expect(await browserStateContains(page, [token, password])).toBe(false);

  await page.getByRole("button", { name: "Thiết lập xác thực hai bước" }).click();
  const secret = (await page.getByTestId("manual-mfa-secret").textContent())?.trim();
  expect(secret?.length).toBe(32);
  if (!secret) throw new Error("MFA enrollment did not expose a manual secret.");
  const code = await freshTotp(page, secret);
  await page.getByLabel("Mã xác nhận 6 số").fill(code);
  await page.getByRole("button", { name: "Xác nhận và tạo mã khôi phục" }).click();
  const codes = page.getByRole("list", { name: "10 mã khôi phục" });
  await expect(codes.getByRole("listitem")).toHaveCount(10);
  const recoveryCodes = (await codes.getByRole("listitem").allTextContents()).map((value) => value.trim());
  expect(recoveryCodes.every((value) => value.length > 0)).toBe(true);
  await page.getByRole("checkbox", { name: /Tôi đã lưu mã khôi phục/u }).check();
  await page.getByRole("button", { name: "Tiếp tục vào trang quản trị" }).click();
  await expect(page).toHaveURL(/\/admin$/u);
  await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible();
  await expect(page.getByText(displayName).first()).toBeVisible();
  await expect(codes).not.toBeAttached();
  const sensitiveValues = [token, password, secret, code, ...recoveryCodes];
  expect(sensitiveValues.some((value) => page.url().includes(value))).toBe(false);
  expect(await browserStateContains(page, sensitiveValues)).toBe(false);
}

async function assertInviteReplayDenied(page: Page, token: string) {
  await page.goto("/invite/accept");
  await page.getByLabel("Mã lời mời").fill(token);
  await page.getByRole("button", { name: "Kiểm tra lời mời" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "không hợp lệ hoặc đã hết hiệu lực" });
  await expect(alert).toContainText("không hợp lệ hoặc đã hết hiệu lực");
  await expect(alert).not.toContainText(/đã sử dụng|thu hồi|revoked|used/iu);
  expect(page.url().includes(token)).toBe(false);
  await page.getByLabel("Mã lời mời").fill("");
  expect(await browserStateContains(page, [token])).toBe(false);
}

test("System Admin imports an invited Editor who accepts and enrolls MFA", async ({ browser, request }) => {
  const stamp = `${Date.now().toString(36)}${process.pid.toString(36)}`;
  const email = `e2e.imported.${stamp}@example.gov.vn`;
  const username = `e2e${stamp}`.slice(0, 48);
  const displayName = `E2E Imported Editor ${stamp}`;
  const password = "Imported-Account-Password-2026!";
  const contextOptions = { baseURL: requiredEnv("PLAYWRIGHT_BASE_URL"), ignoreHTTPSErrors: true };
  const adminContext = await browser.newContext(contextOptions);
  const invitedContext = await browser.newContext(contextOptions);
  const replayContext = await browser.newContext(contextOptions);
  try {
    const adminPage = await adminContext.newPage();
    await loginWithMfa(adminPage);
    await importInvitedEditor(adminPage, email, username, displayName);
    const inviteToken = await readInviteToken(request, email);

    const invitedPage = await invitedContext.newPage();
    await acceptInviteAndEnroll(invitedPage, inviteToken, password, displayName);

    const replayPage = await replayContext.newPage();
    await assertInviteReplayDenied(replayPage, inviteToken);
  } finally {
    await adminContext.close();
    await invitedContext.close();
    await replayContext.close();
  }
});
