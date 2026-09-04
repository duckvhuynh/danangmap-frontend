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
import { BootstrapSetupForm } from "./bootstrap-setup-form";
import {
  BootstrapApiError,
  bootstrapSystemAdmin,
  getBootstrapStatus,
} from "@/lib/api/bootstrap";

const router = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api/bootstrap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/bootstrap")>()),
  bootstrapSystemAdmin: vi.fn(),
  getBootstrapStatus: vi.fn(),
}));

const bootstrapToken = "bootstrap_token_abcdefghijklmnopqrstuvwxyz1234567890";
const password = "Strong-Civic-Map-2026!";
const account = {
  displayName: "Quản trị hệ thống",
  email: "admin@danang.gov.vn",
  username: "system.admin",
  password,
  passwordConfirmation: password,
};

async function renderAvailable(strict = false) {
  vi.mocked(getBootstrapStatus).mockResolvedValue({ available: true });
  render(
    strict ? (
      <StrictMode>
        <BootstrapSetupForm />
      </StrictMode>
    ) : (
      <BootstrapSetupForm />
    ),
  );
  await screen.findByLabelText("Tên hiển thị");
}

function fillAccount(overrides: Partial<typeof account> = {}) {
  const values = { ...account, ...overrides };
  fireEvent.change(screen.getByLabelText("Tên hiển thị"), {
    target: { value: values.displayName },
  });
  fireEvent.change(screen.getByLabelText("Email nội bộ"), {
    target: { value: values.email },
  });
  fireEvent.change(screen.getByLabelText("Tên đăng nhập"), {
    target: { value: values.username },
  });
  fireEvent.change(screen.getByLabelText("Mật khẩu"), {
    target: { value: values.password },
  });
  fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu"), {
    target: { value: values.passwordConfirmation },
  });
  fireEvent.change(screen.getByLabelText("Mã khởi tạo một lần"), {
    target: { value: bootstrapToken },
  });
}

