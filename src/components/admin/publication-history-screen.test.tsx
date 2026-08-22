import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminSession } from "@/components/admin/admin-session";
import { AdminApiError, type AdminPrincipal } from "@/lib/api/admin";
import type { AuditEvents, LayerPublicationHistory, LayerRevisionHistory } from "@/lib/api/history";
import type { PublicationJob } from "@/lib/api/publication-jobs";
import { PublicationHistoryScreen, type PublicationHistoryTransport } from "./publication-history-screen";

vi.mock("@/components/admin/admin-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/admin/admin-session")>()),
  useAdminSession: vi.fn(),
}));

const layerId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const principal: AdminPrincipal = {
  id: "33333333-3333-4333-8333-333333333333",
  email: "publisher@example.gov.vn",
  username: "publisher01",
  displayName: "Publisher 01",
  role: "publisher",
  status: "active",
  mfaEnabled: true,
  mustChangePassword: false,
};

const revision: LayerRevisionHistory["items"][number] = {
  id: revisionId,
  revisionNo: 3,
  status: "published",
  title: "Ranh giới phường xã",
  supersedesRevisionId: null,
  createdBy: "44444444-4444-4444-8444-444444444444",
  createdByDisplayName: "Editor 01",
  submittedAt: "2026-08-21T02:00:00.000Z",
  approvedAt: "2026-08-21T02:10:00.000Z",
  publishedAt: "2026-08-21T02:20:00.000Z",
  createdAt: "2026-08-21T01:00:00.000Z",
  updatedAt: "2026-08-21T02:20:00.000Z",
  featureCount: 1250,
  participantCount: 3,
  activeSnapshotId: "55555555-5555-4555-8555-555555555555",
  activeGeneration: 6,
};

const publication: LayerPublicationHistory["items"][number] = {
  snapshotId: "55555555-5555-4555-8555-555555555555",
  layerId,
  revisionId,
  revisionNo: 3,
  status: "published",
  generation: 6,
  progress: 100,
  featureCount: 1250,
  bounds: [108.1, 16, 108.3, 16.2],
  checksum: "sha256:published",
  rollbackOf: null,
  publishedBy: principal.id,
  publishedByDisplayName: principal.displayName,
  publishedAt: "2026-08-21T02:20:00.000Z",
  activatedAt: "2026-08-21T02:20:00.000Z",
  createdAt: "2026-08-21T02:20:00.000Z",
  isActive: false,
  rollbackEligibility: { eligible: true, reasonCode: null },
};

const auditEvent: AuditEvents["items"][number] = {
  id: "66666666-6666-4666-8666-666666666666",
  actorId: principal.id,
  actorRole: "publisher",
  actorDisplayName: principal.displayName,
  action: "publication.published",
  resourceType: "layer",
  resourceId: layerId,
  requestId: "77777777-7777-4777-8777-777777777777",
  beforeDigest: null,
  afterDigest: "sha256:after",
  metadata: { generation: 6 },
  occurredAt: "2026-08-21T02:20:00.000Z",
};

const publicationJob: PublicationJob = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  layerId,
  revisionId,
  status: "succeeded",
  phase: "completed",
  progress: { completedUnits: 1250, totalUnits: 1250, unit: "features", percent: 100 },
  attempt: 1,
  result: { snapshotId: publication.snapshotId, generation: 6 },
  failure: null,
  createdAt: "2026-08-21T02:19:00.000Z",
  startedAt: "2026-08-21T02:19:01.000Z",
  finishedAt: "2026-08-21T02:20:00.000Z",
  updatedAt: "2026-08-21T02:20:00.000Z",
};

function setDesktop(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches, media: "", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }),
  });
}

function transport(empty = false): PublicationHistoryTransport {
  return {
    revisions: vi.fn().mockResolvedValue({
      historyEtag: '"history-revisions-v1"',
      data: { items: empty ? [] : [revision], nextCursor: empty ? null : "opaque:revisions:2/+==", hasMore: !empty, limit: 25 },
    }),
    publications: vi.fn().mockResolvedValue({
      historyEtag: '"history-publications-v1"',
      activePointerEtag: '"pointer-v6"',
      data: { items: empty ? [] : [publication, { ...publication, snapshotId: "88888888-8888-4888-8888-888888888888", generation: 5, status: "failed", progress: null, rollbackEligibility: { eligible: false, reasonCode: "ROLLBACK_TARGET_INVALID" } }], activePointerEtag: '"pointer-v6"', nextCursor: null, hasMore: false, limit: 25 },
    }),
    jobs: vi.fn().mockResolvedValue({
      etag: '"publication-jobs-v1"',
      retryAfterMs: 2000,
      requestId: "request-jobs",
      data: { items: empty ? [] : [publicationJob], nextCursor: null, hasMore: false, limit: 25 },
    }),
    audit: vi.fn().mockResolvedValue({ historyEtag: '"history-audit-v1"', data: { items: empty ? [] : [auditEvent], nextCursor: null, hasMore: false, limit: 25 } }),
    rollback: vi.fn(),
  };
}

