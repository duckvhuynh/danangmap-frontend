import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FeatureMutationLedgerEntry } from "@/lib/editor/draft-db";
import { EditorSyncStatus } from "./editor-sync-status";

function conflict(): FeatureMutationLedgerEntry {
  return {
    id: "mutation-1",
    workspaceId: "admin:revision",
    principalId: "admin",
    revisionId: "revision",
    sequence: 1,
    localFeatureId: "feature-1",
    mutation: {
      clientMutationId: "mutation-1",
      operation: "update",
      baseRevisionVersion: 2,
      payloadHash: "a".repeat(64),
      featureId: "feature-1",
      baseVersionId: "version-1",
      patch: { properties: { name: "Tên cục bộ" } },
    },
    status: "conflict",
    requestEtag: '"rev-revision-v2"',
    requestCursor: "Mg",
    attempts: 1,
    response: {
      clientMutationId: "mutation-1",
      status: "conflict",
      operation: "update",
      canonicalFeatureId: "feature-1",
      serverCursor: "Mw",
      conflict: {
        code: "FEATURE_VERSION_CHANGED",
        currentVersionId: "version-2",
        changedPaths: ["properties.name"],
      },
    },
    responseRequestId: "req-123",
    lastError: null,
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:01.000Z",
  };
}

describe("EditorSyncStatus", () => {
  it("does not claim an unsaved edit has reached the server", () => {
    render(<EditorSyncStatus phase="idle" hasLocalChanges pendingCount={0} issues={[]} remoteChanges={0} onKeepServer={vi.fn()} onRetryLocal={vi.fn()} />);
    expect(screen.getByText("Có thay đổi chưa lưu")).toBeInTheDocument();
    expect(screen.queryByText("Đã lưu lên hệ thống")).not.toBeInTheDocument();
  });

  it("shows partial conflict diagnostics and both explicit resolution choices", () => {
    const onKeepServer = vi.fn();
    const onRetryLocal = vi.fn();
    const issue = conflict();
    render(
      <EditorSyncStatus
        phase="issues"
        pendingCount={0}
        issues={[issue]}
        remoteChanges={1}
        onKeepServer={onKeepServer}
        onRetryLocal={onRetryLocal}
      />,
    );

    expect(screen.getByText("1 thay đổi cần xử lý")).toBeInTheDocument();
    expect(screen.getByText(/Đối tượng này đã có thay đổi mới/)).toBeInTheDocument();
    expect(screen.queryByText(/properties.name/)).not.toBeInTheDocument();
    expect(screen.getByText("Mã hỗ trợ: req-123").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "Giữ bản đã lưu" }));
    fireEvent.click(screen.getByRole("button", { name: "Giữ thay đổi của tôi" }));
    expect(onKeepServer).toHaveBeenCalledWith(issue);
    expect(onRetryLocal).toHaveBeenCalledWith(issue);
  });

  it("announces observer ownership without presenting a fake error", () => {
    render(
      <EditorSyncStatus
        phase="observing"
        pendingCount={2}
        issues={[]}
        remoteChanges={0}
        onKeepServer={vi.fn()}
        onRetryLocal={vi.fn()}
      />,
    );
    expect(screen.getByText("Tab khác đang đồng bộ")).toBeInTheDocument();
  });
});
