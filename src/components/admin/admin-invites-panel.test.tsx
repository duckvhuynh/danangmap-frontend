import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "@/lib/api/admin";
import { AdminInvitesPanel } from "@/components/admin/admin-invites-panel";

const mocks = vi.hoisted(() => ({
  list: vi.fn(), resend: vi.fn(), revoke: vi.fn(),
  session: { csrfToken: "csrf-test", principal: { id: "admin", role: "system_admin" } },
}));
vi.mock("@/lib/api/users", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/api/users")>(), listAdminInvites: mocks.list, resendAdminInvite: mocks.resend, revokeInvite: mocks.revoke }));
vi.mock("@/components/admin/admin-session", () => ({ useAdminSession: () => mocks.session }));

const invite = {
  id: "11111111-1111-4111-8111-111111111111", email: "reviewer@danang.gov.vn", username: "reviewer01", displayName: "Kiểm duyệt viên 01", role: "reviewer" as const, status: "pending" as const,
  expiresAt: "2026-08-30T00:00:00.000Z", usedAt: null, revokedAt: null, acceptedUserId: null, supersedesInviteId: null, mailStatus: "sent", lockVersion: 1, etag: '"invite-v1"', createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z",
};

beforeEach(() => {
  mocks.list.mockReset().mockResolvedValue({ data: [invite], meta: { requestId: "invites", nextCursor: null, hasMore: false, limit: 25 } });
  mocks.resend.mockReset().mockResolvedValue({ ...invite, supersedesInviteId: invite.id, mailStatus: "pending", etag: '"invite-v2"' });
  mocks.revoke.mockReset().mockResolvedValue({ id: invite.id, status: "revoked", revokedAt: "2026-08-25T00:00:00.000Z" });
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("22222222-2222-4222-8222-222222222222");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("System Admin invitation queue", () => {
  it("loads the pending queue and omits mutations in read-only mode", async () => {
    render(<AdminInvitesPanel canMutate={false} refreshToken={0} onChanged={vi.fn()} />);
    expect(await screen.findByText(invite.displayName)).toBeInTheDocument();
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ status: "pending", limit: 25 }), expect.any(AbortSignal));
    expect(screen.queryByRole("button", { name: "Gửi lại" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Thu hồi" })).not.toBeInTheDocument();
  });

  it("resends with reason, expiry, ETag, CSRF and one idempotency key", async () => {
    const changed = vi.fn();
    render(<AdminInvitesPanel canMutate refreshToken={0} onChanged={changed} />);
    await screen.findByText(invite.displayName);
    fireEvent.click(screen.getByRole("button", { name: "Gửi lại" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Lý do gửi lại"), { target: { value: "Người dùng yêu cầu gửi lại" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Gửi lời mời mới" }));
    await waitFor(() => expect(mocks.resend).toHaveBeenCalledWith(invite.id, { reason: "Người dùng yêu cầu gửi lại", expiresInHours: 72 }, invite.etag, "22222222-2222-4222-8222-222222222222", { csrfToken: "csrf-test" }));
    expect(changed).toHaveBeenCalledWith(expect.stringContaining(invite.email));
  });

  it("surfaces stale invite conflict and does not present success", async () => {
    mocks.resend.mockRejectedValue(new AdminApiError(412, "ETAG_MISMATCH", "Stale", "request-stale"));
    const changed = vi.fn();
    render(<AdminInvitesPanel canMutate refreshToken={0} onChanged={changed} />);
    await screen.findByText(invite.displayName);
    fireEvent.click(screen.getByRole("button", { name: "Gửi lại" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Lý do gửi lại"), { target: { value: "Người dùng yêu cầu gửi lại" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Gửi lời mời mới" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("đã thay đổi trên máy chủ");
    expect(changed).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before revoking a pending invite", async () => {
    const changed = vi.fn();
    render(<AdminInvitesPanel canMutate refreshToken={0} onChanged={changed} />);
    await screen.findByText(invite.displayName);
    fireEvent.click(screen.getByRole("button", { name: "Thu hồi" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Xác nhận thu hồi")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Thu hồi lời mời" }));
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledWith(invite.id, "22222222-2222-4222-8222-222222222222", { csrfToken: "csrf-test" }));
  });
});
