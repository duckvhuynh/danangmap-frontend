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

class DanangMapDraftDatabase extends Dexie {
  drafts!: EntityTable<LayerDraft, "id">;

  constructor() {
    super("danangmap-admin-drafts");
    this.version(1).stores({ drafts: "&layerId, updatedAt, baseRevision" });
    this.version(2).stores({ drafts: "&id, principalId, layerId, draftRevision, updatedAt, baseRevision" }).upgrade((transaction) => transaction.table("drafts").clear());
    this.version(3).stores({ drafts: "&id, principalId, layerId, draftRevision, updatedAt, baseRevision" });
  }
}

export const draftDb = new DanangMapDraftDatabase();

export function draftKey(principalId: string, layerId: string, draftRevision: number) {
  return `${principalId}:${layerId}:${draftRevision}`;
}

export function shouldAutosaveDraft({ ready, recoveryPending, dirty }: { ready: boolean; recoveryPending: boolean; dirty: boolean }) {
  return ready && !recoveryPending && dirty;
}

export function draftMatchesWorkspace(draft: Pick<LayerDraft, "baseEtag" | "serverCursor">, workspace: { etag: string; serverCursor: string }) {
  return draft.baseEtag === workspace.etag && draft.serverCursor === workspace.serverCursor;
}

export async function clearPrincipalRecovery(principalId: string) {
  if (!principalId) return;
  await draftDb.drafts.where("principalId").equals(principalId).delete();
}
