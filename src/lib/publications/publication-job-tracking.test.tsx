import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicationJob, PublicationJobResource } from "@/lib/api/publication-jobs";
import {
  selectLatestPublicationJob,
  usePublicationJobTracking,
  type PublicationJobTrackingTransport,
} from "@/lib/publications/publication-job-tracking";

function job(overrides: Partial<PublicationJob> = {}): PublicationJob {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    layerId: "22222222-2222-4222-8222-222222222222",
    revisionId: "33333333-3333-4333-8333-333333333333",
    status: "building",
    phase: "scanning_features",
    progress: { completedUnits: 4, totalUnits: 10, unit: "features", percent: 40 },
    attempt: 1,
    result: null,
    failure: null,
    createdAt: "2026-08-22T01:00:00.000Z",
    startedAt: "2026-08-22T01:00:01.000Z",
    finishedAt: null,
    updatedAt: "2026-08-22T01:00:04.000Z",
    ...overrides,
  };
}

function resource(data = job()): PublicationJobResource {
  return { data, etag: '"job-v1"', retryAfterMs: 1000, requestId: "request-1" };
}

function Harness({ seed, resetKey = "revision-a", transport }: { seed: PublicationJobResource | null; resetKey?: string; transport: PublicationJobTrackingTransport }) {
  const state = usePublicationJobTracking({ seed, resetKey, transport });
  return <div><span>{state.job?.status ?? "no-job"}</span><span>{state.job?.progress.completedUnits ?? "no-progress"}</span><span>{state.trackingState}</span><span>{state.trackingIssue?.code ?? "no-tracking-issue"}</span></div>;
}

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("publication job monotonic state", () => {
  it("rejects older, phase-regressing and progress-regressing representations", () => {
    const current = job();
    expect(selectLatestPublicationJob(current, job({ updatedAt: "2026-08-22T01:00:03.000Z", progress: { completedUnits: 8, totalUnits: 10, unit: "features", percent: 80 } }))).toBe(current);
    expect(selectLatestPublicationJob(current, job({ updatedAt: "2026-08-22T01:00:05.000Z", phase: "preparing" }))).toBe(current);
    expect(selectLatestPublicationJob(current, job({ updatedAt: "2026-08-22T01:00:05.000Z", progress: { completedUnits: 3, totalUnits: 10, unit: "features", percent: 30 } }))).toBe(current);
    expect(selectLatestPublicationJob(current, job({ updatedAt: "2026-08-22T01:00:05.000Z", progress: { completedUnits: 4, totalUnits: 8, unit: "features", percent: 50 } }))).toBe(current);
    expect(selectLatestPublicationJob(current, job({ updatedAt: "2026-08-22T01:00:05.000Z", attempt: 0 }))).toBe(current);
  });

  it("accepts the backend building to queued retry transition without regressing attempt or progress", () => {
    const current = job({ phase: "switching" });
    const requeued = job({
      status: "queued",
      phase: "queued",
      updatedAt: "2026-08-22T01:00:05.000Z",
    });
    expect(selectLatestPublicationJob(current, requeued)).toBe(requeued);
  });

  it("accepts queued to succeeded because polling may skip unobserved building states", () => {
    const queued = job({
      status: "queued",
      phase: "queued",
      progress: { completedUnits: 0, totalUnits: null, unit: "features", percent: null },
      attempt: 0,
      startedAt: null,
    });
    const succeeded = job({
      status: "succeeded",
      phase: "completed",
      progress: { completedUnits: 0, totalUnits: 0, unit: "features", percent: 100 },
      attempt: 1,
      result: { snapshotId: "44444444-4444-4444-8444-444444444444", generation: 8 },
      finishedAt: "2026-08-22T01:00:05.000Z",
      updatedAt: "2026-08-22T01:00:05.000Z",
    });
    expect(selectLatestPublicationJob(queued, succeeded)).toBe(succeeded);
  });

  it("accepts a newer terminal result and never lets it regress", () => {
    const succeeded = job({
      status: "succeeded",
      phase: "completed",
      progress: { completedUnits: 10, totalUnits: 10, unit: "features", percent: 100 },
      result: { snapshotId: "44444444-4444-4444-8444-444444444444", generation: 8 },
      finishedAt: "2026-08-22T01:00:10.000Z",
      updatedAt: "2026-08-22T01:00:10.000Z",
    });
    expect(selectLatestPublicationJob(job(), succeeded)).toBe(succeeded);
    expect(selectLatestPublicationJob(succeeded, job({ updatedAt: "2026-08-22T01:00:11.000Z" }))).toBe(succeeded);
  });
});

