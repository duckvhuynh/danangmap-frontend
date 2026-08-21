import { describe, expect, it, vi } from "vitest";
import { pollSpatialImport } from "./import-polling";
import type { SpatialImportJob } from "@/lib/api/imports";

const job = (status: SpatialImportJob["status"]): SpatialImportJob => ({ id: "import-1", revisionId: "revision-1", status, format: "csv", mode: "append", file: { name: "data.csv", sizeBytes: 10 }, progress: status === "ready" ? 100 : 20, counts: {}, inspection: { parserStatus: "inspected", sheets: [], limits: { maxRecords: 100_000, maxVerticesPerFeature: 100_000, maxVerticesPerJob: 2_000_000, maxExpandedBytes: 262_144_000, maxIssues: 20_000 } }, canApplyWithSkipInvalid: false });

describe("import polling", () => {
  it("polls until a terminal workflow state and reports each response", async () => {
    const load = vi.fn().mockResolvedValueOnce(job("validating")).mockResolvedValueOnce(job("ready"));
    const onUpdate = vi.fn();
    await expect(pollSpatialImport("import-1", load, onUpdate, new AbortController().signal, 0)).resolves.toMatchObject({ status: "ready" });
    expect(onUpdate.mock.calls.map(([value]) => value.status)).toEqual(["validating", "ready"]);
  });

  it("stops cleanly when the view unmounts", async () => {
    const controller = new AbortController();
    const load = vi.fn(async () => { controller.abort(); return job("validating"); });
    await expect(pollSpatialImport("import-1", load, vi.fn(), controller.signal, 0)).rejects.toMatchObject({ name: "AbortError" });
  });
});
