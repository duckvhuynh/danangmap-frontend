import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EditorMapCanvas from "./editor-map-canvas";

const handlers = vi.hoisted(() => new Map<string, (event: unknown) => void>());
vi.mock("mapbox-gl", () => ({ default: { Map: class {
  on(name: string, callback: (event: unknown) => void) { handlers.set(name, callback); return this; }
  remove() {}
} } }));

afterEach(() => { cleanup(); vi.unstubAllEnvs(); handlers.clear(); });

function props() {
  return { activeTool: "select" as const, restore: { version: 0, features: [] }, deleteRequest: 0, command: { version: 0, type: "undo" as const }, onSelectionChange: vi.fn(), onSnapshot: vi.fn(), onHistoryChange: vi.fn(), onError: vi.fn() };
}

describe("EditorMapCanvas readable fallback", () => {
  it("guides the user without configuration jargon when the map is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "");
    render(<EditorMapCanvas {...props()} />);
    expect(screen.getByText("Bản đồ biên tập chưa sẵn sàng")).toBeInTheDocument();
    expect(screen.getByText(/Liên hệ người quản trị/)).toBeInTheDocument();
    expect(screen.queryByText(/public token|geometry|Metadata/)).not.toBeInTheDocument();
  });

  it("does not expose raw provider errors in the normal user message", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "pk.fixture");
    const callbacks = props();
    render(<EditorMapCanvas {...callbacks} />);
    act(() => handlers.get("error")?.({ error: new Error("HTTP 401 access_token=private-provider-detail") }));
    expect(callbacks.onError).toHaveBeenCalledWith("Chưa tải được bản đồ. Kiểm tra kết nối hoặc tải lại trang để thử lại.");
    expect(callbacks.onError.mock.calls[0][0]).not.toContain("access_token");
  });
});
