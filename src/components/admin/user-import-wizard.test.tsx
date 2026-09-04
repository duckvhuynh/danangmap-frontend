import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "@/lib/api/admin";
import type { UserImportActions, UserImportJob } from "@/lib/api/user-imports";
import { MAX_USER_IMPORT_BYTES } from "@/lib/user-imports/user-import-state";
import { useAdminSession } from "./admin-session";
import { UserImportWizard } from "./user-import-wizard";

vi.mock("./admin-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin-session")>()),
  useAdminSession: vi.fn(),
}));

let desktop = true;

function installMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: desktop,
      media: "(min-width: 1024px) and (hover: hover) and (pointer: fine)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

const limits: UserImportJob["inspection"]["limits"] = { maxBytes: MAX_USER_IMPORT_BYTES, maxRows: 5_000, maxSheets: 10, maxColumns: 4, maxExpandedBytes: 52_428_800 };
const job = (status: UserImportJob["status"], overrides: Partial<UserImportJob> = {}): UserImportJob => ({
  id: "11111111-1111-4111-8111-111111111111",
  status,
  format: "csv",
  file: { name: "users.csv", sizeBytes: 120 },
  progress: ["inspected", "ready", "completed", "failed"].includes(status) ? 100 : 10,
  counts: { total: 3, valid: 2, invalid: 1, applied: status === "completed" ? 2 : 0, skipped: status === "completed" ? 1 : 0 },
  inspection: { sheets: [], selectedSheet: null, limits },
  validRowPolicy: "invite",
  failureCode: status === "failed" ? "USER_IMPORT_COLUMNS_INVALID" : null,
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
  ...overrides,
});

function actions(overrides: Partial<UserImportActions> = {}): UserImportActions {
  return {
    create: vi.fn().mockResolvedValue(job("uploaded")),
    get: vi.fn().mockResolvedValue(job("inspected")),
    validate: vi.fn().mockResolvedValue(job("validating")),
    issues: vi.fn().mockResolvedValue({
      issues: [{ id: "1", rowNumber: 4, severity: "error", code: "USER_IMPORT_EMAIL_INVALID", field: "email" }],
      meta: { requestId: "request-1", nextCursor: null, hasMore: false, limit: 100 },
    }),
    apply: vi.fn().mockResolvedValue(job("applying")),
    report: vi.fn().mockResolvedValue({
      job: job("completed"),
      issues: [{ id: "1", rowNumber: 4, severity: "error", code: "USER_IMPORT_EMAIL_INVALID", field: "email" }],
      meta: { requestId: "request-2", nextCursor: null, hasMore: false, limit: 100 },
    }),
    ...overrides,
  };
}

