import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LayerConfigurationEditor } from "./layer-configuration-editor";
import { AdminApiError, adminErrorMessage, type AdminRole } from "@/lib/api/admin";
import {
  createEmptyLayerConfiguration,
  type LayerConfigurationActions,
  type LayerConfigurationDraft,
  type LayerGroupOption,
} from "@/lib/layers/layer-configuration-state";

const groups: LayerGroupOption[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "administration",
    title: "Hành chính",
    description: "Cơ quan hành chính",
    displayOrder: 10,
    defaultVisible: true,
    lockVersion: 1,
    archivedAt: null,
  },
];

function initialConfiguration() {
  const draft = createEmptyLayerConfiguration();
  draft.fields[0] = {
    ...draft.fields[0]!,
    clientId: "field-name",
    displayOrder: 10,
  };
  return draft;
}

function savedConfiguration(configuration: LayerConfigurationDraft) {
  return {
    configuration: {
      ...configuration,
      layerId: "22222222-2222-4222-8222-222222222222",
      revisionId: "33333333-3333-4333-8333-333333333333",
      revisionEtag: '"revision-v1"',
      layerEtag: '"layer-v1"',
    },
    revisionEtag: '"revision-v1"',
    layerEtag: '"layer-v1"',
  };
}

function renderEditor(
  actions: LayerConfigurationActions,
  role: AdminRole = "editor",
  canAuthor = true,
) {
  return render(
    <LayerConfigurationEditor
      initial={initialConfiguration()}
      groups={groups}
      principalRole={role}
      canAuthor={canAuthor}
      actions={actions}
      mode="create"
    />,
  );
}

function editConfiguration(status = "draft") {
  const draft = initialConfiguration();
  draft.layerId = "22222222-2222-4222-8222-222222222222";
  draft.revisionId = "33333333-3333-4333-8333-333333333333";
  draft.layerEtag = '"layer-v7"';
  draft.revisionEtag = '"revision-v4"';
  draft.revisionStatus = status;
  draft.slug = "tru-so-hanh-chinh";
  draft.title = "Trụ sở hành chính";
  return draft;
}

function renderEdit(
  actions: LayerConfigurationActions,
  status = "draft",
  onReload?: () => void,
) {
  return render(
    <LayerConfigurationEditor
      initial={editConfiguration(status)}
      groups={groups}
      principalRole="editor"
      canAuthor
      actions={actions}
      onReload={onReload}
      mode="edit"
    />,
  );
}

