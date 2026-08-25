import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AdminFeature,
  FeatureSyncMutation,
  RevisionBundle,
} from "@/lib/api/admin";
import { draftDb } from "@/lib/editor/draft-db";
import {
  discardMutationIssue,
  enqueueEditorSnapshot,
  ensureEditorSyncWorkspace,
  featureMutationPayloadHash,
  listWorkspaceMutations,
  refreshWorkspaceChangeFeed,
  remapSnapshotFeatureIds,
  syncPendingFeatureMutations,
  type DurableSyncApi,
} from "@/lib/editor/durable-sync";
import { adminFeatureToTerra } from "@/lib/editor/editor-sync";

const revisionId = "0192a793-f096-78f6-bad8-e18b9452f8c9";
const existingId = "0192a793-f096-78f6-bad8-e18b9452f8ca";
const deletedId = "0192a793-f096-78f6-bad8-e18b9452f8cb";

function feature(id: string, name: string): AdminFeature {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [108.22, 16.06] },
    properties: { name },
    attachments: [],
    meta: {
      geometryKind: "point",
      radiusM: null,
      externalSource: null,
      externalId: null,
      versionId: randomUUID(),
      updatedAt: "2026-08-25T00:00:00.000Z",
    },
  };
}

function bundle(): RevisionBundle {
  return {
    revision: {
      id: revisionId,
      layerId: randomUUID(),
      revisionNo: 4,
      status: "draft",
      title: "Trụ sở",
      description: "",
      geometryMode: "mixed",
      allowedGeometryKinds: ["point"],
      style: {},
      lockVersion: 8,
      createdBy: randomUUID(),
      updatedAt: "2026-08-25T00:00:00.000Z",
    },
    fields: [
      {
        key: "name",
        label: "Tên",
        type: "text",
        required: true,
        sensitive: false,
        offlineCache: true,
      },
    ],
    workspace: {
      revisionId,
      layerId: randomUUID(),
      status: "draft",
      serverCursor: "OA",
      featureCount: 2,
      bounds: null,
      schemaVersion: 1,
      updatedAt: "2026-08-25T00:00:00.000Z",
    },
    features: [
      feature(existingId, "Tên cũ"),
      feature(deletedId, "Sẽ xóa"),
    ],
    etag: `"rev-${revisionId}-v8"`,
    truncated: false,
  };
}

function desiredSnapshot(input: RevisionBundle) {
  const updated = adminFeatureToTerra(input.features[0])!;
  const createdId = randomUUID();
  return {
    createdId,
    snapshot: [
      {
        ...updated,
        properties: { ...updated.properties, name: "Tên mới" },
      },
      { ...updated, id: createdId, properties: { name: "Tạo mới" } },
    ],
  };
}

afterEach(async () => {
  await draftDb.featureMutations.clear();
  await draftDb.syncWorkspaces.clear();
});

