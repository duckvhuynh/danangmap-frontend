import { describe, expect, it, vi } from "vitest";
import { createDanangMapClient } from "@/lib/api/generated/client";
import { getRevisionDiff, listLayerPublicationHistory, rollbackLayer } from "@/lib/api/history";

const layerId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";
const snapshotId = "33333333-3333-4333-8333-333333333333";
const operationKey = "44444444-4444-4444-8444-444444444444";

function envelope(data: unknown) {
  return JSON.stringify({ data, meta: { requestId: "request-1" } });
}

async function requestParts(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : new Request(input, init);
  const bodyText = request.method === "GET" ? "" : await request.clone().text();
  return {
    url: new URL(request.url),
    method: request.method,
    headers: request.headers,
    body: bodyText ? JSON.parse(bodyText) as unknown : undefined,
  };
}

describe("generated history API adapter", () => {
  it("keeps history and publication-pointer ETags in separate fields", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => { void _input; void _init; return new Response(envelope({
      items: [],
      activePointerEtag: '"pointer-v2"',
      nextCursor: "opaque-next",
      hasMore: true,
      limit: 25,
    }), { status: 200, headers: { "content-type": "application/json", etag: '"history-v7"' } }); });
    const result = await listLayerPublicationHistory(layerId, { cursor: "opaque-input", limit: 25 }, createDanangMapClient(fetcher));
    expect(result).toMatchObject({ historyEtag: '"history-v7"', activePointerEtag: '"pointer-v2"' });
    const request = await requestParts(fetcher.mock.calls[0]![0], fetcher.mock.calls[0]![1]);
    expect(request.url.searchParams.get("cursor")).toBe("opaque-input");
    expect(request.url.pathname).toBe(`/api/v1/admin/layers/${layerId}/publications`);
  });

  it("sends the exact pointer precondition and caller-owned idempotency key on rollback retries", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => { void _input; void _init; return new Response(envelope({
      publicationId: "55555555-5555-4555-8555-555555555555",
      snapshotId: "66666666-6666-4666-8666-666666666666",
      targetSnapshotId: snapshotId,
      generation: 4,
      status: "completed",
      activeRevisionId: revisionId,
    }), { status: 201, headers: { "content-type": "application/json", etag: '"pointer-v3"' } }); });
    const client = createDanangMapClient(fetcher);
    const input = { targetSnapshotId: snapshotId, reason: "Khôi phục dữ liệu đã được đối soát.", clientIntent: "desktop" as const };
    await rollbackLayer(layerId, input, '"pointer-v2"', operationKey, { csrfToken: "csrf-1" }, client);
    await rollbackLayer(layerId, input, '"pointer-v2"', operationKey, { csrfToken: "csrf-1" }, client);

    const requests = await Promise.all(fetcher.mock.calls.map(([request, init]) => requestParts(request, init)));
    expect(requests.map((request) => request.headers.get("idempotency-key"))).toEqual([operationKey, operationKey]);
    expect(requests.map((request) => request.headers.get("if-match"))).toEqual(['"pointer-v2"', '"pointer-v2"']);
    expect(requests[0]?.headers.get("x-csrf-token")).toBe("csrf-1");
    expect(requests[0]?.body).toEqual(input);
  });

  it("preserves typed Problem details for bounded diff errors", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => { void _input; void _init; return new Response(JSON.stringify({
      type: "https://danangmap.local/problems/diff-too-large",
      title: "Diff too large",
      status: 422,
      code: "DIFF_TOO_LARGE",
      message: "Diff vượt giới hạn đồng bộ.",
      details: { featureLimit: 25000, vertexLimit: 2000000, currentFeatureCount: 25001 },
      requestId: "request-diff",
      timestamp: "2026-08-21T00:00:00.000Z",
    }), { status: 422, headers: { "content-type": "application/problem+json" } }); });

    await expect(getRevisionDiff(revisionId, { compareTo: "active" }, createDanangMapClient(fetcher))).rejects.toMatchObject({
      status: 422,
      code: "DIFF_TOO_LARGE",
      requestId: "request-diff",
      details: { featureLimit: 25000, vertexLimit: 2000000, currentFeatureCount: 25001 },
    });
  });
});
