import type { components, operations } from "@/lib/api/generated/schema";

export type ChangePasswordInput = components["schemas"]["ChangePasswordDto"];
export type PasswordResetInput = components["schemas"]["PasswordResetConfirmDto"];
export type RecoveryCodesRegenerationInput = components["schemas"]["RegenerateRecoveryCodesDto"];
export type PasswordChangeResult = operations["changePassword"]["responses"][200]["content"]["application/json"]["data"];
export type PasswordResetRequestResult = operations["requestPasswordReset"]["responses"][202]["content"]["application/json"]["data"];
export type PasswordResetResult = operations["confirmPasswordReset"]["responses"][200]["content"]["application/json"]["data"];
export type SessionRevocationResult = operations["revokeAllSessions"]["responses"][200]["content"]["application/json"]["data"];
export type RecoveryCodesRegenerationResult = operations["regenerateRecoveryCodes"]["responses"][200]["content"]["application/json"]["data"];

export interface AccountSecurityActions {
  changePassword(input: ChangePasswordInput, idempotencyKey: string): Promise<PasswordChangeResult>;
  requestPasswordReset(email: string, idempotencyKey: string): Promise<PasswordResetRequestResult>;
  confirmPasswordReset(input: PasswordResetInput): Promise<PasswordResetResult>;
  revokeAllSessions(idempotencyKey: string): Promise<SessionRevocationResult>;
  regenerateRecoveryCodes(input: RecoveryCodesRegenerationInput, idempotencyKey: string): Promise<RecoveryCodesRegenerationResult>;
}

export class AccountSecurityError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly retryAfterSeconds?: number,
    readonly ambiguous = false,
  ) {
    super(message);
    this.name = "AccountSecurityError";
  }
}

const RETRY_LATER = "Dịch vụ bảo mật đang tạm gián đoạn. Vui lòng thử lại sau.";

export function accountSecurityErrorMessage(
  error: unknown,
  context: "change" | "request-reset" | "confirm-reset" | "revoke" | "recovery-codes",
) {
  if (!(error instanceof AccountSecurityError)) {
    return "Không thể hoàn tất yêu cầu bảo mật. Hãy kiểm tra kết nối và thử lại.";
  }
  if (error.status === 429) {
    return `Có quá nhiều lần thử.${
      error.retryAfterSeconds !== undefined
        ? ` Thử lại sau ${error.retryAfterSeconds} giây.`
        : " Vui lòng chờ rồi thử lại."
    }`;
  }
  if (error.status === 503 || error.status >= 500) return RETRY_LATER;
  if (context === "change") {
    if (error.status === 401 && error.code === "AUTH_INVALID_CREDENTIALS") {
      return "Mật khẩu hiện tại không đúng.";
    }
    if (error.status === 422 && error.code === "PASSWORD_REUSE_FORBIDDEN") {
      return "Mật khẩu mới phải khác mật khẩu hiện tại.";
    }
    if (error.status === 422) return "Mật khẩu mới chưa đáp ứng yêu cầu hoặc hai ô chưa trùng khớp.";
    if (error.status === 403) return "Phiên này không được phép đổi mật khẩu. Hãy đăng nhập lại.";
    if (error.status === 409) return "Yêu cầu đổi mật khẩu đang được xử lý. Hãy chờ một lát trước khi thử lại.";
  }
  if (context === "request-reset") {
    if (error.status === 403) return "Yêu cầu bảo mật không hợp lệ. Hãy tải lại trang và thử lại.";
    if (error.status === 409) return "Yêu cầu đang được xử lý. Hãy chờ phản hồi trước khi gửi lại.";
  }
  if (context === "confirm-reset") {
    if (error.code === "PASSWORD_RESET_INVALID_OR_EXPIRED" || [400, 404, 410].includes(error.status)) {
      return "Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hiệu lực. Hãy yêu cầu một mã mới.";
    }
    if (error.status === 403) return "Phiên bảo mật không hợp lệ. Hãy tải lại trang và dán lại mã.";
    if (error.status === 409) return "Mã đặt lại mật khẩu đang được xử lý hoặc đã được sử dụng.";
    if (error.status === 422) return "Mật khẩu chưa đáp ứng yêu cầu hoặc hai ô chưa trùng khớp.";
  }
  if (context === "revoke") {
    if (error.status === 403) return "Bạn không được phép thu hồi các phiên của tài khoản này.";
    if (error.status === 409) return "Yêu cầu thu hồi phiên đang được xử lý. DanangMap sẽ không tự gửi lại.";
    if (error.status === 422) return "Yêu cầu thu hồi phiên không hợp lệ.";
  }
  if (context === "recovery-codes") {
    if (error.status === 401 && error.code === "AUTH_INVALID_CREDENTIALS") {
      return "Mật khẩu hiện tại không đúng.";
    }
    if (error.status === 401 && error.code === "AUTH_MFA_INVALID") {
      return "Mã xác thực hoặc mã khôi phục không đúng.";
    }
    if (error.status === 409 && error.code === "AUTH_MFA_REQUIRED") {
      return "Tài khoản chưa thiết lập xác thực hai bước.";
    }
    if (error.status === 409) {
      return "Yêu cầu trước có thể đã thay mã khôi phục. Hãy bắt đầu một lượt tạo mới; DanangMap không tự gửi lại để tránh làm lộ mã.";
    }
    if (error.status === 403) return "Phiên bảo mật không hợp lệ. Hãy tải lại trang và thử lại.";
    if (error.status === 422) return "Mật khẩu hoặc mã xác thực chưa đúng định dạng.";
  }
  if (error.status === 401) return "Phiên đăng nhập đã hết hạn.";
  if (error.status === 0) return "Không thể kết nối dịch vụ bảo mật. Kiểm tra mạng và thử lại.";
  return "Không thể hoàn tất yêu cầu bảo mật lúc này. Vui lòng thử lại sau.";
}

export function isTerminalPasswordChange(error: unknown) {
  return (
    error instanceof AccountSecurityError &&
    (error.ambiguous || (error.status === 401 && error.code !== "AUTH_INVALID_CREDENTIALS"))
  );
}

export function isTerminalResetConfirmation(error: unknown) {
  return error instanceof AccountSecurityError && error.ambiguous;
}

export function shouldEndClientSessionAfterRevoke(error: unknown) {
  return error instanceof AccountSecurityError && (error.ambiguous || error.status === 401);
}

export function mustRestartRecoveryCodeRegeneration(error: unknown) {
  return error instanceof AccountSecurityError && (
    error.ambiguous ||
    error.status === 409 ||
    (error.status === 401 && error.code !== "AUTH_INVALID_CREDENTIALS" && error.code !== "AUTH_MFA_INVALID")
  );
}
