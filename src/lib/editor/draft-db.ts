import Dexie, { type EntityTable } from "dexie";

export interface LayerDraft {
  id: string;
  principalId: string;
  layerId: string;
  draftRevision: number;
  baseRevision: number;
  updatedAt: string;
  title: string;
  description: string;
  features: unknown[];
}

class DanangMapDraftDatabase extends Dexie {
  drafts!: EntityTable<LayerDraft, "id">;

  constructor() {
    super("danangmap-admin-drafts");
    this.version(1).stores({ drafts: "&layerId, updatedAt, baseRevision" });
    this.version(2).stores({ drafts: "&id, principalId, layerId, draftRevision, updatedAt, baseRevision" }).upgrade((transaction) => transaction.table("drafts").clear());
  }
}

export const draftDb = new DanangMapDraftDatabase();

export function draftKey(principalId: string, layerId: string, draftRevision: number) {
  return `${principalId}:${layerId}:${draftRevision}`;
}

export function shouldAutosaveDraft({ ready, recoveryPending, dirty }: { ready: boolean; recoveryPending: boolean; dirty: boolean }) {
  return ready && !recoveryPending && dirty;
}
