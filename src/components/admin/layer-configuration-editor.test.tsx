import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LayerConfigurationEditor } from "./layer-configuration-editor";
import { AdminApiError, type AdminRole } from "@/lib/api/admin";
import { createEmptyLayerConfiguration, type LayerConfigurationActions, type LayerConfigurationDraft, type LayerGroupOption } from "@/lib/layers/layer-configuration-state";

const groups: LayerGroupOption[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "administration",
    title: "Hành chính",
    description: "Cơ quan hành chính",
    displayOrder: 10,
    defaultVisible: true,
    archivedAt: null,
  },
];

function initialConfiguration() {
  const draft = createEmptyLayerConfiguration();
  draft.fields[0] = { ...draft.fields[0]!, clientId: "field-name", displayOrder: 10 };
  return draft;
}

function savedConfiguration(configuration: LayerConfigurationDraft) {
  return {
    configuration: {
      ...configuration,
      layerId: "22222222-2222-4222-8222-222222222222",
      revisionId: "33333333-3333-4333-8333-333333333333",
      etag: '"layer-v1"',
    },
    etag: '"layer-v1"',
  };
}

function renderEditor(actions: LayerConfigurationActions, role: AdminRole = "editor", canAuthor = true) {
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

function enterRequiredOverview() {
  fireEvent.change(screen.getByLabelText("Mã lớp"), { target: { value: "tru-so-hanh-chinh" } });
  fireEvent.change(screen.getByLabelText("Tên lớp"), { target: { value: "Trụ sở hành chính" } });
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("layer configuration editor", () => {
  it("creates a mixed Point, Polygon and circle draft with grouped catalog, private schema and popup style", async () => {
    const save = vi.fn<LayerConfigurationActions["save"]>(async (configuration) => savedConfiguration(configuration));
    renderEditor({ save });

    expect(screen.queryByText("Sửa cấu hình cần máy tính")).not.toBeInTheDocument();
    enterRequiredOverview();
    fireEvent.click(screen.getByLabelText("Nhóm lớp"));
    fireEvent.click(await screen.findByRole("option", { name: "Hành chính" }));
    fireEvent.change(screen.getByLabelText("Thứ tự catalog"), { target: { value: "20" } });

    fireEvent.click(screen.getByRole("tab", { name: "Geometry" }));
    fireEvent.click(screen.getByRole("radio", { name: /Mixed/ }));
    fireEvent.click(screen.getByLabelText("LineString"));
    fireEvent.click(screen.getByLabelText(/Circle, tâm Point/));

    fireEvent.click(screen.getByRole("tab", { name: "Schema" }));
    fireEvent.click(screen.getByRole("button", { name: "Thêm trường" }));
    const keyInputs = screen.getAllByLabelText("Key");
    const labelInputs = screen.getAllByLabelText("Nhãn tiếng Việt");
    fireEvent.change(keyInputs[1]!, { target: { value: "internal_note" } });
    fireEvent.change(labelInputs[1]!, { target: { value: "Ghi chú nội bộ" } });
    fireEvent.click(screen.getAllByLabelText("Công khai")[1]!);

    fireEvent.click(screen.getByRole("tab", { name: "Hiển thị" }));
    fireEvent.change(screen.getByLabelText("Màu điểm"), { target: { value: "#0B57D0" } });
    fireEvent.click(screen.getByLabelText("Hiển thị tọa độ"));
    fireEvent.click(screen.getByRole("button", { name: "Tạo layer" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const configuration = save.mock.calls[0]![0];
    expect(configuration).toMatchObject({
      slug: "tru-so-hanh-chinh",
      groupId: groups[0]!.id,
      displayOrder: 20,
      geometryMode: "mixed",
      allowedGeometryKinds: ["point", "polygon", "circle"],
      style: { pointColor: "#0B57D0" },
      popupConfig: { titleField: "name", fieldKeys: ["name"], showCoordinates: true },
    });
    expect(configuration.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "name", public: true, searchable: true }),
      expect.objectContaining({ key: "internal_note", public: false, searchable: false, filterable: false }),
    ]));
    expect(screen.getByText("Đã tạo layer và draft cấu hình.")).toBeInTheDocument();
  });

  it("reuses the same idempotency key when an ambiguous create attempt is retried", async () => {
    const save = vi.fn<LayerConfigurationActions["save"]>()
      .mockRejectedValueOnce(new TypeError("network interrupted"))
      .mockImplementationOnce(async (configuration) => savedConfiguration(configuration));
    renderEditor({ save });
    enterRequiredOverview();

    fireEvent.click(screen.getByRole("button", { name: "Tạo layer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("network interrupted");
    fireEvent.click(screen.getByRole("button", { name: "Tạo layer" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![1].operationKey).toBe(save.mock.calls[0]![1].operationKey);
    expect(save.mock.calls[0]![1].operationKey).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it.each([
    [new AdminApiError(409, "SLUG_CONFLICT", "Mã lớp đã được sử dụng.", "req-409"), "Mã lớp đã tồn tại", "req-409"],
    [new AdminApiError(422, "SCHEMA_VIOLATION", "Geometry không tương thích.", "req-422"), "Cấu hình chưa hợp lệ", "req-422"],
  ])("keeps exact API problem context for %s", async (problem, heading, requestId) => {
    const save = vi.fn<LayerConfigurationActions["save"]>().mockRejectedValue(problem);
    renderEditor({ save });
    enterRequiredOverview();
    fireEvent.click(screen.getByRole("button", { name: "Tạo layer" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(heading)).toBeInTheDocument();
    expect(alert).toHaveTextContent(problem.message);
    expect(alert).toHaveTextContent(requestId);
  });

  it.each(["reviewer", "publisher", "system_admin"] as const)("denies create authoring to %s", (role) => {
    const save = vi.fn<LayerConfigurationActions["save"]>();
    renderEditor({ save }, role, true);
    expect(screen.getByRole("heading", { name: "Không có quyền tạo layer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tạo layer" })).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("makes an Editor read-only when desktop pointer capability is absent", () => {
    const save = vi.fn<LayerConfigurationActions["save"]>();
    renderEditor({ save }, "editor", false);
    expect(screen.getByText("Tạo layer cần máy tính")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mã lớp")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tạo layer" })).not.toBeInTheDocument();
  });
});
