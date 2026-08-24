import Dexie, { type EntityTable } from "dexie";

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

class DanangMapDraftDatabase extends Dexie {
  drafts!: EntityTable<LayerDraft, "id">;
  attachmentIntents!: EntityTable<AttachmentRecoveryIntent, "id">;

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
    async () => {
      await draftDb.drafts.where("principalId").equals(principalId).delete();
      await draftDb.attachmentIntents
        .where("principalId")
        .equals(principalId)
        .delete();
    },
  );
}
