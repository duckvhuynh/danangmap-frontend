import { describe, expect, it, vi } from "vitest";
import type { UserImportJob } from "@/lib/api/user-imports";
import { pollUserImport } from "./user-import-polling";
import { MAX_USER_IMPORT_BYTES } from "./user-import-state";

const job = (status: UserImportJob["status"]): UserImportJob => ({
  id: "11111111-1111-4111-8111-111111111111",
  status,
  format: "csv",
  file: { name: "users.csv", sizeBytes: 100 },
  progress: status === "completed" ? 100 : 10,
  counts: { total: 1, valid: 1, invalid: 0, applied: status === "completed" ? 1 : 0, skipped: 0 },
  inspection: { sheets: [], selectedSheet: null, limits: { maxBytes: MAX_USER_IMPORT_BYTES, maxRows: 5_000, maxSheets: 10, maxColumns: 4, maxExpandedBytes: 52_428_800 } },
  validRowPolicy: "invite",
  failureCode: null,
  createdAt: "2026-08-21T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z",
});

describe("user import polling", () => {
  it("stops at the first actionable state", async () => {
    const get = vi.fn().mockResolvedValueOnce(job("inspecting")).mockResolvedValueOnce(job("inspected"));
    await expect(pollUserImport({ get }, job("uploaded"), { intervalMs: 0 })).resolves.toMatchObject({ status: "inspected" });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("honors abort before another request", async () => {
    const controller = new AbortController();
    controller.abort();
    const get = vi.fn();
    await expect(pollUserImport({ get }, job("uploaded"), { intervalMs: 0, signal: controller.signal })).rejects.toHaveProperty("name", "AbortError");
    expect(get).not.toHaveBeenCalled();
  });

  it("turns a long-running job into an actionable polling error", async () => {
    const get = vi.fn().mockResolvedValue(job("inspecting"));
    await expect(pollUserImport({ get }, job("uploaded"), { intervalMs: 0, maxPolls: 2 })).rejects.toThrow("quá thời gian chờ");
    expect(get).toHaveBeenCalledTimes(2);
  });
});
