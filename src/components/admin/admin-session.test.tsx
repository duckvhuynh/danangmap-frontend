import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminErrorNotice, AdminSessionProvider, useAdminSession } from "./admin-session";
import { acquireCsrfToken, AdminApiError, getAdminSession, type AdminPrincipal } from "@/lib/api/admin";

vi.mock("@/lib/api/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/admin")>()),
  acquireCsrfToken: vi.fn(),
  getAdminSession: vi.fn(),
}));

const principal: AdminPrincipal = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "editor@example.gov.vn",
  username: "editor01",
  displayName: "Editor 01",
  role: "editor",
  status: "active",
  mfaEnabled: true,
  mustChangePassword: false,
};
const initialCsrfToken = "I".repeat(32);
const nextSessionCsrfToken = "N".repeat(32);

function SessionProbe() {
  const session = useAdminSession();
  return <div>
    <output data-testid="session-value">{session.principal.id}:{session.csrfToken}</output>
    <button type="button" onClick={() => { void session.refreshCsrf(); }}>Refresh CSRF</button>
    <button type="button" onClick={session.clearClientPrincipal}>End client session</button>
  </div>;
}

beforeEach(() => {
  vi.mocked(getAdminSession).mockResolvedValue(principal);
  vi.mocked(acquireCsrfToken).mockResolvedValue(initialCsrfToken);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("admin trust-state feedback", () => {
  it.each([
    [401, "Phiên đăng nhập đã hết hạn"],
    [403, "không có quyền"],
    [409, "Trạng thái revision đã thay đổi"],
    [412, "Dữ liệu trên máy chủ mới hơn"],
    [422, "Dữ liệu chưa hợp lệ"],
  ])("renders an explicit %i response", (status, expected) => {
    render(<AdminErrorNotice error={new AdminApiError(status, `HTTP_${status}`, "Chi tiết API", `request-${status}`)}/>);
    expect(screen.getByRole("alert")).toHaveTextContent(expected);
    expect(screen.getByRole("alert")).toHaveTextContent(`request-${status}`);
  });

  it("retains structured conflict details for recovery decisions", () => {
    render(<AdminErrorNotice error={new AdminApiError(409, "PUBLICATION_BASE_STALE", "Publication base stale.", "request-stale", { baseRevisionId: "base-revision", activeRevisionId: "active-revision" })}/>);
    fireEvent.click(screen.getByText("Chi tiết từ máy chủ"));
    expect(screen.getByRole("alert")).toHaveTextContent("base-revision");
    expect(screen.getByRole("alert")).toHaveTextContent("active-revision");
  });
});

describe("admin session CSRF refresh", () => {
  it("atomically commits the token returned after a trust-boundary transition", async () => {
    vi.mocked(acquireCsrfToken).mockResolvedValueOnce(initialCsrfToken).mockResolvedValueOnce(nextSessionCsrfToken);
    render(<AdminSessionProvider><SessionProbe/></AdminSessionProvider>);

    expect(await screen.findByTestId("session-value")).toHaveTextContent(`${principal.id}:${initialCsrfToken}`);
    fireEvent.click(screen.getByRole("button", { name: "Refresh CSRF" }));

    await waitFor(() => expect(screen.getByTestId("session-value")).toHaveTextContent(`${principal.id}:${nextSessionCsrfToken}`));
    expect(acquireCsrfToken).toHaveBeenCalledTimes(2);
  });

  it("does not revive a cleared principal when an in-flight refresh completes", async () => {
    let resolveRefresh!: (token: string) => void;
    vi.mocked(acquireCsrfToken)
      .mockResolvedValueOnce(initialCsrfToken)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    render(<AdminSessionProvider><SessionProbe/></AdminSessionProvider>);

    expect(await screen.findByTestId("session-value")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh CSRF" }));
    await waitFor(() => expect(acquireCsrfToken).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "End client session" }));
    expect(screen.getByText("Đang kết thúc phiên trên thiết bị này...")).toBeInTheDocument();

    await act(async () => { resolveRefresh(nextSessionCsrfToken); });
    expect(screen.getByText("Đang kết thúc phiên trên thiết bị này...")).toBeInTheDocument();
    expect(screen.queryByTestId("session-value")).not.toBeInTheDocument();
  });
});
