import { afterEach, describe, expect, it } from "vitest";
import {
  clearPrincipalRecovery,
  draftDb,
  draftKey,
  draftMatchesWorkspace,
  shouldAutosaveDraft,
} from "./draft-db";

describe("editor recovery store", () => {
  afterEach(async () => {
    await draftDb.drafts.clear();
    await draftDb.attachmentIntents.clear();
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

    await clearPrincipalRecovery("admin-a");

    expect(
      await draftDb.drafts.get(draftKey("admin-a", "wards", 20)),
    ).toBeUndefined();
    expect(
      await draftDb.drafts.get(draftKey("admin-b", "wards", 20)),
    ).toBeDefined();
    expect(await draftDb.attachmentIntents.get("attachment-a")).toBeUndefined();
    expect(await draftDb.attachmentIntents.get("attachment-b")).toBeDefined();
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
});
