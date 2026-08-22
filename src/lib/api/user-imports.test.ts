import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDanangMapClient } from "./generated/client";
import {
  applyUserImport,
  createUserImport,
  getUserImport,
  getUserImportReport,
  listUserImportIssues,
  validateUserImport,
  type UserImportJob,
} from "./user-imports";

const importId = "11111111-1111-4111-8111-111111111111";
const uploadKey = "22222222-2222-4222-8222-222222222222";
const applyKey = "33333333-3333-4333-8333-333333333333";
const csrfToken = "csrf-user-import";

const job: UserImportJob = {
  id: importId,
  status: "inspected",
  format: "xlsx",
  file: { name: "users.xlsx", sizeBytes: 1024 },
  progress: 100,
  counts: { total: 3, valid: 2, invalid: 1, applied: 0, skipped: 0 },
  inspection: {
    sheets: ["Users"],
    selectedSheet: null,
    limits: { maxBytes: 5_242_880, maxRows: 5_000, maxSheets: 10, maxColumns: 4, maxExpandedBytes: 52_428_800 },
  },
  validRowPolicy: "invite",
  failureCode: null,
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:01:00.000Z",
};

function envelope(data: unknown, meta: Record<string, unknown> = {}) {
  return JSON.stringify({ data, meta: { requestId: "request-user-import", ...meta } });
}

function transport() {
  const requests: Request[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request);
    if (request.url.includes("/issues")) {
      return new Response(envelope([{ id: "issue-1", rowNumber: 2, severity: "error", code: "USER_IMPORT_EMAIL_INVALID", field: "email" }], { nextCursor: "next-1", hasMore: true, limit: 50 }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (request.url.includes("/report")) {
      return new Response(envelope({ job: { ...job, status: "completed" }, issues: [] }, { nextCursor: null, hasMore: false, limit: 25 }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const status = request.method === "POST" ? 202 : 200;
    return new Response(envelope(job), { status, headers: { "content-type": "application/json" } });
  });
  return { client: createDanangMapClient(fetcher), requests };
}

describe("typed user import API adapter", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DANANGMAP_DEMO_MODE", "false");
    vi.stubEnv("NEXT_PUBLIC_DANANGMAP_USER_IMPORT_E2E_MODE", "false");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("uploads only the binary field and reuses the caller-owned upload key", async () => {
    const { client, requests } = transport();
    const file = new File(["email,username,displayName,role\na@danang.gov.vn,a,A,editor"], "users.csv", { type: "text/csv" });
    const formSet = vi.spyOn(FormData.prototype, "set");

    await createUserImport(file, uploadKey, csrfToken, client);
    await createUserImport(file, uploadKey, csrfToken, client);

    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.credentials === "include")).toBe(true);
    expect(requests.map((request) => request.headers.get("idempotency-key"))).toEqual([uploadKey, uploadKey]);
    expect(requests.map((request) => request.headers.get("x-csrf-token"))).toEqual([csrfToken, csrfToken]);
    expect(formSet).toHaveBeenCalledWith("file", file);
    expect(formSet).toHaveBeenCalledTimes(2);
  });

  it("uses the typed status and XLSX validation contract", async () => {
    const { client, requests } = transport();

    await getUserImport(importId, undefined, client);
    await validateUserImport(importId, "Users", csrfToken, client);
    await validateUserImport(importId, undefined, csrfToken, client);

    expect(requests[0].url.endsWith(`/api/v1/admin/user-imports/${importId}`)).toBe(true);
    expect(await requests[1].json()).toEqual({ sheet: "Users" });
    expect(await requests[2].json()).toEqual({});
    expect(requests.slice(1).map((request) => request.headers.get("x-csrf-token"))).toEqual([csrfToken, csrfToken]);
  });

  it("applies invite-only policy with the same idempotency key across retries", async () => {
    const { client, requests } = transport();

    await applyUserImport(importId, applyKey, csrfToken, client);
    await applyUserImport(importId, applyKey, csrfToken, client);

    expect(requests.map((request) => request.headers.get("idempotency-key"))).toEqual([applyKey, applyKey]);
    expect(requests.map((request) => request.headers.get("x-csrf-token"))).toEqual([csrfToken, csrfToken]);
    expect(await requests[0].json()).toEqual({ validRowPolicy: "invite" });
    expect(await requests[1].json()).toEqual({ validRowPolicy: "invite" });
  });

  it("passes server-side filters and cursor pagination to issues and report", async () => {
    const { client, requests } = transport();

    await expect(listUserImportIssues(importId, { code: "USER_IMPORT_EMAIL_INVALID", cursor: "cursor-1", limit: 50 }, client)).resolves.toMatchObject({ meta: { nextCursor: "next-1", hasMore: true } });
    await expect(getUserImportReport(importId, { code: "USER_IMPORT_ROLE_INVALID", cursor: "cursor-2", limit: 25 }, client)).resolves.toMatchObject({ job: { status: "completed" }, meta: { hasMore: false } });

    expect(Object.fromEntries(new URL(requests[0].url).searchParams)).toEqual({ code: "USER_IMPORT_EMAIL_INVALID", limit: "50", cursor: "cursor-1" });
    expect(Object.fromEntries(new URL(requests[1].url).searchParams)).toEqual({ code: "USER_IMPORT_ROLE_INVALID", limit: "25", cursor: "cursor-2" });
    expect(requests.every((request) => request.credentials === "include")).toBe(true);
  });

  it.each([401, 403, 409, 412, 413, 415, 422, 429, 503])("preserves explicit %i problem details", async (status) => {
    const client = createDanangMapClient(async () => new Response(JSON.stringify({ status, code: `USER_IMPORT_${status}`, message: "Chi tiết lỗi import", requestId: `request-${status}` }), { status, headers: { "content-type": "application/json" } }));
    await expect(getUserImport(importId, undefined, client)).rejects.toMatchObject({ status, code: `USER_IMPORT_${status}`, requestId: `request-${status}` });
  });
});
