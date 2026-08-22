import { apiClient, apiBaseUrl, createDanangMapClient } from "@/lib/api/generated/client";
import type { operations } from "@/lib/api/generated/schema";
import { AdminApiError, assertAdminResult, type MutationAuth } from "@/lib/api/admin";

type ApiClient = ReturnType<typeof createDanangMapClient>;
type PublishResponse = operations["publishRevision"]["responses"][202]["content"]["application/json"];

export interface SynchronousPublicationResult {
  status: "completed";
  publicationId?: string;
  snapshotId: string;
  generation: number;
}

export type PublicationJob = operations["getPublicationJob"]["responses"][200]["content"]["application/json"]["data"];
export type PublicationJobList = operations["listLayerPublicationJobs"]["responses"][200]["content"]["application/json"]["data"];
export type PublicationJobListQuery = NonNullable<operations["listLayerPublicationJobs"]["parameters"]["query"]>;
export type PublicationJobStatus = PublicationJob["status"];
export type PublicationJobPhase = PublicationJob["phase"];

export interface PublicationJobResource {
  data: PublicationJob;
  etag: string;
  retryAfterMs: number;
  requestId: string;
}

export interface SynchronousPublicationAcceptance {
  mode: "sync";
  data: SynchronousPublicationResult;
  requestId: string;
}

export interface AsynchronousPublicationAcceptance extends PublicationJobResource {
  mode: "async";
}

export type PublicationAcceptance = SynchronousPublicationAcceptance | AsynchronousPublicationAcceptance;

export interface PublicationJobNotModified {
  data: null;
  etag: string;
  retryAfterMs: number;
  notModified: true;
}

export interface PublicationJobListResource {
  data: PublicationJobList;
  etag: string;
  retryAfterMs: number;
  requestId: string;
}

export interface PublicationJobListNotModified {
  data: null;
  etag: string;
  retryAfterMs: number;
  notModified: true;
}

const DEFAULT_POLL_DELAY_MS = 2_000;
const MIN_POLL_DELAY_MS = 1_000;
const MAX_POLL_DELAY_MS = 30_000;
const jobStatuses = new Set<PublicationJobStatus>(["queued", "building", "succeeded", "failed"]);
const jobPhases = new Set<PublicationJobPhase>(["queued", "preparing", "scanning_features", "switching", "completed", "failed"]);
const strongEntityTagPattern = /^"(?:[\u0021\u0023-\u007e\u0080-\u00ff])*"$/u;
const weakEntityTagPattern = /^W\/"(?:[\u0021\u0023-\u007e\u0080-\u00ff])*"$/u;
const httpDatePattern = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function contractError(message: string) {
  return new AdminApiError(502, "PUBLICATION_JOB_CONTRACT_INVALID", message);
}

function requiredHeader(response: Response, name: string) {
  const value = response.headers.get(name);
  if (!value) throw contractError(`API không trả header ${name} cho publication job.`);
  return value;
}

function requiredStrongEtag(response: Response) {
  const value = requiredHeader(response, "etag").trim();
  if (!strongEntityTagPattern.test(value)) throw contractError("Publication job phải trả strong ETag hợp lệ.");
  return value;
}

function requiredPublishRetryAfter(response: Response) {
  const value = requiredHeader(response, "retry-after").trim();
  const deltaSeconds = Number(value);
  const validDeltaSeconds = /^\d+$/u.test(value)
    && Number.isSafeInteger(deltaSeconds)
    && deltaSeconds >= 0;
  const validHttpDate = httpDatePattern.test(value) && Number.isFinite(Date.parse(value));
  if (!validDeltaSeconds && !validHttpDate) throw contractError("Publication job trả Retry-After không hợp lệ.");
  return value;
}

function hasDurableJobHeaders(response: Response) {
  if (response.headers.has("location") || response.headers.has("retry-after")) return true;
  const etag = response.headers.get("etag")?.trim();
  return Boolean(etag && !weakEntityTagPattern.test(etag));
}

function decodeSynchronousPublication(value: unknown): SynchronousPublicationResult | null {
  const input = record(value);
  if (!input || input.status !== "completed") return null;
  const allowedKeys = new Set(["generation", "publicationId", "snapshotId", "status"]);
  if (Object.keys(input).some((key) => !allowedKeys.has(key))) {
    throw contractError("Phản hồi công bố đồng bộ chứa trường không thuộc terminal contract.");
  }
  if (typeof input.snapshotId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.snapshotId)) {
    throw contractError("Phản hồi công bố đồng bộ thiếu snapshot hợp lệ.");
  }
  if (!Number.isInteger(input.generation) || (input.generation as number) < 1) {
    throw contractError("Phản hồi công bố đồng bộ thiếu generation hợp lệ.");
  }
  if ("publicationId" in input && (typeof input.publicationId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(input.publicationId)
    || input.publicationId !== input.snapshotId)) {
    throw contractError("Phản hồi công bố đồng bộ có publicationId không khớp snapshot.");
  }
  return {
    status: "completed",
    ...(typeof input.publicationId === "string" ? { publicationId: input.publicationId } : {}),
    snapshotId: input.snapshotId,
    generation: input.generation as number,
  };
}

