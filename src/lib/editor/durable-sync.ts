import {
  AdminApiError,
  listAdminRevisionChanges,
  syncAdminFeatureChanges,
  type FeatureSyncMutation,
  type RevisionBundle,
} from "@/lib/api/admin";
import {
  draftDb,
  syncWorkspaceKey,
  type EditorSyncWorkspace,
  type FeatureMutationLedgerEntry,
} from "@/lib/editor/draft-db";
import { diffEditorFeatures } from "@/lib/editor/editor-sync";

const BATCH_SIZE = 100;
const terminalStatuses = new Set(["acknowledged", "discarded"]);
const issueStatuses = new Set(["conflict", "rejected"]);

export type DurableSyncApi = {
  listChanges: typeof listAdminRevisionChanges;
  syncChanges: typeof syncAdminFeatureChanges;
};

const defaultApi: DurableSyncApi = {
  listChanges: listAdminRevisionChanges,
  syncChanges: syncAdminFeatureChanges,
};

export type DurableSyncSummary = {
  acknowledged: number;
  conflicts: number;
  rejected: number;
  pending: number;
  mappings: Record<string, string>;
  requestIds: string[];
  etag: string;
  serverCursor: string;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

export async function featureMutationPayloadHash(
  mutation: Omit<FeatureSyncMutation, "payloadHash"> | FeatureSyncMutation,
) {
  const payload = structuredClone(mutation) as Record<string, unknown>;
  delete payload.payloadHash;
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(payload)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function revisionVersionFromEtag(etag: string) {
  const match = /-v(\d+)"?$/.exec(etag);
  const value = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("ETag revision không hợp lệ.");
  return value;
}

export async function ensureEditorSyncWorkspace(
  principalId: string,
  bundle: RevisionBundle,
) {
  const id = syncWorkspaceKey(principalId, bundle.revision.id);
  const existing = await draftDb.syncWorkspaces.get(id);
  const now = new Date().toISOString();
  const workspace: EditorSyncWorkspace = {
    id,
    principalId,
    layerId: bundle.workspace.layerId,
    revisionId: bundle.revision.id,
    clientId: existing?.clientId ?? crypto.randomUUID(),
    baseEtag: bundle.etag,
    serverCursor: bundle.workspace.serverCursor,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastOpenedAt: now,
  };
  await draftDb.syncWorkspaces.put(workspace);
  return workspace;
}

export async function refreshWorkspaceChangeFeed(
  workspace: EditorSyncWorkspace,
  api: DurableSyncApi = defaultApi,
) {
  let after = workspace.serverCursor;
  let etag = workspace.baseEtag;
  let remoteChanges = 0;
  for (;;) {
    const page = await api.listChanges(workspace.revisionId, after, 500);
    remoteChanges += page.changes.length;
    after = page.meta.nextCursor;
    etag = page.etag ?? etag;
    if (!page.meta.hasMore) break;
  }
  const updated = {
    ...workspace,
    baseEtag: etag,
    serverCursor: after,
    updatedAt: new Date().toISOString(),
  };
  await draftDb.syncWorkspaces.put(updated);
  return { workspace: updated, remoteChanges };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function withHash(
  mutation: Omit<FeatureSyncMutation, "payloadHash">,
): Promise<FeatureSyncMutation> {
  return { ...mutation, payloadHash: await featureMutationPayloadHash(mutation) };
}

export async function listWorkspaceMutations(workspaceId: string) {
  return draftDb.featureMutations
    .where("workspaceId")
    .equals(workspaceId)
    .sortBy("sequence");
}

export function acknowledgedFeatureMappings(
  entries: FeatureMutationLedgerEntry[],
) {
  return Object.fromEntries(
    entries.flatMap((entry) =>
      entry.status === "acknowledged" && entry.response?.status === "applied"
        ? [[entry.localFeatureId, entry.response.canonicalFeatureId] as const]
        : [],
    ),
  );
}

export async function enqueueEditorSnapshot(
  workspace: EditorSyncWorkspace,
  bundle: RevisionBundle,
  snapshot: unknown[],
) {
  const existing = await listWorkspaceMutations(workspace.id);
  const blocking = existing.filter(
    (entry) => !terminalStatuses.has(entry.status),
  );
  if (blocking.length) return blocking;

  const diff = diffEditorFeatures(
    bundle.features,
    snapshot,
    bundle.fields.map((field) => field.key),
  );
  const baseRevisionVersion = revisionVersionFromEtag(workspace.baseEtag);
  const now = new Date().toISOString();
  const lastSequence = existing.at(-1)?.sequence ?? 0;
  const inputs: Array<{
    localFeatureId: string;
    mutation: Omit<FeatureSyncMutation, "payloadHash">;
  }> = [
    ...diff.creates.map((item) => ({
      localFeatureId: item.clientId,
      mutation: {
        clientMutationId: crypto.randomUUID(),
        operation: "create" as const,
        baseRevisionVersion,
        clientFeatureId: isUuid(item.clientId)
          ? item.clientId
          : crypto.randomUUID(),
        feature: item.dto,
      },
    })),
    ...diff.updates.map((item) => {
      const current = bundle.features.find(
        (feature) => feature.id === item.featureId,
      );
      if (!current) throw new Error("Không tìm thấy feature gốc để đồng bộ.");
      return {
        localFeatureId: item.featureId,
        mutation: {
          clientMutationId: crypto.randomUUID(),
          operation: "update" as const,
          baseRevisionVersion,
          featureId: item.featureId,
          baseVersionId: current.meta.versionId,
          patch: item.dto,
        },
      };
    }),
    ...diff.deletes.map((item) => {
      const current = bundle.features.find(
        (feature) => feature.id === item.featureId,
      );
      if (!current) throw new Error("Không tìm thấy feature gốc để xóa.");
      return {
        localFeatureId: item.featureId,
        mutation: {
          clientMutationId: crypto.randomUUID(),
          operation: "delete" as const,
          baseRevisionVersion,
          featureId: item.featureId,
          baseVersionId: current.meta.versionId,
        },
      };
    }),
  ];
  const entries: FeatureMutationLedgerEntry[] = await Promise.all(
    inputs.map(async (input, index) => ({
      id: input.mutation.clientMutationId,
      workspaceId: workspace.id,
      principalId: workspace.principalId,
      revisionId: workspace.revisionId,
      sequence: lastSequence + index + 1,
      localFeatureId: input.localFeatureId,
      mutation: await withHash(input.mutation),
      status: "pending" as const,
      requestEtag: null,
      requestCursor: null,
      attempts: 0,
      response: null,
      responseRequestId: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })),
  );
  if (entries.length) await draftDb.featureMutations.bulkAdd(entries);
  return entries;
}

function apiError(error: unknown) {
  if (error instanceof AdminApiError)
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      requestId: error.requestId,
    };
  return {
    status: 0,
    code: "NETWORK_ERROR",
    message:
      error instanceof Error
        ? error.message
        : "Không thể kết nối dịch vụ đồng bộ.",
  };
}

async function prepareFreshBatch(
  entries: FeatureMutationLedgerEntry[],
  workspace: EditorSyncWorkspace,
) {
  const baseRevisionVersion = revisionVersionFromEtag(workspace.baseEtag);
  const now = new Date().toISOString();
  return Promise.all(
    entries.map(async (entry) => {
      const { payloadHash, ...payload } = entry.mutation;
      void payloadHash;
      const mutation = await withHash({
        ...payload,
        baseRevisionVersion,
      });
      return {
        ...entry,
        mutation,
        requestEtag: workspace.baseEtag,
        requestCursor: workspace.serverCursor,
        updatedAt: now,
      };
    }),
  );
}

export async function syncPendingFeatureMutations(
  workspaceId: string,
  csrfToken: string,
  api: DurableSyncApi = defaultApi,
): Promise<DurableSyncSummary> {
  let workspace = await draftDb.syncWorkspaces.get(workspaceId);
  if (!workspace) throw new Error("Không tìm thấy workspace đồng bộ.");
  const mappings: Record<string, string> = {};
  const requestIds = new Set<string>();
  let acknowledged = 0;

  await draftDb.featureMutations
    .where("workspaceId")
    .equals(workspaceId)
    .filter((entry) => entry.status === "syncing")
    .modify({ status: "retry" });

  for (;;) {
    const all = await listWorkspaceMutations(workspaceId);
    const retry = all.find((entry) => entry.status === "retry");
    let batch = retry
      ? all.filter(
          (entry) =>
            entry.status === "retry" &&
            entry.requestEtag === retry.requestEtag &&
            entry.requestCursor === retry.requestCursor,
        )
      : all.filter((entry) => entry.status === "pending");
    batch = batch.slice(0, BATCH_SIZE);
    if (!batch.length) break;

    if (!retry) {
      batch = await prepareFreshBatch(batch, workspace);
      await draftDb.featureMutations.bulkPut(batch);
    }
    const requestEtag = batch[0]?.requestEtag;
    const requestCursor = batch[0]?.requestCursor;
    if (!requestEtag || !requestCursor)
      throw new Error("Ledger thiếu ETag hoặc cursor của request.");
    const startedAt = new Date().toISOString();
    await draftDb.featureMutations.bulkPut(
      batch.map((entry) => ({
        ...entry,
        status: "syncing",
        attempts: entry.attempts + 1,
        lastError: null,
        updatedAt: startedAt,
      })),
    );

    let response: Awaited<ReturnType<typeof syncAdminFeatureChanges>>;
    try {
      response = await api.syncChanges(
        workspace.revisionId,
        {
          clientId: workspace.clientId,
          origin: "editor",
          baseCursor: requestCursor,
          mutations: batch.map((entry) => entry.mutation),
        },
        requestEtag,
        { csrfToken },
      );
    } catch (error) {
      const failure = apiError(error);
      await draftDb.featureMutations.bulkPut(
        batch.map((entry) => ({
          ...entry,
          status: "retry",
          attempts: entry.attempts + 1,
          lastError: failure,
          updatedAt: new Date().toISOString(),
        })),
      );
      throw error;
    }

    requestIds.add(response.requestId);
    const resultById = new Map(
      response.data.results.map((result) => [result.clientMutationId, result]),
    );
    const completedAt = new Date().toISOString();
    await draftDb.featureMutations.bulkPut(
      batch.map((entry) => {
        const result = resultById.get(entry.id);
        if (!result)
          return {
            ...entry,
            status: "retry" as const,
            attempts: entry.attempts + 1,
            lastError: {
              status: 502,
              code: "SYNC_RESULT_MISSING",
              message: "Máy chủ không trả kết quả cho mutation.",
              requestId: response.requestId,
            },
            updatedAt: completedAt,
          };
        if (result.status === "applied") {
          mappings[entry.localFeatureId] = result.canonicalFeatureId;
          acknowledged += 1;
        }
        return {
          ...entry,
          status:
            result.status === "applied"
              ? ("acknowledged" as const)
              : result.status,
          attempts: entry.attempts + 1,
          response: result,
          responseRequestId: response.requestId,
          lastError: null,
          updatedAt: completedAt,
        };
      }),
    );
    workspace = {
      ...workspace,
      baseEtag: response.etag,
      serverCursor: response.data.serverCursor,
      updatedAt: completedAt,
    };
    await draftDb.syncWorkspaces.put(workspace);
  }

  const all = await listWorkspaceMutations(workspaceId);
  Object.assign(mappings, acknowledgedFeatureMappings(all));
  return {
    acknowledged,
    conflicts: all.filter((entry) => entry.status === "conflict").length,
    rejected: all.filter((entry) => entry.status === "rejected").length,
    pending: all.filter(
      (entry) =>
        !terminalStatuses.has(entry.status) && !issueStatuses.has(entry.status),
    ).length,
    mappings,
    requestIds: [...requestIds],
    etag: workspace.baseEtag,
    serverCursor: workspace.serverCursor,
  };
}

export async function discardMutationIssue(mutationId: string) {
  const mutation = await draftDb.featureMutations.get(mutationId);
  if (!mutation || !issueStatuses.has(mutation.status)) return;
  await draftDb.featureMutations.update(mutationId, {
    status: "discarded",
    updatedAt: new Date().toISOString(),
  });
}

export async function activeWorkspaceIssues(workspaceId: string) {
  return (await listWorkspaceMutations(workspaceId)).filter((entry) =>
    issueStatuses.has(entry.status),
  );
}

export function remapSnapshotFeatureIds(
  snapshot: unknown[],
  mappings: Record<string, string>,
) {
  return snapshot.map((value) => {
    if (!value || typeof value !== "object" || !("id" in value)) return value;
    const feature = value as { id?: unknown };
    const canonicalId = mappings[String(feature.id)];
    return canonicalId ? { ...feature, id: canonicalId } : value;
  });
}
