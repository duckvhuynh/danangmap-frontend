import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InviteAcceptForm } from "./invite-accept-form";
import {
  InviteApiError,
  acceptInvite,
  inspectInvite,
  type InviteInspection,
} from "@/lib/api/invites";

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api/invites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/invites")>()),
  acceptInvite: vi.fn(),
  inspectInvite: vi.fn(),
}));

const token = "invite_token_abcdefghijklmnopqrstuvwxyz123456";
const password = "Accepted-password-2026!";
const inspection: InviteInspection = {
  maskedEmail: "ed***@danang.gov.vn",
  role: "editor" as const,
  expiresAt: "2026-08-22T08:00:00.000Z",
  requiresMfaEnrollment: true,
};

function pasteToken(value = token) {
  fireEvent.change(screen.getByLabelText("Mã lời mời"), { target: { value } });
}

async function reachPasswordStep(nextInspection = inspection) {
  vi.mocked(inspectInvite).mockResolvedValue(nextInspection);
  pasteToken();
  fireEvent.click(screen.getByRole("button", { name: "Kiểm tra lời mời" }));
  await screen.findByRole("heading", { name: "Kiểm tra thông tin tài khoản" });
}

function fillPasswords() {
  fireEvent.change(screen.getByLabelText("Mật khẩu mới"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu"), {
    target: { value: password },
  });
}

