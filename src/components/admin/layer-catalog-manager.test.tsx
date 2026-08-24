import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LayerCatalogManager,
  type LayerCatalogTransport,
} from "./layer-catalog-manager";
import { useAdminSession } from "@/components/admin/admin-session";
import { AdminApiError, type AdminPrincipal } from "@/lib/api/admin";

vi.mock("@/components/admin/admin-session", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/components/admin/admin-session")
  >()),
  useAdminSession: vi.fn(),
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

const layerPage = {
  collectionEtag: '"layers-c3"',
  items: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      slug: "wards",
      groupId: null,
      displayOrder: 10,
      defaultVisible: true,
      lockVersion: 2,
      archivedAt: null,
      revisionId: "33333333-3333-4333-8333-333333333333",
      revisionLockVersion: 4,
      title: "Ranh giới phường xã",
      status: "draft",
      geometryMode: "polygon",
      updatedAt: "2026-08-21T02:42:00.000Z",
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      slug: "offices",
      groupId: null,
      displayOrder: 20,
      defaultVisible: false,
      lockVersion: 1,
      archivedAt: null,
      revisionId: "55555555-5555-4555-8555-555555555555",
      revisionLockVersion: 1,
      title: "Trụ sở",
      status: "published",
      geometryMode: "point",
      updatedAt: "2026-08-21T02:43:00.000Z",
    },
  ],
};

const groupPage = {
  collectionEtag: '"groups-c2"',
  items: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      slug: "administration",
      title: "Hành chính",
      description: "",
      displayOrder: 10,
      defaultVisible: true,
      lockVersion: 2,
      archivedAt: null,
    },
    {
      id: "77777777-7777-4777-8777-777777777777",
      slug: "transport",
      title: "Giao thông",
      description: "",
      displayOrder: 20,
      defaultVisible: true,
      lockVersion: 1,
      archivedAt: null,
    },
  ],
};

function transport(): LayerCatalogTransport {
  return {
    listLayers: vi.fn().mockResolvedValue(layerPage),
    listGroups: vi.fn().mockResolvedValue(groupPage),
    reorderLayers: vi
      .fn()
      .mockResolvedValue({
        updatedCount: 2,
        items: [],
        collectionEtag: '"layers-c4"',
      }),
    reorderGroups: vi
      .fn()
      .mockResolvedValue({
        updatedCount: 2,
        items: [],
        collectionEtag: '"groups-c3"',
      }),
    getGroupVersion: vi
      .fn()
      .mockResolvedValue({
        group: groupPage.items[0],
        etag: '"layer-group-v2"',
      }),
    archiveGroup: vi
      .fn()
      .mockResolvedValue({
        group: {
          ...groupPage.items[0],
          archivedAt: "2026-08-21T03:00:00.000Z",
        },
        etag: '"layer-group-v3"',
      }),
  };
}

