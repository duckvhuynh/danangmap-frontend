import { describe, expect, it, vi } from "vitest";
import { applyPendingRestore } from "./restore-controller";

describe("queued Terra Draw recovery", () => {
  it("retains a restore request made before the map is ready and applies it once", () => {
    const request = { version: 1, features: [{ id: "draft-feature" }] };
    const onSnapshot = vi.fn();
    let appliedVersion = applyPendingRestore(null, request, 0, onSnapshot);
    expect(appliedVersion).toBe(0);

    const draw = { enabled: true, clear: vi.fn(), addFeatures: vi.fn(), getSnapshot: vi.fn(() => request.features) };
    appliedVersion = applyPendingRestore(draw, request, appliedVersion, onSnapshot);
    expect(draw.clear).toHaveBeenCalledOnce();
    expect(draw.addFeatures).toHaveBeenCalledWith(request.features);
    expect(onSnapshot).toHaveBeenCalledWith(request.features);
    expect(appliedVersion).toBe(1);

    applyPendingRestore(draw, request, appliedVersion, onSnapshot);
    expect(draw.clear).toHaveBeenCalledOnce();
  });
});