describe("publication job polling", () => {
  it("continues polling on repeated 304 responses without a fake poll-count limit", async () => {
    vi.useFakeTimers();
    const get = vi.fn().mockResolvedValue({ data: null, etag: '"job-v1"', retryAfterMs: 1000, notModified: true });
    render(<Harness seed={resource()} transport={{ get }}/>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(get).toHaveBeenCalledTimes(3);
    expect(get.mock.calls.every(([, options]) => options.etag === '"job-v1"')).toBe(true);
  });

  it("keeps the confirmed job and ETag when seed becomes null under the same resetKey", async () => {
    vi.useFakeTimers();
    const get = vi.fn().mockResolvedValue({ data: null, etag: '"job-v1"', retryAfterMs: 1000, notModified: true });
    const trackingTransport = { get: get as PublicationJobTrackingTransport["get"] };
    const view = render(<Harness seed={resource()} resetKey="revision-a" transport={trackingTransport}/>);

    view.rerender(<Harness seed={null} resetKey="revision-a" transport={trackingTransport}/>);
    expect(screen.getByText("building")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(get).toHaveBeenCalledOnce();
    expect(get.mock.calls[0]?.[1].etag).toBe('"job-v1"');
  });

  it("accepts a changed-ETag representation with the same updatedAt millisecond, then retains it on 304", async () => {
    vi.useFakeTimers();
    const sameMillisecondUpdate = job({
      progress: { completedUnits: 8, totalUnits: 10, unit: "features", percent: 80 },
    });
    const get = vi.fn()
      .mockResolvedValueOnce({ ...resource(sameMillisecondUpdate), etag: '"job-v2"' })
      .mockResolvedValue({ data: null, etag: '"job-v2"', retryAfterMs: 1000, notModified: true });
    render(<Harness seed={resource()} transport={{ get }}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByText("8")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(get.mock.calls[1]?.[1].etag).toBe('"job-v2"');
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("surfaces a rejected changed-version regression, keeps the old ETag, then recovers on a valid newer response", async () => {
    vi.useFakeTimers();
    const regression = job({
      progress: { completedUnits: 3, totalUnits: 10, unit: "features", percent: 30 },
    });
    const recovered = job({
      progress: { completedUnits: 6, totalUnits: 10, unit: "features", percent: 60 },
      updatedAt: "2026-08-22T01:00:06.000Z",
    });
    const get = vi.fn()
      .mockResolvedValueOnce({ ...resource(regression), etag: '"job-v2"' })
      .mockResolvedValueOnce({ ...resource(recovered), etag: '"job-v3"' })
      .mockResolvedValue({ data: null, etag: '"job-v3"', retryAfterMs: 1000, notModified: true });
    render(<Harness seed={resource()} transport={{ get }}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("disconnected")).toBeInTheDocument();
    expect(screen.getByText("PUBLICATION_JOB_REPRESENTATION_REJECTED")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(get.mock.calls[1]?.[1].etag).toBe('"job-v1"');
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("connected")).toBeInTheDocument();
    expect(screen.getByText("no-tracking-issue")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(get.mock.calls[2]?.[1].etag).toBe('"job-v3"');
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("marks tracking disconnected while offline and resumes immediately on online", async () => {
    vi.useFakeTimers();
    const get = vi.fn().mockResolvedValue({ data: null, etag: '"job-v1"', retryAfterMs: 1000, notModified: true });
    render(<Harness seed={resource()} transport={{ get }}/>);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(screen.getByText("disconnected")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(get).not.toHaveBeenCalled();

    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await act(async () => { window.dispatchEvent(new Event("online")); await Promise.resolve(); });
    expect(get).toHaveBeenCalledTimes(1);
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("slows polling while hidden and resumes immediately on visibility", async () => {
    vi.useFakeTimers();
    const get = vi.fn().mockResolvedValue({ data: null, etag: '"job-v1"', retryAfterMs: 1000, notModified: true });
    render(<Harness seed={resource()} transport={{ get }}/>);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.getByText("paused")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(14_999); });
    expect(get).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(get).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve(); });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("aborts an in-flight detail request when the tracker unmounts", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const get = vi.fn((_jobId: string, options: { signal?: AbortSignal }) => {
      signal = options.signal;
      return new Promise<never>(() => undefined);
    });
    const view = render(<Harness seed={resource()} transport={{ get: get as PublicationJobTrackingTransport["get"] }}/>);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it("resets revision-bound state and aborts the old poll only when resetKey changes", async () => {
    vi.useFakeTimers();
    let oldSignal: AbortSignal | undefined;
    const regression = job({
      progress: { completedUnits: 3, totalUnits: 10, unit: "features", percent: 30 },
    });
    const nextJob = job({
      id: "55555555-5555-4555-8555-555555555555",
      revisionId: "66666666-6666-4666-8666-666666666666",
      status: "queued",
      phase: "queued",
      progress: { completedUnits: 0, totalUnits: null, unit: "features", percent: null },
      attempt: 0,
      startedAt: null,
    });
    const nextResource: PublicationJobResource = {
      ...resource(nextJob),
      etag: '"job-b-v1"',
      retryAfterMs: 2_500,
    };
    const get = vi.fn()
      .mockResolvedValueOnce({ ...resource(regression), etag: '"job-a-v2"' })
      .mockImplementationOnce((_jobId: string, options: { signal?: AbortSignal }) => {
        oldSignal = options.signal;
        return new Promise<never>(() => undefined);
      })
      .mockResolvedValue({ data: null, etag: '"job-b-v1"', retryAfterMs: 2_500, notModified: true });
    const trackingTransport = { get: get as PublicationJobTrackingTransport["get"] };
    const view = render(<Harness seed={resource()} resetKey="revision-a" transport={trackingTransport}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(screen.getByText("PUBLICATION_JOB_REPRESENTATION_REJECTED")).toBeInTheDocument();
    expect(screen.getByText("disconnected")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(oldSignal?.aborted).toBe(false);

    view.rerender(<Harness seed={null} resetKey="revision-b" transport={trackingTransport}/>);
    expect(oldSignal?.aborted).toBe(true);
    expect(screen.getByText("no-job")).toBeInTheDocument();
    expect(screen.getByText("no-progress")).toBeInTheDocument();
    expect(screen.getByText("connected")).toBeInTheDocument();
    expect(screen.getByText("no-tracking-issue")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(get).toHaveBeenCalledTimes(2);

    view.rerender(<Harness seed={nextResource} resetKey="revision-b" transport={trackingTransport}/>);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_499); });
    expect(get).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(get).toHaveBeenCalledTimes(3);
    expect(get.mock.calls[2]?.[0]).toBe(nextJob.id);
    expect(get.mock.calls[2]?.[1].etag).toBe('"job-b-v1"');
  });

  it("backs off transient failures and keeps the server job nonterminal", async () => {
    vi.useFakeTimers();
    const get = vi.fn()
      .mockRejectedValueOnce(new TypeError("temporary network loss"))
      .mockResolvedValue({ data: null, etag: '"job-v1"', retryAfterMs: 1000, notModified: true });
    render(<Harness seed={resource()} transport={{ get }}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.getByText("disconnected")).toBeInTheDocument();
    expect(screen.getByText("building")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(get).toHaveBeenCalledTimes(2);
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("ignores a superseded response and keeps the newer ETag for the next poll", async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: PublicationJobResource) => void;
    const firstResponse = new Promise<PublicationJobResource>((resolve) => { resolveFirst = resolve; });
    const newer = job({
      progress: { completedUnits: 8, totalUnits: 10, unit: "features", percent: 80 },
      updatedAt: "2026-08-22T01:00:08.000Z",
    });
    const older = job({
      progress: { completedUnits: 5, totalUnits: 10, unit: "features", percent: 50 },
      updatedAt: "2026-08-22T01:00:05.000Z",
    });
    const get = vi.fn()
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce({ ...resource(newer), etag: '"job-v8"' })
      .mockResolvedValue({ data: null, etag: '"job-v8"', retryAfterMs: 1000, notModified: true });
    render(<Harness seed={resource()} transport={{ get }}/>);

    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    await act(async () => { window.dispatchEvent(new Event("focus")); await Promise.resolve(); });
    expect(screen.getByText("8")).toBeInTheDocument();
    await act(async () => { resolveFirst({ ...resource(older), etag: '"job-v5"' }); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(get).toHaveBeenCalledTimes(3);
    expect(get.mock.calls[2]?.[1].etag).toBe('"job-v8"');
    expect(screen.getByText("8")).toBeInTheDocument();
  });
});