describe("durable editor mutation ledger", () => {
  it("never moves a durable workspace cursor backwards from a stale bundle", async () => {
    const current = bundle();
    const workspace = await ensureEditorSyncWorkspace("admin-a", current);
    await draftDb.syncWorkspaces.put({
      ...workspace,
      baseEtag: `"rev-${revisionId}-v9"`,
      serverCursor: "OQ",
    });

    const reopened = await ensureEditorSyncWorkspace("admin-a", current);

    expect(reopened).toMatchObject({
      baseEtag: `"rev-${revisionId}-v9"`,
      serverCursor: "OQ",
      clientId: workspace.clientId,
    });
  });

  it("adopts a genuinely newer bundle ETag and cursor as one pair", async () => {
    const current = bundle();
    const workspace = await ensureEditorSyncWorkspace("admin-a", current);
    const newer = {
      ...current,
      etag: `"rev-${revisionId}-v9"`,
      workspace: { ...current.workspace, serverCursor: "OQ" },
    };

    const reopened = await ensureEditorSyncWorkspace("admin-a", newer);

    expect(reopened).toMatchObject({
      baseEtag: `"rev-${revisionId}-v9"`,
      serverCursor: "OQ",
      clientId: workspace.clientId,
    });
  });

  it("hashes the canonical payload exactly as the backend contract", async () => {
    const mutation = {
      clientMutationId: revisionId,
      operation: "update" as const,
      baseRevisionVersion: 8,
      featureId: existingId,
      baseVersionId: randomUUID(),
      patch: { properties: { z: 1, a: { y: 2, b: 3 } } },
    };
    const canonical = JSON.stringify({
      baseRevisionVersion: mutation.baseRevisionVersion,
      baseVersionId: mutation.baseVersionId,
      clientMutationId: mutation.clientMutationId,
      featureId: mutation.featureId,
      operation: mutation.operation,
      patch: { properties: { a: { b: 3, y: 2 }, z: 1 } },
    });
    expect(await featureMutationPayloadHash(mutation)).toBe(
      createHash("sha256").update(canonical).digest("hex"),
    );
  });

  it("persists partial acknowledgements, UUID mappings and actionable issues", async () => {
    const current = bundle();
    const desired = desiredSnapshot(current);
    let workspace = await ensureEditorSyncWorkspace("admin-a", current);
    const api = {
      listChanges: vi.fn().mockResolvedValue({
        changes: [],
        meta: { nextCursor: "OA", hasMore: false, limit: 500 },
        etag: current.etag,
      }),
      syncChanges: vi.fn(async (_revisionId, body) => ({
        data: {
          revisionId,
          serverCursor: "OQ",
          results: body.mutations.map((mutation: FeatureSyncMutation) => {
            if (mutation.operation === "create")
              return {
                clientMutationId: mutation.clientMutationId,
                status: "applied" as const,
                operation: "create" as const,
                clientFeatureId: mutation.clientFeatureId!,
                canonicalFeatureId: randomUUID(),
                versionId: randomUUID(),
                serverCursor: "OQ",
              };
            if (mutation.operation === "update")
              return {
                clientMutationId: mutation.clientMutationId,
                status: "conflict" as const,
                operation: "update" as const,
                canonicalFeatureId: mutation.featureId!,
                serverCursor: "OQ",
                conflict: {
                  code: "FEATURE_VERSION_CHANGED" as const,
                  currentVersionId: randomUUID(),
                  changedPaths: ["properties.name"],
                },
              };
            return {
              clientMutationId: mutation.clientMutationId,
              status: "rejected" as const,
              operation: "delete" as const,
              canonicalFeatureId: mutation.featureId!,
              serverCursor: "OQ",
              error: {
                code: "SCHEMA_VIOLATION",
                message: "Không thể xóa.",
                details: {},
              },
            };
          }),
        },
        requestId: "req-partial",
        etag: `"rev-${revisionId}-v9"`,
      })),
    } as unknown as DurableSyncApi;

    workspace = (await refreshWorkspaceChangeFeed(workspace, api)).workspace;
    const queued = await enqueueEditorSnapshot(
      workspace,
      current,
      desired.snapshot,
    );
    expect(queued).toHaveLength(3);
    expect(new Set(queued.map((entry) => entry.id)).size).toBe(3);

    const summary = await syncPendingFeatureMutations(
      workspace.id,
      "csrf",
      api,
    );
    expect(summary).toMatchObject({
      acknowledged: 1,
      conflicts: 1,
      rejected: 1,
      pending: 0,
      requestIds: ["req-partial"],
    });
    expect(summary.mappings[desired.createdId]).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(
      remapSnapshotFeatureIds(desired.snapshot, summary.mappings).some(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          "id" in item &&
          item.id === summary.mappings[desired.createdId],
      ),
    ).toBe(true);
    const persisted = await listWorkspaceMutations(workspace.id);
    expect(persisted.map((entry) => entry.status).sort()).toEqual([
      "acknowledged",
      "conflict",
      "rejected",
    ]);
    expect(persisted.every((entry) => entry.responseRequestId)).toBe(true);
  });

  it("retries an ambiguous failure with the same durable identities and payload hashes", async () => {
    const current = bundle();
    const desired = desiredSnapshot(current);
    const workspace = await ensureEditorSyncWorkspace("admin-a", current);
    const queued = await enqueueEditorSnapshot(workspace, current, [
      desired.snapshot[0],
      adminFeatureToTerra(current.features[1])!,
    ]);
    expect(queued).toHaveLength(1);
    const calls: Array<{ body: unknown; etag: string }> = [];
    const api = {
      listChanges: vi.fn(),
      syncChanges: vi.fn(async (_revisionId, body, etag) => {
        calls.push({ body: structuredClone(body), etag });
        if (calls.length === 1) throw new TypeError("Failed to fetch");
        const mutation = body.mutations[0]!;
        return {
          data: {
            revisionId,
            serverCursor: "OQ",
            results: [
              {
                clientMutationId: mutation.clientMutationId,
                status: "applied" as const,
                operation: "update" as const,
                clientFeatureId: null,
                canonicalFeatureId: mutation.featureId!,
                versionId: randomUUID(),
                serverCursor: "OQ",
              },
            ],
          },
          requestId: "req-replay",
          etag: `"rev-${revisionId}-v9"`,
        };
      }),
    } as unknown as DurableSyncApi;

    await expect(
      syncPendingFeatureMutations(workspace.id, "csrf", api),
    ).rejects.toThrow("Failed to fetch");
    expect((await listWorkspaceMutations(workspace.id))[0]).toMatchObject({
      status: "retry",
      attempts: 1,
    });

    await syncPendingFeatureMutations(workspace.id, "csrf", api);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
  });

  it("lets the operator discard one conflict receipt without deleting other edits", async () => {
    const current = bundle();
    const desired = desiredSnapshot(current);
    const workspace = await ensureEditorSyncWorkspace("admin-a", current);
    const [entry] = await enqueueEditorSnapshot(workspace, current, [
      desired.snapshot[0],
      adminFeatureToTerra(current.features[1])!,
    ]);
    await draftDb.featureMutations.update(entry!.id, { status: "conflict" });

    await discardMutationIssue(entry!.id);

    expect(await draftDb.featureMutations.get(entry!.id)).toMatchObject({
      status: "discarded",
    });
  });
});
