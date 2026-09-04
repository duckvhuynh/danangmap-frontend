import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "@/lib/api/admin";
import type { HistoryResource, RevisionDiff } from "@/lib/api/history";
import { RevisionDiffView, type RevisionDiffTransport } from "./revision-diff-view";

const revisionId = "11111111-1111-4111-8111-111111111111";
const layerId = "22222222-2222-4222-8222-222222222222";

function diffResource(overrides: Partial<RevisionDiff> = {}): HistoryResource<RevisionDiff> {
  return {
    historyEtag: '"history-diff-1"',
    data: {
      revisionId,
      layerId,
      comparison: "parent",
      baseRevisionId: "33333333-3333-4333-8333-333333333333",
      geometry: { currentFeatureCount: 3, baseFeatureCount: 2, added: 1, removed: 1, modified: 1 },
      properties: { featuresModified: 1, publicFieldKeysChanged: ["name"] },
      attachments: { available: true, featuresModified: 1, added: 1, removed: 1, reordered: 1, redactedChangeCount: 1 },
      schema: { publicFieldsAdded: [], publicFieldsRemoved: [], publicFieldsChanged: [], redactedChangeCount: 1 },
      entries: [{
        featureId: "44444444-4444-4444-8444-444444444444",
        changeType: "modified",
        geometry: {
          changed: true,
          beforeKind: "polygon",
          afterKind: "circle",
          beforeRadiusM: null,
          afterRadiusM: 125,
          beforePreview: { type: "Polygon", coordinates: [[[108.1, 16], [108.2, 16], [108.2, 16.1], [108.1, 16]]], privateNote: "không được hiển thị" },
          afterPreview: { type: "Point", coordinates: [108.15, 16.05], privateNote: "không được hiển thị" },
          beforePreviewMode: "bbox",
          afterPreviewMode: "exact",
          beforeBounds: [108.1, 16, 108.2, 16.1],
          afterBounds: [108.15, 16.05, 108.15, 16.05],
        },
        properties: { before: { name: "Cũ" }, after: { name: "Mới" }, changedKeys: ["name"] },
        attachments: {
          available: true,
          changed: true,
          added: [{ id: "77777777-7777-4777-8777-777777777771", fieldKey: "documents", displayOrder: 2, fileName: "quyet-dinh-moi.pdf", contentType: "application/pdf", sizeBytes: 12_800, status: "clean" }],
          removed: [{ id: "77777777-7777-4777-8777-777777777772", fieldKey: "documents", displayOrder: 1, fileName: "quyet-dinh-cu.pdf", contentType: "application/pdf", sizeBytes: 10_240, status: "clean" }],
          reordered: [{ id: "77777777-7777-4777-8777-777777777773", fieldKey: "documents", fileName: "ban-do.pdf", beforeDisplayOrder: 0, afterDisplayOrder: 1 }],
          redactedChange: true,
        },
        redactedChange: true,
      }],
      nextCursor: "opaque:diff:page:2/+==",
      hasMore: true,
      limit: 25,
      ...overrides,
    },
  };
}

afterEach(cleanup);

