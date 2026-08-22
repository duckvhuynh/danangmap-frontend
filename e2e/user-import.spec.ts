import { expect, test, type Page, type Route } from "@playwright/test";

const importId = "11111111-1111-4111-8111-111111111111";
const now = "2026-08-21T00:00:00.000Z";

function job(status: "uploaded" | "inspected" | "validating" | "ready" | "applying" | "completed") {
  return {
    id: importId,
    status,
    format: "csv",
    file: { name: "users.csv", sizeBytes: 92 },
    progress: status === "uploaded" || status === "validating" || status === "applying" ? 10 : 100,
    counts: status === "uploaded" || status === "inspected"
      ? { total: 0, valid: 0, invalid: 0, applied: 0, skipped: 0 }
      : { total: 3, valid: 2, invalid: 1, applied: status === "completed" ? 2 : 0, skipped: status === "completed" ? 1 : 0 },
    inspection: { sheets: [], selectedSheet: null, limits: { maxBytes: 5_242_880, maxRows: 5_000, maxSheets: 10, maxColumns: 4, maxExpandedBytes: 52_428_800 } },
    validRowPolicy: "invite",
    failureCode: null,
    createdAt: now,
    updatedAt: now,
  };
}

function fulfill(route: Route, data: unknown, status = 200, meta: Record<string, unknown> = {}) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ data, meta: { requestId: "e2e-user-import", ...meta } }),
  });
}

async function mockUserImportApi(page: Page) {
  let state: ReturnType<typeof job>["status"] = "uploaded";
  const mutationHeaders: Array<{ path: string; csrf: string | undefined; key: string | undefined }> = [];

  await page.route("**/api/v1/admin/user-imports**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (request.method() === "POST") {
      mutationHeaders.push({ path, csrf: await request.headerValue("x-csrf-token") ?? undefined, key: await request.headerValue("idempotency-key") ?? undefined });
    }
    if (request.method() === "POST" && path.endsWith("/admin/user-imports")) {
      state = "uploaded";
      return fulfill(route, job(state), 202);
    }
    if (request.method() === "POST" && path.endsWith(":validate")) {
      expect(await request.postDataJSON()).toEqual({});
      state = "validating";
      return fulfill(route, job(state), 202);
    }
    if (request.method() === "POST" && path.endsWith(":apply")) {
      expect(await request.postDataJSON()).toEqual({ validRowPolicy: "invite" });
      state = "applying";
      return fulfill(route, job(state), 202);
    }
    if (request.method() === "GET" && path.endsWith("/issues")) {
      expect(url.searchParams.get("limit")).toBe("100");
      return fulfill(route, [{ id: "issue-1", rowNumber: 3, severity: "error", code: "USER_IMPORT_EMAIL_INVALID", field: "email" }], 200, { nextCursor: null, hasMore: false, limit: 100 });
    }
    if (request.method() === "GET" && path.endsWith("/report")) {
      return fulfill(route, { job: job("completed"), issues: [{ id: "issue-1", rowNumber: 3, severity: "error", code: "USER_IMPORT_EMAIL_INVALID", field: "email" }] }, 200, { nextCursor: null, hasMore: false, limit: 100 });
    }
    if (request.method() === "GET" && path.endsWith(importId)) {
      state = state === "uploaded" ? "inspected" : state === "validating" ? "ready" : state === "applying" ? "completed" : state;
      return fulfill(route, job(state));
    }
    return route.fallback();
  });
  return mutationHeaders;
}

test("System Admin completes a CSV import that creates pending invitations", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "User import authoring requires a desktop pointer");
  await page.addInitScript(() => window.sessionStorage.setItem("danangmap-demo-role", "system_admin"));
  const mutationHeaders = await mockUserImportApi(page);

  await page.goto("/admin/users/import");
  await expect(page.getByRole("heading", { name: "Import người dùng nội bộ" })).toBeVisible();
  await expect(page.getByText("Demo · không phải dữ liệu thật")).toBeVisible();
  for (const column of ["email", "username", "displayName", "role"]) {
    await expect(page.getByText(column, { exact: true })).toBeVisible();
  }

  await page.getByLabel("Chọn file CSV hoặc XLSX").setInputFiles({
    name: "users.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("email,username,displayName,role\na@danang.gov.vn,a,Nguyen A,editor"),
  });
  await page.getByRole("button", { name: "Tải lên và kiểm tra" }).click();
  await expect(page.getByRole("heading", { name: /Xác nhận cấu trúc/ })).toBeVisible();
  await expect(page.getByText("Không có bước ánh xạ cột")).toBeVisible();

  await page.getByRole("button", { name: "Kiểm tra dữ liệu" }).click();
  await expect(page.getByRole("heading", { name: /Xem kết quả kiểm tra thử/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "USER_IMPORT_EMAIL_INVALID" })).toBeVisible();
  await page.getByRole("checkbox", { name: /Tôi hiểu đây là thao tác tạo lời mời/ }).check();
  await page.getByRole("button", { name: /Gửi 2 lời mời/ }).click();

  await expect(page.getByRole("heading", { name: "Import người dùng hoàn tất" })).toBeVisible();
  await expect(page.getByText(/2 lời mời đang chờ chấp nhận/)).toBeVisible();
  await expect(page.getByText(/chưa có tài khoản hoạt động nào được tạo trực tiếp/)).toBeVisible();
  expect(mutationHeaders).toHaveLength(3);
  expect(mutationHeaders.every((headers) => headers.csrf === "demo-csrf-token")).toBe(true);
  expect(mutationHeaders[0].key).toMatch(/^[0-9a-f-]{36}$/i);
  expect(mutationHeaders[1].key).toBeUndefined();
  expect(mutationHeaders[2].key).toMatch(/^[0-9a-f-]{36}$/i);
});

test("mobile exposes read-only guidance without upload controls", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("desktop"), "Mobile capability gate");
  await page.addInitScript(() => window.sessionStorage.setItem("danangmap-demo-role", "system_admin"));
  await page.goto("/admin/users/import");
  await expect(page.getByRole("heading", { name: "Import người dùng cần máy tính" })).toBeVisible();
  await expect(page.getByLabel("Chọn file CSV hoặc XLSX")).toBeHidden();
  await expect(page.getByRole("button", { name: "Tải lên và kiểm tra" })).toBeHidden();
});
