import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportWizard } from "./import-wizard";
import { loadRevisionBundle, type RevisionBundle } from "@/lib/api/admin";
import { applySpatialImport, createSpatialImport, getSpatialImport, listSpatialImportIssues, saveSpatialImportMappingDraft, validateSpatialImport } from "@/lib/api/imports";

vi.mock("@/lib/api/admin", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api/admin")>()), loadRevisionBundle: vi.fn() }));
vi.mock("@/lib/api/imports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/imports")>()),
  createSpatialImport: vi.fn(),
  getSpatialImport: vi.fn(),
  saveSpatialImportMappingDraft: vi.fn(),
  validateSpatialImport: vi.fn(),
  listSpatialImportIssues: vi.fn(),
  applySpatialImport: vi.fn(),
}));

const revisionId = "11111111-1111-4111-8111-111111111111";
const importId = "22222222-2222-4222-8222-222222222222";
const inspection = { parserStatus: "inspected" as const, sheets: [], limits: { maxRecords: 100_000, maxVerticesPerFeature: 100_000, maxVerticesPerJob: 2_000_000, maxExpandedBytes: 262_144_000, maxIssues: 20_000 } };
const baseJob = { id: importId, revisionId, format: "csv" as const, mode: "append" as const, file: { name: "data.csv", sizeBytes: 40 }, progress: 5, counts: {}, inspection, canApplyWithSkipInvalid: false };
const bundle: RevisionBundle = {
  revision: { id: revisionId, layerId: "layer-1", revisionNo: 4, status: "draft", title: "Trụ sở", description: "", geometryMode: "point", allowedGeometryKinds: ["point"], style: {}, lockVersion: 1, createdBy: "editor-1", updatedAt: "2026-08-21T00:00:00.000Z" },
  fields: [{ key: "name", label: "Tên", type: "text", required: true, sensitive: false, offlineCache: true }],
  workspace: { revisionId, layerId: "layer-1", status: "draft", serverCursor: "1", featureCount: 0, bounds: [108, 16, 108.3, 16.3], schemaVersion: 1, updatedAt: "2026-08-21T00:00:00.000Z" },
  features: [], etag: '"rev-v1"', truncated: false,
};

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllEnvs(); window.sessionStorage.clear(); });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_DANANGMAP_DEMO_MODE", "true");
  vi.mocked(loadRevisionBundle).mockResolvedValue(bundle);
});

