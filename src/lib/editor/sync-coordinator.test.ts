import { afterEach, describe, expect, it, vi } from "vitest";
import { withEditorSyncOwnership } from "./sync-coordinator";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("editor Web Locks ownership", () => {
  it("runs network reconciliation only for the tab that acquired the workspace lock", async () => {
    const request = vi.fn(async (_name, options, callback) => {
      expect(options).toEqual({ mode: "exclusive", ifAvailable: true });
      return callback({ name: "lock" });
    });
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request },
    });
    const task = vi.fn().mockResolvedValue("done");

    await expect(withEditorSyncOwnership("admin:revision", task)).resolves.toEqual(
      { acquired: true, value: "done" },
    );
    expect(task).toHaveBeenCalledOnce();
  });

  it("keeps a second tab as an observer when the lock is unavailable", async () => {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: vi.fn(async (_name, _options, callback) => callback(null)),
      },
    });
    const task = vi.fn();

    await expect(withEditorSyncOwnership("admin:revision", task)).resolves.toEqual(
      { acquired: false },
    );
    expect(task).not.toHaveBeenCalled();
  });
});
