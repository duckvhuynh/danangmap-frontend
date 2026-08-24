import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NewLayerConfigurationScreen,
  type LayerConfigurationCreateTransport,
} from "./new-layer-configuration-screen";
import { useAdminSession } from "@/components/admin/admin-session";
import type { AdminPrincipal } from "@/lib/api/admin";

vi.mock("@/components/admin/admin-session", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/components/admin/admin-session")
  >()),
  useAdminSession: vi.fn(),
}));

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

const principal: AdminPrincipal = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "editor@example.gov.vn",
  username: "editor01",
  displayName: "Biên tập viên",
  role: "editor",
  status: "active",
  mfaEnabled: true,
  mustChangePassword: false,
};

let authoringMatches = true;

function transport(): LayerConfigurationCreateTransport {
  return {
    listGroups: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
  };
}

beforeEach(() => {
  authoringMatches = true;
  vi.mocked(useAdminSession).mockReturnValue({
    principal,
    csrfToken: "csrf-1",
    refreshCsrf: vi.fn(),
    clearClientPrincipal: vi.fn(),
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((media: string) => ({
      matches: authoringMatches,
      media,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("new layer configuration screen", () => {
  it("loads groups only for a desktop Editor", async () => {
    const api = transport();
    render(<NewLayerConfigurationScreen transport={api} />);
    expect(
      screen.getByRole("status", { name: "Đang tải cấu hình layer" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Tạo lớp dữ liệu" }),
    ).toBeInTheDocument();
    expect(api.listGroups).toHaveBeenCalledTimes(1);
  });

  it("navigates to the GET-backed layer configuration after create", async () => {
    const api = transport();
    vi.mocked(api.create).mockImplementation(async (configuration) => ({
      configuration: {
        ...configuration,
        layerId: "22222222-2222-4222-8222-222222222222",
        revisionId: "33333333-3333-4333-8333-333333333333",
        revisionEtag: '"revision-v1"',
        layerEtag: null,
      },
      revisionEtag: '"revision-v1"',
      layerEtag: null,
    }));
    render(<NewLayerConfigurationScreen transport={api} />);
    expect(
      await screen.findByRole("heading", { name: "Tạo lớp dữ liệu" }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Mã lớp"), {
      target: { value: "tru-so-hanh-chinh" },
    });
    fireEvent.change(screen.getByLabelText("Tên lớp"), {
      target: { value: "Trụ sở hành chính" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tạo layer" }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/admin/layers/22222222-2222-4222-8222-222222222222",
      ),
    );
  });

  it("blocks authoring on a touch-first viewport without loading catalog mutations", () => {
    authoringMatches = false;
    const api = transport();
    render(<NewLayerConfigurationScreen transport={api} />);
    expect(screen.getByText("Tạo layer cần máy tính")).toBeInTheDocument();
    expect(api.listGroups).not.toHaveBeenCalled();
  });

  it.each(["reviewer", "publisher"] as const)(
    "denies %s without loading authoring data",
    (role) => {
      vi.mocked(useAdminSession).mockReturnValue({
        principal: { ...principal, role },
        csrfToken: "csrf-1",
        refreshCsrf: vi.fn(),
        clearClientPrincipal: vi.fn(),
      });
      const api = transport();
      render(<NewLayerConfigurationScreen transport={api} />);
      expect(screen.getByText("Không có quyền tạo layer")).toBeInTheDocument();
      expect(api.listGroups).not.toHaveBeenCalled();
    },
  );

  it("loads authoring data for System Admin", async () => {
    vi.mocked(useAdminSession).mockReturnValue({
      principal: { ...principal, role: "system_admin" },
      csrfToken: "csrf-1",
      refreshCsrf: vi.fn(),
      clearClientPrincipal: vi.fn(),
    });
    const api = transport();
    render(<NewLayerConfigurationScreen transport={api} />);
    expect(
      await screen.findByRole("heading", { name: "Tạo lớp dữ liệu" }),
    ).toBeInTheDocument();
    expect(api.listGroups).toHaveBeenCalledTimes(1);
  });

  it("surfaces a durable group-loading error", async () => {
    const api = transport();
    vi.mocked(api.listGroups).mockRejectedValue(
      new Error("Không tải được nhóm lớp"),
    );
    render(<NewLayerConfigurationScreen transport={api} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không tải được nhóm lớp",
    );
  });
});
