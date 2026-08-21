import type { UserImportJob } from "@/lib/api/user-imports";

export const MAX_USER_IMPORT_BYTES = 5_242_880;
export const MAX_USER_IMPORT_ROWS = 5_000;
export const USER_IMPORT_COLUMNS = ["email", "username", "displayName", "role"] as const;
export const USER_IMPORT_ROLES = ["editor", "reviewer", "publisher", "system_admin"] as const;

export type UserImportFormat = UserImportJob["format"];
export type UserImportStatus = UserImportJob["status"];

export type UserImportStage = "upload" | "inspecting" | "inspect" | "validating" | "issues" | "applying" | "complete" | "failed";

export function inferUserImportFormat(fileName: string): UserImportFormat | null {
  const lower = fileName.toLocaleLowerCase("en-US");
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx")) return "xlsx";
  return null;
}

export function validateUserImportFile(file: Pick<File, "name" | "size">): string | null {
  if (!inferUserImportFormat(file.name)) return "Chỉ hỗ trợ file CSV hoặc XLSX.";
  if (file.size < 1) return "File trống không thể được kiểm tra.";
  if (file.size > MAX_USER_IMPORT_BYTES) return "File vượt quá giới hạn 5 MiB (5.242.880 byte).";
  return null;
}

export function userImportStage(job: UserImportJob): UserImportStage {
  if (job.status === "uploaded" || job.status === "inspecting") return "inspecting";
  if (job.status === "inspected") return "inspect";
  if (job.status === "validating") return "validating";
  if (job.status === "ready") return "issues";
  if (job.status === "applying") return "applying";
  if (job.status === "completed") return "complete";
  return "failed";
}

export function shouldPollUserImport(status: UserImportStatus): boolean {
  return status === "uploaded" || status === "inspecting" || status === "validating" || status === "applying";
}

export function userImportStatusLabel(status: UserImportStatus): string {
  const labels: Record<UserImportStatus, string> = {
    uploaded: "Đã nhận file",
    inspecting: "Đang kiểm tra cấu trúc file",
    inspected: "Đã kiểm tra cấu trúc",
    validating: "Đang kiểm tra thử dữ liệu",
    ready: "Sẵn sàng áp dụng",
    applying: "Đang tạo lời mời",
    completed: "Đã hoàn tất",
    failed: "Không thể hoàn tất",
  };
  return labels[status];
}

export function normalizeIssueCode(value: string): string | undefined {
  const normalized = value.trim().toLocaleUpperCase("en-US");
  return normalized ? normalized : undefined;
}

export function validSheetSelection(job: UserImportJob, sheet: string): boolean {
  if (job.format === "csv") return sheet === "";
  if (job.inspection.sheets.length === 1) return sheet === job.inspection.sheets[0];
  return job.inspection.sheets.includes(sheet);
}