beforeEach(() => {
  desktop = true;
  installMatchMedia();
  vi.mocked(useAdminSession).mockReturnValue({
    principal: { id: "admin-1", email: "admin@danang.gov.vn", username: "admin", displayName: "System Admin", role: "system_admin", status: "active", mfaEnabled: true, mustChangePassword: false },
    csrfToken: "csrf-user-import",
    refreshCsrf: vi.fn(),
    clearClientPrincipal: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("System Admin user import wizard", () => {
  it("runs CSV directly through inspect, validate, issues, invite apply and report", async () => {
    const api = actions({
      get: vi.fn()
        .mockResolvedValueOnce(job("inspected"))
        .mockResolvedValueOnce(job("ready"))
        .mockResolvedValueOnce(job("completed")),
      report: vi.fn()
        .mockResolvedValueOnce({ job: job("completed"), issues: [{ id: "1", rowNumber: 4, severity: "error", code: "USER_IMPORT_EMAIL_INVALID", field: "email" }], meta: { requestId: "request-2", nextCursor: "1", hasMore: true, limit: 100 } })
        .mockResolvedValue({ job: job("completed"), issues: [{ id: "2", rowNumber: 5, severity: "error", code: "USER_IMPORT_ROLE_INVALID", field: "role" }], meta: { requestId: "request-3", nextCursor: null, hasMore: false, limit: 100 } }),
    });
    render(<UserImportWizard actions={api} pollIntervalMs={0} />);

    const fileInput = screen.getByLabelText("Chọn tệp CSV hoặc XLSX");
    expect(fileInput).toHaveClass("sr-only");
    expect(fileInput).not.toHaveClass("w-full", "h-11");
    const file = new File(["email,username,displayName,role\na@danang.gov.vn,a01,A,editor"], "users.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Chọn tệp CSV hoặc XLSX"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Tải lên và kiểm tra" }));

    expect(await screen.findByRole("heading", { name: "2. Kiểm tra danh sách đã tải lên" })).toBeInTheDocument();
    expect(screen.queryByText(/Ánh xạ/)).not.toBeInTheDocument();
    expect(api.create).toHaveBeenCalledWith(file, expect.any(String), "csrf-user-import");

    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu" }));
    expect(await screen.findByRole("heading", { name: "3. Xem kết quả kiểm tra" })).toBeInTheDocument();
    expect(api.validate).toHaveBeenCalledWith(job("ready").id, undefined, "csrf-user-import");
    expect(screen.getByRole("cell", { name: "Email chưa đúng định dạng" })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("USER_IMPORT_EMAIL_INVALID");

    fireEvent.click(screen.getByRole("checkbox", { name: /Tôi hiểu đây là thao tác tạo lời mời/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gửi 2 lời mời" }));
    expect(await screen.findByRole("heading", { name: "Đã nhập danh sách người dùng" })).toBeInTheDocument();
    expect(screen.getByText(/cần mở email và đặt mật khẩu/)).toBeInTheDocument();
    expect(api.apply).toHaveBeenCalledWith(job("ready").id, expect.any(String), "csrf-user-import");
    expect(api.report).toHaveBeenCalledWith(job("completed").id, { limit: 100 });
    fireEvent.click(screen.getByRole("button", { name: "Xem thêm báo cáo" }));
    await screen.findByRole("cell", { name: "Vai trò chưa hợp lệ" });
    expect(api.report).toHaveBeenLastCalledWith(job("completed").id, { limit: 100, cursor: "1" });

    fireEvent.change(screen.getByLabelText("Lọc nội dung cần sửa trong báo cáo"), { target: { value: "USER_IMPORT_EMAIL_INVALID" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Lọc" }).at(-1)!);
    await waitFor(() => expect(api.report).toHaveBeenLastCalledWith(job("completed").id, { limit: 100, code: "USER_IMPORT_EMAIL_INVALID" }));
  });

  it("uses only inspected XLSX sheet names and sends the selected sheet", async () => {
    const xlsx = job("inspected", { format: "xlsx", file: { name: "users.xlsx", sizeBytes: 200 }, inspection: { sheets: ["Accounts", "Archive"], selectedSheet: null, limits } });
    const api = actions({
      create: vi.fn().mockResolvedValue(job("uploaded", { format: "xlsx", file: xlsx.file })),
      get: vi.fn().mockResolvedValueOnce(xlsx).mockResolvedValueOnce(job("ready", { format: "xlsx", inspection: { ...xlsx.inspection, selectedSheet: "Accounts" } })),
    });
    render(<UserImportWizard actions={api} pollIntervalMs={0} />);
    fireEvent.change(screen.getByLabelText("Chọn tệp CSV hoặc XLSX"), { target: { files: [new File(["xlsx"], "users.xlsx")] } });
    fireEvent.click(screen.getByRole("button", { name: "Tải lên và kiểm tra" }));

    const select = await screen.findByLabelText("Trang tính cần nhập") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual(["", "Accounts", "Archive"]);
    fireEvent.change(select, { target: { value: "Accounts" } });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu" }));
    await screen.findByRole("heading", { name: "3. Xem kết quả kiểm tra" });
    expect(api.validate).toHaveBeenCalledWith(xlsx.id, "Accounts", "csrf-user-import");
  });

  it("keeps the same upload key for an ambiguous retry without persisting file bytes", async () => {
    const databasesBefore = await indexedDB.databases();
    const api = actions({
      create: vi.fn().mockRejectedValueOnce(new TypeError("network interrupted")).mockResolvedValueOnce(job("uploaded")),
      get: vi.fn().mockResolvedValue(job("inspected")),
    });
    render(<UserImportWizard actions={api} pollIntervalMs={0} />);
    const file = new File(["email,username,displayName,role"], "retry.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Chọn tệp CSV hoặc XLSX"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Tải lên và kiểm tra" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tải lên và kiểm tra" }));
    await screen.findByRole("heading", { name: "2. Kiểm tra danh sách đã tải lên" });

    const calls = vi.mocked(api.create).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]?.[1]).toBe(calls[0]?.[1]);
    expect(calls[1]?.[0]).toBe(file);
    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
    expect(await indexedDB.databases()).toEqual(databasesBefore);
  });

  it("uses one apply key across an ambiguous retry and never double-submits", async () => {
    let resolveCreate: ((value: UserImportJob) => void) | undefined;
    const pendingCreate = new Promise<UserImportJob>((resolve) => { resolveCreate = resolve; });
    const create = vi.fn().mockReturnValue(pendingCreate);
    const doubleApi = actions({ create });
    const { unmount } = render(<UserImportWizard actions={doubleApi} pollIntervalMs={0} />);
    fireEvent.change(screen.getByLabelText("Chọn tệp CSV hoặc XLSX"), { target: { files: [new File(["csv"], "users.csv")] } });
    const upload = screen.getByRole("button", { name: "Tải lên và kiểm tra" });
    fireEvent.click(upload);
    fireEvent.click(upload);
    expect(create).toHaveBeenCalledTimes(1);
    resolveCreate?.(job("uploaded"));
    await screen.findByRole("heading", { name: "2. Kiểm tra danh sách đã tải lên" });
    unmount();

    const api = actions({
      get: vi.fn().mockResolvedValueOnce(job("inspected")).mockResolvedValueOnce(job("ready")),
      apply: vi.fn().mockRejectedValueOnce(new TypeError("ambiguous apply")).mockResolvedValueOnce(job("applying")),
      report: vi.fn().mockResolvedValue({ job: job("completed"), issues: [], meta: { requestId: "r", nextCursor: null, hasMore: false, limit: 100 } }),
    });
    render(<UserImportWizard actions={api} pollIntervalMs={0} />);
    fireEvent.change(screen.getByLabelText("Chọn tệp CSV hoặc XLSX"), { target: { files: [new File(["csv"], "users.csv")] } });
    fireEvent.click(screen.getByRole("button", { name: "Tải lên và kiểm tra" }));
    await screen.findByRole("heading", { name: "2. Kiểm tra danh sách đã tải lên" });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu" }));
    await screen.findByRole("heading", { name: "3. Xem kết quả kiểm tra" });
    fireEvent.click(screen.getByRole("checkbox", { name: /Tôi hiểu đây là thao tác tạo lời mời/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gửi 2 lời mời" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Gửi 2 lời mời" }));
    await waitFor(() => expect(api.apply).toHaveBeenCalledTimes(2));
    const applyCalls = vi.mocked(api.apply).mock.calls;
    expect(applyCalls[1]?.[1]).toBe(applyCalls[0]?.[1]);
  });

  it("retries a worker apply failure with the original durable operation key", async () => {
    const api = actions({
      get: vi.fn()
        .mockResolvedValueOnce(job("inspected"))
        .mockResolvedValueOnce(job("ready"))
        .mockResolvedValueOnce(job("failed", { failureCode: "USER_IMPORT_APPLY_FAILED" }))
        .mockResolvedValueOnce(job("completed")),
      apply: vi.fn().mockResolvedValue(job("applying")),
    });
    render(<UserImportWizard actions={api} pollIntervalMs={0} />);
    fireEvent.change(screen.getByLabelText("Chọn tệp CSV hoặc XLSX"), { target: { files: [new File(["csv"], "users.csv")] } });
    fireEvent.click(screen.getByRole("button", { name: "Tải lên và kiểm tra" }));
    await screen.findByRole("heading", { name: "2. Kiểm tra danh sách đã tải lên" });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu" }));
    await screen.findByRole("heading", { name: "3. Xem kết quả kiểm tra" });
    fireEvent.click(screen.getByRole("checkbox", { name: /Tôi hiểu đây là thao tác tạo lời mời/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gửi 2 lời mời" }));
    expect(await screen.findByRole("button", { name: "Thử gửi lời mời lại" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử gửi lời mời lại" }));
    expect(await screen.findByRole("heading", { name: "Đã nhập danh sách người dùng" })).toBeInTheDocument();

    const applyCalls = vi.mocked(api.apply).mock.calls;
    expect(applyCalls).toHaveLength(2);
    expect(applyCalls[1]?.[1]).toBe(applyCalls[0]?.[1]);
  });

  it("retries a validation worker failure with the same inspected XLSX sheet", async () => {
    const xlsx = job("inspected", { format: "xlsx", file: { name: "users.xlsx", sizeBytes: 200 }, inspection: { sheets: ["Accounts", "Archive"], selectedSheet: null, limits } });
    const api = actions({
      create: vi.fn().mockResolvedValue(job("uploaded", { format: "xlsx", file: xlsx.file })),
      get: vi.fn()
        .mockResolvedValueOnce(xlsx)
        .mockResolvedValueOnce(job("failed", { format: "xlsx", failureCode: "USER_IMPORT_VALIDATE_FAILED", inspection: { ...xlsx.inspection, selectedSheet: "Accounts" } }))
        .mockResolvedValueOnce(job("ready", { format: "xlsx", inspection: { ...xlsx.inspection, selectedSheet: "Accounts" } })),
    });
    render(<UserImportWizard actions={api} pollIntervalMs={0} />);
    fireEvent.change(screen.getByLabelText("Chọn tệp CSV hoặc XLSX"), { target: { files: [new File(["xlsx"], "users.xlsx")] } });
    fireEvent.click(screen.getByRole("button", { name: "Tải lên và kiểm tra" }));
    fireEvent.change(await screen.findByLabelText("Trang tính cần nhập"), { target: { value: "Accounts" } });
    fireEvent.click(screen.getByRole("button", { name: "Kiểm tra dữ liệu" }));
    expect(await screen.findByRole("button", { name: "Thử kiểm tra lại" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Thử kiểm tra lại" }));
    await screen.findByRole("heading", { name: "3. Xem kết quả kiểm tra" });

    expect(api.validate).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.validate).mock.calls.map((call) => call[1])).toEqual(["Accounts", "Accounts"]);
  });

  it("enforces role and pointer capability gates without rendering mutations", () => {
    const api = actions();
    vi.mocked(useAdminSession).mockReturnValue({
      principal: { id: "editor-1", email: "e@danang.gov.vn", username: "editor", displayName: "Editor", role: "editor", status: "active", mfaEnabled: true, mustChangePassword: false },
      csrfToken: "csrf",
      refreshCsrf: vi.fn(),
      clearClientPrincipal: vi.fn(),
    });
    const { unmount } = render(<UserImportWizard actions={api} />);
    expect(screen.getByRole("heading", { name: "Không có quyền nhập danh sách người dùng" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Chọn tệp CSV hoặc XLSX")).not.toBeInTheDocument();
    unmount();

    vi.mocked(useAdminSession).mockReturnValue({
      principal: { id: "admin-1", email: "a@danang.gov.vn", username: "admin", displayName: "Admin", role: "system_admin", status: "active", mfaEnabled: true, mustChangePassword: false },
      csrfToken: "csrf",
      refreshCsrf: vi.fn(),
      clearClientPrincipal: vi.fn(),
    });
    desktop = false;
    render(<UserImportWizard actions={api} />);
    expect(screen.getByRole("heading", { name: "Nhập danh sách cần dùng máy tính" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Chọn tệp CSV hoặc XLSX")).not.toBeInTheDocument();
  });

  it.each([401, 403, 409, 412, 422, 429, 503])("focuses typed %s errors and preserves the selected file for a safe retry", async (status) => {
    const api = actions({ create: vi.fn().mockRejectedValue(new AdminApiError(status, `HTTP_${status}`, `Lỗi ${status}`, `request-${status}`)) });
    render(<UserImportWizard actions={api} pollIntervalMs={0} />);
    fireEvent.change(screen.getByLabelText("Chọn tệp CSV hoặc XLSX"), { target: { files: [new File(["csv"], "users.csv")] } });
    fireEvent.click(screen.getByRole("button", { name: "Tải lên và kiểm tra" }));
    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent(`request-${status}`);
    await waitFor(() => expect(alert.parentElement).toHaveFocus());
    expect(screen.getByText("users.csv")).toBeInTheDocument();
  });
});