beforeEach(() => {
  router.replace.mockReset();
  vi.mocked(getBootstrapStatus).mockReset();
  vi.mocked(bootstrapSystemAdmin).mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("first System Admin setup privacy and continuation", () => {
  it("renders loading, available and unavailable states without exposing a default account", async () => {
    let resolveStatus: ((value: { available: boolean }) => void) | undefined;
    vi.mocked(getBootstrapStatus).mockReturnValue(
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
    );
    const view = render(<BootstrapSetupForm />);
    expect(
      screen.getByLabelText("Đang kiểm tra trạng thái khởi tạo"),
    ).toHaveAttribute("aria-busy", "true");
    await act(async () => resolveStatus?.({ available: false }));
    expect(
      await screen.findByText("Không thể khởi tạo tài khoản đầu tiên"),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("admin@demo");
    expect(
      screen.queryByLabelText("Mã khởi tạo một lần"),
    ).not.toBeInTheDocument();
    view.unmount();
  });

  it("submits exactly once, clears every secret and continues into mandatory MFA", async () => {
    let resolveCreate:
      | ((value: {
          status: "mfa_required";
          mfaEnrollmentRequired: true;
          challengeExpiresAt: string;
        }) => void)
      | undefined;
    vi.mocked(bootstrapSystemAdmin).mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");
    const consoleSpy = vi
      .spyOn(console, "log")
      .mockImplementation(() => undefined);
    const databasesBefore = await indexedDB.databases();
    await renderAvailable(true);
    fillAccount();

    const submit = screen.getByRole("button", {
      name: "Tạo tài khoản và tiếp tục",
    });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(vi.mocked(bootstrapSystemAdmin)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(bootstrapSystemAdmin)).toHaveBeenCalledWith(
      account,
      bootstrapToken,
    );

    await act(async () =>
      resolveCreate?.({
        status: "mfa_required",
        mfaEnrollmentRequired: true,
        challengeExpiresAt: "2026-08-25T15:00:00.000Z",
      }),
    );
    expect(
      await screen.findByText("Đã tạo tài khoản quản trị"),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue(password)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(bootstrapToken)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(bootstrapToken);
    expect(storageSpy).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(await indexedDB.databases()).toEqual(databasesBefore);
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        "/login/mfa?enrollment=required",
      ),
    );
  });

  it("continues directly to admin when bootstrap returns an authenticated session", async () => {
    vi.mocked(bootstrapSystemAdmin).mockResolvedValue({
      status: "authenticated",
      mfaEnrollmentRequired: false,
      principal: {
        id: "11111111-1111-4111-8111-111111111111",
        email: account.email,
        username: account.username,
        displayName: account.displayName,
        role: "system_admin",
        status: "active",
        mfaEnabled: false,
        mustChangePassword: false,
      },
    });
    await renderAvailable();
    fillAccount();
    fireEvent.click(
      screen.getByRole("button", { name: "Tạo tài khoản và tiếp tục" }),
    );

    expect(
      await screen.findByText("Đang chuyển tới trang quản trị."),
    ).toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
  });

  it("never retries an ambiguous create and removes all form values", async () => {
    vi.mocked(bootstrapSystemAdmin).mockRejectedValue(
      new BootstrapApiError(
        0,
        "NETWORK_AMBIGUOUS",
        "connection reset",
        undefined,
        undefined,
        true,
      ),
    );
    await renderAvailable();
    fillAccount();
    fireEvent.click(
      screen.getByRole("button", { name: "Tạo tài khoản và tiếp tục" }),
    );

    expect(
      await screen.findByText("Trạng thái khởi tạo chưa xác định"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Mật khẩu")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Mã khởi tạo một lần"),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(bootstrapToken);
    expect(vi.mocked(bootstrapSystemAdmin)).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Tạo tài khoản và tiếp tục" }),
    ).not.toBeInTheDocument();
    await screen.getByRole("button", { name: "Đi đến đăng nhập" }).click();
    expect(router.replace).toHaveBeenCalledWith("/login");
  });
});

describe("first System Admin setup validation and operational states", () => {
  it.each([
    ["displayName", { displayName: "Q" }, "Tên hiển thị", "2 đến 200"],
    ["email", { email: "invalid" }, "Email nội bộ", "chưa đúng định dạng"],
    [
      "username",
      { username: "Admin Account" },
      "Tên đăng nhập",
      "ký tự thường",
    ],
    [
      "password",
      {
        password: "not-strong-enough",
        passwordConfirmation: "not-strong-enough",
      },
      "Mật khẩu",
      "chữ hoa",
    ],
    [
      "passwordConfirmation",
      { passwordConfirmation: `${password}x` },
      "Nhập lại mật khẩu",
      "chưa trùng khớp",
    ],
  ])(
    "focuses the first invalid %s field before calling the API",
    async (_case, overrides, label, message) => {
      await renderAvailable();
      fillAccount(overrides);
      fireEvent.submit(screen.getByLabelText("Tên hiển thị").closest("form")!);
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(message);
      expect(screen.getByLabelText(label)).toHaveFocus();
      expect(vi.mocked(bootstrapSystemAdmin)).not.toHaveBeenCalled();
    },
  );

  it("clears and focuses only an invalid one-time token", async () => {
    vi.mocked(bootstrapSystemAdmin).mockRejectedValue(
      new BootstrapApiError(401, "BOOTSTRAP_TOKEN_INVALID", "backend detail"),
    );
    await renderAvailable();
    fillAccount();
    fireEvent.click(
      screen.getByRole("button", { name: "Tạo tài khoản và tiếp tục" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Mã khởi tạo không đúng");
    expect(alert).not.toHaveTextContent("backend detail");
    expect(screen.getByLabelText("Mã khởi tạo một lần")).toHaveValue("");
    expect(screen.getByLabelText("Mã khởi tạo một lần")).toHaveFocus();
  });

  it.each([
    [429, "RATE_LIMITED", "25 giây"],
    [403, "CSRF_INVALID", "Phiên bảo mật không hợp lệ"],
  ])(
    "keeps a keyboard retry path for a %i response",
    async (status, code, message) => {
      vi.mocked(bootstrapSystemAdmin).mockRejectedValue(
        new BootstrapApiError(
          status,
          code,
          "backend detail",
          undefined,
          status === 429 ? 25 : undefined,
        ),
      );
      await renderAvailable();
      fillAccount();
      fireEvent.click(
        screen.getByRole("button", { name: "Tạo tài khoản và tiếp tục" }),
      );
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(message);
      expect(alert).toHaveFocus();
      const retry = screen.getByRole("button", {
        name: "Tạo tài khoản và tiếp tục",
      });
      expect(retry).toBeEnabled();
      retry.focus();
      expect(retry).toHaveFocus();
    },
  );

  it.each([
    [409, "BOOTSTRAP_ALREADY_COMPLETED", "đã có tài khoản quản trị"],
    [503, "BOOTSTRAP_UNAVAILABLE", "chưa được bật"],
  ])(
    "removes the form after terminal %i availability state",
    async (status, code, message) => {
      vi.mocked(bootstrapSystemAdmin).mockRejectedValue(
        new BootstrapApiError(status, code, "backend detail"),
      );
      await renderAvailable();
      fillAccount();
      fireEvent.click(
        screen.getByRole("button", { name: "Tạo tài khoản và tiếp tục" }),
      );
      expect(
        await screen.findByText(message, { exact: false }),
      ).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Mã khởi tạo một lần"),
      ).not.toBeInTheDocument();
    },
  );

  it("offers a bounded retry after status network failure", async () => {
    vi.mocked(getBootstrapStatus)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ available: true });
    render(<BootstrapSetupForm />);
    expect(
      await screen.findByText("Chưa kiểm tra được trạng thái"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử kiểm tra lại" }));
    expect(await screen.findByLabelText("Tên hiển thị")).toBeInTheDocument();
    expect(getBootstrapStatus).toHaveBeenCalledTimes(2);
  });
});
