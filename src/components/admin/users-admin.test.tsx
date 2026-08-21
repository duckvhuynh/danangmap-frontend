import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "@/lib/api/admin";
import { UsersAdmin } from "@/components/admin/users-admin";

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
  createInvite: vi.fn(),
  session: { principal: { id: "admin-1", email: "admin@danang.gov.vn", username: "admin", displayName: "Quản trị", role: "system_admin" as "system_admin" | "editor" | "reviewer" | "publisher", status: "active" as const, mfaEnabled: true, mustChangePassword: false }, csrfToken: "csrf-test", refreshCsrf: vi.fn() },
}));

vi.mock("@/lib/api/users", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/users")>(),
  listUsers: mocks.listUsers,
  createUser: mocks.createUser,
  createInvite: mocks.createInvite,
}));

vi.mock("@/components/admin/admin-session", () => ({ useAdminSession: () => mocks.session }));

const firstUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "editor@danang.gov.vn",
  username: "editor01",
  displayName: "Biên tập viên 01",
  role: "editor" as const,
  status: "active" as const,
  mfaEnabled: true,
  mustChangePassword: false,
};
const page = (users = [firstUser]) => ({ data: users, meta: { requestId: "request-list", nextCursor: null, hasMore: false, limit: 50 } });

let canAuthor = true;

beforeEach(() => {
  canAuthor = true;
  mocks.session.principal.role = "system_admin";
  mocks.listUsers.mockReset().mockResolvedValue(page());
  mocks.createUser.mockReset().mockResolvedValue(firstUser);
  mocks.createInvite.mockReset().mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222", email: "reviewer@danang.gov.vn", role: "reviewer", status: "pending", expiresAt: "2026-08-24T00:00:00.000Z" });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockImplementation(() => ({ matches: canAuthor, media: "", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })) });
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("33333333-3333-4333-8333-333333333333");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function openManualAndFill() {
  await screen.findAllByText(firstUser.displayName);
  fireEvent.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Tên hiển thị"), { target: { value: "Nguyễn Văn An" } });
  fireEvent.change(within(dialog).getByLabelText("Tên đăng nhập"), { target: { value: "nguyenvanan" } });
  fireEvent.change(within(dialog).getByLabelText("Email công vụ"), { target: { value: "an.nguyen@danang.gov.vn" } });
  fireEvent.change(within(dialog).getByLabelText("Mật khẩu tạm thời"), { target: { value: "Temporary-123" } });
  return dialog;
}

describe("System Admin users screen", () => {
  it("blocks non-System Admin principals before any user request", async () => {
    mocks.session.principal.role = "reviewer";
    render(<UsersAdmin />);
    expect(screen.getByRole("alert")).toHaveTextContent("Không có quyền truy cập");
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });

  it("renders the real list and exposes authoring only with desktop pointer capability", async () => {
    render(<UsersAdmin />);
    expect((await screen.findAllByText(firstUser.displayName)).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Đã bật MFA").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tạo tài khoản" })).toBeEnabled();
  });

  it("shows a read-only capability gate without hiding the account list", async () => {
    canAuthor = false;
    render(<UsersAdmin />);
    expect((await screen.findAllByText(firstUser.displayName)).length).toBeGreaterThan(0);
    expect(screen.getByText("Chế độ chỉ xem")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mời" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tạo tài khoản" })).toBeDisabled();
  });

  it("creates a manual account with CSRF, refreshes the list and clears the secret", async () => {
    render(<UsersAdmin />);
    const dialog = await openManualAndFill();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tạo tài khoản" }));
    await waitFor(() => expect(mocks.createUser).toHaveBeenCalledWith({ email: "an.nguyen@danang.gov.vn", username: "nguyenvanan", displayName: "Nguyễn Văn An", role: "editor", delivery: "manual", temporaryPassword: "Temporary-123" }, "33333333-3333-4333-8333-333333333333", { csrfToken: "csrf-test" }));
    expect(await screen.findByText("Đã tạo tài khoản cho Nguyễn Văn An.")).toBeInTheDocument();
    await waitFor(() => expect(mocks.listUsers).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reuses one operation key for an ambiguous network retry", async () => {
    mocks.createUser.mockRejectedValueOnce(new TypeError("Mất kết nối sau khi gửi yêu cầu.")).mockResolvedValueOnce(firstUser);
    render(<UsersAdmin />);
    const dialog = await openManualAndFill();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tạo tài khoản" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Mất kết nối sau khi gửi yêu cầu");
    fireEvent.click(within(dialog).getByRole("button", { name: "Tạo tài khoản" }));
    await waitFor(() => expect(mocks.createUser).toHaveBeenCalledTimes(2));
    expect(mocks.createUser.mock.calls.map((call) => call[1])).toEqual(["33333333-3333-4333-8333-333333333333", "33333333-3333-4333-8333-333333333333"]);
  });

  it("maps a 409 account conflict without implying a revision conflict", async () => {
    mocks.createUser.mockRejectedValueOnce(new AdminApiError(409, "USERNAME_EXISTS", "Tên đăng nhập đã tồn tại.", "request-conflict"));
    render(<UsersAdmin />);
    const dialog = await openManualAndFill();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tạo tài khoản" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Email hoặc tên đăng nhập đã tồn tại");
    expect(alert).toHaveTextContent("request-conflict");
    expect(alert).not.toHaveTextContent("revision");
  });

  it("uses the dedicated invitation endpoint and refreshes after success", async () => {
    render(<UsersAdmin />);
    await screen.findAllByText(firstUser.displayName);
    fireEvent.click(screen.getByRole("button", { name: "Mời" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Tên hiển thị"), { target: { value: "Kiểm duyệt viên 01" } });
    fireEvent.change(within(dialog).getByLabelText("Tên đăng nhập"), { target: { value: "reviewer01" } });
    fireEvent.change(within(dialog).getByLabelText("Email công vụ"), { target: { value: "reviewer@danang.gov.vn" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Gửi lời mời" }));
    await waitFor(() => expect(mocks.createInvite).toHaveBeenCalledWith(expect.objectContaining({ email: "reviewer@danang.gov.vn", expiresInHours: 72 }), "33333333-3333-4333-8333-333333333333", { csrfToken: "csrf-test" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Đã gửi lời mời");
  });

  it("does not present a successful POST as failed when the refresh GET fails", async () => {
    mocks.listUsers.mockResolvedValueOnce(page()).mockRejectedValueOnce(new AdminApiError(500, "UPSTREAM", "Không tải lại được.", "request-refresh"));
    render(<UsersAdmin />);
    const dialog = await openManualAndFill();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tạo tài khoản" }));
    expect(await screen.findByText("Đã tạo tài khoản cho Nguyễn Văn An.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Tài khoản đã xử lý nhưng danh sách chưa làm mới")).toBeInTheDocument();
    expect(screen.getAllByText(firstUser.displayName).length).toBeGreaterThan(0);
    expect(mocks.createUser).toHaveBeenCalledTimes(1);
  });
});
