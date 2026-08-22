import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminSession } from "@/components/admin/admin-session";
import type { AdminPrincipal } from "@/lib/api/admin";
import type { SystemAuditEvents } from "@/lib/api/history";
import { SystemAuditScreen, type SystemAuditTransport } from "./system-audit-screen";

vi.mock("@/components/admin/admin-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/admin/admin-session")>()),
  useAdminSession: vi.fn(),
}));

const principal: AdminPrincipal = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "system.admin@example.gov.vn",
  username: "systemadmin",
  displayName: "System Admin",
  role: "system_admin",
  status: "active",
  mfaEnabled: true,
  mustChangePassword: false,
};

function resource(action: string, nextCursor: string | null) {
  const data: SystemAuditEvents = {
    items: [{
      id: crypto.randomUUID(),
      actorId: principal.id,
      actorRole: "system_admin",
      actorDisplayName: principal.displayName,
      action,
      resourceType: "user",
      resourceId: "22222222-2222-4222-8222-222222222222",
      requestId: crypto.randomUUID(),
      beforeDigest: null,
      afterDigest: "sha256:after",
      metadata: { source: "manual" },
      occurredAt: "2026-08-21T03:00:00.000Z",
    }],
    nextCursor,
    hasMore: nextCursor !== null,
    limit: 25,
  };
  return { data, historyEtag: `"audit-${action}"` };
}

beforeEach(() => {
  vi.mocked(useAdminSession).mockReturnValue({ principal, csrfToken: "csrf-fixed", refreshCsrf: vi.fn(), clearClientPrincipal: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("system audit screen", () => {
  it("blocks non-SystemAdmin roles before making a global audit request", () => {
    vi.mocked(useAdminSession).mockReturnValue({ principal: { ...principal, role: "publisher" }, csrfToken: "csrf-fixed", refreshCsrf: vi.fn(), clearClientPrincipal: vi.fn() });
    const load = vi.fn();
    render(<SystemAuditScreen transport={{ load } as SystemAuditTransport}/>);
    expect(screen.getByText("Chỉ System Admin được xem audit toàn hệ thống")).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });

  it("loads role-scoped audit and preserves the opaque pagination cursor", async () => {
    const load = vi.fn().mockResolvedValueOnce(resource("user.invited", "opaque:audit:2/+==")).mockResolvedValueOnce(resource("user.activated", null));
    render(<SystemAuditScreen transport={{ load } as SystemAuditTransport}/>);
    expect(await screen.findByText("user.invited")).toBeInTheDocument();
    expect(screen.getByText('"audit-user.invited"')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tải thêm sự kiện" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load.mock.calls[1]![0].cursor).toBe("opaque:audit:2/+==");
    expect(await screen.findByText("user.activated")).toBeInTheDocument();
  });
});
