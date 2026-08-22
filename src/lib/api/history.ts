import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { components, operations } from "@/lib/api/generated/schema";
import { AdminApiError, assertAdminResult, type MutationAuth } from "@/lib/api/admin";

type ApiClient = ReturnType<typeof createDanangMapClient>;

export type LayerRevisionHistoryQuery = NonNullable<operations["listLayerRevisionHistory"]["parameters"]["query"]>;
export type LayerRevisionHistory = operations["listLayerRevisionHistory"]["responses"][200]["content"]["application/json"]["data"];
export type RevisionHistory = operations["getRevisionHistory"]["responses"][200]["content"]["application/json"]["data"];
export type RevisionDiffQuery = NonNullable<operations["getRevisionDiff"]["parameters"]["query"]>;
export type RevisionDiff = operations["getRevisionDiff"]["responses"][200]["content"]["application/json"]["data"];
export type LayerPublicationHistoryQuery = NonNullable<operations["listLayerPublicationHistory"]["parameters"]["query"]>;
export type LayerPublicationHistory = operations["listLayerPublicationHistory"]["responses"][200]["content"]["application/json"]["data"];
export type PublicationHistory = operations["getPublicationHistory"]["responses"][200]["content"]["application/json"]["data"];
export type AuditQuery = NonNullable<operations["listLayerAuditEvents"]["parameters"]["query"]>;
export type AuditEvents = operations["listLayerAuditEvents"]["responses"][200]["content"]["application/json"]["data"];
export type SystemAuditQuery = NonNullable<operations["listAuditEvents"]["parameters"]["query"]>;
export type SystemAuditEvents = operations["listAuditEvents"]["responses"][200]["content"]["application/json"]["data"];
export type WorkflowEventsQuery = NonNullable<operations["listRevisionWorkflowEvents"]["parameters"]["query"]>;
export type WorkflowEvents = operations["listRevisionWorkflowEvents"]["responses"][200]["content"]["application/json"]["data"];
export type RollbackInput = components["schemas"]["RollbackDto"];
export type RollbackResult = operations["rollbackLayer"]["responses"][201]["content"]["application/json"]["data"];

export interface HistoryResource<T> {
  data: T;
  historyEtag: string;
}

export interface PublicationHistoryResource extends HistoryResource<LayerPublicationHistory> {
  activePointerEtag: string | null;
}

function requiredHistoryEtag(response: Response) {
  const etag = response.headers.get("etag");
  if (!etag) throw new AdminApiError(502, "HISTORY_ETAG_MISSING", "API không trả ETag cho lịch sử được yêu cầu.");
  return etag;
}

export async function listLayerRevisionHistory(
  layerId: string,
  query: LayerRevisionHistoryQuery = {},
  client: ApiClient = apiClient,
): Promise<HistoryResource<LayerRevisionHistory>> {
  const result = await client.GET("/api/v1/admin/layers/{layerId}/history", { params: { path: { layerId }, query } });
  const body = assertAdminResult(result);
  return { data: body.data, historyEtag: requiredHistoryEtag(result.response) };
}

export async function getRevisionHistory(
  revisionId: string,
  client: ApiClient = apiClient,
): Promise<HistoryResource<RevisionHistory>> {
  const result = await client.GET("/api/v1/admin/revisions/{revisionId}/history", { params: { path: { revisionId } } });
  const body = assertAdminResult(result);
  return { data: body.data, historyEtag: requiredHistoryEtag(result.response) };
}

export async function getRevisionDiff(
  revisionId: string,
  query: RevisionDiffQuery = {},
  client: ApiClient = apiClient,
): Promise<HistoryResource<RevisionDiff>> {
  const result = await client.GET("/api/v1/admin/revisions/{revisionId}/diff", { params: { path: { revisionId }, query } });
  const body = assertAdminResult(result);
  return { data: body.data, historyEtag: requiredHistoryEtag(result.response) };
}

export async function listLayerPublicationHistory(
  layerId: string,
  query: LayerPublicationHistoryQuery = {},
  client: ApiClient = apiClient,
): Promise<PublicationHistoryResource> {
  const result = await client.GET("/api/v1/admin/layers/{layerId}/publications", { params: { path: { layerId }, query } });
  const body = assertAdminResult(result);
  return {
    data: body.data,
    historyEtag: requiredHistoryEtag(result.response),
    activePointerEtag: body.data.activePointerEtag,
  };
}

export async function getPublicationHistory(
  snapshotId: string,
  client: ApiClient = apiClient,
): Promise<HistoryResource<PublicationHistory>> {
  const result = await client.GET("/api/v1/admin/publications/{snapshotId}", { params: { path: { snapshotId } } });
  const body = assertAdminResult(result);
  return { data: body.data, historyEtag: requiredHistoryEtag(result.response) };
}

export async function listLayerAuditEvents(
  layerId: string,
  query: AuditQuery = {},
  client: ApiClient = apiClient,
): Promise<HistoryResource<AuditEvents>> {
  const result = await client.GET("/api/v1/admin/layers/{layerId}/audit-events", { params: { path: { layerId }, query } });
  const body = assertAdminResult(result);
  return { data: body.data, historyEtag: requiredHistoryEtag(result.response) };
}

export async function listAuditEvents(
  query: SystemAuditQuery = {},
  client: ApiClient = apiClient,
): Promise<HistoryResource<SystemAuditEvents>> {
  const result = await client.GET("/api/v1/admin/audit-events", { params: { query } });
  const body = assertAdminResult(result);
  return { data: body.data, historyEtag: requiredHistoryEtag(result.response) };
}

export async function listRevisionWorkflowEvents(
  revisionId: string,
  query: WorkflowEventsQuery = {},
  client: ApiClient = apiClient,
): Promise<HistoryResource<WorkflowEvents>> {
  const result = await client.GET("/api/v1/admin/revisions/{revisionId}/workflow-events", { params: { path: { revisionId }, query } });
  const body = assertAdminResult(result);
  return { data: body.data, historyEtag: requiredHistoryEtag(result.response) };
}

export async function rollbackLayer(
  layerId: string,
  input: RollbackInput,
  activePointerEtag: string,
  idempotencyKey: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
): Promise<{ data: RollbackResult; activePointerEtag: string }> {
  const result = await client.POST("/api/v1/admin/layers/{layerId}:rollback", {
    params: {
      path: { layerId },
      header: {
        "X-CSRF-Token": auth.csrfToken,
        "Idempotency-Key": idempotencyKey,
        "If-Match": activePointerEtag,
      },
    },
    body: input,
  });
  const body = assertAdminResult(result);
  const nextPointerEtag = result.response.headers.get("etag");
  if (!nextPointerEtag) throw new AdminApiError(502, "PUBLICATION_POINTER_ETAG_MISSING", "API không trả ETag của publication pointer sau rollback.");
  return { data: body.data, activePointerEtag: nextPointerEtag };
}
