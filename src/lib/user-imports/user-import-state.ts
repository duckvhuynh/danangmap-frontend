import type { UserImportIssue, UserImportJob } from "@/lib/api/user-imports";

export const MAX_USER_IMPORT_BYTES = 5_242_880;
export const MAX_USER_IMPORT_ROWS = 5_000;
export const USER_IMPORT_COLUMNS = ["email", "username", "displayName", "role"] as const;
export const USER_IMPORT_ROLES = ["editor", "reviewer", "publisher", "system_admin"] as const;

export const USER_IMPORT_ISSUE_LABELS: Record<string, string> = {
  USER_IMPORT_EMAIL_INVALID: "Email chưa đúng định dạng",
  USER_IMPORT_USERNAME_INVALID: "Tên đăng nhập chưa hợp lệ",
  USER_IMPORT_DISPLAY_NAME_INVALID: "Tên hiển thị chưa hợp lệ",
  USER_IMPORT_ROLE_INVALID: "Vai trò chưa hợp lệ",
  USER_IMPORT_DUPLICATE_EMAIL: "Email bị trùng trong tệp",
  USER_IMPORT_DUPLICATE_USERNAME: "Tên đăng nhập bị trùng trong tệp",
  USER_IMPORT_EMAIL_CONFLICT: "Email đã được sử dụng",
  USER_IMPORT_USERNAME_CONFLICT: "Tên đăng nhập đã được sử dụng",
  USER_IMPORT_COLUMNS_INVALID: "Tên hoặc thứ tự cột chưa đúng hướng dẫn",
  USER_IMPORT_FORBIDDEN_COLUMN: "Tệp có cột không được phép nhập",
  USER_IMPORT_XLSX_FORMULA_FORBIDDEN: "Hãy thay công thức bằng giá trị trước khi tải lên",
  USER_IMPORT_FILE_TOO_LARGE: "Tệp vượt quá giới hạn dung lượng",
  USER_IMPORT_ROW_LIMIT: "Tệp vượt quá 5.000 dòng",
  USER_IMPORT_SHEET_LIMIT: "Tệp có quá nhiều trang tính",
  USER_IMPORT_COLUMN_LIMIT: "Tệp có quá nhiều cột",
  USER_IMPORT_SHEET_REQUIRED: "Hãy chọn trang tính cần nhập",
  USER_IMPORT_SHEET_NOT_FOUND: "Không tìm thấy trang tính đã chọn",
  USER_IMPORT_SHEET_NOT_ALLOWED: "Trang tính đã chọn không được hỗ trợ",
  USER_IMPORT_EXPANDED_SIZE_LIMIT: "Nội dung tệp quá lớn để xử lý",
  USER_IMPORT_FORMAT_UNSUPPORTED: "Chỉ hỗ trợ tệp CSV hoặc XLSX",
  USER_IMPORT_FORMAT_MISMATCH: "Nội dung không khớp với loại tệp",
  USER_IMPORT_CSV_INVALID: "Không đọc được tệp CSV. Hãy lưu lại với mã hóa UTF-8",
  USER_IMPORT_XLSX_INVALID: "Không đọc được tệp Excel. Hãy kiểm tra rồi tải lại",
  USER_IMPORT_XLSX_UNSAFE: "Tệp Excel có nội dung không được hỗ trợ",
  USER_IMPORT_FILE_INVALID: "Không đọc được tệp. Hãy kiểm tra rồi tải lại",
  USER_IMPORT_INSPECT_FAILED: "Chưa thể đọc tệp. Hãy thử lại hoặc tải tệp mới",
  USER_IMPORT_VALIDATE_FAILED: "Kiểm tra dữ liệu chưa hoàn tất. Hãy thử lại",
  USER_IMPORT_APPLY_FAILED: "Gửi lời mời chưa hoàn tất. Hãy cập nhật trạng thái trước khi thử lại",
  USER_IMPORT_NO_VALID_ROWS: "Không có dòng hợp lệ để tạo lời mời",
  USER_IMPORT_NO_VALID_ROWS_AT_APPLY: "Không còn dòng hợp lệ để tạo lời mời. Hãy kiểm tra lại danh sách tài khoản",
};

export function userImportIssueLabel(code: string | null) {
  return code ? USER_IMPORT_ISSUE_LABELS[code] ?? "Không thể xử lý nội dung này. Hãy kiểm tra lại tệp" : "Chưa thể hoàn tất nhập danh sách. Hãy thử lại";
}

export function userImportFieldLabel(field: string | null) {
  const labels: Record<string, string> = { email: "Email", username: "Tên đăng nhập", displayName: "Tên hiển thị", role: "Vai trò" };
  return field ? labels[field] ?? "Cấu trúc tệp" : "Cấu trúc tệp";
}

export function userImportReportCsv(issues: UserImportIssue[]) {
  const rows = [["Dòng", "Nội dung cần sửa", "Cột"], ...issues.map((issue) => [String(issue.rowNumber), userImportIssueLabel(issue.code), userImportFieldLabel(issue.field)])];
  return "\uFEFF" + rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n");
}

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
  if (!inferUserImportFormat(file.name)) return "Chỉ hỗ trợ tệp CSV hoặc XLSX.";
  if (file.size < 1) return "Tệp đang trống. Hãy chọn tệp có dữ liệu.";
  if (file.size > MAX_USER_IMPORT_BYTES) return "Tệp vượt quá giới hạn 5 MB.";
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
    uploaded: "Đã nhận tệp",
    inspecting: "Đang kiểm tra cấu trúc tệp",
    inspected: "Đã kiểm tra cấu trúc",
    validating: "Đang kiểm tra dữ liệu",
    ready: "Sẵn sàng tạo lời mời",
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
