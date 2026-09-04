import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerEditor } from "./layer-editor";
import { loadRevisionBundle, type RevisionBundle } from "@/lib/api/admin";
import { desktopAuthoringQuery } from "@/lib/admin/authoring-capability";

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="drawing-canvas" />,
}));
vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({
    children,
    orientation,
  }: {
    children: React.ReactNode;
    orientation: string;
  }) => <div data-testid={`panel-group-${orientation}`}>{children}</div>,
  ResizablePanel: ({
    children,
    id,
  }: {
    children: React.ReactNode;
    id: string;
  }) => <div data-testid={id}>{children}</div>,
  ResizableHandle: () => <div role="separator" />,
}));
vi.mock("@/components/admin/admin-session", () => ({
  useAdminSession: () => ({
    principal: { id: "admin-1", role: "system_admin" },
    csrfToken: "csrf-test",
  }),
  AdminErrorNotice: () => <p>Không thể tải dữ liệu</p>,
}));
vi.mock("@/lib/api/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/admin")>()),
  loadRevisionBundle: vi.fn(() => new Promise(() => {})),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function viewport(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === desktopAuthoringQuery && width >= 1024,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

function bundle(
  status: RevisionBundle["revision"]["status"] = "draft",
): RevisionBundle {
  return {
    revision: {
      id: "revision-1",
      layerId: "layer-1",
      revisionNo: 1,
      status,
      title: "Lớp thử nghiệm",
      description: "",
      geometryMode: "point",
      allowedGeometryKinds: ["point"],
      style: {},
      lockVersion: 1,
      createdBy: "admin-1",
      updatedAt: "2026-09-03T00:00:00.000Z",
    },
    workspace: {
      revisionId: "revision-1",
      layerId: "layer-1",
      status,
      serverCursor: "MQ",
      featureCount: 0,
      bounds: null,
      schemaVersion: 1,
      updatedAt: "2026-09-03T00:00:00.000Z",
    },
    fields: [],
    features: [],
    etag: '"rev-revision-1-v1"',
    truncated: false,
  };
}

describe("LayerEditor desktop-only authoring", () => {
  it("shows a review link without tools or editor data requests at 390 px even with precise input", () => {
    viewport(390);
    render(<LayerEditor revisionId="revision-1" />);
    expect(
      screen.getByRole("heading", { name: "Mở trình biên tập trên máy tính" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Xem dữ liệu" }),
    ).toHaveAttribute("href", "/admin/layers/revision-1/review");
    expect(screen.queryByTestId("drawing-canvas")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Vẽ điểm" }),
    ).not.toBeInTheDocument();
    expect(loadRevisionBundle).not.toHaveBeenCalled();
  });

  it("loads the editor for an eligible desktop", async () => {
    viewport(1440);
    render(<LayerEditor revisionId="revision-1" />);
    await waitFor(() =>
      expect(loadRevisionBundle).toHaveBeenCalledWith("revision-1"),
    );
    expect(
      screen.queryByRole("heading", {
        name: "Mở trình biên tập trên máy tính",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps the map primary with floating tools and collapsible panels at the desktop threshold", async () => {
    viewport(1024);
    vi.mocked(loadRevisionBundle).mockResolvedValueOnce(bundle());
    render(<LayerEditor revisionId="revision-1" />);
    const drawingTools = await screen.findByRole("navigation", {
      name: "Công cụ vẽ",
    });
    expect(drawingTools).toHaveClass("absolute", "left-3", "top-3");
    expect(screen.getByTestId("map-workspace")).toContainElement(
      screen.getByTestId("drawing-canvas"),
    );
    expect(
      screen.getByRole("button", { name: "Mở bảng dữ liệu" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("link", { name: "Nhập dữ liệu" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Lưu lên máy chủ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Gửi duyệt" }),
    ).toBeInTheDocument();
  });

  it("keeps the object list closed by default and can toggle it from the map", async () => {
    viewport(1440);
    vi.mocked(loadRevisionBundle).mockResolvedValueOnce(bundle());
    render(<LayerEditor revisionId="revision-1" />);
    await screen.findByRole("navigation", { name: "Công cụ vẽ" });
    expect(screen.queryByTestId("feature-list")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Mở danh sách đối tượng" }),
    );
    expect(screen.getByTestId("feature-list")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Thu gọn danh sách đối tượng" }),
    );
    expect(screen.queryByTestId("feature-list")).not.toBeInTheDocument();
  });

  it("confirms a submitted revision and gives the next step without suggesting another draft", async () => {
    viewport(1440);
    vi.mocked(loadRevisionBundle).mockResolvedValueOnce(bundle("in_review"));
    render(<LayerEditor revisionId="revision-1" />);
    expect(
      await screen.findByRole("heading", { name: "Đã gửi duyệt" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Phiên bản đang chờ kiểm duyệt/u),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Mở chế độ xem và duyệt" }),
    ).toHaveAttribute(
      "href",
      "/admin/layers/layer-1/revisions/revision-1/review",
    );
    expect(
      screen.queryByRole("button", { name: "Gửi duyệt" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Tạo bản nháp mới/u)).not.toBeInTheDocument();
  });

  it("directs requested changes to the layer with its existing successor draft", async () => {
    viewport(1440);
    vi.mocked(loadRevisionBundle).mockResolvedValueOnce(
      bundle("changes_requested"),
    );
    render(<LayerEditor revisionId="revision-1" />);
    expect(
      await screen.findByRole("heading", { name: "Cần chỉnh sửa" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Mở lớp để chỉnh sửa" }),
    ).toHaveAttribute("href", "/admin/layers/layer-1");
    expect(
      screen.getByRole("link", { name: "Mở chế độ xem và duyệt" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Tạo bản nháp mới/u)).not.toBeInTheDocument();
  });
});
