import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicSearchResponse, PublicSearchResult } from "@/lib/api/public-search";
import { PublicSearchCombobox } from "./public-search-combobox";

function item(source: "internal" | "geo_service", id: string, title: string): PublicSearchResult {
  return { id, source, kind: source === "internal" ? "feature" : "place", title, subtitle: source === "internal" ? "Trụ sở hành chính" : "Hải Châu, Đà Nẵng", position: { longitude: 108.22, latitude: 16.06 }, layer: source === "internal" ? { slug: "tru-so" } : null, featureId: source === "internal" ? "11111111-1111-4111-8111-111111111111" : null, providerPlaceId: source === "geo_service" ? id : null, score: 1, highlights: [] };
}

function response(results: PublicSearchResult[], partial = false): PublicSearchResponse {
  return { results, meta: { partial, sources: { internal: { status: "ok", count: results.filter((entry) => entry.source === "internal").length }, place: { status: partial ? "unavailable" : "ok", count: results.filter((entry) => entry.source === "geo_service").length } }, warnings: partial ? [{ code: "PLACE_UNAVAILABLE", message: "unavailable" }] : [], nextCursor: null, requestId: "request-1" } };
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("accessible combined public search", () => {
  it("debounces, groups partial results and selects through aria-activedescendant keyboard behavior", async () => {
    const search = vi.fn(async () => response([item("internal", "feature-1", "Trung tâm Hành chính"), item("geo_service", "place-1", "Cầu Rồng")], true));
    const onSelect = vi.fn();
    render(<PublicSearchCombobox search={search} debounceMs={0} onSelect={onSelect} />);
    const input = screen.getByRole("combobox", { name: "Tìm địa điểm hoặc dữ liệu" });
    fireEvent.change(input, { target: { value: "hành chính" } });
    expect(await screen.findByRole("group", { name: "Dữ liệu công bố" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Địa điểm từ Geo Service" })).toBeInTheDocument();
    expect(screen.getByText(/Một nguồn tìm kiếm đang tạm gián đoạn/)).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", expect.stringContaining("option-0"));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "feature-1", source: "internal" }));
    expect(input).toHaveValue("Trung tâm Hành chính");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("aborts the stale request so it cannot replace the latest query", async () => {
    const pending = new Map<string, (value: PublicSearchResponse) => void>();
    const signals: AbortSignal[] = [];
    const search = vi.fn((query: string, signal?: AbortSignal) => {
      if (signal) signals.push(signal);
      return new Promise<PublicSearchResponse>((resolve) => pending.set(query, resolve));
    });
    render(<PublicSearchCombobox search={search} debounceMs={0} onSelect={() => undefined} />);
    const input = screen.getByRole("combobox", { name: "Tìm địa điểm hoặc dữ liệu" });
    fireEvent.change(input, { target: { value: "ha" } });
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "hai chau" } });
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(signals[0].aborted).toBe(true);
    pending.get("ha")?.(response([item("internal", "stale", "Kết quả cũ")]));
    pending.get("hai chau")?.(response([item("internal", "latest", "Phường Hải Châu")]));
    expect(await screen.findByRole("option", { name: /Phường Hải Châu/ })).toBeInTheDocument();
    expect(screen.queryByText("Kết quả cũ")).not.toBeInTheDocument();
  });

  it("keeps focus in the combobox and closes the popup with Escape", async () => {
    render(<PublicSearchCombobox search={async () => response([item("internal", "feature-1", "Phường Hải Châu")])} debounceMs={0} onSelect={() => undefined} />);
    const input = screen.getByRole("combobox", { name: "Tìm địa điểm hoặc dữ liệu" });
    fireEvent.change(input, { target: { value: "hải châu" } });
    await screen.findByRole("option", { name: /Phường Hải Châu/ });
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
});
