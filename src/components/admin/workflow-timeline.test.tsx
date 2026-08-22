import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowEvents } from "@/lib/api/history";
import { WorkflowTimeline } from "./workflow-timeline";

const events: WorkflowEvents = {
  items: [{
    id: "11111111-1111-4111-8111-111111111111",
    fromStatus: "in_review",
    toStatus: "approved",
    actorId: "22222222-2222-4222-8222-222222222222",
    actorDisplayName: "Reviewer 01",
    role: "reviewer",
    reason: "Đã đối chiếu dữ liệu.",
    occurredAt: "2026-08-21T03:00:00.000Z",
  }],
  nextCursor: "opaque:workflow:2/+==",
  hasMore: true,
  limit: 25,
};

afterEach(cleanup);

describe("workflow timeline accessibility", () => {
  it("exposes a spoken transition, a polite count and keyboard-stable pagination", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(<WorkflowTimeline events={events} onLoadMore={onLoadMore}/>);

    expect(screen.getByText((_, element) => element?.textContent === "Từ Đang chờ duyệt sang Đã duyệt.")).toHaveClass("sr-only");
    expect(screen.getByRole("status")).toHaveTextContent("Đã tải 1 chuyển trạng thái workflow.");
    const list = screen.getByRole("list", { name: "Tiến trình workflow" });
    const loadMore = screen.getByRole("button", { name: "Tải thêm workflow" });
    expect(loadMore).toHaveAttribute("aria-controls", list.id);
    loadMore.focus();
    fireEvent.click(loadMore);
    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(loadMore).toHaveFocus();

    rerender(<WorkflowTimeline events={events} loadingMore onLoadMore={onLoadMore}/>);
    expect(screen.getByRole("button", { name: "Đang tải thêm..." })).toHaveAttribute("aria-busy", "true");
    expect(list).toHaveAttribute("aria-busy", "true");
  });
});
