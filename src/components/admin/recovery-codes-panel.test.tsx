import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountSecurityError, type AccountSecurityActions } from "@/lib/auth/account-security-model";
import { RecoveryCodesPanel } from "./recovery-codes-panel";

const operationKey = "11111111-1111-4111-8111-111111111111";
const password = "Current-password-2026!";
const codes = Array.from({ length: 10 }, (_, index) => `ABCD-${String(index).padStart(4, "0")}-EF01-2345-6789`);
let canAuthor = true;

beforeEach(() => {
  canAuthor = true;
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: canAuthor,
      media: "",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(operationKey);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fillForm() {
  fireEvent.change(screen.getByLabelText("Mật khẩu hiện tại"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Mã xác thực hoặc mã khôi phục"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /toàn bộ mã cũ sẽ mất hiệu lực/iu }));
}

function successResult() {
  return { status: "recovery_codes_regenerated" as const, recoveryCodes: codes };
}

describe("self-service recovery-code regeneration", () => {
  it("keeps the mutation unavailable on a mobile/read-only capability", () => {
    canAuthor = false;
    render(<RecoveryCodesPanel regenerateRecoveryCodes={vi.fn()} />);
    expect(screen.getByText("Cần dùng máy tính")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mật khẩu hiện tại")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tạo lại 10 mã khôi phục" })).not.toBeInTheDocument();
  });

  it("requires explicit confirmation, submits once, and clears credentials before showing exactly ten one-time codes", async () => {
    let resolveRequest: ((value: ReturnType<typeof successResult>) => void) | undefined;
    const regenerateRecoveryCodes = vi.fn<AccountSecurityActions["regenerateRecoveryCodes"]>(() =>
      new Promise((resolve) => { resolveRequest = resolve; }),
    );
    render(<RecoveryCodesPanel regenerateRecoveryCodes={regenerateRecoveryCodes} />);
    fillForm();
    const submit = screen.getByRole("button", { name: "Tạo lại 10 mã khôi phục" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(regenerateRecoveryCodes).toHaveBeenCalledTimes(1);
    expect(regenerateRecoveryCodes).toHaveBeenCalledWith({ password, mfaCode: "123456" }, operationKey);
    resolveRequest?.(successResult());

    const list = await screen.findByRole("list", { name: "10 mã khôi phục mới" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    expect(screen.queryByLabelText("Mật khẩu hiện tại")).not.toBeInTheDocument();
    const hide = screen.getByRole("button", { name: "Đã lưu, ẩn các mã" });
    expect(hide).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /đã lưu 10 mã mới/iu }));
    fireEvent.click(hide);
    expect(screen.queryByRole("list", { name: "10 mã khôi phục mới" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mật khẩu hiện tại")).toHaveValue("");
  });

  it("keeps one operation key while correcting a nonterminal credential error", async () => {
    const regenerateRecoveryCodes = vi
      .fn<AccountSecurityActions["regenerateRecoveryCodes"]>()
      .mockRejectedValueOnce(new AccountSecurityError(401, "AUTH_INVALID_CREDENTIALS", "wrong"))
      .mockResolvedValueOnce(successResult());
    render(<RecoveryCodesPanel regenerateRecoveryCodes={regenerateRecoveryCodes} />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Tạo lại 10 mã khôi phục" }));
    const alert = (await screen.findByText("Mật khẩu hiện tại không đúng.")).closest("[role='alert']");
    expect(alert).not.toBeNull();
    expect(alert).toHaveTextContent("Mật khẩu hiện tại không đúng");
    expect(alert).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Mật khẩu hiện tại"), { target: { value: `${password}2` } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo lại 10 mã khôi phục" }));
    await screen.findByRole("list", { name: "10 mã khôi phục mới" });
    expect(regenerateRecoveryCodes.mock.calls.map((call) => call[1])).toEqual([operationKey, operationKey]);
  });

  it("does not replay after an ambiguous response and requires a fresh user-authorized attempt", async () => {
    const regenerateRecoveryCodes = vi
      .fn<AccountSecurityActions["regenerateRecoveryCodes"]>()
      .mockRejectedValue(new AccountSecurityError(0, "NETWORK_AMBIGUOUS", "unknown", undefined, undefined, true));
    render(<RecoveryCodesPanel regenerateRecoveryCodes={regenerateRecoveryCodes} />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Tạo lại 10 mã khôi phục" }));
    expect(await screen.findByText("Cần bắt đầu một lượt tạo mới")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mật khẩu hiện tại")).not.toBeInTheDocument();
    expect(regenerateRecoveryCodes).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Bắt đầu lượt tạo mới" }));
    await waitFor(() => expect(screen.getByLabelText("Mật khẩu hiện tại")).toHaveValue(""));
    expect(screen.getByLabelText("Mã xác thực hoặc mã khôi phục")).toHaveValue("");
  });
});
