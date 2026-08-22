import { AdminApiError } from "@/lib/api/admin";
import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { components, operations } from "@/lib/api/generated/schema";

type ApiClient = ReturnType<typeof createDanangMapClient>;
export type UserImportJob = operations["getUserImport"]["responses"][200]["content"]["application/json"]["data"];
type CreatedUserImportJob = operations["createUserImport"]["responses"][202]["content"]["application/json"]["data"];
export type UserImportIssue = operations["listUserImportIssues"]["responses"][200]["content"]["application/json"]["data"][number];
type UserImportIssueMeta = operations["listUserImportIssues"]["responses"][200]["content"]["application/json"]["meta"];
type UserImportReportContract = operations["getUserImportReport"]["responses"][200]["content"]["application/json"];
type ValidateUserImportBody = components["schemas"]["ValidateUserImportDto"];
type ApplyUserImportBody = components["schemas"]["ApplyUserImportDto"];

const createdJobMatchesGetJob: CreatedUserImportJob extends UserImportJob ? true : never = true;
void createdJobMatchesGetJob;

export interface UserImportIssuePage {
  issues: UserImportIssue[];
  meta: UserImportIssueMeta;
}

export type UserImportReportPage = UserImportReportContract["data"] & { meta: UserImportReportContract["meta"] };

export interface UserImportActions {
  create(file: File, operationKey: string, csrfToken: string): Promise<UserImportJob>;
  get(importId: string, signal?: AbortSignal): Promise<UserImportJob>;
  validate(importId: string, sheet: string | undefined, csrfToken: string): Promise<UserImportJob>;
  issues(importId: string, options?: { cursor?: string; code?: string; limit?: number }): Promise<UserImportIssuePage>;
  apply(importId: string, operationKey: string, csrfToken: string): Promise<UserImportJob>;
  report(importId: string, options?: { cursor?: string; code?: string; limit?: number }): Promise<UserImportReportPage>;
}

const demoJobs = new Map<string, UserImportJob>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resultEnvelope<T, M>(result: { data?: { data: T; meta: M }; error?: unknown; response: Response }): { data: T; meta: M } {
  if (!result.response.ok || result.error !== undefined || result.data === undefined) {
    const body = isRecord(result.error) ? result.error : {};
    const status = typeof body.status === "number" ? body.status : result.response.status;
    const code = typeof body.code === "string" ? body.code : `HTTP_${status || 502}`;
    const message = typeof body.message === "string" ? body.message : status >= 500 ? "Dịch vụ import người dùng tạm thời không khả dụng." : "Yêu cầu import người dùng không thể xử lý.";
    const requestId = typeof body.requestId === "string" ? body.requestId : result.response.headers.get("x-request-id") ?? undefined;
    throw new AdminApiError(status || 502, code, message, requestId);
  }
  return result.data;
}

function demoEnabled() {
  return process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true" && process.env.NEXT_PUBLIC_DANANGMAP_USER_IMPORT_E2E_MODE !== "true";
}

function demoJob(importId: string) {
  const current = demoJobs.get(importId);
  if (!current) throw new AdminApiError(404, "USER_IMPORT_NOT_FOUND", "Không tìm thấy phiên import demo.");
  return current;
}

function demoIssues(): UserImportIssue[] {
  return [{ id: "1", rowNumber: 4, severity: "error", code: "USER_IMPORT_EMAIL_INVALID", field: "email" }];
}

export async function createUserImport(file: File, operationKey: string, csrfToken: string, client: ApiClient = apiClient): Promise<UserImportJob> {
  if (demoEnabled()) {
    const id = crypto.randomUUID();
    const format: UserImportJob["format"] = file.name.toLocaleLowerCase("en-US").endsWith(".xlsx") ? "xlsx" : "csv";
    const now = new Date().toISOString();
    const current: UserImportJob = {
      id,
      status: "uploaded",
      format,
      file: { name: file.name, sizeBytes: file.size },
      progress: 5,
      counts: { total: 0, valid: 0, invalid: 0, applied: 0, skipped: 0 },
      inspection: { sheets: [], selectedSheet: null, limits: { maxBytes: 5_242_880, maxRows: 5_000, maxSheets: 10, maxColumns: 4, maxExpandedBytes: 52_428_800 } },
      validRowPolicy: "invite",
      failureCode: null,
      createdAt: now,
      updatedAt: now,
    };
    demoJobs.set(id, current);
    return current;
  }
  const form = new FormData();
  form.set("file", file);
  const result = await client.POST("/api/v1/admin/user-imports", {
    params: { header: { "X-CSRF-Token": csrfToken, "Idempotency-Key": operationKey } },
    body: { file: file.name },
    bodySerializer: () => form,
  });
  return resultEnvelope(result).data;
}

