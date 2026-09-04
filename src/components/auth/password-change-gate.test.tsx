import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordChangeGate } from "./password-change-gate";
import { getPasswordChangePrincipal } from "@/lib/api/account-security";
import { AccountSecurityError } from "@/lib/auth/account-security-model";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api/account-security", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/account-security")>()),
  getPasswordChangePrincipal: vi.fn(),
}));

const principal = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "editor@danang.gov.vn",
  username: "editor",
  displayName: "Editor",
  role: "editor" as const,
  status: "active" as const,
  mfaEnabled: true,
  mustChangePassword: true,
};

beforeEach(() => {
  router.replace.mockReset();
  vi.mocked(getPasswordChangePrincipal).mockReset();
});

afterEach(cleanup);

describe("mandatory password-change session gate", () => {
  it("renders the form only for an authenticated flagged principal", async () => {
    vi.mocked(getPasswordChangePrincipal).mockResolvedValue(principal);
    render(<PasswordChangeGate />);
    expect(screen.getByRole("status")).toHaveTextContent("Đang xác minh");
    expect(await screen.findByLabelText("Mật khẩu hiện tại")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(screen.getByLabelText("Mật khẩu mới")).toHaveAttribute("autocomplete", "new-password");
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("does not reopen mandatory change after the flag was cleared", async () => {
    vi.mocked(getPasswordChangePrincipal).mockResolvedValue({ ...principal, mustChangePassword: false });
    render(<PasswordChangeGate />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
    expect(screen.queryByLabelText("Mật khẩu hiện tại")).not.toBeInTheDocument();
  });

  it("shows an explicit login path for an expired session", async () => {
    vi.mocked(getPasswordChangePrincipal).mockRejectedValue(
      new AccountSecurityError(401, "AUTH_SESSION_EXPIRED", "expired", "request-session"),
    );
    render(<PasswordChangeGate />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Phiên đăng nhập đã hết hạn");
    expect(alert).not.toHaveTextContent("request-session");
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByRole("link", { name: "Đăng nhập lại" })).toHaveAttribute("href", "/login");
  });
});