export function retryAfterMilliseconds(value: string | null, now = Date.now()) {
  if (!value) return DEFAULT_POLL_DELAY_MS;
  const seconds = Number(value);
  const requested = Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1_000
    : Date.parse(value) - now;
  if (!Number.isFinite(requested)) return DEFAULT_POLL_DELAY_MS;
  return Math.min(MAX_POLL_DELAY_MS, Math.max(MIN_POLL_DELAY_MS, requested));
}

export function decodePublicationJob(value: unknown): PublicationJob {
  const input = record(value);
  const progress = record(input?.progress);
  if (!input || typeof input.id !== "string" || typeof input.layerId !== "string" || typeof input.revisionId !== "string") {
    throw contractError("Publication job thiếu định danh bắt buộc.");
  }
  if (!jobStatuses.has(input.status as PublicationJobStatus) || !jobPhases.has(input.phase as PublicationJobPhase)) {
    throw contractError("Publication job có trạng thái hoặc phase không hợp lệ.");
  }
  if (!progress || !nonnegativeInteger(progress.completedUnits)) {
    throw contractError("Publication job thiếu tiến độ đo được.");
  }
  const totalUnits = progress.totalUnits;
  const percent = progress.percent;
  if (totalUnits !== null && !nonnegativeInteger(totalUnits)) {
    throw contractError("Publication job có tổng số đối tượng không hợp lệ.");
  }
  if (totalUnits !== null && progress.completedUnits > totalUnits) {
    throw contractError("Publication job có số đối tượng hoàn tất lớn hơn tổng số.");
  }
  if (percent !== null && (!nonnegativeInteger(percent) || percent > 100)) {
    throw contractError("Publication job có phần trăm không hợp lệ.");
  }
  // The pinned backend emits 100 only after an empty job is terminal; empty nonterminal work is 0/null.
  const succeededEmptyJob = input.status === "succeeded" && totalUnits === 0 && percent === 100;
  if ((totalUnits === null && percent !== null)
    || (totalUnits === 0 && percent !== null && !succeededEmptyJob)
    || (typeof totalUnits === "number" && totalUnits > 0 && percent === null)) {
    throw contractError("Publication job không nhất quán giữa tổng số và phần trăm.");
  }
  if (progress.unit !== "features" || !nonnegativeInteger(input.attempt)) {
    throw contractError("Publication job có đơn vị hoặc số lần thử không hợp lệ.");
  }
  for (const field of ["createdAt", "updatedAt"] as const) {
    if (typeof input[field] !== "string" || !Number.isFinite(Date.parse(input[field] as string))) {
      throw contractError(`Publication job thiếu thời gian ${field}.`);
    }
  }
  if (input.startedAt !== null && (typeof input.startedAt !== "string" || !Number.isFinite(Date.parse(input.startedAt)))) {
    throw contractError("Publication job có startedAt không hợp lệ.");
  }
  if (input.finishedAt !== null && (typeof input.finishedAt !== "string" || !Number.isFinite(Date.parse(input.finishedAt)))) {
    throw contractError("Publication job có finishedAt không hợp lệ.");
  }
  if (input.status === "succeeded") {
    const result = record(input.result);
    if (input.phase !== "completed" || !result || typeof result.snapshotId !== "string" || !Number.isInteger(result.generation) || (result.generation as number) < 1 || input.failure !== null || input.finishedAt === null) {
      throw contractError("Publication job thành công thiếu kết quả cuối cùng.");
    }
  }
  if (input.status === "failed") {
    const failure = record(input.failure);
    if (input.phase !== "failed" || input.result !== null || input.finishedAt === null || !failure || typeof failure.code !== "string" || !/^[A-Z][A-Z0-9_]{2,99}$/.test(failure.code) || typeof failure.userMessage !== "string" || (failure.requestId !== null && typeof failure.requestId !== "string") || typeof failure.retryable !== "boolean") {
      throw contractError("Publication job thất bại thiếu thông báo an toàn.");
    }
  }
  if ((input.status === "queued" || input.status === "building") && (input.result !== null || input.failure !== null)) {
    throw contractError("Publication job chưa hoàn tất lại chứa kết quả terminal.");
  }
  if (input.status === "queued" && input.phase !== "queued") {
    throw contractError("Publication job queued có phase không hợp lệ.");
  }
  if (input.status === "building" && !["preparing", "scanning_features", "switching"].includes(input.phase as string)) {
    throw contractError("Publication job building có phase không hợp lệ.");
  }
  return value as PublicationJob;
}

