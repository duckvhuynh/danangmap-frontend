import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupStaleEditorWorkspaces,
  clearPrincipalRecovery,
  draftDb,
  draftKey,
  draftMatchesWorkspace,
  shouldAutosaveDraft,
  type FeatureMutationLedgerEntry,
} from "./draft-db";

describe("editor recovery store", () => {
  afterEach(async () => {
    await draftDb.drafts.clear();
    await draftDb.attachmentIntents.clear();
    await draftDb.syncWorkspaces.clear();
    await draftDb.featureMutations.clear();
  });

  it("persists geometry and form state by layer without credentials or file binaries", async () => {
    const id = draftKey("admin-a", "wards", 20);
    await draftDb.drafts.put({
      id,
      principalId: "admin-a",
      layerId: "wards",
      draftRevision: 20,
      baseRevision: 19,
      baseEtag: '"rev-wards-v19"',
      serverCursor: "19",
      updatedAt: "2026-08-21T08:00:00.000Z",
      title: "Ranh giới",
      description: "Bản nháp",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [108.22, 16.06] },
        },
      ],
    });
    const restored = await draftDb.drafts.get(id);
    expect(restored?.baseRevision).toBe(19);
    expect(restored?.features).toHaveLength(1);
    expect(Object.keys(restored ?? {})).not.toContain("token");
    expect(Object.keys(restored ?? {})).not.toContain("file");
  });

  it("keeps a recovered snapshot untouched until resume or discard is chosen", async () => {
    const id = draftKey("admin-a", "wards", 20);
    const recovered = {
      id,
      principalId: "admin-a",
      layerId: "wards",
      draftRevision: 20,
      baseRevision: 19,
      baseEtag: '"rev-wards-v19"',
      serverCursor: "19",
      updatedAt: "2026-08-21T08:00:00.000Z",
      title: "Recovered title",
      description: "Recovered",
      features: [{ id: "saved-feature" }],
    };
    await draftDb.drafts.put(recovered);
    expect(
      shouldAutosaveDraft({ ready: true, recoveryPending: true, dirty: true }),
    ).toBe(false);
    expect((await draftDb.drafts.get(id))?.title).toBe("Recovered title");
  });

  it("separates drafts by principal, layer and draft revision", () => {
    expect(draftKey("admin-a", "wards", 20)).not.toBe(
      draftKey("admin-b", "wards", 20),
    );
    expect(draftKey("admin-a", "wards", 20)).not.toBe(
      draftKey("admin-a", "wards", 21),
    );
  });

  it("blocks direct recovery when the base ETag or server cursor changed", () => {
    const draft = { baseEtag: '"rev-wards-v19"', serverCursor: "19" };
    expect(
      draftMatchesWorkspace(draft, {
        etag: '"rev-wards-v19"',
        serverCursor: "19",
      }),
    ).toBe(true);
    expect(
      draftMatchesWorkspace(draft, {
        etag: '"rev-wards-v20"',
        serverCursor: "20",
      }),
    ).toBe(false);
  });

  it("clears only the active principal recovery after an explicit security logout", async () => {
    const base = {
      layerId: "wards",
      draftRevision: 20,
      baseRevision: 19,
      baseEtag: '"rev-wards-v19"',
      serverCursor: "19",
      updatedAt: "2026-08-21T08:00:00.000Z",
      title: "Ranh giới",
      description: "Bản nháp",
      features: [],
    };
    await draftDb.drafts.bulkPut([
      { ...base, id: draftKey("admin-a", "wards", 20), principalId: "admin-a" },
      { ...base, id: draftKey("admin-b", "wards", 20), principalId: "admin-b" },
    ]);
    await draftDb.attachmentIntents.bulkPut([
      {
        id: "attachment-a",
        principalId: "admin-a",
        revisionId: "revision-1",
        featureId: "feature-1",
        fieldKey: "images",
        uploadId: "upload-a",
        attachmentId: "attachment-a",
        fileName: "ward.png",
        contentType: "image/png",
        sizeBytes: 128,
        sha256: "a".repeat(64),
        phase: "scanning",
        operationKey: "operation-a",
        createdAt: base.updatedAt,
        updatedAt: base.updatedAt,
      },
      {
        id: "attachment-b",
        principalId: "admin-b",
        revisionId: "revision-1",
        featureId: "feature-1",
        fieldKey: "images",
        uploadId: "upload-b",
        attachmentId: "attachment-b",
        fileName: "office.png",
        contentType: "image/png",
        sizeBytes: 128,
        sha256: "b".repeat(64),
        phase: "uploading",
        operationKey: "operation-b",
        createdAt: base.updatedAt,
        updatedAt: base.updatedAt,
      },
    ]);
    await draftDb.syncWorkspaces.bulkPut([
      {
        id: "admin-a:revision-1",
        principalId: "admin-a",
        layerId: "wards",
        revisionId: "revision-1",
        clientId: "client-a",
        baseEtag: '"rev-1-v1"',
        serverCursor: "MQ",
        createdAt: base.updatedAt,
        updatedAt: base.updatedAt,
        lastOpenedAt: base.updatedAt,
      },
      {
        id: "admin-b:revision-1",
        principalId: "admin-b",
        layerId: "wards",
        revisionId: "revision-1",
        clientId: "client-b",
        baseEtag: '"rev-1-v1"',
        serverCursor: "MQ",
        createdAt: base.updatedAt,
        updatedAt: base.updatedAt,
        lastOpenedAt: base.updatedAt,
      },
    ]);
    const ledgerBase: FeatureMutationLedgerEntry = {
      id: "mutation-a",
      workspaceId: "admin-a:revision-1",
      principalId: "admin-a",
      revisionId: "revision-1",
      sequence: 1,
      localFeatureId: "feature-1",
      mutation: {
        clientMutationId: "mutation-a",
        operation: "delete",
        baseRevisionVersion: 1,
        payloadHash: "a".repeat(64),
        featureId: "feature-1",
        baseVersionId: "version-1",
      },
      status: "retry",
      requestEtag: '"rev-1-v1"',
      requestCursor: "MQ",
      attempts: 1,
      response: null,
      responseRequestId: null,
      lastError: {
        status: 0,
        code: "NETWORK_ERROR",
        message: "offline",
      },
      createdAt: base.updatedAt,
      updatedAt: base.updatedAt,
    };
    await draftDb.featureMutations.bulkPut([
      ledgerBase,
      {
        ...ledgerBase,
        id: "mutation-b",
        workspaceId: "admin-b:revision-1",
        principalId: "admin-b",
        mutation: { ...ledgerBase.mutation, clientMutationId: "mutation-b" },
      },
    ]);

    await clearPrincipalRecovery("admin-a");

    expect(
      await draftDb.drafts.get(draftKey("admin-a", "wards", 20)),
    ).toBeUndefined();
    expect(
      await draftDb.drafts.get(draftKey("admin-b", "wards", 20)),
    ).toBeDefined();
    expect(await draftDb.attachmentIntents.get("attachment-a")).toBeUndefined();
    expect(await draftDb.attachmentIntents.get("attachment-b")).toBeDefined();
    expect(
      await draftDb.syncWorkspaces.get("admin-a:revision-1"),
    ).toBeUndefined();
    expect(
      await draftDb.syncWorkspaces.get("admin-b:revision-1"),
    ).toBeDefined();
    expect(await draftDb.featureMutations.get("mutation-a")).toBeUndefined();
    expect(await draftDb.featureMutations.get("mutation-b")).toBeDefined();
  });

  it("stores only resumable attachment metadata, never file bytes or signed URLs", async () => {
    await draftDb.attachmentIntents.put({
      id: "attachment-a",
      principalId: "admin-a",
      revisionId: "revision-1",
      featureId: "feature-1",
      fieldKey: "images",
      uploadId: "upload-a",
      attachmentId: "attachment-a",
      fileName: "ward.png",
      contentType: "image/png",
      sizeBytes: 128,
      sha256: "a".repeat(64),
      phase: "scanning",
      operationKey: "operation-a",
      createdAt: "2026-08-21T08:00:00.000Z",
      updatedAt: "2026-08-21T08:00:00.000Z",
    });

    const persisted = await draftDb.attachmentIntents.get("attachment-a");
    expect(persisted).toBeDefined();
    expect(Object.keys(persisted ?? {})).not.toContain("file");
    expect(Object.keys(persisted ?? {})).not.toContain("uploadUrl");
    expect(JSON.stringify(persisted)).not.toContain("X-Amz-Signature");
  });

  it("removes stale editor workspaces without touching the active or another principal", async () => {
    const old = "2026-01-01T00:00:00.000Z";
    const current = "2026-08-25T00:00:00.000Z";
    await draftDb.syncWorkspaces.bulkPut([
      {
        id: "admin-a:current",
        principalId: "admin-a",
        layerId: "wards",
        revisionId: "current",
        clientId: "client-current",
        baseEtag: '"rev-current-v1"',
        serverCursor: "MQ",
        createdAt: old,
        updatedAt: current,
        lastOpenedAt: current,
      },
      {
        id: "admin-a:stale",
        principalId: "admin-a",
        layerId: "wards",
        revisionId: "stale",
        clientId: "client-stale",
        baseEtag: '"rev-stale-v1"',
        serverCursor: "MQ",
        createdAt: old,
        updatedAt: old,
        lastOpenedAt: old,
      },
      {
        id: "admin-b:stale",
        principalId: "admin-b",
        layerId: "wards",
        revisionId: "stale",
        clientId: "client-other",
        baseEtag: '"rev-stale-v1"',
        serverCursor: "MQ",
        createdAt: old,
        updatedAt: old,
        lastOpenedAt: old,
      },
    ]);

    await expect(
      cleanupStaleEditorWorkspaces(
        "admin-a",
        "admin-a:current",
        new Date("2026-08-01T00:00:00.000Z"),
      ),
    ).resolves.toBe(1);
    expect(await draftDb.syncWorkspaces.get("admin-a:current")).toBeDefined();
    expect(await draftDb.syncWorkspaces.get("admin-a:stale")).toBeUndefined();
    expect(await draftDb.syncWorkspaces.get("admin-b:stale")).toBeDefined();
  });
});
