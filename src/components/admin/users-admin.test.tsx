import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "@/lib/api/admin";
import { UsersAdmin } from "@/components/admin/users-admin";

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(), getAdminUser: vi.fn(), listAdminInvites: vi.fn(),
  createUser: vi.fn(), createInvite: vi.fn(), updateAdminUser: vi.fn(),
  revokeInvite: vi.fn(), resendAdminInvite: vi.fn(), revokeAdminUserSession: vi.fn(), revokeAllAdminUserSessions: vi.fn(), resetAdminUserMfa: vi.fn(), requestAdminUserPasswordReset: vi.fn(),
  session: { principal: { id: "admin-1", email: "admin@danang.gov.vn", username: "admin", displayName: "Quản trị", role: "system_admin" as "system_admin" | "editor" | "reviewer" | "publisher", status: "active" as const, mfaEnabled: true, mustChangePassword: false }, csrfToken: "csrf-test", refreshCsrf: vi.fn(), clearClientPrincipal: vi.fn() },
}));

vi.mock("@/lib/api/users", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/users")>(),
  listUsers: mocks.listUsers, getAdminUser: mocks.getAdminUser, listAdminInvites: mocks.listAdminInvites,
  createUser: mocks.createUser, createInvite: mocks.createInvite, updateAdminUser: mocks.updateAdminUser,
  revokeInvite: mocks.revokeInvite, resendAdminInvite: mocks.resendAdminInvite, revokeAdminUserSession: mocks.revokeAdminUserSession,
  revokeAllAdminUserSessions: mocks.revokeAllAdminUserSessions, resetAdminUserMfa: mocks.resetAdminUserMfa,
  requestAdminUserPasswordReset: mocks.requestAdminUserPasswordReset,
}));
vi.mock("@/components/admin/admin-session", () => ({ useAdminSession: () => mocks.session }));

const firstUser = {
  id: "11111111-1111-4111-8111-111111111111", email: "editor@danang.gov.vn", username: "editor01", displayName: "Biên tập viên 01", role: "editor" as const, status: "active" as const,
  mfaEnabled: true, mustChangePassword: false, disabledAt: null, lockedUntil: null, lockVersion: 4, etag: '"user-v4"', createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z",
  security: { activeSessionCount: 1, latestSessionCreatedAt: "2026-08-24T00:00:00.000Z", recoveryCodesRemaining: 8, pendingInviteCount: 0, pendingPasswordReset: false },
};
const detail = {
  id: firstUser.id, email: firstUser.email, username: firstUser.username, displayName: firstUser.displayName, role: firstUser.role, status: firstUser.status,
  mustChangePassword: false, disabledAt: null, lockedUntil: null, failedLoginCount: 0, lockVersion: 4, etag: firstUser.etag, createdAt: firstUser.createdAt, updatedAt: firstUser.updatedAt,
  mfa: { enabled: true, status: "verified" as const, verifiedAt: "2026-08-20T00:00:00.000Z", recoveryCodesRemaining: 8, recoveryCodesConsumed: 2 },
  sessions: [{ id: "22222222-2222-4222-8222-222222222222", kind: "authenticated" as const, status: "active" as const, createdAt: "2026-08-24T00:00:00.000Z", expiresAt: "2026-08-31T00:00:00.000Z", revokedAt: null, userAgent: "Browser test" }],
  invites: [], passwordResets: [],
};
const page = (users = [firstUser]) => ({ data: users, meta: { requestId: "request-list", nextCursor: null, hasMore: false, limit: 25 } });
let canAuthor = true;

