import { describe, expect, it } from "vitest";
import type { UserImportJob } from "@/lib/api/user-imports";
import {
  MAX_USER_IMPORT_BYTES,
  USER_IMPORT_COLUMNS,
  USER_IMPORT_ROLES,
  inferUserImportFormat,
  normalizeIssueCode,
  shouldPollUserImport,
  userImportStage,
  validSheetSelection,
  validateUserImportFile,
  userImportIssueLabel,
  userImportFieldLabel,
  userImportReportCsv,
} from "./user-import-state";

const job = (overrides: Partial<UserImportJob> = {}): UserImportJob => ({
  id: "11111111-1111-4111-8111-111111111111",
  status: "inspected",
  format: "csv",
  file: { name: "users.csv", sizeBytes: 100 },
  progress: 100,
  counts: { total: 0, valid: 0, invalid: 0, applied: 0, skipped: 0 },
  inspection: { sheets: [], selectedSheet: null, limits: { maxBytes: MAX_USER_IMPORT_BYTES, maxRows: 5_000, maxSheets: 10, maxColumns: 4, maxExpandedBytes: 52_428_800 } },
  validRowPolicy: "invite",
  failureCode: null,
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
  ...overrides,
});

describe("user import state policy", () => {
  it("exports the loaded issues as a Vietnamese spreadsheet without internal references", () => {
    const csv = userImportReportCsv([{ id: "private-issue-id", rowNumber: 4, severity: "error", code: "USER_IMPORT_EMAIL_INVALID", field: "email" }]);
    expect(csv).toBe('\uFEFF"Dòng","Nội dung cần sửa","Cột"\r\n"4","Email chưa đúng định dạng","Email"');
    expect(csv).not.toMatch(/private-issue-id|USER_IMPORT_EMAIL_INVALID/);
  });

  it("translates row issues and field names without leaking unknown internal codes", () => {
    expect(userImportIssueLabel("USER_IMPORT_EMAIL_CONFLICT")).toBe("Email đã được sử dụng");
    expect(userImportIssueLabel("USER_IMPORT_XLSX_FORMULA_FORBIDDEN")).toContain("thay công thức bằng giá trị");
    expect(userImportIssueLabel("PRIVATE_INTERNAL_CODE")).not.toContain("PRIVATE_INTERNAL_CODE");
    expect(userImportFieldLabel("displayName")).toBe("Tên hiển thị");
    expect(userImportFieldLabel("internalField")).toBe("Cấu trúc tệp");
  });

  it("accepts only CSV/XLSX within the exact 5 MB boundary", () => {
    expect(inferUserImportFormat("users.CSV")).toBe("csv");
    expect(inferUserImportFormat("users.xlsx")).toBe("xlsx");
    expect(validateUserImportFile({ name: "users.csv", size: MAX_USER_IMPORT_BYTES })).toBeNull();
    expect(validateUserImportFile({ name: "users.xlsx", size: MAX_USER_IMPORT_BYTES + 1 })).toContain("5 MB");
    expect(validateUserImportFile({ name: "users.geojson", size: 20 })).toContain("CSV hoặc XLSX");
    expect(validateUserImportFile({ name: "users.csv", size: 0 })).toContain("trống");
  });

  it("keeps the locked four-column order and shared role allowlist", () => {
    expect(USER_IMPORT_COLUMNS).toEqual(["email", "username", "displayName", "role"]);
    expect(USER_IMPORT_ROLES).toEqual(["editor", "reviewer", "publisher", "system_admin"]);
  });

  it("maps every durable backend status without inventing a mapping step", () => {
    expect(userImportStage(job({ status: "uploaded" }))).toBe("inspecting");
    expect(userImportStage(job({ status: "inspected" }))).toBe("inspect");
    expect(userImportStage(job({ status: "ready" }))).toBe("issues");
    expect(userImportStage(job({ status: "completed" }))).toBe("complete");
    expect(userImportStage(job({ status: "failed" }))).toBe("failed");
    expect(shouldPollUserImport("validating")).toBe(true);
    expect(shouldPollUserImport("ready")).toBe(false);
  });

  it("only accepts inspected XLSX sheets and normalizes issue filters", () => {
    const xlsx = job({ format: "xlsx", inspection: { ...job().inspection, sheets: ["Users", "Review"] } });
    expect(validSheetSelection(xlsx, "Users")).toBe(true);
    expect(validSheetSelection(xlsx, "Missing")).toBe(false);
    expect(normalizeIssueCode(" user_import_email_invalid ")).toBe("USER_IMPORT_EMAIL_INVALID");
    expect(normalizeIssueCode(" ")).toBeUndefined();
  });
});
