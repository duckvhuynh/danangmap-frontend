import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerEditor } from "./layer-editor";
import { loadRevisionBundle, type RevisionBundle } from "@/lib/api/admin";
import { desktopAuthoringQuery } from "@/lib/admin/authoring-capability";

vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="drawing-canvas" /> }));
vi.mock("@/components/admin/admin-session", () => ({
  useAdminSession: () => ({ principal: { id: "admin-1", role: "system_admin" }, csrfToken: "csrf-test" }),
  AdminErrorNotice: () => <p>Không thể tải dữ liệu</p>,
}));
vi.mock("@/lib/api/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/admin")>()),
  loadRevisionBundle: vi.fn(() => new Promise(() => {})),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function viewport(width: number) {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({
    matches: query === desktopAuthoringQuery && width >= 1024,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) });
}

function bundle(status: RevisionBundle["revision"]["status"] = "draft"): RevisionBundle {
  return {
    revision: {
      id: "revision-1", layerId: "layer-1", revisionNo: 1, status,
      title: "Lớp thử nghiệm", description: "", geometryMode: "point",
      allowedGeometryKinds: ["point"], style: {}, lockVersion: 1,
      createdBy: "admin-1", updatedAt: "2026-09-03T00:00:00.000Z",
    },
    workspace: {
      revisionId: "revision-1", layerId: "layer-1", status, serverCursor: "MQ",
      featureCount: 0, bounds: null, schemaVersion: 1, updatedAt: "2026-09-03T00:00:00.000Z",
    },
    fields: [], features: [], etag: '"rev-revision-1-v1"', truncated: false,
  };
}

describe("LayerEditor desktop-only authoring", () => {
  it("shows a review link without tools or editor data requests at 390 px even with precise input", () => {
    viewport(390);
    render(<LayerEditor revisionId="revision-1" />);
    expect(screen.getByRole("heading", { name: "Biên tập cần máy tính" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở chế độ xem / duyệt" })).toHaveAttribute("href", "/admin/layers/revision-1/review");
    expect(screen.queryByTestId("drawing-canvas")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vẽ điểm" })).not.toBeInTheDocument();
    expect(loadRevisionBundle).not.toHaveBeenCalled();
  });

  it("loads the editor for an eligible desktop", async () => {
    viewport(1440);
    render(<LayerEditor revisionId="revision-1" />);
    await waitFor(() => expect(loadRevisionBundle).toHaveBeenCalledWith("revision-1"));
    expect(screen.queryByRole("heading", { name: "Biên tập cần máy tính" })).not.toBeInTheDocument();
  });

  it("uses compact columns and constrains map status at the 1024 px authoring threshold", async () => {
    viewport(1024);
    vi.mocked(loadRevisionBundle).mockResolvedValueOnce(bundle());
    render(<LayerEditor revisionId="revision-1" />);
    const drawingTools = await screen.findByRole("navigation", { name: "Công cụ vẽ" });
    expect(drawingTools.parentElement).toHaveClass("grid-cols-[180px_52px_minmax(0,1fr)_260px]", "xl:grid-cols-[260px_52px_minmax(0,1fr)_320px]");
    expect(screen.getByTestId("drawing-canvas").parentElement).toHaveClass("min-w-0");
    expect(screen.getByRole("region", { name: "Trạng thái lưu dữ liệu" }).parentElement).toHaveClass("left-3", "right-3");
  });

  it("confirms a submitted revision and gives the next step without suggesting another draft", async () => {
    viewport(1440);
    vi.mocked(loadRevisionBundle).mockResolvedValueOnce(bundle("in_review"));
    render(<LayerEditor revisionId="revision-1" />);
    expect(await screen.findByRole("heading", { name: "Đã gửi duyệt" })).toBeInTheDocument();
    expect(screen.getByText(/Phiên bản đang chờ kiểm duyệt/u)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở chế độ xem / duyệt" })).toHaveAttribute("href", "/admin/layers/layer-1/revisions/revision-1/review");
    expect(screen.queryByRole("button", { name: "Gửi duyệt" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Tạo bản nháp mới/u)).not.toBeInTheDocument();
  });

  it("directs requested changes to the layer with its existing successor draft", async () => {
    viewport(1440);
    vi.mocked(loadRevisionBundle).mockResolvedValueOnce(bundle("changes_requested"));
    render(<LayerEditor revisionId="revision-1" />);
    expect(await screen.findByRole("heading", { name: "Cần chỉnh sửa" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mở lớp để chỉnh sửa" })).toHaveAttribute("href", "/admin/layers/layer-1");
    expect(screen.getByRole("link", { name: "Mở chế độ xem / duyệt" })).toBeInTheDocument();
    expect(screen.queryByText(/Tạo bản nháp mới/u)).not.toBeInTheDocument();
  });
});
