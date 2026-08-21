import { afterEach, describe, expect, it } from "vitest";
import { draftDb, draftKey, draftMatchesWorkspace, shouldAutosaveDraft } from "./draft-db";

describe("editor recovery store", () => {
  afterEach(async () => { await draftDb.drafts.clear(); });

  it("persists geometry and form state by layer without credentials or file binaries", async () => {
    const id = draftKey("admin-a", "wards", 20);
    await draftDb.drafts.put({ id, principalId: "admin-a", layerId: "wards", draftRevision: 20, baseRevision: 19, baseEtag: '"rev-wards-v19"', serverCursor: "19", updatedAt: "2026-08-21T08:00:00.000Z", title: "Ranh giới", description: "Bản nháp", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [108.22, 16.06] } }] });
    const restored = await draftDb.drafts.get(id);
    expect(restored?.baseRevision).toBe(19);
    expect(restored?.features).toHaveLength(1);
    expect(Object.keys(restored ?? {})).not.toContain("token");
    expect(Object.keys(restored ?? {})).not.toContain("file");
  });

  it("keeps a recovered snapshot untouched until resume or discard is chosen", async () => {
    const id = draftKey("admin-a", "wards", 20);
    const recovered = { id, principalId: "admin-a", layerId: "wards", draftRevision: 20, baseRevision: 19, baseEtag: '"rev-wards-v19"', serverCursor: "19", updatedAt: "2026-08-21T08:00:00.000Z", title: "Recovered title", description: "Recovered", features: [{ id: "saved-feature" }] };
    await draftDb.drafts.put(recovered);
    expect(shouldAutosaveDraft({ ready: true, recoveryPending: true, dirty: true })).toBe(false);
    expect((await draftDb.drafts.get(id))?.title).toBe("Recovered title");
  });

  it("separates drafts by principal, layer and draft revision", () => {
    expect(draftKey("admin-a", "wards", 20)).not.toBe(draftKey("admin-b", "wards", 20));
    expect(draftKey("admin-a", "wards", 20)).not.toBe(draftKey("admin-a", "wards", 21));
  });

  it("blocks direct recovery when the base ETag or server cursor changed", () => {
    const draft = { baseEtag: '"rev-wards-v19"', serverCursor: "19" };
    expect(draftMatchesWorkspace(draft, { etag: '"rev-wards-v19"', serverCursor: "19" })).toBe(true);
    expect(draftMatchesWorkspace(draft, { etag: '"rev-wards-v20"', serverCursor: "20" })).toBe(false);
  });
});
