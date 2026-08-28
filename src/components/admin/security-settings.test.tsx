import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SecuritySettings } from "./security-settings";
import { useAdminSession } from "@/components/admin/admin-session";

vi.mock("@/components/admin/admin-session", () => ({
  useAdminSession: vi.fn(),
}));
vi.mock("@/components/admin/recovery-codes-panel", () => ({
  RecoveryCodesPanel: () => <div>Mã khôi phục đang bật</div>,
}));
vi.mock("@/components/admin/session-security-panel", () => ({
  SessionSecurityPanel: () => <div>Bảo mật phiên</div>,
}));

afterEach(cleanup);

function session(mfaEnabled: boolean) {
  vi.mocked(useAdminSession).mockReturnValue({
    principal: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "admin@danang.gov.vn",
      username: "system.admin",
      displayName: "System Admin",
      role: "system_admin",
      status: "active",
      mfaEnabled,
      mustChangePassword: false,
    },
    csrfToken: "csrf-token",
    refreshCsrf: vi.fn(),
    clearClientPrincipal: vi.fn(),
  });
}

describe("SecuritySettings", () => {
  it("hides recovery-code actions and explains the disabled policy", () => {
    session(false);
    render(<SecuritySettings />);

    expect(screen.getByText("MFA đang tắt")).toBeInTheDocument();
    expect(screen.getByText("MFA đang được tắt")).toBeInTheDocument();
    expect(screen.queryByText("Mã khôi phục đang bật")).not.toBeInTheDocument();
    expect(screen.getByText("Bảo mật phiên")).toBeInTheDocument();
  });

  it("shows recovery-code actions when MFA is enabled", () => {
    session(true);
    render(<SecuritySettings />);

    expect(screen.getByText("MFA đang bật")).toBeInTheDocument();
    expect(screen.getByText("Mã khôi phục đang bật")).toBeInTheDocument();
  });
});
