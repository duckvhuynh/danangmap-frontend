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
      attachments: { available: false, status: "unavailable", reasonCode: "ATTACHMENT_CONTRACT_PENDING" },
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
        attachments: { available: false, status: "unavailable", reasonCode: "ATTACHMENT_CONTRACT_PENDING" },
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
  it("renders safe exact and bbox previews, circle radius, redaction and attachment-unavailable state", async () => {
    const second = diffResource({ entries: [{ ...diffResource().data.entries[0]!, featureId: "55555555-5555-4555-8555-555555555555", changeType: "added" }], nextCursor: null, hasMore: false });
    const load = vi.fn().mockResolvedValueOnce(diffResource()).mockResolvedValueOnce(second);
    render(<RevisionDiffView revisionId={revisionId} transport={{ load } as RevisionDiffTransport}/>);

    expect(await screen.findByText("So sánh tệp đính kèm chưa khả dụng")).toBeInTheDocument();
    expect(screen.getAllByText("ATTACHMENT_CONTRACT_PENDING").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Hình học trước thay đổi" })).toHaveTextContent("Khung giới hạn");
    expect(screen.getByRole("region", { name: "Hình học sau thay đổi" })).toHaveTextContent("Hình học chính xác");
    expect(screen.getByRole("region", { name: "Hình học sau thay đổi" })).toHaveTextContent("Bán kính 125 m");
    expect(screen.getByLabelText("Preview geometry trước thay đổi")).toHaveTextContent('"type": "BBox"');
    expect(screen.getByLabelText("Preview geometry trước thay đổi")).toHaveTextContent("108.1");
    expect(screen.getByLabelText("Preview geometry sau thay đổi")).toHaveTextContent('"type": "Point"');
    expect(screen.getByLabelText("Preview geometry sau thay đổi")).toHaveTextContent("108.15");
    expect(screen.queryByText(/không được hiển thị/u)).not.toBeInTheDocument();
    expect(screen.getByText("Có thay đổi đã ẩn")).toBeInTheDocument();
    expect(screen.getByText("Thuộc tính public sau")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tải thêm feature thay đổi" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load.mock.calls[0]![1].compareTo).toBe("parent");
    expect(load.mock.calls[1]![1].cursor).toBe("opaque:diff:page:2/+==");
    expect((await screen.findAllByText("Đã thêm")).length).toBeGreaterThan(1);
  });

  it("renders an explicit empty state without inferring attachment equality", async () => {
    const load = vi.fn().mockResolvedValue(diffResource({ entries: [], nextCursor: null, hasMore: false }));
    render(<RevisionDiffView revisionId={revisionId} transport={{ load } as RevisionDiffTransport}/>);
    expect(await screen.findByText("Không có thay đổi feature")).toBeInTheDocument();
    expect(screen.getByText("So sánh tệp đính kèm chưa khả dụng")).toBeInTheDocument();
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
    render(<RevisionDiffView revisionId={revisionId} transport={{ load } as RevisionDiffTransport}/>);

    const schema = (await screen.findByText("Thay đổi schema public")).closest("section")!;
    expect(within(schema).getByText("address")).toBeInTheDocument();
    expect(within(schema).getByText("legacy_code")).toBeInTheDocument();
    expect(within(schema).getByText("name")).toBeInTheDocument();
    expect(schema).toHaveTextContent("3 thay đổi đã ẩn");
    expect(screen.queryByText("Có thay đổi đã ẩn")).not.toBeInTheDocument();
  });

  it("preserves bounded DIFF_TOO_LARGE details in the typed error state", async () => {
    const load = vi.fn().mockRejectedValue(new AdminApiError(422, "DIFF_TOO_LARGE", "Diff too large.", "request-diff", { maxFeatures: 5000, currentFeatures: 6200 }));
    render(<RevisionDiffView revisionId={revisionId} transport={{ load } as RevisionDiffTransport}/>);
    expect(await screen.findByText("Diff vượt giới hạn xử lý đồng bộ")).toBeInTheDocument();
    expect(screen.getByText(/6200/u)).toBeInTheDocument();
    expect(screen.queryByText("50%")).not.toBeInTheDocument();
  });
});