beforeEach(() => {
  vi.mocked(useAdminSession).mockReturnValue({
    principal,
    csrfToken: "csrf-fixed",
    refreshCsrf: vi.fn(),
    clearClientPrincipal: vi.fn(),
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi
      .fn()
      .mockReturnValue({
        matches: true,
        media: "",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("layer catalog manager", () => {
  it("links catalog identity to layer configuration while revision actions keep revision identity", async () => {
    render(<LayerCatalogManager transport={transport()} />);
    const row = await screen.findByRole("row", {
      name: /Ranh giới phường xã/u,
    });
    expect(
      within(row).getByRole("link", { name: /Cấu hình/u }),
    ).toHaveAttribute(
      "href",
      "/admin/layers/22222222-2222-4222-8222-222222222222",
    );
    expect(
      within(row).getByRole("link", { name: /Biên tập/u }),
    ).toHaveAttribute(
      "href",
      "/admin/layers/33333333-3333-4333-8333-333333333333/edit",
    );
  });

  it("reuses the exact collection ETag, payload and idempotency key after an ambiguous layer reorder", async () => {
    const api = transport();
    vi.mocked(api.reorderLayers)
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockResolvedValueOnce({
        updatedCount: 2,
        items: [],
        collectionEtag: '"layers-c4"',
      });
    render(<LayerCatalogManager transport={api} />);
    const down = await screen.findByRole("button", {
      name: "Đưa layer Ranh giới phường xã xuống",
    });
    fireEvent.click(down);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "network interrupted",
    );
    fireEvent.click(down);
    await waitFor(() => expect(api.reorderLayers).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.reorderLayers).mock.calls[0]![0]).toEqual(
      vi.mocked(api.reorderLayers).mock.calls[1]![0],
    );
    expect(vi.mocked(api.reorderLayers).mock.calls[0]![1]).toEqual(
      vi.mocked(api.reorderLayers).mock.calls[1]![1],
    );
    expect(vi.mocked(api.reorderLayers).mock.calls[0]![1].etag).toBe(
      '"layers-c3"',
    );
  });

  it("fetches a group resource ETag once and preserves it for an ambiguous archive retry", async () => {
    const api = transport();
    vi.mocked(api.archiveGroup)
      .mockRejectedValueOnce(new TypeError("connection closed"))
      .mockResolvedValueOnce({
        group: {
          ...groupPage.items[0]!,
          archivedAt: "2026-08-21T03:00:00.000Z",
        },
        etag: '"layer-group-v3"',
      });
    render(<LayerCatalogManager transport={api} />);
    const card = (await screen.findByText("Hành chính")).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: "Lưu trữ" }));
    const confirm = within(card).getByRole("button", {
      name: "Xác nhận lưu trữ",
    });
    fireEvent.click(confirm);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "connection closed",
    );
    fireEvent.click(confirm);
    await waitFor(() => expect(api.archiveGroup).toHaveBeenCalledTimes(2));
    expect(api.getGroupVersion).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.archiveGroup).mock.calls[0]![1]).toEqual(
      vi.mocked(api.archiveGroup).mock.calls[1]![1],
    );
    expect(vi.mocked(api.archiveGroup).mock.calls[0]![1].etag).toBe(
      '"layer-group-v2"',
    );
  });

  it("discards an authoritative stale group version and requires refetch before a new archive attempt", async () => {
    const api = transport();
    vi.mocked(api.archiveGroup)
      .mockRejectedValueOnce(
        new AdminApiError(412, "ETAG_MISMATCH", "Nhóm đã thay đổi."),
      )
      .mockResolvedValueOnce({
        group: {
          ...groupPage.items[0]!,
          archivedAt: "2026-08-21T03:00:00.000Z",
        },
        etag: '"layer-group-v3"',
      });
    render(<LayerCatalogManager transport={api} />);
    let card = (await screen.findByText("Hành chính")).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: "Lưu trữ" }));
    const firstContextButton = within(card).getByRole("button", {
      name: "Xác nhận lưu trữ",
    });
    fireEvent.click(firstContextButton);
    const alert = await screen.findByRole("alert");
    expect(
      within(card).getByRole("button", { name: "Lưu trữ" }),
    ).toBeDisabled();
    fireEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(api.listGroups).toHaveBeenCalledTimes(2));
    card = (await screen.findByText("Hành chính")).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: "Lưu trữ" }));
    fireEvent.click(
      within(card).getByRole("button", { name: "Xác nhận lưu trữ" }),
    );
    await waitFor(() => expect(api.archiveGroup).toHaveBeenCalledTimes(2));
    expect(api.getGroupVersion).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.archiveGroup).mock.calls[1]![1].operationKey).not.toBe(
      vi.mocked(api.archiveGroup).mock.calls[0]![1].operationKey,
    );
  });

  it.each(["reviewer", "publisher"] as const)(
    "keeps catalog lifecycle controls read-only for %s",
    async (role) => {
      vi.mocked(useAdminSession).mockReturnValue({
        principal: { ...principal, role },
        csrfToken: "csrf-fixed",
        refreshCsrf: vi.fn(),
        clearClientPrincipal: vi.fn(),
      });
      render(<LayerCatalogManager transport={transport()} />);
      expect(
        (await screen.findAllByText("Ranh giới phường xã")).length,
      ).toBeGreaterThan(0);
      expect(
        screen.queryByRole("button", { name: /Đưa layer/u }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Tạo lớp" })).toBeDisabled();
    },
  );

  it("enables catalog authoring controls for System Admin", async () => {
    vi.mocked(useAdminSession).mockReturnValue({
      principal: { ...principal, role: "system_admin" },
      csrfToken: "csrf-fixed",
      refreshCsrf: vi.fn(),
      clearClientPrincipal: vi.fn(),
    });
    render(<LayerCatalogManager transport={transport()} />);
    expect(
      await screen.findByRole("link", { name: "Tạo lớp" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Đưa layer/u }).length,
    ).toBeGreaterThan(0);
  });

  it("ignores superseded catalog responses when an earlier transport resolves after abort", async () => {
    let resolveOldLayers!: (value: typeof layerPage) => void;
    let resolveOldGroups!: (value: typeof groupPage) => void;
    let layerCalls = 0;
    let groupCalls = 0;
    const archivedLayerPage = {
      collectionEtag: '"layers-c4"',
      items: [
        {
          ...layerPage.items[0]!,
          id: "88888888-8888-4888-8888-888888888888",
          title: "Layer đã lưu trữ",
          archivedAt: "2026-08-21T03:00:00.000Z",
        },
      ],
    };
    const api = transport();
    vi.mocked(api.listLayers).mockImplementation((includeArchived) => {
      layerCalls += 1;
      if (layerCalls === 1)
        return new Promise((resolve) => {
          resolveOldLayers = resolve;
        });
      return Promise.resolve(includeArchived ? archivedLayerPage : layerPage);
    });
    vi.mocked(api.listGroups).mockImplementation(() => {
      groupCalls += 1;
      if (groupCalls === 1)
        return new Promise((resolve) => {
          resolveOldGroups = resolve;
        });
      return Promise.resolve(groupPage);
    });
    render(<LayerCatalogManager transport={api} />);
    fireEvent.click(screen.getByText("Hiện mục đã lưu trữ"));
    expect(
      (await screen.findAllByText("Layer đã lưu trữ")).length,
    ).toBeGreaterThan(0);
    await act(async () => {
      resolveOldLayers({
        ...layerPage,
        items: [{ ...layerPage.items[0]!, title: "Kết quả cũ" }],
      });
      resolveOldGroups(groupPage);
    });
    expect(screen.queryByText("Kết quả cũ")).not.toBeInTheDocument();
    expect(screen.getAllByText("Layer đã lưu trữ").length).toBeGreaterThan(0);
  });
});