beforeEach(() => {
  router.replace.mockReset();
  vi.mocked(inspectInvite).mockReset();
  vi.mocked(acceptInvite).mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("public invite privacy and one-time actions", () => {
  it("inspects exactly once under StrictMode and double activation without persistence or logging", async () => {
    let resolveInspection: ((value: typeof inspection) => void) | undefined;
    vi.mocked(inspectInvite).mockReturnValue(
      new Promise((resolve) => {
        resolveInspection = resolve;
      }),
    );
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const consoleSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    const databasesBefore = await indexedDB.databases();

    render(
      <StrictMode>
        <InviteAcceptForm />
      </StrictMode>,
    );
    pasteToken();
    const submit = screen.getByRole("button", { name: "Kiểm tra lời mời" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(vi.mocked(inspectInvite)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(inspectInvite)).toHaveBeenCalledWith(token);

    await act(async () => resolveInspection?.(inspection));
    expect(await screen.findByText("ed***@danang.gov.vn")).toBeInTheDocument();
    expect(screen.queryByDisplayValue(token)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(token);
    expect(storageSpy).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(await indexedDB.databases()).toEqual(databasesBefore);
  });

  it("uses password-manager-friendly fields, accepts once and clears sensitive rendered state before MFA navigation", async () => {
    let resolveAcceptance:
      | ((value: {
          status: "mfa_required";
          mfaEnrollmentRequired: true;
          challengeExpiresAt: string;
        }) => void)
      | undefined;
    vi.mocked(acceptInvite).mockReturnValue(
      new Promise((resolve) => {
        resolveAcceptance = resolve;
      }),
    );
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    render(
      <StrictMode>
        <InviteAcceptForm />
      </StrictMode>,
    );
    await reachPasswordStep();

    const passwordInput = screen.getByLabelText("Mật khẩu mới");
    const confirmationInput = screen.getByLabelText("Nhập lại mật khẩu");
    expect(passwordInput).toHaveAttribute("autocomplete", "new-password");
    expect(confirmationInput).toHaveAttribute("autocomplete", "new-password");
    fillPasswords();
    const submit = screen.getByRole("button", {
      name: "Tạo mật khẩu và tiếp tục",
    });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(vi.mocked(acceptInvite)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(acceptInvite)).toHaveBeenCalledWith({
      token,
      password,
      passwordConfirmation: password,
    });

    await act(async () =>
      resolveAcceptance?.({
        status: "mfa_required",
        mfaEnrollmentRequired: true,
        challengeExpiresAt: "2026-08-21T15:00:00.000Z",
      }),
    );
    expect(
      await screen.findByText("Tài khoản đã được tạo"),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue(token)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(password)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(token);
    expect(storageSpy).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        "/login/mfa?enrollment=required",
      ),
    );
  });

  it("continues directly to admin when the invite is accepted with MFA disabled", async () => {
    vi.mocked(acceptInvite).mockResolvedValue({
      status: "authenticated",
      mfaEnrollmentRequired: false,
      principal: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "editor@danang.gov.vn",
        username: "editor",
        displayName: "Editor",
        role: "editor",
        status: "active",
        mfaEnabled: false,
        mustChangePassword: false,
      },
    });
    render(<InviteAcceptForm />);
    await reachPasswordStep({ ...inspection, requiresMfaEnrollment: false });
    expect(screen.getByText("Xác thực bằng mật khẩu")).toBeInTheDocument();
    fillPasswords();
    fireEvent.click(
      screen.getByRole("button", { name: "Tạo mật khẩu và tiếp tục" }),
    );

    expect(
      await screen.findByText("Đang chuyển tới trang quản trị."),
    ).toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
  });

  it("never retries an ambiguous accept and removes token and password inputs", async () => {
    vi.mocked(acceptInvite).mockRejectedValue(
      new InviteApiError(
        0,
        "NETWORK_AMBIGUOUS",
        "connection reset",
        undefined,
        undefined,
        true,
      ),
    );
    render(<InviteAcceptForm />);
    await reachPasswordStep();
    fillPasswords();
    fireEvent.click(
      screen.getByRole("button", { name: "Tạo mật khẩu và tiếp tục" }),
    );

    expect(
      await screen.findByText("Trạng thái kích hoạt chưa xác định"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Mã lời mời")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mật khẩu mới")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(token);
    expect(vi.mocked(acceptInvite)).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Tạo mật khẩu và tiếp tục" }),
    ).not.toBeInTheDocument();
  });
});

describe("public invite errors and accessibility", () => {
  it.each([
    [
      "invalid",
      new InviteApiError(400, "INVITE_INVALID_OR_EXPIRED", "invalid"),
    ],
    [
      "expired",
      new InviteApiError(400, "INVITE_INVALID_OR_EXPIRED", "expired"),
    ],
    ["used", new InviteApiError(400, "INVITE_INVALID_OR_EXPIRED", "used")],
    [
      "revoked",
      new InviteApiError(400, "INVITE_INVALID_OR_EXPIRED", "revoked"),
    ],
  ])(
    "renders the same focused public message for a %s token",
    async (_name, failure) => {
      vi.mocked(inspectInvite).mockRejectedValue(failure);
      render(<InviteAcceptForm />);
      pasteToken();
      fireEvent.click(screen.getByRole("button", { name: "Kiểm tra lời mời" }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("không hợp lệ hoặc đã hết hiệu lực");
      expect(alert).not.toHaveTextContent(failure.message);
      expect(screen.getByLabelText("Mã lời mời")).toHaveFocus();
      expect(screen.getByLabelText("Mã lời mời")).toHaveAttribute(
        "aria-describedby",
        expect.stringContaining("invite-error"),
      );
    },
  );

  it.each([
    [403, "CSRF_INVALID", "Phiên bảo mật không hợp lệ"],
    [409, "INVITE_ACCEPTANCE_CONFLICT", "xung đột"],
    [429, "RATE_LIMITED", "30 giây"],
    [503, "SERVICE_UNAVAILABLE", "tạm gián đoạn"],
  ])(
    "surfaces an explicit %i accept error and keeps a keyboard retry path",
    async (status, code, expected) => {
      vi.mocked(acceptInvite).mockRejectedValue(
        new InviteApiError(
          status,
          code,
          "backend detail",
          undefined,
          status === 429 ? 30 : undefined,
        ),
      );
      render(<InviteAcceptForm />);
      await reachPasswordStep();
      fillPasswords();
      fireEvent.click(
        screen.getByRole("button", { name: "Tạo mật khẩu và tiếp tục" }),
      );
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(expected);
      expect(alert).toHaveFocus();
      const retry = screen.getByRole("button", {
        name: "Tạo mật khẩu và tiếp tục",
      });
      expect(retry).toBeEnabled();
      retry.focus();
      expect(retry).toHaveFocus();
    },
  );

  it("validates matching 12-character passwords before any accept request", async () => {
    render(<InviteAcceptForm />);
    await reachPasswordStep();
    fireEvent.change(screen.getByLabelText("Mật khẩu mới"), {
      target: { value: password },
    });
    fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu"), {
      target: { value: `${password}!` },
    });
    fireEvent.submit(screen.getByLabelText("Mật khẩu mới").closest("form")!);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("chưa trùng khớp");
    expect(screen.getByLabelText("Nhập lại mật khẩu")).toHaveFocus();
    expect(screen.getByLabelText("Nhập lại mật khẩu")).toHaveAttribute(
      "aria-describedby",
      "invite-error",
    );
    expect(vi.mocked(acceptInvite)).not.toHaveBeenCalled();
  });
});