function enterRequiredOverview() {
  fireEvent.change(screen.getByLabelText("Mã lớp"), {
    target: { value: "tru-so-hanh-chinh" },
  });
  fireEvent.change(screen.getByLabelText("Tên lớp"), {
    target: { value: "Trụ sở hành chính" },
  });
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("layer configuration editor", () => {
  it("uses readable configuration labels and lets users choose icons by meaning", () => {
    renderEditor({});
    expect(screen.getByText("Bản nháp")).toBeInTheDocument();
    expect(screen.queryByText("draft")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Trường dữ liệu" }));
    expect(screen.getByLabelText("Mã trường")).toBeInTheDocument();
    expect(screen.getByLabelText("Biểu tượng")).toHaveRole("combobox");
    expect(screen.queryByText("Tabler icon key")).not.toBeInTheDocument();
    expect(screen.queryByText("Schema metadata")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Hiển thị" }));
    expect(screen.getByText("Tùy chọn tải dữ liệu nâng cao").closest("details")).not.toHaveAttribute("open");
  });

  it("creates a mixed Point, Polygon and circle draft with grouped catalog, private schema and popup style", async () => {
    const create = vi.fn<NonNullable<LayerConfigurationActions["create"]>>(
      async (configuration) => savedConfiguration(configuration),
    );
    renderEditor({ create });

    expect(
      screen.queryByText("Sửa cấu hình cần máy tính"),
    ).not.toBeInTheDocument();
    enterRequiredOverview();
    fireEvent.click(screen.getByLabelText("Nhóm lớp"));
    fireEvent.click(await screen.findByRole("option", { name: "Hành chính" }));
    fireEvent.change(screen.getByLabelText("Thứ tự hiển thị"), {
      target: { value: "20" },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Loại đối tượng" }));
    fireEvent.click(screen.getByRole("radio", { name: /Kết hợp/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Đường" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Hình tròn" }));

    fireEvent.click(screen.getByRole("tab", { name: "Trường dữ liệu" }));
    fireEvent.click(screen.getByRole("button", { name: "Thêm trường" }));
    const keyInputs = screen.getAllByLabelText("Mã trường");
    const labelInputs = screen.getAllByLabelText("Tên hiển thị");
    fireEvent.change(keyInputs[1]!, { target: { value: "internal_note" } });
    fireEvent.change(labelInputs[1]!, { target: { value: "Ghi chú nội bộ" } });
    fireEvent.click(screen.getAllByLabelText("Công khai")[1]!);

    fireEvent.click(screen.getByRole("tab", { name: "Hiển thị" }));
    fireEvent.change(screen.getByLabelText("Màu điểm"), {
      target: { value: "#0B57D0" },
    });
    fireEvent.click(screen.getByLabelText("Hiển thị tọa độ"));
    fireEvent.click(screen.getByRole("button", { name: "Tạo lớp" }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const configuration = create.mock.calls[0]![0];
    expect(configuration).toMatchObject({
      slug: "tru-so-hanh-chinh",
      groupId: groups[0]!.id,
      displayOrder: 20,
      geometryMode: "mixed",
      allowedGeometryKinds: ["point", "polygon", "circle"],
      style: { pointColor: "#0B57D0" },
      popupConfig: {
        titleField: "name",
        fieldKeys: ["name"],
        showCoordinates: true,
      },
    });
    expect(configuration.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "name",
          public: true,
          searchable: true,
        }),
        expect.objectContaining({
          key: "internal_note",
          public: false,
          searchable: false,
          filterable: false,
        }),
      ]),
    );
    expect(
      await screen.findByText("Đã tạo lớp dữ liệu. Bạn có thể bắt đầu biên tập hoặc nhập dữ liệu."),
    ).toBeInTheDocument();
  });

  it("reuses the same idempotency key when an ambiguous create attempt is retried", async () => {
    const create = vi
      .fn<NonNullable<LayerConfigurationActions["create"]>>()
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockImplementationOnce(async (configuration) =>
        savedConfiguration(configuration),
      );
    renderEditor({ create });
    enterRequiredOverview();

    fireEvent.click(screen.getByRole("button", { name: "Tạo lớp" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Kiểm tra kết nối rồi thử lại.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tạo lớp" }));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1]![1].operationKey).toBe(
      create.mock.calls[0]![1].operationKey,
    );
    expect(create.mock.calls[0]![1].operationKey).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it.each([
    [
      new AdminApiError(
        409,
        "SLUG_CONFLICT",
        "Mã lớp đã được sử dụng.",
        "req-409",
      ),
      "Mã lớp đã tồn tại",
      "req-409",
    ],
    [
      new AdminApiError(
        422,
        "SCHEMA_VIOLATION",
        "Geometry không tương thích.",
        "req-422",
      ),
      "Cấu hình chưa hợp lệ",
      "req-422",
    ],
  ])(
    "keeps exact API problem context for %s",
    async (problem, heading, requestId) => {
      const create = vi
        .fn<NonNullable<LayerConfigurationActions["create"]>>()
        .mockRejectedValue(problem);
      renderEditor({ create });
      enterRequiredOverview();
      fireEvent.click(screen.getByRole("button", { name: "Tạo lớp" }));
      const alert = await screen.findByRole("alert");
      expect(within(alert).getByText(heading)).toBeInTheDocument();
      expect(alert).toHaveTextContent(adminErrorMessage(problem));
      expect(screen.getByText(`Mã hỗ trợ: ${requestId}`).closest("details")).not.toHaveAttribute("open");
    },
  );

  it.each(["reviewer", "publisher"] as const)(
    "denies create authoring to %s",
    (role) => {
      const create = vi.fn<NonNullable<LayerConfigurationActions["create"]>>();
      renderEditor({ create }, role, true);
      expect(
        screen.getByRole("heading", { name: "Không có quyền tạo lớp" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Tạo lớp" }),
      ).not.toBeInTheDocument();
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("allows System Admin to create layer configuration", () => {
    const create = vi.fn<NonNullable<LayerConfigurationActions["create"]>>();
    renderEditor({ create }, "system_admin", true);
    expect(
      screen.getByRole("button", { name: "Tạo lớp" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mã lớp")).toBeEnabled();
  });

  it("makes an Editor read-only when desktop pointer capability is absent", () => {
    const create = vi.fn<NonNullable<LayerConfigurationActions["create"]>>();
    renderEditor({ create }, "editor", false);
    expect(screen.getByText("Tạo lớp cần máy tính")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mã lớp")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Tạo lớp" }),
    ).not.toBeInTheDocument();
  });

  it("saves catalog fields with only the layer ETag", async () => {
    const updateCatalog = vi.fn<
      NonNullable<LayerConfigurationActions["updateCatalog"]>
    >(async (configuration) => ({
      configuration: { ...configuration, layerEtag: '"layer-v8"' },
      revisionEtag: configuration.revisionEtag,
      layerEtag: '"layer-v8"',
    }));
    const previewImpact =
      vi.fn<NonNullable<LayerConfigurationActions["previewImpact"]>>();
    renderEdit({ updateCatalog, previewImpact });

    fireEvent.click(screen.getByLabelText("Nhóm lớp"));
    fireEvent.click(await screen.findByRole("option", { name: "Hành chính" }));
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin chung" }));

    await waitFor(() => expect(updateCatalog).toHaveBeenCalledTimes(1));
    expect(updateCatalog.mock.calls[0]![1]).toMatchObject({
      etag: '"layer-v7"',
    });
    expect(previewImpact).not.toHaveBeenCalled();
  });

  it("runs server impact first and blocks revision replacement when feature data is incompatible", async () => {
    const previewImpact = vi
      .fn<NonNullable<LayerConfigurationActions["previewImpact"]>>()
      .mockResolvedValue({
        featureCount: 4,
        blocking: true,
        schemaVersionWillIncrement: true,
        reasons: [
          {
            code: "FIELD_REMOVAL_WITH_DATA",
            fieldKey: "name",
            geometryKind: null,
            affectedFeatures: 4,
          },
        ],
      });
    const replaceRevision =
      vi.fn<NonNullable<LayerConfigurationActions["replaceRevision"]>>();
    renderEdit({ previewImpact, replaceRevision });

    fireEvent.change(screen.getByLabelText("Tên lớp"), {
      target: { value: "Trụ sở thành phố" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu cấu hình" }));

    expect(
      await screen.findByText("Không thể áp dụng cấu hình"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Trường cần xóa đang có dữ liệu/u),
    ).toBeInTheDocument();
    expect(previewImpact).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Trụ sở thành phố" }),
      { etag: '"revision-v4"' },
    );
    expect(replaceRevision).not.toHaveBeenCalled();
  });

  it("does not auto-retry stale catalog state and exposes retained problem details before refetch", async () => {
    const onReload = vi.fn();
    const updateCatalog = vi
      .fn<NonNullable<LayerConfigurationActions["updateCatalog"]>>()
      .mockRejectedValue(
        new AdminApiError(
          412,
          "ETAG_MISMATCH",
          "Layer đã được cập nhật.",
          "request-stale",
          { expected: '"layer-v8"', received: '"layer-v7"' },
        ),
      );
    renderEdit({ updateCatalog }, "draft", onReload);
    fireEvent.click(screen.getByLabelText("Bật lớp mặc định khi mở bản đồ"));
    fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin chung" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("request-stale");
    fireEvent.click(within(alert).getByText("Thông tin hỗ trợ kỹ thuật"));
    expect(alert).not.toHaveTextContent("layer-v8");
    expect(alert).toHaveTextContent("ETAG_MISMATCH");
    expect(updateCatalog).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();
    fireEvent.click(
      within(alert).getByRole("button", { name: "Tải lại bản mới nhất" }),
    );
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(updateCatalog).toHaveBeenCalledTimes(1);
  });

  it("creates a successor from the published revision ETag", async () => {
    const createSuccessor = vi.fn<
      NonNullable<LayerConfigurationActions["createSuccessor"]>
    >(async (configuration) => ({
      configuration: {
        ...configuration,
        revisionId: "44444444-4444-4444-8444-444444444444",
        revisionStatus: "draft",
        revisionEtag: '"revision-v1"',
      },
      revisionEtag: '"revision-v1"',
      layerEtag: configuration.layerEtag,
    }));
    renderEdit({ createSuccessor }, "published");
    fireEvent.click(
      screen.getByRole("button", { name: "Tạo bản nháp mới" }),
    );
    await waitFor(() => expect(createSuccessor).toHaveBeenCalledTimes(1));
    expect(createSuccessor.mock.calls[0]![1].etag).toBe('"revision-v4"');
  });

  it("replays an ambiguous revision PUT with the same key without rerunning impact on the stale ETag", async () => {
    const previewImpact = vi
      .fn<NonNullable<LayerConfigurationActions["previewImpact"]>>()
      .mockResolvedValue({
        featureCount: 2,
        blocking: false,
        schemaVersionWillIncrement: false,
        reasons: [],
      });
    const replaceRevision = vi
      .fn<NonNullable<LayerConfigurationActions["replaceRevision"]>>()
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockImplementationOnce(async (configuration) => ({
        configuration: { ...configuration, revisionEtag: '"revision-v5"' },
        revisionEtag: '"revision-v5"',
        layerEtag: configuration.layerEtag,
      }));
    renderEdit({ previewImpact, replaceRevision });
    fireEvent.change(screen.getByLabelText("Tên lớp"), {
      target: { value: "Trụ sở thành phố" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu cấu hình" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Kiểm tra kết nối rồi thử lại.");
    fireEvent.click(screen.getByRole("button", { name: "Lưu cấu hình" }));
    await waitFor(() => expect(replaceRevision).toHaveBeenCalledTimes(2));
    expect(previewImpact).toHaveBeenCalledTimes(1);
    expect(replaceRevision.mock.calls[1]![1]).toEqual(
      replaceRevision.mock.calls[0]![1],
    );
  });

  it("keeps unsaved catalog fields dirty when archive only advances lifecycle state", async () => {
    const archive = vi.fn<NonNullable<LayerConfigurationActions["archive"]>>(
      async (configuration) => ({
        configuration: {
          ...configuration,
          archivedAt: "2026-08-21T03:00:00.000Z",
          layerEtag: '"layer-v8"',
        },
        revisionEtag: configuration.revisionEtag,
        layerEtag: '"layer-v8"',
      }),
    );
    const updateCatalog =
      vi.fn<NonNullable<LayerConfigurationActions["updateCatalog"]>>();
    renderEdit({ archive, updateCatalog });
    fireEvent.click(screen.getByLabelText("Nhóm lớp"));
    fireEvent.click(await screen.findByRole("option", { name: "Hành chính" }));
    fireEvent.change(screen.getByLabelText("Gõ “LƯU TRỮ” để xác nhận"), {
      target: { value: "LƯU TRỮ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu trữ lớp" }));
    await waitFor(() => expect(archive).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Lưu thông tin chung" })).toBeEnabled();
  });
});