beforeEach(() => {
  canAuthor = true;
  mocks.session.principal.role = "system_admin";
  for (const value of Object.values(mocks)) if (typeof value === "function" && "mockReset" in value) value.mockReset();
  mocks.listUsers.mockResolvedValue(page());
  mocks.getAdminUser.mockResolvedValue({ data: detail, etag: firstUser.etag });
  mocks.listAdminInvites.mockResolvedValue({ data: [], meta: { requestId: "invites", nextCursor: null, hasMore: false, limit: 25 } });
  mocks.createUser.mockResolvedValue(firstUser);
  mocks.createInvite.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", email: "reviewer@danang.gov.vn", role: "reviewer", status: "pending", expiresAt: "2026-08-30T00:00:00.000Z" });
  mocks.updateAdminUser.mockResolvedValue({ data: { ...detail, displayName: "Tên đã sửa", etag: '"user-v5"' }, etag: '"user-v5"' });
  mocks.requestAdminUserPasswordReset.mockResolvedValue({ userId: firstUser.id, status: "accepted", deliveryStatus: "pending", expiresAt: "2026-08-26T00:00:00.000Z", mailOutboxId: "44444444-4444-4444-8444-444444444444", etag: '"user-v5"' });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockImplementation(() => ({ matches: canAuthor, media: "", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() })) });
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("55555555-5555-4555-8555-555555555555");
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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
  it("blocks non-System Admin before any directory request", () => {
    mocks.session.principal.role = "reviewer";
    render(<UsersAdmin />);
    expect(screen.getByRole("alert")).toHaveTextContent("Không có quyền truy cập");
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });

  it("loads the server directory and sends search/filter state to the adapter", async () => {
    render(<UsersAdmin />);
    expect((await screen.findAllByText(firstUser.displayName)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 phiên · 8 mã khôi phục/iu).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Tìm tài khoản"), { target: { value: "editor" } });
    await waitFor(() => expect(mocks.listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ q: "editor", limit: 25 }), expect.any(AbortSignal)));
  });

  it("does not render mutations on a mobile/read-only capability", async () => {
    canAuthor = false;
    render(<UsersAdmin />);
    expect((await screen.findAllByText(firstUser.displayName)).length).toBeGreaterThan(0);
    expect(screen.getByText("Chế độ chỉ xem")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mời" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tạo tài khoản" })).not.toBeInTheDocument();
    const mobileRow = screen.getAllByText(firstUser.displayName).map((node) => node.closest("button")).find(Boolean);
    fireEvent.click(mobileRow!);
    expect(await screen.findByText("Chi tiết chỉ xem")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lưu thay đổi" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đặt lại MFA" })).not.toBeInTheDocument();
  });

  it("creates a manual account, refreshes the directory and clears the secret dialog", async () => {
    render(<UsersAdmin />);
    const dialog = await openManualAndFill();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tạo tài khoản" }));
    await waitFor(() => expect(mocks.createUser).toHaveBeenCalledWith({ email: "an.nguyen@danang.gov.vn", username: "nguyenvanan", displayName: "Nguyễn Văn An", role: "editor", delivery: "manual", temporaryPassword: "Temporary-123" }, "55555555-5555-4555-8555-555555555555", { csrfToken: "csrf-test" }));
    expect(await screen.findByText("Đã tạo tài khoản cho Nguyễn Văn An.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reuses one operation key for an ambiguous account creation retry", async () => {
    mocks.createUser.mockRejectedValueOnce(new TypeError("Mất kết nối sau khi gửi yêu cầu.")).mockResolvedValueOnce(firstUser);
    render(<UsersAdmin />);
    const dialog = await openManualAndFill();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tạo tài khoản" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Mất kết nối");
    fireEvent.click(within(dialog).getByRole("button", { name: "Tạo tài khoản" }));
    await waitFor(() => expect(mocks.createUser).toHaveBeenCalledTimes(2));
    expect(mocks.createUser.mock.calls.map((call) => call[1])).toEqual(["55555555-5555-4555-8555-555555555555", "55555555-5555-4555-8555-555555555555"]);
  });

  it("opens safe detail and updates display name with the loaded ETag", async () => {
    render(<UsersAdmin />);
    await screen.findAllByText(firstUser.displayName);
    fireEvent.click(screen.getByRole("button", { name: `Xem chi tiết ${firstUser.displayName}` }));
    const dialog = await screen.findByRole("dialog");
    const input = await within(dialog).findByLabelText("Tên hiển thị");
    fireEvent.change(input, { target: { value: "Tên đã sửa" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(mocks.updateAdminUser).toHaveBeenCalledWith(firstUser.id, { displayName: "Tên đã sửa", unlock: false }, firstUser.etag, "55555555-5555-4555-8555-555555555555", { csrfToken: "csrf-test" }));
    expect(await screen.findByText("Đã cập nhật tài khoản và làm mới phiên bản dữ liệu.")).toBeInTheDocument();
  });

  it("keeps an explicit 412 conflict in the detail instead of retrying with a new key", async () => {
    mocks.updateAdminUser.mockRejectedValue(new AdminApiError(412, "ETAG_MISMATCH", "Stale", "request-stale"));
    render(<UsersAdmin />);
    await screen.findAllByText(firstUser.displayName);
    fireEvent.click(screen.getByRole("button", { name: `Xem chi tiết ${firstUser.displayName}` }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(await within(dialog).findByLabelText("Tên hiển thị"), { target: { value: "Tên xung đột" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lưu thay đổi" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Dữ liệu tài khoản đã thay đổi");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("request-stale");
    expect(mocks.updateAdminUser).toHaveBeenCalledTimes(1);
  });
});
