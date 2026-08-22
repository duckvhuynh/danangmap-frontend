import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminSession } from "@/components/admin/admin-session";
import type { AdminPrincipal, RevisionBundle } from "@/lib/api/admin";
import type { PublicationJob, PublicationJobResource } from "@/lib/api/publication-jobs";
import { RevisionReview, type RevisionReviewTransport } from "./revision-review";

vi.mock("@/components/admin/admin-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/admin/admin-session")>()),
  useAdminSession: vi.fn(),
}));

vi.mock("@/components/admin/review-map-preview", () => ({
  ReviewMapPreview: () => <div aria-label="Map preview deterministic fallback"/>,
}));

vi.mock("@/components/admin/revision-diff-view", () => ({
  RevisionDiffView: () => <div>Diff deterministic fallback</div>,
}));

const principal: AdminPrincipal = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "publisher@example.gov.vn",
  username: "publisher01",
  displayName: "Publisher 01",
  role: "publisher",
  status: "active",
  mfaEnabled: true,
  mustChangePassword: false,
};

const revisionId = "22222222-2222-4222-8222-222222222222";
const layerId = "55555555-5555-4555-8555-555555555555";
const bundle: RevisionBundle = {
  revision: {
    id: revisionId,
    layerId,
    revisionNo: 4,
    status: "approved",
    title: "Ranh giới phường xã",
    description: "Revision đã được Reviewer duyệt.",
    geometryMode: "polygon",
    allowedGeometryKinds: ["polygon"],
    style: {},
    lockVersion: 3,
    createdBy: "66666666-6666-4666-8666-666666666666",
    updatedAt: "2026-08-22T01:00:00.000Z",
  },
  fields: [],
  workspace: { revisionId, layerId, status: "approved", serverCursor: "Mw", featureCount: 10, bounds: [108.1, 16, 108.3, 16.2], schemaVersion: 1, updatedAt: "2026-08-22T01:00:00.000Z" },
  features: [],
  etag: '"revision-v3"',
  truncated: false,
};

function job(id: string, overrides: Partial<PublicationJob> = {}): PublicationJob {
  return {
    id,
    layerId,
    revisionId,
    status: "queued",
    phase: "queued",
    progress: { completedUnits: 0, totalUnits: null, unit: "features", percent: null },
    attempt: 0,
    result: null,
    failure: null,
    createdAt: "2026-08-22T01:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    updatedAt: "2026-08-22T01:00:00.000Z",
    ...overrides,
  };
}

function jobResource(data: PublicationJob, retryAfterMs = 1): PublicationJobResource {
  return { data, etag: `"${data.id}-etag"`, retryAfterMs, requestId: "request-publication" };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function bundleFor(id: string, title: string): RevisionBundle {
  return {
    ...bundle,
    revision: { ...bundle.revision, id, title },
    workspace: { ...bundle.workspace, revisionId: id },
  };
}

function realTransport(input: {
  jobs?: PublicationJob[];
  publish?: ReturnType<typeof vi.fn>;
  job?: ReturnType<typeof vi.fn>;
  bundle?: ReturnType<typeof vi.fn>;
} = {}): RevisionReviewTransport {
  return {
    bundle: (input.bundle ?? vi.fn().mockResolvedValue(bundle)) as RevisionReviewTransport["bundle"],
    history: vi.fn().mockRejectedValue(new Error("history fixture unavailable")) as RevisionReviewTransport["history"],
    workflow: vi.fn().mockResolvedValue({ historyEtag: '"workflow-v1"', data: { items: [], nextCursor: null, hasMore: false, limit: 25 } }) as RevisionReviewTransport["workflow"],
    audit: vi.fn().mockResolvedValue({ historyEtag: '"audit-v1"', data: { items: [], nextCursor: null, hasMore: false, limit: 25 } }) as RevisionReviewTransport["audit"],
    jobs: vi.fn().mockResolvedValue({ etag: '"jobs-v1"', retryAfterMs: 1, requestId: "request-jobs", data: { items: input.jobs ?? [], nextCursor: null, hasMore: false, limit: 25 } }) as RevisionReviewTransport["jobs"],
    job: (input.job ?? vi.fn().mockResolvedValue({ data: null, etag: '"job-v1"', retryAfterMs: 1000, notModified: true })) as RevisionReviewTransport["job"],
    publish: (input.publish ?? vi.fn()) as RevisionReviewTransport["publish"],
    approve: vi.fn() as RevisionReviewTransport["approve"],
    requestChanges: vi.fn() as RevisionReviewTransport["requestChanges"],
  };
}

function setCapability(input: { mediaMatches: boolean; userAgent: string; platform: string; maxTouchPoints: number }) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: input.mediaMatches, media: "", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }),
  });
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: input.userAgent });
  Object.defineProperty(navigator, "platform", { configurable: true, value: input.platform });
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: input.maxTouchPoints });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE = "true";
  window.sessionStorage.setItem("danangmap-demo-role", "publisher");
  window.sessionStorage.setItem("danangmap-demo-revision-status", "approved");
  vi.mocked(useAdminSession).mockReturnValue({ principal, csrfToken: "csrf-fixed", refreshCsrf: vi.fn(), clearClientPrincipal: vi.fn() });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  delete process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE;
  vi.clearAllMocks();
});

