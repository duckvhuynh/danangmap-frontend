import { describe, expect, it, vi } from "vitest";
import { createDanangMapClient } from "@/lib/api/generated/client";
import { AdminApiError } from "@/lib/api/admin";
import {
  getPublicationJob,
  listLayerPublicationJobs,
  publishRevision,
  retryAfterMilliseconds,
  type PublicationJob,
} from "@/lib/api/publication-jobs";

const layerId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const jobId = "33333333-3333-4333-8333-333333333333";
const operationKey = "44444444-4444-4444-8444-444444444444";
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function job(overrides: Partial<PublicationJob> = {}): PublicationJob {
  return {
    id: jobId,
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

function envelope(data: unknown) {
  return JSON.stringify({ data, meta: { requestId: "request-publication" } });
}

async function requestParts(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : new Request(input, init);
  const body = request.method === "GET" ? null : await request.clone().json();
  return { request, url: new URL(request.url), body };
}

describe("durable publication API adapter", () => {
  it("sends desktop intent and preserves the caller idempotency key across an ambiguous retry", async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(envelope(job()), {
      status: 202,
      headers: {
        "content-type": "application/json",
        etag: '"publication-job-v1"',
        location: `/api/v1/admin/publication-jobs/${jobId}`,
        "retry-after": "3",
      },
    }));
    const client = createDanangMapClient(fetcher);
    const first = await publishRevision(revisionId, "Công bố dữ liệu đã duyệt", operationKey, { csrfToken: "csrf-fixed" }, client);
    const second = await publishRevision(revisionId, "Công bố dữ liệu đã duyệt", operationKey, { csrfToken: "csrf-fixed" }, client);

    expect(first).toMatchObject({ mode: "async", data: { id: jobId, status: "queued" }, etag: '"publication-job-v1"', retryAfterMs: 3000 });
    expect(second.mode).toBe("async");
    if (second.mode !== "async") throw new Error("Expected async publication acceptance.");
    expect(second.data.id).toBe(jobId);
    const requests = await Promise.all(fetcher.mock.calls.map(([input, init]) => requestParts(input, init)));
    expect(requests.map(({ request }) => request.headers.get("idempotency-key"))).toEqual([operationKey, operationKey]);
    expect(requests[0]?.request.headers.get("x-csrf-token")).toBe("csrf-fixed");
    expect(requests[0]?.body).toEqual({ releaseNote: "Công bố dữ liệu đã duyệt", clientIntent: "desktop" });
  });

  it.each([
    ["location", { etag: '"publication-job-v1"', "retry-after": "2" }],
    ["etag", { location: `/api/v1/admin/publication-jobs/${jobId}`, "retry-after": "2" }],
    ["retry-after", { etag: '"publication-job-v1"', location: `/api/v1/admin/publication-jobs/${jobId}` }],
  ])("rejects an accepted response without %s", async (_name, headers) => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(envelope(job()), { status: 202, headers: { "content-type": "application/json", ...headers } }));
    await expect(publishRevision(revisionId, "Release", operationKey, { csrfToken: "csrf" }, createDanangMapClient(fetcher))).rejects.toMatchObject({
      code: "PUBLICATION_JOB_CONTRACT_INVALID",
      status: 502,
    });
  });

  it.each(['W/"publication-job-v1"', "publication-job-v1", '"publication-job-v1'])("rejects malformed or non-strong durable async ETag %s", async (etag) => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(envelope(job()), {
      status: 202,
      headers: {
        "content-type": "application/json",
        etag,
        location: `/api/v1/admin/publication-jobs/${jobId}`,
        "retry-after": "2",
      },
    }));
    await expect(publishRevision(revisionId, "Release", operationKey, { csrfToken: "csrf" }, createDanangMapClient(fetcher))).rejects.toMatchObject({
      code: "PUBLICATION_JOB_CONTRACT_INVALID",
      message: "Publication job phải trả strong ETag hợp lệ.",
    });
  });

  it.each(["banana", "2.5", "-1", "999999999999999999999999999999999999999999"])("rejects malformed durable async Retry-After %s", async (retryAfter) => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(envelope(job()), {
      status: 202,
      headers: {
        "content-type": "application/json",
        etag: '"publication-job-v1"',
        location: `/api/v1/admin/publication-jobs/${jobId}`,
        "retry-after": retryAfter,
      },
    }));
    await expect(publishRevision(revisionId, "Release", operationKey, { csrfToken: "csrf" }, createDanangMapClient(fetcher))).rejects.toMatchObject({
      code: "PUBLICATION_JOB_CONTRACT_INVALID",
      message: "Publication job trả Retry-After không hợp lệ.",
    });
  });

  it("accepts the exact default-off synchronous terminal shape without inventing a job", async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(envelope({ snapshotId: jobId, generation: 8, status: "completed" }), {
      status: 202,
      headers: { "content-type": "application/json" },
    }));
    await expect(publishRevision(revisionId, "Release", operationKey, { csrfToken: "csrf" }, createDanangMapClient(fetcher))).resolves.toEqual({
      mode: "sync",
      data: { snapshotId: jobId, generation: 8, status: "completed" },
      requestId: "request-publication",
    });
  });

  it("accepts the backend default-off terminal with a matching legacy publicationId", async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(envelope({ publicationId: jobId, snapshotId: jobId, generation: 8, status: "completed" }), {
      status: 202,
      headers: { "content-type": "application/json" },
    }));
    await expect(publishRevision(revisionId, "Release", operationKey, { csrfToken: "csrf" }, createDanangMapClient(fetcher))).resolves.toEqual({
      mode: "sync",
      data: { publicationId: jobId, snapshotId: jobId, generation: 8, status: "completed" },
      requestId: "request-publication",
    });
  });

  it("accepts a generic weak Express ETag on the default-off terminal", async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(envelope({ publicationId: jobId, snapshotId: jobId, generation: 8, status: "completed" }), {
      status: 202,
      headers: { "content-type": "application/json", etag: 'W/"7e-default-off"' },
    }));
    await expect(publishRevision(revisionId, "Release", operationKey, { csrfToken: "csrf" }, createDanangMapClient(fetcher))).resolves.toMatchObject({
      mode: "sync",
      data: { snapshotId: jobId, generation: 8, status: "completed" },
    });
  });

  it.each([
    ["strong publication-job ETag", { snapshotId: jobId, generation: 8, status: "completed" }, { etag: '"publication-v8"' }],
    ["Location", { snapshotId: jobId, generation: 8, status: "completed" }, { location: `/api/v1/admin/publication-jobs/${jobId}` }],
    ["Retry-After", { snapshotId: jobId, generation: 8, status: "completed" }, { "retry-after": "2" }],
    ["zero generation", { snapshotId: jobId, generation: 0, status: "completed" }, {}],
    ["non-uuid snapshot", { snapshotId: "snapshot-8", generation: 8, status: "completed" }, {}],
    ["mismatched publicationId", { publicationId: operationKey, snapshotId: jobId, generation: 8, status: "completed" }, {}],
    ["invalid publicationId", { publicationId: "publication-8", snapshotId: jobId, generation: 8, status: "completed" }, {}],
    ["extra field", { snapshotId: jobId, generation: 8, status: "completed", internalState: "committed" }, {}],
  ])("rejects an invalid synchronous terminal with %s", async (_name, data, headers) => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(envelope(data), {
      status: 202,
      headers: { "content-type": "application/json", ...headers },
    }));
    await expect(publishRevision(revisionId, "Release", operationKey, { csrfToken: "csrf" }, createDanangMapClient(fetcher))).rejects.toEqual(expect.objectContaining<Partial<AdminApiError>>({
      code: "PUBLICATION_JOB_CONTRACT_INVALID",
    }));
  });

  it("rejects a terminal body whose status, phase and safe result are inconsistent", async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(envelope(job({
      status: "succeeded",
      phase: "switching",
      progress: { completedUnits: 10, totalUnits: 10, unit: "features", percent: 100 },
      result: { snapshotId: jobId, generation: 8 },
      finishedAt: "2026-08-22T01:00:05.000Z",
    })), {
      status: 202,
      headers: { "content-type": "application/json", etag: '"publication-job-v2"', location: `/api/v1/admin/publication-jobs/${jobId}`, "retry-after": "2" },
    }));
    await expect(publishRevision(revisionId, "Release", operationKey, { csrfToken: "csrf" }, createDanangMapClient(fetcher))).rejects.toMatchObject({
      code: "PUBLICATION_JOB_CONTRACT_INVALID",
    });
  });

  it("rejects a structurally valid terminal-success job returned from the publish 202", async () => {
    const terminal = job({
      status: "succeeded",
      phase: "completed",
      progress: { completedUnits: 0, totalUnits: 0, unit: "features", percent: 100 },
      attempt: 1,
      result: { snapshotId: jobId, generation: 8 },
      startedAt: "2026-08-22T01:00:01.000Z",
      finishedAt: "2026-08-22T01:00:02.000Z",
      updatedAt: "2026-08-22T01:00:02.000Z",
    });
    const fetcher = vi.fn<Fetcher>(async () => new Response(envelope(terminal), {
      status: 202,
      headers: { "content-type": "application/json", etag: '"publication-job-v2"', location: `/api/v1/admin/publication-jobs/${jobId}`, "retry-after": "2" },
    }));
    await expect(publishRevision(revisionId, "Release", operationKey, { csrfToken: "csrf" }, createDanangMapClient(fetcher))).rejects.toMatchObject({
      code: "PUBLICATION_JOB_CONTRACT_INVALID",
      message: "API 202 phải trả publication job queued/queued chưa hoàn tất.",
    });
  });

  it("uses If-None-Match and accepts 304 without parsing a body", async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(null, { status: 304, headers: { "retry-after": "4" } }));
    const result = await getPublicationJob(jobId, { etag: '"publication-job-v2"' }, createDanangMapClient(fetcher));
    expect(result).toEqual({ data: null, etag: '"publication-job-v2"', retryAfterMs: 4000, notModified: true });
    const request = await requestParts(fetcher.mock.calls[0]![0], fetcher.mock.calls[0]![1]);
    expect(request.request.headers.get("if-none-match")).toBe('"publication-job-v2"');
  });

  it("accepts the backend empty nonterminal progress shape without inventing a percent", async () => {
    const empty = job({
      status: "building",
      phase: "switching",
      progress: { completedUnits: 0, totalUnits: 0, unit: "features", percent: null },
      attempt: 1,
      startedAt: "2026-08-22T01:00:01.000Z",
      updatedAt: "2026-08-22T01:00:02.000Z",
    });
    const fetcher = vi.fn<Fetcher>(async () => new Response(envelope(empty), {
      status: 200,
      headers: { "content-type": "application/json", etag: '"publication-job-v2"', "retry-after": "2" },
    }));
    const result = await getPublicationJob(jobId, {}, createDanangMapClient(fetcher));
    expect(result.data?.progress).toEqual({ completedUnits: 0, totalUnits: 0, unit: "features", percent: null });
  });

  it("rejects a fake empty nonterminal 100 percent representation", async () => {
    const impossible = job({
      status: "building",
      phase: "switching",
      progress: { completedUnits: 0, totalUnits: 0, unit: "features", percent: 100 },
      attempt: 1,
      startedAt: "2026-08-22T01:00:01.000Z",
      updatedAt: "2026-08-22T01:00:02.000Z",
    });
    const fetcher = vi.fn<Fetcher>(async () => new Response(envelope(impossible), {
      status: 200,
      headers: { "content-type": "application/json", etag: '"publication-job-v2"', "retry-after": "2" },
    }));
    await expect(getPublicationJob(jobId, {}, createDanangMapClient(fetcher))).rejects.toMatchObject({
      code: "PUBLICATION_JOB_CONTRACT_INVALID",
    });
  });

  it("preserves an opaque list cursor and revision filter", async () => {
    const cursor = "opaque:jobs:2/+==";
    const fetcher = vi.fn<Fetcher>(async () => new Response(envelope({ items: [job()], nextCursor: cursor, hasMore: true, limit: 25 }), {
      status: 200,
      headers: { "content-type": "application/json", etag: '"publication-jobs-v3"', "retry-after": "2" },
    }));
    const result = await listLayerPublicationJobs(layerId, { revisionId, cursor, limit: 25 }, {}, createDanangMapClient(fetcher));
    expect(result.data?.items[0]?.id).toBe(jobId);
    const request = await requestParts(fetcher.mock.calls[0]![0], fetcher.mock.calls[0]![1]);
    expect(request.url.searchParams.get("cursor")).toBe(cursor);
    expect(request.url.searchParams.get("revisionId")).toBe(revisionId);
  });

  it("supports list revalidation with If-None-Match and an empty 304", async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(null, { status: 304, headers: { "retry-after": "2" } }));
    const result = await listLayerPublicationJobs(layerId, { status: "building", limit: 25 }, { etag: '"publication-jobs-v3"' }, createDanangMapClient(fetcher));
    expect(result).toEqual({ data: null, etag: '"publication-jobs-v3"', retryAfterMs: 2000, notModified: true });
    const request = await requestParts(fetcher.mock.calls[0]![0], fetcher.mock.calls[0]![1]);
    expect(request.request.headers.get("if-none-match")).toBe('"publication-jobs-v3"');
    expect(request.url.searchParams.get("status")).toBe("building");
  });

  it("honors seconds and HTTP-date Retry-After values within safe polling bounds", () => {
    const now = Date.parse("2026-08-22T01:00:00.000Z");
    expect(retryAfterMilliseconds("0", now)).toBe(1000);
    expect(retryAfterMilliseconds("5", now)).toBe(5000);
    expect(retryAfterMilliseconds("Sat, 22 Aug 2026 01:00:12 GMT", now)).toBe(12000);
    expect(retryAfterMilliseconds("999", now)).toBe(30000);
    expect(retryAfterMilliseconds("invalid", now)).toBe(2000);
  });
});
