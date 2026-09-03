import { expect, test, type Page, type Route } from "@playwright/test";

const corsHeaders = {
  "access-control-allow-origin": "http://127.0.0.1:3100",
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,x-csrf-token,idempotency-key",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "content-type": "application/json",
};

const initialUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "editor@danang.gov.vn",
  username: "editor01",
  displayName: "Biên tập viên 01",
  role: "editor",
  status: "active",
  mfaEnabled: true,
  mustChangePassword: false,
};

function envelope(data: unknown, meta: Record<string, unknown> = { requestId: "e2e-request" }) {
  return JSON.stringify({ data, meta });
}

async function preflight(route: Route) {
  if (route.request().method() !== "OPTIONS") return false;
  await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
  return true;
}

async function installSystemAdmin(page: Page) {
  await page.addInitScript(() => window.sessionStorage.setItem("danangmap-demo-role", "system_admin"));
}

test("System Admin creates a manual account and refreshes the real list", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Account authoring requires desktop pointer capability");
  await installSystemAdmin(page);
  const users = [initialUser];
  let createRequest: { body: Record<string, unknown>; csrf: string | undefined; operationKey: string | undefined } | null = null;

  await page.route("http://localhost:4000/api/v1/admin/users", async (route) => {
    if (await preflight(route)) return;
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, headers: corsHeaders, body: envelope(users, { requestId: "e2e-list", nextCursor: null, hasMore: false, limit: 50 }) });
      return;
    }
    createRequest = { body: request.postDataJSON(), csrf: request.headers()["x-csrf-token"], operationKey: request.headers()["idempotency-key"] };
    const created = {
      id: "22222222-2222-4222-8222-222222222222",
      email: String(createRequest.body.email),
      username: String(createRequest.body.username),
      displayName: String(createRequest.body.displayName),
      role: String(createRequest.body.role),
      status: "active",
      mfaEnabled: false,
      mustChangePassword: true,
    };
    users.push(created);
    await route.fulfill({ status: 201, headers: corsHeaders, body: envelope(created) });
  });

  await page.goto("/admin/users");
  await expect(page.getByText(initialUser.displayName).first()).toBeVisible();
  const createButton = page.getByRole("button", { name: "Tạo tài khoản" }).first();
  await createButton.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Tên hiển thị").fill("Nguyễn Văn An");
  await dialog.getByLabel("Tên đăng nhập").fill("nguyenvanan");
  await dialog.getByLabel("Email công vụ").fill("an.nguyen@danang.gov.vn");
  await dialog.getByLabel("Mật khẩu tạm thời").fill("Temporary-123");
  await dialog.getByRole("button", { name: "Tạo tài khoản" }).click();

  await expect(page.getByText("Đã tạo tài khoản cho Nguyễn Văn An.")).toBeVisible();
  await expect(page.getByText("Nguyễn Văn An").first()).toBeVisible();
  expect(createRequest).not.toBeNull();
  expect(createRequest!.body).toMatchObject({ email: "an.nguyen@danang.gov.vn", username: "nguyenvanan", displayName: "Nguyễn Văn An", role: "editor", delivery: "manual", temporaryPassword: "Temporary-123" });
  expect(createRequest!.csrf).toBe("demo-csrf-token");
  expect(createRequest!.operationKey).toMatch(/^[0-9a-f-]{36}$/i);
});

test("System Admin invite uses the dedicated route and explains a 409 conflict", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Account authoring requires desktop pointer capability");
  await installSystemAdmin(page);
  let operationKey = "";

  await page.route("http://localhost:4000/api/v1/admin/users", async (route) => {
    if (await preflight(route)) return;
    await route.fulfill({ status: 200, headers: corsHeaders, body: envelope([initialUser], { requestId: "e2e-list", nextCursor: null, hasMore: false, limit: 50 }) });
  });
  await page.route("http://localhost:4000/api/v1/admin/invites", async (route) => {
    if (await preflight(route)) return;
    operationKey = route.request().headers()["idempotency-key"] ?? "";
    await route.fulfill({ status: 409, headers: corsHeaders, body: JSON.stringify({ status: 409, code: "EMAIL_EXISTS", message: "Email đã có tài khoản.", requestId: "e2e-conflict" }) });
  });

  await page.goto("/admin/users");
  await expect(page.getByText(initialUser.displayName).first()).toBeVisible();
  await page.getByRole("button", { name: "Gửi lời mời" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tên hiển thị").fill("Kiểm duyệt viên 01");
  await dialog.getByLabel("Tên đăng nhập").fill("reviewer01");
  await dialog.getByLabel("Email công vụ").fill("reviewer@danang.gov.vn");
  await dialog.getByRole("button", { name: "Gửi lời mời" }).click();
  const alert = dialog.getByRole("alert");
  await expect(alert).toContainText("Email hoặc tên đăng nhập có thể đã được sử dụng");
  await expect(alert).toContainText("Hãy kiểm tra danh sách tài khoản");
  await expect(alert).not.toContainText("e2e-conflict");
  expect(operationKey).toMatch(/^[0-9a-f-]{36}$/i);
});

test("mobile System Admin can inspect users but cannot author accounts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("desktop"), "Mobile capability gate");
  await installSystemAdmin(page);
  await page.route("http://localhost:4000/api/v1/admin/users", async (route) => {
    if (await preflight(route)) return;
    await route.fulfill({ status: 200, headers: corsHeaders, body: envelope([initialUser], { requestId: "e2e-list", nextCursor: null, hasMore: false, limit: 50 }) });
  });
  await page.goto("/admin/users");
  await expect(page.getByText("Chế độ chỉ xem")).toBeVisible();
  await expect(page.getByText(initialUser.displayName).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Gửi lời mời" })).not.toBeAttached();
  await expect(page.getByRole("button", { name: "Tạo tài khoản" })).not.toBeAttached();
  await expect(page.getByRole("link", { name: "Nhập từ tệp" })).not.toBeAttached();
});

test("a direct non-System Admin visit is denied without loading users", async ({ page }) => {
  let userRequests = 0;
  await page.addInitScript(() => window.sessionStorage.setItem("danangmap-demo-role", "reviewer"));
  await page.route("http://localhost:4000/api/v1/admin/users", async (route) => {
    userRequests += 1;
    await route.abort();
  });
  await page.goto("/admin/users");
  await expect(page.getByRole("alert").filter({ hasText: "Không có quyền truy cập" })).toContainText("Không có quyền truy cập");
  expect(userRequests).toBe(0);
});