describe("admin import wizard", () => {
  it("runs CSV through upload, inspection, mapping, validate, issues and apply", async () => {
    vi.mocked(createSpatialImport).mockResolvedValue({ ...baseJob, status: "uploaded" });
    vi.mocked(saveSpatialImportMappingDraft).mockResolvedValue({ ...baseJob, status: "mapping_required", progress: 100 });
    vi.mocked(validateSpatialImport).mockResolvedValue({ ...baseJob, status: "validating", progress: 40 });
    vi.mocked(getSpatialImport)
      .mockResolvedValueOnce({ ...baseJob, status: "mapping_required", progress: 100 })
      .mockResolvedValueOnce({ ...baseJob, status: "ready", progress: 100, counts: { total: 3, valid: 3 }, canApplyWithSkipInvalid: false })
      .mockResolvedValueOnce({ ...baseJob, status: "completed", progress: 100, counts: { applied: 3, skipped: 0 }, canApplyWithSkipInvalid: false });
    vi.mocked(listSpatialImportIssues).mockResolvedValue({ issues: [], meta: { requestId: "request-1", nextCursor: null, hasMore: false, limit: 100 } });
    vi.mocked(applySpatialImport).mockResolvedValue({ ...baseJob, status: "applying", progress: 10 });

    render(<ImportWizard revisionId={revisionId} principalRole="editor" csrfToken="csrf-1" canAuthor/>);
    expect(await screen.findByRole("heading", { name: "Nhập dữ liệu không gian" })).toBeInTheDocument();
    const file = new File(["name,longitude,latitude\nA,108.2,16.1"], "data.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/Chọn file CSV/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /Tải lên và tiếp tục/ }));

    expect(await screen.findByRole("heading", { name: "2. Ánh xạ dữ liệu" })).toBeInTheDocument();
    expect(createSpatialImport).toHaveBeenCalledWith(revisionId, file, "csv", "append", expect.any(String), '"rev-v1"', expect.any(String), { csrfToken: "csrf-1" });
    fireEvent.click(screen.getByRole("button", { name: /Lưu và kiểm tra/ }));

    expect(await screen.findByRole("heading", { name: "4. Kiểm tra lỗi trước khi áp dụng" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Áp dụng vào revision/ }));
    expect(await screen.findByRole("heading", { name: "Nhập dữ liệu hoàn tất" })).toBeInTheDocument();
    expect(applySpatialImport).toHaveBeenCalledWith(importId, { skipInvalid: false, acknowledgedWarningCodes: [] }, '"rev-v1"', expect.any(String), { csrfToken: "csrf-1" });
    await waitFor(() => expect(window.sessionStorage.getItem(`danangmap:import:apply:${importId}`)).toBeNull());
  });

  it("shows honest capability and role gates", async () => {
    const { rerender } = render(<ImportWizard revisionId={revisionId} principalRole="editor" csrfToken="csrf-1" canAuthor={false}/>);
    expect(screen.getByRole("heading", { name: "Nhập dữ liệu cần máy tính" })).toBeInTheDocument();
    rerender(<ImportWizard revisionId={revisionId} principalRole="reviewer" csrfToken="csrf-1" canAuthor/>);
    expect(screen.getByRole("heading", { name: "Không có quyền nhập dữ liệu" })).toBeInTheDocument();
  });

  it("reuses upload operation keys only while retrying the same ambiguous attempt", async () => {
    vi.mocked(createSpatialImport).mockRejectedValueOnce(new TypeError("network interrupted")).mockResolvedValueOnce({ ...baseJob, status: "uploaded" });
    vi.mocked(getSpatialImport).mockResolvedValue({ ...baseJob, status: "mapping_required", progress: 100 });
    render(<ImportWizard revisionId={revisionId} principalRole="editor" csrfToken="csrf-1" canAuthor/>);
    await screen.findByRole("heading", { name: "Nhập dữ liệu không gian" });
    const file = new File(["name,longitude,latitude\nA,108.2,16.1"], "retry.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/Chọn file CSV/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /Tải lên và tiếp tục/ }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: /Tải lên và tiếp tục/ }));
    await screen.findByRole("heading", { name: "2. Ánh xạ dữ liệu" });
    const first = vi.mocked(createSpatialImport).mock.calls[0];
    const retry = vi.mocked(createSpatialImport).mock.calls[1];
    expect(retry[4]).toBe(first[4]);
    expect(retry[6]).toBe(first[6]);
    expect(Object.keys(window.sessionStorage).some((key) => key.startsWith("danangmap:import:upload:"))).toBe(false);
  });

  it("selects XLSX sheets only from the inspected backend job", async () => {
    vi.mocked(createSpatialImport).mockResolvedValue({ ...baseJob, format: "xlsx", status: "uploaded", file: { name: "layers.xlsx", sizeBytes: 12 }, inspection: { ...inspection, parserStatus: "pending", sheets: [] } });
    vi.mocked(getSpatialImport).mockResolvedValue({ ...baseJob, format: "xlsx", status: "mapping_required", progress: 100, file: { name: "layers.xlsx", sizeBytes: 12 }, inspection: { ...inspection, sheets: ["Dữ liệu", "Danh mục"] } });
    render(<ImportWizard revisionId={revisionId} principalRole="editor" csrfToken="csrf-1" canAuthor/>);
    await screen.findByRole("heading", { name: "Nhập dữ liệu không gian" });
    fireEvent.change(screen.getByLabelText(/Chọn file CSV/), { target: { files: [new File(["xlsx"], "layers.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Tải lên và tiếp tục/ }));
    await screen.findByRole("heading", { name: "2. Ánh xạ dữ liệu" });
    const sheet = screen.getByLabelText("Tên sheet") as HTMLSelectElement;
    expect(sheet.value).toBe("Dữ liệu");
    expect(Array.from(sheet.options).map((option) => option.value)).toEqual(["", "Dữ liệu", "Danh mục"]);
  });

  it.each([["failed", "Phiên nhập chưa thể hoàn tất"], ["cancelled", "Phiên nhập đã bị hủy"]] as const)("turns terminal %s polling into an actionable state", async (status, heading) => {
    window.sessionStorage.setItem(`danangmap:import:apply:${importId}`, "55555555-5555-4555-8555-555555555555");
    vi.mocked(createSpatialImport).mockResolvedValue({ ...baseJob, status: "uploaded" });
    vi.mocked(getSpatialImport).mockResolvedValueOnce({ ...baseJob, status: "mapping_required", progress: 100 }).mockResolvedValueOnce({ ...baseJob, status, progress: 100, failureCode: status === "failed" ? "GEOMETRY_INVALID" : null });
    vi.mocked(saveSpatialImportMappingDraft).mockResolvedValue({ ...baseJob, status: "mapping_required", progress: 100 });
    vi.mocked(validateSpatialImport).mockResolvedValue({ ...baseJob, status: "validating", progress: 40 });
    render(<ImportWizard revisionId={revisionId} principalRole="editor" csrfToken="csrf-1" canAuthor/>);
    await screen.findByRole("heading", { name: "Nhập dữ liệu không gian" });
    fireEvent.change(screen.getByLabelText(/Chọn file CSV/), { target: { files: [new File(["csv"], "terminal.csv", { type: "text/csv" })] } });
    fireEvent.click(screen.getByRole("button", { name: /Tải lên và tiếp tục/ }));
    await screen.findByRole("heading", { name: "2. Ánh xạ dữ liệu" });
    fireEvent.click(screen.getByRole("button", { name: /Lưu và kiểm tra/ }));
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Về trình biên tập/ }).length).toBeGreaterThan(0);
    expect(window.sessionStorage.getItem(`danangmap:import:apply:${importId}`)).toBeNull();
  });

  it("keeps a changes-requested predecessor immutable", async () => {
    vi.mocked(loadRevisionBundle).mockResolvedValue({ ...bundle, revision: { ...bundle.revision, status: "changes_requested" } });
    render(<ImportWizard revisionId={revisionId} principalRole="editor" csrfToken="csrf-1" canAuthor/>);
    expect(await screen.findByRole("heading", { name: "Revision không thể nhập dữ liệu" })).toBeInTheDocument();
  });
});