function assertJobLocation(location: string, jobId: string) {
  let pathname: string;
  try {
    pathname = new URL(location, `${apiBaseUrl}/`).pathname;
  } catch {
    throw contractError("Location của publication job không hợp lệ.");
  }
  if (pathname !== `/api/v1/admin/publication-jobs/${jobId}`) {
    throw contractError("Location không trỏ tới publication job vừa được nhận.");
  }
}

export async function publishRevision(
  revisionId: string,
  releaseNote: string,
  operationKey: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
  signal?: AbortSignal,
): Promise<PublicationAcceptance> {
  const result = await client.POST("/api/v1/admin/revisions/{revisionId}:publish", {
    params: {
      path: { revisionId },
      header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey },
    },
    body: { releaseNote, clientIntent: "desktop" },
    signal,
  });
  const body = assertAdminResult(result) as PublishResponse;
  if (result.response.status !== 202) {
    throw contractError("API phải trả 202 khi nhận yêu cầu công bố.");
  }
  const candidate = record(body.data);
  const synchronous = decodeSynchronousPublication(candidate);
  if (synchronous) {
    if (hasDurableJobHeaders(result.response)) {
      throw contractError("Phản hồi công bố đồng bộ không được chứa header của publication job.");
    }
    return {
      mode: "sync",
      data: synchronous,
      requestId: body.meta.requestId,
    };
  }
  if (!candidate || typeof candidate.id !== "string") {
    throw contractError("API không trả durable publication job sau khi nhận lệnh công bố.");
  }
  const data = decodePublicationJob(candidate);
  if (data.status !== "queued" || data.phase !== "queued") {
    throw contractError("API 202 phải trả publication job queued/queued chưa hoàn tất.");
  }
  const etag = requiredStrongEtag(result.response);
  const location = requiredHeader(result.response, "location");
  const retryAfter = requiredPublishRetryAfter(result.response);
  assertJobLocation(location, data.id);
  return {
    mode: "async",
    data,
    etag,
    retryAfterMs: retryAfterMilliseconds(retryAfter),
    requestId: body.meta.requestId,
  };
}

export async function getPublicationJob(
  jobId: string,
  options: { etag?: string; signal?: AbortSignal } = {},
  client: ApiClient = apiClient,
): Promise<PublicationJobResource | PublicationJobNotModified> {
  const result = await client.GET("/api/v1/admin/publication-jobs/{jobId}", {
    params: { path: { jobId }, ...(options.etag ? { header: { "If-None-Match": options.etag } } : {}) },
    signal: options.signal,
  });
  const retryAfterMs = retryAfterMilliseconds(result.response.headers.get("retry-after"));
  if (result.response.status === 304) {
    if (!options.etag) throw contractError("API trả 304 khi client chưa gửi ETag.");
    return { data: null, etag: options.etag, retryAfterMs, notModified: true };
  }
  const body = assertAdminResult(result);
  return {
    data: decodePublicationJob(body.data),
    etag: requiredHeader(result.response, "etag"),
    retryAfterMs,
    requestId: body.meta.requestId,
  };
}

export async function listLayerPublicationJobs(
  layerId: string,
  query: PublicationJobListQuery = {},
  options: { etag?: string; signal?: AbortSignal } = {},
  client: ApiClient = apiClient,
): Promise<PublicationJobListResource | PublicationJobListNotModified> {
  const result = await client.GET("/api/v1/admin/layers/{layerId}/publication-jobs", {
    params: {
      path: { layerId },
      query,
      ...(options.etag ? { header: { "If-None-Match": options.etag } } : {}),
    },
    signal: options.signal,
  });
  const retryAfterMs = retryAfterMilliseconds(result.response.headers.get("retry-after"));
  if (result.response.status === 304) {
    if (!options.etag) throw contractError("API trả 304 khi client chưa gửi ETag danh sách.");
    return { data: null, etag: options.etag, retryAfterMs, notModified: true };
  }
  const body = assertAdminResult(result);
  return {
    data: { ...body.data, items: body.data.items.map(decodePublicationJob) },
    etag: requiredHeader(result.response, "etag"),
    retryAfterMs,
    requestId: body.meta.requestId,
  };
}
