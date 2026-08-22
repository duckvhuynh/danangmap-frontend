import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionSecurityPanel } from "./session-security-panel";
import { AccountSecurityError, type AccountSecurityActions } from "@/lib/auth/account-security-model";
import { clearPrincipalRecovery } from "@/lib/editor/draft-db";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const session = vi.hoisted(() => ({
  principal: {
    id: "11111111-1111-4111-8111-111111111111",
    email: "editor@danang.gov.vn",
    username: "editor",
    displayName: "Editor",
    role: "editor" as const,
    status: "active" as const,
    mfaEnabled: true,
    mustChangePassword: false,
  },
  csrfToken: "csrf-admin",
  refreshCsrf: vi.fn(),
  clearClientPrincipal: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/admin/admin-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/admin/admin-session")>()),
  useAdminSession: () => session,
}));
vi.mock("@/lib/editor/draft-db", () => ({ clearPrincipalRecovery: vi.fn() }));

const operationKey = "22222222-2222-4222-8222-222222222222";

function openConfirmation() {
  fireEvent.click(screen.getByRole("button", { name: "Thu hồi toàn bộ phiên" }));
}

beforeEach(() => {
  router.replace.mockReset();
  router.refresh.mockReset();
  session.clearClientPrincipal.mockReset();
  vi.mocked(clearPrincipalRecovery).mockReset().mockResolvedValue(undefined);
  vi.spyOn(crypto, "randomUUID").mockReturnValue(operationKey);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("revoke-all session security", () => {
  it("requires explicit confirmation, submits once and clears the principal recovery before login", async () => {
    let resolveRevoke: ((value: Awaited<ReturnType<AccountSecurityActions["revokeAllSessions"]>>) => void) | undefined;
    const revokeAllSessions = vi.fn<AccountSecurityActions["revokeAllSessions"]>(() =>
      new Promise((resolve) => {
        resolveRevoke = resolve;
      }),
    );
    render(
      <StrictMode>
        <SessionSecurityPanel revokeAllSessions={revokeAllSessions} />
      </StrictMode>,
    );
    openConfirmation();
    expect(screen.getByRole("note")).toHaveTextContent("Thao tác này không thể hoàn tác");
    const confirm = screen.getByRole("button", { name: "Xác nhận thu hồi" });
    expect(confirm).toHaveFocus();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(revokeAllSessions).toHaveBeenCalledTimes(1);
    expect(revokeAllSessions).toHaveBeenCalledWith(operationKey);

    await act(async () =>
      resolveRevoke?.({
        status: "sessions_revoked",
        revokedCount: 3,
        currentSessionRevoked: true,
        loginRequired: true,
      }),
    );
    await waitFor(() =>
      expect(clearPrincipalRecovery).toHaveBeenCalledWith(session.principal.id),
    );
    expect(session.clearClientPrincipal).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("restores trigger focus on cancel and reuses the same key after a nonterminal retry", async () => {
    const revokeAllSessions = vi
      .fn<AccountSecurityActions["revokeAllSessions"]>()
      .mockRejectedValueOnce(new AccountSecurityError(409, "COMMAND_IN_PROGRESS", "processing"))
      .mockRejectedValueOnce(new AccountSecurityError(503, "SERVICE_UNAVAILABLE", "down"));
    render(<SessionSecurityPanel revokeAllSessions={revokeAllSessions} />);
    const trigger = screen.getByRole("button", { name: "Thu hồi toàn bộ phiên" });
    trigger.focus();
    openConfirmation();
    expect(screen.getByRole("button", { name: "Xác nhận thu hồi" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Thu hồi toàn bộ phiên" })).toHaveFocus());

    openConfirmation();
    const confirm = screen.getByRole("button", { name: "Xác nhận thu hồi" });
    fireEvent.click(confirm);
    await screen.findByRole("alert");
    fireEvent.click(confirm);
    await waitFor(() => expect(revokeAllSessions).toHaveBeenCalledTimes(2));
    expect(revokeAllSessions).toHaveBeenNthCalledWith(1, operationKey);
    expect(revokeAllSessions).toHaveBeenNthCalledWith(2, operationKey);
  });

  it.each([
    new AccountSecurityError(401, "AUTH_SESSION_EXPIRED", "already revoked"),
    new AccountSecurityError(0, "NETWORK_AMBIGUOUS", "reset", undefined, undefined, true),
  ])("ends local state without replay after %s", async (failure) => {
    const revokeAllSessions = vi
      .fn<AccountSecurityActions["revokeAllSessions"]>()
      .mockRejectedValue(failure);
    render(<SessionSecurityPanel revokeAllSessions={revokeAllSessions} />);
    openConfirmation();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận thu hồi" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(revokeAllSessions).toHaveBeenCalledTimes(1);
    expect(clearPrincipalRecovery).toHaveBeenCalledWith(session.principal.id);
    expect(session.clearClientPrincipal).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận thu hồi" }));
    expect(revokeAllSessions).toHaveBeenCalledTimes(1);
  });

  it.each([
    [403, "không được phép"],
    [409, "đang được xử lý"],
    [422, "không hợp lệ"],
    [429, "30 giây"],
    [503, "tạm gián đoạn"],
  ])("keeps a focused explicit error for %i", async (status, expected) => {
    const revokeAllSessions = vi
      .fn<AccountSecurityActions["revokeAllSessions"]>()
      .mockRejectedValue(
        new AccountSecurityError(
          status,
          `HTTP_${status}`,
          "backend detail",
          undefined,
          status === 429 ? 30 : undefined,
        ),
      );
    render(<SessionSecurityPanel revokeAllSessions={revokeAllSessions} />);
    openConfirmation();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận thu hồi" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(expected);
    expect(alert).toHaveFocus();
    expect(screen.getByRole("button", { name: "Xác nhận thu hồi" })).toBeEnabled();
    expect(clearPrincipalRecovery).not.toHaveBeenCalled();
  });
});
