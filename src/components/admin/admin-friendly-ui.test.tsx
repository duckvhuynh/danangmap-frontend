import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import AdminSettingsPage from "@/app/admin/settings/page";
import AdminDashboardPage from "@/app/admin/page";
import { AdminShell } from "./admin-shell";
import { useAdminSession } from "./admin-session";
import { listAdminLayers, logout, type AdminLayer, type AdminPrincipal } from "@/lib/api/admin";
import { clearPrincipalRecovery } from "@/lib/editor/draft-db";
import { adminRoleLabel, geometryLabel, revisionStatusLabel } from "@/lib/admin/labels";
import { auditActionLabel, auditResourceLabel } from "@/lib/admin/audit-labels";

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin", useRouter: () => navigation }));
vi.mock("./admin-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin-session")>()),
  AdminSessionProvider: ({ children }: { children: ReactNode }) => children,
  useAdminSession: vi.fn(),
}));
vi.mock("@/lib/api/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/admin")>()),
  listAdminLayers: vi.fn(), logout: vi.fn(),
}));
vi.mock("@/lib/editor/draft-db", () => ({ clearPrincipalRecovery: vi.fn() }));

const principal = { id: "admin-id", username: "admin", email: "admin@example.test", displayName: "Nguyễn An", role: "system_admin", status: "active", mfaEnabled: false, mustChangePassword: false } satisfies AdminPrincipal;
function layer(status: string): AdminLayer { return { id: status, title: `Lớp ${status}`, slug: status, status, revisionId: `revision-${status}`, geometryMode: "point", updatedAt: "2026-09-03T01:00:00Z" }; }
beforeEach(() => {
  vi.mocked(useAdminSession).mockReturnValue({ principal, csrfToken: "csrf", refreshCsrf: vi.fn(), clearClientPrincipal: vi.fn() });
  vi.mocked(listAdminLayers).mockResolvedValue([layer("draft"), layer("changes_requested"), layer("in_review"), layer("approved"), layer("published")]);
  vi.mocked(logout).mockResolvedValue(undefined);
  vi.mocked(clearPrincipalRecovery).mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("friendly admin navigation and dashboard", () => {
  it("keeps returned revisions visible as editing work and routes to the layer", async () => {
    render(<AdminDashboardPage/>);
    const returned = await screen.findByRole("heading", { name: "Lớp changes_requested" });
    expect(within(returned.closest("li")!).getByRole("link", { name: "Mở lớp" })).toHaveAttribute("href", "/admin/layers/changes_requested");
    expect(screen.getByText("Đang biên tập").closest("article")).toHaveTextContent("2");
    expect(screen.queryByRole("heading", { name: "Lớp published" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Lớp changes_requested");
    expect(screen.getAllByRole("listitem")[1]).toHaveTextContent("Lớp in_review");
  });
  it("shows only work the user's role can perform", async () => {
    vi.mocked(useAdminSession).mockReturnValue({ principal: { ...principal, role: "reviewer" }, csrfToken: "csrf", refreshCsrf: vi.fn(), clearClientPrincipal: vi.fn() });
    render(<AdminDashboardPage/>);
    expect(await screen.findByRole("heading", { name: "Lớp in_review" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Lớp draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xem để xử lý" })).toHaveAttribute("href", "/admin/layers/in_review/revisions/revision-in_review/review");
  });
  it("offers a retry with a safe error message", async () => {
    vi.mocked(listAdminLayers).mockRejectedValueOnce(new Error("SQL private connection string")).mockResolvedValueOnce([]);
    render(<AdminDashboardPage/>);
    fireEvent.click(await screen.findByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Chưa có công việc cần xử lý")).toBeInTheDocument();
    expect(screen.queryByText(/SQL private/u)).not.toBeInTheDocument();
  });
  it("exposes all admin destinations and logout through the mobile menu", async () => {
    render(<AdminShell><p>Nội dung</p></AdminShell>);
    const mobile = screen.getByRole("navigation", { name: "Quản trị trên di động" });
    expect(within(mobile).getByRole("link", { name: "Bảo mật" })).toHaveAttribute("href", "/admin/settings");
    fireEvent.click(within(mobile).getByRole("button", { name: "Menu" }));
    const menu = screen.getByRole("dialog", { name: "Menu quản trị" });
    expect(within(menu).getByRole("link", { name: "Nhật ký" })).toHaveAttribute("href", "/admin/audit");
    expect(within(menu).getByRole("link", { name: "Người dùng" })).toBeInTheDocument();
    expect(within(menu).getByText("Quản trị hệ thống")).toBeInTheDocument();
    expect(within(menu).queryByText("system_admin")).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("button", { name: "Đăng xuất" }));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/login"));
    expect(logout).toHaveBeenCalledWith({ csrfToken: "csrf" });
    expect(clearPrincipalRecovery).toHaveBeenCalledWith(principal.id);
  });
  it("describes only security actions that are available on the settings screen", () => {
    render(<AdminSettingsPage/>);
    expect(screen.getByRole("heading", { name: "Bảo mật tài khoản" })).toBeInTheDocument();
    expect(screen.getByText("Xem cách xác thực và quản lý thiết bị đăng nhập của bạn.")).toBeInTheDocument();
    expect(screen.queryByText(/Quản lý mật khẩu/u)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng xuất trên mọi thiết bị" })).toBeInTheDocument();
  });

  it("does not offer system-only navigation to editors", () => {
    vi.mocked(useAdminSession).mockReturnValue({ principal: { ...principal, role: "editor" }, csrfToken: "csrf", refreshCsrf: vi.fn(), clearClientPrincipal: vi.fn() });
    render(<AdminShell><p>Nội dung</p></AdminShell>);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    const menu = screen.getByRole("dialog");
    expect(within(menu).queryByRole("link", { name: "Nhật ký" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("link", { name: "Người dùng" })).not.toBeInTheDocument();
  });
});

describe("operational vocabulary", () => {
  it("translates known terms and never echoes unrecognized internal values", () => {
    expect(adminRoleLabel("publisher")).toBe("Người công bố");
    expect(geometryLabel("MultiPolygon")).toBe("Nhiều vùng");
    expect(geometryLabel("multiline")).toBe("Nhiều đoạn đường");
    expect(revisionStatusLabel("changes_requested")).toBe("Cần chỉnh sửa");
    expect(auditActionLabel("feature.batch_synced")).toBe("Lưu các thay đổi đối tượng");
    expect(auditResourceLabel("layer_revision")).toBe("Phiên bản dữ liệu");
    expect(auditActionLabel("private.internal_code")).toBe("Hoạt động hệ thống");
    expect(adminRoleLabel("internal_role")).toBe("Người dùng nội bộ");
  });
});
