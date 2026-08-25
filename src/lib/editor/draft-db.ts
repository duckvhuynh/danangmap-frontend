import Dexie, { type EntityTable } from "dexie";
import type {
  FeatureSyncMutation,
  FeatureSyncResult,
} from "@/lib/api/admin";

export interface LayerDraft {
  id: string;
  principalId: string;
  layerId: string;
  draftRevision: number;
  baseRevision: number;
  baseEtag: string;
  serverCursor: string;
  updatedAt: string;
  title: string;
  description: string;
  features: unknown[];
  operationKeys?: Record<string, string>;
}

export type AttachmentRecoveryPhase = "uploading" | "scanning" | "binding";

export interface AttachmentRecoveryIntent {
  id: string;
  principalId: string;
  revisionId: string;
  featureId: string;
  fieldKey: string;
  uploadId: string;
  attachmentId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  phase: AttachmentRecoveryPhase;
  operationKey: string;
  createdAt: string;
  updatedAt: string;
}

export type FeatureMutationStatus =
  | "pending"
  | "syncing"
  | "retry"
  | "acknowledged"
  | "conflict"
  | "rejected"
  | "discarded";

export interface EditorSyncWorkspace {
  id: string;
  principalId: string;
  layerId: string;
  revisionId: string;
  clientId: string;
  baseEtag: string;
  serverCursor: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface FeatureMutationLedgerEntry {
  id: string;
  workspaceId: string;
  principalId: string;
  revisionId: string;
  sequence: number;
  localFeatureId: string;
  mutation: FeatureSyncMutation;
  status: FeatureMutationStatus;
  requestEtag: string | null;
  requestCursor: string | null;
  attempts: number;
  response: FeatureSyncResult | null;
  responseRequestId: string | null;
  lastError: {
    status: number;
    code: string;
    message: string;
    requestId?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

class DanangMapDraftDatabase extends Dexie {
  drafts!: EntityTable<LayerDraft, "id">;
  attachmentIntents!: EntityTable<AttachmentRecoveryIntent, "id">;
  syncWorkspaces!: EntityTable<EditorSyncWorkspace, "id">;
  featureMutations!: EntityTable<FeatureMutationLedgerEntry, "id">;

  constructor() {
    super("danangmap-admin-drafts");
    this.version(1).stores({ drafts: "&layerId, updatedAt, baseRevision" });
    this.version(2)
      .stores({
        drafts:
          "&id, principalId, layerId, draftRevision, updatedAt, baseRevision",
      })
      .upgrade((transaction) => transaction.table("drafts").clear());
    this.version(3).stores({
      drafts:
        "&id, principalId, layerId, draftRevision, updatedAt, baseRevision",
    });
    this.version(4).stores({
      drafts:
        "&id, principalId, layerId, draftRevision, updatedAt, baseRevision",
      attachmentIntents:
        "&id, principalId, revisionId, featureId, attachmentId, phase, updatedAt",
    });
    this.version(5).stores({
      drafts:
        "&id, principalId, layerId, draftRevision, updatedAt, baseRevision",
      attachmentIntents:
        "&id, principalId, revisionId, featureId, attachmentId, phase, updatedAt",
      syncWorkspaces:
        "&id, principalId, layerId, revisionId, updatedAt, lastOpenedAt",
      featureMutations:
        "&id, workspaceId, principalId, revisionId, status, [workspaceId+sequence], updatedAt",
    });
  }
}

export const draftDb = new DanangMapDraftDatabase();

export function draftKey(
  principalId: string,
  layerId: string,
  draftRevision: number,
) {
  return `${principalId}:${layerId}:${draftRevision}`;
}

export function syncWorkspaceKey(principalId: string, revisionId: string) {
  return `${principalId}:${revisionId}`;
}

export function shouldAutosaveDraft({
  ready,
  recoveryPending,
  dirty,
}: {
  ready: boolean;
  recoveryPending: boolean;
  dirty: boolean;
}) {
  return ready && !recoveryPending && dirty;
}

export function draftMatchesWorkspace(
  draft: Pick<LayerDraft, "baseEtag" | "serverCursor">,
  workspace: { etag: string; serverCursor: string },
) {
  return (
    draft.baseEtag === workspace.etag &&
    draft.serverCursor === workspace.serverCursor
  );
}

export async function clearPrincipalRecovery(principalId: string) {
  if (!principalId) return;
  await draftDb.transaction(
    "rw",
    draftDb.drafts,
    draftDb.attachmentIntents,
    draftDb.syncWorkspaces,
    draftDb.featureMutations,
    async () => {
      await draftDb.drafts.where("principalId").equals(principalId).delete();
      await draftDb.attachmentIntents
        .where("principalId")
        .equals(principalId)
        .delete();
      await draftDb.syncWorkspaces
        .where("principalId")
        .equals(principalId)
        .delete();
      await draftDb.featureMutations
        .where("principalId")
        .equals(principalId)
        .delete();
    },
  );
}

export async function cleanupStaleEditorWorkspaces(
  principalId: string,
  currentWorkspaceId: string,
  olderThan = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
) {
  const stale = await draftDb.syncWorkspaces
    .where("principalId")
    .equals(principalId)
    .filter(
      (workspace) =>
        workspace.id !== currentWorkspaceId &&
        new Date(workspace.lastOpenedAt).getTime() < olderThan.getTime(),
    )
    .primaryKeys();
  if (!stale.length) return 0;
  await draftDb.transaction(
    "rw",
    draftDb.syncWorkspaces,
    draftDb.featureMutations,
    async () => {
      await draftDb.syncWorkspaces.bulkDelete(stale);
      for (const workspaceId of stale)
        await draftDb.featureMutations
          .where("workspaceId")
          .equals(workspaceId)
          .delete();
    },
  );
  return stale.length;
}