beforeEach(() => {
  vi.mocked(useAdminSession).mockReturnValue({ principal, csrfToken: "csrf-fixed", refreshCsrf: vi.fn(), clearClientPrincipal: vi.fn() });
  setDesktop(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("publication history screen", () => {
  it("keeps history and pointer ETags distinct, renders terminal progress and preserves opaque cursors", async () => {
    const api = transport();
    vi.mocked(api.revisions).mockResolvedValueOnce({ historyEtag: '"history-revisions-v1"', data: { items: [revision], nextCursor: "opaque:revisions:2/+==", hasMore: true, limit: 25 } }).mockResolvedValueOnce({ historyEtag: '"history-revisions-v2"', data: { items: [{ ...revision, id: "99999999-9999-4999-8999-999999999999", revisionNo: 2 }], nextCursor: null, hasMore: false, limit: 25 } });
    vi.mocked(api.jobs).mockResolvedValueOnce({ etag: '"publication-jobs-v1"', retryAfterMs: 2000, requestId: "request-jobs-1", data: { items: [publicationJob], nextCursor: "opaque:jobs:2/+==", hasMore: true, limit: 25 } }).mockResolvedValueOnce({ etag: '"publication-jobs-v2"', retryAfterMs: 2000, requestId: "request-jobs-2", data: { items: [{ ...publicationJob, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }], nextCursor: null, hasMore: false, limit: 25 } });
    render(<PublicationHistoryScreen layerId={layerId} transport={api}/>);

    expect(await screen.findByText("Lịch sử Ranh giới phường xã")).toBeInTheDocument();
    expect(screen.getByText('"history-publications-v1"')).toBeInTheDocument();
    expect(screen.getByText('"pointer-v6"')).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("Chưa có số đo")).toBeInTheDocument();
    expect(screen.queryByText("50%")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Publication jobs" })).toBeInTheDocument();
    expect(screen.getByText('"publication-jobs-v1"')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Revision #3" })).toHaveAttribute("href", `/admin/layers/${layerId}/revisions/${revisionId}/review`);
    expect(screen.getByRole("button", { name: "Khôi phục bản này" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tải thêm revision" }));
    await waitFor(() => expect(api.revisions).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.revisions).mock.calls[1]![1]?.cursor).toBe("opaque:revisions:2/+==");

    fireEvent.click(screen.getByRole("button", { name: "Tải thêm publication job" }));
    await waitFor(() => expect(api.jobs).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.jobs).mock.calls[1]![1]?.cursor).toBe("opaque:jobs:2/+==");
  });

  it("renders empty states for a new layer", async () => {
    render(<PublicationHistoryScreen layerId={layerId} transport={transport(true)}/>);
    expect(await screen.findByText("Chưa có publication")).toBeInTheDocument();
    expect(screen.getByText("Chưa có revision")).toBeInTheDocument();
    expect(screen.getByText("Chưa có sự kiện kiểm toán")).toBeInTheDocument();
  });

  it.each([
    ["reviewer", true],
    ["publisher", false],
  ] as const)("keeps rollback unavailable for %s when desktop capability is %s", async (role, desktop) => {
    vi.mocked(useAdminSession).mockReturnValue({ principal: { ...principal, role }, csrfToken: "csrf-fixed", refreshCsrf: vi.fn(), clearClientPrincipal: vi.fn() });
    setDesktop(desktop);
    render(<PublicationHistoryScreen layerId={layerId} transport={transport()}/>);
    expect(await screen.findByText("Lịch sử Ranh giới phường xã")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: `Publication job ${publicationJob.id}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Khôi phục bản này" })).not.toBeInTheDocument();
    if (role === "publisher") expect(screen.getByText("Rollback chỉ dùng trên desktop")).toBeInTheDocument();
  });

  it("renders a typed load error", async () => {
    const api = transport();
    vi.mocked(api.publications).mockRejectedValue(new Error("history unavailable"));
    render(<PublicationHistoryScreen layerId={layerId} transport={api}/>);
    expect(await screen.findByText("history unavailable")).toBeInTheDocument();
  });

  it("keeps core history available and offers a safe retry when the optional job list fails", async () => {
    const api = transport();
    vi.mocked(api.jobs).mockRejectedValue(new Error("private upstream detail"));
    render(<PublicationHistoryScreen layerId={layerId} transport={api}/>);

    expect(await screen.findByText("Lịch sử Ranh giới phường xã")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Publication snapshots" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Revision #3" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Audit theo layer" })).toBeInTheDocument();
    const warning = screen.getByRole("status");
    expect(warning).toHaveTextContent("Chưa thể tải publication jobs");
    expect(warning).not.toHaveTextContent("private upstream detail");

    fireEvent.click(screen.getByRole("button", { name: "Thử tải lại job" }));
    await waitFor(() => expect(api.jobs).toHaveBeenCalledTimes(2));
  });

  it("keeps a stale rollback error in its dialog while refreshing authoritative history", async () => {
    const api = transport();
    vi.mocked(api.rollback).mockRejectedValue(new AdminApiError(412, "ETAG_MISMATCH", "Pointer changed.", "request-stale"));
    render(<PublicationHistoryScreen layerId={layerId} transport={api}/>);

    expect(await screen.findByText("Lịch sử Ranh giới phường xã")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Khôi phục bản này" }));
    const dialog = screen.getByRole("dialog", { name: "Khôi phục publication generation 6" });
    fireEvent.change(within(dialog).getByLabelText("Lý do khôi phục"), { target: { value: "Khôi phục dữ liệu đã được kiểm chứng" } });
    fireEvent.change(within(dialog).getByLabelText("Nhập KHÔI PHỤC để xác nhận"), { target: { value: "KHÔI PHỤC" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận khôi phục" }));

    expect(await within(dialog).findByText(/Publication pointer đã thay đổi/u)).toBeInTheDocument();
    expect(screen.getAllByText(/Publication pointer đã thay đổi/u)).toHaveLength(1);
    await waitFor(() => expect(api.publications).toHaveBeenCalledTimes(2));
  });
});