describe("revision diff view", () => {
  it("renders safe geometry, typed attachment changes and private redaction", async () => {
    const second = diffResource({ entries: [{ ...diffResource().data.entries[0]!, featureId: "55555555-5555-4555-8555-555555555555", changeType: "added" }], nextCursor: null, hasMore: false });
    const load = vi.fn().mockResolvedValueOnce(diffResource()).mockResolvedValueOnce(second);
    render(<RevisionDiffView revisionId={revisionId} transport={{ load } as RevisionDiffTransport}/>);

    const attachmentSummary = await screen.findByRole("region", { name: "Thay đổi tệp đính kèm" });
    expect(attachmentSummary).toHaveTextContent("1 thay đổi đã ẩn");
    expect(attachmentSummary).toHaveTextContent("Đối tượng có thay đổi1");
    expect(screen.getByText("quyet-dinh-moi.pdf")).toBeInTheDocument();
    expect(screen.getByText("quyet-dinh-cu.pdf")).toBeInTheDocument();
    expect(screen.getByText("ban-do.pdf")).toBeInTheDocument();
    expect(screen.getByText(/vị trí 1 → 2/u)).toBeInTheDocument();
    expect(screen.getByText(/thay đổi tệp riêng tư đã được ẩn/u)).toBeInTheDocument();
    expect(screen.queryByText(/objectKey|checksum|ownerId/u)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Hình học trước thay đổi" })).toHaveTextContent("Khung giới hạn");
    expect(screen.getByRole("region", { name: "Hình học sau thay đổi" })).toHaveTextContent("Hình học chính xác");
    expect(screen.getByRole("region", { name: "Hình học sau thay đổi" })).toHaveTextContent("Bán kính 125 m");
    expect(screen.getByLabelText("Tọa độ trước thay đổi")).toHaveTextContent('"type": "BBox"');
    expect(screen.getByLabelText("Tọa độ trước thay đổi")).toHaveTextContent("108.1");
    expect(screen.getByLabelText("Tọa độ sau thay đổi")).toHaveTextContent('"type": "Point"');
    expect(screen.getByLabelText("Tọa độ sau thay đổi")).toHaveTextContent("108.15");
    expect(screen.queryByText(/không được hiển thị/u)).not.toBeInTheDocument();
    expect(screen.getByText("Có thay đổi đã ẩn")).toBeInTheDocument();
    expect(screen.getByText("Thông tin công khai sau")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Xem thêm đối tượng thay đổi" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load.mock.calls[0]![1].compareTo).toBe("parent");
    expect(load.mock.calls[1]![1].cursor).toBe("opaque:diff:page:2/+==");
    expect((await screen.findAllByText("Đã thêm")).length).toBeGreaterThan(1);
  });

  it("renders an explicit feature empty state with zero attachment summary", async () => {
    const load = vi.fn().mockResolvedValue(diffResource({ entries: [], nextCursor: null, hasMore: false }));
    render(<RevisionDiffView revisionId={revisionId} transport={{ load } as RevisionDiffTransport}/>);
    expect(await screen.findByText("Không có thay đổi đối tượng")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Thay đổi tệp đính kèm" })).toBeInTheDocument();
  });

  it("does not expose technical history tokens in the review UI", async () => {
    const resource = diffResource({ entries: [], nextCursor: null, hasMore: false });
    resource.historyEtag = `"history-${"a".repeat(64)}"`;
    const load = vi.fn().mockResolvedValue(resource);
    render(<RevisionDiffView revisionId={revisionId} transport={{ load } as RevisionDiffTransport}/>);

    await screen.findByText("Không có thay đổi đối tượng");
    expect(screen.queryByText(resource.historyEtag)).not.toBeInTheDocument();
  });

  it("renders only public schema keys and an aggregate redaction count independent of entry flags", async () => {
    const entry = { ...diffResource().data.entries[0]!, redactedChange: false };
    const load = vi.fn().mockResolvedValue(diffResource({
      schema: {
        publicFieldsAdded: ["address"],
        publicFieldsRemoved: ["legacy_code"],
        publicFieldsChanged: ["name"],
        redactedChangeCount: 3,
      },
      entries: [entry],
      nextCursor: null,
      hasMore: false,
    }));
    render(<RevisionDiffView revisionId={revisionId} fieldLabels={{ address: "Địa chỉ", name: "Tên" }} transport={{ load } as RevisionDiffTransport}/>);

    const schema = (await screen.findByText("Thay đổi trường thông tin công khai")).closest("section")!;
    expect(within(schema).getByText("Địa chỉ")).toBeInTheDocument();
    expect(within(schema).getByText("legacy_code")).toBeInTheDocument();
    expect(within(schema).getByText("Tên")).toBeInTheDocument();
    expect(schema).toHaveTextContent("3 thay đổi đã ẩn");
    expect(screen.queryByText("Có thay đổi đã ẩn")).not.toBeInTheDocument();
  });

  it("announces loaded diff results and supports roving keyboard navigation between entries", async () => {
    const first = diffResource().data.entries[0]!;
    const second = {
      ...first,
      featureId: "55555555-5555-4555-8555-555555555555",
      changeType: "added" as const,
    };
    const load = vi.fn()
      .mockResolvedValueOnce(diffResource({
        entries: [first, second],
        nextCursor: null,
        hasMore: false,
      }))
      .mockResolvedValueOnce(diffResource({
        entries: [first],
        nextCursor: null,
        hasMore: false,
      }));
    const view = render(<RevisionDiffView revisionId={revisionId} transport={{ load } as RevisionDiffTransport}/>);

    expect((await screen.findAllByText("Có thay đổi đã ẩn")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Dùng phím mũi tên lên và xuống/u)).toBeInTheDocument();
    expect(screen.getByText("Đã tải 2 đối tượng thay đổi so với phiên bản trước.")).toHaveAttribute("aria-live", "polite");

    const entries = screen.getAllByRole("article");
    expect(entries[0]).toHaveAccessibleName(/mục 1 trên 2/u);
    expect(entries[1]).toHaveAccessibleName(/mục 2 trên 2/u);
    expect(entries[0]).toHaveAttribute("tabindex", "0");
    expect(entries[1]).toHaveAttribute("tabindex", "-1");
    entries[0]!.focus();
    fireEvent.keyDown(entries[0]!, { key: "ArrowDown" });
    expect(entries[1]).toHaveFocus();
    expect(entries[0]).toHaveAttribute("tabindex", "-1");
    expect(entries[1]).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(entries[1]!, { key: "Home" });
    expect(entries[0]).toHaveFocus();
    fireEvent.keyDown(entries[0]!, { key: "End" });
    expect(entries[1]).toHaveFocus();
    fireEvent.keyDown(entries[1]!, { key: "ArrowUp" });
    expect(entries[0]).toHaveFocus();
    fireEvent.keyDown(entries[0]!, { key: "ArrowDown" });
    expect(entries[1]).toHaveAttribute("tabindex", "0");

    view.rerender(<RevisionDiffView revisionId="66666666-6666-4666-8666-666666666666" transport={{ load } as RevisionDiffTransport}/>);
    await waitFor(() => {
      const reloadedEntries = screen.getAllByRole("article");
      expect(reloadedEntries).toHaveLength(1);
      expect(reloadedEntries[0]).toHaveAttribute("tabindex", "0");
    });
  });

  it("preserves bounded DIFF_TOO_LARGE details in the typed error state", async () => {
    const load = vi.fn().mockRejectedValue(new AdminApiError(422, "DIFF_TOO_LARGE", "Diff too large.", "request-diff", { maxFeatures: 5000, currentFeatures: 6200 }));
    render(<RevisionDiffView revisionId={revisionId} transport={{ load } as RevisionDiffTransport}/>);
    expect(await screen.findByText("Có quá nhiều thay đổi để so sánh cùng lúc")).toBeInTheDocument();
    expect(screen.queryByText(/maxFeatures|currentFeatures/u)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeInTheDocument();
    expect(screen.queryByText("50%")).not.toBeInTheDocument();
  });
});
