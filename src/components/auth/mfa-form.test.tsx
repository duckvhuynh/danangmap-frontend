import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MfaForm } from "./mfa-form";
import {
  AuthApiError,
  confirmMfaEnrollment,
  startMfaEnrollment,
  verifyMfa,
} from "@/lib/api/auth";

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("qrcode.react", () => ({ QRCodeCanvas: ({ "aria-label": ariaLabel }: { "aria-label"?: string }) => <canvas aria-label={ariaLabel} data-testid="mfa-qr" role="img" /> }));
vi.mock("@/lib/api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/auth")>()),
  confirmMfaEnrollment: vi.fn(),
  startMfaEnrollment: vi.fn(),
  verifyMfa: vi.fn(),
}));

const enrollmentUri = "otpauth://totp/DanangMap%3Aeditor%40danang.gov.vn?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=DanangMap";
const principal = { id: "11111111-1111-4111-8111-111111111111", email: "editor@danang.gov.vn", username: "editor", displayName: "Editor", role: "editor" as const, status: "active" as const, mfaEnabled: true, mustChangePassword: false };
const recoveryCodes = Array.from({ length: 10 }, (_, index) => `ABCD-EF01-2345-6789-${String(index + 1).padStart(4, "0")}`);

beforeEach(() => {
  router.replace.mockReset();
  vi.mocked(startMfaEnrollment).mockReset();
  vi.mocked(confirmMfaEnrollment).mockReset();
  vi.mocked(verifyMfa).mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MFA enrollment privacy and one-time workflow", () => {
  it("starts exactly once under StrictMode and double activation without persisting the URI or secret", async () => {
    let resolveEnrollment: ((value: { status: "pending"; enrollmentUri: string }) => void) | undefined;
    vi.mocked(startMfaEnrollment).mockReturnValue(new Promise((resolve) => { resolveEnrollment = resolve; }));
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const databasesBefore = await indexedDB.databases();

    render(<StrictMode><MfaForm enrollmentRequired /></StrictMode>);
    const start = screen.getByRole("button", { name: /Thiết lập xác thực hai bước/ });
    start.focus();
    fireEvent.click(start);
    fireEvent.click(start);
    expect(vi.mocked(startMfaEnrollment)).toHaveBeenCalledTimes(1);

    await act(async () => resolveEnrollment?.({ status: "pending", enrollmentUri }));
    expect(await screen.findByTestId("manual-mfa-secret")).toHaveTextContent("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP");
    expect(screen.getByRole("img", { name: "Mã QR thiết lập xác thực hai bước DanangMap" })).toBeInTheDocument();
    expect(storageSpy).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(await indexedDB.databases()).toEqual(databasesBefore);
  });

  it("shows recovery codes once, requires explicit saved acknowledgement, then clears rendered codes before navigation", async () => {
    vi.mocked(startMfaEnrollment).mockResolvedValue({ status: "pending", enrollmentUri });
    vi.mocked(confirmMfaEnrollment).mockResolvedValue({ principal, recoveryCodes });
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const createObjectURL = vi.fn(() => "blob:recovery-codes");
    const revokeObjectURL = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    render(<MfaForm enrollmentRequired />);
    fireEvent.click(screen.getByRole("button", { name: /Thiết lập xác thực hai bước/ }));
    const otp = await screen.findByLabelText("Mã xác nhận 6 số");
    fireEvent.change(otp, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận và tạo mã khôi phục" }));

    const list = await screen.findByRole("list", { name: "10 mã khôi phục" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(10);
    const continueButton = screen.getByRole("button", { name: "Tiếp tục vào trang quản trị" });
    expect(continueButton).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Sao chép 10 mã" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(recoveryCodes.join("\n"));
    fireEvent.click(screen.getByRole("button", { name: "Tải tệp .txt" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("checkbox", { name: /Tôi đã lưu mã khôi phục/ }));
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);

    expect(screen.queryByRole("list", { name: "10 mã khôi phục" })).not.toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith("/admin");
    expect(storageSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:recovery-codes"));
  });

  it("clears one-time recovery codes before routing a newly enrolled temporary-password principal", async () => {
    vi.mocked(startMfaEnrollment).mockResolvedValue({ status: "pending", enrollmentUri });
    vi.mocked(confirmMfaEnrollment).mockResolvedValue({
      principal: { ...principal, mustChangePassword: true },
      recoveryCodes,
    });
    render(<MfaForm enrollmentRequired />);
    fireEvent.click(screen.getByRole("button", { name: /Thiết lập xác thực hai bước/ }));
    fireEvent.change(await screen.findByLabelText("Mã xác nhận 6 số"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận và tạo mã khôi phục" }));
    await screen.findByRole("list", { name: "10 mã khôi phục" });
    fireEvent.click(screen.getByRole("checkbox", { name: /Tôi đã lưu mã khôi phục/ }));
    fireEvent.click(screen.getByRole("button", { name: "Tiếp tục vào trang quản trị" }));

    expect(screen.queryByRole("list", { name: "10 mã khôi phục" })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(recoveryCodes[0]);
    expect(router.replace).toHaveBeenCalledWith("/login/password-change");
    expect(router.replace).not.toHaveBeenCalledWith("/admin");
  });

  it("keeps clipboard-denied recovery feedback visible and keyboard-focusable", async () => {
    vi.mocked(startMfaEnrollment).mockResolvedValue({ status: "pending", enrollmentUri });
    vi.mocked(confirmMfaEnrollment).mockResolvedValue({ principal, recoveryCodes });
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("denied"));
    render(<MfaForm enrollmentRequired />);
    fireEvent.click(screen.getByRole("button", { name: /Thiết lập xác thực hai bước/ }));
    fireEvent.change(await screen.findByLabelText("Mã xác nhận 6 số"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận và tạo mã khôi phục" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sao chép 10 mã" }));
    const feedback = await screen.findByText(/sao chép thủ công/);
    const alert = feedback.closest("[role='alert']");
    expect(alert).not.toBeNull();
    expect(alert).toHaveFocus();
  });

  it.each([
    [new AuthApiError(409, "AUTH_MFA_ENROLLMENT_ALREADY_STARTED", "already started"), "409"],
    [new AuthApiError(0, "NETWORK_AMBIGUOUS", "ambiguous", undefined, undefined, true), "ambiguous network"],
  ])("forces a fresh password login after %s and never exposes an unsafe retry", async (failure) => {
    vi.mocked(startMfaEnrollment).mockRejectedValue(failure);
    render(<MfaForm enrollmentRequired />);
    fireEvent.click(screen.getByRole("button", { name: /Thiết lập xác thực hai bước/ }));
    expect(await screen.findByText("Cần đăng nhập lại")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Thiết lập xác thực hai bước/ })).not.toBeInTheDocument();
    expect(vi.mocked(startMfaEnrollment)).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Đăng nhập lại bằng mật khẩu" }));
    expect(router.replace).toHaveBeenCalledWith("/login");
  });

  it("surfaces rate limiting as a retryable accessible alert", async () => {
    vi.mocked(startMfaEnrollment).mockRejectedValue(new AuthApiError(429, "AUTH_MFA_RATE_LIMITED", "limited", undefined, 30));
    render(<MfaForm enrollmentRequired />);
    fireEvent.click(screen.getByRole("button", { name: /Thiết lập xác thực hai bước/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("30 giây");
    expect(alert).toHaveFocus();
    expect(screen.getByRole("button", { name: /Thiết lập xác thực hai bước/ })).toBeEnabled();
  });
});

describe("existing MFA verification", () => {
  it("supports TOTP and recovery-code controls with accessible labels", async () => {
    vi.mocked(verifyMfa).mockResolvedValue(principal);
    render(<MfaForm enrollmentRequired={false} />);
    expect(screen.getByLabelText("Mã xác thực 6 số")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mã khôi phục" }));
    fireEvent.change(screen.getByLabelText("Mã khôi phục"), { target: { value: recoveryCodes[0] } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(verifyMfa).toHaveBeenCalledWith("recovery_code", recoveryCodes[0]));
    expect(router.replace).toHaveBeenCalledWith("/admin");
  });

  it("routes an authenticated principal to the required password change", async () => {
    vi.mocked(verifyMfa).mockResolvedValue({ ...principal, mustChangePassword: true });
    render(<MfaForm enrollmentRequired={false} />);
    fireEvent.change(screen.getByLabelText("Mã xác thực 6 số"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login/password-change"));
    expect(router.replace).not.toHaveBeenCalledWith("/admin");
  });

  it.each([
    [401, "AUTH_MFA_INVALID", "Mã xác thực không đúng"],
    [403, "ROLE_FORBIDDEN", "không được phép"],
    [429, "AUTH_MFA_RATE_LIMITED", "quá nhiều lần thử"],
  ])("renders an explicit %i verification state", async (status, code, expected) => {
    vi.mocked(verifyMfa).mockRejectedValue(new AuthApiError(status, code, "backend message", undefined, status === 429 ? 60 : undefined));
    render(<MfaForm enrollmentRequired={false} />);
    fireEvent.change(screen.getByLabelText("Mã xác thực 6 số"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(expected);
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText("Mã xác thực 6 số")).toHaveValue("");
  });
});