describe("revision review publication capability", () => {
  it.each([
    ["mobile touch", { mediaMatches: false, userAgent: "Mozilla/5.0 (Linux; Android 15; Mobile)", platform: "Linux armv8l", maxTouchPoints: 5 }],
    ["tablet with a fine pointer", { mediaMatches: true, userAgent: "Mozilla/5.0 (Macintosh; iPad)", platform: "MacIntel", maxTouchPoints: 5 }],
  ] as const)("does not render publish form or action on %s", async (_name, capability) => {
    setCapability(capability);
    render(<RevisionReview revisionId="22222222-2222-4222-8222-222222222222"/>);
    expect(await screen.findByText(/chế độ chỉ đọc/u)).toBeInTheDocument();
    expect(screen.queryByLabelText("Ghi chú công bố")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Công bố revision" })).not.toBeInTheDocument();
  });

  it("renders the durable publish action on a keyboard-oriented desktop", async () => {
    setCapability({ mediaMatches: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 });
    render(<RevisionReview revisionId="22222222-2222-4222-8222-222222222222"/>);
    const releaseNote = await screen.findByLabelText("Ghi chú công bố");
    const publish = screen.getByRole("button", { name: "Công bố revision" });
    expect(publish).toBeDisabled();
    fireEvent.change(releaseNote, { target: { value: "Công bố dữ liệu đã được duyệt" } });
    expect(publish).toBeEnabled();
  });

  it("recovers an active server job on mobile while keeping publish unavailable", async () => {
    delete process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE;
    setCapability({ mediaMatches: false, userAgent: "Mozilla/5.0 (Linux; Android 15; Mobile)", platform: "Linux armv8l", maxTouchPoints: 5 });
    const active = job("77777777-7777-4777-8777-777777777777");
    const transport = realTransport({ jobs: [active] });
    render(<RevisionReview revisionId={revisionId} layerId={layerId} transport={transport}/>);

    expect(await screen.findByRole("region", { name: `Publication job ${active.id}` })).toHaveTextContent("Đang chờ xử lý");
    expect(screen.queryByLabelText("Ghi chú công bố")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Công bố|Thử công bố/u })).not.toBeInTheDocument();
    expect(transport.jobs).toHaveBeenCalledWith(layerId, { revisionId, limit: 25 }, { signal: expect.any(AbortSignal) });
  });

  it("clears revision A tracking before revision B recovers an empty authoritative job list", async () => {
    delete process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE;
    setCapability({ mediaMatches: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 });
    const revisionB = "33333333-3333-4333-8333-333333333333";
    const activeA = job("77777777-7777-4777-8777-777777777777");
    const api = realTransport();
    api.bundle = vi.fn((requestedRevisionId: string) => Promise.resolve(bundleFor(
      requestedRevisionId,
      requestedRevisionId === revisionId ? "Revision A" : "Revision B",
    ))) as RevisionReviewTransport["bundle"];
    api.jobs = vi.fn((_requestedLayerId: string, query: { revisionId?: string }) => Promise.resolve({
      etag: `"jobs-${query.revisionId}"`,
      retryAfterMs: 10_000,
      requestId: `request-${query.revisionId}`,
      data: { items: query.revisionId === revisionId ? [activeA] : [], nextCursor: null, hasMore: false, limit: 25 },
    })) as RevisionReviewTransport["jobs"];
    const view = render(<RevisionReview revisionId={revisionId} layerId={layerId} transport={api}/>);
    expect(await screen.findByRole("region", { name: `Publication job ${activeA.id}` })).toBeInTheDocument();

    view.rerender(<RevisionReview revisionId={revisionB} layerId={layerId} transport={api}/>);
    expect(await screen.findByText("Revision B")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("region", { name: `Publication job ${activeA.id}` })).not.toBeInTheDocument());
    expect(screen.getByLabelText("Ghi chú công bố")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Công bố revision" })).toBeDisabled();
    expect(api.jobs).toHaveBeenCalledWith(layerId, { revisionId: revisionB, limit: 25 }, { signal: expect.any(AbortSignal) });
  });

  it("ignores a deferred revision A publish after revision B owns the screen and starts B with fresh input and key", async () => {
    delete process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE;
    setCapability({ mediaMatches: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 });
    const revisionB = "33333333-3333-4333-8333-333333333333";
    const acceptedA = jobResource(job("88888888-8888-4888-8888-888888888888"), 10_000);
    const acceptedB = jobResource(job("99999999-9999-4999-8999-999999999999", {
      revisionId: revisionB,
      createdAt: "2026-08-22T01:01:00.000Z",
      updatedAt: "2026-08-22T01:01:00.000Z",
    }), 10_000);
    const pendingA = deferred<PublicationJobResource>();
    const publish = vi.fn().mockReturnValueOnce(pendingA.promise).mockResolvedValueOnce(acceptedB);
    const api = realTransport({ publish });
    api.bundle = vi.fn((requestedRevisionId: string) => Promise.resolve(bundleFor(
      requestedRevisionId,
      requestedRevisionId === revisionId ? "Revision A" : "Revision B",
    ))) as RevisionReviewTransport["bundle"];
    const view = render(<RevisionReview revisionId={revisionId} layerId={layerId} transport={api}/>);
    const noteA = await screen.findByLabelText("Ghi chú công bố");
    fireEvent.change(noteA, { target: { value: "Ghi chú chỉ thuộc revision A" } });
    fireEvent.click(screen.getByRole("button", { name: "Công bố revision" }));
    await waitFor(() => expect(publish).toHaveBeenCalledOnce());

    view.rerender(<RevisionReview revisionId={revisionB} layerId={layerId} transport={api}/>);
    expect(await screen.findByText("Revision B")).toBeInTheDocument();
    const noteB = screen.getByLabelText("Ghi chú công bố");
    expect(noteB).toHaveValue("");
    expect(screen.getByRole("button", { name: "Công bố revision" })).toBeDisabled();

    await act(async () => {
      pendingA.resolve(acceptedA);
      await pendingA.promise;
    });
    expect(screen.queryByRole("region", { name: `Publication job ${acceptedA.data.id}` })).not.toBeInTheDocument();
    expect(screen.queryByText("Yêu cầu công bố đã được nhận. Trạng thái dưới đây lấy trực tiếp từ máy chủ.")).not.toBeInTheDocument();

    fireEvent.change(noteB, { target: { value: "Ghi chú mới cho revision B" } });
    fireEvent.click(screen.getByRole("button", { name: "Công bố revision" }));
    expect(await screen.findByRole("region", { name: `Publication job ${acceptedB.data.id}` })).toBeInTheDocument();
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[0]?.[0]).toBe(revisionId);
    expect(publish.mock.calls[1]?.[0]).toBe(revisionB);
    expect(publish.mock.calls[0]?.[2]).not.toBe(publish.mock.calls[1]?.[2]);
  });

  it("keeps the newest revision load when deferred requests finish out of order", async () => {
    setCapability({ mediaMatches: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 });
    const newerRevisionId = "33333333-3333-4333-8333-333333333333";
    const olderLoad = deferred<RevisionBundle>();
    const newerLoad = deferred<RevisionBundle>();
    const bundleLoader = vi.fn((requestedRevisionId: string) => requestedRevisionId === revisionId ? olderLoad.promise : newerLoad.promise);
    const api = realTransport({ bundle: bundleLoader });
    const view = render(<RevisionReview revisionId={revisionId} layerId={layerId} transport={api}/>);
    await waitFor(() => expect(bundleLoader).toHaveBeenCalledWith(revisionId));

    view.rerender(<RevisionReview revisionId={newerRevisionId} layerId={layerId} transport={api}/>);
    await waitFor(() => expect(bundleLoader).toHaveBeenCalledWith(newerRevisionId));
    await act(async () => {
      newerLoad.resolve(bundleFor(newerRevisionId, "Revision mới nhất"));
      await newerLoad.promise;
    });
    expect(await screen.findByText("Revision mới nhất")).toBeInTheDocument();

    await act(async () => {
      olderLoad.resolve(bundleFor(revisionId, "Revision cũ hoàn tất muộn"));
      await olderLoad.promise;
    });
    expect(screen.getByText("Revision mới nhất")).toBeInTheDocument();
    expect(screen.queryByText("Revision cũ hoàn tất muộn")).not.toBeInTheDocument();
  });

  it("does not append a deferred revision A workflow page after revision B takes ownership", async () => {
    delete process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE;
    setCapability({ mediaMatches: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 });
    const revisionB = "33333333-3333-4333-8333-333333333333";
    const event = (id: string, reason: string) => ({
      id,
      fromStatus: "draft" as const,
      toStatus: "in_review" as const,
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      actorDisplayName: "Reviewer",
      role: "reviewer" as const,
      reason,
      occurredAt: "2026-08-22T01:00:00.000Z",
    });
    const initialWorkflow = { historyEtag: '"workflow-a-v1"', data: { items: [event("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Workflow A ban đầu")], nextCursor: "opaque:a:2", hasMore: true, limit: 25 } };
    const lateWorkflow = { historyEtag: '"workflow-a-v2"', data: { items: [event("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "Workflow A hoàn tất muộn")], nextCursor: null, hasMore: false, limit: 25 } };
    const emptyWorkflow = { historyEtag: '"workflow-b-v1"', data: { items: [], nextCursor: null, hasMore: false, limit: 25 } };
    const pendingPage = deferred<typeof lateWorkflow>();
    const workflow = vi.fn()
      .mockResolvedValueOnce(initialWorkflow)
      .mockReturnValueOnce(pendingPage.promise)
      .mockResolvedValueOnce(emptyWorkflow);
    const api = realTransport();
    api.bundle = vi.fn((requestedRevisionId: string) => Promise.resolve(bundleFor(
      requestedRevisionId,
      requestedRevisionId === revisionId ? "Revision A" : "Revision B",
    ))) as RevisionReviewTransport["bundle"];
    api.history = vi.fn().mockResolvedValue({
      historyEtag: '"history-v1"',
      data: { validation: { status: "valid", featureCount: 10, issues: [] } },
    }) as RevisionReviewTransport["history"];
    api.workflow = workflow as RevisionReviewTransport["workflow"];
    const view = render(<RevisionReview revisionId={revisionId} layerId={layerId} transport={api}/>);
    expect(await screen.findByText("Workflow A ban đầu")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tải thêm workflow" }));
    await waitFor(() => expect(workflow).toHaveBeenCalledTimes(2));

    view.rerender(<RevisionReview revisionId={revisionB} layerId={layerId} transport={api}/>);
    expect(await screen.findByText("Revision B")).toBeInTheDocument();
    expect(await screen.findByText("Chưa có chuyển trạng thái")).toBeInTheDocument();
    await act(async () => {
      pendingPage.resolve(lateWorkflow);
      await pendingPage.promise;
    });
    expect(screen.queryByText("Workflow A ban đầu")).not.toBeInTheDocument();
    expect(screen.queryByText("Workflow A hoàn tất muộn")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đang tải thêm..." })).not.toBeInTheDocument();
  });

  it("keeps refreshed workflow and audit first pages authoritative over same-identity deferred pagination", async () => {
    delete process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE;
    setCapability({ mediaMatches: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 });
    const workflowEvent = (id: string, reason: string) => ({
      id,
      fromStatus: "draft" as const,
      toStatus: "in_review" as const,
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      actorDisplayName: "Reviewer",
      role: "reviewer" as const,
      reason,
      occurredAt: "2026-08-22T01:00:00.000Z",
    });
    const auditEvent = (id: string, action: string) => ({
      id,
      actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      actorRole: "publisher" as const,
      actorDisplayName: "Publisher",
      action,
      resourceType: "revision",
      resourceId: revisionId,
      requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      beforeDigest: null,
      afterDigest: null,
      metadata: {},
      occurredAt: "2026-08-22T01:00:00.000Z",
    });
    const initialWorkflow = { historyEtag: '"workflow-v1"', data: { items: [workflowEvent("11111111-1111-4111-8111-111111111111", "Workflow ban đầu")], nextCursor: "opaque:workflow:2", hasMore: true, limit: 25 } };
    const deferredWorkflow = { historyEtag: '"workflow-v2"', data: { items: [workflowEvent("22222222-2222-4222-8222-222222222222", "Workflow page cũ hoàn tất muộn")], nextCursor: null, hasMore: false, limit: 25 } };
    const refreshedWorkflow = { historyEtag: '"workflow-v3"', data: { items: [workflowEvent("33333333-3333-4333-8333-333333333333", "Workflow refreshed authoritative")], nextCursor: null, hasMore: false, limit: 25 } };
    const initialAudit = { historyEtag: '"audit-v1"', data: { items: [auditEvent("44444444-4444-4444-8444-444444444444", "audit.initial")], nextCursor: "opaque:audit:2", hasMore: true, limit: 25 } };
    const deferredAudit = { historyEtag: '"audit-v2"', data: { items: [auditEvent("55555555-5555-4555-8555-555555555555", "audit.old_page_late")], nextCursor: null, hasMore: false, limit: 25 } };
    const refreshedAudit = { historyEtag: '"audit-v3"', data: { items: [auditEvent("66666666-6666-4666-8666-666666666666", "audit.refreshed_authoritative")], nextCursor: null, hasMore: false, limit: 25 } };
    const pendingWorkflow = deferred<typeof deferredWorkflow>();
    const pendingAudit = deferred<typeof deferredAudit>();
    const api = realTransport();
    api.history = vi.fn().mockResolvedValue({
      historyEtag: '"history-v1"',
      data: { validation: { status: "valid", featureCount: 10, issues: [] } },
    }) as RevisionReviewTransport["history"];
    api.workflow = vi.fn()
      .mockResolvedValueOnce(initialWorkflow)
      .mockReturnValueOnce(pendingWorkflow.promise)
      .mockResolvedValueOnce(refreshedWorkflow) as RevisionReviewTransport["workflow"];
    api.audit = vi.fn()
      .mockResolvedValueOnce(initialAudit)
      .mockReturnValueOnce(pendingAudit.promise)
      .mockResolvedValueOnce(refreshedAudit) as RevisionReviewTransport["audit"];
    api.jobs = vi.fn()
      .mockRejectedValueOnce(new Error("job recovery unavailable"))
      .mockResolvedValueOnce({ etag: '"jobs-v2"', retryAfterMs: 10_000, requestId: "request-jobs-v2", data: { items: [], nextCursor: null, hasMore: false, limit: 25 } }) as RevisionReviewTransport["jobs"];
    render(<RevisionReview revisionId={revisionId} layerId={layerId} transport={api}/>);
    expect(await screen.findByText("Workflow ban đầu")).toBeInTheDocument();
    expect(screen.getByText("audit.initial")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tải thêm workflow" }));
    fireEvent.click(screen.getByRole("button", { name: "Tải thêm sự kiện" }));
    fireEvent.click(screen.getByRole("button", { name: "Thử kết nối lại" }));

    expect(await screen.findByText("Workflow refreshed authoritative")).toBeInTheDocument();
    expect(await screen.findByText("audit.refreshed_authoritative")).toBeInTheDocument();
    await act(async () => {
      pendingWorkflow.resolve(deferredWorkflow);
      pendingAudit.resolve(deferredAudit);
      await Promise.all([pendingWorkflow.promise, pendingAudit.promise]);
    });
    expect(screen.queryByText("Workflow page cũ hoàn tất muộn")).not.toBeInTheDocument();
    expect(screen.queryByText("audit.old_page_late")).not.toBeInTheDocument();
    expect(screen.getByText("Workflow refreshed authoritative")).toBeInTheDocument();
    expect(screen.getByText("audit.refreshed_authoritative")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Đang tải thêm..." })).not.toBeInTheDocument();
  });

  it("does not continue a deferred revision load after unmount", async () => {
    delete process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE;
    setCapability({ mediaMatches: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 });
    const pendingLoad = deferred<RevisionBundle>();
    const bundleLoader = vi.fn().mockReturnValue(pendingLoad.promise);
    const api = realTransport({ bundle: bundleLoader });
    const view = render(<RevisionReview revisionId={revisionId} layerId={layerId} transport={api}/>);
    await waitFor(() => expect(bundleLoader).toHaveBeenCalledOnce());

    view.unmount();
    await act(async () => {
      pendingLoad.resolve(bundle);
      await pendingLoad.promise;
    });
    expect(api.history).not.toHaveBeenCalled();
    expect(api.workflow).not.toHaveBeenCalled();
    expect(api.audit).not.toHaveBeenCalled();
    expect(api.jobs).not.toHaveBeenCalled();
  });

  it("reuses the same idempotency key after an ambiguous POST and focuses accepted status once", async () => {
    delete process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE;
    setCapability({ mediaMatches: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 });
    const accepted = jobResource(job("88888888-8888-4888-8888-888888888888"), 10_000);
    const publish = vi.fn().mockRejectedValueOnce(new TypeError("network disconnected")).mockResolvedValueOnce(accepted);
    const transport = realTransport({ publish });
    render(<RevisionReview revisionId={revisionId} layerId={layerId} transport={transport}/>);

    const note = await screen.findByLabelText("Ghi chú công bố");
    fireEvent.change(note, { target: { value: "Công bố dữ liệu đã duyệt" } });
    fireEvent.click(screen.getByRole("button", { name: "Công bố revision" }));
    expect(await screen.findByText("network disconnected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Công bố revision" }));

    const status = await screen.findByRole("region", { name: `Publication job ${accepted.data.id}` });
    await waitFor(() => expect(status).toHaveFocus());
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[0]?.[2]).toBe(publish.mock.calls[1]?.[2]);
    const backLink = screen.getByRole("link", { name: "Quay lại lịch sử layer" });
    backLink.focus();
    fireEvent.focus(window);
    expect(backLink).toHaveFocus();
  });

  it("clears a stale recovery warning when the server accepts a connected publish job", async () => {
    delete process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE;
    setCapability({ mediaMatches: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 });
    const accepted = jobResource(job("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), 10_000);
    const api = realTransport({ publish: vi.fn().mockResolvedValue(accepted) });
    api.jobs = vi.fn().mockRejectedValue(new Error("recovery temporarily unavailable")) as RevisionReviewTransport["jobs"];
    render(<RevisionReview revisionId={revisionId} layerId={layerId} transport={api}/>);
    expect(await screen.findByText("Chưa thể khôi phục trạng thái công bố")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Ghi chú công bố"), { target: { value: "Công bố sau recovery warning" } });
    fireEvent.click(screen.getByRole("button", { name: "Công bố revision" }));
    expect(await screen.findByRole("region", { name: `Publication job ${accepted.data.id}` })).toBeInTheDocument();
    expect(screen.queryByText("Chưa thể khôi phục trạng thái công bố")).not.toBeInTheDocument();
  });

  it("uses a fresh idempotency key when the user republishes after terminal failure", async () => {
    delete process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE;
    setCapability({ mediaMatches: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 });
    const first = job("99999999-9999-4999-8999-999999999999");
    const failed = job(first.id, {
      status: "failed",
      phase: "failed",
      progress: { completedUnits: 4, totalUnits: 10, unit: "features", percent: 40 },
      failure: { code: "PUBLICATION_BUILD_FAILED", userMessage: "Không thể dựng snapshot.", requestId: "request-failed", retryable: true },
      finishedAt: "2026-08-22T01:00:05.000Z",
      updatedAt: "2026-08-22T01:00:05.000Z",
    });
    const second = job("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { createdAt: "2026-08-22T01:01:00.000Z", updatedAt: "2026-08-22T01:01:00.000Z" });
    const publish = vi.fn().mockResolvedValueOnce(jobResource(first)).mockResolvedValueOnce(jobResource(second, 10_000));
    const get = vi.fn().mockResolvedValue(jobResource(failed));
    const transport = realTransport({ publish, job: get });
    render(<RevisionReview revisionId={revisionId} layerId={layerId} transport={transport}/>);

    fireEvent.change(await screen.findByLabelText("Ghi chú công bố"), { target: { value: "Công bố lần đầu" } });
    fireEvent.click(screen.getByRole("button", { name: "Công bố revision" }));
    expect(await screen.findByText("Không thể dựng snapshot.")).toBeInTheDocument();
    const retry = await screen.findByRole("button", { name: "Thử công bố lại" });
    fireEvent.click(retry);
    expect(await screen.findByRole("region", { name: `Publication job ${second.id}` })).toBeInTheDocument();
    expect(publish.mock.calls[0]?.[2]).not.toBe(publish.mock.calls[1]?.[2]);
  });

  it("preserves terminal success when the subsequent authoritative refresh fails", async () => {
    delete process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE;
    setCapability({ mediaMatches: true, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32", maxTouchPoints: 0 });
    const active = job("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    const building = job(active.id, {
      status: "building",
      phase: "scanning_features",
      progress: { completedUnits: 4, totalUnits: 10, unit: "features", percent: 40 },
      attempt: 1,
      startedAt: "2026-08-22T01:00:01.000Z",
      updatedAt: "2026-08-22T01:00:02.000Z",
    });
    const succeeded = job(active.id, {
      status: "succeeded",
      phase: "completed",
      progress: { completedUnits: 10, totalUnits: 10, unit: "features", percent: 100 },
      attempt: 1,
      result: { snapshotId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", generation: 9 },
      startedAt: "2026-08-22T01:00:01.000Z",
      finishedAt: "2026-08-22T01:00:05.000Z",
      updatedAt: "2026-08-22T01:00:05.000Z",
    });
    const bundleLoader = vi.fn().mockResolvedValueOnce(bundle).mockRejectedValueOnce(new Error("refresh unavailable"));
    const transport = realTransport({
      jobs: [active],
      job: vi.fn()
        .mockResolvedValueOnce({ ...jobResource(building), etag: '"publication-job-v2"' })
        .mockResolvedValue({ ...jobResource(succeeded), etag: '"publication-job-v3"' }),
      bundle: bundleLoader,
    });
    render(<RevisionReview revisionId={revisionId} layerId={layerId} transport={transport}/>);

    expect(await screen.findByText("Đã tạo generation 9.")).toBeInTheDocument();
    expect(await screen.findByText("refresh unavailable")).toBeInTheDocument();
    expect(screen.getByText("Dữ liệu đã được công bố sau khi publication job hoàn tất.")).toBeInTheDocument();
    expect(screen.getByText("Đã tạo generation 9.")).toBeInTheDocument();
  });
});