export async function getUserImport(importId: string, signal?: AbortSignal, client: ApiClient = apiClient): Promise<UserImportJob> {
  if (demoEnabled()) {
    const current = demoJob(importId);
    const next: UserImportJob = current.status === "uploaded" || current.status === "inspecting"
      ? { ...current, status: "inspected", progress: 100, inspection: { ...current.inspection, sheets: current.format === "xlsx" ? ["Người dùng", "Lưu trữ"] : [] }, updatedAt: new Date().toISOString() }
      : current.status === "validating"
        ? { ...current, status: "ready", progress: 100, counts: { total: 3, valid: 2, invalid: 1, applied: 0, skipped: 0 }, updatedAt: new Date().toISOString() }
        : current.status === "applying"
          ? { ...current, status: "completed", progress: 100, counts: { ...current.counts, applied: current.counts.valid, skipped: current.counts.invalid }, updatedAt: new Date().toISOString() }
          : current;
    demoJobs.set(importId, next);
    return next;
  }
  const result = await client.GET("/api/v1/admin/user-imports/{importId}", { params: { path: { importId } }, signal });
  return resultEnvelope(result).data;
}

export async function validateUserImport(importId: string, sheet: string | undefined, csrfToken: string, client: ApiClient = apiClient): Promise<UserImportJob> {
  const body: ValidateUserImportBody = sheet ? { sheet } : {};
  if (demoEnabled()) {
    const next: UserImportJob = { ...demoJob(importId), status: "validating", progress: 10, inspection: { ...demoJob(importId).inspection, selectedSheet: sheet ?? null }, updatedAt: new Date().toISOString() };
    demoJobs.set(importId, next);
    return next;
  }
  const result = await client.POST("/api/v1/admin/user-imports/{importId}:validate", { params: { path: { importId }, header: { "X-CSRF-Token": csrfToken } }, body });
  return resultEnvelope(result).data;
}

export async function listUserImportIssues(importId: string, options: { cursor?: string; code?: string; limit?: number } = {}, client: ApiClient = apiClient): Promise<UserImportIssuePage> {
  if (demoEnabled()) return { issues: demoIssues(), meta: { requestId: "demo-user-import-issues", nextCursor: null, hasMore: false, limit: options.limit ?? 100 } };
  const result = await client.GET("/api/v1/admin/user-imports/{importId}/issues", { params: { path: { importId }, query: options } });
  const response = resultEnvelope(result);
  return { issues: response.data, meta: response.meta };
}

export async function applyUserImport(importId: string, operationKey: string, csrfToken: string, client: ApiClient = apiClient): Promise<UserImportJob> {
  const body: ApplyUserImportBody = { validRowPolicy: "invite" };
  if (demoEnabled()) {
    const next: UserImportJob = { ...demoJob(importId), status: "applying", progress: 10, updatedAt: new Date().toISOString() };
    demoJobs.set(importId, next);
    return next;
  }
  const result = await client.POST("/api/v1/admin/user-imports/{importId}:apply", { params: { path: { importId }, header: { "X-CSRF-Token": csrfToken, "Idempotency-Key": operationKey } }, body });
  return resultEnvelope(result).data;
}

export async function getUserImportReport(importId: string, options: { cursor?: string; code?: string; limit?: number } = {}, client: ApiClient = apiClient): Promise<UserImportReportPage> {
  if (demoEnabled()) {
    const current = demoJob(importId);
    return { job: current, issues: demoIssues(), meta: { requestId: "demo-user-import-report", nextCursor: null, hasMore: false, limit: options.limit ?? 100 } };
  }
  const result = await client.GET("/api/v1/admin/user-imports/{importId}/report", { params: { path: { importId }, query: options } });
  const response = resultEnvelope(result);
  return { ...response.data, meta: response.meta };
}

export const userImportActions: UserImportActions = {
  create: createUserImport,
  get: getUserImport,
  validate: validateUserImport,
  issues: listUserImportIssues,
  apply: applyUserImport,
  report: getUserImportReport,
};
