import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminApiError } from "@/lib/api/admin";
import type { LayerPublicationHistory } from "@/lib/api/history";
import { RollbackDialog, type RollbackDialogTransport } from "./rollback-dialog";

const layerId = "11111111-1111-4111-8111-111111111111";
const snapshotId = "22222222-2222-4222-8222-222222222222";
const publication: LayerPublicationHistory["items"][number] = {
  snapshotId,
  layerId,
  revisionId: "33333333-3333-4333-8333-333333333333",
  revisionNo: 4,
  status: "published",
  generation: 8,
  progress: 100,
  featureCount: 1250,
  bounds: [108.1, 16, 108.3, 16.2],
  checksum: "sha256:published",
  rollbackOf: null,
  publishedBy: "44444444-4444-4444-8444-444444444444",
  publishedByDisplayName: "Publisher 01",
  publishedAt: "2026-08-21T03:00:00.000Z",
  activatedAt: "2026-08-21T03:00:00.000Z",
  createdAt: "2026-08-21T03:00:00.000Z",
  isActive: false,
  rollbackEligibility: { eligible: true, reasonCode: null },
};

function openAndCompleteForm() {
  fireEvent.click(screen.getByRole("button", { name: "Khôi phục bản này" }));
  fireEvent.change(screen.getByLabelText("Lý do khôi phục"), { target: { value: "Khôi phục dữ liệu đã được kiểm chứng" } });
  fireEvent.change(screen.getByLabelText("Nhập KHÔI PHỤC để xác nhận"), { target: { value: "KHÔI PHỤC" } });
}

afterEach(cleanup);

describe("rollback dialog", () => {
  it("reuses exact pointer ETag, body and idempotency key after an ambiguous retry", async () => {
    const rollback = vi.fn()
      .mockRejectedValueOnce(new TypeError("connection closed"))
      .mockResolvedValueOnce({
        data: { status: "completed", snapshotId: "55555555-5555-4555-8555-555555555555", revisionId: publication.revisionId, generation: 9, activePointerEtag: '"pointer-v9"' },
        activePointerEtag: '"pointer-v9"',
      });
    const onSuccess = vi.fn();
    render(<RollbackDialog layerId={layerId} publication={publication} activePointerEtag={'"pointer-v8"'} auth={{ csrfToken: "csrf-fixed" }} transport={{ rollback } as RollbackDialogTransport} onSuccess={onSuccess}/>);
    openAndCompleteForm();

    fireEvent.click(screen.getByRole("button", { name: "Xác nhận khôi phục" }));
    expect(await screen.findByText("connection closed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận khôi phục" }));
    await waitFor(() => expect(rollback).toHaveBeenCalledTimes(2));

    expect(rollback.mock.calls[0]![1]).toEqual({ targetSnapshotId: snapshotId, reason: "Khôi phục dữ liệu đã được kiểm chứng", clientIntent: "desktop" });
    expect(rollback.mock.calls[1]![1]).toEqual(rollback.mock.calls[0]![1]);
    expect(rollback.mock.calls[1]![2]).toBe(rollback.mock.calls[0]![2]);
    expect(rollback.mock.calls[1]![2]).toBe('"pointer-v8"');
    expect(rollback.mock.calls[1]![3]).toBe(rollback.mock.calls[0]![3]);
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ generation: 9 }));
  });

  it("renders stale pointer details and asks the owner to refresh authoritative history", async () => {
    const stale = new AdminApiError(412, "ETAG_MISMATCH", "Pointer changed.", "request-stale", { currentEtag: '"pointer-v9"' });
    const rollback = vi.fn().mockRejectedValue(stale);
    const onStale = vi.fn();
    render(<RollbackDialog layerId={layerId} publication={publication} activePointerEtag={'"pointer-v8"'} auth={{ csrfToken: "csrf-fixed" }} transport={{ rollback } as RollbackDialogTransport} onSuccess={vi.fn()} onStale={onStale}/>);
    openAndCompleteForm();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận khôi phục" }));

    expect(await screen.findByText("Chi tiết từ máy chủ")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Chi tiết từ máy chủ"));
    expect(screen.getByText(/pointer-v9/u)).toBeInTheDocument();
    expect(onStale).toHaveBeenCalledWith(stale);
  });

  it.each([
    ["SEPARATION_OF_DUTIES", "tách biệt nhiệm vụ"],
    ["PASSWORD_CHANGE_REQUIRED", "đổi mật khẩu"],
  ])("renders the typed %s problem", async (code, expected) => {
    const rollback = vi.fn().mockRejectedValue(new AdminApiError(403, code, "Forbidden.", "request-forbidden", { policy: code }));
    render(<RollbackDialog layerId={layerId} publication={publication} activePointerEtag={'"pointer-v8"'} auth={{ csrfToken: "csrf-fixed" }} transport={{ rollback } as RollbackDialogTransport} onSuccess={vi.fn()}/>);
    openAndCompleteForm();
    fireEvent.click(screen.getByRole("button", { name: "Xác nhận khôi phục" }));
    expect(await screen.findByText(new RegExp(expected, "u"))).toBeInTheDocument();
  });
});
