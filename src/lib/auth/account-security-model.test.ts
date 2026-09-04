import { describe, expect, it } from "vitest";
import { AccountSecurityError, accountSecurityErrorMessage } from "./account-security-model";

describe("account security feedback", () => {
  it("keeps password and verification failures actionable", () => {
    expect(accountSecurityErrorMessage(new AccountSecurityError(401, "AUTH_INVALID_CREDENTIALS", "internal"), "change")).toBe("Mật khẩu hiện tại không đúng.");
    expect(accountSecurityErrorMessage(new AccountSecurityError(401, "AUTH_MFA_INVALID", "internal"), "recovery-codes")).toBe("Mã xác thực hoặc mã khôi phục không đúng.");
  });

  it("does not expose unexpected server or browser details", () => {
    expect(accountSecurityErrorMessage(new AccountSecurityError(502, "CONTRACT_INVALID", "ETag CSRF principal"), "revoke")).toBe("Dịch vụ bảo mật đang tạm gián đoạn. Vui lòng thử lại sau.");
    expect(accountSecurityErrorMessage(new Error("Failed to fetch /api/v1/auth"), "change")).toBe("Không thể hoàn tất yêu cầu bảo mật. Hãy kiểm tra kết nối và thử lại.");
  });
});
