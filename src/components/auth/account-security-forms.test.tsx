import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "./forgot-password-form";
import { PasswordChangeForm } from "./password-change-form";
import { ResetPasswordForm } from "./reset-password-form";
import {
  AccountSecurityError,
  accountSecurityErrorMessage,
  type AccountSecurityActions,
} from "@/lib/auth/account-security-model";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const currentPassword = "Current-password-2026!";
const newPassword = "New-password-2026!";
const resetToken = "reset_token_abcdefghijklmnopqrstuvwxyz123456";
const operationKey = "11111111-1111-4111-8111-111111111111";

function passwordChangeFields() {
  fireEvent.change(screen.getByLabelText("Mật khẩu hiện tại"), {
    target: { value: currentPassword },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu mới"), {
    target: { value: newPassword },
  });
  fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu mới"), {
    target: { value: newPassword },
  });
}

function resetFields() {
  fireEvent.change(screen.getByLabelText("Mã đặt lại mật khẩu"), {
    target: { value: resetToken },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu mới"), {
    target: { value: newPassword },
  });
  fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu mới"), {
    target: { value: newPassword },
  });
}

beforeEach(() => {
  router.replace.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.spyOn(crypto, "randomUUID").mockReturnValue(operationKey);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("mandatory password change", () => {
  it("submits once under StrictMode with a caller UUID and clears passwords before navigation", async () => {
    let resolveChange: ((value: Awaited<ReturnType<AccountSecurityActions["changePassword"]>>) => void) | undefined;
    const changePassword = vi.fn<AccountSecurityActions["changePassword"]>(() =>
      new Promise((resolve) => {
        resolveChange = resolve;
      }),
    );
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const databasesBefore = await indexedDB.databases();

    render(
      <StrictMode>
        <PasswordChangeForm changePassword={changePassword} />
      </StrictMode>,
    );
    passwordChangeFields();
    const submit = screen.getByRole("button", { name: "Đổi mật khẩu và tiếp tục" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(changePassword).toHaveBeenCalledTimes(1);
    expect(changePassword).toHaveBeenCalledWith(
      { currentPassword, newPassword, passwordConfirmation: newPassword },
      operationKey,
    );

    await act(async () =>
      resolveChange?.({
        status: "password_changed",
        sessionsRevoked: 2,
        sessionRotated: true,
        principal: {
          id: operationKey,
          email: "editor@danang.gov.vn",
          username: "editor",
          displayName: "Editor",
          role: "editor",
          status: "active",
          mfaEnabled: true,
          mustChangePassword: false,
        },
      }),
    );
    expect(await screen.findByText("Mật khẩu đã được đổi")).toBeInTheDocument();
    expect(screen.queryByDisplayValue(currentPassword)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(newPassword)).not.toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
    expect(storageSpy).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(await indexedDB.databases()).toEqual(databasesBefore);
  });

  it("never replays an ambiguous or sequential old-cookie request", async () => {
    const changePassword = vi.fn<AccountSecurityActions["changePassword"]>().mockRejectedValue(
      new AccountSecurityError(
        0,
        "NETWORK_AMBIGUOUS",
        "connection reset",
        undefined,
        undefined,
        true,
      ),
    );
    render(<PasswordChangeForm changePassword={changePassword} />);
    passwordChangeFields();
    fireEvent.click(screen.getByRole("button", { name: "Đổi mật khẩu và tiếp tục" }));
    expect(await screen.findByText("Trạng thái đổi mật khẩu chưa xác định")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mật khẩu hiện tại")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đổi mật khẩu và tiếp tục" })).not.toBeInTheDocument();
    expect(changePassword).toHaveBeenCalledTimes(1);

    cleanup();
    changePassword.mockRejectedValue(
      new AccountSecurityError(401, "AUTH_SESSION_EXPIRED", "old cookie"),
    );
    render(<PasswordChangeForm changePassword={changePassword} />);
    passwordChangeFields();
    fireEvent.click(screen.getByRole("button", { name: "Đổi mật khẩu và tiếp tục" }));
    expect(await screen.findByText("Trạng thái đổi mật khẩu chưa xác định")).toBeInTheDocument();
  });

  it("keeps a focused correction path for a wrong current password", async () => {
    const changePassword = vi.fn<AccountSecurityActions["changePassword"]>().mockRejectedValue(
      new AccountSecurityError(401, "AUTH_INVALID_CREDENTIALS", "invalid"),
    );
    render(<PasswordChangeForm changePassword={changePassword} />);
    passwordChangeFields();
    fireEvent.click(screen.getByRole("button", { name: "Đổi mật khẩu và tiếp tục" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Mật khẩu hiện tại không đúng");
    expect(screen.getByLabelText("Mật khẩu hiện tại")).toHaveFocus();
    expect(screen.getByLabelText("Mật khẩu hiện tại")).toHaveAttribute("aria-describedby", "password-change-error");
    expect(screen.getByRole("button", { name: "Đổi mật khẩu và tiếp tục" })).toBeEnabled();
  });

  it("reuses one idempotency key for the same explicit retry and rotates it after editing", async () => {
    const secondKey = "22222222-2222-4222-8222-222222222222";
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce(operationKey)
      .mockReturnValueOnce(secondKey);
    const changePassword = vi
      .fn<AccountSecurityActions["changePassword"]>()
      .mockRejectedValueOnce(new AccountSecurityError(409, "COMMAND_IN_PROGRESS", "processing"))
      .mockRejectedValueOnce(new AccountSecurityError(503, "SERVICE_UNAVAILABLE", "down"))
      .mockRejectedValueOnce(new AccountSecurityError(503, "SERVICE_UNAVAILABLE", "down"));
    render(<PasswordChangeForm changePassword={changePassword} />);
    passwordChangeFields();
    const submit = screen.getByRole("button", { name: "Đổi mật khẩu và tiếp tục" });
    fireEvent.click(submit);
    await screen.findByRole("alert");
    fireEvent.click(submit);
    await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(2));
    expect(changePassword.mock.calls[0]![1]).toBe(operationKey);
    expect(changePassword.mock.calls[1]![1]).toBe(operationKey);

    fireEvent.change(screen.getByLabelText("Mật khẩu mới"), { target: { value: "Another-password-2026!" } });
    fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu mới"), { target: { value: "Another-password-2026!" } });
    fireEvent.click(submit);
    await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(3));
    expect(changePassword.mock.calls[2]![1]).toBe(secondKey);
  });
});

describe("generic password reset request", () => {
  it.each(["known@danang.gov.vn", "unknown@danang.gov.vn"])(
    "renders the same public success for %s",
    async (email) => {
      const requestPasswordReset = vi
        .fn<AccountSecurityActions["requestPasswordReset"]>()
        .mockResolvedValue({ status: "accepted" });
      render(<ForgotPasswordForm requestPasswordReset={requestPasswordReset} />);
      fireEvent.change(screen.getByLabelText("Email tài khoản nội bộ"), { target: { value: email } });
      fireEvent.click(screen.getByRole("button", { name: "Gửi hướng dẫn đặt lại" }));
      const status = await screen.findByRole("status");
      expect(status).toHaveTextContent("Nếu email thuộc một tài khoản phù hợp");
      expect(status).not.toHaveTextContent(email);
      expect(requestPasswordReset).toHaveBeenCalledWith(email, operationKey);
      cleanup();
    },
  );

  it("reuses the same key only for an ambiguous explicit retry and rotates it after editing", async () => {
    const secondKey = "22222222-2222-4222-8222-222222222222";
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce(operationKey)
      .mockReturnValueOnce(secondKey);
    const requestPasswordReset = vi
      .fn<AccountSecurityActions["requestPasswordReset"]>()
      .mockRejectedValueOnce(
        new AccountSecurityError(0, "NETWORK_AMBIGUOUS", "offline", undefined, undefined, true),
      )
      .mockRejectedValueOnce(new AccountSecurityError(503, "SERVICE_UNAVAILABLE", "down"));
    render(<ForgotPasswordForm requestPasswordReset={requestPasswordReset} />);
    const email = screen.getByLabelText("Email tài khoản nội bộ");
    fireEvent.change(email, { target: { value: "editor@danang.gov.vn" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi hướng dẫn đặt lại" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Gửi hướng dẫn đặt lại" }));
    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledTimes(2));
    expect(requestPasswordReset.mock.calls[0][1]).toBe(operationKey);
    expect(requestPasswordReset.mock.calls[1][1]).toBe(operationKey);

    fireEvent.change(email, { target: { value: "reviewer@danang.gov.vn" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi hướng dẫn đặt lại" }));
    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledTimes(3));
    expect(requestPasswordReset.mock.calls[2][1]).toBe(secondKey);
  });
});

describe("one-time reset confirmation", () => {
  it("submits once, keeps secrets out of persistence, then clears them before fresh login", async () => {
    let resolveReset: ((value: Awaited<ReturnType<AccountSecurityActions["confirmPasswordReset"]>>) => void) | undefined;
    const confirmPasswordReset = vi.fn<AccountSecurityActions["confirmPasswordReset"]>(() =>
      new Promise((resolve) => {
        resolveReset = resolve;
      }),
    );
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const databasesBefore = await indexedDB.databases();
    render(
      <StrictMode>
        <ResetPasswordForm confirmPasswordReset={confirmPasswordReset} />
      </StrictMode>,
    );
    resetFields();
    const submit = screen.getByRole("button", { name: "Đặt lại mật khẩu" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(confirmPasswordReset).toHaveBeenCalledTimes(1);
    expect(confirmPasswordReset).toHaveBeenCalledWith({
      token: resetToken,
      password: newPassword,
      passwordConfirmation: newPassword,
    });

    await act(async () =>
      resolveReset?.({ status: "password_reset", loginRequired: true, sessionsRevoked: 3 }),
    );
    expect(await screen.findByText("Mật khẩu đã được đặt lại")).toBeInTheDocument();
    expect(screen.queryByDisplayValue(resetToken)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(newPassword)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(resetToken);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(storageSpy).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(await indexedDB.databases()).toEqual(databasesBefore);
  });

  it("removes token/password fields and never retries after an ambiguous response", async () => {
    const confirmPasswordReset = vi
      .fn<AccountSecurityActions["confirmPasswordReset"]>()
      .mockRejectedValue(
        new AccountSecurityError(
          0,
          "NETWORK_AMBIGUOUS",
          "connection reset",
          undefined,
          undefined,
          true,
        ),
      );
    render(<ResetPasswordForm confirmPasswordReset={confirmPasswordReset} />);
    resetFields();
    fireEvent.click(screen.getByRole("button", { name: "Đặt lại mật khẩu" }));
    expect(await screen.findByText("Trạng thái đặt lại chưa xác định")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mã đặt lại mật khẩu")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mật khẩu mới")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(resetToken);
    expect(confirmPasswordReset).toHaveBeenCalledTimes(1);
  });
});

describe("security error language", () => {
  it.each([400, 404, 410])("keeps reset token state %i generic", (status) => {
    const message = accountSecurityErrorMessage(
      new AccountSecurityError(
        status,
        "PASSWORD_RESET_INVALID_OR_EXPIRED",
        `private-state-${status}`,
      ),
      "confirm-reset",
    );
    expect(message).toBe(
      "Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hiệu lực. Hãy yêu cầu một mã mới.",
    );
    expect(message).not.toContain(`private-state-${status}`);
  });

  it.each([
    [403, "không hợp lệ"],
    [409, "đang được xử lý"],
    [422, "chưa đáp ứng"],
    [429, "30 giây"],
    [503, "tạm gián đoạn"],
  ])("surfaces explicit reset status %i", (status, expected) => {
    expect(
      accountSecurityErrorMessage(
        new AccountSecurityError(
          status,
          `HTTP_${status}`,
          "backend detail",
          undefined,
          status === 429 ? 30 : undefined,
        ),
        "confirm-reset",
      ),
    ).toContain(expected);
  });
});
